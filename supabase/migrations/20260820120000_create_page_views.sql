-- WorkTools page views (visit counter) + Row Level Security.
--
-- Mirrors the feedback table's model: the public may INSERT a view, but only an
-- authenticated user (Matt) can read them back. Applied automatically by
-- Supabase's GitHub integration (Pro plan), or paste the contents into the SQL
-- Editor once on the free plan. See docs/analytics-setup.md.

create table if not exists public.page_views (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  tool        text not null,               -- display name, e.g. 'Shingle Calculator'
  path        text not null,               -- normalized page path, e.g. '/tools/shingles/'
  referrer    text,                        -- where the visitor came from, if any
  session_id  text,                        -- random per-tab id; lets us count visits vs views
  user_agent  text
);

-- The report groups by tool and filters on a date range.
create index if not exists page_views_created_at_idx on public.page_views (created_at desc);
create index if not exists page_views_tool_idx on public.page_views (tool);

alter table public.page_views enable row level security;

-- Anyone (anon key) may record a view, but not read them back.
-- The length caps stop the endpoint being used as free text storage.
create policy "public can record page views"
  on public.page_views for insert
  to anon
  with check (
    char_length(tool) between 1 and 120
    and char_length(path) between 1 and 300
    and (referrer is null or char_length(referrer) <= 500)
    and (session_id is null or char_length(session_id) <= 64)
    and (user_agent is null or char_length(user_agent) <= 500)
  );

-- Only logged-in users (Matt) can read.
create policy "authed can read page views"
  on public.page_views for select
  to authenticated
  using (true);

-- Aggregate counts per tool, so the report never has to pull raw rows (PostgREST
-- caps un-aggregated selects at 1000 rows, which would silently undercount).
--
-- security invoker means RLS still applies: an anonymous caller gets nothing.
-- Pass days => null for all time.
create or replace function public.page_view_stats(days int default 30)
returns table (tool text, path text, views bigint, visits bigint, last_seen timestamptz)
language sql
security invoker
stable
as $$
  select pv.tool,
         min(pv.path)                            as path,
         count(*)::bigint                        as views,
         count(distinct pv.session_id)::bigint   as visits,
         max(pv.created_at)                      as last_seen
  from public.page_views pv
  where days is null
     or pv.created_at >= now() - make_interval(days => days)
  group by pv.tool
  order by count(*) desc;
$$;
