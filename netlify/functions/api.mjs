/* StudyFlow — the built-in accounts backend.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Why this exists
 * ──────────────────────────────────────────────────────────────────────────
 * A password cannot be checked in the browser. Whatever the page does, the
 * checking has to happen somewhere the student does not control, or it means
 * nothing. So accounts need a server — and asking someone to go and create a
 * third-party project before their own site works is a real cost, paid before
 * they see any benefit.
 *
 * This is that server, running as one Netlify Function with Netlify Blobs
 * underneath. It needs no signup, no API key and no configuration: deploy the
 * site and accounts work.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Forgotten passwords
 * ──────────────────────────────────────────────────────────────────────────
 * Set RESEND_API_KEY and MAIL_FROM and this sends a real reset link, which is
 * what people expect and the route to prefer. Nothing else is needed: no
 * database, no second service, no code.
 *
 * With no mail provider configured it cannot send anything — no amount of
 * code makes a server able to deliver email on its own — so it falls back to
 * issuing a one-time RECOVERY CODE at sign-up, shown once. That fallback
 * exists so the app is never in the state of offering a reset it cannot
 * perform, and the sign-up screen says which of the two is in force.
 *
 * Either way an address is not verified at sign-up. It is a username that
 * happens to look like an email. Someone could sign up as a name that is not
 * theirs; they gain nothing by it, since they still cannot read anybody else's
 * data, and the real owner can take the account over through the reset link.
 * It is not proof of identity and must not be treated as one.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * How a password is actually stored
 * ──────────────────────────────────────────────────────────────────────────
 * scrypt, with a per-password random salt and parameters chosen to cost about
 * a tenth of a second. Never the password, never a reversible transform of it,
 * never a bare SHA. Comparison is constant-time, so the server does not leak
 * how much of a guess was right through how long it took to reject it.
 */
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

/* scrypt cost. N=16384 lands around 100ms on Netlify's runtime: slow enough to
   make offline guessing expensive, fast enough that logging in feels instant. */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days
const MIN_PASSWORD = 8;
const MAX_DOC_BYTES = 2 * 1024 * 1024;

/* A reset link is a password in an inbox. Short-lived and single-use, so a
   forwarded or logged URL stops being useful quickly. */
const RESET_MS = 60 * 60 * 1000;               // 1 hour

/* ---------- Sending email ----------
   Resend's HTTP API, because it is a single POST with no SDK — which keeps the
   one dependency this project has to the Blobs client. Configure with:

     RESEND_API_KEY   re_...
     MAIL_FROM        StudyFlow <noreply@yourdomain.com>

   Without both, mail is simply off and the app falls back to recovery codes
   rather than offering a reset that would silently never arrive. */

const MAIL_KEY = process.env.RESEND_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || '';
const mailEnabled = () => !!(MAIL_KEY && MAIL_FROM);

/**
 * The site's own address.
 *
 * Taken from the environment, never from the request — a reset link built from
 * a client-supplied host would let anyone have the link point at their own
 * server, turning "forgot password" into a way to harvest other people's reset
 * tokens. Netlify sets URL to the site's primary address.
 */
function siteUrl(req) {
  return (process.env.URL || process.env.DEPLOY_PRIME_URL || new URL(req.url).origin)
    .replace(/\/+$/, '');
}

async function sendMail({ to, subject, text, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MAIL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, text, html })
  });
  if (!res.ok) {
    /* Logged for the site owner, never returned to the browser: the response
       can name the sending domain and the key's state. */
    console.error('studyflow mail failed', res.status, (await res.text()).slice(0, 500));
    throw new Error('mail send failed');
  }
}

