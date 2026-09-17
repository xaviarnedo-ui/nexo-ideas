/* NEXO Ideas — Ajustes: categorías y etiquetas. */
(function () {
  "use strict";

  function seccionCategorias() {
    var sec = document.createElement("div"); sec.className = "ajustes-seccion";
    var h = document.createElement("h3"); h.textContent = "Categorías"; sec.appendChild(h);

    STATE.categorias.slice().sort(function (a, b) { return a.orden - b.orden; }).forEach(function (cat) {
      var fila = document.createElement("div"); fila.className = "ajustes-fila";

      var nombreInput = document.createElement("input");
      nombreInput.type = "text"; nombreInput.value = cat.nombre;
      nombreInput.addEventListener("blur", async function () {
        if (nombreInput.value.trim() && nombreInput.value !== cat.nombre) {
          cat.nombre = nombreInput.value.trim();
          await DB.actualizarCategoria(cat.id, { nombre: cat.nombre });
          STATE.notificar();
        }
      });
      fila.appendChild(nombreInput);

      var colorInput = document.createElement("input");
      colorInput.type = "color"; colorInput.value = cat.color_acento;
      colorInput.addEventListener("change", async function () {
        cat.color_acento = colorInput.value;
        await DB.actualizarCategoria(cat.id, { color_acento: cat.color_acento });
        STATE.notificar();
      });
      fila.appendChild(colorInput);

      var ordenInput = document.createElement("input");
      ordenInput.type = "number"; ordenInput.value = cat.orden; ordenInput.className = "ajustes-orden";
      ordenInput.addEventListener("blur", async function () {
        var nuevo = parseInt(ordenInput.value, 10);
        if (!isNaN(nuevo) && nuevo !== cat.orden) {
          cat.orden = nuevo;
          await DB.actualizarCategoria(cat.id, { orden: nuevo });
          STATE.notificar();
        }
      });
      fila.appendChild(ordenInput);

      sec.appendChild(fila);
    });

    var form = document.createElement("form"); form.className = "ajustes-nueva";
    form.innerHTML = '<input type="text" placeholder="Nueva categoría" required><input type="color" value="#4f46e5"><button type="submit">Añadir</button>';
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var inputs = form.querySelectorAll("input");
      var nombre = inputs[0].value.trim();
      if (!nombre) return;
      var nueva = await DB.crearCategoria({ nombre: nombre, color_acento: inputs[1].value, orden: STATE.categorias.length + 1 });
      STATE.categorias.push(nueva);
      STATE.notificar();
      form.reset();
    });
    sec.appendChild(form);
    return sec;
  }

  async function fusionarEtiquetas(origenId, destinoId) {
    var relaciones = STATE.ideaEtiquetas.filter(function (e) { return e.etiqueta_id === origenId; });
    for (var i = 0; i < relaciones.length; i++) {
      var rel = relaciones[i];
      var yaTiene = STATE.ideaEtiquetas.some(function (e) { return e.idea_id === rel.idea_id && e.etiqueta_id === destinoId; });
      if (!yaTiene) {
        await DB.etiquetarIdea(rel.idea_id, destinoId);
        STATE.ideaEtiquetas.push({ idea_id: rel.idea_id, etiqueta_id: destinoId });
      }
      await DB.desetiquetarIdea(rel.idea_id, origenId);
    }
    STATE.ideaEtiquetas = STATE.ideaEtiquetas.filter(function (e) { return e.etiqueta_id !== origenId; });
    await DB.borrarEtiqueta(origenId);
    STATE.etiquetas = STATE.etiquetas.filter(function (e) { return e.id !== origenId; });
    STATE.notificar();
  }

  function seccionEtiquetas() {
    var sec = document.createElement("div"); sec.className = "ajustes-seccion";
    var h = document.createElement("h3"); h.textContent = "Etiquetas"; sec.appendChild(h);

    STATE.etiquetas.forEach(function (t) {
      var fila = document.createElement("div"); fila.className = "ajustes-fila";

      var nombreInput = document.createElement("input");
      nombreInput.type = "text"; nombreInput.value = t.nombre;
      nombreInput.addEventListener("blur", async function () {
        if (nombreInput.value.trim() && nombreInput.value !== t.nombre) {
          t.nombre = nombreInput.value.trim();
          await DB.renombrarEtiqueta(t.id, t.nombre);
          STATE.notificar();
        }
      });
      fila.appendChild(nombreInput);

      var fusionarSelect = document.createElement("select");
      var vacio = document.createElement("option"); vacio.value = ""; vacio.textContent = "Fusionar con...";
      fusionarSelect.appendChild(vacio);
      STATE.etiquetas.filter(function (o) { return o.id !== t.id; }).forEach(function (o) {
        var opt = document.createElement("option"); opt.value = o.id; opt.textContent = o.nombre;
        fusionarSelect.appendChild(opt);
      });
      fusionarSelect.addEventListener("change", async function () {
        if (!fusionarSelect.value) return;
        if (confirm('Todas las ideas con "' + t.nombre + '" pasarán a tener la otra etiqueta, y "' + t.nombre + '" se borrará. ¿Continuar?')) {
          await fusionarEtiquetas(t.id, fusionarSelect.value);
        }
      });
      fila.appendChild(fusionarSelect);

      var borrarBtn = document.createElement("button");
      borrarBtn.type = "button"; borrarBtn.textContent = "Borrar";
      borrarBtn.addEventListener("click", async function () {
        if (!confirm('¿Borrar la etiqueta "' + t.nombre + '"?')) return;
        await DB.borrarEtiqueta(t.id);
        STATE.etiquetas = STATE.etiquetas.filter(function (e) { return e.id !== t.id; });
        STATE.ideaEtiquetas = STATE.ideaEtiquetas.filter(function (e) { return e.etiqueta_id !== t.id; });
        STATE.notificar();
      });
      fila.appendChild(borrarBtn);

      sec.appendChild(fila);
    });
    return sec;
  }

  function render() {
    var root = document.getElementById("vista-ajustes");
    if (!root) return;
    root.innerHTML = "";
    if (!STATE.categorias.length) return;
    root.appendChild(seccionCategorias());
    root.appendChild(seccionEtiquetas());
  }

  STATE.on(render);
  window.Ajustes = { render: render };
})();
