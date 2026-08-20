-- Per-day view counts for the trend chart in tools/feedback-report/.
--
-- Additive: creates one function, touches no table or policy. Safe to re-run.
--
-- security invoker means Row Level Security still applies, exactly like
-- page_view_stats — an anonymous caller gets no rows back.
--
-- tz takes an IANA timezone name (the browser sends its own) so a visit at
-- 8pm local lands on that local day rather than being pushed to the next UTC
-- day. Pass days => null for all time.
create or replace function public.page_view_daily(days int default 30, tz text default 'UTC')
returns table (day date, tool text, views bigint)
language sql
security invoker
stable
as $$
  select (pv.created_at at time zone tz)::date as day,
         pv.tool,
         count(*)::bigint as views
  from public.page_views pv
  where days is null
     or pv.created_at >= now() - make_interval(days => days)
  group by 1, 2
  order by 1, 2;
$$;
