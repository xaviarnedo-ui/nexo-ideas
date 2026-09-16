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

## Task 5: Estado global y tiempo real (`state.js`)

**Files:**
- Create: `state.js`

**Interfaces:**
- Consumes: `DB.listarCategorias/listarIdeas/listarNotas/listarEtiquetas/listarIdeaEtiquetas/listarNexos` (Task 4), `window.NEXO_DB` (Task 3), evento `document` `"nexo:unlocked"` (Task 3).
- Produces (`window.STATE`, consumido por `capture.js`, `board.js`, `detail.js`, `map.js`, `settings.js`):
  - Arrays en memoria: `STATE.categorias`, `STATE.ideas`, `STATE.notas`, `STATE.etiquetas`, `STATE.ideaEtiquetas`, `STATE.nexos`.
  - `STATE.cargarTodo()` → `Promise<void>`, rellena los arrays de arriba.
  - `STATE.on(fn)` → registra `fn()` para que se llame cada vez que cambia cualquier colección (tras `cargarTodo()` y tras cada evento de Realtime).
  - `STATE.notificar()` → dispara esos mismos listeners a mano; lo usan `capture.js`/`detail.js`/`settings.js` tras aplicar un cambio optimista al array en memoria, para no esperar al viaje de ida y vuelta de Realtime.
  - `STATE.categoriaPorId(id)`, `STATE.ideaPorId(id)`, `STATE.notasDeIdea(ideaId)`, `STATE.etiquetasDeIdea(ideaId)`, `STATE.nexosDeIdea(ideaId)` (esta última devuelve las **ideas** conectadas, no los `nexos` en crudo).
  - Evento `document` `"nexo:estado-listo"`, disparado una vez tras el primer `cargarTodo()` — señal para que `app.js` (Task 6) monte las vistas.

- [ ] **Step 1: Write `state.js`**

```js
/* NEXO Ideas — estado en memoria + tiempo real. Vuelve a pedir la tabla
   entera en cada evento de Realtime (dataset pequeño, de un usuario) en
   vez de aplicar parches incrementales — más simple y sin bugs de sync. */
(function () {
  "use strict";

  var listeners = [];
  var listo = false;

  var STATE = {
    categorias: [], ideas: [], notas: [], etiquetas: [], ideaEtiquetas: [], nexos: []
  };

  function notificar() {
    listeners.forEach(function (fn) { fn(); });
  }

  STATE.on = function (fn) { listeners.push(fn); };
  // expuesto para que capture.js/detail.js/settings.js puedan aplicar un
  // cambio optimista al array en memoria y re-renderizar sin esperar al
  // viaje de ida y vuelta de Realtime
  STATE.notificar = notificar;

  STATE.cargarTodo = async function () {
    var r = await Promise.all([
      DB.listarCategorias(), DB.listarIdeas(), DB.listarNotas(),
      DB.listarEtiquetas(), DB.listarIdeaEtiquetas(), DB.listarNexos()
    ]);
    STATE.categorias = r[0]; STATE.ideas = r[1]; STATE.notas = r[2];
    STATE.etiquetas = r[3]; STATE.ideaEtiquetas = r[4]; STATE.nexos = r[5];
    notificar();
    if (!listo) { listo = true; document.dispatchEvent(new CustomEvent("nexo:estado-listo")); }
  };

  var RECARGA = {
    categorias: function () { return DB.listarCategorias().then(function (d) { STATE.categorias = d; }); },
    ideas: function () { return DB.listarIdeas().then(function (d) { STATE.ideas = d; }); },
    notas: function () { return DB.listarNotas().then(function (d) { STATE.notas = d; }); },
    etiquetas: function () { return DB.listarEtiquetas().then(function (d) { STATE.etiquetas = d; }); },
    idea_etiquetas: function () { return DB.listarIdeaEtiquetas().then(function (d) { STATE.ideaEtiquetas = d; }); },
    nexos: function () { return DB.listarNexos().then(function (d) { STATE.nexos = d; }); }
  };

  function suscribirTiempoReal() {
    var canal = window.NEXO_DB.channel("nexo-ideas-cambios");
    Object.keys(RECARGA).forEach(function (tabla) {
      canal.on("postgres_changes", { event: "*", schema: "public", table: tabla }, function () {
        RECARGA[tabla]().then(notificar);
      });
    });
    canal.subscribe();
  }

  STATE.categoriaPorId = function (id) {
    return STATE.categorias.find(function (c) { return c.id === id; });
  };
  STATE.ideaPorId = function (id) {
    return STATE.ideas.find(function (i) { return i.id === id; });
  };
  STATE.notasDeIdea = function (ideaId) {
    return STATE.notas.filter(function (n) { return n.idea_id === ideaId; });
  };
  STATE.etiquetasDeIdea = function (ideaId) {
    var ids = STATE.ideaEtiquetas.filter(function (e) { return e.idea_id === ideaId; }).map(function (e) { return e.etiqueta_id; });
    return STATE.etiquetas.filter(function (t) { return ids.indexOf(t.id) !== -1; });
  };
  STATE.nexosDeIdea = function (ideaId) {
    return STATE.nexos
      .filter(function (n) { return n.idea_id_a === ideaId || n.idea_id_b === ideaId; })
      .map(function (n) { return STATE.ideaPorId(n.idea_id_a === ideaId ? n.idea_id_b : n.idea_id_a); })
      .filter(Boolean);
  };

  document.addEventListener("nexo:unlocked", function () {
    STATE.cargarTodo();
    suscribirTiempoReal();
  });

  window.STATE = STATE;
})();
```

