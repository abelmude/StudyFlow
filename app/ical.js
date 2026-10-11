/* StudyFlow — iCalendar (RFC 5545) parsing and mapping onto deadlines.
   Exposes window.ICAL.

   ManageBac gives students a "Subscribe to Calendar" feed in iCalendar
   format; this turns that feed into StudyFlow deadlines. */
(function () {
  'use strict';

  /* ---------- Line handling ---------- */

  /** Undo RFC 5545 line folding: a continuation starts with a space or tab. */
  function unfold(text) {
    return String(text)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n[ \t]/g, '');
  }

  /** Split "NAME;PARAM=x;PARAM2=y:value" into {name, params, value}. */
  function parseLine(line) {
    var colon = -1;
    var inQuotes = false;

    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') inQuotes = !inQuotes;
      else if (c === ':' && !inQuotes) { colon = i; break; }
    }
    if (colon === -1) return null;

    var head = line.slice(0, colon);
    var value = line.slice(colon + 1);
    var bits = head.split(';');
    var name = bits[0].toUpperCase();

    var params = {};
    bits.slice(1).forEach(function (p) {
      var eq = p.indexOf('=');
      if (eq === -1) return;
      params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
    });

    return { name: name, params: params, value: value };
  }

  /** Reverse the text escaping applied to TEXT-valued properties. */
  function unescapeText(v) {
    return String(v)
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  /* ---------- Dates ---------- */

  /**
   * Parse DTSTART/DTEND into a local calendar date (yyyy-mm-dd).
   * Handles DATE (20260815), floating DATE-TIME (20260815T090000) and
   * UTC DATE-TIME (20260815T090000Z). A UTC timestamp is converted to the
   * viewer's local day, because "due Friday" should mean their Friday.
   */
  function parseDate(value, params) {
    var v = String(value).trim();
    var m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
    if (!m) return null;

    var y = +m[1], mo = +m[2], d = +m[3];
    var isDateOnly = (params && params.VALUE === 'DATE') || !m[4];

    if (isDateOnly) return { iso: fmt(y, mo, d), allDay: true };

    var hh = +m[4], mi = +m[5], ss = +m[6];
    var local = m[7]
      ? new Date(Date.UTC(y, mo - 1, d, hh, mi, ss))   // UTC → local
      : new Date(y, mo - 1, d, hh, mi, ss);            // floating: already local

    return {
      iso: fmt(local.getFullYear(), local.getMonth() + 1, local.getDate()),
      allDay: false,
      time: pad(local.getHours()) + ':' + pad(local.getMinutes())
    };
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function fmt(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }

  /* ---------- Parsing ---------- */

  /** Extract VEVENTs from an iCalendar document. */
  function parse(text) {
    var lines = unfold(text).split('\n');
    var events = [];
    var current = null;
    var calName = '';

    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;

      if (line.toUpperCase() === 'BEGIN:VEVENT') { current = { raw: {} }; return; }
      if (line.toUpperCase() === 'END:VEVENT') {
        if (current) events.push(current);
        current = null;
        return;
      }

      var p = parseLine(line);
      if (!p) return;

      if (!current) {
        if (p.name === 'X-WR-CALNAME') calName = unescapeText(p.value);
        return;
      }

      switch (p.name) {
        case 'UID':         current.uid = p.value; break;
        case 'SUMMARY':     current.summary = unescapeText(p.value); break;
        case 'DESCRIPTION': current.description = unescapeText(p.value); break;
        case 'LOCATION':    current.location = unescapeText(p.value); break;
        case 'CATEGORIES':  current.categories = unescapeText(p.value); break;
        case 'URL':         current.url = p.value; break;
        case 'RRULE':       current.recurring = true; break;
        case 'DTSTART':     current.start = parseDate(p.value, p.params); break;
        case 'DTEND':       current.end = parseDate(p.value, p.params); break;
        default: break;
      }
    });

    return {
      calendarName: calName,
      events: events.filter(function (e) { return e.summary && e.start; })
    };
  }

  /* ---------- Classification ---------- */

  // Ordered: the first match wins, so put the specific patterns first.
  var RULES = [
    { type: 'ee',  re: /\b(extended\s*essay|\bEE\b|supervisor\s*meeting|viva\s*voce|reflection\s*session)/i },
    { type: 'tok', re: /\b(theory\s*of\s*knowledge|\bTOK\b|exhibition)/i },
    { type: 'cas', re: /\b(CAS\b|creativity|activity.*service|service\s*learning|cas\s*project)/i },
    { type: 'ia',  re: /\b(internal\s*assessment|\bIA\b|exploration|investigation|portfolio|oral\s*commentary|\bIO\b)/i },
    { type: 'assignment', re: /.*/ }
  ];

  function classify(ev) {
    var hay = [ev.summary, ev.categories, ev.description].filter(Boolean).join(' ');
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i].re.test(hay)) return RULES[i].type;
    }
    return 'assignment';
  }

  /**
   * A timetabled class period is not a deadline. Recurring events, and events
   * with a start and end on the same day at set times, are almost always
   * lessons — flag them so they can be excluded by default.
   */
  function looksLikeClassPeriod(ev) {
    if (ev.recurring) return true;
    if (ev.start && !ev.start.allDay && ev.end && ev.end.iso === ev.start.iso) {
      // A timed same-day block with no "due" language reads as a lesson.
      return !/\b(due|deadline|submit|submission|hand\s*in)\b/i.test(ev.summary || '');
    }
    return false;
  }

  /** Match an event to one of the user's subjects by name. */
  function matchSubject(ev, subjects) {
    var hay = [ev.summary, ev.categories, ev.location, ev.description]
      .filter(Boolean).join(' ').toLowerCase();

    var best = null;
    subjects.forEach(function (s) {
      var name = s.name.toLowerCase();
      if (hay.indexOf(name) !== -1) {
        if (!best || name.length > best.name.toLowerCase().length) best = s;
        return;
      }
      // Also try the leading word ("Mathematics AA" → "mathematics").
      var head = name.split(/[:\s]/)[0];
      if (head.length >= 4 && hay.indexOf(head) !== -1 && !best) best = s;
    });
    return best;
  }

  /**
   * Turn parsed events into importable candidates.
   * `existing` is the current task list, used to mark already-imported items.
   */
  function toCandidates(events, subjects, existing) {
    var seenUids = {};
    (existing || []).forEach(function (t) {
      if (t.sourceUid) seenUids[t.sourceUid] = true;
    });

    return events.map(function (ev) {
      var subject = matchSubject(ev, subjects || []);
      var isClass = looksLikeClassPeriod(ev);
      var uid = ev.uid || (ev.summary + '@' + ev.start.iso);

      return {
        uid: uid,
        title: ev.summary,
        due: ev.start.iso,
        allDay: ev.start.allDay,
        time: ev.start.time || null,
        type: classify(ev),
        subjectId: subject ? subject.id : null,
        subjectName: subject ? subject.name + ' ' + subject.level : null,
        note: ev.description || '',
        isClass: isClass,
        already: !!seenUids[uid],
        // Class periods and past events start unticked; real upcoming work is on.
        selected: !isClass && !seenUids[uid]
      };
    }).sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
  }

  window.ICAL = {
    parse: parse,
    toCandidates: toCandidates,
    classify: classify,
    looksLikeClassPeriod: looksLikeClassPeriod,
    _parseDate: parseDate,
    _unfold: unfold,
    _parseLine: parseLine
  };
})();
