/* StudyFlow — app shell, router and views. Depends on store.js (window.SF). */
(function () {
  'use strict';

  var SF = window.SF;

  var h = DOM.h, clear = DOM.clear, icon = DOM.icon;

  /* ---------- Theme ---------- */
  var root = document.documentElement;
  var themeBtn = document.getElementById('theme-toggle');

  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    try { localStorage.setItem('studyflow-theme', t); } catch (e) { /* private mode */ }
  }

  var storedTheme = null;
  try { storedTheme = localStorage.getItem('studyflow-theme'); } catch (e) { /* private mode */ }

  // Respect a theme already stamped on the root by the host page before
  // falling back to the OS preference — only an explicit in-app choice wins.
  applyTheme(
    storedTheme ||
    root.getAttribute('data-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );
  themeBtn.addEventListener('click', function () {
    applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  /* ---------- Sidebar (mobile) ---------- */
  var side = document.getElementById('side');
  var scrim = document.getElementById('scrim');
  var burger = document.getElementById('burger');

  function openSide() {
    side.classList.add('is-open');
    scrim.hidden = false;
    burger.setAttribute('aria-expanded', 'true');
  }
  function closeSide() {
    side.classList.remove('is-open');
    scrim.hidden = true;
    burger.setAttribute('aria-expanded', 'false');
  }
  burger.addEventListener('click', openSide);
  scrim.addEventListener('click', closeSide);
  document.getElementById('side-close').addEventListener('click', closeSide);

  /* ---------- Toast ---------- */
  var toastEl = document.getElementById('toast');
  var toastTimer;

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  /* ---------- Modal ---------- */
  var modal = document.getElementById('modal');
  var modalTitle = document.getElementById('modal-title');
  var modalForm = document.getElementById('modal-form');
  var lastFocus = null;

  function openModal(title, fields, onSubmit, submitLabel) {
    lastFocus = document.activeElement;
    modalTitle.textContent = title;
    clear(modalForm);

    fields.forEach(function (f) {
      if (f.type === 'hidden') return;

      var id = 'f-' + f.name;
      var input;

      if (f.type === 'select') {
        input = h('select', { id: id, name: f.name });
        f.options.forEach(function (o) {
          input.appendChild(h('option', { value: o.value, selected: String(o.value) === String(f.value) }, o.label));
        });
      } else if (f.type === 'textarea') {
        input = h('textarea', { id: id, name: f.name, rows: f.rows || 3, value: f.value || '' });
      } else {
        input = h('input', {
          id: id, name: f.name, type: f.type || 'text',
          value: f.value == null ? '' : f.value,
          min: f.min, max: f.max, step: f.step,
          required: f.required !== false,
          placeholder: f.placeholder || '',
          // Lets a password manager offer to store a new password.
          autocomplete: f.autocomplete || null
        });
      }

      modalForm.appendChild(h('label.field',
        h('span', f.label),
        input,
        f.hint ? h('em.field__hint', f.hint) : null
      ));
    });

    modalForm.appendChild(h('div.modal__foot',
      h('button.btn.btn--ghost', { type: 'button', onclick: closeModal }, 'Cancel'),
      h('button.btn.btn--primary', { type: 'submit' }, submitLabel || 'Save')
    ));

    modalForm.onsubmit = function (e) {
      e.preventDefault();
      var data = {};
      fields.forEach(function (f) {
        var node = modalForm.elements[f.name];
        data[f.name] = node ? node.value : f.value;
      });
      if (onSubmit(data) !== false) closeModal();
    };

    modal.hidden = false;
    var first = modalForm.querySelector('input, select, textarea');
    if (first) first.focus();
  }

  function closeModal() {
    modal.hidden = true;
    modalForm.onsubmit = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  modal.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-close')) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (!modal.hidden) closeModal(); closeSide(); }
  });
  // Keep focus inside the dialog while it is open.
  modal.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || modal.hidden) return;
    var f = modal.querySelectorAll('button, input, select, textarea, [href]');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ---------- Shared pieces ---------- */

  function typeChip(type) {
    var t = SF.TYPES[type];
    return h('span.chip.chip--' + t.color, t.label);
  }

  function progressBar(pct, cls) {
    return h('div.bar' + (cls ? '.' + cls : ''), h('i', { style: 'width:' + Math.max(0, Math.min(100, pct)) + '%' }));
  }

  function taskFields(t) {
    var subjectOptions = [{ value: '', label: '— None —' }].concat(
      SF.state.subjects.map(function (s) { return { value: s.id, label: s.name + ' ' + s.level }; })
    );
    return [
      { name: 'title', label: 'Title', value: t ? t.title : '', placeholder: 'e.g. Physics IA — first draft' },
      { name: 'type', label: 'Category', type: 'select', value: t ? t.type : 'assignment',
        options: Object.keys(SF.TYPES).map(function (k) { return { value: k, label: SF.TYPES[k].label }; }) },
      { name: 'subjectId', label: 'Subject', type: 'select', value: t ? t.subjectId || '' : '', options: subjectOptions },
      { name: 'due', label: 'Due date', type: 'date', value: t ? t.due : SF.iso(SF.addDays(SF.today(), 7)) },
      { name: 'est', label: 'Estimated hours of work', type: 'number', value: t ? t.est : 2, min: 0.5, step: 0.5 },
      { name: 'progress', label: 'Progress (%)', type: 'number', value: t ? t.progress : 0, min: 0, max: 100, step: 5 }
    ];
  }

  function saveTask(data, existing) {
    var t = existing || { id: SF.uid('t'), done: false };
    t.title = data.title.trim() || 'Untitled';
    t.type = data.type;
    t.subjectId = data.subjectId || null;
    t.due = data.due;
    t.est = Math.max(0.5, parseFloat(data.est) || 1);
    t.progress = Math.max(0, Math.min(100, parseInt(data.progress, 10) || 0));
    if (t.progress === 100) t.done = true;
    if (!existing) SF.state.tasks.push(t);
    SF.save();
    render();
    toast(existing ? 'Deadline updated' : 'Deadline added');
  }

  function addTaskDialog() {
    openModal('New deadline', taskFields(null), function (d) { saveTask(d); }, 'Add deadline');
  }

  function editTaskDialog(t) {
    openModal('Edit deadline', taskFields(t), function (d) { saveTask(d, t); }, 'Save changes');
  }

  document.getElementById('quick-add').addEventListener('click', addTaskDialog);

  /** One row in a task list. */
  function taskRow(t, opts) {
    opts = opts || {};
    var overdue = SF.daysUntil(t.due) < 0 && !t.done;
    var soon = SF.daysUntil(t.due) <= 2 && !t.done;

    var check = h('button.check', {
      type: 'button',
      'aria-pressed': String(t.done),
      'aria-label': (t.done ? 'Mark incomplete: ' : 'Mark complete: ') + t.title,
      onclick: function () {
        t.done = !t.done;
        t.progress = t.done ? 100 : Math.min(t.progress, 95);
        SF.save();
        // Update this row and the surrounding counts rather than rebuilding the
        // list: it is far cheaper, and rows no longer jump out from under the
        // pointer mid-click. Order is re-sorted on the next full render.
        syncRow(li, t);
        refreshChrome();
        toast(t.done ? 'Nice — ' + t.title + ' done' : 'Reopened ' + t.title);
      }
    });

    var meta = [SF.subjectName(t.subjectId), SF.fmtDate(t.due), '~' + SF.hoursLeft(t) + 'h left']
      .filter(Boolean).join(' · ');

    var li = h('li.row' + (t.done ? '.is-done' : ''),
      check,
      h('div.row__main',
        h('p.row__title', t.title),
        h('p.row__meta', meta),
        !t.done && t.progress > 0 ? progressBar(t.progress) : null
      ),
      h('div.row__right',
        typeChip(t.type),
        h('span.row__due' + (overdue ? '.is-late' : soon ? '.is-soon' : ''), SF.dueLabel(t.due)),
        opts.actions === false ? null : h('div.row__acts',
          h('button.icon-btn.icon-btn--sm', {
            type: 'button', 'aria-label': 'Edit ' + t.title, title: 'Edit',
            onclick: function () { editTaskDialog(t); }
          }, icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>')),
          h('button.icon-btn.icon-btn--sm', {
            type: 'button', 'aria-label': 'Delete ' + t.title, title: 'Delete',
            onclick: function () {
              if (!confirm('Delete "' + t.title + '"?')) return;
              SF.state.tasks = SF.state.tasks.filter(function (x) { return x.id !== t.id; });
              SF.state.blocks = SF.state.blocks.filter(function (b) { return b.taskId !== t.id; });
              SF.save();
              render();
              toast('Deleted');
            }
          }, icon('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'))
        )
      )
    );

    return li;
  }

  /** Reflect a task's completion state on an already-rendered row. */
  function syncRow(li, t) {
    li.classList.toggle('is-done', t.done);

    var check = li.querySelector('.check');
    check.setAttribute('aria-pressed', String(t.done));
    check.setAttribute('aria-label', (t.done ? 'Mark incomplete: ' : 'Mark complete: ') + t.title);

    var meta = li.querySelector('.row__meta');
    if (meta) {
      meta.textContent = [SF.subjectName(t.subjectId), SF.fmtDate(t.due), '~' + SF.hoursLeft(t) + 'h left']
        .filter(Boolean).join(' · ');
    }

    var bar = li.querySelector('.bar i');
    if (bar) bar.style.width = Math.max(0, Math.min(100, t.progress)) + '%';

    var due = li.querySelector('.row__due');
    if (due) {
      var overdue = SF.daysUntil(t.due) < 0 && !t.done;
      var soon = SF.daysUntil(t.due) <= 2 && !t.done;
      due.classList.toggle('is-late', overdue);
      due.classList.toggle('is-soon', !overdue && soon);
    }
  }

  function emptyState(msg) { return h('p.empty', msg); }

  function sectionCard(title, body, action) {
    return h('section.card',
      h('div.card__head', h('h2', title), action || null),
      body
    );
  }

  /** Several nodes where one is expected. sectionCard takes a single body and
      a head action, so a card with three stacked pieces passes them as one. */
  function stack() {
    var f = document.createDocumentFragment();
    for (var i = 0; i < arguments.length; i++) DOM.append(f, arguments[i]);
    return f;
  }

  /* ================= Views ================= */

  var views = {};

  /* ---------- Dashboard ---------- */
  views.dashboard = function () {
    var open = SF.openTasks();
    var late = SF.overdue();
    var week = SF.dueWithin(7);
    var next = open[0];
    var cas = SF.casByStrand();
    var casTotal = cas.creativity + cas.activity + cas.service;
    var ee = SF.state.ee;
    var todayBlocks = SF.blocksOn(SF.iso(SF.today()));

    var frag = document.createDocumentFragment();

    if (late.length) {
      frag.appendChild(h('div.alert.alert--red',
        h('b', late.length + (late.length === 1 ? ' deadline is' : ' deadlines are') + ' overdue'),
        h('span', late.map(function (t) { return t.title; }).join(' · '))
      ));
    }

    SF.busyWeeks().slice(0, 1).forEach(function (w) {
      frag.appendChild(h('div.alert.alert--amber',
        h('b', 'Heavy week ahead — ' + w.tasks.length + ' deadlines in the week of ' + SF.fmtDate(w.week)),
        h('span', 'Start the big ones early: ' + w.tasks.slice(0, 3).map(function (t) { return t.title; }).join(', '))
      ));
    });

    // Due-next hero
    if (next) {
      frag.appendChild(h('section.next',
        h('p.next__label', 'Due next'),
        h('h2.next__title', next.title),
        h('p.next__meta', [SF.subjectName(next.subjectId), SF.TYPES[next.type].label].filter(Boolean).join(' · ')),
        h('div.next__chips',
          h('span.chip.chip--urgent', SF.dueLabel(next.due)),
          h('span.chip', SF.fmtDate(next.due)),
          h('span.chip', '~' + SF.hoursLeft(next) + 'h left')
        ),
        progressBar(next.progress, 'bar--lg'),
        h('p.next__hint', next.progress + '% complete'),
        h('div.next__acts',
          h('button.btn.btn--white.btn--sm', { type: 'button', onclick: function () { editTaskDialog(next); } }, 'Update progress'),
          h('button.btn.btn--ghostw.btn--sm', {
            type: 'button',
            onclick: function () {
              next.done = true; next.progress = 100;
              SF.save(); render(); toast('Done — nice work');
            }
          }, 'Mark complete')
        )
      ));
    } else if (!SF.state.tasks.length) {
      // Brand-new account: point at the first useful action rather than
      // congratulating someone who has not added anything yet.
      frag.appendChild(h('section.next.next--clear',
        h('h2.next__title', "Let's fill this in."),
        h('p.next__meta',
          'Add your first deadline — an assignment, an IA stage, a CAS reflection — and the ' +
          'dashboard starts tracking what is next.'),
        h('div.next__acts',
          h('button.btn.btn--white.btn--sm', { type: 'button', onclick: addTaskDialog }, 'Add a deadline'),
          !SF.state.subjects.length
            ? h('a.btn.btn--ghostw.btn--sm', { href: '#/settings' }, 'Add subjects first')
            : null
        )
      ));
    } else {
      frag.appendChild(h('section.next.next--clear',
        h('h2.next__title', 'Nothing outstanding.'),
        h('p.next__meta', 'Every deadline is cleared. Enjoy it while it lasts.')
      ));
    }

    // Stat tiles
    frag.appendChild(h('div.tiles',
      tile(week.length, 'due in the next 7 days', 'indigo'),
      tile(SF.totalHoursLeft(open) + 'h', 'of work outstanding', 'violet'),
      tile(casTotal + 'h', 'CAS hours logged', 'teal'),
      tile(Math.round((ee.words / ee.target) * 100) + '%', 'of the EE written', 'blue')
    ));

    // Two columns
    var upcoming = open.slice(0, 6);
    frag.appendChild(h('div.cols',
      sectionCard('Upcoming',
        upcoming.length
          ? h('ul.rows', upcoming.map(function (t) { return taskRow(t, { actions: false }); }))
          : emptyState('Nothing coming up.'),
        h('a.link', { href: '#/deadlines' }, 'View all')
      ),
      sectionCard("Today's study plan",
        todayBlocks.length
          ? h('ul.rows', todayBlocks.map(blockRow))
          : emptyState('No blocks planned for today. Build a plan in the study planner.'),
        h('a.link', { href: '#/planner' }, 'Open planner')
      )
    ));

    return frag;
  };

  function tile(value, label, color) {
    return h('div.tile.tile--' + color, h('b', String(value)), h('span', label));
  }

  function blockRow(b) {
    var t = SF.task(b.taskId);
    if (!t) return null;
    var li = h('li.row.row--block' + (b.done ? '.is-done' : ''),
      h('button.check', {
        type: 'button',
        'aria-pressed': String(b.done),
        'aria-label': (b.done ? 'Mark block incomplete: ' : 'Mark block done: ') + t.title,
        onclick: function () {
          b.done = !b.done;
          // Finishing a block advances the task by roughly the hours it covered.
          if (b.done && !t.done) {
            var gain = Math.round((b.hours / t.est) * 100);
            t.progress = Math.min(100, t.progress + gain);
            if (t.progress >= 100) t.done = true;
          }
          SF.save();
          li.classList.toggle('is-done', b.done);
          this.setAttribute('aria-pressed', String(b.done));
          refreshChrome();
          toast(b.done ? 'Block done — progress updated' : 'Block reopened');
        }
      }),
      h('div.row__main',
        h('p.row__title', t.title),
        h('p.row__meta', [SF.subjectName(t.subjectId), SF.TYPES[t.type].label].filter(Boolean).join(' · '))
      ),
      h('div.row__right', h('span.chip.chip--hours', b.hours + 'h'))
    );

    return li;
  }

  /* ---------- Deadlines ---------- */
  var LIST_PAGE = 60;
  var dl = { filter: 'all', search: '', showDone: false, limit: LIST_PAGE };

  views.deadlines = function () {
    var frag = document.createDocumentFragment();

    var filters = [{ k: 'all', label: 'All' }].concat(
      Object.keys(SF.TYPES).map(function (k) { return { k: k, label: SF.TYPES[k].label }; })
    );

    frag.appendChild(h('div.toolbar',
      h('div.chips', filters.map(function (f) {
        return h('button.fchip' + (dl.filter === f.k ? '.is-active' : ''), {
          type: 'button',
          onclick: function () { dl.filter = f.k; dl.limit = LIST_PAGE; render(); }
        }, f.label);
      })),
      h('div.toolbar__right',
        h('input.search', {
          type: 'search', placeholder: 'Search deadlines…', value: dl.search,
          'aria-label': 'Search deadlines',
          oninput: function (e) {
            dl.search = e.target.value;
            dl.limit = LIST_PAGE;
            var list = document.getElementById('dl-list');
            if (list) redrawDeadlines(list);
          }
        }),
        h('label.switch',
          h('input', {
            type: 'checkbox', checked: dl.showDone,
            onchange: function (e) { dl.showDone = e.target.checked; dl.limit = LIST_PAGE; render(); }
          }),
          h('span', 'Show completed')
        )
      )
    ));

    var list = h('ul.rows.rows--card#dl-list');
    redrawDeadlines(list);
    frag.appendChild(list);
    return frag;
  };

  function redrawDeadlines(list) {
    clear(list);
    var q = dl.search.trim().toLowerCase();

    // Sort by urgency once per redraw. Comparing the date strings directly is
    // both correct for ISO dates and far cheaper than parsing each one.
    var items = SF.state.tasks.filter(function (t) {
      if (!dl.showDone && t.done) return false;
      if (dl.filter !== 'all' && t.type !== dl.filter) return false;
      if (q) {
        var hay = (t.title + ' ' + (SF.subjectName(t.subjectId) || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
    });

    if (!items.length) {
      list.appendChild(h('li', emptyState('Nothing matches those filters.')));
      return;
    }

    // Long lists are built in pages: 400 rows is ~100ms of DOM work that nobody
    // scrolls through in one go.
    var shown = Math.min(items.length, dl.limit);
    var frag = document.createDocumentFragment();
    for (var i = 0; i < shown; i++) frag.appendChild(taskRow(items[i]));
    list.appendChild(frag);

    if (items.length > shown) {
      var rest = items.length - shown;
      list.appendChild(h('li.morerow',
        h('button.btn.btn--ghost.btn--sm', {
          type: 'button',
          onclick: function () { dl.limit += LIST_PAGE; redrawDeadlines(list); }
        }, 'Show ' + Math.min(rest, LIST_PAGE) + ' more'),
        h('span.morerow__note', rest + ' more of ' + items.length)
      ));
    }
  }

  /* ---------- Calendar ---------- */
  var cal = { year: null, month: null, selected: null };

  views.calendar = function () {
    var t = SF.today();
    if (cal.year == null) { cal.year = t.getFullYear(); cal.month = t.getMonth(); }
    if (!cal.selected) cal.selected = SF.iso(t);

    var first = new Date(cal.year, cal.month, 1);
    var startPad = (first.getDay() + 6) % 7;                 // Monday-first
    var daysInMonth = new Date(cal.year, cal.month + 1, 0).getDate();
    var label = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    function shift(n) {
      var d = new Date(cal.year, cal.month + n, 1);
      cal.year = d.getFullYear(); cal.month = d.getMonth();
      render();
    }

    var grid = h('div.cal__grid');
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function (d) {
      grid.appendChild(h('div.cal__dow', d));
    });
    for (var p = 0; p < startPad; p++) grid.appendChild(h('div.cal__pad'));

    for (var day = 1; day <= daysInMonth; day++) {
      (function (day) {
        var date = new Date(cal.year, cal.month, day);
        var key = SF.iso(date);
        var due = SF.tasksOn(key).filter(function (x) { return !x.done; });
        var blocks = SF.blocksOn(key);
        var isToday = key === SF.iso(t);

        grid.appendChild(h('button.cal__day' +
          (isToday ? '.is-today' : '') +
          (cal.selected === key ? '.is-sel' : ''), {
          type: 'button',
          'aria-label': SF.fmtDate(key) + ': ' + due.length + ' deadlines, ' + blocks.length + ' study blocks',
          onclick: function () { cal.selected = key; render(); }
        },
          h('span.cal__n', String(day)),
          h('span.cal__dots',
            due.slice(0, 3).map(function (x) { return h('i.dot.dot--' + SF.TYPES[x.type].color); }),
            blocks.length ? h('i.dot.dot--plan') : null
          )
        ));
      })(day);
    }

    var selDue = SF.tasksOn(cal.selected);
    var selBlocks = SF.blocksOn(cal.selected);

    return h('div.calwrap',
      h('section.card',
        h('div.card__head',
          h('h2', label),
          h('div.cal__nav',
            h('button.icon-btn.icon-btn--sm', { type: 'button', 'aria-label': 'Previous month', onclick: function () { shift(-1); } },
              icon('<path d="M15 18l-6-6 6-6"/>')),
            h('button.btn.btn--ghost.btn--sm', {
              type: 'button',
              onclick: function () { cal.year = t.getFullYear(); cal.month = t.getMonth(); cal.selected = SF.iso(t); render(); }
            }, 'Today'),
            h('button.icon-btn.icon-btn--sm', { type: 'button', 'aria-label': 'Next month', onclick: function () { shift(1); } },
              icon('<path d="M9 6l6 6-6 6"/>'))
          )
        ),
        grid,
        h('div.cal__key',
          Object.keys(SF.TYPES).map(function (k) {
            return h('span', h('i.dot.dot--' + SF.TYPES[k].color), SF.TYPES[k].label);
          }),
          h('span', h('i.dot.dot--plan'), 'Study block')
        )
      ),
      h('section.card',
        h('div.card__head', h('h2', SF.fmtDate(cal.selected))),
        h('h3.sub', 'Deadlines'),
        selDue.length ? h('ul.rows', selDue.map(function (x) { return taskRow(x, { actions: false }); }))
                      : emptyState('No deadlines on this day.'),
        h('h3.sub', 'Study blocks'),
        selBlocks.length ? h('ul.rows', selBlocks.map(blockRow))
                         : emptyState('No study blocks planned.')
      )
    );
  };

  /* ---------- Planner ---------- */
  var DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  views.planner = function () {
    var av = SF.state.availability;
    var totalCap = Object.keys(av).reduce(function (s, k) { return s + (av[k] || 0); }, 0);
    var open = SF.openTasks();
    var need = SF.totalHoursLeft(open);

    var editor = h('div.avail', [1, 2, 3, 4, 5, 6, 0].map(function (d) {
      return h('label.avail__day',
        h('span', DOW[d].slice(0, 3)),
        h('input', {
          type: 'number', min: 0, max: 12, step: 0.5, value: av[d] || 0,
          'aria-label': 'Free study hours on ' + DOW[d],
          onchange: function (e) {
            av[d] = Math.max(0, parseFloat(e.target.value) || 0);
            SF.save();
            render();
          }
        }),
        h('em', 'hrs')
      );
    }));

    var frag = document.createDocumentFragment();

    frag.appendChild(sectionCard('When are you free?',
      h('div',
        h('p.card__lede', 'Set the hours you can realistically study each day. The planner never schedules outside them.'),
        editor,
        h('p.card__note', totalCap + 'h available per week · ' + need + 'h of work outstanding · ' +
          (totalCap > 0 ? 'about ' + (Math.ceil(need / totalCap * 10) / 10) + ' weeks to clear it' : 'add some hours to build a plan'))
      )
    ));

    frag.appendChild(h('div.planhead',
      h('button.btn.btn--primary', {
        type: 'button',
        onclick: function () {
          var b = SF.generatePlan();
          render();
          toast(b.length ? 'Planned ' + b.length + ' study blocks' : 'Nothing to schedule');
        }
      }, SF.state.blocks.length ? 'Rebuild plan' : 'Generate plan'),
      SF.state.blocks.length
        ? h('button.btn.btn--ghost', {
            type: 'button',
            onclick: function () { SF.state.blocks = []; SF.save(); render(); toast('Plan cleared'); }
          }, 'Clear plan')
        : null
    ));

    if (!SF.state.blocks.length) {
      frag.appendChild(h('div.card', emptyState('No plan yet. Generate one and StudyFlow will spread your outstanding work across the next two weeks, capped at 2h per task per day.')));
      return frag;
    }

    // Group blocks by date
    var byDate = {};
    SF.state.blocks.forEach(function (b) { (byDate[b.date] = byDate[b.date] || []).push(b); });

    var days = Object.keys(byDate).sort();
    frag.appendChild(h('div.plan', days.map(function (dkey) {
      var list = byDate[dkey];
      var hours = list.reduce(function (s, b) { return s + b.hours; }, 0);
      var d = SF.parseISO(dkey);
      var isToday = dkey === SF.iso(SF.today());

      return h('section.card.planday' + (isToday ? '.is-today' : ''),
        h('div.card__head',
          h('h2', d.toLocaleDateString(undefined, { weekday: 'long' }) + (isToday ? ' · today' : '')),
          h('span.chip.chip--hours', hours + 'h')
        ),
        h('p.planday__date', SF.fmtDate(dkey)),
        h('ul.rows', list.map(blockRow))
      );
    })));

    return frag;
  };

  /* ---------- Extended Essay ---------- */
  views.ee = function () {
    var ee = SF.state.ee;
    var pct = Math.round((ee.words / ee.target) * 100);
    var doneMs = ee.milestones.filter(function (m) { return m.done; }).length;

    var frag = document.createDocumentFragment();

    frag.appendChild(h('div.eehead',
      h('div.eehead__main',
        h('p.eyebrow', 'Extended Essay · ' + (SF.subjectName(ee.subjectId) || 'Subject not set')),
        h('h2.eehead__rq', ee.rq || 'No research question yet'),
        h('button.link', { type: 'button', onclick: function () {
          openModal('Research question', [
            { name: 'rq', label: 'Research question', type: 'textarea', rows: 3, value: ee.rq },
            { name: 'subjectId', label: 'Subject', type: 'select', value: ee.subjectId,
              options: SF.state.subjects.map(function (s) { return { value: s.id, label: s.name + ' ' + s.level }; }) }
          ], function (d) {
            ee.rq = d.rq.trim(); ee.subjectId = d.subjectId;
            SF.save(); render(); toast('Research question saved');
          });
        } }, 'Edit question')
      ),
      h('div.eehead__ring',
        h('div.ring', { style: '--p:' + Math.min(100, pct) }, h('span', pct + '%')),
        h('p', ee.words.toLocaleString() + ' / ' + ee.target.toLocaleString() + ' words')
      )
    ));

    frag.appendChild(sectionCard('Word count',
      h('div',
        progressBar(pct, 'bar--lg'),
        h('div.wordrow',
          h('label.field.field--inline',
            h('span', 'Current word count'),
            h('input', {
              type: 'number', min: 0, max: 10000, step: 10, value: ee.words,
              onchange: function (e) {
                ee.words = Math.max(0, parseInt(e.target.value, 10) || 0);
                SF.save(); render(); toast('Word count updated');
              }
            })
          ),
          h('p.card__note', (ee.target - ee.words > 0
            ? (ee.target - ee.words).toLocaleString() + ' words to go'
            : 'Over the limit by ' + (ee.words - ee.target).toLocaleString() + ' — time to trim'))
        )
      )
    ));

    frag.appendChild(h('div.cols',
      sectionCard('Milestones (' + doneMs + '/' + ee.milestones.length + ')',
        h('ul.rows', ee.milestones.slice().sort(function (a, b) { return a.due < b.due ? -1 : 1; }).map(function (m) {
          return h('li.row' + (m.done ? '.is-done' : ''),
            h('button.check', {
              type: 'button', 'aria-pressed': String(m.done),
              'aria-label': (m.done ? 'Mark incomplete: ' : 'Mark complete: ') + m.title,
              onclick: function () { m.done = !m.done; SF.save(); render(); }
            }),
            h('div.row__main',
              h('p.row__title', m.title),
              h('p.row__meta', SF.fmtDate(m.due))
            ),
            h('div.row__right', h('span.row__due' + (!m.done && SF.daysUntil(m.due) < 0 ? '.is-late' : ''), SF.dueLabel(m.due)))
          );
        })),
        h('button.link', { type: 'button', onclick: function () {
          openModal('New milestone', [
            { name: 'title', label: 'Milestone', value: '', placeholder: 'e.g. Second draft to supervisor' },
            { name: 'due', label: 'Due date', type: 'date', value: SF.iso(SF.addDays(SF.today(), 14)) }
          ], function (d) {
            ee.milestones.push({ id: SF.uid('m'), title: d.title.trim() || 'Milestone', due: d.due, done: false });
            SF.save(); render(); toast('Milestone added');
          }, 'Add milestone');
        } }, '+ Add milestone')
      ),

      sectionCard('Supervisor meetings',
        ee.meetings.length
          ? h('ul.rows', ee.meetings.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(function (g) {
              return h('li.row.row--note',
                h('div.row__main',
                  h('p.row__title', SF.fmtDate(g.date)),
                  h('p.row__meta', g.notes)
                )
              );
            }))
          : emptyState('No meetings logged yet.'),
        h('button.link', { type: 'button', onclick: function () {
          openModal('Log a meeting', [
            { name: 'date', label: 'Date', type: 'date', value: SF.iso(SF.today()) },
            { name: 'notes', label: 'What was agreed?', type: 'textarea', rows: 3, value: '' }
          ], function (d) {
            ee.meetings.push({ id: SF.uid('g'), date: d.date, notes: d.notes.trim() });
            SF.save(); render(); toast('Meeting logged');
          }, 'Log meeting');
        } }, '+ Log meeting')
      )
    ));

    return frag;
  };

  /* ---------- CAS ---------- */
  var casLimit = LIST_PAGE;
  var STRANDS = [
    { k: 'creativity', label: 'Creativity', color: 'violet' },
    { k: 'activity', label: 'Activity', color: 'blue' },
    { k: 'service', label: 'Service', color: 'teal' }
  ];

  views.cas = function () {
    var by = SF.casByStrand();
    var total = by.creativity + by.activity + by.service;
    var outcomes = SF.casOutcomes();
    var metCount = outcomes.filter(function (o) { return o.met; }).length;
    var max = Math.max(by.creativity, by.activity, by.service, 1);

    var frag = document.createDocumentFragment();

    frag.appendChild(h('div.tiles',
      tile(total + 'h', 'total CAS hours', 'teal'),
      tile(by.creativity + 'h', 'creativity', 'violet'),
      tile(by.activity + 'h', 'activity', 'blue'),
      tile(metCount + '/7', 'learning outcomes evidenced', 'indigo')
    ));

    frag.appendChild(sectionCard('Strand balance',
      h('div.meters', STRANDS.map(function (s) {
        return h('div.meter',
          h('span', s.label),
          h('div.meter__track', h('i.meter__fill.meter__fill--' + s.color, { style: 'width:' + (by[s.k] / max * 100) + '%' })),
          h('b', by[s.k] + 'h')
        );
      }))
    ));

    frag.appendChild(sectionCard('Learning outcomes (' + metCount + '/7)',
      h('ul.outcomes', outcomes.map(function (o, i) {
        return h('li.outcome' + (o.met ? '.is-met' : ''),
          h('i.outcome__tick', o.met ? '✓' : String(i + 1)),
          h('span', o.label)
        );
      }))
    ));

    var casSorted = SF.state.cas.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var casShown = casSorted.slice(0, casLimit);

    frag.appendChild(sectionCard('Experiences',
      SF.state.cas.length
        ? h('ul.rows', casShown.map(function (e) {
            var strand = STRANDS.filter(function (s) { return s.k === e.strand; })[0];
            return h('li.row.row--cas',
              h('div.row__main',
                h('p.row__title', e.title),
                h('p.row__meta', SF.fmtDate(e.date) + (e.reflection ? ' · ' + e.reflection : '')),
                e.outcomes && e.outcomes.length
                  ? h('p.row__tags', e.outcomes.map(function (o) { return h('span.tagchip', 'LO' + (o + 1)); }))
                  : null
              ),
              h('div.row__right',
                h('span.chip.chip--' + strand.color, strand.label),
                h('span.chip.chip--hours', e.hours + 'h'),
                h('button.icon-btn.icon-btn--sm', {
                  type: 'button', 'aria-label': 'Delete ' + e.title, title: 'Delete',
                  onclick: function () {
                    if (!confirm('Delete "' + e.title + '"?')) return;
                    SF.state.cas = SF.state.cas.filter(function (x) { return x.id !== e.id; });
                    SF.save(); render(); toast('Experience deleted');
                  }
                }, icon('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'))
              )
            );
          }))
        : emptyState('No experiences logged yet.'),
      casSorted.length > casShown.length
        ? h('div.morerow',
            h('button.btn.btn--ghost.btn--sm', {
              type: 'button',
              onclick: function () { casLimit += LIST_PAGE; render(); }
            }, 'Show ' + Math.min(casSorted.length - casShown.length, LIST_PAGE) + ' more'),
            h('span.morerow__note', (casSorted.length - casShown.length) + ' more of ' + casSorted.length))
        : null,
      h('button.link', { type: 'button', onclick: addCas }, '+ Log experience')
    ));

    return frag;
  };

  function addCas() {
    openModal('Log a CAS experience', [
      { name: 'title', label: 'What did you do?', value: '', placeholder: 'e.g. Volunteer maths tutoring' },
      { name: 'strand', label: 'Strand', type: 'select', value: 'service',
        options: STRANDS.map(function (s) { return { value: s.k, label: s.label }; }) },
      { name: 'hours', label: 'Hours', type: 'number', value: 2, min: 0.5, step: 0.5 },
      { name: 'date', label: 'Date', type: 'date', value: SF.iso(SF.today()) },
      { name: 'reflection', label: 'Reflection', type: 'textarea', rows: 3, value: '', required: false },
      { name: 'outcomes', label: 'Learning outcomes met', type: 'text', value: '', required: false,
        placeholder: 'e.g. 1, 4, 7', hint: 'Comma-separated numbers from 1 to 7.' }
    ], function (d) {
      var os = String(d.outcomes || '').split(',')
        .map(function (x) { return parseInt(x.trim(), 10) - 1; })
        .filter(function (n) { return n >= 0 && n < 7; });

      SF.state.cas.push({
        id: SF.uid('c'),
        strand: d.strand,
        title: d.title.trim() || 'Experience',
        hours: Math.max(0.5, parseFloat(d.hours) || 1),
        date: d.date,
        reflection: (d.reflection || '').trim(),
        outcomes: os
      });
      SF.save(); render(); toast('Experience logged');
    }, 'Log experience');
  }

  /* ---------- Progress ---------- */
  views.progress = function () {
    var all = SF.state.tasks;
    var done = SF.doneTasks();
    var pct = all.length ? Math.round((done.length / all.length) * 100) : 0;
    var by = SF.casByStrand();
    var ee = SF.state.ee;

    // Per-subject completion
    var rows = SF.state.subjects.map(function (s) {
      var mine = all.filter(function (t) { return t.subjectId === s.id; });
      var d = mine.filter(function (t) { return t.done; }).length;
      return { name: s.name + ' ' + s.level, done: d, total: mine.length, pct: mine.length ? Math.round(d / mine.length * 100) : 0 };
    }).filter(function (r) { return r.total > 0; });

    // Per-category breakdown
    var cats = Object.keys(SF.TYPES).map(function (k) {
      var mine = all.filter(function (t) { return t.type === k; });
      var d = mine.filter(function (t) { return t.done; }).length;
      return { k: k, label: SF.TYPES[k].label, color: SF.TYPES[k].color, done: d, total: mine.length };
    }).filter(function (c) { return c.total > 0; });

    var frag = document.createDocumentFragment();

    frag.appendChild(h('div.tiles',
      tile(pct + '%', 'of all deadlines cleared', 'indigo'),
      tile(done.length + '/' + all.length, 'tasks complete', 'violet'),
      tile((by.creativity + by.activity + by.service) + 'h', 'CAS hours', 'teal'),
      tile(ee.words.toLocaleString(), 'EE words written', 'blue')
    ));

    frag.appendChild(sectionCard('By subject',
      rows.length
        ? h('div.meters', rows.map(function (r) {
            return h('div.meter',
              h('span', r.name),
              h('div.meter__track', h('i.meter__fill', { style: 'width:' + r.pct + '%' })),
              h('b', r.done + '/' + r.total)
            );
          }))
        : emptyState('No subject-linked tasks yet.')
    ));

    frag.appendChild(sectionCard('By category',
      h('div.meters', cats.map(function (c) {
        return h('div.meter',
          h('span', c.label),
          h('div.meter__track', h('i.meter__fill.meter__fill--' + c.color, { style: 'width:' + (c.done / c.total * 100) + '%' })),
          h('b', c.done + '/' + c.total)
        );
      }))
    ));

    frag.appendChild(sectionCard('IB core status',
      h('div.core',
        h('div.core__item',
          h('p.core__label', 'Extended Essay'),
          progressBar(Math.round(ee.words / ee.target * 100)),
          h('p.core__note', ee.words.toLocaleString() + ' of ' + ee.target.toLocaleString() + ' words · ' +
            ee.milestones.filter(function (m) { return m.done; }).length + '/' + ee.milestones.length + ' milestones')
        ),
        h('div.core__item',
          h('p.core__label', 'CAS'),
          progressBar(Math.round(SF.casOutcomes().filter(function (o) { return o.met; }).length / 7 * 100)),
          h('p.core__note', SF.casOutcomes().filter(function (o) { return o.met; }).length + '/7 learning outcomes evidenced')
        ),
        h('div.core__item',
          h('p.core__label', 'TOK'),
          (function () {
            var tok = all.filter(function (t) { return t.type === 'tok'; });
            var d = tok.filter(function (t) { return t.done; }).length;
            return progressBar(tok.length ? d / tok.length * 100 : 0);
          })(),
          h('p.core__note', (function () {
            var tok = all.filter(function (t) { return t.type === 'tok'; });
            return tok.filter(function (t) { return t.done; }).length + '/' + tok.length + ' TOK tasks complete';
          })())
        )
      )
    ));

    return frag;
  };

  /* ---------- ManageBac import ---------- */
  var imp = { candidates: null, calendarName: '', error: '', busy: false };

  function handleIcs(text, sourceLabel) {
    imp.error = '';
    var parsed;
    try {
      parsed = ICAL.parse(text);
    } catch (e) {
      imp.error = 'That file could not be read as a calendar.';
      imp.candidates = null;
      render();
      return;
    }

    if (!parsed.events.length) {
      imp.error = 'No events found in that calendar. Make sure you exported the ' +
                  'ManageBac feed and not an empty date range.';
      imp.candidates = null;
      render();
      return;
    }

    imp.calendarName = parsed.calendarName || sourceLabel || 'Calendar';
    imp.candidates = ICAL.toCandidates(parsed.events, SF.state.subjects, SF.state.tasks);
    render();
    toast('Found ' + parsed.events.length + ' events');
  }

  views.import = function () {
    var frag = document.createDocumentFragment();

    frag.appendChild(h('div.alert.alert--info',
      h('b', 'How this works'),
      h('span',
        "ManageBac's API is school-wide and only an administrator can issue a token, so an app " +
        "like this cannot log in as you. What you can export yourself is your calendar feed — " +
        "that carries your deadlines, and it is what StudyFlow reads here.")
    ));

    // Step 1 — get the file
    frag.appendChild(sectionCard('1. Export your ManageBac calendar',
      h('div',
        h('ol.steps--num',
          h('li', 'In ManageBac, open ', h('b', 'Calendar'), ' and click ', h('b', 'Subscribe to Calendar'), '.'),
          h('li', 'Copy the iCal link it gives you, and paste it into your browser\'s address bar.'),
          h('li', 'Your browser downloads a ', h('code', '.ics'), ' file — that is the file to bring here.')
        ),
        h('p.card__note',
          'ManageBac includes one month before and three months after the date you subscribe, ' +
          'so re-export near the end of a term to pick up new deadlines.')
      )
    ));

    // Step 2 — feed it in
    var fileInput = h('input#ics-file', {
      type: 'file', accept: '.ics,text/calendar',
      onchange: function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () { handleIcs(String(reader.result), f.name); };
        reader.onerror = function () {
          imp.error = 'That file could not be read.';
          render();
        };
        reader.readAsText(f);
      }
    });

    var pasteBox = h('textarea#ics-paste', {
      rows: 4,
      placeholder: 'BEGIN:VCALENDAR\nVERSION:2.0\n…'
    });

    frag.appendChild(sectionCard('2. Bring it into StudyFlow',
      h('div.impgrid',
        h('label.field',
          h('span', 'Upload the .ics file'),
          fileInput
        ),
        h('label.field',
          h('span', '…or paste its contents'),
          pasteBox,
          h('button.btn.btn--ghost.btn--sm', {
            type: 'button',
            onclick: function () {
              var v = document.getElementById('ics-paste').value.trim();
              if (!v) { toast('Paste the calendar text first'); return; }
              handleIcs(v, 'Pasted calendar');
            }
          }, 'Read pasted calendar')
        )
      ),
      imp.error ? h('div.alert.alert--red', h('span', imp.error)) : null
    ));

    // Step 3 — review
    if (imp.candidates) {
      var cands = imp.candidates;
      var selectable = cands.filter(function (c) { return !c.already; });
      var chosen = cands.filter(function (c) { return c.selected && !c.already; });

      var list = h('ul.rows.rows--card', cands.map(function (c) {
        return h('li.row' + (c.already ? '.is-done' : ''),
          h('button.check' + (c.selected ? '' : ''), {
            type: 'button',
            disabled: c.already,
            'aria-pressed': String(c.selected),
            'aria-label': (c.selected ? 'Do not import: ' : 'Import: ') + c.title,
            onclick: function () { c.selected = !c.selected; render(); }
          }),
          h('div.row__main',
            h('p.row__title', c.title),
            h('p.row__meta', [
              SF.fmtDate(c.due),
              c.subjectName,
              c.already ? 'already imported' : null,
              c.isClass ? 'looks like a timetabled lesson' : null
            ].filter(Boolean).join(' · '))
          ),
          h('div.row__right',
            typeChip(c.type),
            c.isClass ? h('span.chip.chip--lesson', 'Lesson?') : null
          )
        );
      }));

      // Selection state is on the candidate objects, so re-render after bulk ops.
      function setAll(fn) {
        cands.forEach(function (c) { if (!c.already) c.selected = fn(c); });
        render();
      }

      frag.appendChild(sectionCard('3. Review before importing',
        h('div',
          h('p.card__lede',
            imp.calendarName + ' · ' + cands.length + ' events · ' +
            chosen.length + ' selected. Timetabled lessons and anything already ' +
            'imported are left out by default.'),
          h('div.impacts',
            h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: function () { setAll(function () { return true; }); } }, 'Select all'),
            h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: function () { setAll(function () { return false; }); } }, 'Select none'),
            h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: function () { setAll(function (c) { return !c.isClass; }); } }, 'Deadlines only')
          ),
          list,
          h('div.impacts',
            h('button.btn.btn--primary', {
              type: 'button',
              disabled: !chosen.length,
              onclick: function () {
                var n = SF.importTasks(cands);
                imp.candidates = null;
                location.hash = '#/deadlines';
                render();
                toast(n ? 'Imported ' + n + ' deadlines' : 'Nothing imported');
              }
            }, chosen.length ? 'Import ' + chosen.length + ' deadlines' : 'Nothing selected'),
            h('button.btn.btn--ghost', {
              type: 'button',
              onclick: function () { imp.candidates = null; render(); }
            }, 'Discard')
          ),
          !selectable.length ? emptyState('Everything in this calendar is already in StudyFlow.') : null
        )
      ));
    }

    return frag;
  };

  /* ---------- Messages ---------- */
  var msgDrafts = {};   // taskId -> edited draft, so edits survive re-renders
  var msgLimit = 15;    // each draft is a full form; build them in batches

  views.messages = function () {
    var risky = SF.atRisk();
    var frag = document.createDocumentFragment();

    frag.appendChild(h('div.alert.alert--info',
      h('b', 'Drafted for you — sent by you'),
      h('span',
        'StudyFlow writes these automatically whenever something is overdue or about to slip. ' +
        'It will not send them on its own: a message to a teacher cannot be unsent, and only ' +
        'you know whether it is the right thing to send.')
    ));

    if (!risky.length) {
      frag.appendChild(h('div.card',
        emptyState('Nothing needs a message right now. Anything overdue, or due within two days and under halfway done, will show up here.')
      ));
      return frag;
    }

    var shownRisky = risky.slice(0, msgLimit);

    shownRisky.forEach(function (t) {
      var base = SF.draftMessage(t);
      var d = msgDrafts[t.id] || (msgDrafts[t.id] = {
        to: base.to, subjectLine: base.subjectLine, body: base.body
      });

      var mailto = 'mailto:' + encodeURIComponent(d.to) +
        '?subject=' + encodeURIComponent(d.subjectLine) +
        '&body=' + encodeURIComponent(d.body);

      frag.appendChild(h('section.card.msg',
        h('div.card__head',
          h('h2', t.title),
          h('span.chip.chip--' + (base.reason === 'overdue' ? 'red' : 'amber'),
            base.reason === 'overdue' ? SF.dueLabel(t.due) : 'Due ' + SF.dueLabel(t.due).toLowerCase())
        ),
        h('p.card__note', [SF.subjectName(t.subjectId), t.progress + '% done'].filter(Boolean).join(' · ')),

        !base.hasRecipient
          ? h('div.alert.alert--amber',
              h('span', 'No teacher email saved for this subject yet — '),
              h('a.link', { href: '#/settings' }, 'add one in Settings'),
              h('span', ' and it will fill in here.'))
          : null,

        h('label.field',
          h('span', 'To'),
          h('input', {
            type: 'email', value: d.to, placeholder: 'teacher@school.edu',
            oninput: function (e) { d.to = e.target.value; }
          })
        ),
        h('label.field',
          h('span', 'Subject'),
          h('input', {
            type: 'text', value: d.subjectLine,
            oninput: function (e) { d.subjectLine = e.target.value; }
          })
        ),
        h('label.field',
          h('span', 'Message'),
          h('textarea', {
            rows: 11, value: d.body,
            oninput: function (e) { d.body = e.target.value; }
          })
        ),

        h('div.msg__acts',
          h('a.btn.btn--primary' + (d.to ? '' : '.is-off'), {
            href: d.to ? mailto : null,
            onclick: function () {
              if (!d.to) return false;
              SF.markNotified(t.id);
              setTimeout(function () { render(); toast('Opened in your mail app'); }, 300);
            }
          }, 'Open in mail app'),

          h('button.btn.btn--ghost', {
            type: 'button',
            onclick: function () {
              var text = 'To: ' + d.to + '\nSubject: ' + d.subjectLine + '\n\n' + d.body;
              copyText(text, 'Message copied');
            }
          }, 'Copy message'),

          h('button.link', {
            type: 'button',
            onclick: function () {
              SF.markNotified(t.id);
              render();
              toast('Dismissed — it will not come back');
            }
          }, 'Dismiss')
        )
      ));
    });

    if (risky.length > shownRisky.length) {
      var restMsgs = risky.length - shownRisky.length;
      frag.appendChild(h('div.morerow',
        h('button.btn.btn--ghost.btn--sm', {
          type: 'button',
          onclick: function () { msgLimit += 15; render(); }
        }, 'Draft ' + Math.min(restMsgs, 15) + ' more'),
        h('span.morerow__note', restMsgs + ' more of ' + risky.length + ' need a heads-up')
      ));
    }

    return frag;
  };

  /** Clipboard with a fallback for browsers that block the async API. */
  function copyText(text, okMsg) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? okMsg : 'Could not copy — select the text and copy manually');
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    } else {
      fallback();
    }
  }

  /* ---------- Settings ---------- */
  views.settings = function () {
    var st = SF.state;
    var frag = document.createDocumentFragment();

    if (SF.isDemo()) {
      frag.appendChild(h('div.alert.alert--amber',
        h('b', 'You are using the example account'),
        h('span', "This is sample data for exploring the app. Set up your own diploma below when you're ready — it replaces this.")
      ));
    }

    // Profile
    frag.appendChild(sectionCard('Your details',
      h('label.field.field--inline',
        h('span', 'Name'),
        h('input', {
          type: 'text', value: st.profile.name, placeholder: 'Your name',
          onchange: function (e) {
            st.profile.name = e.target.value.trim();
            SF.save(); render(); toast('Name updated');
          }
        })
      )
    ));

    // Subjects
    var subjectList = st.subjects.length
      ? h('ul.rows', st.subjects.map(function (s) {
          return h('li.row',
            h('div.row__main',
              h('p.row__title', s.name),
              h('p.row__meta', s.level === 'HL' ? 'Higher level' : 'Standard level')
            ),
            h('div.row__right',
              h('button.link.teachbtn', {
                type: 'button',
                onclick: function () {
                  var te = s.teacher || {};
                  openModal('Teacher for ' + s.name, [
                    { name: 'tname', label: 'Teacher name', value: te.name || '', required: false,
                      placeholder: 'e.g. Ms Okafor' },
                    { name: 'temail', label: 'Teacher email', type: 'email', value: te.email || '',
                      required: false, placeholder: 'teacher@school.edu',
                      hint: 'Used to address drafted messages. Nothing is ever sent without you.' }
                  ], function (d) {
                    s.teacher = { name: d.tname.trim(), email: d.temail.trim() };
                    SF.save(); render(); toast('Teacher saved');
                  });
                }
              }, s.teacher && s.teacher.email ? '✎ ' + (s.teacher.name || s.teacher.email) : '+ Teacher'),
              h('div.seg', ['HL', 'SL'].map(function (lv) {
                return h('button.seg__btn' + (s.level === lv ? '.is-on' : ''), {
                  type: 'button', 'aria-pressed': String(s.level === lv),
                  onclick: function () { s.level = lv; SF.save(); render(); }
                }, lv);
              })),
              h('button.icon-btn.icon-btn--sm', {
                type: 'button', 'aria-label': 'Remove ' + s.name, title: 'Remove',
                onclick: function () {
                  if (!confirm('Remove "' + s.name + '"? Deadlines using it stay, but lose their subject.')) return;
                  SF.removeSubject(s.id);
                  render(); toast('Subject removed');
                }
              }, icon('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'))
            )
          );
        }))
      : emptyState('No subjects yet. Add the ones you are taking.');

    var subjPicker = DOM.presetPicker(SF.SUBJECT_GROUPS, {
      id: 'new-subject',
      placeholder: 'Search ' + SF.SUBJECT_PRESETS.length + ' IB courses, or type your own…',
      isTaken: function (name) {
        return st.subjects.some(function (x) { return x.name.toLowerCase() === name.toLowerCase(); });
      },
      onPick: addSubject,
      onEnter: addSubject
    });

    frag.appendChild(sectionCard('Subjects',
      h('div',
        subjectList,
        subjPicker.el
      )
    ));

    function addSubject(nameRaw) {
      var name = String(nameRaw || '').trim();
      if (!name) return;
      if (st.subjects.some(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })) {
        toast('That subject is already there');
        return;
      }
      st.subjects.push({ id: SF.uid('s'), name: name, level: 'HL' });
      SF.save(); render(); toast('Subject added');
    }

    // EE settings
    frag.appendChild(sectionCard('Extended Essay',
      h('div.setgrid',
        h('label.field',
          h('span', 'Subject'),
          h('select', {
            onchange: function (e) { st.ee.subjectId = e.target.value || null; SF.save(); render(); }
          }, [{ value: '', label: '— Not set —' }].concat(
            st.subjects.map(function (s) { return { value: s.id, label: s.name + ' ' + s.level }; })
          ).map(function (o) {
            return h('option', { value: o.value, selected: o.value === (st.ee.subjectId || '') }, o.label);
          }))
        ),
        h('label.field',
          h('span', 'Word target'),
          h('input', {
            type: 'number', min: 500, max: 10000, step: 100, value: st.ee.target,
            onchange: function (e) {
              st.ee.target = Math.max(500, parseInt(e.target.value, 10) || 4000);
              SF.save(); render(); toast('Word target updated');
            }
          })
        )
      )
    ));

    // Sign-in and syncing
    frag.appendChild(signInCard());

    // Account actions
    frag.appendChild(sectionCard('This device', stack(
      h('div.setacts',
        h('button.btn.btn--ghost', {
          type: 'button',
          onclick: function () {
            SFOnboard.run({ tourOnly: true, onDone: function () { render(); } });
          }
        }, 'Replay the tour'),

        h('button.btn.btn--ghost', {
          type: 'button',
          onclick: function () {
            if (!confirm('Load the example account? This replaces what is currently on this device.' +
              (signedInUser() ? '\n\nThe example is never uploaded, so your account copy is left alone.' : ''))) return;
            SF.useExample();
            location.hash = '#/dashboard';
            render(); toast('Example account loaded');
          }
        }, 'Load example account'),

        h('button.btn.btn--danger', {
          type: 'button',
          onclick: function () {
            var who = signedInUser();
            if (!confirm(who
              ? 'Start over? This empties your diploma on this device and in your account. It cannot be undone.'
              : 'Start over? Everything currently stored will be deleted.')) return;
            SF.clearAccount();
            if (window.SFSync) SFSync.clearMark();
            boot();
          }
        }, 'Start over')
      ),
      h('p.card__note', signedInUser()
        ? 'Your diploma lives in your account and is copied to this browser so it works offline.'
        : 'Everything is stored in this browser only — nothing is uploaded.'),
      h('p.card__note',
        h('a.link', { href: '/privacy.html', target: '_blank', rel: 'noopener' }, 'What we store'),
        ' · ',
        h('a.link', { href: '/terms.html', target: '_blank', rel: 'noopener' }, 'Terms of use'))
    )));

    frag.appendChild(aboutCard());

    return frag;
  };

  /* ---------- Settings · sign-in ---------- */

  /** The sync badge, as a standalone node so it can be swapped in place. */
  function syncPill() {
    var s = window.SFSync && SFSync.enabled() ? SFSync.state() : { status: 'off' };
    var word = SYNC_WORDS[s.status] || SYNC_WORDS.idle;
    return h('span.syncpill.' + (word[1] || ''),
      h('i.whoami__dot'),
      h('span', word[0] || 'Not syncing'),
      s.at && (s.status === 'saved' || s.status === 'idle')
        ? h('em', ' · ' + new Date(s.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))
        : null
    );
  }

  function signInCard() {
    /* No backend configured. Only the person who deployed the site can fix
       that, so this is a short factual note rather than an error. */
    if (!accountsOn()) {
      return sectionCard('Accounts', stack(
        h('p.card__note',
          'Email and password accounts are not switched on here, so StudyFlow is running ' +
          'as a local tool: your diploma is saved in this browser and nowhere else.'),
        h('p.card__note',
          'This is what you get from a bare folder or a local server. Deploy the site to ' +
          'Netlify and accounts switch themselves on — the accounts server ships in the ' +
          'project, so there is nothing to sign up for. SETUP.md has the details, including ' +
          'how to use a hosted identity service instead if you want verified email ' +
          'addresses and emailed password resets.')
      ));
    }

    var who = signedInUser();

    if (!who) {
      return sectionCard('Accounts', stack(
        h('p.card__note',
          'You are using StudyFlow without an account, so everything is saved in this ' +
          'browser only. Clearing your browser data would erase it, and it will not appear ' +
          'on your phone.'),
        h('div.setacts',
          h('button.btn.btn--primary', {
            type: 'button',
            onclick: function () {
              localOnly(false);
              /* Signing up from here keeps the diploma that is already on this
                 device — reconcile uploads it, since the server has nothing. */
              gate({ start: 'signup', allowLocal: false });
            }
          }, 'Create an account and sync this diploma'),
          h('button.btn.btn--ghost', {
            type: 'button',
            onclick: function () { localOnly(false); gate({ start: 'login', allowLocal: false }); }
          }, 'Log in to an existing account')
        )
      ));
    }

    return sectionCard('Your account', stack(
      h('div.setgrid',
        h('label.field',
          h('span', 'Email'),
          h('input', { type: 'email', value: who.email, readonly: true, 'aria-describedby': 'email-note' })
        ),
        h('div.field',
          h('span', 'Syncing'),
          h('div.field__static', syncPill())
        )
      ),
      h('p.card__note', { id: 'email-note' },
        'Your diploma is saved to this account, so logging in on another device brings it ' +
        'with you. Changes save on this device first and upload a moment later, which is ' +
        'why it keeps working with no signal.'),

      SFAuth.can().recoveryCode
        ? h('p.card__note',
            'This site cannot send email, so your address is a username rather than ' +
            'something we have checked, and there is no reset link. If you forget your ' +
            'password, the recovery code you saved when you signed up is the way back in.')
        : null,

      h('div.setacts',
        h('button.btn.btn--ghost', {
          type: 'button',
          onclick: function () {
            if (!window.SFSync) return;
            SFSync.flush().then(function () {
              var s = SFSync.state();
              toast(s.status === 'saved' ? 'Saved to your account'
                : s.status === 'offline' ? 'Still offline — it will go up automatically'
                : s.error || 'Could not reach your account');
            });
          }
        }, 'Sync now'),

        h('button.btn.btn--ghost', { type: 'button', onclick: changePassword }, 'Change password'),

        h('button.btn.btn--danger', { type: 'button', onclick: deleteAccount }, 'Delete my account')
      )
    ));
  }

  function changePassword() {
    openModal('Change password', [
      { name: 'pw', label: 'New password', type: 'password', required: true,
        hint: 'At least 8 characters.', autocomplete: 'new-password' },
      { name: 'pw2', label: 'New password again', type: 'password', required: true,
        autocomplete: 'new-password' }
    ], function (v) {
      if (String(v.pw).length < 8) { toast('Use at least 8 characters'); return false; }
      if (v.pw !== v.pw2) { toast('Those two passwords are not the same'); return false; }
      SFAuth.setPassword(v.pw).then(function () {
        toast('Password changed');
      }, function (err) { toast(err.message); });
    }, 'Change password');
  }

  function deleteAccount() {
    var who = signedInUser();
    if (!who) return;
    /* Typing the address is friction on purpose: this is the one action in the
       app that destroys data the student cannot get back from anywhere. */
    var typed = prompt(
      'This permanently deletes your StudyFlow account and everything in it — ' +
      'deadlines, CAS hours, your Extended Essay. It cannot be undone.\n\n' +
      'Type your email address to confirm:');
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== who.email.toLowerCase()) {
      return toast('That did not match — nothing was deleted');
    }
    SFAuth.deleteAccount().then(function () {
      SF.clearAccount();
      if (window.SFSync) SFSync.clearMark();
      localOnly(false);
      location.hash = '';
      boot();
    });
  }

  /* ---------- Settings · about ----------
     Which build is this? Without an answer to that, "the update is not live"
     and "your browser is still showing you the old one" look identical — and
     they have completely different fixes. */
  function aboutCard() {
    var cfg = window.SF_CONFIG || {};
    var built = cfg.builtAt ? new Date(cfg.builtAt) : null;

    return sectionCard('About this build', stack(
      h('dl.about',
        h('dt', 'Version'),
        h('dd.mono', cfg.commit || 'local (unbuilt)'),
        h('dt', 'Deployed'),
        h('dd', built ? built.toLocaleString() : 'not deployed — running from files'),
        h('dt', 'IB courses'),
        h('dd', String(SF.SUBJECT_PRESETS.length)),
        h('dt', 'Accounts'),
        h('dd', accountsOn() ? 'enabled' : 'off — local storage only')
      ),
      h('div.setacts',
        h('button.btn.btn--ghost', {
          type: 'button',
          onclick: function () {
            /* Clearing the worker and its caches is the one fix for a browser
               that is still serving an old build from before this was
               fixable in-app. */
            var jobs = [];
            if ('serviceWorker' in navigator) {
              jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
                return Promise.all(rs.map(function (r) { return r.unregister(); }));
              }).catch(function () {}));
            }
            if (window.caches) {
              jobs.push(caches.keys().then(function (ks) {
                return Promise.all(ks.map(function (k) { return caches.delete(k); }));
              }).catch(function () {}));
            }
            Promise.all(jobs).then(function () { location.reload(); });
          }
        }, 'Force a fresh copy')
      ),
      h('p.card__note',
        'If StudyFlow looks out of date — a subject missing, a feature you were told was ' +
        'added — the version above is what is actually running. "Force a fresh copy" clears ' +
        'the offline cache and reloads. Your data is not touched.')
    ));
  }

  /* ================= Router ================= */

  var TITLES = {
    dashboard: ['Dashboard', function () {
      var n = SF.dueWithin(7).length;
      return 'Good to see you, ' + SF.state.profile.name + ' · ' + n + (n === 1 ? ' deadline' : ' deadlines') + ' in the next 7 days';
    }],
    deadlines: ['Deadlines', function () {
      return SF.openTasks().length + ' open · ' + SF.totalHoursLeft(SF.openTasks()) + 'h of work left';
    }],
    calendar: ['Calendar', function () { return 'Deadlines and study blocks, month by month'; }],
    planner: ['Study planner', function () { return 'Turn outstanding work into a realistic week'; }],
    ee: ['Extended Essay', function () {
      var ee = SF.state.ee;
      return Math.round(ee.words / ee.target * 100) + '% written · ' + (SF.subjectName(ee.subjectId) || '');
    }],
    cas: ['CAS', function () {
      var b = SF.casByStrand();
      return (b.creativity + b.activity + b.service) + ' hours logged across three strands';
    }],
    progress: ['Progress', function () { return 'Where you stand across the whole diploma'; }],
    settings: ['Settings', function () {
      return SF.isDemo() ? 'Using the example account' : 'Your subjects, EE and account';
    }],
    import: ['Import from ManageBac', function () {
      var n = SF.importedCount();
      return n ? n + ' deadlines came from your calendar' : 'Bring your calendar deadlines in';
    }],
    messages: ['Messages', function () {
      var n = SF.atRisk().length;
      return n ? n + (n === 1 ? ' deadline needs' : ' deadlines need') + ' a heads-up'
               : 'Nothing needs a message right now';
    }]
  };

  function currentRoute() {
    var r = (location.hash || '#/dashboard').replace(/^#\//, '');
    return views[r] ? r : 'dashboard';
  }

  function render() {
    if (!SF.hasAccount()) return;

    var route = currentRoute();
    var host = document.getElementById('view');

    clear(host);
    host.appendChild(views[route]());
    refreshChrome(route);
  }

  /**
   * Everything outside the view body: titles, nav state, badges, footer.
   * Split out so an in-place edit (ticking one deadline) can refresh the
   * surrounding counts without rebuilding the whole list.
   */
  function refreshChrome(route) {
    route = route || currentRoute();

    document.getElementById('page-title').textContent = TITLES[route][0];
    document.getElementById('page-sub').textContent = TITLES[route][1]();
    document.title = 'StudyFlow — ' + TITLES[route][0];

    Array.prototype.forEach.call(document.querySelectorAll('.side__nav a'), function (a) {
      var on = a.getAttribute('data-route') === route;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    var badge = document.getElementById('badge-deadlines');
    var n = SF.dueWithin(7).length;
    badge.textContent = n ? String(n) : '';
    badge.hidden = !n;

    var mbadge = document.getElementById('badge-messages');
    var m = SF.atRisk().length;
    mbadge.textContent = m ? String(m) : '';
    mbadge.hidden = !m;
    mbadge.classList.toggle('side__badge--alert', !!m);

    drawSideFoot();
  }

  function drawSideFoot() {
    var foot = document.getElementById('side-foot');
    clear(foot);

    var name = SF.state.profile.name;
    var who = signedInUser();

    foot.appendChild(h('div.whoami',
      SF.isDemo()
        ? [h('span.whoami__tag', 'Example account'),
           h('p.whoami__note', 'Sample data — explore freely.'),
           h('a.link', { href: '#/settings' }, 'Set up my own →')]
        : who
          ? [h('p.whoami__name', name ? 'Signed in as ' + name : 'Signed in'),
             h('p.whoami__email', who.email),
             syncLine()]
          : h('p.whoami__name', name ? 'Signed in as ' + name : 'Your diploma'),

      h('button.logout', { type: 'button', onclick: logOut },
        icon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>'),
        h('span', SF.isDemo() ? 'Leave the example' : 'Log out')
      )
    ));
  }

  /* ---------- Accounts ----------
     All of this collapses to nothing when no backend is configured, which is
     how the app keeps working as a purely local tool. */

  function accountsOn() { return !!(window.SFAuth && SFAuth.enabled()); }
  function signedInUser() { return accountsOn() && SFAuth.isSignedIn() ? SFAuth.user() : null; }

  var SYNC_WORDS = {
    syncing: ['Saving to your account…', 'is-busy'],
    saved:   ['Saved to your account', 'is-ok'],
    idle:    ['Up to date', 'is-ok'],
    offline: ['Offline — saved on this device', 'is-wait'],
    error:   ['Could not reach your account', 'is-bad'],
    off:     ['', '']
  };

  /** One line in the sidebar saying whether the server has this edit yet. */
  function syncLine() {
    if (!window.SFSync || !SFSync.enabled()) return null;
    var s = SFSync.state();
    var word = SYNC_WORDS[s.status] || SYNC_WORDS.idle;
    if (!word[0]) return null;
    return h('p.whoami__sync.' + (word[1] || ''), { title: s.error || '' },
      h('i.whoami__dot'), h('span', word[0]));
  }

  /* The status line is the only thing that moves when a sync finishes, so
     refresh just that rather than re-rendering the sidebar. */
  if (window.SFSync) {
    SFSync.on(function () {
      if (!SF.hasAccount()) return;
      var old = document.querySelector('.whoami__sync');
      var next = syncLine();
      if (old && next) old.parentNode.replaceChild(next, old);
      else if (!old && next) drawSideFoot();
      var pill = document.querySelector('.syncpill');
      if (pill) pill.parentNode.replaceChild(syncPill(), pill);
    });
  }

  /**
   * Logging out.
   *
   * With an account, this is a real sign-out: the session is revoked and the
   * local copy is removed, because the next person at this computer must not
   * find someone else's deadlines — and nothing is lost, since the data is in
   * the account.
   *
   * Without an account there is no session to end, so the data stays on the
   * device and can be resumed. The confirmation says which of the two is
   * happening, because on a shared computer the difference matters.
   */
  function logOut() {
    var demo = SF.isDemo();
    var who = signedInUser();

    var msg = demo
      ? 'Leave the example account and go back to the start?'
      : who
        ? 'Log out of ' + who.email + '?\n\n' +
          (window.SFSync && SFSync.deviceChanged()
            ? 'There are unsaved changes — we will try to upload them first.\n\n'
            : '') +
          'This removes your diploma from this browser. Everything stays in your ' +
          'account, so logging back in anywhere brings it all back.'
        : 'Log out and go back to the start screen?\n\n' +
          'Your deadlines stay saved on this device, so you can pick up where you ' +
          'left off. To remove them completely, use "Start over" in Settings.';

    if (!confirm(msg)) return;

    if (!who) {
      SF.signOut();
      location.hash = '';
      return boot();
    }

    /* Push whatever is outstanding before cutting the session, then clear the
       device. A failed push must still let someone log out of a shared
       computer, so the local wipe happens either way. */
    var done = function () {
      SFAuth.signOut().then(function () {
        SF.clearAccount();
        if (window.SFSync) SFSync.clearMark();
        location.hash = '';
        boot();
      });
    };
    if (window.SFSync && SFSync.deviceChanged() && !demo) SFSync.flush().then(done, done);
    else done();
  }

  /* Tokens and link errors from a confirmation or reset email, as they look in
     the URL. Matched against the hash, which is where the implicit flow puts
     them. */
  var AUTH_HASH = /(^|[#&])(access_token|reset_token|error|error_code|error_description)=/;

  window.addEventListener('hashchange', function () {
    /* An email link points at /app/, so if that page is already open in the
       tab, following the link is a same-document navigation: the hash changes
       and nothing re-runs. Without this, the tokens would sit unread in the
       address bar and the student would be told to log in again by the very
       screen that was supposed to let them in. */
    if (accountsOn() && AUTH_HASH.test(location.hash || '')) {
      closeSide();
      return boot();
    }

    closeSide();
    render();
    // Land at the top of the new view. focus() would otherwise scroll the
    // container under the sticky header.
    window.scrollTo(0, 0);
    document.getElementById('view').focus({ preventScroll: true });
  });

  /* ================= Boot ================= */

  function homeHref() {
    var brandLink = document.querySelector('.side .brand');
    var href = brandLink ? brandLink.getAttribute('href') : null;
    return href && href.indexOf('#') !== 0 ? href : null;
  }

  /** The tour and setup wizard — reached once there is somebody to set up for. */
  function runSetup() {
    SFOnboard.run({
      homeHref: homeHref(),
      presetName: (signedInUser() || {}).name || '',
      onDone: function () {
        location.hash = '#/dashboard';
        render();
      }
    });
  }

  /** The sign-in gate. Only ever shown when a backend is actually configured. */
  function gate(o) {
    o = o || {};
    o.homeHref = homeHref();
    /* Working offline with no account yet is a dead end, so the escape hatch
       stays available — but it is secondary, not the headline. */
    o.allowLocal = o.allowLocal !== false;
    o.onDone = function (res) {
      if (res.syncBroken) toast('Signed in, but syncing is not set up yet');
      if (res.local) { localOnly(true); return afterAccount(); }
      afterAccount();
    };
    SFAuthView.run(o);
  }

  /* Someone who chose "this device only" should not be asked again on every
     load. Recorded separately from the account session, since it is a
     preference rather than a credential. */
  var LOCAL_KEY = 'studyflow-local-only';
  function localOnly(set) {
    try {
      if (set === undefined) return localStorage.getItem(LOCAL_KEY) === '1';
      if (set) localStorage.setItem(LOCAL_KEY, '1');
      else localStorage.removeItem(LOCAL_KEY);
    } catch (e) { /* private mode */ }
    return !!set;
  }

  /** Signed in (or deliberately local): into the app, or into setup. */
  function afterAccount() {
    if (SF.hasAccount()) return render();
    if (SF.isSignedOut()) {
      /* A local account is parked on this device — offer it back. */
      return SFOnboard.run({
        homeHref: homeHref(),
        onDone: function () { location.hash = '#/dashboard'; render(); }
      });
    }
    runSetup();
  }

  function boot() {
    if (!accountsOn()) {
      /* No backend configured: exactly the behaviour the app has always had. */
      if (!SF.hasAccount()) return runSetup();
      return render();
    }

    /* A confirmation or password-reset link lands with its tokens in the URL
       fragment — the same place the router lives. Consume it before anything
       reads the hash. */
    Promise.resolve(SFAuth.consumeUrl()).then(function (link) {
      /* 'recovery' is Supabase signing the student in from the link; 'reset' is
         the built-in server handing over a single-use token instead. Both land
         on the same "choose a new password" screen. */
      if (link && (link.type === 'recovery' || link.type === 'reset')) {
        return gate({ start: 'recovery', allowLocal: false, resetToken: link.resetToken });
      }
      if (link && link.type === 'error') return gate({ start: 'login', error: link.message });
      if (link && link.type === 'confirmed') toast('Email confirmed — you are signed in');

      if (!SFAuth.isSignedIn()) {
        /* Someone who deliberately opted out of accounts carries on locally. */
        if (localOnly()) return afterAccount();

        /* This device has synced before, so it was signed in and no longer is:
           the session expired, or a password change or logout elsewhere ended
           it. Dropping silently into an unsynced local copy would leave them
           editing a diploma that never reaches their account again, so say so
           and offer the way back. The data stays where it is either way. */
        if (window.SFSync && SFSync.hadSession()) {
          return gate({
            start: 'login',
            message: 'You have been signed out — your session ended, or the password ' +
                     'was changed somewhere else. Your work on this device is safe; ' +
                     'log in to put it back in sync.'
          });
        }

        /* Local data from before accounts existed: leave it alone. */
        if (SF.hasAccount()) return afterAccount();
        return gate({ start: SF.hasSavedAccount() ? 'login' : 'choose' });
      }

      /* The local "logged out but data still here" flag belongs to the
         no-account world. Being signed in supersedes it. */
      if (SF.isSignedOut()) SF.resumeAccount();

      /* Signed in: get the account's copy before drawing anything, so the app
         never shows stale data and then swaps it underneath the student. */
      return SFSync.reconcile().then(function (res) {
        if (res.action === 'conflict') {
          return gate({ start: 'conflict', remote: res.remote, summary: res.summary, allowLocal: false });
        }

        /* The stored session looked fine — it had not expired by the clock —
           but the server rejected it, so reconcile dropped it. That means a
           password change or a logout somewhere else. Carrying on would leave
           them editing a diploma that silently never reaches their account
           again, so say what happened and offer the way back. */
        if (!SFAuth.isSignedIn()) {
          return gate({
            start: 'login',
            message: 'You have been signed out — your session ended, or the password ' +
                     'was changed somewhere else. Your work on this device is safe; ' +
                     'log in to put it back in sync.'
          });
        }

        if (res.action === 'error') toast('Signed in — but your account could not be reached');
        afterAccount();
      });
    });
  }

  // Small surface for tests and benchmarks; the app itself never reads it.
  window.SFApp = { render: render, boot: boot };

  boot();
})();
