/* StudyFlow — the sign-in screen. Exposes window.SFAuthView.
 *
 * Deliberately a full-screen gate rather than a modal: before you are signed
 * in there is nothing behind it to see, and a dialog over an empty app looks
 * broken. It reuses the onboarding overlay's chrome so the two first-run
 * surfaces feel like one thing.
 */
(function () {
  'use strict';

  var h = DOM.h, clear = DOM.clear, icon = DOM.icon;

  var overlay = null;
  var opts = null;
  var step = 'choose';
  var ctx = {};      // carried between steps: email, message, pending result

  var MIN_PASSWORD = 8;

  function run(options) {
    opts = options || {};
    ctx = {};
    step = opts.start || 'choose';
    if (opts.message) ctx.notice = opts.message;
    if (opts.error) ctx.error = opts.error;
    if (opts.email) ctx.email = opts.email;
    /* A conflict found during boot is handed straight to the chooser. */
    if (opts.remote) ctx.remote = opts.remote;
    if (opts.summary) ctx.summary = opts.summary;

    /* run() can be reached while a gate or the tour is already up — following
       an email link with the app open does exactly that. Clear the old overlay
       rather than stacking a second one on top of it. */
    Array.prototype.forEach.call(document.querySelectorAll('.onb'), function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });

    overlay = h('div.onb.auth', {
      role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sign in to StudyFlow'
    });
    document.body.appendChild(overlay);
    document.body.classList.add('is-onboarding');
    draw();
  }

  function finish(result) {
    document.body.classList.remove('is-onboarding');
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    if (opts.onDone) opts.onDone(result || {});
  }

  function go(next, extra) {
    step = next;
    if (extra) Object.keys(extra).forEach(function (k) { ctx[k] = extra[k]; });
    ctx.error = extra && extra.error ? extra.error : '';
    draw();
  }

  function draw() {
    clear(overlay);

    var body =
      step === 'choose'   ? viewChoose()
      : step === 'signup'   ? viewSignUp()
      : step === 'login'    ? viewLogIn()
      : step === 'forgot'   ? viewForgot()
      : step === 'sent'     ? viewSent()
      : step === 'recovery' ? viewRecovery()
      : step === 'conflict' ? viewConflict()
      : viewChoose();

    overlay.appendChild(h('div.onb__box.auth__box', body));

    var first = overlay.querySelector('input:not([type=hidden]), button.onb__primary');
    if (first) first.focus();
  }

  function brand() {
    return h('div.onb__brand',
      h('span.onb__mark', icon('<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4Z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H16a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H20Z"/>')),
      h('span.onb__name', 'Study', h('span', 'Flow'))
    );
  }

  /** Error and notice banners. Errors get role="alert" so they are announced. */
  function banners() {
    return [
      ctx.error ? h('p.auth__error', { role: 'alert' },
        icon('<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>'),
        h('span', ctx.error)) : null,
      ctx.notice ? h('p.auth__notice', { role: 'status' }, ctx.notice) : null
    ];
  }

  /** A submit button that shows it is working and cannot be double-fired. */
  function busy(btn, on, label) {
    btn.disabled = on;
    btn.classList.toggle('is-busy', on);
    btn.textContent = on ? (label || 'Working…') : btn.dataset.label;
  }

  function field(o) {
    var input = h('input', {
      id: o.id,
      type: o.type || 'text',
      value: o.value || '',
      placeholder: o.placeholder || '',
      autocomplete: o.autocomplete || 'off',
      required: o.required !== false,
      inputmode: o.inputmode || null,
      'aria-describedby': o.hint ? o.id + '-hint' : null
    });
    return {
      el: h('label.field.auth__field',
        h('span', o.label),
        input,
        o.hint ? h('em.auth__hint', { id: o.id + '-hint' }, o.hint) : null
      ),
      input: input
    };
  }

  /* ---------- Steps ---------- */

  function viewChoose() {
    return [
      h('div.onb__body.onb__body--center',
        brand(),
        h('h1.onb__title', 'Your diploma, on every device'),
        h('p.onb__lede',
          'Create an account and your deadlines, CAS hours and Extended Essay follow you ' +
          'from your laptop to your phone. Log in on a new device and everything is there.'),
        banners(),

        h('div.auth__acts',
          h('button.btn.btn--primary.btn--lg.onb__primary', {
            type: 'button', onclick: function () { go('signup'); }
          }, 'Create an account'),
          h('button.btn.btn--ghost.btn--lg', {
            type: 'button', onclick: function () { go('login'); }
          }, 'I already have an account')
        ),

        opts.allowLocal
          ? h('div.auth__alt',
              h('button.link', {
                type: 'button', onclick: function () { finish({ local: true }); }
              }, 'Use this device only, without an account'),
              h('p.auth__altnote',
                'Everything stays in this browser. Nothing syncs, and clearing your ' +
                'browser data erases it — but no email address is needed.')
            )
          : null,

        opts.homeHref
          ? h('a.link.onb__home', { href: opts.homeHref }, '← Back to the StudyFlow site')
          : null
      )
    ];
  }

  function viewSignUp() {
    var name = field({ id: 'au-name', label: 'Your name', value: ctx.name || '',
      placeholder: 'e.g. Sandra', autocomplete: 'given-name', required: false,
      hint: 'Only used to greet you. Optional.' });

    var email = field({ id: 'au-email', label: 'Email', type: 'email', value: ctx.email || '',
      placeholder: 'you@school.org', autocomplete: 'email', inputmode: 'email' });

    var pw = field({ id: 'au-pw', label: 'Password', type: 'password',
      autocomplete: 'new-password',
      hint: 'At least ' + MIN_PASSWORD + ' characters. Three unrelated words beats one clever word.' });

    var pw2 = field({ id: 'au-pw2', label: 'Password again', type: 'password',
      autocomplete: 'new-password' });

    var submit = h('button.btn.btn--primary.btn--lg.onb__primary', { type: 'submit' }, 'Create my account');
    submit.dataset.label = 'Create my account';

    var form = h('form.auth__form', {
      onsubmit: function (e) {
        e.preventDefault();
        ctx.name = name.input.value;
        ctx.email = email.input.value.trim();

        if (pw.input.value.length < MIN_PASSWORD) {
          return go('signup', { error: 'Use a password of at least ' + MIN_PASSWORD + ' characters.', name: ctx.name });
        }
        if (pw.input.value !== pw2.input.value) {
          return go('signup', { error: 'Those two passwords are not the same.', name: ctx.name });
        }

        busy(submit, true, 'Creating…');
        SFAuth.signUp(ctx.email, pw.input.value, ctx.name).then(function (res) {
          if (res.needsConfirmation) {
            return go('sent', { kind: 'confirm', email: ctx.email });
          }
          afterSignIn();
        }, function (err) {
          busy(submit, false);
          go('signup', { error: err.message, name: ctx.name, email: ctx.email });
        });
      }
    },
      name.el, email.el, pw.el, pw2.el,
      h('div.auth__submit', submit)
    );

    return [
      h('div.onb__body',
        h('p.onb__eyebrow', 'New account'),
        h('h2.onb__title', 'Create your StudyFlow account'),
        banners(),
        form,
        h('p.auth__foot',
          'Already have one? ',
          h('button.link', { type: 'button', onclick: function () { go('login', { email: email.input.value.trim() }); } }, 'Log in'),
          '.'
        ),
        h('p.auth__legal',
          'We store your name, email and the diploma data you enter. Nothing else, no ' +
          'tracking, and nothing is shared. You can delete the whole account from Settings.')
      )
    ];
  }

  function viewLogIn() {
    var email = field({ id: 'au-email', label: 'Email', type: 'email', value: ctx.email || '',
      placeholder: 'you@school.org', autocomplete: 'email', inputmode: 'email' });

    var pw = field({ id: 'au-pw', label: 'Password', type: 'password', autocomplete: 'current-password' });

    var submit = h('button.btn.btn--primary.btn--lg.onb__primary', { type: 'submit' }, 'Log in');
    submit.dataset.label = 'Log in';

    var form = h('form.auth__form', {
      onsubmit: function (e) {
        e.preventDefault();
        ctx.email = email.input.value.trim();
        busy(submit, true, 'Logging in…');
        SFAuth.signIn(ctx.email, pw.input.value).then(afterSignIn, function (err) {
          busy(submit, false);
          go('login', { error: err.message, email: ctx.email });
        });
      }
    },
      email.el,
      pw.el,
      h('div.auth__row',
        h('button.link', {
          type: 'button',
          onclick: function () { go('forgot', { email: email.input.value.trim() }); }
        }, 'Forgot your password?')
      ),
      h('div.auth__submit', submit)
    );

    return [
      h('div.onb__body',
        h('p.onb__eyebrow', 'Welcome back'),
        h('h2.onb__title', 'Log in to StudyFlow'),
        banners(),
        form,
        h('p.auth__foot',
          'No account yet? ',
          h('button.link', { type: 'button', onclick: function () { go('signup', { email: email.input.value.trim() }); } }, 'Create one'),
          '.'
        )
      )
    ];
  }

  function viewForgot() {
    var email = field({ id: 'au-email', label: 'Email', type: 'email', value: ctx.email || '',
      placeholder: 'you@school.org', autocomplete: 'email', inputmode: 'email' });

    var submit = h('button.btn.btn--primary.btn--lg.onb__primary', { type: 'submit' }, 'Send me a reset link');
    submit.dataset.label = 'Send me a reset link';

    var form = h('form.auth__form', {
      onsubmit: function (e) {
        e.preventDefault();
        var addr = email.input.value.trim();
        busy(submit, true, 'Sending…');
        /* Deliberately reports success either way. Saying "no account with
           that email" would let anyone check who has an account here. */
        SFAuth.requestPasswordReset(addr).then(function () {
          go('sent', { kind: 'reset', email: addr });
        }, function (err) {
          if (err.status === 429) { busy(submit, false); return go('forgot', { error: err.message, email: addr }); }
          go('sent', { kind: 'reset', email: addr });
        });
      }
    }, email.el, h('div.auth__submit', submit));

    return [
      h('div.onb__body',
        h('p.onb__eyebrow', 'Password reset'),
        h('h2.onb__title', 'Reset your password'),
        h('p.onb__lede', 'We will email you a link that signs you in once, so you can set a new password.'),
        banners(),
        form,
        h('p.auth__foot', h('button.link', { type: 'button', onclick: function () { go('login'); } }, '← Back to logging in'))
      )
    ];
  }

  function viewSent() {
    var reset = ctx.kind === 'reset';
    return [
      h('div.onb__body.onb__body--center',
        h('div.auth__envelope', icon('<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="m22 7-10 6L2 7"/>')),
        h('h2.onb__title', 'Check your inbox'),
        h('p.onb__lede',
          reset
            ? 'If there is an account for '
            : 'We have sent a confirmation link to ',
          h('b', ctx.email || 'your email address'),
          reset
            ? ', a reset link is on its way. Open it on this device and you can set a new password.'
            : '. Open it and your account is ready — then come back here and log in.'),
        h('p.auth__small',
          'Nothing after a minute or two? Look in spam, and check the address above for typos. ' +
          'School mail systems sometimes hold these for a while.'),
        h('div.auth__acts',
          h('button.btn.btn--primary.onb__primary', {
            type: 'button', onclick: function () { go('login', { email: ctx.email, notice: null }); }
          }, 'Back to logging in'),
          h('button.btn.btn--ghost', {
            type: 'button',
            onclick: function () { go(reset ? 'forgot' : 'signup', { email: ctx.email }); }
          }, reset ? 'Send it again' : 'Use a different email')
        )
      )
    ];
  }

  /** Reached by clicking a password-reset email link: already signed in, once. */
  function viewRecovery() {
    var pw = field({ id: 'au-pw', label: 'New password', type: 'password',
      autocomplete: 'new-password',
      hint: 'At least ' + MIN_PASSWORD + ' characters.' });
    var pw2 = field({ id: 'au-pw2', label: 'New password again', type: 'password',
      autocomplete: 'new-password' });

    var submit = h('button.btn.btn--primary.btn--lg.onb__primary', { type: 'submit' }, 'Set my new password');
    submit.dataset.label = 'Set my new password';

    var form = h('form.auth__form', {
      onsubmit: function (e) {
        e.preventDefault();
        if (pw.input.value.length < MIN_PASSWORD) {
          return go('recovery', { error: 'Use a password of at least ' + MIN_PASSWORD + ' characters.' });
        }
        if (pw.input.value !== pw2.input.value) {
          return go('recovery', { error: 'Those two passwords are not the same.' });
        }
        busy(submit, true, 'Saving…');
        SFAuth.setPassword(pw.input.value).then(function () {
          afterSignIn();
        }, function (err) {
          busy(submit, false);
          go('recovery', { error: err.message });
        });
      }
    }, pw.el, pw2.el, h('div.auth__submit', submit));

    var who = SFAuth.user();
    return [
      h('div.onb__body',
        h('p.onb__eyebrow', 'Password reset'),
        h('h2.onb__title', 'Choose a new password'),
        h('p.onb__lede', who && who.email
          ? 'For ' + who.email + '. You are signed in from the link — set a password and you are done.'
          : 'You are signed in from the link. Set a password and you are done.'),
        banners(),
        form
      )
    ];
  }

  /* ---------- Conflict ----------
     Two devices edited the same account while one was offline. Guessing here
     silently destroys work, so the student chooses — with enough detail to
     choose correctly rather than a bare "keep local / keep remote". */

  function viewConflict() {
    var s = ctx.summary || {};
    var when = s.at ? new Date(s.at).toLocaleString(undefined, {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    }) : 'earlier';

    function pick(fn, label) {
      return function (e) {
        var btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Working…';
        Promise.resolve(fn()).then(function () { finish({ resolved: label }); });
      };
    }

    return [
      h('div.onb__body',
        h('p.onb__eyebrow', 'One account, two versions'),
        h('h2.onb__title', 'Which copy should we keep?'),
        h('p.onb__lede',
          'This device has changes your account has not seen, and your account has a copy ' +
          'saved from somewhere else. Keeping one means losing the other, so it is your call.'),

        h('div.auth__choices',
          h('button.onb__choice', { type: 'button', onclick: pick(function () { return SFSync.keepDevice(); }, 'device') },
            h('b', 'This device'),
            h('span.auth__choicemeta', s.local || ''),
            h('span', 'Upload what is in this browser and overwrite the account copy.')
          ),
          h('button.onb__choice', { type: 'button', onclick: pick(function () { return SFSync.keepServer(ctx.remote); }, 'server') },
            h('b', 'My account'),
            h('span.auth__choicemeta', s.remote || ''),
            h('span', 'Download the copy saved ' + when + ' and replace what is in this browser.')
          )
        ),
        h('p.auth__small',
          'Not sure? Compare the two lines above — subjects, how many deadlines, and CAS ' +
          'hours. Whichever looks more like your real situation is the one to keep.')
      )
    ];
  }

  /* ---------- After a successful sign-in ----------
     Pull the account's data before handing control back, so the app never
     renders someone's old local data for a second and then swaps it. */

  function afterSignIn() {
    var box = overlay && overlay.querySelector('.onb__box');
    if (box) {
      clear(box);
      box.appendChild(h('div.onb__body.onb__body--center',
        h('div.auth__spinner', { 'aria-hidden': 'true' }),
        h('h2.onb__title', 'Getting your diploma…'),
        h('p.onb__lede', 'Fetching what your account has saved.')
      ));
    }

    SFSync.reconcile().then(function (res) {
      if (res.action === 'conflict') {
        return go('conflict', { remote: res.remote, summary: res.summary });
      }
      if (res.action === 'error' && /table does not exist/i.test(res.message || '')) {
        /* A setup problem, not the student's problem — but they must not be
           left staring at a spinner. Let them in; the data is local and safe,
           and Settings explains it. */
        return finish({ signedIn: true, syncBroken: res.message });
      }
      finish({ signedIn: true, action: res.action });
    });
  }

  window.SFAuthView = { run: run };
})();
