/* ============================================================================
   Wisemonk UI — universal behaviors
   Framework-free JS companion to wisemonk-ui.css. Exposes a global `WMUI`
   object and auto-wires declarative data-attributes on DOMContentLoaded.

   Declarative wiring (no JS required):
     <button data-wm-open="#myModal">Open</button>      open a modal/drawer
     <button data-wm-close>Close</button>                close nearest overlay
     <div class="wm-toggle" data-wm-toggle>...buttons</div>   segmented control
     <button class="wm-option-card" ...>                 selectable option card
       (wrap in [data-wm-option-group] for single-select radio behavior)
     <button data-wm-copy="text to copy">Copy</button>   copy to clipboard
     <button data-wm-cmdk>...</button>                    open command palette

   Programmatic API:
     WMUI.open(el|selector)         open modal or drawer
     WMUI.close(el|selector)        close modal or drawer
     WMUI.toast(msg, {type,icon,duration})
     WMUI.cmdk.open() / .close()
     WMUI.cmdk.register(items)      [{label, sub, icon, href, action, section}]
   ========================================================================== */
(function (global) {
  'use strict';

  var DRAWER_MS = 320; // keep in sync with .wm-drawer transition

  /* ---- helpers ----------------------------------------------------------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function resolve(elOrSel) { return typeof elOrSel === 'string' ? $(elOrSel) : elOrSel; }
  function isDrawer(overlay) { return overlay.classList.contains('wm-drawer-overlay'); }
  function lockScroll(lock) { document.body.style.overflow = lock ? 'hidden' : ''; }

  /* ---- modal + drawer ---------------------------------------------------- */
  function open(elOrSel) {
    var ov = resolve(elOrSel);
    if (!ov) return;
    ov.classList.add('is-open');
    lockScroll(true);
    if (isDrawer(ov)) {
      // Force a synchronous reflow so the transform transition fires.
      // (requestAnimationFrame is throttled/paused in backgrounded tabs.)
      void ov.offsetWidth;
      ov.classList.add('is-shown');
    }
    var focusTarget = ov.querySelector('[autofocus], input, select, textarea, button');
    if (focusTarget) { try { focusTarget.focus({ preventScroll: true }); } catch (e) {} }
    ov.dispatchEvent(new CustomEvent('wm:open', { bubbles: true }));
  }

  function close(elOrSel) {
    var ov = resolve(elOrSel);
    if (!ov) return;
    if (isDrawer(ov)) {
      ov.classList.remove('is-shown');
      setTimeout(function () { ov.classList.remove('is-open'); finishClose(ov); }, DRAWER_MS);
    } else {
      ov.classList.remove('is-open');
      finishClose(ov);
    }
  }

  function finishClose(ov) {
    if (!anyOverlayOpen()) lockScroll(false);
    ov.dispatchEvent(new CustomEvent('wm:close', { bubbles: true }));
  }

  function anyOverlayOpen() {
    return !!document.querySelector('.wm-modal-overlay.is-open, .wm-drawer-overlay.is-open, .wm-cmdk-overlay.is-open');
  }

  function closeTopmost() {
    // command palette first, then any open modal/drawer
    if (cmdk.isOpen()) { cmdk.close(); return; }
    var open = $all('.wm-modal-overlay.is-open, .wm-drawer-overlay.is-open');
    if (open.length) close(open[open.length - 1]);
  }

  /* ---- toast ------------------------------------------------------------- */
  function ensureToastWrap() {
    var w = $('.wm-toast-wrap');
    if (!w) { w = document.createElement('div'); w.className = 'wm-toast-wrap'; document.body.appendChild(w); }
    return w;
  }
  function toast(msg, opts) {
    opts = opts || {};
    var wrap = ensureToastWrap();
    var t = document.createElement('div');
    t.className = 'wm-toast' + (opts.type ? ' wm-toast--' + opts.type : '');
    var iconName = opts.icon || (opts.type === 'success' ? 'ic-tick-circle'
      : opts.type === 'danger' ? 'ic-close-circle' : 'ic-info-circle');
    if (iconName) {
      t.innerHTML = '<svg class="wm-ic"><use href="#' + iconName + '"/></svg>';
    }
    t.appendChild(document.createTextNode(msg));
    wrap.appendChild(t);
    var dur = opts.duration || 2600;
    setTimeout(function () {
      t.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      t.style.opacity = '0';
      t.style.transform = 'translateY(8px)';
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 220);
    }, dur);
    return t;
  }

  /* ---- toggle (segmented control) --------------------------------------- */
  function initToggle(group) {
    group.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn || !group.contains(btn)) return;
      $all('button', group).forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      group.dispatchEvent(new CustomEvent('wm:toggle', {
        bubbles: true,
        detail: { value: btn.dataset.value || btn.textContent.trim(), button: btn }
      }));
    });
  }

  /* ---- option cards (selectable, optional single-select group) ---------- */
  function initOptionGroup(group) {
    group.addEventListener('click', function (e) {
      var card = e.target.closest('.wm-option-card');
      if (!card || !group.contains(card)) return;
      $all('.wm-option-card', group).forEach(function (c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      group.dispatchEvent(new CustomEvent('wm:select', {
        bubbles: true,
        detail: { value: card.dataset.value || '', card: card }
      }));
    });
  }
  function initLoneOptionCard(card) {
    card.addEventListener('click', function () { card.classList.toggle('selected'); });
  }

  /* ---- table search + filter dropdowns ----------------------------------- */
  // per-table state: { query: '', filters: { key: value } }
  var tableState = new WeakMap();

  function tableFor(selOrEl) {
    var el = resolve(selOrEl);
    if (!el) return null;
    return el.tagName === 'TABLE' ? el : el.querySelector('table');
  }
  function stateFor(table) {
    if (!tableState.has(table)) tableState.set(table, { query: '', filters: {} });
    return tableState.get(table);
  }
  function applyTableFilters(table) {
    if (!table) return;
    var st = stateFor(table);
    var q = st.query.toLowerCase();
    var rows = $all('tbody tr', table);
    var visible = 0;
    rows.forEach(function (tr) {
      var okText = !q || tr.textContent.toLowerCase().indexOf(q) !== -1;
      var okFilters = Object.keys(st.filters).every(function (key) {
        var v = st.filters[key];
        if (!v || v === 'all') return true;
        return (tr.dataset[key] || '') === v;
      });
      var show = okText && okFilters;
      tr.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    // optional empty-state element inside the same table-card
    var card = table.closest('.wm-table-card') || table.parentNode;
    var empty = card && card.querySelector('.wm-table-empty');
    if (empty) empty.classList.toggle('show', visible === 0);
  }

  function initTableSearch(input) {
    var table = tableFor(input.getAttribute('data-wm-table-search'));
    if (!table) return;
    input.addEventListener('input', function () {
      stateFor(table).query = input.value || '';
      applyTableFilters(table);
    });
  }

  function initDropdown(dd) {
    var trigger = dd.querySelector('.wm-dd-trigger');
    var label = trigger && trigger.querySelector('.wm-dd-label');
    var table = tableFor(dd.getAttribute('data-wm-filter'));
    var key = dd.getAttribute('data-wm-filter-key') || 'status';
    if (trigger) {
      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = dd.classList.toggle('is-open');
        // close sibling dropdowns
        $all('.wm-dropdown.is-open').forEach(function (o) { if (o !== dd) o.classList.remove('is-open'); });
        dd.classList.toggle('is-open', open);
      });
    }
    $all('.wm-dd-item', dd).forEach(function (item) {
      item.addEventListener('click', function () {
        $all('.wm-dd-item', dd).forEach(function (i) { i.classList.toggle('selected', i === item); });
        if (label) label.textContent = item.dataset.label || item.textContent.trim();
        dd.classList.remove('is-open');
        if (table) { stateFor(table).filters[key] = item.dataset.value || 'all'; applyTableFilters(table); }
        dd.dispatchEvent(new CustomEvent('wm:filter', { bubbles: true, detail: { key: key, value: item.dataset.value || '' } }));
      });
    });
  }

  /* ---- popovers: close any open select menu / calendar ------------------- */
  // Faithful port of the portal's closeAllPopovers().
  function closeAllPopovers() {
    $all('.wm-select-menu.open, .wm-calendar.open').forEach(function (m) { m.classList.remove('open'); });
    $all('.wm-field-float.open').forEach(function (f) { f.classList.remove('open'); });
  }

  /* ---- custom select (port of the portal's enhanceSelect) ---------------- */
  // Keeps the NATIVE <select> as the visible trigger; overlays a .wm-select-menu
  // built from its <option>s. mousedown + preventDefault suppresses the browser's
  // native dropdown. A <select multiple> reuses the SAME menu/markup, ticking
  // several items (menu stays open) — no new visual component, just multi-select.
  function enhanceSelect(selectEl) {
    var wrap = selectEl.closest('.wm-field-float');
    if (!wrap || wrap.dataset.wmSelectEnhanced) return;
    wrap.dataset.wmSelectEnhanced = '1';

    if (selectEl.multiple) { enhanceMultiSelect(selectEl, wrap); return; }

    var menu = document.createElement('div');
    menu.className = 'wm-select-menu';

    function buildItems() {
      menu.innerHTML = '';
      Array.prototype.slice.call(selectEl.options).forEach(function (opt) {
        if (opt.disabled || opt.hidden) return;
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'wm-select-item';
        var label = document.createElement('span');
        label.className = 'wm-select-item-label';
        label.textContent = opt.textContent;
        item.appendChild(label);
        if ((opt.value || opt.textContent) === selectEl.value) item.classList.add('selected');
        item.addEventListener('click', function (e) {
          e.stopPropagation();
          selectEl.value = opt.value || opt.textContent;
          selectEl.classList.add('touched');
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          $all('.wm-select-item', menu).forEach(function (c) { c.classList.remove('selected'); });
          item.classList.add('selected');
          wrap.dispatchEvent(new CustomEvent('wm:select', { bubbles: true, detail: selectValue(selectEl) }));
          closeMenu();
        });
        menu.appendChild(item);
      });
    }
    buildItems();
    selectEl._wmRebuildMenu = buildItems;
    wrap.appendChild(menu);

    function openMenu() { closeAllPopovers(); menu.classList.add('open'); wrap.classList.add('open'); }
    function closeMenu() { menu.classList.remove('open'); wrap.classList.remove('open'); }

    selectEl.addEventListener('mousedown', function (e) {
      e.preventDefault();
      if (selectEl.disabled) return;
      if (menu.classList.contains('open')) closeMenu(); else openMenu();
    });
    selectEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); openMenu(); }
      else if (e.key === 'Escape') closeMenu();
    });

    // initial floating-label state
    selectEl.classList.toggle('touched', !!selectEl.value);
  }

  // Multi-select: the native <select multiple> stays in the DOM (and submits with
  // the form) but is visually hidden; a single-line trigger reusing the .wm-select
  // class shows a comma summary, and the SAME .wm-select-menu / .wm-select-item
  // markup ticks multiple options while the menu stays open.
  function enhanceMultiSelect(selectEl, wrap) {
    selectEl.style.display = 'none';

    var trigger = document.createElement('div');
    trigger.className = 'wm-select';
    trigger.tabIndex = 0;
    trigger.setAttribute('role', 'listbox');
    trigger.setAttribute('aria-multiselectable', 'true');
    selectEl.parentNode.insertBefore(trigger, selectEl.nextSibling);

    var menu = document.createElement('div');
    menu.className = 'wm-select-menu';
    wrap.appendChild(menu);

    function picked() {
      return Array.prototype.slice.call(selectEl.options).filter(function (o) { return o.selected && o.value !== ''; });
    }
    function syncTrigger() {
      var sel = picked();
      //   keeps a line box (so the empty trigger matches a native select's height)
      trigger.textContent = sel.length ? sel.map(function (o) { return o.textContent.trim(); }).join(', ') : ' ';
      trigger.classList.toggle('touched', sel.length > 0);
    }

    function buildItems() {
      menu.innerHTML = '';
      Array.prototype.slice.call(selectEl.options).forEach(function (opt) {
        if (opt.disabled || opt.hidden || opt.value === '') return;
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'wm-select-item';
        var label = document.createElement('span');
        label.className = 'wm-select-item-label';
        label.textContent = opt.textContent;
        item.appendChild(label);
        if (opt.selected) item.classList.add('selected');
        item.addEventListener('click', function (e) {
          e.stopPropagation();
          opt.selected = !opt.selected;
          item.classList.toggle('selected', opt.selected);
          syncTrigger();
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          wrap.dispatchEvent(new CustomEvent('wm:select', { bubbles: true, detail: selectValue(selectEl) }));
          // menu deliberately stays open for multi-select
        });
        menu.appendChild(item);
      });
    }
    buildItems();
    selectEl._wmRebuildMenu = buildItems;
    syncTrigger();

    function openMenu() { closeAllPopovers(); menu.classList.add('open'); wrap.classList.add('open'); }
    function closeMenu() { menu.classList.remove('open'); wrap.classList.remove('open'); }

    trigger.addEventListener('mousedown', function (e) {
      e.preventDefault();
      if (menu.classList.contains('open')) closeMenu(); else openMenu();
    });
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); openMenu(); }
      else if (e.key === 'Escape') closeMenu();
    });
  }

  function selectValue(sel) {
    var picked = Array.prototype.slice.call(sel.options).filter(function (o) { return o.selected && o.value !== ''; });
    return sel.multiple
      ? { value: picked.map(function (o) { return o.value; }), labels: picked.map(function (o) { return o.textContent.trim(); }) }
      : { value: (picked[0] || {}).value || '', label: (picked[0] || { textContent: '' }).textContent.trim() };
  }

  /* ---- custom calendar (port of the portal's enhanceDate) ---------------- */
  // Enhances a native <input type="date">: it is set readonly and a .wm-calendar
  // popover replaces the native picker. The input keeps its ISO (YYYY-MM-DD) value
  // so it submits normally; .has-value drives the floating label.
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function isSameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function enhanceDate(inputEl) {
    var wrap = inputEl.closest('.wm-field-float');
    if (!wrap || wrap.dataset.wmDateEnhanced) return;
    wrap.dataset.wmDateEnhanced = '1';

    var cal = document.createElement('div');
    cal.className = 'wm-calendar';
    cal.innerHTML =
      '<div class="wm-cal-header">' +
        '<span class="wm-cal-title"></span>' +
        '<div class="wm-cal-nav">' +
          '<button type="button" class="wm-cal-prev" aria-label="Previous month"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>' +
          '<button type="button" class="wm-cal-next" aria-label="Next month"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>' +
        '</div>' +
      '</div>' +
      '<div class="wm-cal-weekdays"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div>' +
      '<div class="wm-cal-days"></div>' +
      '<div class="wm-cal-footer">' +
        '<button type="button" class="wm-cal-clear">Clear</button>' +
        '<button type="button" class="wm-cal-today">Today</button>' +
      '</div>';
    wrap.appendChild(cal);

    var today = new Date();
    var view = new Date();

    function render() {
      var selected = inputEl.value ? new Date(inputEl.value + 'T00:00') : null;
      cal.querySelector('.wm-cal-title').textContent = MONTHS[view.getMonth()] + ' ' + view.getFullYear();
      var grid = cal.querySelector('.wm-cal-days');
      grid.innerHTML = '';
      var firstDay = new Date(view.getFullYear(), view.getMonth(), 1);
      var lastDay = new Date(view.getFullYear(), view.getMonth() + 1, 0);
      var startDow = firstDay.getDay();
      var prevLast = new Date(view.getFullYear(), view.getMonth(), 0).getDate();
      function addCell(label, date, muted) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'wm-cal-day' + (muted ? ' muted' : '') +
          (isSameDay(date, today) ? ' today' : '') + (isSameDay(date, selected) ? ' selected' : '');
        b.textContent = label;
        b.addEventListener('click', function (e) { e.stopPropagation(); select(date); });
        grid.appendChild(b);
      }
      for (var i = startDow - 1; i >= 0; i--) {
        addCell(prevLast - i, new Date(view.getFullYear(), view.getMonth() - 1, prevLast - i), true);
      }
      for (var d = 1; d <= lastDay.getDate(); d++) {
        addCell(d, new Date(view.getFullYear(), view.getMonth(), d), false);
      }
      var cells = grid.children.length;
      var remaining = (cells <= 35) ? 35 - cells : 42 - cells;
      for (var n = 1; n <= remaining; n++) {
        addCell(n, new Date(view.getFullYear(), view.getMonth() + 1, n), true);
      }
    }
    function select(d) {
      inputEl.value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      inputEl.classList.add('has-value');
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new CustomEvent('wm:datechange', { bubbles: true, detail: { value: inputEl.value, date: d } }));
      closeCal();
    }
    function openCal() {
      closeAllPopovers();
      view = inputEl.value ? new Date(inputEl.value + 'T00:00') : new Date();
      render();
      cal.classList.add('open');
      wrap.classList.add('open');
    }
    function closeCal() { cal.classList.remove('open'); wrap.classList.remove('open'); }

    inputEl.setAttribute('readonly', 'readonly');
    inputEl.style.cursor = 'pointer';
    inputEl.classList.toggle('has-value', !!inputEl.value);
    inputEl.addEventListener('mousedown', function (e) {
      e.preventDefault();
      inputEl.focus();
      if (cal.classList.contains('open')) closeCal(); else openCal();
    });
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); openCal(); }
      else if (e.key === 'Escape') closeCal();
    });

    cal.querySelector('.wm-cal-prev').addEventListener('click', function (e) { e.stopPropagation(); view.setMonth(view.getMonth() - 1); render(); });
    cal.querySelector('.wm-cal-next').addEventListener('click', function (e) { e.stopPropagation(); view.setMonth(view.getMonth() + 1); render(); });
    cal.querySelector('.wm-cal-clear').addEventListener('click', function (e) {
      e.stopPropagation();
      inputEl.value = '';
      inputEl.classList.remove('has-value');
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      closeCal();
    });
    cal.querySelector('.wm-cal-today').addEventListener('click', function (e) { e.stopPropagation(); select(new Date()); });
  }

  /* ---- form validation (onboarding behavior) ----------------------------- */
  // Mark a field invalid/valid: <div class="wm-field" data-wm-field><input required>…
  //   <small class="wm-field-error">message</small></div>
  function fieldOf(control) { return control.closest('.wm-field, .wm-field-float'); }

  function setFieldError(field, msg) {
    if (!field) return;
    field.classList.add('wm-field--error');
    var err = field.querySelector('.wm-field-error');
    if (err && msg) err.textContent = msg;
  }
  function clearFieldError(field) { if (field) field.classList.remove('wm-field--error'); }

  function validateField(control) {
    var field = fieldOf(control);
    if (!field) return true;
    var required = control.required || control.hasAttribute('required');
    var val;
    if (control.tagName === 'SELECT' && control.multiple) {
      val = Array.prototype.slice.call(control.selectedOptions).filter(function (o) { return o.value; }).length ? 'x' : '';
    } else {
      val = (control.value || '').trim();   // native <select> + native <input type="date"> both expose .value
    }
    if (required && !val) { setFieldError(field, field.dataset.wmRequiredMsg || 'This field is required'); return false; }
    if (val && control.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) {
      setFieldError(field, 'Enter a valid email address'); return false;
    }
    clearFieldError(field);
    return true;
  }

  function validateForm(form) {
    form = resolve(form);
    if (!form) return true;
    var controls = $all('input, select, textarea', form).filter(function (c) {
      return c.type !== 'hidden' && (c.required || c.hasAttribute('required'));
    });
    var ok = true, firstBad = null;
    controls.forEach(function (c) {
      if (!validateField(c) && !firstBad) firstBad = c;
      if (!validateField(c)) ok = false;
    });
    if (firstBad) {
      var field = fieldOf(firstBad) || firstBad;
      if (field.scrollIntoView) field.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // multi-select hides the native control; focus its visible trigger instead
      var focusable = (firstBad.tagName === 'SELECT' && firstBad.multiple && field.querySelector)
        ? (field.querySelector('.wm-select') || firstBad) : firstBad;
      try { focusable.focus({ preventScroll: true }); } catch (e) {}
    }
    return ok;
  }

  function initFormValidate(form) {
    form.addEventListener('submit', function (e) {
      if (!validateForm(form)) { e.preventDefault(); form.dispatchEvent(new CustomEvent('wm:invalid', { bubbles: true })); }
      else { form.dispatchEvent(new CustomEvent('wm:valid', { bubbles: true })); }
    });
    // clear errors as the user fixes them
    form.addEventListener('input', function (e) {
      var f = fieldOf(e.target);
      if (f && f.classList.contains('wm-field--error')) validateField(e.target);
    });
    form.addEventListener('change', function (e) {
      var f = fieldOf(e.target);
      if (f && f.classList.contains('wm-field--error')) validateField(e.target);
    });
  }

  /* ---- copy to clipboard ------------------------------------------------- */
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  /* ---- command palette --------------------------------------------------- */
  var cmdk = (function () {
    var overlay, listEl, inputEl, emptyEl, items = [], activeIdx = 0, built = false;

    function build() {
      if (built) return;
      overlay = $('.wm-cmdk-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'wm-cmdk-overlay';
        overlay.innerHTML =
          '<div class="wm-cmdk" role="dialog" aria-label="Command palette">' +
            '<div class="wm-cmdk-search">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>' +
              '<input type="text" placeholder="Search actions, pages…" autocomplete="off" spellcheck="false">' +
              '<span class="wm-kbd">Esc</span>' +
            '</div>' +
            '<div class="wm-cmdk-list"></div>' +
            '<div class="wm-cmdk-empty">No results found</div>' +
          '</div>';
        document.body.appendChild(overlay);
      }
      listEl = $('.wm-cmdk-list', overlay);
      inputEl = $('.wm-cmdk-search input', overlay);
      emptyEl = $('.wm-cmdk-empty', overlay);

      // harvest any markup-defined items so authors can declare them in HTML
      $all('.wm-cmdk-item', listEl).forEach(function (a) {
        items.push({
          label: (a.querySelector('.wm-cmdk-label') || a).textContent.trim(),
          sub: (a.querySelector('.wm-cmdk-item-sub') || {}).textContent || '',
          href: a.getAttribute('href') || '',
          section: a.dataset.section || '',
          _el: a
        });
      });

      overlay.addEventListener('click', function (e) { if (e.target === overlay) closeP(); });
      inputEl.addEventListener('input', render);
      inputEl.addEventListener('keydown', onKeys);
      built = true;
    }

    function register(arr) { build(); items = items.concat(arr || []); }

    function openP() {
      build();
      overlay.classList.add('is-open');
      lockScroll(true);
      inputEl.value = ''; activeIdx = 0; render();
      setTimeout(function () { try { inputEl.focus(); } catch (e) {} }, 20);
    }
    function closeP() {
      if (!overlay) return;
      overlay.classList.remove('is-open');
      if (!anyOverlayOpen()) lockScroll(false);
    }
    function isOpenP() { return overlay && overlay.classList.contains('is-open'); }

    function matches() {
      var q = (inputEl.value || '').toLowerCase().trim();
      if (!q) return items.slice();
      return items.filter(function (it) {
        return (it.label + ' ' + (it.sub || '') + ' ' + (it.section || '')).toLowerCase().indexOf(q) !== -1;
      });
    }

    function render() {
      var found = matches();
      activeIdx = Math.max(0, Math.min(activeIdx, found.length - 1));
      listEl.innerHTML = '';
      var lastSection = null;
      found.forEach(function (it, i) {
        if (it.section && it.section !== lastSection) {
          var s = document.createElement('div');
          s.className = 'wm-cmdk-section'; s.textContent = it.section;
          listEl.appendChild(s); lastSection = it.section;
        }
        var a = document.createElement(it.href ? 'a' : 'div');
        a.className = 'wm-cmdk-item' + (i === activeIdx ? ' active' : '');
        if (it.href) a.href = it.href;
        a.innerHTML =
          '<span class="wm-cmdk-ic"><svg class="wm-ic"><use href="#' + (it.icon || 'ic-arrow-right') + '"/></svg></span>' +
          '<span class="wm-cmdk-label">' + escapeHtml(it.label) + '</span>' +
          (it.sub ? '<span class="wm-cmdk-item-sub">' + escapeHtml(it.sub) + '</span>' : '');
        a.addEventListener('click', function (e) { activeIdx = i; trigger(e); });
        a.addEventListener('mousemove', function () {
          if (activeIdx === i) return;
          activeIdx = i;
          $all('.wm-cmdk-item', listEl).forEach(function (n) { n.classList.remove('active'); });
          a.classList.add('active');
        });
        listEl.appendChild(a);
      });
      emptyEl.style.display = found.length ? 'none' : 'block';
    }

    function onKeys(e) {
      var found = matches();
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, found.length - 1); render(); scrollActive(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); render(); scrollActive(); }
      else if (e.key === 'Enter') { e.preventDefault(); trigger(e); }
      else if (e.key === 'Escape') { e.preventDefault(); closeP(); }
    }
    function scrollActive() {
      var a = $('.wm-cmdk-item.active', listEl);
      if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
    }
    function trigger(e) {
      var found = matches();
      var it = found[activeIdx];
      if (!it) return;
      if (typeof it.action === 'function') { e.preventDefault(); closeP(); it.action(); }
      else if (it.href) { closeP(); window.location.href = it.href; }
      else if (it._el) { it._el.click(); }
    }

    return { open: openP, close: closeP, isOpen: isOpenP, register: register };
  })();

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---- platform keyboard hint (⌘ vs Ctrl) -------------------------------- */
  function applyKbdHints() {
    var isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
    $all('[data-wm-kbd-meta]').forEach(function (el) {
      el.textContent = isMac ? '⌘ K' : 'Ctrl K';
    });
  }

  /* ---- declarative wiring + global keys ---------------------------------- */
  function init() {
    // open triggers
    document.addEventListener('click', function (e) {
      var opener = e.target.closest('[data-wm-open]');
      if (opener) { e.preventDefault(); open(opener.getAttribute('data-wm-open')); return; }

      var closer = e.target.closest('[data-wm-close]');
      if (closer) {
        e.preventDefault();
        var target = closer.getAttribute('data-wm-close');
        close(target ? target : closer.closest('.wm-modal-overlay, .wm-drawer-overlay'));
        return;
      }

      var cmdkBtn = e.target.closest('[data-wm-cmdk]');
      if (cmdkBtn) { e.preventDefault(); cmdk.open(); return; }

      var copyBtn = e.target.closest('[data-wm-copy]');
      if (copyBtn) {
        e.preventDefault();
        copy(copyBtn.getAttribute('data-wm-copy')).then(function () {
          toast(copyBtn.getAttribute('data-wm-copy-msg') || 'Copied to clipboard', { type: 'success' });
        });
        return;
      }
    });

    // overlay backdrop click closes (modal + drawer)
    $all('.wm-modal-overlay, .wm-drawer-overlay').forEach(function (ov) {
      ov.addEventListener('click', function (e) { if (e.target === ov) close(ov); });
    });

    // components
    $all('[data-wm-toggle], .wm-toggle').forEach(initToggle);
    $all('[data-wm-option-group]').forEach(initOptionGroup);
    $all('.wm-option-card').forEach(function (c) {
      if (!c.closest('[data-wm-option-group]')) initLoneOptionCard(c);
    });
    $all('[data-wm-table-search]').forEach(initTableSearch);
    $all('.wm-dropdown').forEach(initDropdown);
    $all('.wm-field-float select').forEach(enhanceSelect);
    $all('.wm-field-float input[type="date"]').forEach(enhanceDate);
    $all('form[data-wm-validate]').forEach(function (f) {
      if (f.dataset.wmEnhanced) return; f.dataset.wmEnhanced = '1'; initFormValidate(f);
    });

    // close any open filter dropdown on outside click
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.wm-dropdown')) {
        $all('.wm-dropdown.is-open').forEach(function (o) { o.classList.remove('is-open'); });
      }
    });
    // close any open select menu / calendar on outside click (port of portal handler)
    document.addEventListener('mousedown', function (e) {
      if (!e.target.closest('.wm-field-float.open')) closeAllPopovers();
    });

    applyKbdHints();

    // global keys: Esc closes topmost, Cmd/Ctrl+K toggles palette
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var openDd = $all('.wm-dropdown.is-open');
        var openPop = $all('.wm-select-menu.open, .wm-calendar.open, .wm-field-float.open');
        if (openDd.length || openPop.length) {
          openDd.forEach(function (o) { o.classList.remove('is-open'); });
          closeAllPopovers();
        } else { closeTopmost(); }
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        if ($('.wm-cmdk-overlay') || document.querySelector('[data-wm-cmdk]')) {
          e.preventDefault();
          cmdk.isOpen() ? cmdk.close() : cmdk.open();
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ---- public API -------------------------------------------------------- */
  global.WMUI = {
    open: open,
    close: close,
    toast: toast,
    copy: copy,
    cmdk: cmdk,
    select: { value: function (selOrEl) { var el = resolve(selOrEl); var s = el && (el.tagName === 'SELECT' ? el : el.querySelector('select')); return s ? selectValue(s) : null; } },
    validate: validateForm,
    refresh: init
  };
})(window);
