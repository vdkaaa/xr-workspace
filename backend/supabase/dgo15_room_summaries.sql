-- supabase/dgo15_room_summaries.sql
-- DGO-15 — Tabla para persistir los resúmenes de sesión generados por Claude.
--
-- Cada fila es un resumen de la actividad de una sala en un momento dado,
-- generado a partir de los session_events (DGO-12).

create table if not exists public.room_summaries (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  generated_by  uuid not null references auth.users(id),
  summary       text not null,
  model         text not null default 'claude-sonnet-4-6',
  -- snapshot de las métricas que alimentaron el prompt (para auditoría/debug)
  context_stats jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- Índice para traer rápido el último resumen de una sala.
create index if not exists idx_room_summaries_room_id
  on public.room_summaries (room_id, created_at desc);

-- RLS: consistente con el resto del proyecto.
-- Las lecturas/escrituras reales pasan por el backend con supabaseAdmin
-- (service_role), que salta RLS; estas políticas cubren el acceso directo.
alter table public.room_summaries enable row level security;

create policy "members_read_summaries"
  on public.room_summaries for select
  using (
    exists (
      select 1 from public.room_members m
      where m.room_id = room_summaries.room_id
        and m.user_id = auth.uid()
    )
  );

create policy "members_insert_summaries"
  on public.room_summaries for insert
  with check (
    exists (
      select 1 from public.room_members m
      where m.room_id = room_summaries.room_id
        and m.user_id = auth.uid()
    )
  );