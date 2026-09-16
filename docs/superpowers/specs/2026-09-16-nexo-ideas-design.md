# NEXO Ideas — diseño

**Fecha:** 2026-09-16
**Estado:** aprobado por Xavi, pendiente de plan de implementación

## Propósito

Espacio personal (mono-usuario) para que Xavi vaya capturando, sin fricción,
las ideas, conceptos y referencias que va generando para su consulta de
Psiconeuroinmunología (PNI) bajo la marca NEXO (ver `nexo-marca` en la
memoria de Claude). No es una app para clientes ni gestiona seguimiento de
terceros — es la base de conocimiento sobre la que luego se construye el
programa/servicio real.

Flujo de trabajo previsto: Xavi captura ideas sueltas en el momento
(móvil o escritorio); en sesiones de Claude Code posteriores, Claude lee y
organiza esa misma base de datos (fusiona duplicados, sugiere nexos, redacta
mejor una idea, añade notas de libros/estudios que Xavi le pase) — sin copia
intermedia, es la misma base de datos en todo momento.

## Fuera de alcance

Gestión de clientes, seguimiento de hábitos de terceros, calendarios de
citas — todo eso es un proyecto aparte y futuro. Tampoco hay sistema de
usuarios múltiples ni backend de autenticación completo.

## Arquitectura

PWA en HTML/CSS/JS vanilla (sin build tools ni framework), mismo patrón que
`~/Desktop/carga-gps`. Persistencia en **Supabase** (Postgres), usado como
base de datos real con lectura/escritura desde cualquier dispositivo vía
`supabase-js` por CDN — a diferencia de carga-gps, donde Supabase solo mueve
notificaciones y los datos viajan como `data.js` estático regenerado a mano.

- **Proyecto Supabase propio y nuevo** (no reutilizar el de carga-gps —
  son datos de naturaleza distinta). Requiere que Xavi cree el proyecto en
  supabase.com (paso manual, no automatizable) y pegue URL + `anon key` en
  un `.env` local que **no se sube a git** (mismo patrón que
  `carga-gps/.env.example`).
- **Hosting:** sitio estático en GitHub Pages, repo público `nexo-ideas`,
  mismo flujo que `carga-gps-jugadores`
  (`https://xaviarnedo-ui.github.io/nexo-ideas/`).
- **Acceso:** pantalla de contraseña simple delante de la app (comprobación
  cliente contra un valor guardado por Xavi, recordada en `localStorage` tras
  la primera vez). Es una puerta de interfaz, no cifrado — la clave de
  Supabase (`anon key`) vive igualmente en el código cliente, como en
  cualquier PWA sin backend propio. Nivel de protección proporcional al
  contenido (ideas de negocio propias, no datos médicos/financieros de
  terceros).
- **RLS de Supabase:** activado en todas las tablas, con una política abierta
  para el rol `anon` (lectura+escritura). El control de acceso real lo hace
  la pantalla de contraseña de la app, no Supabase Auth — decisión
  consciente para mantener "sin login complejo".

## Modelo de datos

```sql
create table categorias (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  color_acento text not null,
  orden       int not null default 0,
  created_at  timestamptz not null default now()
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
  fuente_ref    text,   -- página, o cita bibliográfica (revista/año/DOI)
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
```

Notas de diseño:
- `notas` cubre a la vez pasajes de libro (con página) y hallazgos de
  investigación (con referencia bibliográfica) con los mismos campos
  genéricos — no hace falta un esquema distinto por categoría.
- `nexos` es una relación simple sin dirección ni tipo en esta v1. Si más
  adelante Xavi quiere decir *por qué* están conectadas dos ideas, se añade
  una columna `nota` a esta tabla sin romper nada existente.
- `updated_at` de `ideas` se mantiene con un trigger estándar de Postgres
  (`before update ... set updated_at = now()`), a definir en la migración.
- Colores de acento por categoría: paleta accesible y distinta por
  categoría, a definir en la fase de implementación siguiendo la guía de la
  skill `dataviz` para colores categóricos consistentes entre el tablero y
  el mapa de nodos.

## Datos de ejemplo a precargar (seed)

**Categorías** (orden de aparición = el pedido por Xavi):
Objetivos y herramientas · Conceptos clave · Referentes · Libros ·
Investigación/evidencia.

**Ideas + notas de ejemplo**, tal como las dio Xavi:

- *Objetivos y herramientas:* Decatlón con objetivos organizados por franjas
  de edad · Lista de 50 objetivos que el paciente quiera poder hacer a los
  75 años · Cuadro/gráfica del deterioro del VO2max y la masa muscular con
  la edad.
- *Conceptos clave:* Salud mitocondrial y flexibilidad metabólica · Picos de
  glucosa · Ayuno · Suplementación (creatina, omega-3, magnesio) ·
  Beneficios del entrenamiento en zona 2 · Sensibilidad a la insulina según
  el momento del día.
