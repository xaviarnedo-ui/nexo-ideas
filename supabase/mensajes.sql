-- NEXO Ideas — mensajes/peticiones de Xavi a Claude (canal distinto de las
-- ideas: pedir algo, no guardar conocimiento). Claude los revisa cuando
-- Xavi se lo pide en una sesión de Claude Code, no de forma automática.
create table mensajes (
  id            uuid primary key default gen_random_uuid(),
  contenido     text not null,
  estado        text not null default 'pendiente' check (estado in ('pendiente','hecho')),
  respuesta     text,
  created_at    timestamptz not null default now(),
  respondido_at timestamptz
);

alter table mensajes enable row level security;
create policy "anon_full_access" on mensajes for all using (true) with check (true);

alter publication supabase_realtime add table mensajes;
