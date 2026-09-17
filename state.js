/* NEXO Ideas — estado en memoria + tiempo real. Vuelve a pedir la tabla
   entera en cada evento de Realtime (dataset pequeño, de un usuario) en
   vez de aplicar parches incrementales — más simple y sin bugs de sync. */
(function () {
  "use strict";

  var listeners = [];
  var listo = false;

  var STATE = {
    categorias: [], ideas: [], notas: [], etiquetas: [], ideaEtiquetas: [], nexos: []
  };

  function notificar() {
    listeners.forEach(function (fn) { fn(); });
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
    notificar();
    if (!listo) { listo = true; document.dispatchEvent(new CustomEvent("nexo:estado-listo")); }
  };

  var RECARGA = {
    categorias: function () { return DB.listarCategorias().then(function (d) { STATE.categorias = d; }); },
    ideas: function () { return DB.listarIdeas().then(function (d) { STATE.ideas = d; }); },
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
    STATE.cargarTodo();
    suscribirTiempoReal();
  });

  window.STATE = STATE;
})();
