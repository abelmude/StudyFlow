# Turning on email + password accounts

StudyFlow works right now with no accounts at all: a student's diploma is saved
in their own browser. That is private and it works offline, but it does not
follow them to their phone, and clearing browser data erases it.

This turns on real accounts — sign up with an email and password, log in on any
device, everything syncs.

**It takes about fifteen minutes and costs nothing.** You will not touch any
code; you paste one block of SQL and set two environment variables.

---

## Why it needs a service at all

A password cannot be checked in the browser. Whatever the page does, the
checking has to happen somewhere the student does not control, or it means
nothing — anything else is a lock with the key taped to it.

StudyFlow is a static site, so there is no server of ours to do that checking.
It therefore uses [Supabase](https://supabase.com), which is built for exactly
this case: it hashes passwords server-side, issues short-lived signed tokens,
and handles the confirmation and password-reset emails. The free tier is
generous enough for a school.

StudyFlow talks to it over plain HTTP requests, with no SDK and no build
tooling, so the app keeps having zero dependencies.

---

## Step 1 — Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (GitHub login works).
2. **New project.** Give it a name — `studyflow` is fine.
3. Choose a **database password** and save it somewhere. You will not need it
   for StudyFlow, but you cannot recover it later.
4. Pick the region closest to your school.
5. Wait for it to finish setting up — a minute or two.

## Step 2 — Create the table

1. In the project, open **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open [`supabase/schema.sql`](supabase/schema.sql) from this repository, copy
   all of it, and paste it in.
4. Click **Run**.

You should see `StudyFlow schema ready: student_data created, RLS on, 4
policies, delete_me() installed.`

If it reports anything else, stop and read it — the script deliberately refuses
to finish if the security rules did not apply, because a table without them
would let any visitor read every student's data.

## Step 3 — Point your site at it

Still in Supabase, open **Project Settings → API**. You need two values:

| In Supabase | Looks like |
| --- | --- |
| **Project URL** | `https://abcdefghijklm.supabase.co` |
| **`anon` `public`** key | a long string starting `eyJhbGciOi…` |

> **Take the `anon` key, not `service_role`.** The `service_role` key ignores
> all the security rules you just installed. StudyFlow's build refuses to start
> if you paste it by mistake, but it is worth not having it in your clipboard.

Now in **Netlify**, open your site → **Site configuration → Environment
variables → Add a variable**, and add both:

| Key | Value |
| --- | --- |
| `SUPABASE_URL` | your Project URL |
| `SUPABASE_ANON_KEY` | your `anon` key |

Then **Deploys → Trigger deploy → Deploy site**.

## Step 4 — Tell Supabase where your site is

Supabase will only send people back to addresses you have approved, so the
confirmation and reset links need your domain.

In Supabase, open **Authentication → URL Configuration**:

- **Site URL**: `https://your-site.netlify.app/app/`
- **Redirect URLs**: add all of these, one per line:
  ```
  https://your-site.netlify.app/app/
  https://your-site.netlify.app/app/index.html
  http://localhost:8080/app/index.html
  ```

Use your real Netlify address. Note the `/app/` on the end — that is the page
the links come back to.

StudyFlow asks for the exact page it was opened from, rather than relying on
Site URL alone, so that a deploy preview or a custom domain is not a dead end.
Anything not on this list is ignored and falls back to Site URL, so an address
missing from it shows up as a link that lands on the wrong page — if that
happens, add it here. If you add a custom domain later, add it here too.

## Step 5 — Check it

Open `https://your-site.netlify.app/app/`. You should now see **"Your diploma,
on every device"** with *Create an account* instead of the tour.

Make a real account with your own email, confirm it, add a subject and a
deadline, then open the site on your phone and log in. Your deadline should be
there.

---

## Confirming it worked, when it looks like it did not

Two different problems look identical from the outside: the deploy never
happened, and your browser is still showing you the old one. Three ways to tell
them apart, in order of effort:

1. **In the app:** Settings → **About this build**. It shows the exact commit
   that is running. If that is not the latest, your browser is behind — the
   **Force a fresh copy** button there clears the offline cache and reloads.
2. **Without opening the app:** `https://your-site.netlify.app/version.json`.
   It is never cached, so it is always the truth about what Netlify is serving.
   If it 404s, the build did not run.
3. **In Netlify:** Deploys → the latest one → **Deploy log**. A failed build
   leaves the previous version live, which is exactly what "my change is not
   there" feels like.

`version.json` also reports `"accounts": "enabled"` or `"disabled"`, which tells
you whether the environment variables were picked up.

---

## What is stored, and who can read it

| Where | What |
| --- | --- |
| Supabase `auth.users` | email, a bcrypt hash of the password, the name given at sign-up |
| Supabase `student_data` | one row per student: their whole diploma as JSON |
| The student's browser | a copy of that diploma, so the app works offline, plus their session tokens |

Row Level Security means Postgres itself refuses to return or write a row whose
owner is not the signed-in user. There is no application code in that path that
could forget a check.

What this is **not**: it is not end-to-end encrypted. A Supabase project
administrator can read the database. If that matters for your school, say so
plainly to the students using it — and note that the no-account mode remains
available to anyone who would rather keep their data on their own device.

Sessions are kept in `localStorage`, which is what Supabase's own library does
and the only option for a site with no backend of its own. The trade-off is
that script running on the page could read them, which is why StudyFlow loads
no third-party scripts at all: no CDN, no analytics, no web fonts.

---

## Things worth changing while you are in there

**Email confirmation** is on by default and should stay on — without it anyone
can sign up as anyone. Supabase's built-in email sender is rate-limited to a
handful per hour, which is fine for a few students and not for a school year
group. For more, set up a real SMTP sender under **Project Settings → Auth →
SMTP Settings**.

**Minimum password length** defaults to 6 in Supabase; StudyFlow's own screens
require 8. Raise Supabase's to match, under **Authentication → Policies**, so
the rule holds no matter what calls it.

**Leaked password protection** (Authentication → Policies) checks new passwords
against known breaches. Worth switching on.

---

## Turning accounts off again

Delete the two environment variables in Netlify and redeploy. The app goes back
to being purely local. Nothing in the database is touched, so putting them back
restores every account.

Students who were logged in will find themselves on the local version with
whatever was last synced to their browser. Their data is still in Supabase.
