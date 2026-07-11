-- WorkTools feedback table + Row Level Security.
--
-- Applied automatically by Supabase's GitHub integration (Pro plan), or paste
-- the contents into the SQL Editor once on the free plan. This file is the
-- version-controlled source of truth for the feedback schema.

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  tool        text,                        -- which calculator (auto-captured)
  type        text not null,               -- 'bug' | 'idea' | 'feedback'
  message     text not null,
  email       text,                        -- optional, for follow-up
  page_url    text,
  user_agent  text,
  status      text not null default 'new'  -- 'new' | 'resolved'
);

alter table public.feedback enable row level security;

-- Anyone (anon key) may submit, but not read.
create policy "public can submit feedback"
  on public.feedback for insert
  to anon
  with check (
    type in ('bug', 'idea', 'feedback')
    and char_length(message) between 1 and 5000
  );

-- Only logged-in users (Matt) can read / update.
create policy "authed can read"
  on public.feedback for select
  to authenticated
  using (true);

create policy "authed can update"
  on public.feedback for update
  to authenticated
  using (true);