- *Referentes:* Iñigo San Millán · Peter Attia · Odile Fernández.
- *Libros:* "Estimula tu nervio vago" (Antonio Valenzuela) · "Sin límites"
  (Peter Attia), con dos notas: (1) sueño y resistencia a la insulina
  (estudio de Eve Van Cauter), (2) sueño y enfermedad cardiovascular (eje
  cortisol/sistema nervioso simpático y grelina/leptina).
- *Investigación/evidencia:* Revisión sobre PNI en deporte de élite
  (síndrome de sobreentrenamiento, IgA salival, estrés psicológico y riesgo
  de lesión, intervenciones mente-cuerpo, eje intestino-cerebro-inmunidad,
  salud mental e inflamación, sueño, glucemia/picos de glucosa en
  deportistas).

Ejemplo de `nexos` a precargar (para que la vista de mapa no arranque vacía):
"Picos de glucosa" ↔ "Sensibilidad a la insulina según el momento del día" ↔
la nota de sueño/resistencia a la insulina de "Sin límites".

## Pantallas

1. **Captura rápida (omnipresente):** botón "+" flotante visible en
   cualquier pantalla. Abre un formulario mínimo — título (foco automático)
   + categoría (chips) + etiquetas opcionales — y guarda con Enter/botón.
   Sin campos obligatorios extra.
2. **Tablero (pantalla por defecto):** columnas por categoría en escritorio,
   secciones plegables en móvil. Tarjeta de idea = título + punto de color
   de estado (gris/ámbar/verde, mismo semáforo que ya usa Xavi en el
   protocolo NEXO 12 y en carga-gps) + etiquetas. Buscador de texto libre +
   filtro por etiqueta arriba, filtran el tablero al vuelo.
3. **Detalle de idea** (panel lateral en escritorio / pantalla completa en
   móvil): título, categoría, estado, etiquetas editables, cuerpo libre,
   notas/pasajes (con fuente, añadibles ahí mismo), nexos con otras ideas
   (autocompletar para enlazar), timestamps.
4. **Mapa** (vista secundaria): nodo central "NEXO", ramas por categoría con
   su color de acento, hojas = ideas conectadas por sus nexos explícitos.
   Fondo oscuro. Click en un nodo abre el mismo panel de detalle.
5. **Categorías y etiquetas** (ajustes, uso ocasional): renombrar/añadir
   categorías con su color; renombrar/fusionar/borrar etiquetas.

Navegación: barra superior con Tablero / Mapa / Ajustes + botón de captura
flotante siempre visible encima de cualquier pantalla.

## Flujo de datos y manejo de errores

- Captura y ediciones escriben directo contra Supabase desde el cliente.
- **Cola offline:** si el guardado falla (sin red, típicamente al capturar
  en la calle desde el móvil), la idea se guarda en `localStorage` y se
  reintenta sola en cuanto vuelva la conexión — nunca se pierde una idea
  por un fallo de red. Es el caso de uso central de la app, así que este
  comportamiento no es opcional.
- **Actualización en vivo:** suscripción a Supabase Realtime sobre las
  tablas principales, para que un cambio hecho por Claude en una sesión (o
  desde otro dispositivo) aparezca solo en cualquier pestaña abierta, sin
  refrescar.
- Validación mínima: `titulo` y `categoria_id` obligatorios antes de
  guardar una idea; el resto de campos son opcionales en todo momento.

## Acceso de Claude a los datos

Para que Claude pueda leer/organizar la base de datos desde sesiones futuras
de Claude Code en esta misma carpeta: `.env` local (no versionado, mismo
patrón que carga-gps) con `SUPABASE_URL` y una key con permisos de
lectura/escritura (`anon key`, dado que RLS ya es abierto), más un script
Python pequeño (`nexo_cli.py` o similar) que Claude usa para listar, crear,
actualizar y enlazar ideas/notas/etiquetas vía la API REST de Supabase, sin
tener que pasar por la interfaz web. Detalle exacto del script (comandos,
formato de salida) se define en el plan de implementación.

## Testing

Sin suite de tests automatizados — proyecto personal de un usuario, mismo
criterio que carga-gps. Verificación manual en el navegador durante la
implementación (capturar, editar, enlazar, buscar, filtrar, offline/online,
vista de mapa) antes de dar por cerrada cada pantalla.

## Convenciones de proyecto

- Carpeta local: `~/Desktop/nexo-ideas` (ya creada).
- Repo git: `nexo-ideas`, público, publicado con GitHub Pages (mismo flujo
  que `carga-gps-jugadores`, ver `carga-gps/README.md`).
- `.env` fuera de git desde el primer commit (`.gitignore`).

## Pendiente / decisiones futuras

- Xavi debe crear el proyecto Supabase nuevo y pasar sus credenciales
  (paso manual, bloquea la conexión real a datos pero no el resto del
  desarrollo con datos de prueba).
- Paleta de color por categoría — se define en implementación.
- Si en el futuro el contenido se vuelve más sensible, migrar de
  "contraseña simple + RLS abierto" a Supabase Auth real, sin rehacer el
  resto del modelo.