- [ ] **Step 2: Verificación manual**

Recargar la app desbloqueada; en consola: `STATE.ideas.length` debe ser `15` (las sembradas) más cualquiera creada en el Task 4. Abrir el `Table Editor` de Supabase en otra pestaña, editar a mano el `titulo` de una idea, y comprobar (sin recargar la app) que en unos segundos `STATE.ideaPorId("<ese id>").titulo` ya refleja el cambio — confirma que Realtime funciona de verdad.

- [ ] **Step 3: Commit**

```bash
git add state.js
git commit -m "feat: estado global y suscripción a tiempo real"
```

---

## Task 6: Captura rápida (`capture.js`)

**Files:**
- Create: `capture.js`

**Interfaces:**
- Consumes: `STATE.categorias`, `STATE.etiquetas`, `STATE.ideaEtiquetas` + `STATE.notificar()` (Task 5); `DB.crearIdea`, `DB.crearEtiqueta`, `DB.etiquetarIdea` (Task 4); `#btn-capturar`, `#modal-captura`, `#form-captura`, `#captura-titulo`, `#captura-categorias`, `#captura-etiquetas`, `#captura-cancelar` (Task 2).
- Produces: ninguna función pública — es un módulo autocontenido que solo escucha clicks/submits. El patrón "buscar etiqueta existente por nombre o crearla" que define aquí (`etiquetaPorNombreOCrear`) se repite igual en `detail.js` (Task 8).

- [ ] **Step 1: Write `capture.js`**

```js
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
```

- [ ] **Step 2: Verificación manual**

Con la app desbloqueada: tocar el "+", escribir un título, dejar la categoría por defecto, añadir `prueba, captura` en etiquetas, Guardar. Confirmar en el `Table Editor` de Supabase que aparecen la fila en `ideas` y las dos filas en `etiquetas`/`idea_etiquetas`. Repetir con las herramientas de red en "Offline": el modal debe cerrarse igual (guardado optimista) y `DB.colaPendiente().length` debe subir.

- [ ] **Step 3: Commit**

```bash
git add capture.js
git commit -m "feat: captura rápida de ideas"
```

---

## Task 7: Tablero (`board.js`)

