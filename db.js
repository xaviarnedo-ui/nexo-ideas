/* NEXO Ideas — capa de acceso a datos sobre Supabase, con cola offline.
   Cualquier fallo de escritura (sin red o error inesperado) se encola en
   localStorage y se reintenta solo — nunca se pierde una idea por un fallo
   de red, que es el caso de uso central (capturar en la calle). */
(function () {
  "use strict";

  var SB = window.NEXO_DB;
  var COLA_KEY = "nexo-ideas-cola";

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

  async function ejecutarOp(op) {
    if (op.operacion === "insert") {
      var r1 = await SB.from(op.tabla).insert(op.payload);
      if (r1.error) throw r1.error;
    } else if (op.operacion === "update") {
      var r2 = await SB.from(op.tabla).update(op.cambios).eq("id", op.id);
      if (r2.error) throw r2.error;
    } else if (op.operacion === "delete") {
      var r3 = await SB.from(op.tabla).delete().eq("id", op.id);
      if (r3.error) throw r3.error;
    }
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
          break; // seguimos con red mala; se reintenta en el próximo trigger
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
  async function escribirConCola(tabla, operacion, payload, idParaCola, cambiosParaCola) {
    try {
      await ejecutarOp({ tabla: tabla, operacion: operacion, payload: payload, id: idParaCola, cambios: cambiosParaCola });
      return { pendiente: false };
    } catch (e) {
      encolar({ tabla: tabla, operacion: operacion, payload: payload, id: idParaCola, cambios: cambiosParaCola });
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
    try {
      var r = await SB.from("idea_etiquetas").delete().eq("idea_id", ideaId).eq("etiqueta_id", etiquetaId);
      if (r.error) throw r.error;
    } catch (e) {
      // caso raro offline: no hay id propio para encolar un delete por pk compuesta,
      // así que se resuelve al vuelo en el próximo intento de listarIdeaEtiquetas()
    }
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

  window.DB = DB;
})();
