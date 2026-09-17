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

  // La barra (buscador + chips de filtro) se construye una sola vez y
  // sobrevive a los repintados: si se reconstruyera en cada render, el
  // <input type="search"> se destruiría en cada tecla —render() se llama
  // desde su propio evento "input"— y el foco saltaría fuera del buscador.
  var barra = null;
  var buscador = null;
  var filtroBox = null;
  var columnas = null;
  var firmaEtiquetas = null;

  function construirBarra() {
    barra = document.createElement("div");
    barra.className = "tablero-barra";

    buscador = document.createElement("input");
    buscador.type = "search";
    buscador.placeholder = "Buscar...";
    buscador.value = filtroTexto;
    buscador.addEventListener("input", function () {
      filtroTexto = buscador.value.trim().toLowerCase();
      renderColumnas(); // solo las columnas: no se toca la barra
    });
    barra.appendChild(buscador);

    filtroBox = document.createElement("div");
    filtroBox.className = "chip-group";
    barra.appendChild(filtroBox);

    columnas = document.createElement("div");
    columnas.className = "tablero-columnas";
  }

  function renderChipsEtiqueta() {
    filtroBox.innerHTML = "";
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
        firmaEtiquetas = null;
        render();
      });
      filtroBox.appendChild(chip);
    });
  }

  function renderColumnas() {
    columnas.innerHTML = "";
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
  }

  function render() {
    var root = document.getElementById("vista-tablero");
    if (!root) return;

    if (!STATE.categorias.length) {
      root.innerHTML = "";
      barra = null; columnas = null; firmaEtiquetas = null;
      return;
    }

    if (!barra || !root.contains(barra)) {
      root.innerHTML = "";
      construirBarra();
      root.appendChild(barra);
      root.appendChild(columnas);
      firmaEtiquetas = null;
    }

    // los chips solo se rehacen si cambió la lista de etiquetas o cuál está
    // activa, no en cada repintado
    var firma = STATE.etiquetas.map(function (t) { return t.id + ":" + t.nombre; }).join("|") + "#" + filtroEtiquetaId;
    if (firma !== firmaEtiquetas) { firmaEtiquetas = firma; renderChipsEtiqueta(); }

    renderColumnas();
  }

  STATE.on(render);
  window.Tablero = { render: render };
})();