Patrón de renderizado usado en este y todos los módulos de vista
siguientes (`detail.js`, `map.js`, `settings.js`): cada uno llama
`STATE.on(render)` una vez al cargar el script, así que se vuelve a pintar
solo cada vez que cambian los datos (carga inicial, edición local
optimista, o un evento de Realtime) — `app.js` (Task 11) no necesita saber
nada de renderizado, solo de qué pestaña está visible.

**Files:**
- Create: `board.js`
- Modify: `styles.css` (añade las reglas del tablero al final del archivo)

**Interfaces:**
- Consumes: `STATE.categorias`, `STATE.ideas`, `STATE.etiquetas`, `STATE.etiquetasDeIdea`, `STATE.notasDeIdea`, `STATE.on` (Task 5); `Detalle.abrir(ideaId)` (Task 8 — se escribe antes de que exista, ver nota abajo); `#vista-tablero` (Task 2).
- Produces: `window.Tablero.render()` (sin más consumidores previstos; se expone por consistencia con el resto de módulos de vista).

**Nota de orden:** este módulo llama a `Detalle.abrir(...)`, que se define en el Task 8. Como es una llamada dentro de un manejador de click (no en tiempo de carga del script), el orden de los `<script>` no importa — `Detalle` ya existe en el objeto `window` para cuando el usuario llega a tocar una tarjeta.

- [ ] **Step 1: Write `board.js`**

```js
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
```

- [ ] **Step 2: Append to `styles.css`**

```css

/* ---- Tablero ---- */
.tablero-barra { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; margin-bottom: 1rem; }
.tablero-barra input[type="search"] {
  padding: .5rem .8rem; border: 1px solid var(--border); border-radius: 8px; min-width: 200px;
}
.tablero-columnas { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; align-items: start; }
.tablero-columna {
  background: var(--bg-elevated); border: 1px solid var(--border); border-top: 3px solid var(--col-accent);
  border-radius: var(--radius); padding: .9rem; display: flex; flex-direction: column; gap: .5rem;
}
.tablero-columna h3 { font-size: .95rem; color: var(--text-muted); font-family: var(--font-mono); font-weight: 500; text-transform: uppercase; letter-spacing: .02em; }
.tarjeta-idea {
  display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; text-align: left;
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: .6rem .7rem;
  width: 100%;
}
.tarjeta-titulo { font-weight: 600; flex: 1; }
.tarjeta-pendiente { font-size: .8rem; }
.tarjeta-etiquetas { display: flex; gap: .3rem; flex-wrap: wrap; width: 100%; }
.mini-etiqueta { font-family: var(--font-mono); font-size: .72rem; color: var(--text-muted); background: var(--border); border-radius: 4px; padding: .1rem .4rem; }
```

- [ ] **Step 3: Verificación manual**

Recargar la app: deben verse las 5 columnas con las 15 ideas sembradas repartidas, cada una con su punto de estado gris (todas "suelta" en el seed) y, en "Sin límites (Peter Attia)", la etiqueta "sueño". Escribir "glucosa" en el buscador → solo debe quedar visible "Picos de glucosa" (y cualquier otra que la mencione). Tocar la etiqueta "insulina" → solo deben quedar las ideas etiquetadas con ella. Tocar una tarjeta no debe dar error en consola aunque `detail.js` no exista todavía (el Task 8 define `Detalle`; hasta entonces se verá un error de `Detalle is not defined` al hacer click, que es esperado y se resuelve en el siguiente task).

- [ ] **Step 4: Commit**

```bash
git add board.js styles.css
git commit -m "feat: vista Tablero con búsqueda y filtro por etiqueta"
```

---

## Task 8: Panel de detalle (`detail.js`)

**Files:**
- Create: `detail.js`
- Modify: `styles.css` (añade las reglas del panel al final del archivo; sobreescribe `.panel` con `display:flex` — el cascade CSS hace que la regla añadida después gane sobre la del Task 2, que no tenía layout de columna)

