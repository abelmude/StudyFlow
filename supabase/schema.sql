-- StudyFlow — database schema.
--
-- Run this once, in the Supabase dashboard under SQL Editor → New query →
-- paste → Run. It is safe to run again; every statement is idempotent.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- What protects a student's data
-- ─────────────────────────────────────────────────────────────────────────────
-- The key the browser carries (the anon key) is public by design — it is in
-- every visitor's page source. It identifies the project, not the person. What
-- actually separates one student's deadlines from another's is Row Level
-- Security, below: Postgres itself refuses to return a row whose user_id is not
-- the signed-in user, and refuses to write one. There is no application code
-- in that path that could forget a WHERE clause.
--
-- Everything here therefore depends on RLS being ENABLED. If it is off, the
-- anon key gives every visitor every row. The last statement in this file
-- checks that and raises if it is not on.

create table if not exists public.student_data (
  -- One row per account. Deleting the auth user takes the data with it, so
  -- "delete my account" cannot leave an orphaned copy behind.
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- The whole diploma as one JSON document. See app/sync.js for why this is
  -- one document rather than normalised tables.
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table  public.student_data is 'One StudyFlow account''s diploma, as a single JSON document.';
comment on column public.student_data.data is 'The app state: profile, subjects, tasks, cas, ee, availability, blocks.';

-- A runaway client, or a pasted-in novel, should not be able to fill the
-- database. A whole diploma is tens of kilobytes; 2MB is generous.
alter table public.student_data
  drop constraint if exists student_data_size;
alter table public.student_data
  add  constraint student_data_size check (pg_column_size(data) < 2 * 1024 * 1024);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.student_data enable row level security;
-- Applies the policies to the table owner too, so a mistake elsewhere cannot
-- quietly bypass them.
alter table public.student_data force row level security;

drop policy if exists "read own data"   on public.student_data;
drop policy if exists "insert own data" on public.student_data;
drop policy if exists "update own data" on public.student_data;
drop policy if exists "delete own data" on public.student_data;

create policy "read own data" on public.student_data
  for select using (auth.uid() = user_id);

-- The WITH CHECK on insert is what stops a signed-in student writing a row
-- under somebody else's user_id.
create policy "insert own data" on public.student_data
  for insert with check (auth.uid() = user_id);

create policy "update own data" on public.student_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "delete own data" on public.student_data
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at is set by the server, not the client
-- ─────────────────────────────────────────────────────────────────────────────
-- Conflict detection compares timestamps. A client with a wrong clock — or one
-- being deliberately unhelpful — must not be able to make its copy look newer,
-- so the value the browser sends is overwritten here.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists student_data_touch on public.student_data;
create trigger student_data_touch
  before insert or update on public.student_data
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Deleting your own account
-- ─────────────────────────────────────────────────────────────────────────────
-- Removing a row from auth.users needs admin rights, which a browser must
-- never have. This function runs as its owner (security definer) but can only
-- ever delete the caller — auth.uid() is taken from the verified JWT and
-- cannot be passed in or spoofed.

create or replace function public.delete_me()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  -- The cascade on student_data.user_id removes the diploma with the user.
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_me() from public, anon;
grant execute on function public.delete_me() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fail loudly rather than silently insecurely
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'student_data' and rowsecurity
  ) then
    raise exception 'student_data does not have row level security enabled — every visitor could read every row.';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'student_data') < 4 then
    raise exception 'student_data is missing policies — expected select, insert, update and delete.';
  end if;
  raise notice 'StudyFlow schema ready: student_data created, RLS on, 4 policies, delete_me() installed.';
end;
$$;
