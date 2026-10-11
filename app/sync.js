/* StudyFlow — keeping an account's data on the server as well as the device.
   Exposes window.SFSync.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * The model
 * ──────────────────────────────────────────────────────────────────────────
 * localStorage stays the source of truth while the app is running. Every save
 * is instant and works offline, exactly as before; the server copy is written
 * shortly afterwards, in the background. That ordering is deliberate — a
 * student ticking off a deadline on a train should never watch a spinner, and
 * should never lose the tick because the train went into a tunnel.
 *
 * The whole account is stored as one JSON document per user rather than
 * normalised tables. For a single-user document of a few hundred rows that is
 * the right trade: no migrations, no partial-write states, and the offline
 * story stays trivial. It would be the wrong trade for anything collaborative.
 *
 * Conflicts are not resolved silently. If the same account has been edited on
 * two devices while one of them was offline, last-write-wins would quietly
 * destroy an evening's work — so the app asks. See reconcile().
 */
(function () {
  'use strict';

  var TABLE = '/rest/v1/student_data';
  var MARK_KEY = 'studyflow-sync-v1';   // what we last successfully pushed
  var PUSH_DELAY = 2500;                // coalesce bursts of edits

  var status = 'off';        // off | idle | syncing | saved | offline | error
  var lastError = '';
  var lastSyncedAt = null;
  var timer = null;
  var pending = false;       // an edit happened that is not on the server yet
  var inFlight = null;
  var listeners = [];

  function enabled() {
    return !!(window.SFAuth && SFAuth.enabled() && SFAuth.isSignedIn());
  }

  function on(fn) { listeners.push(fn); }

  function setStatus(s, err) {
    status = s;
    lastError = err || '';
    listeners.forEach(function (fn) { try { fn(state()); } catch (e) { /* listener's problem */ } });
  }

  function state() {
    return { status: status, error: lastError, at: lastSyncedAt, pending: pending };
  }

  /* ---------- Request helper ----------
     PostgREST, not GoTrue, so the error shape differs again. */

  function rest(path, opts) {
    opts = opts || {};
    return SFAuth.withToken(function (token) {
      var headers = {
        apikey: SFAuth.anonKey(),
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      };
      Object.keys(opts.headers || {}).forEach(function (k) { headers[k] = opts.headers[k]; });

      return fetch(SFAuth.url() + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      }).catch(function () {
        var e = new Error('offline');
        e.offline = true;
        throw e;
      }).then(function (res) {
        return res.text().then(function (text) {
          var json = null;
          if (text) { try { json = JSON.parse(text); } catch (e) { /* non-JSON */ } }
          if (!res.ok) {
            var e = new Error((json && (json.message || json.hint || json.details)) ||
                              ('Server error ' + res.status));
            e.status = res.status;
            /* 42P01 = relation does not exist: the SQL in supabase/schema.sql
               was never run. Worth naming precisely, because otherwise it
               looks like a bug in the app. */
            if (json && json.code === '42P01') {
              e.message = 'The student_data table does not exist yet. Run supabase/schema.sql in the Supabase SQL editor.';
              e.setup = true;
            }
            throw e;
          }
          return json;
        });
      });
    });
  }

  /* ---------- Marks ----------
     A fingerprint of what we last pushed, so "has this device changed since it
     last synced?" can be answered without keeping a second copy of the data. */

  function fingerprint(obj) {
    /* FNV-1a over the serialised document. Not cryptographic — it only has to
       notice that something changed, and it has to be fast enough to run on
       every save. */
    var s = JSON.stringify(obj);
    var hash = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
    }
    return s.length + ':' + hash.toString(36);
  }

  function readMark() {
    try { return JSON.parse(localStorage.getItem(MARK_KEY) || 'null'); } catch (e) { return null; }
  }

  function writeMark(m) {
    try {
      if (m) localStorage.setItem(MARK_KEY, JSON.stringify(m));
      else localStorage.removeItem(MARK_KEY);
    } catch (e) { /* private mode */ }
  }

  /* ---------- Pull ---------- */

  function pull() {
    return rest(TABLE + '?select=data,updated_at').then(function (rows) {
      if (!rows || !rows.length) return null;
      return { data: rows[0].data, updatedAt: rows[0].updated_at };
    });
  }

  /* ---------- Push ---------- */

  function pushNow() {
    if (!enabled() || !SF.state) return Promise.resolve();
    /* The example account is scaffolding, not the student's work. Uploading it
       would mean signing in on a phone and finding Sandra's deadlines there. */
    if (SF.isDemo()) { pending = false; setStatus('idle'); return Promise.resolve(); }
    if (inFlight) { pending = true; return inFlight; }

    var doc = SF.state;
    var print = fingerprint(doc);
    var uid = SFAuth.user().id;

    /* Cleared as the request leaves, not when it lands. "Pending" means "there
       are edits this request is not carrying" — so it has to be reset here,
       against the snapshot being sent. Clearing it on success instead made
       every push look like it had missed an edit, and each one scheduled
       another: a sync that never finished and never stopped. */
    pending = false;

    setStatus('syncing');
    inFlight = rest(TABLE, {
      method: 'POST',
      /* Upsert on the primary key. One row per user, always replaced whole. */
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: [{ user_id: uid, data: doc, updated_at: new Date().toISOString() }]
    }).then(function () {
      inFlight = null;
      lastSyncedAt = new Date();
      writeMark({ print: print, at: lastSyncedAt.toISOString() });
      /* An edit landed while the request was in flight — go again, and keep it
         in the same promise chain so flush() waits for the real last write.
         This terminates: pending is cleared on the way out of each attempt. */
      if (pending) return pushNow();
      setStatus('saved');
    }, function (err) {
      inFlight = null;
      pending = true;
      if (err && err.offline) setStatus('offline');
      else setStatus('error', err ? err.message : 'Could not save to your account.');
      /* Deliberately not rethrown: a failed background sync is a status, not
         an exception for the UI to handle. The data is safe on the device. */
    });

    return inFlight || Promise.resolve();
  }

  /** Mark the local data as changed and push it soon. */
  function schedule(delay) {
    if (!enabled()) return;
    pending = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; pushNow(); },
      delay === undefined ? PUSH_DELAY : delay);
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    return pushNow();
  }

  /** True if this device holds edits the server has not seen. */
  function deviceChanged() {
    var mark = readMark();
    if (!SF.state || SF.isDemo()) return false;
    if (!mark) return true;
    return mark.print !== fingerprint(SF.state);
  }

  /* ---------- Reconciling at sign-in ----------
     Four cases, and only one of them is ambiguous. */

  function reconcile() {
    if (!enabled()) return Promise.resolve({ action: 'none' });

    setStatus('syncing');
    return pull().then(function (remote) {
      /* Demo data counts as no data: it is never uploaded, and it must never
         stand in the way of the account's real copy coming down. */
      var local = SF.isDemo() ? null : SF.state;

      if (!remote && !local) { setStatus('idle'); return { action: 'empty' }; }

      /* Nothing on the server: this is a new account, or a first sign-in on a
         device that already has work. Either way the device wins. */
      if (!remote) {
        return flush().then(function () { return { action: 'uploaded' }; });
      }

      /* Nothing on the device: a fresh browser signing in. Take the server's. */
      if (!local) {
        adopt(remote);
        return { action: 'downloaded', at: remote.updatedAt };
      }

      /* Both exist and the device has nothing unpushed — the server copy is
         simply the same account, possibly newer from another device. */
      if (!deviceChanged()) {
        adopt(remote);
        return { action: 'downloaded', at: remote.updatedAt };
      }

      /* Both changed. This is the case that must not be guessed at. */
      setStatus('idle');
      return {
        action: 'conflict',
        remote: remote,
        summary: { local: describe(local), remote: describe(remote.data), at: remote.updatedAt }
      };
    }, function (err) {
      if (err && err.offline) { setStatus('offline'); return { action: 'offline' }; }
      setStatus('error', err ? err.message : 'Could not reach your account.');
      return { action: 'error', message: err ? err.message : '' };
    });
  }

  /** A one-line "what is in this copy", so a conflict can be judged. */
  function describe(doc) {
    if (!doc) return 'empty';
    var tasks = (doc.tasks || []).length;
    var open = (doc.tasks || []).filter(function (t) { return !t.done; }).length;
    var subj = (doc.subjects || []).length;
    var cas = (doc.cas || []).reduce(function (s, e) { return s + (e.hours || 0); }, 0);
    return [
      subj + (subj === 1 ? ' subject' : ' subjects'),
      tasks + (tasks === 1 ? ' deadline' : ' deadlines') + ' (' + open + ' open)',
      cas + 'h CAS'
    ].join(' · ');
  }

  /** Replace what is on this device with the server's copy. */
  function adopt(remote) {
    SF.replaceState(remote.data);
    writeMark({ print: fingerprint(SF.state), at: remote.updatedAt });
    lastSyncedAt = remote.updatedAt ? new Date(remote.updatedAt) : new Date();
    pending = false;
    setStatus('saved');
  }

  /** Resolve a conflict the student's way. */
  function keepDevice() { writeMark(null); return flush(); }
  function keepServer(remote) { adopt(remote); return Promise.resolve(); }

  /* ---------- Wiring ---------- */

  /* Every save schedules a push. Subscribing rather than wrapping SF.save
     matters: the store's own mutations — creating an account, importing a
     calendar, regenerating the plan — call save() internally and would never
     pass through a wrapper placed on the outside.

     The data layer still knows nothing about a server; it only announces that
     it changed. That is what lets the app run unaltered with accounts off. */
  if (window.SFAuth && SFAuth.enabled()) {
    SF.onSave(function () { schedule(); });
    if (SFAuth.isSignedIn()) setStatus(deviceChanged() ? 'idle' : 'saved');

    SFAuth.onChange(function (s) {
      if (!s) { writeMark(null); pending = false; lastSyncedAt = null; setStatus('off'); }
    });

    /* Coming back online is the moment a queued push should go. */
    addEventListener('online', function () { if (pending) schedule(400); });

    /* Last chance to save before the tab goes. Not guaranteed — which is fine,
       because nothing is lost: the edit is already in localStorage and will
       sync next time. */
    addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && pending) flush();
    });
  }

  window.SFSync = {
    enabled: enabled,
    state: state,
    on: on,
    pull: pull,
    flush: flush,
    reconcile: reconcile,
    keepDevice: keepDevice,
    keepServer: keepServer,
    deviceChanged: deviceChanged,
    describe: describe,
    clearMark: function () { writeMark(null); }
  };
})();