**Interfaces:**
- Consumes: `STATE.ideaPorId`, `STATE.categorias`, `STATE.etiquetasDeIdea`, `STATE.notasDeIdea`, `STATE.nexosDeIdea`, `STATE.notificar`, `STATE.on` (Task 5); `DB.actualizarIdea`, `DB.borrarIdea`, `DB.crearEtiqueta`, `DB.etiquetarIdea`, `DB.desetiquetarIdea`, `DB.crearNota`, `DB.borrarNota`, `DB.crearNexo`, `DB.borrarNexo` (Task 4); `#panel-detalle` (Task 2).
- Produces: `window.Detalle.abrir(ideaId)` (consumido por `board.js`, Task 7, y `map.js`, Task 9) y `window.Detalle.cerrar()`.

- [ ] **Step 1: Write `detail.js`**

```js
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

  function render() {
    if (!ideaActualId) return;
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
```

- [ ] **Step 2: Append to `styles.css`**

```css

/* ---- Panel de detalle ---- */
.panel { display: flex; flex-direction: column; gap: .3rem; }
.panel-cerrar { border: none; background: transparent; font-size: 1.1rem; align-self: flex-end; color: var(--text-muted); }
.panel-titulo { font-family: var(--font-title); font-size: 1.3rem; font-weight: 600; border: none; border-bottom: 1px solid var(--border); padding: .3rem 0; margin-bottom: .6rem; width: 100%; }
.panel select, .panel textarea { width: 100%; padding: .5rem .6rem; border: 1px solid var(--border); border-radius: 8px; margin-bottom: .6rem; }
.panel-seccion { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); }
.panel-seccion h3 { font-family: var(--font-mono); font-size: .8rem; text-transform: uppercase; letter-spacing: .03em; color: var(--text-muted); font-weight: 500; }
.nota-item { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: .6rem; margin-bottom: .5rem; }
.nota-fuente { font-family: var(--font-mono); font-size: .75rem; color: var(--text-muted); margin: .3rem 0 0; }
.nota-borrar { background: none; border: none; color: var(--accent-investigacion); font-size: .75rem; padding: .2rem 0; }
.nota-form { display: flex; flex-direction: column; gap: .4rem; margin-top: .6rem; }
.nota-form button { align-self: flex-start; padding: .4rem .8rem; border-radius: 8px; border: 1px solid var(--border); background: var(--text); color: #fff; }
.panel-borrar-idea { margin-top: 1.4rem; background: none; border: 1px solid var(--accent-investigacion); color: var(--accent-investigacion); border-radius: 8px; padding: .5rem .8rem; }
```

- [ ] **Step 3: Verificación manual**

Tocar la tarjeta "Sin límites (Peter Attia)" en el tablero: el panel debe abrirse con sus 2 notas (sueño/insulina, sueño/cardiovascular) y su etiqueta "sueño". Cambiar el estado a "Validada" → el punto de color de la tarjeta en el tablero debe cambiar a verde sin recargar la página. Enlazar con "Picos de glucosa" → debe aparecer en Nexos de ambas ideas. Añadir una nota nueva con fuente → debe aparecer en la lista al instante. Borrar la idea de prueba creada en el Task 6 (si sigue existiendo) y confirmar que desaparece del tablero.

- [ ] **Step 4: Commit**

```bash
git add detail.js styles.css
git commit -m "feat: panel de detalle con notas y nexos"
```

---

## Task 9: Mapa de nodos (`map.js`)

Layout radial determinista en SVG puro (sin librería de grafos): nodo
central "NEXO", las 5 categorías repartidas en círculo a su alrededor, y
las ideas de cada categoría en un pequeño arco alrededor de su nodo de
categoría. Los nexos explícitos se dibujan como líneas discontinuas extra
entre nodos de idea, encima de las líneas implícitas de categoría.

**Files:**
- Create: `map.js`
- Modify: `styles.css` (añade las reglas del mapa al final del archivo)

