-- MemoryOn v1 database schema for Supabase PostgreSQL.
-- Firebase Auth remains the v1 identity provider; Supabase is used as the
-- PostgreSQL persistence layer.

create extension if not exists pgcrypto;

create schema if not exists app;

do $$
begin
  create type public.chronicle_source as enum ('caregiver', 'ai');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.session_status as enum ('active', 'ended');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.session_log_role as enum ('ai', 'user');
exception
  when duplicate_object then null;
end $$;

create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

create or replace function app.text_array_within(
  items text[],
  max_items integer,
  max_chars integer
)
returns boolean
language sql
immutable
as $$
  select items is null
    or (
      cardinality(items) <= max_items
      and not exists (
        select 1
        from unnest(items) as item
        where item is null
          or char_length(btrim(item)) = 0
          or char_length(item) > max_chars
      )
    );
$$;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null unique,
  name text not null,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint users_firebase_uid_check
    check (char_length(btrim(firebase_uid)) between 1 and 128),
  constraint users_name_check
    check (char_length(btrim(name)) between 1 and 50),
  constraint users_email_check
    check (char_length(btrim(email)) between 3 and 255 and position('@' in email) > 1)
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  birth_year smallint not null,
  hometown text,
  job text,
  family text,
  memories text[] not null default '{}'::text[],
  hobbies text,
  guardian_name text,
  guardian_relation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_id_user_id_unique unique (id, user_id),
  constraint profiles_name_check
    check (char_length(btrim(name)) between 1 and 50),
  constraint profiles_birth_year_check
    check (birth_year between 1900 and 2006),
  constraint profiles_hometown_check
    check (hometown is null or char_length(hometown) <= 100),
  constraint profiles_job_check
    check (job is null or char_length(job) <= 200),
  constraint profiles_family_check
    check (family is null or char_length(family) <= 500),
  constraint profiles_memories_check
    check (app.text_array_within(memories, 5, 200)),
  constraint profiles_hobbies_check
    check (hobbies is null or char_length(hobbies) <= 200),
  constraint profiles_guardian_name_check
    check (guardian_name is null or char_length(guardian_name) <= 50),
  constraint profiles_guardian_relation_check
    check (guardian_relation is null or char_length(guardian_relation) <= 50)
);

create table public.chronicle_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  user_id uuid not null,
  topic text not null,
  content text not null,
  keywords text[] not null default '{}'::text[],
  source public.chronicle_source not null default 'caregiver',
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chronicle_entries_profile_user_fk
    foreign key (profile_id, user_id)
    references public.profiles(id, user_id)
    on delete cascade,
  constraint chronicle_entries_topic_check
    check (char_length(btrim(topic)) between 1 and 50),
  constraint chronicle_entries_content_check
    check (char_length(btrim(content)) between 1 and 2000),
  constraint chronicle_entries_keywords_check
    check (app.text_array_within(keywords, 20, 50))
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  user_id uuid not null,
  status public.session_status not null default 'active',
  turn_count integer not null default 0,
  duration_seconds integer,
  current_topic text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint sessions_id_profile_id_user_id_unique unique (id, profile_id, user_id),
  constraint sessions_profile_user_fk
    foreign key (profile_id, user_id)
    references public.profiles(id, user_id)
    on delete cascade,
  constraint sessions_turn_count_check
    check (turn_count >= 0),
  constraint sessions_duration_seconds_check
    check (duration_seconds is null or duration_seconds >= 0),
  constraint sessions_current_topic_check
    check (current_topic is null or char_length(current_topic) <= 50),
  constraint sessions_ended_at_check
    check (
      (status = 'active' and ended_at is null)
      or
      (status = 'ended' and ended_at is not null)
    )
);

