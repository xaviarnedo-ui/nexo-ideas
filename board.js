/* NEXO Ideas — vista Tablero (por defecto). */
(function () {
  "use strict";

  var filtroTexto = "";
  var filtroEtiquetaId = null;

  var ESTADOS = {
    suelta: { color: "var(--estado-suelta)" },
    en_desarrollo: { color: "var(--estado-desarrollo)" },
    validada: { color: "var(--estado-validada)" }
  };

  function coincide(idea) {
    if (filtroEtiquetaId) {
      var ids = STATE.etiquetasDeIdea(idea.id).map(function (t) { return t.id; });
      if (ids.indexOf(filtroEtiquetaId) === -1) return false;
    }
    if (filtroTexto) {
      var texto = (idea.titulo + " " + (idea.cuerpo || "") + " " +
        STATE.notasDeIdea(idea.id).map(function (n) { return n.contenido; }).join(" ")).toLowerCase();
      if (texto.indexOf(filtroTexto) === -1) return false;
    }
    return true;
  }

  function tarjeta(idea) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "tarjeta-idea";
    var estado = ESTADOS[idea.estado] || ESTADOS.suelta;

    var punto = document.createElement("span");
    punto.className = "punto-estado";
    punto.style.background = estado.color;
    card.appendChild(punto);

    var titulo = document.createElement("span");
    titulo.className = "tarjeta-titulo";
    titulo.textContent = idea.titulo;
    card.appendChild(titulo);

    if (idea._pendiente) {
      var pendiente = document.createElement("span");
      pendiente.className = "tarjeta-pendiente";
      pendiente.title = "Pendiente de sincronizar";
      pendiente.textContent = "⏳";
      card.appendChild(pendiente);
    }

    var etqBox = document.createElement("div");
    etqBox.className = "tarjeta-etiquetas";
    STATE.etiquetasDeIdea(idea.id).forEach(function (t) {
      var pill = document.createElement("span");
      pill.className = "mini-etiqueta";
      pill.textContent = t.nombre;
      etqBox.appendChild(pill);
    });
    card.appendChild(etqBox);

    card.addEventListener("click", function () { Detalle.abrir(idea.id); });
    return card;
  }

  function render() {
    var root = document.getElementById("vista-tablero");
    if (!root) return;
    root.innerHTML = "";
    if (!STATE.categorias.length) return;

    var barra = document.createElement("div");
    barra.className = "tablero-barra";

    var buscador = document.createElement("input");
    buscador.type = "search";
    buscador.placeholder = "Buscar...";
    buscador.value = filtroTexto;
    buscador.addEventListener("input", function () {
      filtroTexto = buscador.value.trim().toLowerCase();
      render();
    });
    barra.appendChild(buscador);

    var filtroBox = document.createElement("div");
    filtroBox.className = "chip-group";
    STATE.etiquetas.forEach(function (t) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = t.nombre;
      var activo = filtroEtiquetaId === t.id;
      chip.setAttribute("aria-pressed", activo ? "true" : "false");
      if (activo) { chip.style.background = "var(--text)"; chip.style.color = "#fff"; chip.style.borderColor = "var(--text)"; }
      chip.addEventListener("click", function () {
        filtroEtiquetaId = activo ? null : t.id;
        render();
      });
      filtroBox.appendChild(chip);
    });
    barra.appendChild(filtroBox);
    root.appendChild(barra);

    var columnas = document.createElement("div");
    columnas.className = "tablero-columnas";
    STATE.categorias.forEach(function (cat) {
      var ideas = STATE.ideas.filter(function (i) { return i.categoria_id === cat.id && coincide(i); });
      var col = document.createElement("section");
      col.className = "tablero-columna";
      col.style.setProperty("--col-accent", cat.color_acento);
      var h = document.createElement("h3");
      h.textContent = cat.nombre + " (" + ideas.length + ")";
      col.appendChild(h);
      ideas.forEach(function (idea) { col.appendChild(tarjeta(idea)); });
      columnas.appendChild(col);
    });
    root.appendChild(columnas);
  }

  STATE.on(render);
  window.Tablero = { render: render };
})();
