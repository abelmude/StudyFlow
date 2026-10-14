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

Add two environment variables and forgotten passwords get a real reset email
too — see *Password reset by email* below.

The accounts server is `netlify/functions/api.mjs`, in this repository. It runs
as a Netlify Function with Netlify Blobs underneath, both included in the free
tier. The build turns accounts on automatically when it detects it is running
on Netlify.

That is the whole setup. The rest of this file is about the one thing it cannot
do, and the option that can.

---

## Password reset by email

Out of the box the built-in server cannot send email — there is no mail
provider behind it — so it falls back to issuing a one-time **recovery code**
at sign-up. That works, but people lose codes.

**To send real reset links instead, add two environment variables.** About five
minutes, free, no code.

1. Sign up at [resend.com](https://resend.com) and create an **API key**.
   The free tier is 3,000 emails a month, which is far more than a school needs
   for password resets.
2. Decide what the email comes *from*:
   - **Testing, right now:** use `onboarding@resend.dev`. It works immediately
     with no DNS, but Resend will only deliver it to the address you signed up
     with. Fine for checking the flow, useless for real students.
   - **Real use:** add your own domain in Resend and follow its DNS steps, then
     send from something like `noreply@yourdomain.com`.
3. In Netlify, **Site configuration → Environment variables**, add both:

   | Key | Value |
   | --- | --- |
   | `RESEND_API_KEY` | `re_...` |
   | `MAIL_FROM` | `StudyFlow <noreply@yourdomain.com>` |

4. **Deploys → Trigger deploy**.

The build prints which route is active, and refuses to deploy with only one of
the two set — half-configured mail is the worst outcome, because the app would
offer a reset that silently never arrives.

Once it is on, the recovery-code screen disappears, "Forgot your password?"
sends a link, and `/version.json` reports `"emailReset": true`.

### What the reset link does

It is valid for **one hour** and works **once**. Opening it proves control of
the inbox, so it sets a new password and signs you straight in — and signs out
every other device, because the reason for being there may be that somebody
else had the old password.

Asking for a reset always answers the same way whether or not the address has
an account, including when rate limited. Otherwise the form becomes a way to
find out who has signed up.

### Either way, addresses are not verified at sign-up

Neither mode confirms the address when the account is created, so an address is
a username rather than proof of identity. Someone could sign up as a name that
is not theirs; they gain nothing by it, since they still cannot read anybody
else's data, and with email reset on, the real owner can take the account over
by asking for a reset link.

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

## "This site is not secure"

Several different warnings get described this way and they have different
causes, so start by reading the exact words.

### "Not secure" in the address bar, no full-page warning

The page was loaded over plain HTTP. Netlify issues a certificate
automatically, but it has to be switched on and enforced:

1. Netlify → **Domain management → HTTPS**. If it says the certificate is
   still provisioning, wait — it is usually minutes, and up to 24 hours after
   a DNS change.
2. Turn on **Force HTTPS**. That redirects HTTP to HTTPS for everyone.
3. The site also sends `Strict-Transport-Security`, so after one successful
   HTTPS visit the browser will not even try HTTP again.

### A full red page: "Deceptive site ahead" or "Dangerous site"

This is Google Safe Browsing, not a certificate problem. A brand-new site that
asks for an email and password on a free `*.netlify.app` subdomain is a shape
phishing campaigns use constantly, and the classifier is aggressive about it.
Nothing in the code is wrong.

What actually fixes it:

1. **Use your own domain.** This is the real fix. A site on its own domain is
   judged on its own; one on a shared subdomain inherits whatever else is
   hosted there. Netlify → Domain management → Add a domain.
2. **Ask for a review.** Add the site in
   [Google Search Console](https://search.google.com/search-console), open
   **Security & Manual Actions → Security issues**, and request a review. It
   usually clears in a few days.

### "Your connection is not private" (NET::ERR_CERT_…)

A certificate problem rather than a warning about the site. Usual causes: a
custom domain was added but its DNS does not point at Netlify yet, the
certificate has not finished provisioning, or the computer's clock is wrong.
Netlify → Domain management → HTTPS → **Renew certificate** after the DNS is
correct.

### A warning only when you click into the password box

Chrome says a form is not secure when the page is not on HTTPS. Same fix as the
first case.

### What the site already does about it

Served over HTTPS with HSTS, so there is no second chance to downgrade it. A
Content-Security-Policy that allows scripts only from the site's own origin
with no inline execution at all, which is what makes injected script hard —
and matters here because the session token is in `localStorage`. No CDN, no web
fonts, no analytics and no trackers, so there is no third party to trust. All
of it is generated at deploy time by `scripts/write-config.js` into `_headers`;
`curl -I https://your-site/` shows exactly what is sent.

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