**Interfaces:**
- Consumes: `STATE.categorias`, `STATE.ideas`, `STATE.nexos`, `STATE.categoriaPorId`, `STATE.on` (Task 5); `Detalle.abrir(ideaId)` (Task 8); `#vista-mapa` (Task 2).
- Produces: `window.MapaVista.render()` (mismo patrón de exposición que `board.js`).

- [ ] **Step 1: Write `map.js`**

```js
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
```

- [ ] **Step 2: Append to `styles.css`**

```css

/* ---- Mapa ---- */
#vista-mapa { background: #0f1115; border-radius: var(--radius); margin: -1.2rem; padding: 1.2rem; min-height: calc(100vh - 130px); }
.mapa-svg { width: 100%; height: auto; display: block; }
.mapa-nodo:hover circle { filter: brightness(1.3); }
```

- [ ] **Step 3: Verificación manual**

Tocar la pestaña "Mapa" (aunque `app.js` del Task 11 todavía no la active — para probar antes de tiempo, quitar a mano el atributo `hidden` de `#vista-mapa` en las devtools): debe verse el nodo "NEXO" en el centro, 5 nodos de categoría alrededor con su color, las ideas como puntos pequeños del mismo color colgando de cada categoría, y la línea discontinua clara entre "Picos de glucosa" ↔ "Sensibilidad a la insulina..." ↔ "Sin límites (Peter Attia)" (los nexos sembrados en el Task 1). Pasar el ratón por un nodo de idea debe mostrar su título como tooltip nativo; tocarlo debe abrir el panel de detalle.

- [ ] **Step 4: Commit**

```bash
git add map.js styles.css
git commit -m "feat: vista Mapa de nodos"
```

---

## Task 10: Ajustes — categorías y etiquetas (`settings.js`)

**Files:**
- Create: `settings.js`
- Modify: `styles.css` (añade las reglas de ajustes al final del archivo)

**Interfaces:**
- Consumes: `STATE.categorias`, `STATE.etiquetas`, `STATE.ideaEtiquetas`, `STATE.notificar`, `STATE.on` (Task 5); `DB.actualizarCategoria`, `DB.crearCategoria`, `DB.renombrarEtiqueta`, `DB.borrarEtiqueta`, `DB.etiquetarIdea`, `DB.desetiquetarIdea` (Task 4); `#vista-ajustes` (Task 2).
- Produces: `window.Ajustes.render()` (mismo patrón que `board.js`/`map.js`).

- [ ] **Step 1: Write `settings.js`**

```js
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
```

- [ ] **Step 2: Append to `styles.css`**

```css

/* ---- Ajustes ---- */
.ajustes-seccion { margin-bottom: 1.6rem; }
.ajustes-seccion h3 { font-family: var(--font-mono); font-size: .85rem; text-transform: uppercase; letter-spacing: .03em; color: var(--text-muted); font-weight: 500; margin-bottom: .6rem; }
.ajustes-fila { display: flex; align-items: center; gap: .5rem; margin-bottom: .5rem; }
.ajustes-fila input[type="text"] { flex: 1; padding: .4rem .6rem; border: 1px solid var(--border); border-radius: 6px; }
.ajustes-fila select { padding: .4rem .6rem; border: 1px solid var(--border); border-radius: 6px; }
.ajustes-orden { width: 60px !important; flex: none !important; }
.ajustes-fila button { padding: .4rem .7rem; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--accent-investigacion); }
.ajustes-nueva { display: flex; gap: .5rem; margin-top: .8rem; }
.ajustes-nueva input[type="text"] { flex: 1; padding: .4rem .6rem; border: 1px solid var(--border); border-radius: 6px; }
.ajustes-nueva button { padding: .4rem .8rem; border-radius: 6px; border: none; background: var(--text); color: #fff; }
```

- [ ] **Step 3: Verificación manual**

