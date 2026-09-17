/* NEXO Ideas — estado en memoria + tiempo real. Vuelve a pedir la tabla
   entera en cada evento de Realtime (dataset pequeño, de un usuario) en
   vez de aplicar parches incrementales — más simple y sin bugs de sync. */
(function () {
  "use strict";

  var listeners = [];
  var listo = false;
  var CATEGORIAS_CACHE_KEY = "nexo-ideas-categorias-cache";

  var STATE = {
    categorias: [], ideas: [], notas: [], etiquetas: [], ideaEtiquetas: [], nexos: []
  };

  // Solo las categorías: en un arranque en frío sin red, capture.js no puede
  // pintar sus chips sin ellas y el formulario queda inservible — que es
  // justo el caso de uso que la app existe para cubrir.
  function guardarCacheCategorias() {
    try { localStorage.setItem(CATEGORIAS_CACHE_KEY, JSON.stringify(STATE.categorias)); }
    catch (e) { /* cuota llena o modo privado: la app sigue funcionando online */ }
  }

  function sembrarCacheCategorias() {
    if (STATE.categorias.length) return;
    try {
      var guardadas = JSON.parse(localStorage.getItem(CATEGORIAS_CACHE_KEY));
      if (guardadas && guardadas.length) { STATE.categorias = guardadas; notificar(); }
    } catch (e) { /* caché corrupta: se ignora */ }
  }

  // Una idea creada sin red vive solo en la cola de db.js. Al recargar,
  // cargarTodo() sustituye STATE.ideas por lo que hay en el servidor y la
  // idea desaparecería del tablero aunque siga a salvo en localStorage.
  // Los ids se generan en el cliente, así que el mismo id está en la cola y
  // en STATE.ideas si se creó en esta misma sesión: se deduplica por id.
  function fusionarIdeasEnCola() {
    DB.colaPendiente().forEach(function (op) {
      if (op.tabla !== "ideas" || op.operacion !== "insert") return;
      if (!op.payload || !op.payload.id) return;
      var yaEsta = STATE.ideas.some(function (i) { return i.id === op.payload.id; });
      if (yaEsta) return;
      STATE.ideas.unshift(Object.assign({}, op.payload, { _pendiente: true }));
    });
  }

  // Un aviso encima de las vistas, no en lugar de ellas: si hay categorías
  // cacheadas el tablero y la captura siguen siendo usables.
  function mostrarErrorDeCarga() {
    var views = document.getElementById("views");
    if (!views || document.getElementById("error-carga")) return;
    var aviso = document.createElement("p");
    aviso.id = "error-carga";
    aviso.className = "error-carga";
    aviso.textContent = navigator.onLine
      ? "No se pudo conectar con Supabase. Revisa las credenciales en supabase-client.js."
      : "Sin conexión: se muestra lo último guardado. Lo que captures se sincronizará al volver la red.";
    views.insertBefore(aviso, views.firstChild);
  }

  function ocultarErrorDeCarga() {
    var aviso = document.getElementById("error-carga");
    if (aviso && aviso.parentNode) aviso.parentNode.removeChild(aviso);
  }

  // Cada listener va en su propio try: forEach aborta la iteración entera si
  // uno lanza, así que un fallo en board.js dejaba sin avisar a detail.js,
  // map.js y settings.js (todo lo registrado después).
  function notificar() {
    listeners.forEach(function (fn) {
      try { fn(); } catch (e) { console.error("Fallo al repintar una vista", e); }
    });
  }

  STATE.on = function (fn) { listeners.push(fn); };
  // expuesto para que capture.js/detail.js/settings.js puedan aplicar un
  // cambio optimista al array en memoria y re-renderizar sin esperar al
  // viaje de ida y vuelta de Realtime
  STATE.notificar = notificar;

  STATE.cargarTodo = async function () {
    var r = await Promise.all([
      DB.listarCategorias(), DB.listarIdeas(), DB.listarNotas(),
      DB.listarEtiquetas(), DB.listarIdeaEtiquetas(), DB.listarNexos()
    ]);
    STATE.categorias = r[0]; STATE.ideas = r[1]; STATE.notas = r[2];
    STATE.etiquetas = r[3]; STATE.ideaEtiquetas = r[4]; STATE.nexos = r[5];
    guardarCacheCategorias();
    fusionarIdeasEnCola();
    ocultarErrorDeCarga();
    notificar();
    if (!listo) { listo = true; document.dispatchEvent(new CustomEvent("nexo:estado-listo")); }
  };

  var RECARGA = {
    categorias: function () { return DB.listarCategorias().then(function (d) { STATE.categorias = d; guardarCacheCategorias(); }); },
    ideas: function () { return DB.listarIdeas().then(function (d) { STATE.ideas = d; fusionarIdeasEnCola(); }); },
    notas: function () { return DB.listarNotas().then(function (d) { STATE.notas = d; }); },
    etiquetas: function () { return DB.listarEtiquetas().then(function (d) { STATE.etiquetas = d; }); },
    idea_etiquetas: function () { return DB.listarIdeaEtiquetas().then(function (d) { STATE.ideaEtiquetas = d; }); },
    nexos: function () { return DB.listarNexos().then(function (d) { STATE.nexos = d; }); }
  };

  function suscribirTiempoReal() {
    var canal = window.NEXO_DB.channel("nexo-ideas-cambios");
    Object.keys(RECARGA).forEach(function (tabla) {
      canal.on("postgres_changes", { event: "*", schema: "public", table: tabla }, function () {
        RECARGA[tabla]().then(notificar);
      });
    });
    canal.subscribe();
  }

  STATE.categoriaPorId = function (id) {
    return STATE.categorias.find(function (c) { return c.id === id; });
  };
  STATE.ideaPorId = function (id) {
    return STATE.ideas.find(function (i) { return i.id === id; });
  };
  STATE.notasDeIdea = function (ideaId) {
    return STATE.notas.filter(function (n) { return n.idea_id === ideaId; });
  };
  STATE.etiquetasDeIdea = function (ideaId) {
    var ids = STATE.ideaEtiquetas.filter(function (e) { return e.idea_id === ideaId; }).map(function (e) { return e.etiqueta_id; });
    return STATE.etiquetas.filter(function (t) { return ids.indexOf(t.id) !== -1; });
  };
  STATE.nexosDeIdea = function (ideaId) {
    return STATE.nexos
      .filter(function (n) { return n.idea_id_a === ideaId || n.idea_id_b === ideaId; })
      .map(function (n) { return STATE.ideaPorId(n.idea_id_a === ideaId ? n.idea_id_b : n.idea_id_a); })
      .filter(Boolean);
  };

  document.addEventListener("nexo:unlocked", function () {
    sembrarCacheCategorias();
    fusionarIdeasEnCola(); // visibles ya, aunque cargarTodo() falle por falta de red
    // sin este catch, unas credenciales mal pegadas dejaban la app en blanco
    // para siempre y sin ninguna pista de qué había pasado
    STATE.cargarTodo().catch(function (e) {
      console.error("No se pudo cargar el estado inicial", e);
      mostrarErrorDeCarga();
    });
    suscribirTiempoReal();
  });

  window.STATE = STATE;
})();
