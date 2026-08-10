-- Supabase SQL Editor에서 실행하세요
-- Project Settings > API 의 URL / anon key 는 config.js에 넣습니다

create table if not exists diary_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null check (char_length(trim(name)) between 1 and 20),
  content text not null check (char_length(trim(content)) between 1 and 500),
  satisfaction text not null check (char_length(satisfaction) between 1 and 8),
  created_at timestamptz not null default now()
);

create index if not exists diary_entries_date_idx on diary_entries (date);
create index if not exists diary_entries_created_at_idx on diary_entries (created_at);

alter table diary_entries enable row level security;

drop policy if exists "Anyone can read diary entries" on diary_entries;
create policy "Anyone can read diary entries"
  on diary_entries
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can insert diary entries" on diary_entries;
create policy "Anyone can insert diary entries"
  on diary_entries
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Anyone can delete diary entries" on diary_entries;
create policy "Anyone can delete diary entries"
  on diary_entries
  for delete
  to anon, authenticated
  using (true);