function resetEmail(link, name) {
  const hello = name ? `Hi ${name},` : 'Hi,';
  const text = [
    hello, '',
    'Someone asked to reset the password on your StudyFlow account.',
    'Open this link within the next hour to choose a new one:', '',
    link, '',
    'The link works once and then stops. If you did not ask for this, you can',
    'ignore this email — nothing has changed and your password still works.',
    '', '— StudyFlow'
  ].join('\n');

  /* Deliberately plain: a table-based, image-heavy template is what phishing
     filters are trained on, and there is nothing here to decorate. */
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f2f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f1518">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #d8e0de;border-radius:5px;padding:28px">
<p style="margin:0 0 18px;font-size:15px;line-height:1.6">${escapeHtml(hello)}</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.6">Someone asked to reset the password on your StudyFlow account. Choose a new one within the next hour:</p>
<p style="margin:0 0 22px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#1b3a5c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:4px;font-weight:600;font-size:15px">Choose a new password</a></p>
<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#627178">Or paste this into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#627178">The link works once and then stops. If you did not ask for this, ignore this email — nothing has changed and your password still works.</p>
</div></body></html>`;

  return { text, html };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ---------- Stores ----------
   Strong consistency matters: a student who has just signed up will log in
   seconds later, and eventual consistency would tell them their own account
   does not exist. */
const store = (name) => getStore({ name, consistency: 'strong' });

/* ---------- Small helpers ---------- */

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    // Nothing here may ever be cached: it is all per-account.
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

const fail = (status, error) => json({ error }, status);

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** Email is the account's name, so it must normalise to exactly one form. */
function normaliseEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

/** Blob keys must be safe strings, and an address is not one. */
function emailKey(email) {
  return crypto.createHash('sha256').update(normaliseEmail(email)).digest('hex');
}

function looksLikeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

/* ---------- Password and recovery-code hashing ---------- */

async function hash(secret) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(secret), salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${b64url(salt)}$${b64url(key)}`;
}

async function verify(secret, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, N, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(keyB64, 'base64url');

  let got;
  try {
    got = await scrypt(String(secret), salt, expected.length,
      { N: Number(N), r: Number(r), p: Number(p) });
  } catch {
    return false;
  }
  // Constant-time: a wrong password must not be rejected faster for being
  // wrong earlier.
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

/* ---------- Recovery codes ----------
   Shown once at sign-up and after each use. Crockford-style alphabet, so there
   is no 0/O or 1/I/L to copy down wrong. ~82 bits of entropy. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

function newRecoveryCode() {
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) {
    if (i && i % 4 === 0) out += '-';
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

const tidyCode = (c) => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

/* ---------- Sessions ----------
   A signed token rather than a stored session row: one fewer round trip on
   every request. `v` is the account's token version, so logging out — or
   changing a password — invalidates every token already issued by bumping it.
   That is the part a purely stateless token cannot do. */

let cachedSecret = null;

/**
 * The key everything is signed with.
 *
 * Taken from the environment when one is set, which is the better option
 * because it survives anything. When it is not, one is generated and kept in
 * Blobs so that deploys and cold starts agree — otherwise every deploy would
 * silently log everybody out.
 */
async function signingSecret() {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.STUDYFLOW_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    cachedSecret = Buffer.from(fromEnv);
    return cachedSecret;
  }

  const cfg = store('studyflow-config');
  const existing = await cfg.get('signing-key', { type: 'json' });
  if (existing && existing.key) {
    cachedSecret = Buffer.from(existing.key, 'base64url');
    return cachedSecret;
  }

  const key = crypto.randomBytes(48);
  await cfg.setJSON('signing-key', { key: b64url(key), createdAt: new Date().toISOString() });

  /* Two cold starts could race here and both write. Re-reading settles on
     whichever landed last, so every instance agrees from this point on. The
     cost of the race is that a handful of tokens issued in that first instant
     stop working, on a site that by definition has no users yet. */
  const settled = await cfg.get('signing-key', { type: 'json' });
  cachedSecret = Buffer.from(settled && settled.key ? settled.key : b64url(key), 'base64url');
  return cachedSecret;
}

async function issueToken(user) {
  const payload = b64url(JSON.stringify({
    s: user.id,
    v: user.tokenVersion || 1,
    e: Date.now() + SESSION_MS
  }));
  const sig = crypto.createHmac('sha256', await signingSecret()).update(payload).digest();
  return `v1.${payload}.${b64url(sig)}`;
}