En la pestaña Ajustes (quitar `hidden` a mano en devtools si `app.js` aún no existe): renombrar una categoría → debe reflejarse en el Tablero. Cambiar su color → las tarjetas y el Mapa deben usar el nuevo color. Crear la etiqueta "prueba-fusión" desde una idea (panel de detalle), luego en Ajustes fusionarla con "sueño" → debe desaparecer de la lista de etiquetas y la idea debe quedarse con "sueño" en su lugar. Borrar esa idea de prueba para dejar limpios los datos de ejemplo.

- [ ] **Step 4: Commit**

```bash
git add settings.js styles.css
git commit -m "feat: ajustes de categorías y etiquetas"
```

---

## Task 11: Arranque de la app y navegación (`app.js`)

Gracias a que cada módulo de vista se auto-registra con `STATE.on(render)`
(Tasks 7–10), `app.js` no necesita saber nada de renderizado ni de carga de
datos — solo decide qué `.view` está visible. Esta es también la primera
vez que todas las piezas están juntas, así que el paso de verificación de
este task es un recorrido completo de la app, de punta a punta.

**Files:**
- Create: `app.js`

**Interfaces:**
- Consumes: `.tab[data-view]`, `.view[data-view]` (Task 2).
- Produces: nada consumido por otro módulo — es el punto de entrada final.

- [ ] **Step 1: Write `app.js`**

```js
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
})();
```

- [ ] **Step 2: Verificación manual — recorrido completo**

Con `python3 -m http.server 4610` y la app ya desbloqueada:

