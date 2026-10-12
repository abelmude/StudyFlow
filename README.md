# StudyFlow

StudyFlow is an all-in-one organizer built for IB students. It brings your assignments, IAs, Extended Essay, CAS, and TOK deadlines into one clean app, with a smart dashboard that shows what's due next, a study planner, calendars, and progress tracking, so nothing slips through the cracks.

Sign in with an email and password and your diploma follows you from laptop to
phone; or use it with no account at all and everything stays in your browser.
**Deploy it to Netlify and accounts already work** — the accounts server is in
this repository, so there is nothing to sign up for and nothing to configure.
[SETUP.md](SETUP.md) explains what that server can and cannot do, and how to
swap it for a hosted one if you want verified email addresses.

---

## Get it running

Nothing to install. The whole thing is plain HTML, CSS and JavaScript, with no
dependencies; the only build step is one small script that stamps the deploy
with its configuration, and the app runs fine without it.

### 1. Look at it on your computer

Unzip the project, then open `index.html` by double-clicking it. That's the
marketing page; click **Open the app** to reach StudyFlow itself.

Some browsers restrict local files, so if anything looks wrong, serve the folder
instead (needs [Node.js](https://nodejs.org)):

```bash
npx http-server -p 8080
# then open http://127.0.0.1:8080
```

### 2. Put it online with Netlify

**The quick way.** Go to [app.netlify.com/drop](https://app.netlify.com/drop)
and drag the project folder onto the page. You get a live URL in about ten
seconds. No account settings, no build configuration.

**The connected way**, so the site updates whenever you push to GitHub: in
Netlify choose *Add new site → Import an existing project*, pick this
repository, and leave the build settings blank. `netlify.toml` already declares
them:

| Setting | Value |
| --- | --- |
| Build command | `node scripts/write-config.js` |
| Publish directory | `.` |

That one command writes `app/config.js` and `version.json` from the
environment. With no environment variables set it writes blanks, which is a
valid configuration: the app then runs with no accounts, exactly as it does
from a bare folder.

Once live:

| URL | Page |
| --- | --- |
| `/` | The marketing page |
| `/app/` | The StudyFlow app |
| `/version.json` | Which commit is deployed, and whether accounts are on |

To serve the app at the root instead, add to `netlify.toml`:

```toml
[[redirects]]
  from = "/"
  to = "/app/index.html"
  status = 200
```

### 3. Share a single file

`node build-prototype.js` inlines everything into one self-contained
`studyflow-prototype.html` you can email or host anywhere.

---

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Marketing page |
| `styles.css` | Marketing styling |
| `app.js` | Marketing interactions |
| `app/index.html` | App shell |
| `app/config.js` | Blank stub, rewritten at deploy time with the backend and build stamp |
| `app/dom.js` | Shared DOM helpers and the course picker widget |
| `app/store.js` | Data model, `localStorage`, queries, planner, example account |
| `app/auth.js` | Email + password accounts, over the provider's REST API |
| `app/sync.js` | Keeping the diploma on the server as well as the device |
| `app/ical.js` | iCalendar parser and ManageBac deadline mapping |
| `app/onboarding.js` | First-run tour and diploma setup |
| `app/authview.js` | Sign up, log in, password reset, conflict resolution |
| `app/app.js` | Router, the ten views, all interactions |
| `app/app.css` | App styling |
| `netlify/functions/api.mjs` | The built-in accounts server — sign-up, login, recovery, sync |
| `supabase/schema.sql` | For the Supabase option: the table, its security rules and delete-my-account |
| `package.json` | One dependency, used only by the server-side function |
| `scripts/write-config.js` | The build step: config, version stamp, cache name |
| `SETUP.md` | How to switch accounts on |
| `manifest.webmanifest` | Makes the app installable |
| `sw.js` | Service worker — offline support |
| `404.html`, `offline.html` | Error pages in the site's own design |
| `icon.svg`, `icon-*.png`, `og-image.png` | App icons and the social card |
| `robots.txt` | Search engine directives |
| `scripts/make-images.js` | Regenerates the icons and social card |
| `netlify.toml` | Publish directory and headers |
| `build-prototype.js` | Bundles the app into one HTML file |

Deploying needs only `index.html`, `styles.css`, `app.js`, the `app/` folder,
`netlify.toml` and `scripts/write-config.js`. The rest is documentation and
tooling — `supabase/schema.sql` is pasted into Supabase by hand, not served.

---

## Installable and offline

The deployed site is a progressive web app.

**Install it.** On a phone, open the site and choose *Add to Home Screen*; on
desktop Chrome or Edge, use the install icon in the address bar. It then opens
in its own window with no browser chrome, launching straight into the app.

**It works with no connection.** A service worker (`sw.js`) precaches the shell
on first visit, and your deadlines already live in the browser rather than on a
server — so StudyFlow opens and works on a bus, in a basement, or on a plane.

Navigations are network-first, so a new deploy is picked up as soon as you are
online. Assets are stale-while-revalidate: the cached copy is served
immediately, which is what makes the app open instantly, while a background
fetch refreshes the cache for next time.

`offline.html` is shown only if you reach a page that was never cached.

### Why a deploy is never invisible again

`CACHE` in `sw.js` has to change whenever a precached file does, or the stale
copy survives `activate` and keeps being served. Bumping it by hand was
load-bearing and easy to forget — forgetting it once pinned everyone to an old
build and cost a day of hunting for a deploy that had worked all along. Three
things now stop that:

1. **The cache name carries the commit.** `scripts/write-config.js` appends it
   at build time, so every deploy is automatically a new cache and the previous
   one is deleted on activate.
2. **Assets are stale-while-revalidate, not cache-first.** Even an unstamped
   build — a local checkout — self-corrects after one load rather than being
   stuck forever.
3. **The app says so.** When a new worker takes over, a bar offers a reload.
   The scripts a controlled page is already running cannot be swapped
   underneath it, so that first load is still the old build; what has changed
   is that nobody has to guess about it any more.

And when it still looks wrong, **Settings → About this build** names the commit
actually running, with a button that clears the cache and reloads. `/version.json`
answers the same question without opening the app.

## Sharing and search

`og-image.png` (1200×630) is generated from the site's own type and palette by
`node scripts/make-images.js`, alongside the app icons — so the icon, the social
card and the interface can never drift apart. Open Graph and Twitter card tags
mean a shared link previews properly instead of appearing as a bare URL.

`robots.txt` allows everything. A `Sitemap:` line is deliberately absent: entries
must be absolute URLs, so add one once the site has its final domain.

The app itself carries `noindex` — it is a personal workspace, not a page that
should turn up in search results.

## The design system

The interface is built around one idea: **an examination paper, not a consumer
app.** Structure and typography carry the design, and colour is reserved almost
entirely for status — because in a deadline tool the only thing that should draw
your eye is the thing that is slipping.

### Colour

| Token | Value | Job |
| --- | --- | --- |
| `--accent` | `#1b3a5c` | Interaction only — buttons, links, focus. Never means "good" or "bad". |
| `--clear` | `#156f52` | On track, done |
| `--soon` | `#9a5b00` | Due soon |
| `--late` | `#a81f12` | Overdue |
| `--cat-1…5` | muted slate, plum, pine, ochre, rose | Subject categories |
| `--ink` / `--paper` | `#0f1518` / `#f2f5f4` | Text and ground — a cool exam-paper grey |

Two rules hold this together:

1. **Brand colour is never status colour.** The one blue is for things you
   click. Green, amber and red mean on-track, soon and late, and nothing else.
2. **Categories are desaturated below the status scale**, so an "Internal
   Assessment" tag can never shout louder than an overdue warning — and every
   category carries a text label too, so colour is never the only signal.

### Type

Three roles, all from system font stacks, so there is no webfont to download and
nothing to go wrong offline:

| Role | Stack | Where |
| --- | --- | --- |
| Display | `ui-serif, Georgia, "Iowan Old Style", …` | Headings, the due-next statement |
| UI | system sans | Everything you operate |
| Data | `ui-monospace` + `tabular-nums` | Dates, hours, counts, word counts |

The serif is the deliberate risk: on a student productivity tool it reads
academic rather than generic-SaaS, and it is what makes the app look like it
belongs to the IB rather than to a startup template.

Tabular figures matter more than they sound — every date and hour count lines up
down its column, so you can compare at a glance instead of reading.

### Structure

Hairline rules instead of drop shadows and large radii (3–5px, not pills).
Lists are dense and tabular, like a timetable. Depth is reserved for things that
genuinely float — dialogs and the onboarding overlay.

### Accessibility

All text pairs meet WCAG AA (4.5:1). The measured values are body text 16.8:1,
secondary metadata 5.1:1, and due labels 5.4:1. Status is carried by text as
well as colour, the layout respects `prefers-reduced-motion`, and every control
has a visible focus state.

---

## The marketing page

Three things shape the copy, drawn from what the research actually supports:

- **The headline says what it is and who it is for** — "The IB deadline tracker
  for Diploma students" — rather than a slogan.
- **The risk comes with the remedy attached.** Naming a fear without an
  immediate way out causes hesitation, not action, so the sentence that raises
  the stakes ends by pointing at the app.
- **No invented proof.** StudyFlow has no users yet, so the page carries no
  testimonials, no logo wall and no performance claims. The figures on the page
  are facts that are true by construction — 53 DP courses built in, 5 deadline
  types, a 14-day planning horizon, 0 third-party scripts. When you have real
  users, relevant specifics will outperform anything generic here.
- **The page describes this deployment, not the project.** Whether accounts
  exist depends on whether a backend was configured, so the hero reads the
  app's own config and picks the line that is true. With JavaScript off it
  shows the device-only line, which is correct either way.

A second call to action sits mid-page, since a long page needs the next step
repeated after the persuasion rather than only at the very bottom.

---

## The app

`app/` is a working single-page app, not a mockup. Every change saves to
`localStorage`.

### First run

1. **Sign in** — create an account with an email and password, log in, or carry
   on without one. This step only appears when accounts are configured; see
   *Accounts* below.
2. **A four-panel tour** of how StudyFlow works, each panel pairing the
   explanation with a small mock of the real thing. Skippable.
3. **A choice** — set up your own diploma, or explore the example account.
4. **Setup** — your name, subjects (all 53 DP courses, searchable and grouped by
   IB subject group), EE subject and word target, and the hours you are
   genuinely free each weekday.

Your diploma then starts **empty**, and the dashboard points you at adding your
first deadline.

### The views

| View | What it does |
| --- | --- |
| **Dashboard** | Due-next statement, overdue and heavy-week alerts, stat tiles, upcoming list, today's blocks |
| **Deadlines** | Filters, live search, completed toggle; add, edit, complete, delete |
| **Calendar** | Month grid with category dots and study-block markers |
| **Study planner** | Free hours per weekday → a 14-day schedule |
| **Extended Essay** | Research question, word count, milestones, supervisor meetings |
| **CAS** | Strand balance, the seven learning outcomes, experience log |
| **Progress** | Completion by subject and category, plus core status |
| **Import calendar** | ManageBac deadlines from an iCalendar export |
| **Messages** | Auto-drafted messages to teachers about slipping deadlines |
| **Settings** | Name, subjects, teacher contacts, EE setup, your account and syncing, which build is running |

The planner is a greedy scheduler: it walks the next 14 days, spends each day's
available hours on the most urgent unfinished work, and caps any one task at 2h
per day so large pieces get spread out rather than crammed.

**Log out** sits in the sidebar footer, and does one of two things depending on
whether there is an account to log out of. With one, it revokes the session and
clears the diploma from the browser, because the next person at that computer
must not find someone else's deadlines — nothing is lost, since it is all in the
account. Without one there is no session to end, so the data stays on the device
and can be resumed. The confirmation says which is happening, because on a
shared computer that distinction matters. **Start over** in Settings erases.

---

## Accounts

The app is complete without them — a diploma lives in the browser, privately and
offline. With one, the same diploma appears on a laptop and a phone.

A password cannot be checked in the browser. Whatever the page does, the
checking has to happen somewhere the student does not control, or it means
nothing. So accounts need a server, and there are two it can use. The app
speaks both, and `app/auth.js` talks to either over plain `fetch` rather than
through an SDK, so the browser still downloads nothing but the app.

### Built in — the default

`netlify/functions/api.mjs`, in this repository. One Netlify Function with
Netlify Blobs underneath, both on the free tier. **Deploy the site and accounts
work**: no signup, no key, no configuration. The build switches them on when it
sees it is running on Netlify.

Passwords are hashed with scrypt and a per-password salt. Session tokens are
signed, and logging out — or changing a password, or using a recovery code —
invalidates every token already issued, on every device. Login is rate limited
per account and per address. A student's diploma is keyed by an account id
taken from the signed token, so there is no request shape that could ask for
someone else's.

What it cannot do is **send email**, because there is no mail provider behind
it. So an address is a username rather than a verified identity, and instead of
a reset link, signing up issues a one-time **recovery code** shown once. That is
not a shortcut: if the server could restore an account without something only
the owner holds, so could anyone who asked it to. The app says all of this on
the sign-up screen rather than burying it.

### Supabase — when you want verified email

Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` and the app uses a hosted identity
service instead, which does confirm addresses and does email reset links.
[SETUP.md](SETUP.md) has the steps — about fifteen minutes, free, no code.

There, what separates one student's data from another's is **Row Level
Security** in Postgres: the database itself refuses to return or write a row
whose owner is not the signed-in user. The key in the browser (`anon`) is public
by design and identifies the project, not the person; `supabase/schema.sql`
refuses to finish if the security rules did not apply.

The two are separate systems with separate databases, so accounts do not carry
across between them. Choose before people sign up if you can.

### Syncing

`localStorage` stays the source of truth while the app runs. Every edit saves
instantly and works offline; the server copy is written a couple of seconds
later in the background. A student ticking off a deadline on a train should
never watch a spinner, and should never lose the tick because the train went
into a tunnel. The sidebar says which state it is in.

The whole diploma is stored as **one JSON document per user** rather than
normalised tables. For a single-user document of a few hundred rows that is the
right trade — no migrations, no partial writes, and the offline story stays
trivial. It would be the wrong trade for anything collaborative.

**Conflicts are not resolved silently.** If the same account was edited on two
devices while one was offline, last-write-wins would quietly destroy an
evening's work, so the app asks — and shows what is in each copy (subjects,
deadline counts, CAS hours) so the choice can be made on evidence rather than
on the words "local" and "remote".

The example account is never uploaded. Exploring it on a laptop must not put
Sandra's deadlines on your phone.

### What accounts do not do

Neither backend is end-to-end encrypted: whoever administers the site can read
the database. That is worth saying plainly to students rather than leaving
implied — and the no-account route stays available to anyone who would rather
keep their data on their own device.

---

## ManageBac

ManageBac's public API is a school-level integration: tokens are issued by an
administrator and grant access to **all** student and teacher data at the
school. There is no per-student login, so no third-party app can sign in as you,
and a school token has no business in a student's browser.

What a student *can* export is their own calendar — ManageBac's **Subscribe to
Calendar** gives an iCalendar feed. StudyFlow reads that: it classifies events
into assignment / IA / EE / CAS / TOK, matches them to your subjects, excludes
timetabled lessons, and deduplicates against earlier imports by `UID`. Nothing
is added until you review it.

Messages are **drafted automatically but never sent automatically.** A message
to a teacher cannot be recalled, and whether sending is right is a judgement
only you can make, so sending opens your own mail client.

---

## Notes

- **No third-party scripts.** No CDNs, web fonts, analytics or trackers, and no
  dependencies in anything a browser downloads. The only network request the app
  makes is to its own accounts server, and only once you are signed in.
- **Backend optional.** With none, there are no accounts and no database: all
  data stays in the browser under `studyflow-data-v1`. With one, that stays
  true as well — the browser copy is what makes it work offline.
- **Light and dark themes.** An explicit in-app choice wins, then a theme set by
  a host page, then your OS preference.
- **Responsive** from 390px up, with no horizontal overflow at any width.

## License

[MIT](LICENSE) — free to use, modify and share, with the copyright notice kept.