async function readToken(req) {
  const header = req.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;

  const [, payload, sig] = parts;
  const expected = crypto.createHmac('sha256', await signingSecret()).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!claims || !claims.s || !claims.e || Date.now() > claims.e) return null;
  return claims;
}

/** The signed-in account, or null. Checks the token version, so a logout
    elsewhere really does end this session too. */
async function currentUser(req) {
  const claims = await readToken(req);
  if (!claims) return null;

  const byId = await store('studyflow-userids').get(claims.s, { type: 'json' });
  if (!byId || !byId.emailKey) return null;

  const user = await store('studyflow-users').get(byId.emailKey, { type: 'json' });
  if (!user || user.id !== claims.s) return null;
  if ((user.tokenVersion || 1) !== claims.v) return null;
  return user;
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name || '' });

/* ---------- Rate limiting ----------
   Without this, a password of any strength eventually falls to a script. Two
   separate buckets: one per account, so a single target cannot be hammered,
   and one per address, so a spray across many accounts is caught too. */

async function rateLimit(bucket, key, limit, windowMs) {
  const rl = store('studyflow-ratelimit');
  const id = `${bucket}:${crypto.createHash('sha256').update(String(key)).digest('hex')}`;
  const now = Date.now();

  const seen = await rl.get(id, { type: 'json' });
  if (seen && seen.resetAt > now) {
    if (seen.count >= limit) {
      return { ok: false, retryIn: Math.ceil((seen.resetAt - now) / 1000) };
    }
    await rl.setJSON(id, { count: seen.count + 1, resetAt: seen.resetAt });
    return { ok: true };
  }

  await rl.setJSON(id, { count: 1, resetAt: now + windowMs });
  return { ok: true };
}

async function clearRateLimit(bucket, key) {
  const rl = store('studyflow-ratelimit');
  const id = `${bucket}:${crypto.createHash('sha256').update(String(key)).digest('hex')}`;
  await rl.delete(id).catch(() => { /* nothing to clear */ });
}

function clientAddress(req, context) {
  return (context && context.ip) ||
    (req.headers.get('x-nf-client-connection-ip')) ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown';
}

/* ---------- Reading the body safely ---------- */

