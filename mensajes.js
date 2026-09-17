/* NEXO Ideas — vista Mensajes: pedirle algo a Claude (no es una idea que
   guardar, es una petición que Claude revisa cuando Xavi se lo pide en una
   sesión de Claude Code — no hay procesamiento automático). */
(function () {
  "use strict";

  function render() {
    var root = document.getElementById("vista-mensajes");
    if (!root) return;
    root.innerHTML = "";

    var form = document.createElement("form");
    form.className = "mensaje-form";
    var textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.placeholder = "Escribe lo que quieras pedirle a Claude...";
    textarea.required = true;
    var boton = document.createElement("button");
    boton.type = "submit";
    boton.textContent = "Enviar";
    form.appendChild(textarea);
    form.appendChild(boton);
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var contenido = textarea.value.trim();
      if (!contenido) return;
      boton.disabled = true;
      try {
        var mensaje = await DB.crearMensaje(contenido);
        STATE.mensajes.unshift(mensaje);
        textarea.value = "";
        STATE.notificar();
      } finally {
        boton.disabled = false;
      }
    });
    root.appendChild(form);

    var lista = document.createElement("div");
    lista.className = "mensajes-lista";
    STATE.mensajes.forEach(function (m) {
      var item = document.createElement("div");
      item.className = "mensaje-item";
      var texto = document.createElement("p");
      texto.textContent = m.contenido;
      item.appendChild(texto);
      var estadoSpan = document.createElement("span");
      estadoSpan.className = "mensaje-estado" + (m.estado === "hecho" ? " mensaje-hecho" : "");
      estadoSpan.textContent = m.estado === "hecho" ? "Hecho" : "Pendiente";
      item.appendChild(estadoSpan);
      if (m.respuesta) {
        var respuesta = document.createElement("p");
        respuesta.className = "mensaje-respuesta";
        respuesta.textContent = m.respuesta;
        item.appendChild(respuesta);
      }
      lista.appendChild(item);
    });
    root.appendChild(lista);
  }

  STATE.on(render);
  window.Mensajes = { render: render };
})();
