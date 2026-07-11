# WorkTools Feedback — Setup

This adds a "💬 Feedback" button to every WorkTools page. Submissions go to a
free [Supabase](https://supabase.com) database, and you review them in a private
report at `tools/feedback-report/`.

You own the data and the report — the public can only *submit* feedback, never
read it.

---

## 1. Create a Supabase project (~2 min)

1. Sign up at [supabase.com](https://supabase.com) (free tier is plenty).
2. Create a new project. Pick any name/region; save the database password.
3. Go to **Project Settings → API** and copy two values:
   - **Project URL** (e.g. `https://abcxyz.supabase.co`)
   - **anon / public** API key

> The anon key is meant to be public. It's safe to commit — the security comes
> from Row Level Security, set up in step 2.

## 2. Create the table + security rules (~1 min)

Open **SQL Editor → New query**, paste this, and click **Run**:

```sql
create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  tool        text,
  type        text not null,
  message     text not null,
  email       text,
  page_url    text,
  user_agent  text,
  status      text not null default 'new'
);

alter table public.feedback enable row level security;

-- Anyone (anon key) may submit, but not read.
create policy "public can submit feedback"
  on public.feedback for insert
  to anon
  with check (
    type in ('bug','idea','feedback')
    and char_length(message) between 1 and 5000
  );

-- Only logged-in users (you) can read / update.
create policy "authed can read"   on public.feedback for select to authenticated using (true);
create policy "authed can update" on public.feedback for update to authenticated using (true);
```

## 3. Add your keys to the site (~1 min)

Edit **`assets/feedback-config.js`** and replace the placeholders:

```js
window.WORKTOOLS_SUPABASE = {
  url: "https://abcxyz.supabase.co",
  anonKey: "your-anon-public-key"
};
```

Commit and push. GitHub Pages redeploys automatically. The feedback button now
works on every page.

## 4. Lock down who can read the report

The report at `tools/feedback-report/` requires an email sign-in link. To make
sure only *you* can log in:

1. **Authentication → Providers → Email**: keep **Email** enabled.
2. **Authentication → Sign In / Providers** (or **Settings**): turn **off**
   "Allow new users to sign up". Then add your own email under
   **Authentication → Users → Add user** (or sign yourself up once, then turn
   signups off).
3. **Authentication → URL Configuration**: add your report URL to the allowed
   **Redirect URLs**, e.g.
   `https://mattliegey.github.io/worktools/tools/feedback-report/`
   (and `http://localhost:8000/tools/feedback-report/` for local testing).

Now open the report, enter your email, click the link it sends you, and you'll
see every submission — filter by type/tool/status and mark items resolved.

---

## Optional: instant email when new feedback arrives

The report already lets you check any time. If you also want an email the moment
someone submits:

1. Get a free [Resend](https://resend.com) API key (or use any email API).
2. Create a Supabase **Edge Function** that sends an email, and a **Database
   Webhook** (Database → Webhooks) that fires it on `INSERT` into `feedback`.
   A Slack incoming-webhook works the same way if you'd rather get a Slack ping.

This is optional and can be added later without changing anything on the site.

---

## How it fits together

| Piece | File | What it does |
| --- | --- | --- |
| Config | `assets/feedback-config.js` | Your Supabase URL + anon key (public-safe) |
| Widget | `assets/feedback.js` | Floating button + dialog; POSTs to Supabase |
| Wiring | each page's `index.html` | Two `<script>` tags before `</body>` |
| Report | `tools/feedback-report/` | Private, login-gated review page |
