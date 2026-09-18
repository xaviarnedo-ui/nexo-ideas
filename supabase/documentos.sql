-- NEXO Ideas — documentos (PDFs u otros archivos) adjuntos a una idea.
-- Mismo patrón que fotos.sql: tabla + bucket de almacenamiento público.
create table documentos (
  id           uuid primary key default gen_random_uuid(),
  idea_id      uuid not null references ideas(id) on delete cascade,
  storage_path text not null,
  nombre       text not null,
  created_at   timestamptz not null default now()
);

alter table documentos enable row level security;
create policy "anon_full_access" on documentos for all using (true) with check (true);

alter publication supabase_realtime add table documentos;

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', true)
on conflict (id) do nothing;

create policy "documentos_bucket_insert" on storage.objects
  for insert with check (bucket_id = 'documentos');
create policy "documentos_bucket_select" on storage.objects
  for select using (bucket_id = 'documentos');
create policy "documentos_bucket_delete" on storage.objects
  for delete using (bucket_id = 'documentos');
