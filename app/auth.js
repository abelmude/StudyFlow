/* StudyFlow — real email + password accounts. Exposes window.SFAuth.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Why it is built this way
 * ──────────────────────────────────────────────────────────────────────────
 * StudyFlow is a static site: there is no server of ours to check a password
 * against. A password cannot be verified in the browser — anything that looks
 * like it is checking one client-side is checking it against something the
 * user already has, which is theatre, not security. So authentication is done
 * by a real identity provider (Supabase Auth / GoTrue), which hashes passwords
 * server-side with bcrypt, issues short-lived signed JWTs, and owns email
 * confirmation and password resets.
 *
 * It talks to that provider over plain fetch rather than through an SDK, so the
 * app keeps its one real virtue: no dependencies, no build step, nothing to go
 * stale. The whole client is this file.
 *
 * If no provider is configured (app/config.js blank), accounts are simply off
 * and StudyFlow behaves exactly as it did before — local, private, offline.
 * That matters: it means a deploy can never be broken by a misconfigured
 * backend, only missing a feature.
 *
 * Token storage: the access and refresh tokens live in localStorage. That is
 * what Supabase's own SDK does, and it is the only option for a site with no
 * backend to set an httpOnly cookie. The honest trade-off is that any XSS on
 * this origin can read them — which is why the app loads no third-party
 * scripts, no CDN, no analytics and no fonts. Access tokens are short-lived
 * (one hour) and refreshed, so a leak is bounded rather than permanent.
 */
