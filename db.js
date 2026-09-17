/* NEXO Ideas — capa de acceso a datos sobre Supabase, con cola offline.
   Cualquier fallo de escritura (sin red o error inesperado) se encola en
   localStorage y se reintenta solo — nunca se pierde una idea por un fallo
   de red, que es el caso de uso central (capturar en la calle). */
(function () {
  "use strict";

  var SB = window.NEXO_DB;
  var COLA_KEY = "nexo-ideas-cola";
  var COLA_FALLIDA_KEY = "nexo-ideas-cola-fallida";

  function uuid() {
    return crypto.randomUUID();
  }

  function leerCola() {
    try { return JSON.parse(localStorage.getItem(COLA_KEY)) || []; }
    catch (e) { return []; }
  }

  function guardarCola(cola) {
    localStorage.setItem(COLA_KEY, JSON.stringify(cola));
    document.dispatchEvent(new CustomEvent("nexo:cola-cambiada", { detail: { pendientes: cola.length } }));
  }

  function encolar(op) {
    var cola = leerCola();
    cola.push(op);
    guardarCola(cola);
  }

  function leerColaFallida() {
    try { return JSON.parse(localStorage.getItem(COLA_FALLIDA_KEY)) || []; }
    catch (e) { return []; }
  }

  // Si la petición ni siquiera llegó a completarse (sin cobertura),
  // supabase-js devuelve status 0; si el servidor contestó y rechazó la
  // operación (clave duplicada, check, clave ajena...) viene el status HTTP
  // real. Lo primero merece reintentarse; lo segundo no va a funcionar
  // nunca por muchas vueltas que se le dé.
  function errorDeResultado(r) {
    if (!r || !r.error) return null;
    var e = new Error(r.error.message || "Error de Supabase");
    e.supabase = r.error;
    e.status = r.status || 0;
    e.rechazadoPorServidor = !!r.status;
    return e;
  }

  async function ejecutarOp(op) {
    var r;
    if (op.operacion === "insert") {
      r = await SB.from(op.tabla).insert(op.payload);
    } else if (op.operacion === "update") {
      r = await SB.from(op.tabla).update(op.cambios).eq("id", op.id);
    } else if (op.operacion === "delete") {
      r = await SB.from(op.tabla).delete().eq("id", op.id);
    } else if (op.operacion === "delete_filtrado") {
      // para tablas sin columna id propia (idea_etiquetas tiene pk compuesta)
      var q = SB.from(op.tabla).delete();
      op.filtros.forEach(function (f) { q = q.eq(f[0], f[1]); });
      r = await q;
    } else {
      return;
    }
    var e = errorDeResultado(r);
    if (e) throw e;
  }

  function apartarFallida(op, e) {
    var fallidas = leerColaFallida();
    fallidas.push({
      op: op,
      error: (e && e.supabase) || { message: String(e && e.message) },
      status: (e && e.status) || 0,
      fecha: new Date().toISOString()
    });
    try { localStorage.setItem(COLA_FALLIDA_KEY, JSON.stringify(fallidas)); }
    catch (err) { /* sin sitio: al menos no bloquea el resto de la cola */ }
  }

  var procesando = false;

  async function procesarCola() {
    if (procesando) return;
    procesando = true;
    try {
      var cola = leerCola();
      while (cola.length) {
        try {
          await ejecutarOp(cola[0]);
          cola.shift();
          guardarCola(cola);
        } catch (e) {
          if (!e || !e.rechazadoPorServidor) break; // red mala: se reintenta entera en el próximo trigger
          // El servidor la rechazó: reintentarla no va a arreglarla nunca y
          // dejarla al frente bloquearía todas las escrituras posteriores.
          // Se aparta a un cubo aparte (inspeccionable con DB.colaFallida())
          // y se sigue con el resto de la cola.
          apartarFallida(cola[0], e);
          cola.shift();
          guardarCola(cola);
        }
      }
    } finally {
      procesando = false;
    }
  }

  window.addEventListener("online", procesarCola);
  setInterval(procesarCola, 30000);

  // intenta escribir ya; si falla (red u otro error), encola y sigue
  // adelante de forma optimista con el mismo id que se generó en el cliente
  async function escribirConCola(tabla, operacion, payload, idParaCola, cambiosParaCola, filtros) {
    var op = {
      tabla: tabla, operacion: operacion, payload: payload,
      id: idParaCola, cambios: cambiosParaCola, filtros: filtros
    };
    try {
      await ejecutarOp(op);
      return { pendiente: false };
    } catch (e) {
      encolar(op);
      return { pendiente: true };
    }
  }

  var DB = {};

  // ---- categorias ----
  DB.listarCategorias = async function () {
    var r = await SB.from("categorias").select("*").order("orden");
    if (r.error) throw r.error;
    return r.data;
  };
  DB.crearCategoria = async function (datos) {
    var fila = Object.assign({ id: uuid() }, datos);
    var estado = await escribirConCola("categorias", "insert", fila);
    return Object.assign({}, fila, { _pendiente: estado.pendiente });
  };
  DB.actualizarCategoria = async function (id, cambios) {
    var estado = await escribirConCola("categorias", "update", null, id, cambios);
    return Object.assign({ id: id }, cambios, { _pendiente: estado.pendiente });
  };

  // ---- ideas ----
  DB.listarIdeas = async function () {
    var r = await SB.from("ideas").select("*").order("created_at", { ascending: false });
    if (r.error) throw r.error;
    return r.data;
  };
  DB.crearIdea = async function (datos) {
    var fila = Object.assign({ id: uuid(), estado: "suelta" }, datos);
    var estado = await escribirConCola("ideas", "insert", fila);
    return Object.assign({}, fila, { _pendiente: estado.pendiente });
  };
  DB.actualizarIdea = async function (id, cambios) {
    var estado = await escribirConCola("ideas", "update", null, id, cambios);
    return Object.assign({ id: id }, cambios, { _pendiente: estado.pendiente });
  };
  DB.borrarIdea = async function (id) {
    await escribirConCola("ideas", "delete", null, id);
  };

  // ---- notas ----
  DB.listarNotas = async function () {
    var r = await SB.from("notas").select("*").order("created_at");
    if (r.error) throw r.error;
    return r.data;
  };
  DB.crearNota = async function (datos) {
    var fila = Object.assign({ id: uuid() }, datos);
    var estado = await escribirConCola("notas", "insert", fila);
    return Object.assign({}, fila, { _pendiente: estado.pendiente });
  };
  DB.borrarNota = async function (id) {
    await escribirConCola("notas", "delete", null, id);
  };

  // ---- etiquetas ----
  DB.listarEtiquetas = async function () {
    var r = await SB.from("etiquetas").select("*").order("nombre");
    if (r.error) throw r.error;
    return r.data;
  };
  DB.crearEtiqueta = async function (nombre) {
    var fila = { id: uuid(), nombre: nombre };
    var estado = await escribirConCola("etiquetas", "insert", fila);
    return Object.assign({}, fila, { _pendiente: estado.pendiente });
  };
  DB.renombrarEtiqueta = async function (id, nombre) {
    await escribirConCola("etiquetas", "update", null, id, { nombre: nombre });
  };
  DB.borrarEtiqueta = async function (id) {
    await escribirConCola("etiquetas", "delete", null, id);
  };

  // ---- idea_etiquetas ----
  DB.listarIdeaEtiquetas = async function () {
    var r = await SB.from("idea_etiquetas").select("*");
    if (r.error) throw r.error;
    return r.data;
  };
  DB.etiquetarIdea = async function (ideaId, etiquetaId) {
    var fila = { idea_id: ideaId, etiqueta_id: etiquetaId };
    await escribirConCola("idea_etiquetas", "insert", fila);
  };
  DB.desetiquetarIdea = async function (ideaId, etiquetaId) {
    await escribirConCola("idea_etiquetas", "delete_filtrado", null, null, null,
      [["idea_id", ideaId], ["etiqueta_id", etiquetaId]]);
  };

  // ---- nexos ----
  DB.listarNexos = async function () {
    var r = await SB.from("nexos").select("*");
    if (r.error) throw r.error;
    return r.data;
  };
  DB.crearNexo = async function (ideaIdA, ideaIdB) {
    var fila = { id: uuid(), idea_id_a: ideaIdA, idea_id_b: ideaIdB };
    var estado = await escribirConCola("nexos", "insert", fila);
    return Object.assign({}, fila, { _pendiente: estado.pendiente });
  };
  DB.borrarNexo = async function (id) {
    await escribirConCola("nexos", "delete", null, id);
  };

  DB.colaPendiente = function () { return leerCola(); };
  // operaciones que el servidor rechazó y que no se reintentan: no se pierden
  // en silencio, quedan aquí para poder mirar qué falló y por qué
  DB.colaFallida = function () { return leerColaFallida(); };

  // ---- fotos ----
  // La subida en sí (el binario) no pasa por la cola offline — un archivo
  // de imagen no cabe razonablemente en localStorage. Si falla, se avisa
  // y hay que reintentar con conexión. La fila de metadatos (fotos) sí usa
  // la cola normal, igual que el resto de escrituras.
  DB.listarFotos = async function () {
    var r = await SB.from("fotos").select("*").order("created_at");
    if (r.error) throw r.error;
    return r.data;
  };
  DB.urlFoto = function (storagePath) {
    return SB.storage.from("fotos").getPublicUrl(storagePath).data.publicUrl;
  };
  DB.subirFoto = async function (ideaId, blob) {
    var id = uuid();
    var path = ideaId + "/" + id + ".jpg";
    var subida = await SB.storage.from("fotos").upload(path, blob, { contentType: "image/jpeg" });
    if (subida.error) throw subida.error;
    var fila = { id: id, idea_id: ideaId, storage_path: path };
    var estado = await escribirConCola("fotos", "insert", fila);
    return Object.assign({}, fila, { _pendiente: estado.pendiente });
  };
  DB.borrarFoto = async function (id, storagePath) {
    await SB.storage.from("fotos").remove([storagePath]);
    await escribirConCola("fotos", "delete", null, id);
  };

  window.DB = DB;
})();
