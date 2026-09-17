# NEXO Ideas

**En producción: https://xaviarnedo-ui.github.io/nexo-ideas/**

Espacio personal de Xavi para capturar, organizar y conectar las ideas de
su consulta de PNI. PWA (HTML+CSS+JS, sin build tools) con Supabase como
base de datos real — se escribe y se lee desde cualquier dispositivo al
instante. Ver el diseño completo en
[docs/superpowers/specs/2026-09-16-nexo-ideas-design.md](docs/superpowers/specs/2026-09-16-nexo-ideas-design.md).

## Primer arranque

1. Crear el proyecto en [supabase.com](https://supabase.com) y ejecutar
   `supabase/schema.sql`, `supabase/seed.sql` y `supabase/fotos.sql` en el
   SQL Editor (este último crea el almacén de imágenes para adjuntar fotos
   a una idea).
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
python3 nexo_cli.py borrar notas <id>
python3 nexo_cli.py desetiquetar <idea_id> <etiqueta_id>
```

`actualizar` y `borrar` filtran por `id`, así que no valen para
`idea_etiquetas`, que usa la clave compuesta (`idea_id`, `etiqueta_id`):
para quitarle una etiqueta a una idea está `desetiquetar`.

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
| `supabase/schema.sql`, `supabase/seed.sql`, `supabase/fotos.sql` | Esquema, datos de ejemplo y almacén de fotos (se ejecutan a mano en Supabase) |
| `nexo_cli.py`, `.env.example` | Acceso de Claude a los datos desde la terminal |
| `manifest.json`, `sw.js`, `icons/`, `gen_icons.py` | PWA |
