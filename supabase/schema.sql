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
