/* NEXO Ideas — captura rápida (botón flotante + modal). */
(function () {
  "use strict";

  var fab = document.getElementById("btn-capturar");
  var modal = document.getElementById("modal-captura");
  var form = document.getElementById("form-captura");
  var tituloInput = document.getElementById("captura-titulo");
  var categoriasBox = document.getElementById("captura-categorias");
  var etiquetasInput = document.getElementById("captura-etiquetas");
  var cancelarBtn = document.getElementById("captura-cancelar");
  var categoriaSeleccionada = null;

  function renderChipsCategoria() {
    categoriasBox.innerHTML = "";
    STATE.categorias.forEach(function (cat, i) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = cat.nombre;
      var seleccionada = (categoriaSeleccionada || STATE.categorias[0].id) === cat.id;
      if (i === 0 && !categoriaSeleccionada) categoriaSeleccionada = cat.id;
      chip.setAttribute("aria-pressed", seleccionada ? "true" : "false");
      chip.style.background = seleccionada ? cat.color_acento : "transparent";
      chip.style.borderColor = cat.color_acento;
      chip.style.color = seleccionada ? "#fff" : cat.color_acento;
      chip.addEventListener("click", function () {
        categoriaSeleccionada = cat.id;
        renderChipsCategoria();
      });
      categoriasBox.appendChild(chip);
    });
  }

  function abrir() {
    categoriaSeleccionada = null;
    tituloInput.value = "";
    etiquetasInput.value = "";
    renderChipsCategoria();
    modal.hidden = false;
    tituloInput.focus();
  }

  function cerrar() {
    modal.hidden = true;
  }

  async function etiquetaPorNombreOCrear(nombre) {
    var existente = STATE.etiquetas.find(function (t) { return t.nombre.toLowerCase() === nombre; });
    if (existente) return existente;
    var creada = await DB.crearEtiqueta(nombre);
    STATE.etiquetas.push(creada);
    return creada;
  }

  fab.addEventListener("click", abrir);
  cancelarBtn.addEventListener("click", cerrar);

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var titulo = tituloInput.value.trim();
    if (!titulo || !categoriaSeleccionada) return;

    var idea = await DB.crearIdea({ titulo: titulo, categoria_id: categoriaSeleccionada });
    STATE.ideas.unshift(idea);

    var nombres = etiquetasInput.value.split(",")
      .map(function (s) { return s.trim().toLowerCase(); })
      .filter(Boolean);
    for (var i = 0; i < nombres.length; i++) {
      var etiqueta = await etiquetaPorNombreOCrear(nombres[i]);
      await DB.etiquetarIdea(idea.id, etiqueta.id);
      STATE.ideaEtiquetas.push({ idea_id: idea.id, etiqueta_id: etiqueta.id });
    }

    STATE.notificar();
    cerrar();
  });
})();
