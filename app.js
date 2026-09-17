/* NEXO Ideas — arranque: solo decide qué pestaña está visible.
   La carga de datos la dispara state.js al oír "nexo:unlocked";
   cada vista se repinta sola vía STATE.on(render). */
(function () {
  "use strict";

  var tabs = document.querySelectorAll(".tab");
  var vistas = document.querySelectorAll(".view");

  function activar(nombre) {
    tabs.forEach(function (tab) {
      tab.setAttribute("aria-current", tab.getAttribute("data-view") === nombre ? "page" : "false");
    });
    vistas.forEach(function (vista) {
      vista.hidden = vista.getAttribute("data-view") !== nombre;
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () { activar(tab.getAttribute("data-view")); });
  });

  activar("tablero");
})();
