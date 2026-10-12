/* StudyFlow — accounts. Exposes window.SFAuth.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Why it is built this way
 * ──────────────────────────────────────────────────────────────────────────
 * A password cannot be checked in the browser. Anything that looks like it is
 * checking one client-side is checking it against something the user already
 * has, which is theatre, not security. So the checking happens on a server, and
 * this file is only ever the client of one.
 *
 * There are two servers it can talk to, and the app works the same either way:
 *
 *   built-in   netlify/functions/api.mjs, in this repository. Needs no signup,
 *              no key and no configuration — deploy the site and accounts
 *              work. It sends no email, so an address is a username rather
 *              than a verified identity, and a forgotten password is recovered
 *              with a one-time code issued at sign-up instead of a reset link.
 *
 *   Supabase   a hosted identity service. Needs a free project and two
 *              environment variables, and in exchange gives genuinely verified
 *              addresses and emailed password resets. SETUP.md covers it.
 *
 * Whichever is in use, this file talks to it over plain fetch. No SDK, so the
 * browser still downloads nothing but the app itself.
 *
 * Token storage: the session lives in localStorage. That is what Supabase's own
 * library does and the only option for a site with no backend of its own to
 * set an httpOnly cookie. The honest trade-off is that script running on this
 * origin could read it — which is why the app loads no third-party scripts at
 * all: no CDN, no analytics, no web fonts.
 */
