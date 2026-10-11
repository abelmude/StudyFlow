/* StudyFlow — shared DOM helpers. Exposes window.DOM. */
(function () {
  'use strict';

  /* SVG tags must be created in the SVG namespace — createElement would
     produce an HTMLUnknownElement that takes up space but draws nothing. */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SVG_TAGS = {
    svg: 1, path: 1, circle: 1, rect: 1, line: 1, g: 1,
    polyline: 1, polygon: 1, ellipse: 1, text: 1, tspan: 1
  };

  /** h('div.card', {onclick: fn}, 'text', childNode, [more, nodes]) */
  function h(spec, props) {
    var parts = String(spec).split(/(?=[.#])/);
    var tag = parts[0] || 'div';
    var isSvg = !!SVG_TAGS[tag];
    var el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);

    parts.slice(1).forEach(function (p) {
      if (p[0] === '.') el.classList.add(p.slice(1));
      else if (p[0] === '#') el.id = p.slice(1);
    });

    var start = 1;
    if (props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props)) {
      start = 2;
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'style') el.setAttribute('style', v);
        // SVG properties are mostly read-only, so always go through attributes.
        else if (!isSvg && k in el && k !== 'list' && k !== 'form') el[k] = v;
        else el.setAttribute(k, v);
      });
    }

    for (var i = start; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) return child.forEach(function (c) { append(el, c); });
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  /** Inline icon: stroked 24×24 SVG from raw path markup. */
  function icon(paths) {
    return h('svg', {
      viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'aria-hidden': 'true', html: paths
    });
  }

  /**
   * A searchable, grouped list of preset options.
   * One input does double duty: it filters the presets as you type, and
   * pressing Enter adds whatever you typed — so a course that is not on the
   * list (any of the 80+ languages, a school-based syllabus) still works.
   *
   * opts: { id, placeholder, isTaken(name), onPick(name), onEnter(text) }
   */
  function presetPicker(groups, opts) {
    opts = opts || {};
    var listHost = h('div.picker__list');

    var input = h('input.picker__search', {
      id: opts.id, type: 'text', autocomplete: 'off',
      placeholder: opts.placeholder || 'Search or type your own…',
      oninput: function () { draw(); },
      onkeydown: function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var v = input.value.trim();
        if (!v) return;
        // Enter takes the single visible match if there is one, else the text.
        var visible = listHost.querySelectorAll('.presetchip');
        if (visible.length === 1) visible[0].click();
        else if (opts.onEnter) { opts.onEnter(v); input.value = ''; draw(); }
      }
    });

    function draw() {
      clear(listHost);
      var q = input.value.trim().toLowerCase();
      var shown = 0;

      groups.forEach(function (g) {
        var matches = g.courses.filter(function (name) {
          if (opts.isTaken && opts.isTaken(name)) return false;
          return !q || name.toLowerCase().indexOf(q) !== -1;
        });
        if (!matches.length) return;
        shown += matches.length;

        listHost.appendChild(h('p.picker__group', g.group));
        listHost.appendChild(h('div.picker__chips', matches.map(function (name) {
          return h('button.presetchip', {
            type: 'button',
            onclick: function () {
              if (opts.onPick) opts.onPick(name);
              input.value = '';
              draw();
            }
          }, '+ ' + name);
        })));
      });

      if (!shown) {
        listHost.appendChild(h('p.picker__none', q
          ? 'No course matches "' + input.value.trim() + '". Press Enter to add it anyway.'
          : 'Every listed course has been added.'));
      }
    }

    draw();
    return { el: h('div.picker', input, listHost), input: input, refresh: draw };
  }

  window.DOM = { h: h, append: append, clear: clear, icon: icon, presetPicker: presetPicker };
})();
