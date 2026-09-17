-- NEXO Ideas — fotos adjuntas a una idea (tabla + bucket de almacenamiento)
create table fotos (
  id           uuid primary key default gen_random_uuid(),
  idea_id      uuid not null references ideas(id) on delete cascade,
  storage_path text not null,
  created_at   timestamptz not null default now()
);

alter table fotos enable row level security;
create policy "anon_full_access" on fotos for all using (true) with check (true);

alter publication supabase_realtime add table fotos;

-- Bucket público: la lectura no pasa por RLS (misma lógica de seguridad
-- que el resto de la app — protegido por la contraseña de la interfaz,
-- no por el propio almacenamiento). Necesario para poder subir/leer/borrar
-- desde el cliente con la anon key.
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;

create policy "fotos_bucket_insert" on storage.objects
  for insert with check (bucket_id = 'fotos');
create policy "fotos_bucket_select" on storage.objects
  for select using (bucket_id = 'fotos');
create policy "fotos_bucket_delete" on storage.objects
  for delete using (bucket_id = 'fotos');
