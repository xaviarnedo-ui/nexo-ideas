/* NEXO Ideas — vista Mapa: layout radial en SVG puro. */
(function () {
  "use strict";

  var W = 800, H = 800, CX = W / 2, CY = H / 2;
  var RADIO_CATEGORIA = 220, RADIO_IDEA = 90;

  function layout() {
    var posCategorias = {}, posIdeas = {};
    var n = STATE.categorias.length;
    STATE.categorias.forEach(function (cat, i) {
      var angulo = (i / n) * Math.PI * 2 - Math.PI / 2;
      var x = CX + RADIO_CATEGORIA * Math.cos(angulo);
      var y = CY + RADIO_CATEGORIA * Math.sin(angulo);
      posCategorias[cat.id] = { x: x, y: y };

      var ideas = STATE.ideas.filter(function (idea) { return idea.categoria_id === cat.id; });
      var m = ideas.length;
      var spread = Math.min(Math.PI / 2.2, 0.35 * m);
      ideas.forEach(function (idea, j) {
        var ia = m > 1 ? (angulo - spread / 2) + (spread / (m - 1)) * j : angulo;
        posIdeas[idea.id] = {
          x: x + RADIO_IDEA * Math.cos(ia),
          y: y + RADIO_IDEA * Math.sin(ia)
        };
      });
    });
    return { posCategorias: posCategorias, posIdeas: posIdeas };
  }

  function render() {
    var root = document.getElementById("vista-mapa");
    if (!root) return;
    root.innerHTML = "";
    if (!STATE.categorias.length) return;

    var L = layout();
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("class", "mapa-svg");

    function linea(x1, y1, x2, y2, color, opacidad, grosor, discontinua) {
      var l = document.createElementNS(NS, "line");
      l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2);
      l.setAttribute("stroke", color); l.setAttribute("stroke-opacity", opacidad); l.setAttribute("stroke-width", grosor);
      if (discontinua) l.setAttribute("stroke-dasharray", "4 3");
      svg.appendChild(l);
    }
    function nodo(x, y, r, color, onClick, titulo) {
      var g = document.createElementNS(NS, "g");
      g.setAttribute("class", "mapa-nodo");
      if (onClick) { g.style.cursor = "pointer"; g.addEventListener("click", onClick); }
      var c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", r); c.setAttribute("fill", color);
      g.appendChild(c);
      var t = document.createElementNS(NS, "title");
      t.textContent = titulo;
      g.appendChild(t);
      svg.appendChild(g);
    }
    function texto(x, y, contenido, color, tamano, anclaje) {
      var t = document.createElementNS(NS, "text");
      t.setAttribute("x", x); t.setAttribute("y", y); t.setAttribute("fill", color);
      t.setAttribute("font-size", tamano); t.setAttribute("text-anchor", anclaje || "middle");
      t.setAttribute("font-family", "var(--font-mono)");
      t.textContent = contenido;
      svg.appendChild(t);
    }

    STATE.categorias.forEach(function (cat) {
      var p = L.posCategorias[cat.id];
      linea(CX, CY, p.x, p.y, cat.color_acento, 0.5, 2, false);
    });
    STATE.ideas.forEach(function (idea) {
      var cat = STATE.categoriaPorId(idea.categoria_id);
      var pc = L.posCategorias[idea.categoria_id], pi = L.posIdeas[idea.id];
      if (!cat || !pc || !pi) return;
      linea(pc.x, pc.y, pi.x, pi.y, cat.color_acento, 0.35, 1, false);
    });
    STATE.nexos.forEach(function (n) {
      var pa = L.posIdeas[n.idea_id_a], pb = L.posIdeas[n.idea_id_b];
      if (!pa || !pb) return;
      linea(pa.x, pa.y, pb.x, pb.y, "#e7e5e0", 0.6, 1.4, true);
    });

    nodo(CX, CY, 20, "#e7e5e0", null, "NEXO");
    texto(CX, CY + 38, "NEXO", "#e7e5e0", 13);

    STATE.categorias.forEach(function (cat) {
      var p = L.posCategorias[cat.id];
      nodo(p.x, p.y, 10, cat.color_acento, null, cat.nombre);
      var dx = p.x > CX ? 16 : (p.x < CX ? -16 : 0);
      texto(p.x + dx, p.y + 4, cat.nombre, cat.color_acento, 12, dx < 0 ? "end" : (dx > 0 ? "start" : "middle"));
    });

    STATE.ideas.forEach(function (idea) {
      var p = L.posIdeas[idea.id];
      if (!p) return;
      var cat = STATE.categoriaPorId(idea.categoria_id);
      nodo(p.x, p.y, 5, cat ? cat.color_acento : "#8b8f99", function () { Detalle.abrir(idea.id); }, idea.titulo);
    });

    root.appendChild(svg);
  }

  STATE.on(render);
  window.MapaVista = { render: render };
})();
