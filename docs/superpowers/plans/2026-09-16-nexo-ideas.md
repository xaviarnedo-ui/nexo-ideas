# NEXO Ideas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build NEXO Ideas, a personal single-user PWA where Xavi captures, organizes, and connects the ideas behind his PNI consulting practice, with Claude able to read/write the same live data from future sessions.

**Architecture:** Vanilla HTML/CSS/JS (no build step, no framework), mirroring `~/Desktop/carga-gps`'s conventions (IIFE modules, `"use strict"`, `var`/function-expression style, `el()`/`esc()` helpers). Supabase (Postgres) is the live database, read and written directly from the browser via the `supabase-js` UMD client — unlike carga-gps, where Supabase only carries push notifications and the real data is a static generated file. Hosted as a static site on GitHub Pages behind a client-side password gate.

**Tech Stack:** HTML5, CSS (custom properties, no preprocessor), vanilla JS (ES5-style, classic scripts), `@supabase/supabase-js@2` (UMD via unpkg), Supabase Postgres + Realtime + RLS, Python 3 + `requests` for Claude's local data-access script, PIL for icon generation.

**Spec:** [docs/superpowers/specs/2026-09-16-nexo-ideas-design.md](../specs/2026-09-16-nexo-ideas-design.md)

## Global Constraints

