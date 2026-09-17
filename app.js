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

  // El evento "nexo:cola-cambiada" existía pero nadie lo escuchaba: no había
  // forma de saber que algo seguía sin subir, ni que algo había fallado.
  var colaEstado = document.getElementById("cola-estado");

  function pintarCola() {
    if (!colaEstado) return;
    var pendientes = DB.colaPendiente().length;
    var fallidas = DB.colaFallida().length;
    var partes = [];
    if (pendientes) partes.push(pendientes + " sin sincronizar");
    if (fallidas) partes.push(fallidas + " con error");
    colaEstado.textContent = partes.join(" · ");
    colaEstado.classList.toggle("cola-con-fallos", fallidas > 0);
    colaEstado.hidden = !partes.length;
  }

  document.addEventListener("nexo:cola-cambiada", pintarCola);
  window.addEventListener("online", pintarCola);
  pintarCola();

  // Sin esto el sw.js nunca se instala y capturar sin cobertura —el motivo
  // de existir de la app— no funciona en frío.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(function (e) {
      console.error("No se pudo registrar el service worker", e);
    });
  }
})();