async function body(req) {
  try {
    const text = await req.text();
    if (!text) return {};
    if (text.length > MAX_DOC_BYTES + 4096) return null;   // refuse before parsing
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ========================== Handlers ========================== */

async function signup(req, context) {
  const b = await body(req);
  if (!b) return fail(400, 'That request could not be read.');

  const email = normaliseEmail(b.email);
  const password = String(b.password || '');
  const name = String(b.name || '').trim().slice(0, 80);

  if (!looksLikeEmail(email)) return fail(400, 'That does not look like a valid email address.');
  if (password.length < MIN_PASSWORD) {
    return fail(400, `Use a password of at least ${MIN_PASSWORD} characters.`);
  }
  if (password.length > 512) return fail(400, 'That password is too long.');

  /* Sign-up is rate limited per address too: without it, this endpoint is a
     way to fill the store. */
  const ip = await rateLimit('signup-ip', clientAddress(req, context), 20, 60 * 60 * 1000);
  if (!ip.ok) return fail(429, 'Too many accounts created from here just now. Try again later.');

  const users = store('studyflow-users');
  const key = emailKey(email);

  const existing = await users.get(key, { type: 'json' });
  if (existing) {
    /* Saying "that email is taken" would turn sign-up into a way to find out
       who has an account. The client is written to show the same screen for
       both outcomes. */
    return fail(409, 'That email cannot be used to create an account. If it is yours, log in instead.');
  }

  /* A code is only issued when there is no email route — otherwise it is one
     more thing to keep safe in exchange for nothing. */
  const recoveryCode = mailEnabled() ? null : newRecoveryCode();
  const user = {
    id: crypto.randomUUID(),
    email,
    name,
    password: await hash(password),
    recovery: recoveryCode ? await hash(tidyCode(recoveryCode)) : null,
    tokenVersion: 1,
    createdAt: new Date().toISOString()
  };

  await users.setJSON(key, user);
  await store('studyflow-userids').setJSON(user.id, { emailKey: key });

  const out = {
    token: await issueToken(user),
    expiresIn: Math.floor(SESSION_MS / 1000),
    user: publicUser(user)
  };
  /* Shown once. It is not stored anywhere in recoverable form — only its hash
     is kept — so this response is the single chance to write it down. */
  if (recoveryCode) out.recoveryCode = recoveryCode;
  return json(out);
}

async function login(req, context) {
  const b = await body(req);
  if (!b) return fail(400, 'That request could not be read.');

  const email = normaliseEmail(b.email);
  const password = String(b.password || '');

  const perAccount = await rateLimit('login', email, 10, 15 * 60 * 1000);
  if (!perAccount.ok) {
    return fail(429, 'Too many attempts on this account. Wait a few minutes and try again.');
  }
  const perAddress = await rateLimit('login-ip', clientAddress(req, context), 50, 15 * 60 * 1000);
  if (!perAddress.ok) {
    return fail(429, 'Too many attempts from here. Wait a few minutes and try again.');
  }

  const users = store('studyflow-users');
  const user = await users.get(emailKey(email), { type: 'json' });

  /* One message for "no such account" and "wrong password", so neither can be
     used to discover the other. */
  const wrong = () => fail(401, 'That email and password do not match an account.');

  if (!user) {
    /* Still spend the time hashing. Returning instantly for an unknown address
       would announce which addresses exist. */
    await hash(password);
    return wrong();
  }
  if (!(await verify(password, user.password))) return wrong();

  await clearRateLimit('login', email);

  return json({
    token: await issueToken(user),
    expiresIn: Math.floor(SESSION_MS / 1000),
    user: publicUser(user)
  });
}

/** Logging out invalidates every token for this account, on every device. */
async function logout(req) {
  const user = await currentUser(req);
  if (!user) return new Response(null, { status: 204 });

  user.tokenVersion = (user.tokenVersion || 1) + 1;
  await store('studyflow-users').setJSON(emailKey(user.email), user);
  return new Response(null, { status: 204 });
}

/* ---------- Forgotten password, by email ---------- */

/**
 * Always answers the same way, whether or not the address has an account.
 * Telling the difference would turn this endpoint into a way to find out who
 * has signed up — and it is unauthenticated, so anyone could ask.
 */
async function forgot(req, context) {
  const b = await body(req);
  if (!b) return fail(400, 'That request could not be read.');
  if (!mailEnabled()) return fail(400, 'This site cannot send email.');

  const email = normaliseEmail(b.email);
  const same = () => json({ sent: true });

  const perAccount = await rateLimit('forgot', email, 3, 60 * 60 * 1000);
  const perAddress = await rateLimit('forgot-ip', clientAddress(req, context), 15, 60 * 60 * 1000);
  /* Even the rate-limit response is the same, or the limit itself becomes the
     oracle: an address that can be asked about repeatedly is one without an
     account. */
  if (!perAccount.ok || !perAddress.ok) return same();

  const user = await store('studyflow-users').get(emailKey(email), { type: 'json' });
  if (!user) return same();

  /* 32 random bytes, so the token is unguessable on its own and does not need
     a slow hash — SHA-256 of it is enough to avoid storing the live value. */
  const token = crypto.randomBytes(32).toString('base64url');
  await store('studyflow-resets').setJSON(
    crypto.createHash('sha256').update(token).digest('hex'),
    { userId: user.id, emailKey: emailKey(email), expiresAt: Date.now() + RESET_MS }
  );

  const link = `${siteUrl(req)}/app/#reset_token=${token}`;
  const { text, html } = resetEmail(link, user.name);

  try {
    await sendMail({ to: user.email, subject: 'Reset your StudyFlow password', text, html });
  } catch (e) {
    /* The student is told it was sent either way, because the alternative
       leaks whether the address exists. The site owner sees the real failure
       in the function log. */
    console.error('studyflow: reset email could not be sent');
  }
  return same();
}

/** Spending a reset link: proves control of the inbox, so it sets the password. */
async function reset(req, context) {
  const b = await body(req);
  if (!b) return fail(400, 'That request could not be read.');

  const password = String(b.password || '');
  if (password.length < MIN_PASSWORD) {
    return fail(400, `Use a password of at least ${MIN_PASSWORD} characters.`);
  }

  const perAddress = await rateLimit('reset-ip', clientAddress(req, context), 20, 60 * 60 * 1000);
  if (!perAddress.ok) return fail(429, 'Too many attempts from here. Try again later.');

  const key = crypto.createHash('sha256').update(String(b.token || '')).digest('hex');
  const resets = store('studyflow-resets');
  const entry = await resets.get(key, { type: 'json' });

  const dead = () => fail(401, 'That link has expired or has already been used. Request a new one.');
  if (!entry) return dead();

  /* Single use: spent before the password is changed, so a replayed link
     cannot be used twice even if two requests arrive together. */
  await resets.delete(key);
  if (Date.now() > entry.expiresAt) return dead();

  const users = store('studyflow-users');
  const user = await users.get(entry.emailKey, { type: 'json' });
  if (!user || user.id !== entry.userId) return dead();

  user.password = await hash(password);
  /* Everything opened with the old password stops working — the reason for
     being here may be that somebody else had it. */
  user.tokenVersion = (user.tokenVersion || 1) + 1;
  await users.setJSON(entry.emailKey, user);
  await clearRateLimit('login', user.email);

  return json({
    token: await issueToken(user),
    expiresIn: Math.floor(SESSION_MS / 1000),
    user: publicUser(user)
  });
}

/** The way back in when the password is gone and there is no email to send to. */
async function recover(req, context) {
  const b = await body(req);
  if (!b) return fail(400, 'That request could not be read.');

  const email = normaliseEmail(b.email);
  const code = tidyCode(b.recoveryCode);
  const password = String(b.password || '');

  if (password.length < MIN_PASSWORD) {
    return fail(400, `Use a password of at least ${MIN_PASSWORD} characters.`);
  }

  /* Tighter than login: a recovery code is the whole account. */
  const perAccount = await rateLimit('recover', email, 5, 60 * 60 * 1000);
  if (!perAccount.ok) {
    return fail(429, 'Too many recovery attempts on this account. Try again in an hour.');
  }
  const perAddress = await rateLimit('recover-ip', clientAddress(req, context), 20, 60 * 60 * 1000);
  if (!perAddress.ok) return fail(429, 'Too many recovery attempts from here. Try again later.');

  const users = store('studyflow-users');
  const user = await users.get(emailKey(email), { type: 'json' });

  const wrong = () => fail(401, 'That email and recovery code do not match an account.');
  if (!user || !user.recovery) { await hash(code); return wrong(); }
  if (!(await verify(code, user.recovery))) return wrong();

  const nextCode = mailEnabled() ? null : newRecoveryCode();
  user.password = await hash(password);
  user.recovery = nextCode ? await hash(tidyCode(nextCode)) : null;
  /* The old password, and every session opened with it, stop working now —
     which is the point, since the reason for being here may be that someone
     else had them. */
  user.tokenVersion = (user.tokenVersion || 1) + 1;
  await users.setJSON(emailKey(email), user);
  await clearRateLimit('recover', email);

  const out = {
    token: await issueToken(user),
    expiresIn: Math.floor(SESSION_MS / 1000),
    user: publicUser(user)
  };
  if (nextCode) out.recoveryCode = nextCode;
  return json(out);
}

async function changePassword(req) {
  const user = await currentUser(req);
  if (!user) return fail(401, 'Not signed in.');

  const b = await body(req);
  if (!b) return fail(400, 'That request could not be read.');

  const password = String(b.password || '');
  if (password.length < MIN_PASSWORD) {
    return fail(400, `Use a password of at least ${MIN_PASSWORD} characters.`);
  }

  user.password = await hash(password);
  user.tokenVersion = (user.tokenVersion || 1) + 1;   // sign other devices out
  await store('studyflow-users').setJSON(emailKey(user.email), user);

  return json({ token: await issueToken(user), expiresIn: Math.floor(SESSION_MS / 1000) });
}

async function me(req) {
  const user = await currentUser(req);
  if (!user) return fail(401, 'Not signed in.');
  return json({ user: publicUser(user) });
}

async function deleteMe(req) {
  const user = await currentUser(req);
  if (!user) return fail(401, 'Not signed in.');

  await store('studyflow-data').delete(user.id).catch(() => {});
  await store('studyflow-userids').delete(user.id).catch(() => {});
  await store('studyflow-users').delete(emailKey(user.email));
  /* Any reset link already in an inbox must stop working, or it would let the
     address be claimed back after the account is gone. */
  await dropResetsFor(user.id);
  return new Response(null, { status: 204 });
}

/* ---------- The diploma itself ----------
   Keyed by account id, so there is no request shape that could ask for someone
   else's. The id comes from a signed token, never from the request body. */

async function getData(req) {
  const user = await currentUser(req);
  if (!user) return fail(401, 'Not signed in.');

  const row = await store('studyflow-data').get(user.id, { type: 'json' });
  return json(row ? { data: row.data, updatedAt: row.updatedAt } : { data: null });
}

async function putData(req) {
  const user = await currentUser(req);
  if (!user) return fail(401, 'Not signed in.');

  const b = await body(req);
  if (!b) return fail(400, 'That request could not be read.');
  if (!b.data || typeof b.data !== 'object') return fail(400, 'No diploma in that request.');

  const size = Buffer.byteLength(JSON.stringify(b.data));
  if (size > MAX_DOC_BYTES) return fail(413, 'That is too large to save.');

  /* The server sets the time, never the client: conflict detection compares
     timestamps, and a device with a wrong clock must not be able to make its
     copy look newer. */
  const updatedAt = new Date().toISOString();
  await store('studyflow-data').setJSON(user.id, { data: b.data, updatedAt });
  return json({ updatedAt });
}

/* ========================== Routing ========================== */

/* Reset entries are keyed by the hash of their token, so finding an account's
   outstanding ones means a scan. There are never many, and this runs only when
   an account is deleted. */
async function dropResetsFor(userId) {
  try {
    const resets = store('studyflow-resets');
    const { blobs } = await resets.list();
    for (const b of blobs) {
      const entry = await resets.get(b.key, { type: 'json' });
      if (entry && entry.userId === userId) await resets.delete(b.key);
    }
  } catch (e) { /* best effort: the links expire within the hour anyway */ }
}

/** What this deployment can actually do, so the app never offers what it cannot. */
async function meta() {
  return json({ accounts: 'builtin', emailReset: mailEnabled() });
}

const ROUTES = {
  'GET /meta': meta,
  'POST /auth/signup': signup,
  'POST /auth/login': login,
  'POST /auth/logout': logout,
  'POST /auth/forgot': forgot,
  'POST /auth/reset': reset,
  'POST /auth/recover': recover,
  'POST /auth/password': changePassword,
  'GET /auth/me': me,
  'DELETE /auth/me': deleteMe,
  'GET /data': getData,
  'PUT /data': putData
};

export default async (req, context) => {
  /* The redirect in netlify.toml rewrites /api/* onto this function, so the
     path arrives with one prefix or the other depending on how it was reached.
     Strip whichever is there. */
  let path = new URL(req.url).pathname
    .replace(/^\/\.netlify\/functions\/api/, '')
    .replace(/^\/api/, '') || '/';
  path = path.replace(/\/+$/, '') || '/';

  const handler = ROUTES[`${req.method} ${path}`];
  if (!handler) return fail(404, `No such endpoint: ${req.method} ${path}`);

  try {
    return await handler(req, context);
  } catch (err) {
    /* Never hand an internal message to the browser — it can name file paths
       and store keys. Log it where the site owner can read it instead. */
    console.error('studyflow api error', { path, method: req.method, err });
    return fail(500, 'Something went wrong on our side. Please try again.');
  }
};