(function () {
  'use strict';

  var KEY = 'studyflow-auth-v1';
  var cfg = window.SF_CONFIG || {};
  var URL_BASE = (cfg.supabaseUrl || '').replace(/\/+$/, '');
  var ANON = cfg.supabaseAnonKey || '';

  /** Accounts only exist if a provider was configured at build time. */
  function enabled() { return !!(URL_BASE && ANON); }

  /* ---------- Session storage ---------- */

  var session = null;
  var listeners = [];

  function readStored() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (s && s.access_token && s.refresh_token && s.user && s.user.id) return s;
    } catch (e) { /* corrupt or unavailable — treat as signed out */ }
    return null;
  }

  function store(s) {
    session = s;
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch (e) { /* private mode: the session simply does not survive reload */ }
    listeners.forEach(function (fn) { try { fn(s); } catch (e) { /* listener's problem */ } });
  }

  function onChange(fn) { listeners.push(fn); }

  /** Shape a GoTrue token response into what we keep. */
  function adopt(json) {
    store({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      /* Absolute expiry, since a relative expires_in is meaningless after a
         reload. 60s of slack so a request never leaves with a token that
         expires mid-flight. */
      expires_at: Date.now() + (((json.expires_in || 3600) - 60) * 1000),
      user: {
        id: json.user.id,
        email: json.user.email,
        name: (json.user.user_metadata && json.user.user_metadata.name) || '',
        confirmedAt: json.user.email_confirmed_at || json.user.confirmed_at || null
      }
    });
    return session;
  }

  /* ---------- Errors ----------
     GoTrue reports failures under half a dozen different keys depending on the
     endpoint and version. Normalising once here keeps every call site simple,
     and lets the messages a student actually reads be written in plain English
     rather than passed through raw. */

  var FRIENDLY = [
    [/invalid login credentials|invalid_grant/i,
      'That email and password do not match an account. Check for typos, or reset your password.'],
    [/email not confirmed/i,
      'Confirm your email first — check your inbox for the link we sent, including the spam folder.'],
    [/user already registered|already been registered/i,
      'There is already an account with that email. Log in instead, or reset the password.'],
    [/password should be at least/i,
      'That password is too short. Use at least 8 characters.'],
    [/weak.?password|password is too weak|pwned/i,
      'That password is too easy to guess. Try a longer one, or three unrelated words.'],
    [/unable to validate email|invalid email|email_address_invalid/i,
      'That does not look like a valid email address.'],
    [/rate ?limit|too many requests|email rate limit/i,
      'Too many attempts just now. Wait a minute and try again.'],
    [/signups? not allowed|signup is disabled/i,
      'New sign-ups are turned off for this site.']
  ];

  function describe(status, json, fallback) {
    var raw = (json && (json.error_description || json.msg || json.message ||
      json.error_message || (typeof json.error === 'string' ? json.error : ''))) || '';
    for (var i = 0; i < FRIENDLY.length; i++) {
      if (FRIENDLY[i][0].test(raw)) return FRIENDLY[i][1];
    }
    if (raw) return raw.charAt(0).toUpperCase() + raw.slice(1);
    if (status === 0) return 'Could not reach the account server. Check your connection and try again.';
    return fallback || ('Something went wrong (error ' + status + ').');
  }

  function AuthError(message, status) {
    var e = new Error(message);
    e.name = 'AuthError';
    e.status = status;
    return e;
  }

  /* ---------- Raw request helper ---------- */

  function call(path, opts) {
    opts = opts || {};
    var headers = { apikey: ANON, 'Content-Type': 'application/json' };
    if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
    Object.keys(opts.headers || {}).forEach(function (k) { headers[k] = opts.headers[k]; });

    return fetch(URL_BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).catch(function () {
      throw AuthError(describe(0, null), 0);
    }).then(function (res) {
      /* 204 and empty bodies are normal (logout), so never assume JSON. */
      return res.text().then(function (text) {
        var json = null;
        if (text) { try { json = JSON.parse(text); } catch (e) { /* non-JSON body */ } }
        if (!res.ok) throw AuthError(describe(res.status, json, opts.fallback), res.status);
        return json || {};
      });
    });
  }

  /* ---------- Sign up / in / out ---------- */

  function returnUrl() {
    /* Where the confirmation and reset links come back to. Must be listed under
       Authentication → URL Configuration in Supabase or it is ignored. */
    return location.origin + location.pathname;
  }

  function signUp(email, password, name) {
    return call('/auth/v1/signup', {
      method: 'POST',
      body: {
        email: String(email || '').trim(),
        password: password,
        data: { name: String(name || '').trim() },
        gotrue_meta_security: {}
      },
      headers: { 'X-Client-Info': 'studyflow' }
    }).then(function (json) {
      /* Two legitimate outcomes. With email confirmation on (the default, and
         the right setting) there is no session yet and the student must click
         the link. With it off, we are signed straight in. */
      if (json.access_token) return { session: adopt(json), needsConfirmation: false };

      /* Supabase deliberately returns a user-shaped object with no identities
         when the address is already taken, so that signup cannot be used to
         enumerate who has an account. Treat it as "check your email" too —
         saying "that email is taken" here would undo that protection. */
      return {
        session: null,
        needsConfirmation: true,
        email: (json && json.email) || String(email || '').trim()
      };
    });
  }

  function signIn(email, password) {
    return call('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email: String(email || '').trim(), password: password }
    }).then(adopt);
  }

  function signOut() {
    var token = session && session.access_token;
    store(null);
    if (!token) return Promise.resolve();
    /* Revoke server-side too, but a failure here must not keep someone logged
       in on a shared computer — the local session is already gone. */
    return call('/auth/v1/logout', { method: 'POST', token: token })
      .catch(function () { /* already expired, or offline */ });
  }

  function requestPasswordReset(email) {
    return call('/auth/v1/recover', {
      method: 'POST',
      body: { email: String(email || '').trim() },
      headers: { 'X-Client-Info': 'studyflow' }
    });
  }

  function setPassword(password) {
    return withToken(function (token) {
      return call('/auth/v1/user', { method: 'PUT', token: token, body: { password: password } });
    });
  }

  function setName(name) {
    return withToken(function (token) {
      return call('/auth/v1/user', {
        method: 'PUT', token: token, body: { data: { name: String(name || '').trim() } }
      });
    }).then(function () {
      if (session) { session.user.name = String(name || '').trim(); store(session); }
    });
  }

  /** Permanently delete the account's stored data, then the session.
      Deleting the auth user itself needs admin rights, so that is handled by a
      Postgres trigger on the data row — see supabase/schema.sql. */
  function deleteAccount() {
    return withToken(function (token) {
      return fetch(URL_BASE + '/rest/v1/rpc/delete_me', {
        method: 'POST',
        headers: { apikey: ANON, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: '{}'
      });
    }).then(function () { return signOut(); }, function () { return signOut(); });
  }

  /* ---------- Token freshness ----------
     Access tokens last an hour. Rather than refreshing on a timer (which dies
     when the tab sleeps, exactly when it is needed), refresh lazily: anything
     that needs a token asks for a fresh one first. */

  var refreshing = null;

  function refresh() {
    if (refreshing) return refreshing;
    if (!session) return Promise.reject(AuthError('Not signed in', 401));

    refreshing = call('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token }
    }).then(function (json) {
      refreshing = null;
      return adopt(json);
    }, function (err) {
      refreshing = null;
      /* A rejected refresh token means the session is genuinely over — signed
         out elsewhere, password changed, or token revoked. Anything else
         (offline, 500) must NOT throw the student out of their own app. */
      if (err.status === 400 || err.status === 401 || err.status === 403) store(null);
      throw err;
    });
    return refreshing;
  }

  /** Run fn with a valid access token, refreshing first if it is due. */
  function withToken(fn) {
    if (!session) return Promise.reject(AuthError('Not signed in', 401));
    var fresh = Date.now() < session.expires_at
      ? Promise.resolve(session)
      : refresh();

    return fresh.then(function (s) {
      return Promise.resolve(fn(s.access_token)).catch(function (err) {
        /* Rejected anyway — one retry after a forced refresh covers a clock
           skew or a token revoked mid-flight. */
        if (err && err.status === 401) {
          return refresh().then(function (s2) { return fn(s2.access_token); });
        }
        throw err;
      });
    });
  }

  /* ---------- Email links coming back ----------
     Confirmation and password-reset links return to the app with tokens in the
     URL fragment. That fragment is also our router's home, so it has to be
     consumed and cleared before routing — otherwise the app would try to
     navigate to "#access_token=…" and the tokens would sit in the address bar,
     in history, and in any link the student pasted to a friend. */

  function consumeUrl() {
    var hash = location.hash || '';
    var search = location.search || '';
    var result = null;

    function clearFragment() {
      /* replaceState rather than assigning location.hash, so no history entry
         and no hashchange — the router has not started yet. */
      try {
        history.replaceState(null, '', location.pathname);
      } catch (e) {
        location.hash = '';
      }
    }

    /* Errors arrive in either place depending on where they were detected. */
    var errSource = /error/.test(hash) ? hash.replace(/^#/, '') : (/error/.test(search) ? search.replace(/^\?/, '') : '');
    if (errSource) {
      var ep = new URLSearchParams(errSource);
      if (ep.get('error') || ep.get('error_code')) {
        var code = ep.get('error_code') || ep.get('error') || '';
        var desc = (ep.get('error_description') || '').replace(/\+/g, ' ');
        clearFragment();
        return {
          type: 'error',
          message: /expired|invalid/i.test(code + ' ' + desc)
            ? 'That link has expired or has already been used. Request a new one below.'
            : (desc || 'That link could not be used. Request a new one below.')
        };
      }
    }

    if (hash.indexOf('access_token=') !== -1) {
      var p = new URLSearchParams(hash.replace(/^#/, ''));
      var at = p.get('access_token');
      var rt = p.get('refresh_token');
      var kind = p.get('type') || '';
      clearFragment();

      if (at && rt) {
        /* Trust but verify: fetch the user this token belongs to rather than
           decoding the JWT here, so a malformed or foreign token fails now
           instead of halfway through the app. */
        result = call('/auth/v1/user', { token: at }).then(function (user) {
          adopt({
            access_token: at,
            refresh_token: rt,
            expires_in: parseInt(p.get('expires_in'), 10) || 3600,
            user: user
          });
          return { type: kind === 'recovery' ? 'recovery' : 'confirmed', session: session };
        }, function () {
          return { type: 'error', message: 'That link has expired or has already been used. Request a new one below.' };
        });
        return result;
      }
    }

    return null;
  }

  /* ---------- Boot ---------- */

  session = readStored();

  function user() { return session ? session.user : null; }
  function isSignedIn() { return !!session; }

  /** Confirms the stored session is still good, without blocking the app on it. */
  function verify() {
    if (!session) return Promise.resolve(null);
    return withToken(function (token) {
      return call('/auth/v1/user', { token: token });
    }).then(function (u) {
      if (session && u && u.id === session.user.id) {
        session.user.email = u.email;
        session.user.name = (u.user_metadata && u.user_metadata.name) || session.user.name;
        store(session);
      }
      return session;
    }, function (err) {
      /* Only a definitive rejection signs anyone out; being offline must not. */
      if (err && (err.status === 401 || err.status === 403)) store(null);
      return session;
    });
  }

  window.SFAuth = {
    enabled: enabled,
    isSignedIn: isSignedIn,
    user: user,
    onChange: onChange,

    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    requestPasswordReset: requestPasswordReset,
    setPassword: setPassword,
    setName: setName,
    deleteAccount: deleteAccount,

    withToken: withToken,
    verify: verify,
    consumeUrl: consumeUrl,

    /* Exposed for the sync layer and for tests. */
    url: function () { return URL_BASE; },
    anonKey: function () { return ANON; }
  };
})();
