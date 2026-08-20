# WorkTools Visit Counter — Setup

This counts how many times each tool page is opened. Counts are recorded into
the same free [Supabase](https://supabase.com) project the feedback widget uses,
and you review them in the private report at `tools/feedback-report/`.

Same security model as feedback: the public can only *record* a view, never read
the numbers back.

**If you've already set up feedback, there is exactly one step: run the SQL in
step 1.** Everything else is already wired up and deployed.

---

## 1. Create the table + stats function (~1 min)

The schema lives in the repo at
[`supabase/migrations/20260820120000_create_page_views.sql`](../supabase/migrations/20260820120000_create_page_views.sql).

- **On the free plan:** open **SQL Editor → New query**, paste the whole contents
  of that file, and click **Run**.
- **On the Pro plan with the GitHub integration connected:** Supabase applies it
  automatically on push — nothing to do.

That file creates:

| Piece | What it does |
| --- | --- |
| `page_views` table | One row per page load: tool, path, referrer, session, timestamp |
| RLS policies | Public may `INSERT` only; only logged-in you may `SELECT` |
| `page_view_stats(days)` function | Returns per-tool totals, already aggregated |

> The function matters: PostgREST caps ordinary queries at 1000 rows, so
> counting rows in the browser would silently stop being accurate once the site
> passed a thousand views. Aggregating in the database keeps the totals correct
> no matter how big the table gets.

## 2. Look at the numbers

Open `tools/feedback-report/`, sign in with your magic link, and the **Page
visits** section is at the top — a row per tool page with its own counter, over
the last 7 days, 30 days, or all time.

| Column | Meaning |
| --- | --- |
| **Views** | Page loads. The headline "how many visits" number. |
| **Sessions** | Distinct browser sessions. Someone opening three tools in one tab counts once. |
| **Last seen** | When that page was most recently opened. |

---

## What is and isn't counted

Counted:

- Every load of the landing page and the four calculator pages.

Not counted (deliberately):

- **The report page itself** — it's your admin page; counting it would inflate
  your own numbers. It simply doesn't include the script.
- **localhost / 127.0.0.1** — local testing never pollutes real stats. Change
  `IGNORED_HOSTS` in `assets/analytics.js` if you want different behaviour.
- **Visitors sending Do Not Track** — a small share of browsers. Set
  `RESPECT_DO_NOT_TRACK = false` in `assets/analytics.js` to count them anyway.
- **Automated browsers** (`navigator.webdriver`), and any crawler that doesn't
  run JavaScript — which is most of them. This is why a JS beacon tends to be
  *closer* to real human traffic than raw server logs.

Because of the last three, treat the numbers as a solid relative signal — which
tools people actually use, and whether that's growing — rather than an exact
census. GitHub Pages doesn't expose server logs, so a beacon like this is the
only option available on this host.

## Privacy

No cookies, no cross-site identifier, no personal data. The session id is a
random string kept in `sessionStorage` that disappears when the tab closes, and
it exists only so "12 views" can be told apart from "3 people looking 4 times".
Referrers are recorded only for *external* sites, with query strings stripped.

## How it fits together

| Piece | File | What it does |
| --- | --- | --- |
| Config | `assets/feedback-config.js` | Supabase URL + anon key (shared with feedback) |
| Beacon | `assets/analytics.js` | Records one view per page load |
| Wiring | each page's `index.html` | One `<script>` tag before `</body>` |
| Schema | `supabase/migrations/20260820120000_create_page_views.sql` | Table, RLS, stats function |
| Report | `tools/feedback-report/` | Private "Page visits" section |