- No automated test suite (per spec) — every task ends with a manual verification in the browser via a local static server (`python3 -m http.server`), same as carga-gps's "Previsualizar en local".
- No build tools, no npm, no bundler — plain files served as-is.
- `.env` never committed (already gitignored). Supabase `anon key` IS committed inside `supabase-client.js` — this is intentional and matches carga-gps (`app.js:860`) and Supabase's own security model: the anon key is a public, RLS-scoped key, not a secret.
- Access control is the client-side password gate, not Supabase Auth (spec decision).
- Spanish for all UI copy and code comments-that-exist (comments only where the *why* isn't obvious, per house style).
- Category accent colors: Objetivos y herramientas `#0d9488` · Conceptos clave `#4f46e5` · Referentes `#9333ea` · Libros `#d97706` · Investigación/evidencia `#e11d48`.
- Estado (maturity) colors: suelta `#9ca3af` (gray) · en_desarrollo `#f59e0b` (amber) · validada `#16a34a` (green) — same semáforo language Xavi already uses in the NEXO 12 protocol and carga-gps.
- Typography: reuse the NEXO brand trio — Newsreader (titles), Hanken Grotesk (UI/body), IBM Plex Mono (meta/labels) — for visual family resemblance with the rest of the NEXO ecosystem, loaded from Google Fonts.
- Tablero/Detalle/Ajustes are light-themed; only the Mapa view is dark, per spec.

---

## Task 1: Crear el proyecto Supabase y cargar el esquema (acción manual de Xavi)

Claude cannot sign up for Supabase on Xavi's behalf, so this task is split: Claude writes the SQL files, Xavi runs them.

**Files:**
- Create: `supabase/schema.sql`
- Create: `supabase/seed.sql`

**Interfaces:**
- Produces: 6 tables (`categorias`, `ideas`, `notas`, `etiquetas`, `idea_etiquetas`, `nexos`) matching the spec's DDL, with RLS open to `anon`, realtime enabled, and seed data loaded — plus a `SUPABASE_URL` and `anon key` that Task 3 and Task 11 both consume.

- [ ] **Step 1: Write `supabase/schema.sql`**

```sql
-- NEXO Ideas — esquema inicial
create extension if not exists pgcrypto;

create table categorias (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  color_acento text not null,
  orden        int not null default 0,
  created_at   timestamptz not null default now()
);

create table ideas (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  categoria_id uuid not null references categorias(id),
  estado       text not null default 'suelta'
               check (estado in ('suelta','en_desarrollo','validada')),
  cuerpo       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table notas (
  id            uuid primary key default gen_random_uuid(),
  idea_id       uuid not null references ideas(id) on delete cascade,
  contenido     text not null,
  fuente_titulo text,
  fuente_autor  text,
  fuente_ref    text,
  created_at    timestamptz not null default now()
);

create table etiquetas (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

create table idea_etiquetas (
  idea_id     uuid not null references ideas(id) on delete cascade,
  etiqueta_id uuid not null references etiquetas(id) on delete cascade,
  primary key (idea_id, etiqueta_id)
);

create table nexos (
  id         uuid primary key default gen_random_uuid(),
  idea_id_a  uuid not null references ideas(id) on delete cascade,
  idea_id_b  uuid not null references ideas(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (idea_id_a <> idea_id_b)
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger ideas_set_updated_at
  before update on ideas
  for each row execute function set_updated_at();

-- RLS: el control de acceso real lo hace la pantalla de contraseña de la
-- app, no Supabase Auth (decisión de la spec). Política abierta para anon.
alter table categorias enable row level security;
alter table ideas enable row level security;
alter table notas enable row level security;
alter table etiquetas enable row level security;
alter table idea_etiquetas enable row level security;
alter table nexos enable row level security;

create policy "anon_full_access" on categorias for all using (true) with check (true);
create policy "anon_full_access" on ideas for all using (true) with check (true);
create policy "anon_full_access" on notas for all using (true) with check (true);
create policy "anon_full_access" on etiquetas for all using (true) with check (true);
create policy "anon_full_access" on idea_etiquetas for all using (true) with check (true);
create policy "anon_full_access" on nexos for all using (true) with check (true);

alter publication supabase_realtime add table
  categorias, ideas, notas, etiquetas, idea_etiquetas, nexos;
```

- [ ] **Step 2: Write `supabase/seed.sql`**

```sql
-- Categorías
insert into categorias (nombre, color_acento, orden) values
  ('Objetivos y herramientas', '#0d9488', 1),
  ('Conceptos clave',          '#4f46e5', 2),
  ('Referentes',               '#9333ea', 3),
  ('Libros',                   '#d97706', 4),
  ('Investigación/evidencia',  '#e11d48', 5);

-- Ideas
insert into ideas (titulo, categoria_id, estado) values
  ('Decatlón con objetivos organizados por franjas de edad',
   (select id from categorias where nombre = 'Objetivos y herramientas'), 'suelta'),
  ('Lista de 50 objetivos para poder hacer a los 75 años',
   (select id from categorias where nombre = 'Objetivos y herramientas'), 'suelta'),
  ('Deterioro del VO2max y masa muscular con la edad',
   (select id from categorias where nombre = 'Objetivos y herramientas'), 'suelta'),
  ('Salud mitocondrial y flexibilidad metabólica',
   (select id from categorias where nombre = 'Conceptos clave'), 'suelta'),
  ('Picos de glucosa',
   (select id from categorias where nombre = 'Conceptos clave'), 'suelta'),
  ('Ayuno',
   (select id from categorias where nombre = 'Conceptos clave'), 'suelta'),
  ('Suplementación (creatina, omega-3, magnesio)',
   (select id from categorias where nombre = 'Conceptos clave'), 'suelta'),
  ('Beneficios del entrenamiento en zona 2',
   (select id from categorias where nombre = 'Conceptos clave'), 'suelta'),
  ('Sensibilidad a la insulina según el momento del día',
   (select id from categorias where nombre = 'Conceptos clave'), 'suelta'),
  ('Iñigo San Millán',
   (select id from categorias where nombre = 'Referentes'), 'suelta'),
  ('Peter Attia',
   (select id from categorias where nombre = 'Referentes'), 'suelta'),
  ('Odile Fernández',
   (select id from categorias where nombre = 'Referentes'), 'suelta'),
  ('Estimula tu nervio vago (Antonio Valenzuela)',
   (select id from categorias where nombre = 'Libros'), 'suelta'),
  ('Sin límites (Peter Attia)',
   (select id from categorias where nombre = 'Libros'), 'suelta'),
  ('PNI en deporte de élite (revisión)',
   (select id from categorias where nombre = 'Investigación/evidencia'), 'suelta');

update ideas set cuerpo =
  'Síndrome de sobreentrenamiento, inmunidad de mucosas (IgA salival), estrés psicológico y riesgo de lesión, intervenciones mente-cuerpo, eje intestino-cerebro-inmunidad, salud mental e inflamación, sueño, y glucemia/picos de glucosa en deportistas.'
where titulo = 'PNI en deporte de élite (revisión)';

-- Notas de "Sin límites"
insert into notas (idea_id, contenido, fuente_titulo, fuente_autor, fuente_ref) values
  ((select id from ideas where titulo = 'Sin límites (Peter Attia)'),
   'Sueño y resistencia a la insulina (estudio de Eve Van Cauter).',
   'Sin límites', 'Peter Attia', null),
  ((select id from ideas where titulo = 'Sin límites (Peter Attia)'),
   'Sueño y enfermedad cardiovascular: eje cortisol/sistema nervioso simpático y grelina/leptina.',
   'Sin límites', 'Peter Attia', null);

-- Etiquetas de ejemplo
insert into etiquetas (nombre) values ('sueño'), ('insulina');

insert into idea_etiquetas (idea_id, etiqueta_id) values
  ((select id from ideas where titulo = 'Picos de glucosa'),
   (select id from etiquetas where nombre = 'insulina')),
  ((select id from ideas where titulo = 'Sensibilidad a la insulina según el momento del día'),
   (select id from etiquetas where nombre = 'insulina')),
  ((select id from ideas where titulo = 'Sensibilidad a la insulina según el momento del día'),
   (select id from etiquetas where nombre = 'sueño')),
  ((select id from ideas where titulo = 'Sin límites (Peter Attia)'),
   (select id from etiquetas where nombre = 'sueño'));

-- Nexos de ejemplo
insert into nexos (idea_id_a, idea_id_b) values
  ((select id from ideas where titulo = 'Picos de glucosa'),
   (select id from ideas where titulo = 'Sensibilidad a la insulina según el momento del día')),
  ((select id from ideas where titulo = 'Sensibilidad a la insulina según el momento del día'),
   (select id from ideas where titulo = 'Sin límites (Peter Attia)'));
```

- [ ] **Step 3: Xavi ejecuta esto manualmente (fuera de Claude Code)**

1. En [supabase.com](https://supabase.com), crear proyecto nuevo llamado `nexo-ideas` (región más cercana, contraseña de base de datos cualquiera — no es la contraseña de la app).
2. `SQL Editor` → pegar el contenido de `supabase/schema.sql` → Run.
3. `SQL Editor` → pegar el contenido de `supabase/seed.sql` → Run.
4. `Table Editor` → confirmar que las 6 tablas existen y `ideas` tiene 15 filas, `notas` 2, `etiquetas` 2, `nexos` 2.
5. `Settings → API` → copiar **Project URL** y la key **anon public** — se usan en el Task 3.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql supabase/seed.sql
git commit -m "feat: esquema y datos semilla de Supabase"
```

---

## Task 2: Scaffold visual — HTML, CSS, manifest e iconos

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `manifest.json`
- Create: `gen_icons.py`
- Create: `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`, `icons/apple-touch-icon.png` (generados por `gen_icons.py`)
- Create: `sw.js`

**Interfaces:**
- Produces: the DOM containers every later JS file mounts into — `#gate`/`#gate-form`/`#gate-input`/`#gate-error`, `#app`, `#vista-tablero`/`#vista-mapa`/`#vista-ajustes`, `#btn-capturar`, `#modal-captura` (`#captura-titulo`/`#captura-categorias`/`#captura-etiquetas`/`#form-captura`/`#captura-cancelar`), `#panel-detalle`, and the `.tab[data-view]` nav buttons. Also produces the CSS custom properties (`--bg`, `--text`, `--accent-*`, `--estado-*`, `--font-*`, `--radius`, `--shadow`) every later stylesheet addition relies on.

- [ ] **Step 1: Write `index.html`**

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>NEXO Ideas</title>
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="theme-color" content="#f7f5f2">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,500;0,600;1,500&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css?v=1">
</head>
<body>

<div id="gate" class="gate">
  <form id="gate-form" class="gate-card">
    <h1>NEXO Ideas</h1>
    <p>Introduce la contraseña</p>
    <input id="gate-input" type="password" autocomplete="current-password" required>
    <button type="submit">Entrar</button>
    <p id="gate-error" class="gate-error" hidden>Contraseña incorrecta.</p>
  </form>
</div>

<div id="app" class="app" hidden>
  <header class="topbar">
    <span class="brand">NEXO Ideas</span>
    <nav class="tabs">
      <button class="tab" data-view="tablero" aria-current="page">Tablero</button>
      <button class="tab" data-view="mapa">Mapa</button>
      <button class="tab" data-view="ajustes">Ajustes</button>
    </nav>
  </header>

  <main id="views">
    <section id="vista-tablero" class="view" data-view="tablero"></section>
    <section id="vista-mapa" class="view" data-view="mapa" hidden></section>
    <section id="vista-ajustes" class="view" data-view="ajustes" hidden></section>
  </main>

  <button id="btn-capturar" class="fab" aria-label="Nueva idea">+</button>

  <div id="modal-captura" class="modal" hidden>
    <form id="form-captura" class="modal-card">
      <h2>Nueva idea</h2>
      <input id="captura-titulo" type="text" placeholder="Título" required>
      <div id="captura-categorias" class="chip-group"></div>
      <input id="captura-etiquetas" type="text" placeholder="Etiquetas (separadas por coma)">
      <div class="modal-actions">
        <button type="button" id="captura-cancelar">Cancelar</button>
        <button type="submit">Guardar</button>
      </div>
    </form>
  </div>

  <aside id="panel-detalle" class="panel" hidden></aside>
</div>

<script src="https://unpkg.com/@supabase/supabase-js@2"></script>
<script src="supabase-client.js?v=1"></script>
<script src="auth-gate.js?v=1"></script>
<script src="db.js?v=1"></script>
<script src="state.js?v=1"></script>
<script src="capture.js?v=1"></script>
<script src="board.js?v=1"></script>
<script src="detail.js?v=1"></script>
<script src="map.js?v=1"></script>
<script src="settings.js?v=1"></script>
<script src="app.js?v=1"></script>
</body>
</html>
```

- [ ] **Step 2: Write `styles.css`**

```css
/* NEXO Ideas — sistema visual */
:root {
  --bg: #f7f5f2;
  --bg-elevated: #ffffff;
  --text: #1c1a17;
  --text-muted: #6b6459;
  --border: #e4ddd3;
  --accent-objetivos: #0d9488;
  --accent-conceptos: #4f46e5;
  --accent-referentes: #9333ea;
  --accent-libros: #d97706;
  --accent-investigacion: #e11d48;
  --estado-suelta: #9ca3af;
  --estado-desarrollo: #f59e0b;
  --estado-validada: #16a34a;
  --font-title: "Newsreader", serif;
  --font-body: "Hanken Grotesk", -apple-system, sans-serif;
  --font-mono: "IBM Plex Mono", monospace;
  --radius: 10px;
  --shadow: 0 1px 3px rgba(28,26,23,.08), 0 8px 24px rgba(28,26,23,.06);
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3 { font-family: var(--font-title); font-weight: 600; margin: 0 0 .4em; }
button { font-family: var(--font-body); cursor: pointer; }
input, textarea, select { font-family: var(--font-body); font-size: 1rem; }

/* ---- Gate ---- */
.gate {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: var(--bg); z-index: 100;
}
.gate-card {
  width: min(320px, 90vw); display: flex; flex-direction: column; gap: .6rem;
  background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: var(--shadow); padding: 2rem;
}
.gate-card input { padding: .6rem .8rem; border: 1px solid var(--border); border-radius: 8px; }
.gate-card button { padding: .6rem .8rem; border: none; border-radius: 8px; background: var(--text); color: #fff; font-weight: 600; }
.gate-error { color: var(--accent-investigacion); font-size: .85rem; margin: 0; }

/* ---- Layout general ---- */
.app { min-height: 100vh; display: flex; flex-direction: column; }
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: .9rem 1.2rem; border-bottom: 1px solid var(--border); background: var(--bg-elevated);
}
.brand { font-family: var(--font-title); font-weight: 600; font-size: 1.1rem; }
.tabs { display: flex; gap: .3rem; }
.tab {
  border: none; background: transparent; padding: .4rem .8rem; border-radius: 999px;
  color: var(--text-muted); font-weight: 600; font-size: .9rem;
}
.tab[aria-current="page"] { background: var(--text); color: #fff; }
#views { flex: 1; padding: 1.2rem; }
.view[hidden] { display: none; }

/* ---- Botón flotante de captura ---- */
.fab {
  position: fixed; right: 1.4rem; bottom: 1.4rem; width: 56px; height: 56px; border-radius: 50%;
  border: none; background: var(--text); color: #fff; font-size: 1.8rem; line-height: 1;
  box-shadow: var(--shadow); z-index: 40;
}

/* ---- Modal genérico ---- */
.modal {
  position: fixed; inset: 0; background: rgba(28,26,23,.4); display: flex;
  align-items: flex-end; justify-content: center; z-index: 60;
}
@media (min-width: 640px) { .modal { align-items: center; } }
.modal-card {
  width: min(480px, 100vw); max-height: 90vh; overflow-y: auto;
  background: var(--bg-elevated); border-radius: var(--radius) var(--radius) 0 0;
  padding: 1.4rem; display: flex; flex-direction: column; gap: .7rem;
}
@media (min-width: 640px) { .modal-card { border-radius: var(--radius); } }
.modal-card input, .modal-card textarea {
  padding: .6rem .8rem; border: 1px solid var(--border); border-radius: 8px; width: 100%;
}
.modal-actions { display: flex; justify-content: flex-end; gap: .5rem; margin-top: .3rem; }
.modal-actions button { padding: .5rem 1rem; border-radius: 8px; border: 1px solid var(--border); background: transparent; }
.modal-actions button[type="submit"] { background: var(--text); color: #fff; border-color: var(--text); }

/* ---- Chips (categorías/etiquetas) ---- */
.chip-group { display: flex; flex-wrap: wrap; gap: .4rem; }
.chip {
  border: 1px solid var(--border); border-radius: 999px; padding: .3rem .7rem;
  font-size: .82rem; font-weight: 600; background: transparent; color: var(--text-muted);
}
.chip[aria-pressed="true"] { color: #fff; border-color: transparent; }

/* ---- Estado (semáforo) ---- */
.punto-estado { display: inline-block; width: 9px; height: 9px; border-radius: 50%; }

/* ---- Panel de detalle ---- */
.panel {
  position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100vw);
  background: var(--bg-elevated); border-left: 1px solid var(--border); box-shadow: var(--shadow);
  overflow-y: auto; padding: 1.4rem; z-index: 50;
}
```

- [ ] **Step 3: Write `manifest.json`**

```json
{
  "name": "NEXO Ideas",
  "short_name": "NEXO Ideas",
  "description": "Base de conocimiento personal de ideas para la consulta de PNI de Xavi.",
  "lang": "es",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#f7f5f2",
  "theme_color": "#f7f5f2",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 4: Write `gen_icons.py` and run it**

No hay logo de NEXO todavía (naming/marca sigue pendiente), así que el icono es un motivo abstracto de nodos — coherente con lo que hace la propia app, no con una marca aún sin definir.

```python
#!/usr/bin/env python3
"""Genera los iconos PWA (icons/) con un motivo de nodos conectados.
Ejecuta: python3 gen_icons.py"""
from PIL import Image, ImageDraw

BG = (28, 26, 23)
DOT = (247, 245, 242)
LINE = (140, 134, 124)


def icon(size, mode="RGBA"):
    img = Image.new("RGBA", (size, size), BG + (255,))
    d = ImageDraw.Draw(img)
    c = size / 2
    r = size * 0.34
    pts = [
        (c, c - r),
        (c + r * 0.87, c + r * 0.5),
        (c - r * 0.87, c + r * 0.5),
    ]
    for p in pts:
        d.line([c, c, p[0], p[1]], fill=LINE, width=max(2, size // 60))
    dot_r = size * 0.045
    d.ellipse([c - dot_r, c - dot_r, c + dot_r, c + dot_r], fill=DOT)
    for p in pts:
        d.ellipse([p[0] - dot_r, p[1] - dot_r, p[0] + dot_r, p[1] + dot_r], fill=DOT)
    return img.convert(mode)


icon(192).convert("RGB").save("icons/icon-192.png")
icon(512).convert("RGB").save("icons/icon-512.png")
icon(512).save("icons/icon-maskable-512.png")
icon(180).convert("RGB").save("icons/apple-touch-icon.png")

print("iconos generados en icons/.")
```

```bash
mkdir -p icons && python3 gen_icons.py
```

- [ ] **Step 5: Write `sw.js`**

```js
var CACHE = "nexo-ideas-v1";
var ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=1",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(ASSETS.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request); }));
});
```

- [ ] **Step 6: Verificación manual**

```bash
python3 -m http.server 4610
```

Abrir `http://localhost:4610/index.html`: debe verse la pantalla de contraseña (el `#app` sigue `hidden` porque `auth-gate.js` no existe todavía, así que no hace falta que el formulario funcione aún — solo comprobar que carga sin errores 404 de CSS/manifest/iconos en la consola).

- [ ] **Step 7: Commit**

```bash
git add index.html styles.css manifest.json gen_icons.py icons/ sw.js
git commit -m "feat: scaffold visual (HTML, CSS, PWA)"
```

---

## Task 3: Cliente Supabase y pantalla de contraseña

**Files:**
- Create: `supabase-client.js`
- Create: `auth-gate.js`
- Modify: `index.html` (ya referencia estos scripts desde el Task 2, no hace falta tocarlo)

**Interfaces:**
- Consumes: `window.supabase.createClient` (global de la librería UMD cargada en `index.html`), `#gate`/`#gate-form`/`#gate-input`/`#gate-error`/`#app` (Task 2).
- Produces: `window.NEXO_DB` (instancia del cliente Supabase, consumida por `db.js` en el Task 4) y el evento `document.dispatchEvent(new CustomEvent("nexo:unlocked"))`, disparado una vez tras contraseña correcta (o de inmediato si ya estaba desbloqueado en este navegador) — es la señal que `app.js` (Task 6) espera antes de cargar datos.

- [ ] **Step 1: Write `supabase-client.js`**

```js
/* NEXO Ideas — cliente Supabase.
   La anon key es pública por diseño (protegida por RLS, no por secreto) —
   ver nota de seguridad en la spec. Reemplaza los dos valores de abajo con
   los del Task 1, paso 5 (Settings → API en tu proyecto Supabase). */
(function () {
  "use strict";
  var SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
  var SUPABASE_ANON_KEY = "TU-ANON-KEY";
  window.NEXO_DB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
```

- [ ] **Step 2: Write `auth-gate.js`**

```js
/* NEXO Ideas — pantalla de contraseña.
   Puerta de interfaz, no cifrado real (ver nota de seguridad en la spec):
   compara el hash SHA-256 de lo escrito contra PASSWORD_HASH de abajo. */
(function () {
  "use strict";
  var PASSWORD_HASH = "REEMPLAZA-ESTO-CON-TU-HASH";
  var STORAGE_KEY = "nexo-ideas-unlocked";

  function sha256Hex(text) {
    var enc = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    });
  }

  function unlock() {
    document.getElementById("gate").hidden = true;
    document.getElementById("app").hidden = false;
    document.dispatchEvent(new CustomEvent("nexo:unlocked"));
  }

  if (localStorage.getItem(STORAGE_KEY) === "1") {
    unlock();
    return;
  }

  document.getElementById("gate-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = document.getElementById("gate-input");
    sha256Hex(input.value).then(function (hash) {
      if (hash === PASSWORD_HASH) {
        localStorage.setItem(STORAGE_KEY, "1");
        unlock();
      } else {
        document.getElementById("gate-error").hidden = false;
        input.value = "";
      }
    });
  });
})();
```

- [ ] **Step 3: Xavi elige una contraseña y genera su hash**

En la consola del navegador (F12), con la contraseña elegida en vez de `mi-contraseña`:

```js
crypto.subtle.digest("SHA-256", new TextEncoder().encode("mi-contraseña"))
  .then(function (b) {
    console.log(Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join(""));
  });
```

Pegar el resultado en `PASSWORD_HASH` dentro de `auth-gate.js`. Para desarrollo local, vale una contraseña provisional (p.ej. `nexo-dev`) — cambiarla antes de publicar en el Task 12.

- [ ] **Step 4: Pegar las credenciales del Task 1 en `supabase-client.js`**

Reemplazar `SUPABASE_URL` y `SUPABASE_ANON_KEY` con los valores reales copiados en el Task 1, paso 5.

- [ ] **Step 5: Verificación manual**

```bash
python3 -m http.server 4610
```

Abrir `http://localhost:4610/index.html`: escribir una contraseña incorrecta → aparece el error; escribir la correcta → la app se muestra y, recargando la página, ya no vuelve a pedir contraseña (persiste en `localStorage`). En la consola del navegador, comprobar la conexión real a Supabase:

```js
NEXO_DB.from("categorias").select("*").then(function (r) { console.log(r); });
```

Debe devolver `data` con las 5 categorías sembradas en el Task 1, sin `error`.

- [ ] **Step 6: Commit**

```bash
git add supabase-client.js auth-gate.js
git commit -m "feat: cliente Supabase y pantalla de contraseña"
```

---

## Task 4: Capa de datos (`db.js`) con cola offline

Punto central: **cualquier** fallo de guardado (sin red o error inesperado)
encola la operación en `localStorage` en vez de perderla — es el requisito
central de la spec ("nunca se pierde una idea por un fallo de red"), así que
se trata de forma uniforme sin intentar distinguir tipos de error.

**Files:**
- Create: `db.js`

**Interfaces:**
- Consumes: `window.NEXO_DB` (Task 3).
- Produces (todo cuelga de `window.DB`, consumido por `state.js`, `capture.js`, `board.js`, `detail.js`, `map.js`, `settings.js`):
  - `DB.listarCategorias()`, `DB.crearCategoria({nombre,color_acento,orden})`, `DB.actualizarCategoria(id,cambios)`
  - `DB.listarIdeas()`, `DB.crearIdea({titulo,categoria_id,estado})`, `DB.actualizarIdea(id,cambios)`, `DB.borrarIdea(id)`
  - `DB.listarNotas()`, `DB.crearNota({idea_id,contenido,fuente_titulo,fuente_autor,fuente_ref})`, `DB.borrarNota(id)`
  - `DB.listarEtiquetas()`, `DB.crearEtiqueta(nombre)`, `DB.renombrarEtiqueta(id,nombre)`, `DB.borrarEtiqueta(id)`
  - `DB.listarIdeaEtiquetas()`, `DB.etiquetarIdea(idea_id,etiqueta_id)`, `DB.desetiquetarIdea(idea_id,etiqueta_id)`
  - `DB.listarNexos()`, `DB.crearNexo(idea_id_a,idea_id_b)`, `DB.borrarNexo(id)`
  - `DB.colaPendiente()` → array de operaciones encoladas todavía sin confirmar
  - Evento `document` `"nexo:cola-cambiada"` cada vez que la cola cambia de tamaño (para que la UI pueda mostrar "N cambios pendientes").
  - Todas las funciones `crear*` generan el `id` (UUID) **en el cliente** antes de escribir, para que el objeto optimista devuelto en caso de fallo tenga el mismo `id` que acabará teniendo en el servidor — así no hace falta reconciliar ids después.

- [ ] **Step 1: Write `db.js`**

```js
/* NEXO Ideas — capa de acceso a datos sobre Supabase, con cola offline.
   Cualquier fallo de escritura (sin red o error inesperado) se encola en
   localStorage y se reintenta solo — nunca se pierde una idea por un fallo
   de red, que es el caso de uso central (capturar en la calle). */
(function () {
  "use strict";

  var SB = window.NEXO_DB;
  var COLA_KEY = "nexo-ideas-cola";

  function uuid() {
    return crypto.randomUUID();
  }

  function leerCola() {
    try { return JSON.parse(localStorage.getItem(COLA_KEY)) || []; }
    catch (e) { return []; }
  }

  function guardarCola(cola) {
    localStorage.setItem(COLA_KEY, JSON.stringify(cola));
    document.dispatchEvent(new CustomEvent("nexo:cola-cambiada", { detail: { pendientes: cola.length } }));
  }

  function encolar(op) {
    var cola = leerCola();
    cola.push(op);
    guardarCola(cola);
  }

  async function ejecutarOp(op) {
    if (op.operacion === "insert") {
      var r1 = await SB.from(op.tabla).insert(op.payload);
      if (r1.error) throw r1.error;
    } else if (op.operacion === "update") {
      var r2 = await SB.from(op.tabla).update(op.cambios).eq("id", op.id);
      if (r2.error) throw r2.error;
    } else if (op.operacion === "delete") {
      var r3 = await SB.from(op.tabla).delete().eq("id", op.id);
      if (r3.error) throw r3.error;
    }
  }

  async function procesarCola() {
    var cola = leerCola();
    while (cola.length) {
      try {
        await ejecutarOp(cola[0]);
        cola.shift();
        guardarCola(cola);
      } catch (e) {
        break; // seguimos con red mala; se reintenta en el próximo trigger
      }
    }
  }

  window.addEventListener("online", procesarCola);
  setInterval(procesarCola, 30000);

  // intenta escribir ya; si falla (red u otro error), encola y sigue
  // adelante de forma optimista con el mismo id que se generó en el cliente
  async function escribirConCola(tabla, operacion, payload, idParaCola, cambiosParaCola) {
    try {
      await ejecutarOp({ tabla: tabla, operacion: operacion, payload: payload, id: idParaCola, cambios: cambiosParaCola });
      return { pendiente: false };
    } catch (e) {
      encolar({ tabla: tabla, operacion: operacion, payload: payload, id: idParaCola, cambios: cambiosParaCola });
      return { pendiente: true };
    }
  }

  var DB = {};

  // ---- categorias ----
  DB.listarCategorias = async function () {
    var r = await SB.from("categorias").select("*").order("orden");
    if (r.error) throw r.error;
    return r.data;
  };
  DB.crearCategoria = async function (datos) {
    var fila = Object.assign({ id: uuid() }, datos);
    var estado = await escribirConCola("categorias", "insert", fila);
    return Object.assign({}, fila, { _pendiente: estado.pendiente });
  };
  DB.actualizarCategoria = async function (id, cambios) {
    var estado = await escribirConCola("categorias", "update", null, id, cambios);
    return Object.assign({ id: id }, cambios, { _pendiente: estado.pendiente });
  };

  // ---- ideas ----
  DB.listarIdeas = async function () {
    var r = await SB.from("ideas").select("*").order("created_at", { ascending: false });
    if (r.error) throw r.error;
    return r.data;
  };
  DB.crearIdea = async function (datos) {
    var fila = Object.assign({ id: uuid(), estado: "suelta" }, datos);
    var estado = await escribirConCola("ideas", "insert", fila);
    return Object.assign({}, fila, { _pendiente: estado.pendiente });
  };
  DB.actualizarIdea = async function (id, cambios) {
    var estado = await escribirConCola("ideas", "update", null, id, cambios);
    return Object.assign({ id: id }, cambios, { _pendiente: estado.pendiente });
  };
  DB.borrarIdea = async function (id) {
    await escribirConCola("ideas", "delete", null, id);
  };

  // ---- notas ----
  DB.listarNotas = async function () {
    var r = await SB.from("notas").select("*").order("created_at");
    if (r.error) throw r.error;
    return r.data;
  };
  DB.crearNota = async function (datos) {
    var fila = Object.assign({ id: uuid() }, datos);
    var estado = await escribirConCola("notas", "insert", fila);
    return Object.assign({}, fila, { _pendiente: estado.pendiente });
  };
  DB.borrarNota = async function (id) {
    await escribirConCola("notas", "delete", null, id);
  };

  // ---- etiquetas ----
  DB.listarEtiquetas = async function () {
    var r = await SB.from("etiquetas").select("*").order("nombre");
    if (r.error) throw r.error;
    return r.data;
  };
  DB.crearEtiqueta = async function (nombre) {
    var fila = { id: uuid(), nombre: nombre };
    var estado = await escribirConCola("etiquetas", "insert", fila);
    return Object.assign({}, fila, { _pendiente: estado.pendiente });
  };
  DB.renombrarEtiqueta = async function (id, nombre) {
    await escribirConCola("etiquetas", "update", null, id, { nombre: nombre });
  };
  DB.borrarEtiqueta = async function (id) {
    await escribirConCola("etiquetas", "delete", null, id);
  };

  // ---- idea_etiquetas ----
  DB.listarIdeaEtiquetas = async function () {
    var r = await SB.from("idea_etiquetas").select("*");
    if (r.error) throw r.error;
    return r.data;
  };
  DB.etiquetarIdea = async function (ideaId, etiquetaId) {
    var fila = { idea_id: ideaId, etiqueta_id: etiquetaId };
    await escribirConCola("idea_etiquetas", "insert", fila);
  };
  DB.desetiquetarIdea = async function (ideaId, etiquetaId) {
    try {
      var r = await SB.from("idea_etiquetas").delete().eq("idea_id", ideaId).eq("etiqueta_id", etiquetaId);
      if (r.error) throw r.error;
    } catch (e) {
      // caso raro offline: no hay id propio para encolar un delete por pk compuesta,
      // así que se resuelve al vuelo en el próximo intento de listarIdeaEtiquetas()
    }
  };

  // ---- nexos ----
  DB.listarNexos = async function () {
    var r = await SB.from("nexos").select("*");
    if (r.error) throw r.error;
    return r.data;
  };
  DB.crearNexo = async function (ideaIdA, ideaIdB) {
    var fila = { id: uuid(), idea_id_a: ideaIdA, idea_id_b: ideaIdB };
    var estado = await escribirConCola("nexos", "insert", fila);
    return Object.assign({}, fila, { _pendiente: estado.pendiente });
  };
  DB.borrarNexo = async function (id) {
    await escribirConCola("nexos", "delete", null, id);
  };

  DB.colaPendiente = function () { return leerCola(); };

  window.DB = DB;
})();
```

- [ ] **Step 2: Verificación manual**

Con el servidor local corriendo y ya desbloqueada la app, en la consola del navegador:

```js
DB.crearIdea({ titulo: "Prueba desde consola", categoria_id: (await DB.listarCategorias())[0].id })
  .then(function (idea) { console.log(idea); return DB.listarIdeas(); })
  .then(function (ideas) { console.log(ideas.length, "ideas"); });
```

Confirmar que aparece la nueva fila en el `Table Editor` de Supabase. Luego, con las herramientas de red del navegador puestas en "Offline": repetir `DB.crearIdea(...)`, comprobar que la promesa se resuelve igualmente (con `_pendiente: true`) y que `DB.colaPendiente().length` es `1`; volver a poner la red "Online" y comprobar (esperando unos segundos, o disparando manualmente `window.dispatchEvent(new Event("online"))`) que `DB.colaPendiente().length` vuelve a `0` y la fila aparece en Supabase.

- [ ] **Step 3: Commit**

```bash
git add db.js
git commit -m "feat: capa de datos con cola offline"
```

---
