/* StudyFlow — site interactions */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Theme ---------- */
  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    toggle.setAttribute(
      'aria-label',
      theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
    );
    try { localStorage.setItem('studyflow-theme', theme); } catch (e) { /* private mode */ }
  }

  var stored = null;
  try { stored = localStorage.getItem('studyflow-theme'); } catch (e) { /* private mode */ }
  applyTheme(
    stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );

  toggle.addEventListener('click', function () {
    applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  /* ---------- Nav ---------- */
  var nav = document.getElementById('nav');
  var links = document.getElementById('nav-links');
  var burger = document.getElementById('burger');

  function closeMenu() {
    links.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Open menu');
  }

  burger.addEventListener('click', function () {
    var open = links.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });

  links.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') closeMenu();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });

  var onScroll = function () {
    nav.classList.toggle('is-stuck', window.scrollY > 8);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Reveal on scroll ---------- */
  var revealables = document.querySelectorAll('.reveal');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
        if (entry.target.classList.contains('stat')) countUp(entry.target.querySelector('b'));
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px' });

    revealables.forEach(function (el, i) {
      el.style.transitionDelay = (i % 4) * 60 + 'ms';
      io.observe(el);
    });
  }

  /* ---------- Stat counters ---------- */
  function countUp(el) {
    if (!el) return;
    var target = parseFloat(el.dataset.count);
    var suffix = el.dataset.suffix || '';
    if (isNaN(target)) return;

    if (reduceMotion) { el.textContent = target + suffix; return; }

    var start = performance.now();
    var duration = 1100;

    (function frame(now) {
      var t = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (t < 1) requestAnimationFrame(frame);
    })(start);
  }

  // Stats above the fold on short pages may already be visible.
  if (reduceMotion) {
    document.querySelectorAll('.stat b').forEach(function (b) {
      b.textContent = b.dataset.count + (b.dataset.suffix || '');
    });
  }

  /* ---------- Interactive dashboard demo ---------- */
  var TASKS = [
    { id: 1, title: 'Physics IA — first draft',        sub: 'Internal Assessment · Physics HL', cat: 'ia',         days: 2,  hours: 4 },
    { id: 2, title: 'TOK exhibition — object notes',   sub: 'Theory of Knowledge',              cat: 'tok',        days: 5,  hours: 2 },
    { id: 3, title: 'History Paper 2 practice essay',  sub: 'Assignment · History HL',          cat: 'assignment', days: 8,  hours: 2 },
    { id: 4, title: 'CAS reflection #6',               sub: 'Service · Volunteer tutoring',     cat: 'cas',        days: 3,  hours: 1 },
    { id: 5, title: 'EE — supervisor meeting 2',       sub: 'Extended Essay · Biology',         cat: 'ee',         days: 6,  hours: 1 },
    { id: 6, title: 'Math AA problem set 12',          sub: 'Assignment · Mathematics HL',      cat: 'assignment', days: 1,  hours: 2 },
    { id: 7, title: 'EE — 1,500 word checkpoint',      sub: 'Extended Essay · Biology',         cat: 'ee',         days: 12, hours: 6 },
    { id: 8, title: 'Spanish B oral practice',         sub: 'Assignment · Spanish B SL',        cat: 'assignment', days: 9,  hours: 2 },
    { id: 9, title: 'Chemistry IA — data collection',  sub: 'Internal Assessment · Chemistry HL', cat: 'ia',       days: 14, hours: 5 },
    { id: 10, title: 'CAS — log Duke of Edinburgh hrs', sub: 'Activity · Hiking expedition',    cat: 'cas',        days: 4,  hours: 1 }
  ];

  var queue = document.getElementById('queue');

  if (queue) {
  var countEl = document.getElementById('demo-count');
  var barEl = document.getElementById('demo-bar');
  var statusEl = document.getElementById('demo-status');
  var resetEl = document.getElementById('demo-reset');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));

  var done = Object.create(null);
  var filter = 'all';

  function dueLabel(days) {
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days < 7) return days + ' days';
    if (days < 14) return '1 week';
    return Math.round(days / 7) + ' weeks';
  }

  function render() {
    var visible = TASKS.filter(function (t) { return filter === 'all' || t.cat === filter; })
      .sort(function (a, b) {
        // Finished work sinks; everything else is ordered by urgency.
        if (!!done[a.id] !== !!done[b.id]) return done[a.id] ? 1 : -1;
        return a.days - b.days;
      });

    queue.innerHTML = '';

    if (!visible.length) {
      var empty = document.createElement('li');
      empty.className = 'queue__empty';
      empty.textContent = 'Nothing in this category right now.';
      queue.appendChild(empty);
    }

    visible.forEach(function (t) {
      var isDone = !!done[t.id];

      var li = document.createElement('li');
      li.className = 'queue__item' + (isDone ? ' is-done' : '');

      var check = document.createElement('button');
      check.type = 'button';
      check.className = 'queue__check';
      check.setAttribute('aria-pressed', String(isDone));
      check.setAttribute('aria-label', (isDone ? 'Mark incomplete: ' : 'Mark complete: ') + t.title);
      check.addEventListener('click', function () {
        if (done[t.id]) delete done[t.id];
        else done[t.id] = true;
        render();
      });

      var main = document.createElement('div');
      main.className = 'queue__main';

      var title = document.createElement('p');
      title.className = 'queue__title';
      title.textContent = t.title;

      var sub = document.createElement('p');
      sub.className = 'queue__sub';
      sub.textContent = t.sub + ' · ~' + t.hours + 'h left';

      main.appendChild(title);
      main.appendChild(sub);

      var right = document.createElement('div');
      right.className = 'queue__right';

      var due = document.createElement('span');
      due.className = 'queue__due' + (t.days <= 2 && !isDone ? ' is-soon' : '');
      due.textContent = dueLabel(t.days);
      right.appendChild(due);

      li.appendChild(check);
      li.appendChild(main);
      li.appendChild(right);
      queue.appendChild(li);
    });

    updateSummary(visible);
  }

  function updateSummary(visible) {
    var doneCount = TASKS.filter(function (t) { return done[t.id]; }).length;
    var pct = Math.round((doneCount / TASKS.length) * 100);

    countEl.textContent = visible.length + ' shown · ' + doneCount + '/' + TASKS.length + ' done';
    barEl.style.width = pct + '%';

    var hoursLeft = TASKS.reduce(function (sum, t) {
      return done[t.id] ? sum : sum + t.hours;
    }, 0);

    if (doneCount === 0) {
      statusEl.textContent = 'Nothing done yet — ' + hoursLeft + 'h of work across 10 deadlines.';
    } else if (doneCount === TASKS.length) {
      statusEl.textContent = 'Everything cleared. That is what a quiet week looks like. 🎉';
    } else {
      statusEl.textContent = pct + '% cleared · about ' + hoursLeft + 'h of work still ahead.';
    }
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.classList.remove('is-active'); });
      chip.classList.add('is-active');
      filter = chip.dataset.filter;
      render();
    });
  });

  resetEl.addEventListener('click', function () {
    done = Object.create(null);
    render();
  });

  render();
  }

  /* ---------- Signup form ---------- */
  var form = document.getElementById('signup');
  var msg = document.getElementById('signup-msg');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var input = document.getElementById('email');
    var value = input.value.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      msg.textContent = 'That email address does not look right — mind checking it?';
      msg.classList.add('is-err');
      input.focus();
      return;
    }

    msg.classList.remove('is-err');
    msg.textContent = 'Thanks! This is a demo site, so nothing was sent — but you are on the list in spirit.';
    form.reset();
  });

  /* ---------- Footer year ---------- */
  document.getElementById('year').textContent = new Date().getFullYear();
})();
