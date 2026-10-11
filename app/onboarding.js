/* StudyFlow — first-run tour and account setup. Exposes window.SFOnboard. */
(function () {
  'use strict';

  var h = DOM.h, clear = DOM.clear, icon = DOM.icon;

  /* ---------- Tour content ----------
     Each panel pairs a plain-language explanation with a small mock of the
     thing being described, so the tour shows the app rather than just telling. */
  var TOUR = [
    {
      key: 'all',
      eyebrow: 'The idea',
      title: 'Every IB deadline in one list',
      body: 'Assignments, Internal Assessments, the Extended Essay, CAS and TOK all run on ' +
            'different schedules. StudyFlow keeps them in a single queue, ordered by what is ' +
            'actually due next.',
      art: function () {
        return h('div.onb__mock',
          mockRow('violet', 'Physics IA — draft', '2d', true),
          mockRow('amber', 'TOK exhibition', '5d'),
          mockRow('blue', 'History P2 essay', '8d'),
          mockRow('teal', 'CAS reflection', '3d')
        );
      }
    },
    {
      key: 'dash',
      eyebrow: 'Dashboard',
      title: 'It tells you what to do now',
      body: 'The dashboard weighs due dates against how much work is left and puts one task ' +
            'at the top. It also warns you about weeks where three deadlines collide, before ' +
            'you get there.',
      art: function () {
        return h('div.onb__mock',
          h('div.onb__hero',
            h('p.onb__herolabel', 'DUE NEXT'),
            h('p.onb__herotitle', 'Physics IA — first draft'),
            h('div.onb__bar', h('i', { style: 'width:68%' })),
            h('p.onb__herohint', '68% complete · ~4h left')
          ),
          h('div.onb__warn', '3 deadlines in the week of 14 Oct')
        );
      }
    },
    {
      key: 'plan',
      eyebrow: 'Study planner',
      title: 'It builds the week for you',
      body: 'Tell it which hours you are free. It spreads your outstanding work across the ' +
            'next two weeks, capping any one task at 2h a day so big pieces like the EE get ' +
            'broken up instead of crammed.',
      art: function () {
        return h('div.onb__mock',
          h('p.onb__day', 'TUESDAY · 3h free'),
          mockSlot('indigo', 'Physics IA · analysis', '90m'),
          mockSlot('violet', 'Math HL problem set', '45m'),
          mockSlot('teal', 'EE reading notes', '45m')
        );
      }
    },
    {
      key: 'core',
      eyebrow: 'The IB core',
      title: 'EE, CAS and TOK get real tracking',
      body: 'Word count and supervisor meetings for the Extended Essay. Hours, strand balance ' +
            'and the seven learning outcomes for CAS. Milestones for TOK. Not just checkboxes.',
      art: function () {
        return h('div.onb__mock',
          h('div.onb__meters',
            mockMeter('Creativity', 80, 'violet'),
            mockMeter('Activity', 62, 'blue'),
            mockMeter('Service', 74, 'teal')
          ),
          h('div.onb__note', '7/7 learning outcomes evidenced')
        );
      }
    }
  ];

  function mockRow(color, label, due, urgent) {
    return h('div.onb__row',
      h('i.onb__dot.onb__dot--' + color),
      h('span', label),
      h('em' + (urgent ? '.is-urgent' : ''), due)
    );
  }

  function mockSlot(color, label, len) {
    return h('div.onb__slot.onb__slot--' + color, h('span', label), h('em', len));
  }

  function mockMeter(label, pct, color) {
    return h('div.onb__meter',
      h('span', label),
      h('div.onb__track', h('i.onb__fill.onb__fill--' + color, { style: 'width:' + pct + '%' }))
    );
  }

  /* ---------- Runtime ---------- */

  var overlay = null;
  var opts = null;
  var step = 0;
  var flow = [];
  var draft = null;

  function freshDraft() {
    return {
      /* An account already knows the student's name — asking twice is noise. */
      name: (opts && opts.presetName) || '',
      subjects: [],
      eeSubjectIndex: '',
      rq: '',
      eeTarget: 4000,
      availability: Object.assign({}, SF.DEFAULT_AVAILABILITY)
    };
  }

  function run(options) {
    opts = options || {};
    draft = freshDraft();
    step = 0;

    // A replay from Settings shows the tour only; first run continues into setup.
    flow = ['welcome'].concat(TOUR.map(function (t) { return 'tour:' + t.key; }));
    if (!opts.tourOnly) flow.push('choose', 'name', 'subjects', 'ee', 'hours', 'done');

    /* The sign-in gate uses the same overlay slot, and handing over from it
       means replacing it rather than covering it. */
    Array.prototype.forEach.call(document.querySelectorAll('.onb'), function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });

    overlay = h('div.onb', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Getting started' });
    document.body.appendChild(overlay);
    document.body.classList.add('is-onboarding');
    draw();
  }

  function finish(result) {
    document.body.classList.remove('is-onboarding');
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    if (opts.onDone) opts.onDone(result);
  }

  function go(n) {
    step = Math.max(0, Math.min(flow.length - 1, n));
    draw();
    var box = overlay.querySelector('.onb__box');
    if (box) box.scrollTop = 0;
  }

  function draw() {
    clear(overlay);

    var name = flow[step];
    var body;

    if (name === 'welcome') body = viewWelcome();
    else if (name.indexOf('tour:') === 0) body = viewTour(name.slice(5));
    else if (name === 'choose') body = viewChoose();
    else if (name === 'name') body = viewName();
    else if (name === 'subjects') body = viewSubjects();
    else if (name === 'ee') body = viewEE();
    else if (name === 'hours') body = viewHours();
    else body = viewDone();

    overlay.appendChild(h('div.onb__box', body));

    var first = overlay.querySelector('input, button.onb__primary');
    if (first) first.focus();
  }

  /** Shared chrome: step dots plus back/next. */
  function chrome(o) {
    var dots = h('div.onb__dots', flow.map(function (_, i) {
      return h('i.onb__pip' + (i === step ? '.is-on' : '') + (i < step ? '.is-done' : ''));
    }));

    return h('div.onb__foot',
      dots,
      h('div.onb__acts',
        o.back !== false && step > 0
          ? h('button.btn.btn--ghost', { type: 'button', onclick: function () { go(step - 1); } }, 'Back')
          : null,
        o.skip
          ? h('button.link.onb__skip', { type: 'button', onclick: o.skip }, o.skipLabel || 'Skip')
          : null,
        o.next
          ? h('button.btn.btn--primary.onb__primary', { type: 'button', onclick: o.next }, o.nextLabel || 'Next')
          : null
      )
    );
  }

  function brand() {
    return h('div.onb__brand',
      h('span.onb__mark', icon('<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4Z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H16a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H20Z"/>')),
      h('span.onb__name', 'Study', h('span', 'Flow'))
    );
  }

  /* ---------- Steps ---------- */

  function viewWelcome() {
    // Someone who logged out still has their account on this device: offer it
    // back before offering to build a new one.
    var returning = !opts.tourOnly && SF.isSignedOut();
    var name = SF.savedName();

    return [
      h('div.onb__body.onb__body--center',
        brand(),
        h('h1.onb__title', returning
          ? (name ? 'Welcome back, ' + name + '.' : 'Welcome back.')
          : 'Welcome to StudyFlow'),

        h('p.onb__lede', returning
          ? 'Your diploma is still saved on this device — pick up where you left off, ' +
            'or start something new.'
          : 'A quick look at how it works — four screens, about thirty seconds. ' +
            'Then you can set it up with your own subjects, or explore an example account first.'),

        returning
          ? h('div.onb__resume',
              h('button.btn.btn--primary.btn--lg.onb__primary', {
                type: 'button',
                onclick: function () { SF.resumeAccount(); finish({ resumed: true }); }
              }, SF.isDemo() ? 'Back to the example account' : 'Continue where I left off'),
              h('button.link', {
                type: 'button',
                onclick: function () { go(flow.indexOf('choose')); }
              }, 'Start a different account instead')
            )
          : h('button.btn.btn--primary.btn--lg.onb__primary', {
              type: 'button', onclick: function () { go(step + 1); }
            }, 'Show me how it works')
      ),
      chrome({
        back: false,
        skip: function () { go(flow.indexOf('choose') > -1 ? flow.indexOf('choose') : flow.length - 1); },
        skipLabel: opts.tourOnly ? 'Close' : (returning ? 'See the tour again' : 'Skip the tour')
      })
    ];
  }

  function viewTour(key) {
    var panel = TOUR.filter(function (t) { return t.key === key; })[0];
    var isLast = step === flow.length - 1;

    return [
      h('div.onb__body.onb__body--split',
        h('div.onb__text',
          h('p.onb__eyebrow', panel.eyebrow),
          h('h2.onb__title', panel.title),
          h('p.onb__lede', panel.body)
        ),
        h('div.onb__art', panel.art())
      ),
      chrome({
        next: function () {
          if (isLast) return finish({ tourOnly: true });
          go(step + 1);
        },
        nextLabel: isLast ? 'Done' : 'Next',
        skip: opts.tourOnly ? null : function () { go(flow.indexOf('choose')); },
        skipLabel: 'Skip the tour'
      })
    ];
  }

  function viewChoose() {
    return [
      h('div.onb__body.onb__body--center',
        h('h2.onb__title', 'How do you want to start?'),
        h('p.onb__lede', 'You can switch between these at any time from Settings.'),
        h('div.onb__choices',
          h('button.onb__choice', {
            type: 'button',
            onclick: function () { go(flow.indexOf('name')); }
          },
            h('span.onb__choiceicon.is-primary', icon('<path d="M12 5v14M5 12h14"/>')),
            h('b', 'Set up my diploma'),
            h('span', 'Add your own subjects, EE and study hours. Starts empty — you add real deadlines as you go.')
          ),
          h('button.onb__choice', {
            type: 'button',
            onclick: function () { SF.useExample(); finish({ example: true }); }
          },
            h('span.onb__choiceicon', icon('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>')),
            h('b', 'Explore the example account'),
            h('span', "A full DP2 student's data — deadlines, CAS hours, an EE in progress. Nothing you change here affects a real account.")
          )
        ),
        opts.homeHref
          ? h('a.link.onb__home', { href: opts.homeHref }, '← Back to the StudyFlow site')
          : null
      ),
      chrome({})
    ];
  }

  function viewName() {
    return [
      h('div.onb__body',
        h('p.onb__eyebrow', 'Step 1 of 4'),
        h('h2.onb__title', 'What should we call you?'),
        h('p.onb__lede', "Only used to greet you on the dashboard. Leave it blank if you'd rather not."),
        h('label.field.onb__field',
          h('span', 'Your name'),
          h('input#onb-name', {
            type: 'text', value: draft.name, placeholder: 'e.g. Sandra', autocomplete: 'given-name',
            oninput: function (e) { draft.name = e.target.value; },
            onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); go(step + 1); } }
          })
        )
      ),
      chrome({ next: function () { go(step + 1); } })
    ];
  }

  function viewSubjects() {
    var listHost = h('div.onb__subjects');

    function addSubject(nameRaw) {
      var name = String(nameRaw || '').trim();
      if (!name) return;
      var dupe = draft.subjects.some(function (s) { return s.name.toLowerCase() === name.toLowerCase(); });
      if (dupe) return;
      draft.subjects.push({ name: name, level: 'HL' });
      drawList();
      picker.refresh();
    }

    var picker = DOM.presetPicker(SF.SUBJECT_GROUPS, {
      id: 'onb-subject',
      placeholder: 'Search ' + SF.SUBJECT_PRESETS.length + ' IB courses, or type your own…',
      isTaken: function (name) {
        return draft.subjects.some(function (s) { return s.name.toLowerCase() === name.toLowerCase(); });
      },
      onPick: addSubject,
      onEnter: addSubject
    });

    /** The footer is built once per step, so refresh its label in place. */
    function syncNextLabel() {
      var btn = overlay && overlay.querySelector('.onb__primary');
      if (btn) btn.textContent = draft.subjects.length ? 'Next' : 'Skip for now';
    }

    function drawList() {
      clear(listHost);
      syncNextLabel();

      if (!draft.subjects.length) {
        listHost.appendChild(h('p.onb__hint', 'No subjects yet — add your six, plus anything else you want to track.'));
        return;
      }
      draft.subjects.forEach(function (s, i) {
        listHost.appendChild(h('div.onb__subject',
          h('span.onb__subjectname', s.name),
          h('div.seg',
            ['HL', 'SL'].map(function (lv) {
              return h('button.seg__btn' + (s.level === lv ? '.is-on' : ''), {
                type: 'button',
                'aria-pressed': String(s.level === lv),
                onclick: function () { s.level = lv; drawList(); }
              }, lv);
            })
          ),
          h('button.icon-btn.icon-btn--sm', {
            type: 'button', 'aria-label': 'Remove ' + s.name,
            onclick: function () {
              draft.subjects.splice(i, 1);
              drawList();
              picker.refresh();
            }
          }, icon('<path d="M18 6 6 18M6 6l12 12"/>'))
        ));
      });
    }

    drawList();

    return [
      h('div.onb__body',
        h('p.onb__eyebrow', 'Step 2 of 4'),
        h('h2.onb__title', 'Which subjects are you taking?'),
        h('p.onb__lede', 'Add your six, then mark each one HL or SL. Every DP course is listed ' +
                         'by group — or type any language or school-based course of your own.'),
        picker.el,
        listHost
      ),
      chrome({
        next: function () { go(step + 1); },
        nextLabel: draft.subjects.length ? 'Next' : 'Skip for now'
      })
    ];
  }

  function viewEE() {
    var options = [{ value: '', label: '— Decide later —' }].concat(
      draft.subjects.map(function (s, i) { return { value: String(i), label: s.name + ' ' + s.level }; })
    );

    return [
      h('div.onb__body',
        h('p.onb__eyebrow', 'Step 3 of 4'),
        h('h2.onb__title', 'Your Extended Essay'),
        h('p.onb__lede', 'All optional — fill it in whenever your EE takes shape.'),
        h('label.field.onb__field',
          h('span', 'EE subject'),
          h('select', {
            onchange: function (e) { draft.eeSubjectIndex = e.target.value; }
          }, options.map(function (o) {
            return h('option', { value: o.value, selected: o.value === draft.eeSubjectIndex }, o.label);
          }))
        ),
        h('label.field.onb__field',
          h('span', 'Research question'),
          h('textarea', {
            rows: 2, value: draft.rq, placeholder: 'e.g. To what extent does soil pH affect germination rate?',
            oninput: function (e) { draft.rq = e.target.value; }
          })
        ),
        h('label.field.onb__field',
          h('span', 'Word target'),
          h('input', {
            type: 'number', min: 500, max: 10000, step: 100, value: draft.eeTarget,
            oninput: function (e) { draft.eeTarget = Math.max(500, parseInt(e.target.value, 10) || 4000); }
          })
        )
      ),
      chrome({ next: function () { go(step + 1); } })
    ];
  }

  function viewHours() {
    var DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return [
      h('div.onb__body',
        h('p.onb__eyebrow', 'Step 4 of 4'),
        h('h2.onb__title', 'When can you actually study?'),
        h('p.onb__lede', 'Be honest rather than ambitious — the planner only schedules inside these hours, so realistic numbers make a realistic plan.'),
        h('div.avail', [1, 2, 3, 4, 5, 6, 0].map(function (d) {
          return h('label.avail__day',
            h('span', DOW[d].slice(0, 3)),
            h('input', {
              type: 'number', min: 0, max: 12, step: 0.5, value: draft.availability[d],
              'aria-label': 'Free study hours on ' + DOW[d],
              oninput: function (e) { draft.availability[d] = Math.max(0, parseFloat(e.target.value) || 0); }
            }),
            h('em', 'hrs')
          );
        }))
      ),
      chrome({ next: function () { go(step + 1); }, nextLabel: 'Finish setup' })
    ];
  }

  function viewDone() {
    var total = Object.keys(draft.availability).reduce(function (s, k) { return s + draft.availability[k]; }, 0);

    return [
      h('div.onb__body.onb__body--center',
        h('div.onb__tick', '✓'),
        h('h2.onb__title', draft.name ? "You're set, " + draft.name.trim() + '.' : "You're all set."),
        h('p.onb__lede',
          draft.subjects.length
            ? draft.subjects.length + ' subjects · ' + total + 'h of study time a week. ' +
              'Add your first deadline and the dashboard starts working straight away.'
            : "Add your subjects and first deadline whenever you're ready — Settings has everything."),
        h('button.btn.btn--primary.btn--lg.onb__primary', {
          type: 'button',
          onclick: function () {
            var eeIdx = draft.eeSubjectIndex;
            SF.createAccount({
              name: draft.name,
              subjects: draft.subjects,
              rq: draft.rq,
              eeTarget: draft.eeTarget,
              availability: draft.availability
            });
            // Subject ids only exist once the account is built.
            if (eeIdx !== '' && SF.state.subjects[+eeIdx]) {
              SF.state.ee.subjectId = SF.state.subjects[+eeIdx].id;
              SF.save();
            }
            finish({ created: true });
          }
        }, 'Open my dashboard')
      ),
      chrome({})
    ];
  }

  window.SFOnboard = { run: run };
})();