1. Pestañas: click en "Mapa" → se oculta el Tablero y se ve el grafo; click en "Ajustes" → se ven categorías/etiquetas; click en "Tablero" → vuelve. En todo momento debe haber exactamente una vista visible.
2. Captura: crear una idea nueva desde el botón "+" → aparece de inmediato en su columna del Tablero y como nodo nuevo en el Mapa.
3. Detalle: abrirla, subir su estado a "Validada" → el punto de la tarjeta se pone verde sin recargar.
4. Buscador y filtro por etiqueta del Tablero siguen funcionando con los datos reales (no solo los de prueba del Task 4/6).
5. Offline: red en "Offline" en devtools, capturar una idea → se guarda igual (optimista) y `DB.colaPendiente().length` sube; red "Online" → baja sola a `0` en segundos y la idea queda en Supabase.
6. Recargar la página entera: la contraseña ya no se pide (persistida), y todos los datos siguen ahí.
7. Borrar la idea de prueba para dejar la base solo con los datos semilla + lo que Xavi quiera conservar.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: arranque de la app y navegación entre vistas"
```

---

## Task 12: Acceso de Claude (`nexo_cli.py`) y README

Sin dependencias de pip (solo la librería estándar) para no añadir un paso
de instalación — coherente con el espíritu "sin build tools" del resto del
proyecto.

**Files:**
- Create: `nexo_cli.py`
- Create: `.env.example`
- Create: `README.md`

**Interfaces:**
- Consumes: `SUPABASE_URL` y `SUPABASE_ANON_KEY` desde `.env` (mismos valores que Task 1/3, copiados a mano por Xavi).
- Produces: comandos de terminal (`listar`/`crear`/`actualizar`/`borrar`) que Claude usa en sesiones futuras para leer y editar `categorias`, `ideas`, `notas`, `etiquetas`, `idea_etiquetas` y `nexos` directamente contra Supabase — ninguna otra tarea del plan depende de esto, es el punto de entrada para trabajo *posterior* al plan.

- [ ] **Step 1: Write `nexo_cli.py`**

```python
#!/usr/bin/env python3
"""CLI para que Claude lea/escriba la base de datos de NEXO Ideas desde
sesiones de Claude Code, sin pasar por la interfaz web. Solo librería
estándar (sin pip install). Lee SUPABASE_URL y SUPABASE_ANON_KEY de .env
(junto a este script).

Uso:
  python3 nexo_cli.py listar ideas
  python3 nexo_cli.py crear ideas '{"titulo":"...", "categoria_id":"..."}'
  python3 nexo_cli.py actualizar ideas <id> '{"estado":"validada"}'
  python3 nexo_cli.py borrar notas <id>
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ORDEN = {"categorias": "orden", "ideas": "created_at", "notas": "created_at", "nexos": "created_at"}


def leer_env():
    ruta = Path(__file__).parent / ".env"
    valores = {}
    for linea in ruta.read_text().splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, _, valor = linea.partition("=")
        valores[clave.strip()] = valor.strip()
    return valores


ENV = leer_env()
BASE = ENV["SUPABASE_URL"].rstrip("/") + "/rest/v1"
HEADERS = {
    "apikey": ENV["SUPABASE_ANON_KEY"],
    "Authorization": "Bearer " + ENV["SUPABASE_ANON_KEY"],
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def peticion(metodo, ruta, cuerpo=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(BASE + ruta, data=datos, method=metodo, headers=HEADERS)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        sys.exit("Error " + str(e.code) + ": " + e.read().decode())


def listar(tabla):
    ruta = "/" + tabla + "?select=*"
    if ORDEN.get(tabla):
        ruta += "&order=" + ORDEN[tabla]
    return peticion("GET", ruta)


def crear(tabla, cuerpo):
    return peticion("POST", "/" + tabla, cuerpo)


def actualizar(tabla, id_, cambios):
    return peticion("PATCH", "/" + tabla + "?id=eq." + id_, cambios)


def borrar(tabla, id_):
    return peticion("DELETE", "/" + tabla + "?id=eq." + id_)


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    accion, tabla = sys.argv[1], sys.argv[2]
    if accion == "listar":
        resultado = listar(tabla)
    elif accion == "crear":
        resultado = crear(tabla, json.loads(sys.argv[3]))
    elif accion == "actualizar":
        resultado = actualizar(tabla, sys.argv[3], json.loads(sys.argv[4]))
    elif accion == "borrar":
        resultado = borrar(tabla, sys.argv[3])
    else:
        sys.exit(__doc__)
    print(json.dumps(resultado, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Write `.env.example`**

```
# Copia este archivo a .env (que NO se sube al repo) para que nexo_cli.py
# pueda leer/escribir la base de datos desde sesiones de Claude Code.
# Mismos valores que en supabase-client.js (Task 3, Settings -> API).
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

- [ ] **Step 3: Write `README.md`**

```markdown
# NEXO Ideas

Espacio personal de Xavi para capturar, organizar y conectar las ideas de
su consulta de PNI. PWA (HTML+CSS+JS, sin build tools) con Supabase como
base de datos real — se escribe y se lee desde cualquier dispositivo al
instante. Ver el diseño completo en
[docs/superpowers/specs/2026-09-16-nexo-ideas-design.md](docs/superpowers/specs/2026-09-16-nexo-ideas-design.md).

## Primer arranque

1. Crear el proyecto en [supabase.com](https://supabase.com) y ejecutar
   `supabase/schema.sql` y `supabase/seed.sql` en el SQL Editor.
2. Pegar `SUPABASE_URL` y la `anon key` (Settings → API) en
   `supabase-client.js`.
3. Elegir una contraseña, calcular su hash SHA-256 (instrucciones en
   `auth-gate.js`) y pegarlo en `PASSWORD_HASH`.
4. `python3 -m http.server 4610` y abrir `http://localhost:4610/index.html`.

## Publicar (una vez)

```bash
gh repo create nexo-ideas --public --source=. --remote=origin --push
gh api -X POST repos/xaviarnedo-ui/nexo-ideas/pages -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/'
```

URL: `https://xaviarnedo-ui.github.io/nexo-ideas/`. GitHub Pages tarda
~1 min en actualizarse tras cada `git push`. Si tocas `styles.css` o algún
`.js`, sube también el `?v=N` en `index.html` y el `CACHE` de `sw.js`.

## Acceso de Claude a los datos

```bash
cp .env.example .env   # una vez, con tus credenciales reales
python3 nexo_cli.py listar ideas
python3 nexo_cli.py crear notas '{"idea_id":"...", "contenido":"..."}'
python3 nexo_cli.py actualizar ideas <id> '{"estado":"en_desarrollo"}'
```

## Estructura de archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Estructura de la página (gate, tablero/mapa/ajustes, modal de captura, panel de detalle) |
| `styles.css` | Sistema visual (tokens, todos los componentes) |
| `supabase-client.js` | Cliente Supabase (URL + anon key) |
| `auth-gate.js` | Pantalla de contraseña |
| `db.js` | Acceso a datos sobre Supabase + cola offline |
| `state.js` | Estado en memoria + suscripción a Supabase Realtime |
| `capture.js` | Botón flotante y modal de captura rápida |
| `board.js` | Vista Tablero (búsqueda, filtro por etiqueta) |
| `detail.js` | Panel de detalle (editar, notas, nexos) |
| `map.js` | Vista Mapa (grafo radial en SVG) |
| `settings.js` | Ajustes de categorías y etiquetas |
| `app.js` | Arranque y navegación entre pestañas |
| `supabase/schema.sql`, `supabase/seed.sql` | Esquema y datos de ejemplo (se ejecutan a mano en Supabase) |
| `nexo_cli.py`, `.env.example` | Acceso de Claude a los datos desde la terminal |
| `manifest.json`, `sw.js`, `icons/`, `gen_icons.py` | PWA |
```

- [ ] **Step 4: Xavi copia y rellena `.env`**

```bash
cp .env.example .env
```

Rellenar con los mismos valores ya pegados en `supabase-client.js`.

- [ ] **Step 5: Verificación manual**

```bash
python3 nexo_cli.py listar categorias
```

Debe imprimir las 5 categorías sembradas como JSON. Probar también
`crear`/`actualizar`/`borrar` sobre una idea de prueba y confirmar el
cambio en el `Table Editor` de Supabase.

- [ ] **Step 6: Commit**

```bash
git add nexo_cli.py .env.example README.md
git commit -m "docs: README y acceso de Claude por CLI"
```

---

## Task 13: Publicar en GitHub Pages

**Esta tarea crea un repositorio público y lo publica en una URL real —
antes de ejecutar `gh repo create ... --public` o el comando de Pages, el
ejecutor (Claude o Xavi) debe pedir confirmación explícita, incluso si el
resto del plan ya se ha ejecutado sin pausas.** No es una acción reversible
sin esfuerzo (cambia de nombre/borra un repo, gestiona quién lo ve), y cae
dentro de "publicar contenido público" — no de "regular".

**Files:** ninguno nuevo — esta tarea ejecuta comandos, no escribe código.

**Interfaces:** ninguna — es el último paso, no lo consume nada más.

- [ ] **Step 1: Confirmar con Xavi antes de continuar**

Antes de ejecutar el paso 2, preguntar explícitamente: "¿Creo el repositorio
público `nexo-ideas` en GitHub y lo publico en Pages?" y esperar un sí claro.

- [ ] **Step 2: Crear el repo y publicar**

```bash
cd ~/Desktop/nexo-ideas
gh repo create nexo-ideas --public --source=. --remote=origin --push
gh api -X POST repos/xaviarnedo-ui/nexo-ideas/pages -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/'
```

- [ ] **Step 3: Verificación manual**

Esperar ~1 minuto y abrir `https://xaviarnedo-ui.github.io/nexo-ideas/` en
el navegador (o añadirla a la pantalla de inicio del móvil): debe pedir la
contraseña real elegida en el Task 3 y, tras entrarla, mostrar el mismo
tablero que en local. Confirmar que capturar una idea desde el móvil (con
datos móviles, no wifi de casa) también se guarda — es la prueba real del
caso de uso "se me ocurre algo en la calle".

- [ ] **Step 4: Actualizar README**

Añadir la URL real de producción al principio de `README.md`, sustituyendo
cualquier mención genérica.

```bash
git add README.md
git commit -m "docs: URL de producción"
git push
```

