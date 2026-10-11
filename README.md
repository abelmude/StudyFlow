# StudyFlow

StudyFlow is an all-in-one organizer built for IB students. It brings your assignments, IAs, Extended Essay, CAS, and TOK deadlines into one clean app, with a smart dashboard that shows what's due next, a study planner, calendars, and progress tracking, so nothing slips through the cracks.

---

## Get it running

Nothing to install, nothing to build. The whole thing is plain HTML, CSS and
JavaScript.

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
| Build command | *(none)* |
| Publish directory | `.` |

Once live:

| URL | Page |
| --- | --- |
| `/` | The marketing page |
| `/app/` | The StudyFlow app |

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
| `app/dom.js` | Shared DOM helpers and the course picker widget |
| `app/store.js` | Data model, `localStorage`, queries, planner, example account |
| `app/ical.js` | iCalendar parser and ManageBac deadline mapping |
| `app/onboarding.js` | First-run tour and account setup |
| `app/app.js` | Router, the ten views, all interactions |
| `app/app.css` | App styling |
| `manifest.webmanifest` | Makes the app installable |
| `sw.js` | Service worker — offline support |
| `404.html`, `offline.html` | Error pages in the site's own design |
| `icon.svg`, `icon-*.png`, `og-image.png` | App icons and the social card |
| `robots.txt` | Search engine directives |
| `scripts/make-images.js` | Regenerates the icons and social card |
| `netlify.toml` | Publish directory and headers |
| `build-prototype.js` | Bundles the app into one HTML file |

Deploying needs only `index.html`, `styles.css`, `app.js`, the `app/` folder and
`netlify.toml`. The rest is documentation and tooling.

---

## Installable and offline

The deployed site is a progressive web app.

**Install it.** On a phone, open the site and choose *Add to Home Screen*; on
desktop Chrome or Edge, use the install icon in the address bar. It then opens
in its own window with no browser chrome, launching straight into the app.

**It works with no connection.** A service worker (`sw.js`) precaches the shell
on first visit, and your deadlines already live in the browser rather than on a
server — so StudyFlow opens and works on a bus, in a basement, or on a plane.
Navigations go to the network first, so a new deploy is picked up as soon as you
are online again; assets come from cache, which is what makes it open instantly.

When you change a precached file, bump `CACHE` in `sw.js`. The old cache is
deleted on activate, so a deploy can never leave a half-old, half-new app
behind.

`offline.html` is shown only if you reach a page that was never cached.

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
  types, a 14-day planning horizon, 0 accounts required. When you have real
  users, relevant specifics will outperform anything generic here.

A second call to action sits mid-page, since a long page needs the next step
repeated after the persuasion rather than only at the very bottom.

---

## The app

`app/` is a working single-page app, not a mockup. Every change saves to
`localStorage`.

### First run

1. **A four-panel tour** of how StudyFlow works, each panel pairing the
   explanation with a small mock of the real thing. Skippable.
2. **A choice** — set up your own diploma, or explore the example account.
3. **Setup** — your name, subjects (all 53 DP courses, searchable and grouped by
   IB subject group), EE subject and word target, and the hours you are
   genuinely free each weekday.

Your account then starts **empty**, and the dashboard points you at adding your
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
| **Settings** | Name, subjects, teacher contacts, EE setup, account actions |

The planner is a greedy scheduler: it walks the next 14 days, spends each day's
available hours on the most urgent unfinished work, and caps any one task at 2h
per day so large pieces get spread out rather than crammed.

**Log out** sits in the sidebar footer. With no server there is no session to
end, so it returns you to the start screen while your data stays on the device —
the confirmation says so, because on a shared computer that distinction matters.
**Start over** in Settings is what actually erases.

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

- **No external requests.** No CDNs, web fonts or trackers; the pages work offline.
- **No backend.** No accounts, no database, no environment variables. All data
  stays in the browser under `studyflow-data-v1`.
- **Light and dark themes.** An explicit in-app choice wins, then a theme set by
  a host page, then your OS preference.
- **Responsive** from 390px up, with no horizontal overflow at any width.

## License

[MIT](LICENSE) — free to use, modify and share, with the copyright notice kept.