create table public.session_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  profile_id uuid not null,
  user_id uuid not null,
  turn_index integer not null,
  role public.session_log_role not null,
  content text not null,
  original_content text,
  topic text,
  switch_topic boolean,
  audio_url text,
  audio_expires_at timestamptz,
  duration_ms integer,
  spoken_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint session_logs_session_profile_user_fk
    foreign key (session_id, profile_id, user_id)
    references public.sessions(id, profile_id, user_id)
    on delete cascade,
  constraint session_logs_turn_index_check
    check (turn_index >= 1),
  constraint session_logs_content_check
    check (char_length(btrim(content)) between 1 and 5000),
  constraint session_logs_original_content_check
    check (original_content is null or char_length(btrim(original_content)) between 1 and 5000),
  constraint session_logs_topic_check
    check (topic is null or char_length(topic) <= 50),
  constraint session_logs_duration_ms_check
    check (duration_ms is null or duration_ms >= 0),
  constraint session_logs_correction_role_check
    check (original_content is null or role = 'user')
);

create index idx_users_firebase_uid on public.users(firebase_uid);
create index idx_profiles_user_id on public.profiles(user_id);
create index idx_profiles_user_created_at on public.profiles(user_id, created_at desc);
create index idx_chronicle_entries_profile_recorded_at
  on public.chronicle_entries(profile_id, recorded_at desc);
create index idx_chronicle_entries_user_id on public.chronicle_entries(user_id);
create index idx_sessions_profile_started_at on public.sessions(profile_id, started_at desc);
create index idx_sessions_user_status on public.sessions(user_id, status);
create index idx_session_logs_session_turn on public.session_logs(session_id, turn_index, role);
create index idx_session_logs_user_id on public.session_logs(user_id);
create index idx_session_logs_audio_expires_at
  on public.session_logs(audio_expires_at)
  where audio_expires_at is not null;

create trigger set_users_updated_at
before update on public.users
for each row execute function app.set_updated_at();

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function app.set_updated_at();

create trigger set_chronicle_entries_updated_at
before update on public.chronicle_entries
for each row execute function app.set_updated_at();

create trigger set_sessions_updated_at
before update on public.sessions
for each row execute function app.set_updated_at();

create trigger set_session_logs_updated_at
before update on public.session_logs
for each row execute function app.set_updated_at();

alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.chronicle_entries enable row level security;
alter table public.sessions enable row level security;
alter table public.session_logs enable row level security;

create policy users_select_own
on public.users
for select
using (id = app.current_user_id());

create policy users_update_own
on public.users
for update
using (id = app.current_user_id())
with check (id = app.current_user_id());

create policy profiles_select_own
on public.profiles
for select
using (user_id = app.current_user_id());

create policy profiles_insert_own
on public.profiles
for insert
with check (user_id = app.current_user_id());

create policy profiles_update_own
on public.profiles
for update
using (user_id = app.current_user_id())
with check (user_id = app.current_user_id());

create policy profiles_delete_own
on public.profiles
for delete
using (user_id = app.current_user_id());

create policy chronicle_entries_select_own
on public.chronicle_entries
for select
using (user_id = app.current_user_id());

create policy chronicle_entries_insert_own
on public.chronicle_entries
for insert
with check (user_id = app.current_user_id());

create policy chronicle_entries_update_own
on public.chronicle_entries
for update
using (user_id = app.current_user_id())
with check (user_id = app.current_user_id());

create policy chronicle_entries_delete_own
on public.chronicle_entries
for delete
using (user_id = app.current_user_id());

create policy sessions_select_own
on public.sessions
for select
using (user_id = app.current_user_id());

create policy sessions_insert_own
on public.sessions
for insert
with check (user_id = app.current_user_id());

create policy sessions_update_own
on public.sessions
for update
using (user_id = app.current_user_id())
with check (user_id = app.current_user_id());

create policy sessions_delete_own
on public.sessions
for delete
using (user_id = app.current_user_id());

create policy session_logs_select_own
on public.session_logs
for select
using (user_id = app.current_user_id());

create policy session_logs_insert_own
on public.session_logs
for insert
with check (user_id = app.current_user_id());

create policy session_logs_update_own
on public.session_logs
for update
using (user_id = app.current_user_id())
with check (user_id = app.current_user_id());

create policy session_logs_delete_own
on public.session_logs
for delete
using (user_id = app.current_user_id());
