/* StudyFlow — data model, persistence and derived queries.
   Exposes a single global: window.SF */
(function () {
  'use strict';

  var KEY = 'studyflow-data-v1';
  var OUT_KEY = 'studyflow-signed-out';

  /* ---------- Date helpers (local dates, ISO yyyy-mm-dd keys) ---------- */

  function iso(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function parseISO(s) {
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function today() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(d, n) {
    var c = new Date(d.getTime());
    c.setDate(c.getDate() + n);
    return c;
  }

  /** Whole days from today to an ISO date. Negative = overdue. */
  function daysUntil(isoDate) {
    return Math.round((parseISO(isoDate) - today()) / 86400000);
  }

  function dueLabel(isoDate) {
    var n = daysUntil(isoDate);
    if (n < -1) return Math.abs(n) + ' days late';
    if (n === -1) return '1 day late';
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n < 7) return 'In ' + n + ' days';
    if (n < 14) return 'In 1 week';
    if (n < 60) return 'In ' + Math.round(n / 7) + ' weeks';
    return 'In ' + Math.round(n / 30) + ' months';
  }

  function fmtDate(isoDate) {
    return parseISO(isoDate).toLocaleDateString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  }

  /* ---------- Seed data ---------- */

  var TYPES = {
    assignment: { label: 'Assignment', color: 'blue' },
    ia:         { label: 'Internal Assessment', color: 'violet' },
    ee:         { label: 'Extended Essay', color: 'indigo' },
    cas:        { label: 'CAS', color: 'teal' },
    tok:        { label: 'TOK', color: 'amber' }
  };

  var OUTCOMES = [
    'Strengths and areas for growth',
    'Undertaken new challenges',
    'Planned and initiated activities',
    'Worked collaboratively',
    'Shown perseverance and commitment',
    'Engaged with issues of global significance',
    'Considered the ethics of choices and actions'
  ];

  /**
   * DP courses by subject group, offered as quick-add during setup.
   * Language groups list the most commonly taught options — any language, and
   * any school-based syllabus course, can still be typed in by hand.
   */
  var SUBJECT_GROUPS = [
    { group: 'Group 1 · Studies in Language & Literature', courses: [
      'English A: Literature', 'English A: Language & Literature',
      'Spanish A: Literature', 'Spanish A: Language & Literature',
      'Portuguese A: Literature', 'Portuguese A: Language & Literature',
      'French A: Literature', 'French A: Language & Literature',
      'German A: Literature', 'German A: Language & Literature',
      'Chinese A: Literature', 'Chinese A: Language & Literature'
    ] },
    { group: 'Group 2 · Language Acquisition', courses: [
      'Spanish B', 'French B', 'German B', 'Mandarin B', 'Japanese B',
      'Italian B', 'Arabic B', 'Portuguese B', 'Russian B', 'Hindi B',
      'Spanish ab initio', 'French ab initio', 'German ab initio',
      'Mandarin ab initio', 'Latin', 'Classical Greek'
    ] },
    { group: 'Group 3 · Individuals & Societies', courses: [
      'Business Management', 'Economics', 'Geography', 'Global Politics',
      'History', 'Philosophy', 'Psychology', 'Social & Cultural Anthropology',
      'World Religions', 'Digital Society'
    ] },
    { group: 'Group 4 · Sciences', courses: [
      'Biology', 'Chemistry', 'Physics', 'Computer Science',
      'Design Technology', 'Sports, Exercise & Health Science'
    ] },
    { group: 'Group 5 · Mathematics', courses: [
      'Mathematics: Analysis & Approaches', 'Mathematics: Applications & Interpretation'
    ] },
    { group: 'Group 6 · The Arts', courses: [
      'Visual Arts', 'Music', 'Theatre', 'Film', 'Dance'
    ] },
    { group: 'Counts for two groups', courses: [
      'Environmental Systems & Societies', 'Literature and Performance'
    ] }
  ];

  /** Flat list of every preset course name. */
  var SUBJECT_PRESETS = SUBJECT_GROUPS.reduce(function (all, g) {
    return all.concat(g.courses);
  }, []);
  var DEFAULT_AVAILABILITY = { 0: 3, 1: 2, 2: 2, 3: 2, 4: 2, 5: 1, 6: 4 };

  /** A brand-new personal account. Nothing here is invented for the user
      beyond the structure — tasks, CAS and EE milestones all start empty. */
  function blankAccount(opts) {
    opts = opts || {};
    var subjects = (opts.subjects || []).map(function (s, i) {
      return { id: 's' + (i + 1) + Math.random().toString(36).slice(2, 6), name: s.name, level: s.level };
    });

    return {
      profile: { name: (opts.name || '').trim(), demo: false, onboarded: true },
      subjects: subjects,
      tasks: [],
      cas: [],
      ee: {
        subjectId: opts.eeSubjectId || null,
        rq: (opts.rq || '').trim(),
        words: 0,
        target: opts.eeTarget || 4000,
        milestones: [],
        meetings: []
      },
      availability: opts.availability || Object.assign({}, DEFAULT_AVAILABILITY),
      blocks: [],
      settings: {}
    };
  }

  /* ---------- The example account ----------
     This is the ONLY hard-coded dataset in the app. It exists so the interface
     can be explored without typing anything in first. */
  function exampleAccount() {
    var t = today();
    var d = function (n) { return iso(addDays(t, n)); };

    return {
      profile: { name: 'Sandra', demo: true, onboarded: true },
      subjects: [
        { id: 's1', name: 'Physics', level: 'HL' },
        { id: 's2', name: 'Mathematics: Analysis & Approaches', level: 'HL' },
        { id: 's3', name: 'History', level: 'HL' },
        { id: 's4', name: 'Biology', level: 'SL' },
        { id: 's5', name: 'English A: Language & Literature', level: 'SL' },
        { id: 's6', name: 'Spanish B', level: 'SL' }
      ],
      tasks: [
        { id: 't1', title: 'Physics IA — first draft', subjectId: 's1', type: 'ia', due: d(2), est: 4, progress: 68, done: false },
        { id: 't2', title: 'Math AA problem set 12', subjectId: 's2', type: 'assignment', due: d(1), est: 2, progress: 30, done: false },
        { id: 't3', title: 'CAS reflection #6', subjectId: null, type: 'cas', due: d(3), est: 1, progress: 0, done: false },
        { id: 't4', title: 'TOK exhibition — object notes', subjectId: null, type: 'tok', due: d(5), est: 2, progress: 15, done: false },
        { id: 't5', title: 'EE — supervisor meeting 2', subjectId: 's4', type: 'ee', due: d(6), est: 1, progress: 0, done: false },
        { id: 't6', title: 'History Paper 2 practice essay', subjectId: 's3', type: 'assignment', due: d(8), est: 2, progress: 0, done: false },
        { id: 't7', title: 'Spanish B oral practice', subjectId: 's6', type: 'assignment', due: d(9), est: 2, progress: 0, done: false },
        { id: 't8', title: 'EE — 1,500 word checkpoint', subjectId: 's4', type: 'ee', due: d(12), est: 6, progress: 20, done: false },
        { id: 't9', title: 'Chemistry-style lab write-up', subjectId: 's1', type: 'assignment', due: d(13), est: 3, progress: 0, done: false },
        { id: 't10', title: 'English HL essay — outline', subjectId: 's5', type: 'assignment', due: d(14), est: 3, progress: 0, done: false },
        { id: 't11', title: 'Math AA IA — exploration topic', subjectId: 's2', type: 'ia', due: d(18), est: 5, progress: 0, done: false },
        { id: 't12', title: 'History IA — source evaluation', subjectId: 's3', type: 'ia', due: d(24), est: 6, progress: 0, done: false },
        { id: 't13', title: 'TOK essay — first draft', subjectId: null, type: 'tok', due: d(30), est: 8, progress: 0, done: false },
        { id: 't14', title: 'Physics problem set 9', subjectId: 's1', type: 'assignment', due: d(-2), est: 2, progress: 100, done: true },
        { id: 't15', title: 'Biology lab report', subjectId: 's4', type: 'assignment', due: d(-5), est: 3, progress: 100, done: true }
      ],
      cas: [
        { id: 'c1', strand: 'creativity', title: 'School orchestra — second violin', hours: 22, date: d(-30), reflection: 'Rehearsals every Tuesday; performed the winter concert.', outcomes: [0, 4] },
        { id: 'c2', strand: 'creativity', title: 'Yearbook layout design', hours: 18, date: d(-20), reflection: 'Learned InDesign from scratch to lay out 40 pages.', outcomes: [1, 3] },
        { id: 'c3', strand: 'activity', title: 'Duke of Edinburgh — hiking', hours: 19, date: d(-14), reflection: 'Three practice expeditions, one qualifying.', outcomes: [4, 2] },
        { id: 'c4', strand: 'activity', title: 'Swim squad training', hours: 12, date: d(-7), reflection: 'Twice weekly; cut 4 seconds off my 100m.', outcomes: [4] },
        { id: 'c5', strand: 'service', title: 'Volunteer maths tutoring', hours: 24, date: d(-10), reflection: 'Weekly sessions with two Year 9 students.', outcomes: [3, 6] },
        { id: 'c6', strand: 'service', title: 'Beach clean-up organiser', hours: 13, date: d(-3), reflection: 'Organised 20 volunteers; 60kg of waste collected.', outcomes: [2, 5, 6] }
      ],
      ee: {
        subjectId: 's4',
        rq: 'To what extent does soil pH affect the germination rate of Vicia faba?',
        words: 1180,
        target: 4000,
        milestones: [
          { id: 'm1', title: 'Research question approved', due: d(-40), done: true },
          { id: 'm2', title: 'Reflection session 1', due: d(-25), done: true },
          { id: 'm3', title: 'Data collection complete', due: d(-4), done: true },
          { id: 'm4', title: 'First full draft', due: d(26), done: false },
          { id: 'm5', title: 'Reflection session 2 (interim)', due: d(6), done: false },
          { id: 'm6', title: 'Viva voce', due: d(75), done: false }
        ],
        meetings: [
          { id: 'g1', date: d(-40), notes: 'Narrowed topic from "plant growth" to germination and pH.' },
          { id: 'g2', date: d(-25), notes: 'Agreed on 5 pH levels, 20 seeds each, 3 trials.' }
        ]
      },
      availability: Object.assign({}, DEFAULT_AVAILABILITY),
      blocks: [],
      settings: {}
    };
  }

  /* ---------- Persistence ----------
     No account is created implicitly: load() returns null on a first visit so
     the app can run onboarding instead of guessing at the user's data. */

  var state = null;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.profile && parsed.tasks) return parsed;
      }
    } catch (e) { /* corrupt or unavailable — treat as no account */ }
    return null;
  }

  function save() {
    if (!state) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* quota / private mode */ }
  }

  /* Signing out hides the account and returns to the start screen. There is no
     server here, so the data stays on the device and can be resumed — erasing
     it is a separate, explicit choice. */
  var signedOut = false;
  try { signedOut = localStorage.getItem(OUT_KEY) === '1'; } catch (e) { /* private mode */ }

  function setSignedOut(v) {
    signedOut = v;
    try {
      if (v) localStorage.setItem(OUT_KEY, '1');
      else localStorage.removeItem(OUT_KEY);
    } catch (e) { /* private mode */ }
  }

  function hasAccount() { return !!state && !signedOut; }
  /** An account exists on this device, whether or not it is signed in. */
  function hasSavedAccount() { return !!state; }
  function isSignedOut() { return signedOut && !!state; }
  function isDemo() { return !!(state && state.profile && state.profile.demo); }

  /** Name to greet a returning user with, or '' if they never gave one. */
  function savedName() {
    return (state && state.profile && state.profile.name) || '';
  }

  function signOut() { setSignedOut(true); }
  function resumeAccount() { setSignedOut(false); return state; }

  function useExample() { state = exampleAccount(); setSignedOut(false); save(); return state; }
  function createAccount(opts) { state = blankAccount(opts); setSignedOut(false); save(); return state; }

  function clearAccount() {
    state = null;
    setSignedOut(false);
    try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
  }

  /* ---------- Deadlines needing a heads-up ----------
     Something is "at risk" if it is already late, or lands within two days
     with most of the work still outstanding. */
  function atRisk() {
    return openTasks().filter(function (t) {
      var n = daysUntil(t.due);
      if (t.notifiedAt) return false;
      if (n < 0) return true;
      return n <= 2 && t.progress < 50;
    });
  }

  function riskReason(t) {
    var n = daysUntil(t.due);
    if (n < 0) return 'overdue';
    return 'at-risk';
  }

  /** Teacher contact for whichever subject a task belongs to. */
  function teacherFor(t) {
    var s = subject(t.subjectId);
    return s && s.teacher && s.teacher.email ? s.teacher : null;
  }

  /**
   * Draft a message about a deadline. Returned for review — never sent
   * automatically, since the app cannot judge whether the situation warrants
   * emailing a teacher, and a wrong message cannot be recalled.
   */
  function draftMessage(t) {
    var s = subject(t.subjectId);
    var teacher = teacherFor(t);
    var late = daysUntil(t.due) < 0;
    var days = Math.abs(daysUntil(t.due));
    var name = state.profile.name || '';
    var when = fmtDate(t.due);

    var subjectLine = (late ? 'Late work: ' : 'Upcoming deadline: ') + t.title;

    var greeting = teacher && teacher.name ? 'Dear ' + teacher.name + ',' : 'Dear Sir/Madam,';

    var middle = late
      ? 'I am writing about ' + t.title + ', which was due on ' + when + ' (' +
        days + (days === 1 ? ' day' : ' days') + ' ago). I have not submitted it yet — ' +
        'I am currently at about ' + t.progress + '% and I did not manage it in time.'
      : 'I am writing about ' + t.title + ', due on ' + when + '. I am currently at about ' +
        t.progress + '% and I am not confident I will finish to a good standard by then.';

    var ask = late
      ? 'Could you let me know whether I can still submit it, and if so by when?'
      : 'Could I ask whether a short extension would be possible? If not, I would rather ' +
        'know now so I can prioritise accordingly.';

    var body = [
      greeting,
      '',
      middle,
      '',
      ask,
      '',
      'Apologies for the inconvenience, and thank you for your time.',
      '',
      'Best regards,',
      name || '[your name]'
    ].join('\n');

    return {
      taskId: t.id,
      to: teacher ? teacher.email : '',
      toName: teacher ? teacher.name : (s ? s.name + ' teacher' : ''),
      subjectLine: subjectLine,
      body: body,
      reason: riskReason(t),
      hasRecipient: !!teacher
    };
  }

  function markNotified(id) {
    var t = task(id);
    if (!t) return;
    t.notifiedAt = new Date().toISOString();
    save();
  }

  /* ---------- Calendar import ---------- */

  /** Add imported candidates as tasks, tagging them with their source uid. */
  function importTasks(candidates) {
    var added = 0;
    candidates.forEach(function (c) {
      if (!c.selected || c.already) return;
      state.tasks.push({
        id: uid('t'),
        title: c.title,
        subjectId: c.subjectId || null,
        type: c.type,
        due: c.due,
        est: 2,
        progress: 0,
        done: false,
        sourceUid: c.uid,
        source: 'managebac',
        note: c.note || ''
      });
      added++;
    });
    if (added) save();
    return added;
  }

  function importedCount() {
    return state.tasks.filter(function (t) { return t.sourceUid; }).length;
  }

  /** Remove a subject, detaching anything that pointed at it. */
  function removeSubject(id) {
    state.subjects = state.subjects.filter(function (s) { return s.id !== id; });
    state.tasks.forEach(function (t) { if (t.subjectId === id) t.subjectId = null; });
    if (state.ee.subjectId === id) state.ee.subjectId = null;
    save();
  }

  state = load();

  var uid = function (p) { return p + Math.random().toString(36).slice(2, 9); };

  /* ---------- Queries ---------- */

  function subject(id) {
    for (var i = 0; i < state.subjects.length; i++) {
      if (state.subjects[i].id === id) return state.subjects[i];
    }
    return null;
  }

  function subjectName(id) {
    var s = subject(id);
    return s ? s.name + ' ' + s.level : null;
  }

  /** Open tasks, most urgent first. */
  function openTasks() {
    return state.tasks.filter(function (t) { return !t.done; })
      .sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
  }

  function doneTasks() {
    return state.tasks.filter(function (t) { return t.done; });
  }

  function tasksOn(isoDate) {
    return state.tasks.filter(function (t) { return t.due === isoDate; });
  }

  function dueWithin(days) {
    return openTasks().filter(function (t) {
      var n = daysUntil(t.due);
      return n >= 0 && n <= days;
    });
  }

  function overdue() {
    return openTasks().filter(function (t) { return daysUntil(t.due) < 0; });
  }

  /** Estimated hours of work left on a task, from its progress. */
  function hoursLeft(t) {
    return Math.round(t.est * (1 - t.progress / 100) * 10) / 10;
  }

  function totalHoursLeft(list) {
    return Math.round(list.reduce(function (s, t) { return s + hoursLeft(t); }, 0) * 10) / 10;
  }

  /** Weeks (starting Monday) that carry 3+ deadlines — the collision warning. */
  function busyWeeks() {
    var buckets = {};
    openTasks().forEach(function (t) {
      var n = daysUntil(t.due);
      if (n < 0 || n > 56) return;
      var d = parseISO(t.due);
      var dow = (d.getDay() + 6) % 7;           // Monday = 0
      var monday = iso(addDays(d, -dow));
      (buckets[monday] = buckets[monday] || []).push(t);
    });
    return Object.keys(buckets)
      .filter(function (k) { return buckets[k].length >= 3; })
      .sort()
      .map(function (k) { return { week: k, tasks: buckets[k] }; });
  }

  function casByStrand() {
    var out = { creativity: 0, activity: 0, service: 0 };
    state.cas.forEach(function (e) { out[e.strand] = (out[e.strand] || 0) + e.hours; });
    return out;
  }

  function casOutcomes() {
    var hit = {};
    state.cas.forEach(function (e) {
      (e.outcomes || []).forEach(function (o) { hit[o] = true; });
    });
    return OUTCOMES.map(function (label, i) { return { label: label, met: !!hit[i] }; });
  }

  /* ---------- Study planner ----------
     Greedy scheduler: walk the next 14 days, and for each day spend the
     available hours on the most urgent unfinished work, capping any single
     task at 2h per day so big pieces get spread out rather than crammed. */
  function generatePlan() {
    var remaining = openTasks()
      .filter(function (t) { return hoursLeft(t) > 0; })
      .map(function (t) { return { task: t, left: hoursLeft(t) }; });

    var blocks = [];
    var t0 = today();

    for (var day = 0; day < 14 && remaining.length; day++) {
      var date = addDays(t0, day);
      var capacity = state.availability[date.getDay()] || 0;
      if (!capacity) continue;

      for (var i = 0; i < remaining.length && capacity > 0.25; i++) {
        var item = remaining[i];
        var slack = daysUntil(item.task.due) - day;
        if (slack < 0) continue;                       // deadline already passed on this pass

        var take = Math.min(item.left, capacity, 2);
        take = Math.round(take * 2) / 2;               // half-hour granularity
        if (take < 0.5) continue;

        blocks.push({
          id: uid('b'),
          date: iso(date),
          taskId: item.task.id,
          hours: take,
          done: false
        });

        item.left = Math.round((item.left - take) * 10) / 10;
        capacity -= take;
      }

      remaining = remaining.filter(function (r) { return r.left > 0.25; });
    }

    state.blocks = blocks;
    save();
    return blocks;
  }

  function blocksOn(isoDate) {
    return state.blocks.filter(function (b) { return b.date === isoDate; });
  }

  function task(id) {
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === id) return state.tasks[i];
    }
    return null;
  }

  /* ---------- Exports ---------- */

  window.SF = {
    TYPES: TYPES,
    OUTCOMES: OUTCOMES,
    SUBJECT_PRESETS: SUBJECT_PRESETS,
    SUBJECT_GROUPS: SUBJECT_GROUPS,
    DEFAULT_AVAILABILITY: DEFAULT_AVAILABILITY,

    get state() { return state; },
    save: save,
    uid: uid,

    hasAccount: hasAccount,
    hasSavedAccount: hasSavedAccount,
    isSignedOut: isSignedOut,
    savedName: savedName,
    signOut: signOut,
    resumeAccount: resumeAccount,
    isDemo: isDemo,
    atRisk: atRisk,
    riskReason: riskReason,
    teacherFor: teacherFor,
    draftMessage: draftMessage,
    markNotified: markNotified,
    importTasks: importTasks,
    importedCount: importedCount,
    useExample: useExample,
    createAccount: createAccount,
    clearAccount: clearAccount,
    removeSubject: removeSubject,

    iso: iso,
    parseISO: parseISO,
    today: today,
    addDays: addDays,
    daysUntil: daysUntil,
    dueLabel: dueLabel,
    fmtDate: fmtDate,

    subject: subject,
    subjectName: subjectName,
    task: task,
    openTasks: openTasks,
    doneTasks: doneTasks,
    tasksOn: tasksOn,
    dueWithin: dueWithin,
    overdue: overdue,
    hoursLeft: hoursLeft,
    totalHoursLeft: totalHoursLeft,
    busyWeeks: busyWeeks,
    casByStrand: casByStrand,
    casOutcomes: casOutcomes,
    generatePlan: generatePlan,
    blocksOn: blocksOn
  };
})();
