-- ============================================================
-- Clip-Note: Supabase DB Schema (Run in Supabase SQL Editor)
-- ============================================================

-- 1. 사용자가 생성한 학습 팩
create table packs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. 팩별 학습 진도
create table user_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id text not null,
  completed_idea_ids jsonb default '[]',
  pack_review jsonb,
  last_touched_at timestamptz default now(),
  primary key (user_id, pack_id)
);

-- 3. 아이디어별 채팅 기록
create table idea_chats (
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id text not null,
  idea_id text not null,
  messages jsonb default '[]',
  updated_at timestamptz default now(),
  primary key (user_id, pack_id, idea_id)
);

-- 4. 사용자 설정
create table user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text default 'ko',
  hidden_pack_ids jsonb default '[]',
  updated_at timestamptz default now()
);

-- 5. 비동기 생성 작업 상태
create table generation_jobs (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 6. Expo 푸시 알림 토큰
create table push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text default 'unknown',
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

alter table packs enable row level security;
create policy "Users can CRUD own packs" on packs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table user_progress enable row level security;
create policy "Users can CRUD own progress" on user_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table idea_chats enable row level security;
create policy "Users can CRUD own chats" on idea_chats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table user_preferences enable row level security;
create policy "Users can CRUD own preferences" on user_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- generation_jobs is intended for server/service-role access.
alter table generation_jobs enable row level security;

-- push_tokens is written by the server after verifying the user's access token.
alter table push_tokens enable row level security;

-- ============================================================
-- updated_at 자동 갱신 트리거
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger packs_updated_at
  before update on packs
  for each row execute function update_updated_at();

create trigger idea_chats_updated_at
  before update on idea_chats
  for each row execute function update_updated_at();

create trigger user_preferences_updated_at
  before update on user_preferences
  for each row execute function update_updated_at();

create trigger generation_jobs_updated_at
  before update on generation_jobs
  for each row execute function update_updated_at();

create trigger push_tokens_updated_at
  before update on push_tokens
  for each row execute function update_updated_at();

-- user_progress uses last_touched_at instead of updated_at
create or replace function update_last_touched_at()
returns trigger as $$
begin
  new.last_touched_at = now();
  return new;
end;
$$ language plpgsql;

create trigger user_progress_last_touched_at
  before update on user_progress
  for each row execute function update_last_touched_at();

-- ============================================================
-- Indexes
-- ============================================================

create index packs_user_id_idx on packs(user_id);
create index user_progress_user_id_idx on user_progress(user_id);
create index idea_chats_user_id_pack_id_idx on idea_chats(user_id, pack_id);
create index generation_jobs_updated_at_idx on generation_jobs(updated_at desc);
create index push_tokens_user_id_idx on push_tokens(user_id);
