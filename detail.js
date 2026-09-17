/* NEXO Ideas — panel de detalle de una idea (editar, notas, nexos). */
(function () {
  "use strict";

  var panel = document.getElementById("panel-detalle");
  var ideaActualId = null;

  function cerrar() {
    ideaActualId = null;
    panel.hidden = true;
    panel.innerHTML = "";
  }

  async function etiquetaPorNombreOCrear(nombre) {
    var existente = STATE.etiquetas.find(function (t) { return t.nombre.toLowerCase() === nombre; });
    if (existente) return existente;
    var creada = await DB.crearEtiqueta(nombre);
    STATE.etiquetas.push(creada);
    return creada;
  }

  // Reduce la foto a un lado máximo de 1600px y la reempaqueta en JPEG
  // antes de subirla — una foto de móvil sin tocar pesa varios MB, lento
  // y caro en datos móviles para lo que hace falta (leer una etiqueta o
  // una página de un libro).
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

  // El panel se repinta entero ante cualquier cambio de STATE, venga o no
  // de la idea abierta. Si llega un cambio de Realtime mientras se está
  // escribiendo (el guardado ocurre al blur), la reconstrucción se llevaría
  // por delante lo tecleado y aún sin guardar.
  // Solo se protegen los dos campos de texto libre que guardan al blur
  // (título y cuerpo). Guardar cualquier INPUT/TEXTAREA/SELECT del panel
  // sería demasiado: bloquearía también los repintados que piden los
  // propios handlers del panel al terminar (añadir etiqueta con Enter,
  // enviar el formulario de nota), que dejan el foco dentro del campo y
  // cuyo resultado no se llegaría a ver.
  function editandoDentroDelPanel() {
    var activo = document.activeElement;
    if (!activo || !panel.contains(activo)) return false;
    return activo.classList.contains("panel-titulo") || activo.classList.contains("panel-cuerpo");
  }

  function render() {
    if (!ideaActualId) return;
    if (editandoDentroDelPanel()) return;
    var idea = STATE.ideaPorId(ideaActualId);
    if (!idea) { cerrar(); return; }

    panel.innerHTML = "";
    panel.hidden = false;

    var cerrarBtn = document.createElement("button");
    cerrarBtn.type = "button"; cerrarBtn.className = "panel-cerrar"; cerrarBtn.textContent = "✕";
    cerrarBtn.addEventListener("click", cerrar);
    panel.appendChild(cerrarBtn);

    var tituloInput = document.createElement("input");
    tituloInput.type = "text"; tituloInput.className = "panel-titulo"; tituloInput.value = idea.titulo;
    tituloInput.addEventListener("blur", async function () {
      if (tituloInput.value.trim() && tituloInput.value !== idea.titulo) {
        idea.titulo = tituloInput.value.trim();
        await DB.actualizarIdea(idea.id, { titulo: idea.titulo });
        STATE.notificar();
      }
    });
    panel.appendChild(tituloInput);

    var categoriaSelect = document.createElement("select");
    STATE.categorias.forEach(function (cat) {
      var opt = document.createElement("option");
      opt.value = cat.id; opt.textContent = cat.nombre;
      if (cat.id === idea.categoria_id) opt.selected = true;
      categoriaSelect.appendChild(opt);
    });
    categoriaSelect.addEventListener("change", async function () {
      idea.categoria_id = categoriaSelect.value;
      await DB.actualizarIdea(idea.id, { categoria_id: idea.categoria_id });
      STATE.notificar();
    });
    panel.appendChild(categoriaSelect);

    var estadoSelect = document.createElement("select");
    [["suelta", "Idea suelta"], ["en_desarrollo", "En desarrollo"], ["validada", "Validada"]].forEach(function (par) {
      var opt = document.createElement("option");
      opt.value = par[0]; opt.textContent = par[1];
      if (par[0] === idea.estado) opt.selected = true;
      estadoSelect.appendChild(opt);
    });
    estadoSelect.addEventListener("change", async function () {
      idea.estado = estadoSelect.value;
      await DB.actualizarIdea(idea.id, { estado: idea.estado });
      STATE.notificar();
    });
    panel.appendChild(estadoSelect);

    var cuerpoTextarea = document.createElement("textarea");
    cuerpoTextarea.rows = 4; cuerpoTextarea.placeholder = "Desarrolla la idea...";
    cuerpoTextarea.className = "panel-cuerpo"; // identidad para editandoDentroDelPanel()
    cuerpoTextarea.value = idea.cuerpo || "";
    cuerpoTextarea.addEventListener("blur", async function () {
      if (cuerpoTextarea.value !== (idea.cuerpo || "")) {
        idea.cuerpo = cuerpoTextarea.value;
        await DB.actualizarIdea(idea.id, { cuerpo: idea.cuerpo });
        STATE.notificar();
      }
    });
    panel.appendChild(cuerpoTextarea);

    // ---- Etiquetas ----
    var etqSeccion = document.createElement("div"); etqSeccion.className = "panel-seccion";
    var etqTitulo = document.createElement("h3"); etqTitulo.textContent = "Etiquetas"; etqSeccion.appendChild(etqTitulo);
    var etqBox = document.createElement("div"); etqBox.className = "chip-group";
    STATE.etiquetasDeIdea(idea.id).forEach(function (t) {
      var pill = document.createElement("button");
      pill.type = "button"; pill.className = "chip"; pill.textContent = t.nombre + " ✕";
      pill.addEventListener("click", async function () {
        await DB.desetiquetarIdea(idea.id, t.id);
        STATE.ideaEtiquetas = STATE.ideaEtiquetas.filter(function (e) { return !(e.idea_id === idea.id && e.etiqueta_id === t.id); });
        STATE.notificar();
      });
      etqBox.appendChild(pill);
    });
    etqSeccion.appendChild(etqBox);
    var etqInput = document.createElement("input");
    etqInput.type = "text"; etqInput.placeholder = "Añadir etiqueta y pulsar Enter";
    etqInput.addEventListener("keydown", async function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      var nombre = etqInput.value.trim().toLowerCase();
      if (!nombre) return;
      var etiqueta = await etiquetaPorNombreOCrear(nombre);
      var yaTiene = STATE.etiquetasDeIdea(idea.id).some(function (t) { return t.id === etiqueta.id; });
      if (yaTiene) { etqInput.value = ""; return; }
      await DB.etiquetarIdea(idea.id, etiqueta.id);
      STATE.ideaEtiquetas.push({ idea_id: idea.id, etiqueta_id: etiqueta.id });
      etqInput.value = "";
      STATE.notificar();
    });
    etqSeccion.appendChild(etqInput);
    panel.appendChild(etqSeccion);

    // ---- Notas ----
    var notasSeccion = document.createElement("div"); notasSeccion.className = "panel-seccion";
    var notasTitulo = document.createElement("h3"); notasTitulo.textContent = "Notas y pasajes"; notasSeccion.appendChild(notasTitulo);
    STATE.notasDeIdea(idea.id).forEach(function (nota) {
      var notaBox = document.createElement("div"); notaBox.className = "nota-item";
      var p = document.createElement("p"); p.textContent = nota.contenido; notaBox.appendChild(p);
      var fuenteBits = [nota.fuente_titulo, nota.fuente_autor, nota.fuente_ref].filter(Boolean);
      if (fuenteBits.length) {
        var fuente = document.createElement("p"); fuente.className = "nota-fuente"; fuente.textContent = fuenteBits.join(" · ");
        notaBox.appendChild(fuente);
      }
      var borrarNota = document.createElement("button");
      borrarNota.type = "button"; borrarNota.textContent = "Borrar nota"; borrarNota.className = "nota-borrar";
      borrarNota.addEventListener("click", async function () {
        await DB.borrarNota(nota.id);
        STATE.notas = STATE.notas.filter(function (n) { return n.id !== nota.id; });
        STATE.notificar();
      });
      notaBox.appendChild(borrarNota);
      notasSeccion.appendChild(notaBox);
    });

    var notaForm = document.createElement("form"); notaForm.className = "nota-form";
    notaForm.innerHTML =
      '<textarea rows="2" placeholder="Contenido del pasaje/resumen" required></textarea>' +
      '<input type="text" placeholder="Fuente (título)">' +
      '<input type="text" placeholder="Autor">' +
      '<input type="text" placeholder="Página / referencia">' +
      '<button type="submit">Añadir nota</button>';
    notaForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var campos = notaForm.querySelectorAll("textarea, input");
      var contenido = campos[0].value.trim();
      if (!contenido) return;
      var nota = await DB.crearNota({
        idea_id: idea.id, contenido: contenido,
        fuente_titulo: campos[1].value.trim() || null,
        fuente_autor: campos[2].value.trim() || null,
        fuente_ref: campos[3].value.trim() || null
      });
      STATE.notas.push(nota);
      STATE.notificar();
    });
    notasSeccion.appendChild(notaForm);
    panel.appendChild(notasSeccion);

    // ---- Fotos ----
    var fotosSeccion = document.createElement("div"); fotosSeccion.className = "panel-seccion";
    var fotosTitulo = document.createElement("h3"); fotosTitulo.textContent = "Fotos"; fotosSeccion.appendChild(fotosTitulo);
    var fotosGrid = document.createElement("div"); fotosGrid.className = "fotos-grid";
    STATE.fotosDeIdea(idea.id).forEach(function (foto) {
      var item = document.createElement("div"); item.className = "foto-item";
      var img = document.createElement("img");
      img.src = DB.urlFoto(foto.storage_path);
      img.alt = "";
      item.appendChild(img);
      var borrarFotoBtn = document.createElement("button");
      borrarFotoBtn.type = "button"; borrarFotoBtn.className = "foto-borrar"; borrarFotoBtn.textContent = "✕";
      borrarFotoBtn.addEventListener("click", async function () {
        if (!confirm("¿Borrar esta foto?")) return;
        await DB.borrarFoto(foto.id, foto.storage_path);
        STATE.fotos = STATE.fotos.filter(function (f) { return f.id !== foto.id; });
        STATE.notificar();
      });
      item.appendChild(borrarFotoBtn);
      fotosGrid.appendChild(item);
    });
    fotosSeccion.appendChild(fotosGrid);

    var fotoEstado = document.createElement("p"); fotoEstado.className = "foto-estado"; fotoEstado.hidden = true;
    var fotoInput = document.createElement("input");
    fotoInput.type = "file"; fotoInput.accept = "image/*"; fotoInput.className = "foto-input";
    fotoInput.addEventListener("change", async function () {
      var file = fotoInput.files[0];
      if (!file) return;
      fotoEstado.hidden = false; fotoEstado.textContent = "Subiendo foto...";
      try {
        var blob = await redimensionarImagen(file);
        var foto = await DB.subirFoto(idea.id, blob);
        STATE.fotos.push(foto);
        fotoInput.value = "";
        fotoEstado.hidden = true;
        STATE.notificar();
      } catch (e) {
        fotoEstado.textContent = "No se pudo subir la foto. Comprueba tu conexión e inténtalo de nuevo.";
      }
    });
    fotosSeccion.appendChild(fotoInput);
    fotosSeccion.appendChild(fotoEstado);
    panel.appendChild(fotosSeccion);

    // ---- Nexos ----
    var nexosSeccion = document.createElement("div"); nexosSeccion.className = "panel-seccion";
    var nexosTitulo = document.createElement("h3"); nexosTitulo.textContent = "Nexos"; nexosSeccion.appendChild(nexosTitulo);
    var conectadas = STATE.nexosDeIdea(idea.id);
    conectadas.forEach(function (otra) {
      var pill = document.createElement("button");
      pill.type = "button"; pill.className = "chip"; pill.textContent = otra.titulo + " ✕";
      pill.addEventListener("click", async function () {
        var nexo = STATE.nexos.find(function (n) {
          return (n.idea_id_a === idea.id && n.idea_id_b === otra.id) || (n.idea_id_a === otra.id && n.idea_id_b === idea.id);
        });
        if (!nexo) return;
        await DB.borrarNexo(nexo.id);
        STATE.nexos = STATE.nexos.filter(function (n) { return n.id !== nexo.id; });
        STATE.notificar();
      });
      nexosSeccion.appendChild(pill);
    });
    var conectadasIds = conectadas.map(function (i) { return i.id; });
    var nexoSelect = document.createElement("select");
    var vacio = document.createElement("option"); vacio.value = ""; vacio.textContent = "Enlazar con...";
    nexoSelect.appendChild(vacio);
    STATE.ideas.filter(function (i) { return i.id !== idea.id && conectadasIds.indexOf(i.id) === -1; })
      .forEach(function (otra) {
        var opt = document.createElement("option"); opt.value = otra.id; opt.textContent = otra.titulo;
        nexoSelect.appendChild(opt);
      });
    nexoSelect.addEventListener("change", async function () {
      if (!nexoSelect.value) return;
      var nuevo = await DB.crearNexo(idea.id, nexoSelect.value);
      STATE.nexos.push(nuevo);
      STATE.notificar();
    });
    nexosSeccion.appendChild(nexoSelect);
    panel.appendChild(nexosSeccion);

    var borrarIdeaBtn = document.createElement("button");
    borrarIdeaBtn.type = "button"; borrarIdeaBtn.className = "panel-borrar-idea"; borrarIdeaBtn.textContent = "Borrar idea";
    borrarIdeaBtn.addEventListener("click", async function () {
      if (!confirm('¿Borrar "' + idea.titulo + '"? No se puede deshacer.')) return;
      await DB.borrarIdea(idea.id);
      STATE.ideas = STATE.ideas.filter(function (i) { return i.id !== idea.id; });
      STATE.notificar();
      cerrar();
    });
    panel.appendChild(borrarIdeaBtn);
  }

  function abrir(ideaId) {
    ideaActualId = ideaId;
    render();
  }

  STATE.on(render);
  window.Detalle = { abrir: abrir, cerrar: cerrar };
})();