(function () {
  'use strict';

  var KEY = 'studyflow-auth-v1';
  var cfg = window.SF_CONFIG || {};

  var SUPA_URL = (cfg.supabaseUrl || '').replace(/\/+$/, '');
  var SUPA_KEY = cfg.supabaseAnonKey || '';

  /* Which backend this deployment has. Decided at build time by
     scripts/write-config.js, because only the build knows whether it is
     running on a host that serves the functions. */
  var MODE = cfg.accounts || (SUPA_URL && SUPA_KEY ? 'supabase' : '');

  function enabled() { return MODE === 'builtin' || MODE === 'supabase'; }
  function provider() { return enabled() ? MODE : ''; }

  /** What this backend can actually do, so the UI never offers what it cannot. */
  function can() {
    return {
      /* Does the address get verified? */
      verifiesEmail: MODE === 'supabase',
      /* Is there a "we emailed you a link" path? */
      emailReset: MODE === 'supabase',
      /* Or a code the student has to keep? */
      recoveryCode: MODE === 'builtin'
    };
  }

  /* ---------- Session ---------- */

  var session = null;
  var listeners = [];

  function readStored() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.access_token || !s.user || !s.user.id) return null;
      /* A session belongs to the backend that issued it. If the site has been
         switched from one to the other, the old token is meaningless. */
      if (s.provider && s.provider !== MODE) return null;
      return s;
    } catch (e) { /* corrupt or unavailable — treat as signed out */ }
    return null;
  }

  function store(s) {
    session = s;
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch (e) { /* private mode: the session does not survive a reload */ }
    listeners.forEach(function (fn) { try { fn(s); } catch (e) { /* listener's problem */ } });
  }

  function onChange(fn) { listeners.push(fn); }

  function adopt(o) {
    store({
      provider: MODE,
      access_token: o.access_token,
      refresh_token: o.refresh_token || null,
      /* Absolute, since a relative "expires in" is meaningless after a reload.
         A minute of slack so a request never leaves carrying a token that
         expires mid-flight. */
      expires_at: Date.now() + (((o.expires_in || 3600) - 60) * 1000),
      user: o.user
    });
    return session;
  }

  /* ---------- Errors ----------
     Normalised once, so every call site is simple and the sentences a student
     reads are written here in plain English rather than passed through raw. */

  var FRIENDLY = [
    [/invalid login credentials|invalid_grant|do not match an account/i,
      'That email and password do not match an account. Check for typos, or recover your account below.'],
    [/email not confirmed/i,
      'Confirm your email first — check your inbox for the link we sent, including the spam folder.'],
    [/already registered|already been registered|cannot be used to create/i,
      'That email cannot be used to create a new account. If it is yours, log in instead.'],
    [/password should be at least|at least 8 characters/i,
      'That password is too short. Use at least 8 characters.'],
    [/weak.?password|password is too weak|pwned/i,
      'That password is too easy to guess. Try a longer one, or three unrelated words.'],
    [/unable to validate email|invalid email|email_address_invalid|valid email address/i,
      'That does not look like a valid email address.'],
    [/rate ?limit|too many/i, null],   // the server's own wording is better here
    [/signups? not allowed|signup is disabled/i,
      'New sign-ups are turned off for this site.'],
    [/recovery code/i,
      'That email and recovery code do not match an account.']
  ];

  function describe(status, json) {
    var raw = (json && (json.error_description || json.msg || json.message ||
      json.error_message || (typeof json.error === 'string' ? json.error : ''))) || '';

    for (var i = 0; i < FRIENDLY.length; i++) {
      if (FRIENDLY[i][0].test(raw)) return FRIENDLY[i][1] || raw;
    }
    if (raw) return raw.charAt(0).toUpperCase() + raw.slice(1);
    if (status === 0) return 'Could not reach the account server. Check your connection and try again.';
    return 'Something went wrong (error ' + status + ').';
  }

  function AuthError(message, status) {
    var e = new Error(message);
    e.name = 'AuthError';
    e.status = status;
    return e;
  }

  /** One request, one normalised outcome. */
  function request(url, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    Object.keys(opts.headers || {}).forEach(function (k) { headers[k] = opts.headers[k]; });
    if (opts.token) headers.Authorization = 'Bearer ' + opts.token;

    return fetch(url, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).catch(function () {
      var e = AuthError(describe(0, null), 0);
      e.offline = true;
      throw e;
    }).then(function (res) {
      /* 204 and empty bodies are normal, so never assume there is JSON. */
      return res.text().then(function (text) {
        var json = null;
        if (text) { try { json = JSON.parse(text); } catch (e) { /* not JSON */ } }
        if (!res.ok) throw AuthError(describe(res.status, json), res.status);
        return json || {};
      });
    });
  }

  /* ══════════════════════ The built-in backend ══════════════════════ */

  var builtin = {
    /* The built-in API names its fields for itself rather than imitating
       GoTrue, so they are mapped here — the one place that knows both shapes. */
    take: function (r) {
      return adopt({ access_token: r.token, expires_in: r.expiresIn, user: r.user });
    },

    signUp: function (email, password, name) {
      return request('/api/auth/signup', {
        method: 'POST', body: { email: email, password: password, name: name }
      }).then(function (r) {
        builtin.take(r);
        /* Shown once and never retrievable: only its hash is kept. The caller
           has to put it in front of the student now or not at all. */
        return { session: session, needsConfirmation: false, recoveryCode: r.recoveryCode };
      });
    },

    signIn: function (email, password) {
      return request('/api/auth/login', {
        method: 'POST', body: { email: email, password: password }
      }).then(builtin.take);
    },

    signOut: function (token) {
      return request('/api/auth/logout', { method: 'POST', token: token });
    },

    setPassword: function (password) {
      return withToken(function (token) {
        return request('/api/auth/password', {
          method: 'POST', token: token, body: { password: password }
        });
      }).then(function (r) {
        /* Changing a password signs other devices out, which means a new token
           for this one. */
        if (r && r.token) {
          adopt({ access_token: r.token, expires_in: r.expiresIn, user: session.user });
        }
      });
    },

    /** The way back in with no email to send to. */
    recoverWithCode: function (email, code, password) {
      return request('/api/auth/recover', {
        method: 'POST', body: { email: email, recoveryCode: code, password: password }
      }).then(function (r) {
        builtin.take(r);
        return { session: session, recoveryCode: r.recoveryCode };
      });
    },

    deleteAccount: function () {
      return withToken(function (token) {
        return request('/api/auth/me', { method: 'DELETE', token: token });
      });
    },

    pullDocument: function () {
      return withToken(function (token) {
        return request('/api/data', { token: token });
      }).then(function (r) {
        return r && r.data ? { data: r.data, updatedAt: r.updatedAt } : null;
      });
    },

    pushDocument: function (doc) {
      return withToken(function (token) {
        return request('/api/data', { method: 'PUT', token: token, body: { data: doc } });
      });
    },

    /* No email links, so nothing ever comes back in the URL. */
    consumeUrl: function () { return null; },

    /* Tokens are long-lived and not refreshable: when one expires, logging in
       again is the honest answer rather than a silent half-session. */
    refresh: function () {
      store(null);
      return Promise.reject(AuthError('Your session has expired. Please log in again.', 401));
    }
  };

  /* ══════════════════════ Supabase ══════════════════════ */

  function supaRequest(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ apikey: SUPA_KEY }, opts.headers || {});
    return request(SUPA_URL + path, opts);
  }

  /**
   * Where a confirmation or reset link should come back to.
   *
   * Sent explicitly rather than left to the project's Site URL, because that
   * one setting cannot be right for every address the app is served from — a
   * deploy preview, a custom domain and localhost are all legitimate, and a
   * link returning to the wrong one is a dead end. Supabase ignores any value
   * not in its allow-list, so a tampered one achieves nothing.
   */
  function returnUrl() { return location.origin + location.pathname; }

  function withRedirect(path) {
    return path + (path.indexOf('?') === -1 ? '?' : '&') +
      'redirect_to=' + encodeURIComponent(returnUrl());
  }

  function supaUser(u) {
    return {
      id: u.id,
      email: u.email,
      name: (u.user_metadata && u.user_metadata.name) || ''
    };
  }

  var supabase = {
    signUp: function (email, password, name) {
      return supaRequest(withRedirect('/auth/v1/signup'), {
        method: 'POST',
        body: { email: email, password: password, data: { name: name }, gotrue_meta_security: {} }
      }).then(function (r) {
        /* With email confirmation on — the default, and the right setting —
           there is no session yet and the student must click the link. */
        if (r.access_token) {
          adopt({ access_token: r.access_token, refresh_token: r.refresh_token,
                  expires_in: r.expires_in, user: supaUser(r.user) });
          return { session: session, needsConfirmation: false };
        }
        /* Supabase returns a user-shaped object with no identities when the
           address is taken, so that sign-up cannot be used to find out who has
           an account. Treating it as "check your email" keeps that true. */
        return { session: null, needsConfirmation: true, email: email };
      });
    },

    signIn: function (email, password) {
      return supaRequest('/auth/v1/token?grant_type=password', {
        method: 'POST', body: { email: email, password: password }
      }).then(function (r) {
        return adopt({ access_token: r.access_token, refresh_token: r.refresh_token,
                       expires_in: r.expires_in, user: supaUser(r.user) });
      });
    },

    signOut: function (token) {
      return supaRequest('/auth/v1/logout', { method: 'POST', token: token });
    },

    requestPasswordReset: function (email) {
      return supaRequest(withRedirect('/auth/v1/recover'), {
        method: 'POST', body: { email: email }
      });
    },

    setPassword: function (password) {
      return withToken(function (token) {
        return supaRequest('/auth/v1/user', {
          method: 'PUT', token: token, body: { password: password }
        });
      });
    },

    deleteAccount: function () {
      return withToken(function (token) {
        return supaRequest('/rest/v1/rpc/delete_me', { method: 'POST', token: token, body: {} });
      });
    },

    pullDocument: function () {
      return withToken(function (token) {
        return supaRequest('/rest/v1/student_data?select=data,updated_at', {
          token: token, headers: { Accept: 'application/json' }
        });
      }).then(function (rows) {
        if (!rows || !rows.length) return null;
        return { data: rows[0].data, updatedAt: rows[0].updated_at };
      });
    },

    pushDocument: function (doc) {
      return withToken(function (token) {
        return supaRequest('/rest/v1/student_data', {
          method: 'POST',
          token: token,
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: [{ user_id: session.user.id, data: doc, updated_at: new Date().toISOString() }]
        });
      });
    },

    refresh: function () {
      return supaRequest('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', body: { refresh_token: session.refresh_token }
      }).then(function (r) {
        return adopt({ access_token: r.access_token, refresh_token: r.refresh_token,
                       expires_in: r.expires_in, user: supaUser(r.user) });
      }, function (err) {
        /* A rejected refresh token means the session is genuinely over — signed
           out elsewhere, password changed, revoked. Anything else (offline, a
           500) must NOT throw the student out of their own app. */
        if (err.status === 400 || err.status === 401 || err.status === 403) store(null);
        throw err;
      });
    },

    /* ---------- Email links coming back ----------
       Confirmation and reset links return with tokens in the URL fragment —
       which is also the router's home, so they have to be consumed and cleared
       before routing. Otherwise the app would try to navigate to
       "#access_token=…", and the tokens would sit in the address bar, in
       history, and in any link the student pasted to a friend. */
    consumeUrl: function () {
      var hash = location.hash || '';
      var search = location.search || '';

      function clearFragment() {
        try { history.replaceState(null, '', location.pathname); }
        catch (e) { location.hash = ''; }
      }

      var errSource = /error/.test(hash) ? hash.replace(/^#/, '')
        : (/error/.test(search) ? search.replace(/^\?/, '') : '');
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

      if (hash.indexOf('access_token=') === -1) return null;

      var p = new URLSearchParams(hash.replace(/^#/, ''));
      var at = p.get('access_token');
      var rt = p.get('refresh_token');
      var kind = p.get('type') || '';
      clearFragment();
      if (!at || !rt) return null;

      /* Trust but verify: ask who this token belongs to rather than decoding
         it here, so a malformed or foreign one fails now instead of halfway
         through the app. */
      return supaRequest('/auth/v1/user', { token: at }).then(function (u) {
        adopt({
          access_token: at, refresh_token: rt,
          expires_in: parseInt(p.get('expires_in'), 10) || 3600,
          user: supaUser(u)
        });
        return { type: kind === 'recovery' ? 'recovery' : 'confirmed', session: session };
      }, function () {
        return { type: 'error', message: 'That link has expired or has already been used. Request a new one below.' };
      });
    }
  };

  /* ══════════════════════ The one in use ══════════════════════ */

  var back = MODE === 'builtin' ? builtin : MODE === 'supabase' ? supabase : null;

  /* ---------- Keeping the token usable ----------
     Rather than refreshing on a timer — which dies when the tab sleeps, which
     is exactly when it is needed — refresh lazily: anything needing a token
     asks for a fresh one first. */

  var refreshing = null;

  function refresh() {
    if (refreshing) return refreshing;
    if (!session) return Promise.reject(AuthError('Not signed in', 401));

    refreshing = Promise.resolve(back.refresh()).then(function (s) {
      refreshing = null;
      return s;
    }, function (err) {
      refreshing = null;
      throw err;
    });
    return refreshing;
  }

  function withToken(fn) {
    if (!session) return Promise.reject(AuthError('Not signed in', 401));

    var fresh = Date.now() < session.expires_at ? Promise.resolve(session) : refresh();

    return fresh.then(function (s) {
      return Promise.resolve(fn(s.access_token)).catch(function (err) {
        /* Rejected anyway — one retry after a forced refresh covers clock skew
           or a token revoked mid-flight. */
        if (err && err.status === 401) {
          return refresh().then(function (s2) { return fn(s2.access_token); });
        }
        throw err;
      });
    });
  }

  /* ---------- Public surface ---------- */

  function notSupported(what) {
    return function () {
      return Promise.reject(AuthError(what + ' is not available on this site.', 400));
    };
  }

  session = readStored();

  function signOut() {
    var token = session && session.access_token;
    store(null);
    if (!token || !back) return Promise.resolve();
    /* Revoke on the server too, but a failure here must not leave someone
       logged in on a shared computer — the local session is already gone. */
    return Promise.resolve(back.signOut(token)).catch(function () { /* expired, or offline */ });
  }

  window.SFAuth = {
    enabled: enabled,
    provider: provider,
    can: can,
    isSignedIn: function () { return !!session; },
    user: function () { return session ? session.user : null; },
    onChange: onChange,

    signUp: function (email, password, name) {
      if (!back) return notSupported('Signing up')();
      return back.signUp(String(email || '').trim(), password, String(name || '').trim());
    },
    signIn: function (email, password) {
      if (!back) return notSupported('Logging in')();
      return back.signIn(String(email || '').trim(), password);
    },
    signOut: signOut,

    requestPasswordReset: function (email) {
      if (!back || !back.requestPasswordReset) return notSupported('Emailed password reset')();
      return back.requestPasswordReset(String(email || '').trim());
    },
    recoverWithCode: function (email, code, password) {
      if (!back || !back.recoverWithCode) return notSupported('Recovery by code')();
      return back.recoverWithCode(String(email || '').trim(), code, password);
    },
    setPassword: function (password) {
      if (!back) return notSupported('Changing a password')();
      return back.setPassword(password);
    },
    deleteAccount: function () {
      if (!back) return notSupported('Deleting an account')();
      return Promise.resolve(back.deleteAccount()).then(signOut, signOut);
    },

    /* The diploma itself. Keeping the transport here rather than in sync.js is
       what lets the two backends differ without sync.js knowing. */
    pullDocument: function () { return back ? back.pullDocument() : Promise.resolve(null); },
    pushDocument: function (doc) { return back ? back.pushDocument(doc) : Promise.resolve(); },

    consumeUrl: function () { return back ? back.consumeUrl() : null; },
    withToken: withToken
  };
})();
