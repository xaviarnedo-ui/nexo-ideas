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
  var guardarBtn = form.querySelector('button[type="submit"]');
  var fotoInput = document.getElementById("captura-foto");
  var fotoEstado = document.getElementById("captura-foto-estado");
  var categoriaSeleccionada = null;

  // Duplicado a propósito de detail.js (mismo criterio ya usado con
  // etiquetaPorNombreOCrear): son dos módulos independientes, y esto es
  // más simple que montar un archivo de utilidades compartidas para una
  // sola función.
  function redimensionarImagen(file) {
    return new Promise(function (resolve, reject) {
      var LADO_MAXIMO = 1600;
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.width, h = img.height;
        if (w > LADO_MAXIMO || h > LADO_MAXIMO) {
          if (w > h) { h = Math.round(h * LADO_MAXIMO / w); w = LADO_MAXIMO; }
          else { w = Math.round(w * LADO_MAXIMO / h); h = LADO_MAXIMO; }
        }
        var canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error("No se pudo procesar la imagen"));
        }, "image/jpeg", 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen")); };
      img.src = url;
    });
  }

  function tituloFotoPorDefecto() {
    var fecha = new Date().toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    return "Foto " + fecha;
  }

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
    fotoInput.value = "";
    fotoEstado.hidden = true;
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

  // Captura mínima: una foto sola, sin pasar por título/categoría. Crea una
  // idea con un título por defecto (fecha/hora) en la primera categoría, y
  // le cuelga la foto — se renombra y recategoriza luego desde el detalle,
  // igual que cualquier otra idea suelta.
  fotoInput.addEventListener("change", async function () {
    var file = fotoInput.files[0];
    if (!file || !STATE.categorias.length) return;
    fotoInput.disabled = true;
    fotoEstado.hidden = false;
    fotoEstado.textContent = "Guardando foto...";
    try {
      var blob = await redimensionarImagen(file);
      var idea = await DB.crearIdea({ titulo: tituloFotoPorDefecto(), categoria_id: STATE.categorias[0].id });
      STATE.ideas.unshift(idea);
      var foto = await DB.subirFoto(idea.id, blob);
      STATE.fotos.push(foto);
      STATE.notificar();
      cerrar();
    } catch (e) {
      fotoEstado.textContent = "No se pudo guardar la foto. Comprueba tu conexión e inténtalo de nuevo.";
    } finally {
      fotoInput.disabled = false;
    }
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var titulo = tituloInput.value.trim();
    if (!titulo || !categoriaSeleccionada) return;

    // hay varios await por delante: sin esto, un doble toque rápido en
    // "Guardar" crea la idea dos veces
    if (guardarBtn.disabled) return;
    guardarBtn.disabled = true;

    try {
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
    } finally {
      guardarBtn.disabled = false;
    }
  });
})();
