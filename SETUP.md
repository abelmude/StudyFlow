# Accounts

StudyFlow can run two ways, and the app is complete either way.

| | What a student gets |
| --- | --- |
| **No account** | The diploma is saved in their own browser. Private, offline, nothing uploaded. It does not reach their phone, and clearing browser data erases it. |
| **With an account** | Email and password, and the same diploma on every device they log in on. |

---

## The short version

**Deploy this repository to Netlify and accounts already work.** There is
nothing to sign up for and nothing to configure.

The accounts server is `netlify/functions/api.mjs`, in this repository. It runs
as a Netlify Function with Netlify Blobs underneath, both included in the free
tier. The build turns accounts on automatically when it detects it is running
on Netlify.

That is the whole setup. The rest of this file is about the one thing it cannot
do, and the option that can.

---

## What the built-in server cannot do: send email

There is no mail provider behind it, so it sends nothing. Two consequences,
both shown plainly in the app rather than buried:

**1. An email address is not verified.** It is a username that happens to look
like an email. Someone could sign up as a name that is not theirs. They gain
nothing by it — they still cannot read anybody else's data — but it is not
proof of identity and must not be treated as one.

**2. There is no "email me a reset link".** Instead, signing up issues a
one-time **recovery code**, shown once on a screen the student has to tick to
leave. That code is the only way back in after a forgotten password.

That second point is not a shortcut, it is the only honest option: if the
server could restore an account without something only the owner holds, so
could anyone who asked it to. The trade is real, though — a student who loses
both their password and their code has lost that account, and nobody can undo
it.

### What it does do

- Passwords hashed with scrypt and a per-password salt, never stored or logged
  in any readable form
- Signed session tokens; logging out, changing a password or using a recovery
  code invalidates every token already issued, on every device
- Rate limiting per account and per address, so a password cannot be guessed at
  by a script
- One student's data is keyed by an account id taken from the signed token, so
  there is no request shape that could ask for someone else's
- Delete-my-account really deletes: the row, the diploma and the login

---

## The other option: Supabase, for verified email

If you want addresses that are actually confirmed and real emailed password
resets — worth it for a whole year group — point the app at
[Supabase](https://supabase.com) instead. It is free, it takes about fifteen
minutes, and you will not write any code.

The app speaks both. Setting the two environment variables below switches it
over; removing them switches it back.

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

Setting these is also what tells the app to use Supabase rather than the
built-in server.

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

## Switching back

Delete the two environment variables in Netlify and redeploy. The app returns to
the built-in server. Nothing in Supabase is touched, so putting them back
restores every account there.

Accounts do not carry across between the two backends — they are separate
systems with separate databases. A student with a Supabase account will be
asked to sign up again on the built-in one, and their diploma stays in whichever
backend it was saved to. Switching after people have signed up means telling
them that, so decide early if you can.

## Turning accounts off entirely

Accounts are on by default once deployed. To run the site as a purely local tool
with no sign-in at all, delete `netlify/functions/` and the `/api/*` redirect in
`netlify.toml`, and leave the Supabase variables unset.
