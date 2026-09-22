/**
 * Metzler SeasonalCampaignSystem — Admin controller
 * Author, schedule, and prioritize campaigns. Reads/writes through
 * CampaignStore (localStorage override on the seed) so edits preview live in
 * the storefront. Uses CampaignEngine to show which campaign wins on any date.
 */
(function () {
  'use strict';

  var E = window.CampaignEngine;
  var S = window.CampaignStore;

  var CATEGORIES = [
    ['briefkasten', 'Briefkästen'], ['paketboxen', 'Paketboxen'], ['muelltonnenbox', 'Mülltonnenboxen'],
    ['tuersprechanlagen', 'Sprechanlagen'], ['sicherheitstechnik', 'Sicherheitstechnik'], ['tuerklingel', 'Türklingeln'],
    ['hausnummern-schilder-schriftzuege', 'Hausnummern & Schriftzüge'], ['beleuchtung', 'Außenleuchten'], ['garten', 'Garten']
  ];
  var CAT_LABEL = {}; CATEGORIES.forEach(function (c) { CAT_LABEL[c[0]] = c[1]; });

  var SEASONS = [
    ['all', 'Ganzjährig'], ['winter', 'Winter'], ['spring', 'Frühling'],
    ['spring-summer', 'Frühling/Sommer'], ['summer', 'Sommer'], ['autumn', 'Herbst']
  ];
  var TEMPLATES = [['', 'Standard'], ['blackfriday', 'Black Month (Premium)']];
  var TEMPLATE_META = {
    '': { desc: 'Klassisches Storefront-Layout für reguläre Kampagnen.' },
    'blackfriday': { desc: 'Premium-Bühne mit Gold-Akzenten, Countdown und Hero-Bild.', premium: true }
  };
  // Templates whose hero renders a background image (enables the Hero-Bild fields).
  // Add future image-based templates here — no other change needed.
  var HERO_TEMPLATES = ['blackfriday'];
  var state = { campaigns: [], editingId: null, query: '', hidePaused: false };

  // ── helpers ──
  function $(s) { return document.querySelector(s); }
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function previewDate() { return el('preview-date').value || todayISO(); }
  function todayISO() { var t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); }
  function fmtWindow(c) {
    if (c.isFallback || !c.startDate) return 'Immer (Fallback)';
    return de(c.startDate) + ' – ' + de(c.endDate) + (c.recurring ? ' · jährl.' : '');
  }
  function de(iso) { if (!iso) return '—'; var p = iso.split('-'); return p[2] + '.' + p[1] + '.'; }
  var toastT;
  function toast(msg) { var t = el('toast'); t.textContent = msg; t.classList.add('is-show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('is-show'); }, 2200); }

  // Row-action icons (stroke style; play/pause tuned for legibility at 14px)
  var ACT_ICON = {
    edit:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
    dupe:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    pause:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
    resume: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>',
    del:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>'
  };

  // ── render ──
  function render() {
    var date = previewDate();
    var winner = E.resolveActiveCampaign(state.campaigns, date);
    var activeIds = {};
    E.getActiveCampaigns(state.campaigns, date).forEach(function (c) { activeIds[c.id] = true; });

    // winner banner
    var w = el('winner');
    if (winner) {
      var disc = E.formatDiscount(winner);
      w.innerHTML =
        '<div><div class="winner__label">Aktiv am ' + esc(de(date)) + esc(date.slice(0, 4)) + '</div>' +
        '<div class="winner__name">' + esc(winner.name) + '</div>' +
        '<div class="winner__meta">' + (winner.isFallback ? 'Fallback (keine datierte Kampagne aktiv)' : 'Priorität ' + winner.priority) + (disc ? ' · ' + esc(disc) : '') + '</div></div>' +
        '<span class="winner__spacer"></span>' +
        '<a class="btn btn--on-dark" href="index.html?date=' + esc(date) + '" style="background:#fff;color:var(--color-teal-900);">Zur Vorschau →</a>';
    } else { w.innerHTML = ''; }

    // table — sort by STATUS first (so the header's "aktiv" count matches what's
    // on top), then priority desc within each status group.
    // 0 Startseite · 1 Aktiv · 2 Geplant · 3 Pausiert · 4 Fallback
    function statusRank(c) {
      if (c.disabled) return 3;
      if (winner && winner.id === c.id) return 0;
      if (activeIds[c.id]) return 1;
      if (c.isFallback) return 4;
      return 2;
    }
    var rows = state.campaigns.slice().sort(function (a, b) {
      var ra = statusRank(a), rb = statusRank(b);
      if (ra !== rb) return ra - rb;
      return (b.priority || 0) - (a.priority || 0);
    });

    var q = (state.query || '').trim().toLowerCase();
    var shown = rows;
    if (q) shown = shown.filter(function (c) { return (c.name + ' ' + c.id).toLowerCase().indexOf(q) !== -1; });
    if (state.hidePaused) shown = shown.filter(function (c) { return !c.disabled; });

    var emptyMsg = q ? 'Keine Kampagne gefunden für „' + esc(state.query || '') + '“.'
                     : (state.hidePaused ? 'Alle Kampagnen sind pausiert.' : 'Noch keine Kampagnen angelegt.');

    el('tbl-body').innerHTML = shown.length ? shown.map(function (c) {
      var paused = !!c.disabled;
      var isWinner = winner && winner.id === c.id;
      var isActive = activeIds[c.id];
      var stVar = paused ? 'is-paused' : (isWinner ? 'is-winner' : (isActive ? 'is-active' : 'is-planned'));
      var stLabel = paused ? 'Pausiert' : (isWinner ? 'Startseite' : (isActive ? 'Aktiv' : 'Geplant'));
      var dotTitle = paused ? 'Pausiert – wird nirgends ausgespielt'
        : (isWinner ? 'Führt die Startseite' : (isActive ? 'Aktiv – läuft, aber nicht führend' : 'Geplant – startet später'));
      var rowCls = (c.isFallback ? 'is-fallback ' : '') + (paused ? 'is-paused ' : '') +
        (!paused && isWinner ? 'is-winner-row' : (!paused && isActive ? 'is-active-row' : ''));
      var disc = E.formatDiscount(c);
      var tmpl = (c.template === 'blackfriday') ? '<span class="chip chip--tmpl">Premium</span>' : '';
      var pausedChip = paused ? '<span class="chip chip--paused">Pausiert</span>' : '';
      var catList = (c.targetCategories || []).map(function (s) { return CAT_LABEL[s] || s; });
      return '<tr class="' + rowCls.trim() + '" data-id="' + esc(c.id) + '">' +
        '<td class="cell-status" data-label="Status"><span class="status-badge ' + stVar + '" role="img" aria-label="' + dotTitle + '" title="' + dotTitle + '"><span class="sd" aria-hidden="true"></span>' + stLabel + '</span></td>' +
        '<td class="cell-name"><div class="row-name">' + esc(c.name) + ' ' + tmpl + pausedChip + '</div><div class="row-id">' + esc(c.id) + '</div></td>' +
        '<td class="col-opt col-when cell-when" data-label="Zeitraum">' + esc(fmtWindow(c)) + '</td>' +
        '<td class="col-opt cell-rabatt" data-label="Rabatt">' + (disc ? '<span class="chip chip--disc">' + esc(disc) + '</span>' : '<span class="row-id">—</span>') + '</td>' +
        '<td class="col-opt cell-kat" data-label="Kategorien">' + (catList.length
          ? '<button type="button" class="cat-trigger" aria-haspopup="true" aria-expanded="false" data-cats="' + esc(catList.join('|')) + '">' + catList.length + ' Kat.<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>'
          : '<span class="row-id">alle/—</span>') + '</td>' +
        '<td class="cell-actions"><div class="row-actions">' +
          '<button class="icon-action icon-action--edit" data-act="edit">' + ACT_ICON.edit + 'Bearbeiten</button>' +
          '<button class="icon-action" data-act="dupe">' + ACT_ICON.dupe + 'Duplizieren</button>' +
          (c.isFallback ? '' : '<button class="icon-action' + (paused ? ' icon-action--resume' : '') + '" data-act="toggle">' + (paused ? ACT_ICON.resume + 'Fortsetzen' : ACT_ICON.pause + 'Pausieren') + '</button>') +
          (c.isFallback ? '' : '<button class="icon-action icon-action--danger" data-act="del">' + ACT_ICON.del + 'Löschen</button>') +
        '</div></td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="6"><div class="tbl-empty">' + emptyMsg + '</div></td></tr>';

    // count + status summary above the table
    var countEl = el('tbl-count');
    if (countEl) {
      var total = state.campaigns.length;
      var activeCount = Object.keys(activeIds).length;
      var pausedCount = state.campaigns.filter(function (c) { return c.disabled; }).length;
      // Break the summary down by the SAME labels the rows use, so no word means
      // two things: "Startseite" = the leader, "aktiv" = the others running.
      var winnerDated = winner && !winner.isFallback && activeIds[winner.id];
      var secondary = activeCount - (winnerDated ? 1 : 0);
      var lead = winner
        ? 'Startseite: <b>' + esc(winner.name) + '</b>' + (winner.isFallback ? ' <span class="tbl-count__fb">(Fallback)</span>' : '')
        : '<b>keine aktive Kampagne</b>';
      countEl.innerHTML = q
        ? '<b>' + shown.length + '</b> von ' + total + ' Kampagnen'
        : '<b>' + total + '</b> Kampagnen · ' + lead +
          (secondary > 0 ? ' · <b>' + secondary + '</b> weitere aktiv' : '') +
          (pausedCount ? ' · <b>' + pausedCount + '</b> pausiert' : '') +
          ' · am ' + esc(de(date)) + esc(date.slice(0, 4));
    }

  }

  // ── editor drawer ──
  function openEditor(campaign) {
    state.editingId = campaign ? campaign.id : null;
    var c = campaign || { season: 'all', recurring: true, priority: 50, targetCategories: [] };
    el('drawer-title').textContent = campaign ? 'Kampagne bearbeiten' : 'Neue Kampagne';
    el('btn-delete-inline').style.display = (campaign && !campaign.isFallback) ? '' : 'none';

    var curAccent = (c.theme && c.theme.accent) || 'brand-default';
    el('drawer-body').innerHTML =
      grp('Grunddaten',
        row('Name', input('f-name', c.name)) +
        row('Kampagnen-ID', input('f-id', c.id || ''), 'Wird aus dem Namen erzeugt. Muss eindeutig sein.') +
        row('Vorlage', select('f-template', TEMPLATES, c.template || '', TEMPLATE_META))
      ) +
      grp('Zeitraum',
        g2(
          row('Start', dateInput('f-start', c.startDate)),
          row('Ende', dateInput('f-end', c.endDate))
        ) +
        row('Saison', select('f-season', SEASONS, c.season || 'all')) +
        '<label class="check-inline" id="row-recurring"><input type="checkbox" id="f-recurring"' + (c.recurring ? ' checked' : '') + '> Jährlich wiederkehrend</label>' +
        '<div class="switch-row">' +
          '<span class="switch-row__text">' +
            '<span class="switch-row__label">Kampagne pausieren</span>' +
            '<span class="switch-row__hint">Wird nirgends ausgespielt – der Zeitraum bleibt gespeichert.</span>' +
          '</span>' +
          '<label class="switch"><input type="checkbox" role="switch" aria-label="Kampagne pausieren" id="f-disabled"' + (c.disabled ? ' checked' : '') + '><span class="switch__track"></span><span class="switch__thumb"></span></label>' +
        '</div>'
      ) +
      grp('Inhalte (Storefront)',
        row('Hero-Überschrift', input('f-headline', c.heroHeadline)) +
        row('Eyebrow / Label', input('f-eyebrow', c.eyebrow || ''), 'Kleine Zeile über der Überschrift (z. B. „Nur im November 2026“).') +
        row('Promo-Streifen', input('f-promo', c.promoStrip)) +
        row('Badge', input('f-badge', c.badge || '')) +
        '<div class="img2-grid">' +
          imgField('f-heroimg', 'Hero-Bild · Desktop', c.heroImage || '', 'Querformat · auto-skaliert & komprimiert', 'wide') +
          imgField('f-heroimg-m', 'Hero-Bild · Mobil', c.heroImageMobile || '', 'Hochformat · optional', 'portrait') +
        '</div>'
      ) +
      grp('Design & Barrierefreiheit',
        row('Farbwelt (Theme)', select('f-theme', THEMES, curAccent), 'Bestimmt Hintergrund & Akzent des Hero. Der Kontrast wird live nach WCAG AA geprüft.') +
        '<div id="contrast-report" class="contrast-report" aria-live="polite"></div>'
      ) +
      '<div class="field-group">' +
        '<div class="field-group__title cats-head">Zielkategorien' +
          '<label class="cats-all"><input type="checkbox" id="cats-all"> Alle auswählen</label>' +
        '</div>' +
        '<div class="cats-grid">' + CATEGORIES.map(function (cat) {
          var on = (c.targetCategories || []).indexOf(cat[0]) !== -1;
          return '<label class="cat-check"><input type="checkbox" data-cat="' + cat[0] + '"' + (on ? ' checked' : '') + '> ' + esc(cat[1]) + '</label>';
        }).join('') + '</div>' +
      '</div>' +
      '<div class="form-error" id="form-error" hidden></div>' +
      '<div class="overlap-note" id="overlap-note" hidden></div>';

    initSelects(el('drawer-body'));

    // "Alle auswählen" master checkbox (tri-state) for the Zielkategorien
    (function () {
      var master = el('cats-all');
      if (!master) return;
      function boxes() { return Array.prototype.slice.call(el('drawer-body').querySelectorAll('.cats-grid input[type="checkbox"]')); }
      function sync() {
        var bs = boxes(); var n = bs.filter(function (b) { return b.checked; }).length;
        master.checked = bs.length > 0 && n === bs.length;
        master.indeterminate = n > 0 && n < bs.length;
      }
      master.addEventListener('change', function () { var target = master.checked; boxes().forEach(function (b) { b.checked = target; }); sync(); });
      boxes().forEach(function (b) { b.addEventListener('change', sync); });
      sync();
    })();

    // Hero-image uploaders (client-side: auto-scaled data URL stored with the campaign)
    ['f-heroimg', 'f-heroimg-m'].forEach(wireImageField);

    // live WCAG contrast readout for the chosen colour world
    var themeSel = el('f-theme');
    if (themeSel) themeSel.addEventListener('change', renderContrast);
    renderContrast();

    // live slug + overlap
    el('f-name').addEventListener('input', function () {
      if (!campaign) el('f-id').value = S.slugify(el('f-name').value);
      updateOverlap();
    });
    ['f-start', 'f-end', 'f-recurring'].forEach(function (id) {
      var n = el(id); if (n) n.addEventListener('change', updateOverlap);
    });
    updateOverlap();

    // Pause toggle suspends (fades) the yearly-recurring option — it doesn't
    // apply while the campaign is switched off, but the setting is preserved.
    var pauseCb = el('f-disabled');
    var recurRow = el('row-recurring');
    function syncPauseState() { if (recurRow) recurRow.classList.toggle('is-suspended', pauseCb.checked); }
    if (pauseCb) { pauseCb.addEventListener('change', syncPauseState); syncPauseState(); }

    el('drawer').classList.add('is-open');
    el('drawer-backdrop').classList.add('is-open');
    document.body.classList.add('is-drawer-open'); // lock background scroll
  }

  function updateOverlap() {
    var start = el('f-start').value, end = el('f-end').value;
    var note = el('overlap-note');
    if (!start || !end) { note.hidden = true; return; }
    // find campaigns whose window overlaps the start date (simple proxy: active at start)
    var clash = state.campaigns.filter(function (c) {
      return c.id !== state.editingId && !c.isFallback && E.isActive(c, E.toDate(start));
    });
    if (clash.length) {
      note.hidden = false;
      note.innerHTML = 'Überschneidet sich am Startdatum mit: ' + clash.map(function (c) { return esc(c.name); }).join(', ') + '.';
    } else { note.hidden = true; }
  }

  function closeEditor() {
    closeAllSelects();
    el('drawer').classList.remove('is-open');
    el('drawer-backdrop').classList.remove('is-open');
    document.body.classList.remove('is-drawer-open');
    state.editingId = null;
  }

  function collectForm() {
    var v = function (id) { var n = el(id); return n ? n.value.trim() : ''; };
    var name = v('f-name');
    var tc = CATEGORIES.filter(function (cat) { var n = document.querySelector('[data-cat="' + cat[0] + '"]'); return n && n.checked; }).map(function (cat) { return cat[0]; });

    // Preserve unknown fields (theme, heroBanner, rationale, isFallback) when editing.
    var base = {};
    if (state.editingId) {
      var orig = state.campaigns.filter(function (c) { return c.id === state.editingId; })[0];
      if (orig) base = S.clone(orig);
    }
    base.id = v('f-id') || S.slugify(name);
    base.name = name;
    base.season = v('f-season');
    base.startDate = v('f-start') || null;
    base.endDate = v('f-end') || null;
    base.recurring = el('f-recurring').checked;
    if (base.priority == null) base.priority = 50;   // preserve existing; default new campaigns
    base.heroHeadline = v('f-headline');
    base.promoStrip = v('f-promo');
    base.targetCategories = tc;
    // discountRule is no longer edited here; any existing value (from seed data)
    // is preserved via the clone of the original above.
    setOrDelete(base, 'template', v('f-template'));
    setOrDelete(base, 'eyebrow', v('f-eyebrow'));
    setOrDelete(base, 'badge', v('f-badge'));
    setOrDelete(base, 'heroImage', v('f-heroimg'));
    setOrDelete(base, 'heroImageMobile', v('f-heroimg-m'));
    if (el('f-disabled') && el('f-disabled').checked) base.disabled = true; else delete base.disabled;
    var accent = v('f-theme');
    if (accent) { var th = base.theme || {}; th.accent = accent; base.theme = th; }
    return base;
  }
  function setOrDelete(o, k, val) { if (val) o[k] = val; else delete o[k]; }

  function validate(c) {
    if (!c.name) return 'Bitte einen Namen angeben.';
    if (!c.isFallback && (!c.startDate || !c.endDate)) return 'Bitte Start- und Enddatum angeben.';
    if (c.priority < 0) return 'Priorität darf nicht negativ sein.';
    var dupe = state.campaigns.some(function (x) { return x.id === c.id && x.id !== state.editingId; });
    if (dupe) return 'Die ID „' + c.id + '“ ist bereits vergeben.';
    return null;
  }

  function saveEditor() {
    var c = collectForm();
    var err = validate(c);
    if (err) { var e = el('form-error'); e.hidden = false; e.textContent = err; return; }

    // WCAG contrast gate — an inaccessible colour world can't ship.
    var cg = computeContrast((c.theme && c.theme.accent) || 'brand-default');
    if (!cg.ok) { var e2 = el('form-error'); e2.hidden = false; e2.textContent = cg.message; renderContrast(); return; }

    if (state.editingId) {
      state.campaigns = state.campaigns.map(function (x) { return x.id === state.editingId ? c : x; });
    } else {
      state.campaigns.push(c);
    }
    persist();
    closeEditor();
    render();
    toast('Kampagne gespeichert.');
  }

  function persist() { S.save(state.campaigns); state.source = 'local'; }

  // ── row actions ──
  function uniqueId(base) {
    var id = base, n = 2;
    while (state.campaigns.some(function (x) { return x.id === id; })) { id = base + '-' + n; n++; }
    return id;
  }
  // ── categories dropdown ──
  function closeCatPop() {
    var pop = el('cat-pop'); if (!pop || pop.hidden) return;
    pop.hidden = true;
    var open = document.querySelector('.cat-trigger[aria-expanded="true"]');
    if (open) open.setAttribute('aria-expanded', 'false');
  }
  function openCatPop(trigger) {
    var pop = el('cat-pop');
    var names = (trigger.getAttribute('data-cats') || '').split('|').filter(Boolean);
    if (!pop || !names.length) return;
    pop.innerHTML = '<div class="cat-pop__title">Zielkategorien</div>' +
      names.map(function (n) { return '<div class="cat-pop__item" role="menuitem">' + esc(n) + '</div>'; }).join('');
    pop.hidden = false;
    var r = trigger.getBoundingClientRect();
    var pr = pop.getBoundingClientRect();
    var top = r.bottom + 6;
    if (top + pr.height > window.innerHeight - 8) top = Math.max(8, r.top - pr.height - 6);
    var left = Math.min(r.left, window.innerWidth - pr.width - 8);
    pop.style.top = top + 'px';
    pop.style.left = Math.max(8, left) + 'px';
    trigger.setAttribute('aria-expanded', 'true');
  }

  function onTableClick(ev) {
    var catT = ev.target.closest('.cat-trigger');
    if (catT) { ev.stopPropagation(); if (catT.getAttribute('aria-expanded') === 'true') closeCatPop(); else { closeCatPop(); openCatPop(catT); } return; }
    var btn = ev.target.closest('[data-act]'); if (!btn) return;
    var id = ev.target.closest('tr').getAttribute('data-id');
    var c = state.campaigns.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var act = btn.getAttribute('data-act');
    if (act === 'edit') openEditor(c);
    else if (act === 'dupe') {
      var copy = S.clone(c); delete copy.isFallback; delete copy.disabled;
      copy.id = uniqueId(S.slugify(c.id + '-kopie')); copy.name = c.name + ' (Kopie)';
      state.campaigns.push(copy); persist(); render(); openEditor(copy); toast('Dupliziert – jetzt bearbeiten.');
    } else if (act === 'toggle') {
      if (c.disabled) delete c.disabled; else c.disabled = true;
      persist(); render(); toast(c.disabled ? 'Kampagne pausiert.' : 'Kampagne fortgesetzt.');
    } else if (act === 'del') {
      if (confirm('Kampagne „' + c.name + '“ wirklich löschen?')) {
        state.campaigns = state.campaigns.filter(function (x) { return x.id !== id; });
        persist(); render(); toast('Kampagne gelöscht.');
      }
    }
  }

  // ── export / import / reset ──
  function exportJson() {
    S.exportPayload().then(function (payload) {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'campaigns.seed.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('campaigns.seed.json exportiert.');
    });
  }
  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        S.importCampaigns(reader.result);
        boot(function () { toast('Import erfolgreich.'); });
      } catch (e) { alert('Import fehlgeschlagen: ' + e.message); }
    };
    reader.readAsText(file);
  }
  function resetSeed() {
    if (!confirm('Alle lokalen Änderungen verwerfen und auf den Standard zurücksetzen?')) return;
    S.reset();
    boot(function () { toast('Auf Standard zurückgesetzt.'); });
  }

  // ── boot ──
  function boot(after) {
    S.load().then(function (payload) {
      state.campaigns = payload.campaigns;
      state.source = payload.source;
      render();
      if (after) after();
    });
  }

  function init() {
    el('preview-date').value = todayISO();
    el('preview-date').addEventListener('change', render);
    el('search').addEventListener('input', function () { state.query = this.value; render(); });
    el('filter-hidepaused').addEventListener('change', function () { state.hidePaused = this.checked; render(); });
    el('btn-new').addEventListener('click', function () { openEditor(null); });
    el('tbl-body').addEventListener('click', onTableClick);
    el('drawer-close').addEventListener('click', closeEditor);
    el('btn-cancel').addEventListener('click', closeEditor);
    el('drawer-backdrop').addEventListener('click', closeEditor);
    el('btn-save').addEventListener('click', saveEditor);
    el('btn-delete-inline').addEventListener('click', function () {
      if (!state.editingId) return;
      var c = state.campaigns.filter(function (x) { return x.id === state.editingId; })[0];
      if (c && confirm('Kampagne „' + c.name + '“ wirklich löschen?')) {
        state.campaigns = state.campaigns.filter(function (x) { return x.id !== state.editingId; });
        persist(); closeEditor(); render(); toast('Kampagne gelöscht.');
      }
    });
    el('btn-export').addEventListener('click', exportJson);
    el('btn-import').addEventListener('click', function () { el('file-import').click(); });
    el('file-import').addEventListener('change', function (e) { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; });
    el('btn-reset').addEventListener('click', resetSeed);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeEditor(); closeCatPop(); }
      // Ctrl/⌘+S saves while the editor drawer is open
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S') && el('drawer').classList.contains('is-open')) {
        e.preventDefault(); saveEditor();
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.cat-trigger') && !e.target.closest('#cat-pop')) closeCatPop();
    });
    // Close on PAGE scroll (the fixed popover would detach from its row) — but
    // NOT when the scroll happens inside the popover's own category list.
    window.addEventListener('scroll', function (e) {
      var pop = el('cat-pop');
      var t = e.target;
      if (pop && !pop.hidden && t && t.nodeType === 1 && (t === pop || (t.closest && t.closest('#cat-pop')))) return;
      closeCatPop();
    }, true);
    window.addEventListener('resize', closeCatPop);
    boot();
  }

  // form builders
  // ── WCAG contrast gate ─────────────────────────────────────────────────
  // Colour worlds (theme.accent → label). Colours are read live from
  // campaign.css via a hidden probe, so the gate always reflects the real
  // palette rather than a duplicated copy.
  var THEMES = [
    ['brand-default', 'Standard – Marken-Teal'],
    ['cool-blue', 'Neujahr – Kühlblau'],
    ['spring-green', 'Frühjahr – Eukalyptus'],
    ['warm-pastel', 'Ostern – Warm'],
    ['architect-grey', 'Bauherren – Stein'],
    ['security-teal', 'Sicherheit – Petrol (wachsam)'],
    ['security-steel-soft', 'Sicherheit – Petrol (beruhigend)'],
    ['sun-gold', 'Solar – Gold'],
    ['amber-warm', 'Herbst – Bernstein'],
    ['black-deal', 'Black Month – Schwarz'],
    ['festive-red', 'Weihnachten – Bordeaux'],
    ['festive-gold', 'Weihnachten – Tannengrün'],
    ['winter-silver', 'Jahresende – Silber']
  ];

  var _crProbe;
  function readThemeVars(accent) {
    if (!_crProbe) { _crProbe = document.createElement('div'); _crProbe.style.display = 'none'; document.body.appendChild(_crProbe); }
    _crProbe.setAttribute('data-camp-theme', accent || 'brand-default');
    var cs = getComputedStyle(_crProbe);
    return {
      bg: cs.getPropertyValue('--camp-bg').trim(),
      accent: cs.getPropertyValue('--camp-accent').trim(),
      stripBg: cs.getPropertyValue('--camp-strip-bg').trim(),
      stripFg: cs.getPropertyValue('--camp-strip-fg').trim() || '#FFFFFF'
    };
  }
  function rootVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function crRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function crLum(rgb) { var a = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
  function crRatio(h1, h2) { var L1 = crLum(crRgb(h1)), L2 = crLum(crRgb(h2)), hi = Math.max(L1, L2), lo = Math.min(L1, L2); return (hi + 0.05) / (lo + 0.05); }
  function crLightest(str) { var hs = String(str).match(/#[0-9a-fA-F]{3,6}/g) || []; if (!hs.length) return '#000000'; return hs.reduce(function (a, b) { return crLum(crRgb(b)) > crLum(crRgb(a)) ? b : a; }); }

  // The key hero pairs. The lightest gradient stop is the worst case for light
  // elements (white text, bone CTA), so contrast is measured against it.
  function computeContrast(accent) {
    var t = readThemeVars(accent);
    var teal = rootVar('--color-teal') || '#015253';
    var ground = crLightest(t.bg), BONE = '#F2F1EC';
    function mk(label, c1, c2, min, advisory) {
      var r = crRatio(c1, c2), level = advisory ? (r >= 4.5 ? 'pass' : (r >= 3 ? 'warn' : 'fail')) : (r >= min ? 'pass' : 'fail');
      return { label: label, ratio: r, level: level, badge: level === 'pass' ? 'AA ✓' : (level === 'warn' ? 'nur groß' : 'AA ✗') };
    }
    var rows = [
      mk('Hero-Text (weiß) · Hintergrund', '#FFFFFF', ground, 4.5, false),
      mk('CTA-Fläche (Bone) · Hintergrund', BONE, ground, 3, false),
      mk('CTA-Text (Teal) · CTA-Fläche', teal, BONE, 4.5, false),
      mk('Akzent · Hintergrund', t.accent || '#FFFFFF', ground, 4.5, true),
      mk('Promo-Text · Streifen', t.stripFg, t.stripBg || ground, 4.5, false)
    ];
    var fails = rows.filter(function (r) { return r.level === 'fail'; });
    return { rows: rows, ok: fails.length === 0,
      message: fails.length ? 'Kontrast zu niedrig (WCAG AA): ' + fails.map(function (r) { return r.label + ' ' + r.ratio.toFixed(2) + ':1'; }).join(' · ') + '. Bitte eine andere Farbwelt wählen.' : '' };
  }
  function renderContrast() {
    var box = el('contrast-report'); if (!box) return;
    var rep = computeContrast((el('f-theme') || {}).value || 'brand-default');
    box.innerHTML = rep.rows.map(function (r) {
      return '<div class="cr-row"><span class="cr-label">' + esc(r.label) + '</span>' +
        '<span class="cr-ratio">' + r.ratio.toFixed(2) + ':1</span>' +
        '<span class="cr-badge cr-badge--' + r.level + '">' + r.badge + '</span></div>';
    }).join('') + (rep.ok ? '' : '<div class="cr-warn">' + esc(rep.message) + '</div>');
  }

  function grp(title, inner) { return '<div class="field-group"><div class="field-group__title">' + esc(title) + '</div>' + inner + '</div>'; }
  function row(label, control, hint) { return '<div class="form-row"><label>' + esc(label) + '</label>' + control + (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div>'; }
  function g2(a, b) { return '<div class="form-grid-2">' + a + b + '</div>'; }

  var UPLOAD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/><path d="M12 15V4"/><path d="M8 8l4-4 4 4"/></svg>';

  // Hero-image field: a shaped dropzone (click or drag & drop) + a demoted path
  // input. The real value lives in a hidden #<id> input (path OR a scaled data
  // URL from an upload); collectForm reads it as before.
  function imgField(id, label, value, hint, orient) {
    return '<div class="img2-field img2-field--' + (orient || 'wide') + '">' +
      '<div class="img2-field__head">' + esc(label) + '</div>' +
      '<div class="img2-drop" id="' + id + '-drop" role="button" tabindex="0" aria-label="' + esc(label) + ' hochladen">' +
        '<div class="img2-drop__empty">' + UPLOAD_ICON +
          '<span class="img2-drop__t">Bild auswählen</span>' +
          '<span class="img2-drop__s">oder hierher ziehen</span></div>' +
        '<div class="img2-drop__overlay">' +
          '<span class="img2-drop__act" data-act="replace">Ersetzen</span>' +
          '<span class="img2-drop__act img2-drop__act--rm" data-act="remove">Entfernen</span>' +
        '</div>' +
      '</div>' +
      '<input type="hidden" id="' + id + '" value="' + esc(value || '') + '">' +
      '<input type="file" accept="image/*" id="' + id + '-file" hidden>' +
    '</div>';
  }

  // Load, scale to maxW and re-encode as a compact JPEG data URL (keeps the
  // local store small). Falls back to the raw data URL if canvas can't be used.
  function scaleImage(file, maxW, ok, err) {
    var reader = new FileReader();
    reader.onerror = function () { err && err(); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { err && err(); };
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          var scale = w > maxW ? maxW / w : 1;
          var cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(w * scale));
          cv.height = Math.max(1, Math.round(h * scale));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          ok(cv.toDataURL('image/jpeg', 0.85));
        } catch (e) { ok(reader.result); }   // e.g. SVG or tainted canvas
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function wireImageField(id) {
    var hidden = el(id), drop = el(id + '-drop'), file = el(id + '-file'),
        pathI = el(id + '-path'), chip = el(id + '-chip');
    if (!hidden || !drop) return;

    function paint() {
      var val = (hidden.value || '').trim();
      var isData = /^data:/.test(val);
      if (val) { drop.style.backgroundImage = 'url("' + val.replace(/"/g, '%22') + '")'; drop.classList.add('has-img'); }
      else { drop.style.backgroundImage = ''; drop.classList.remove('has-img'); }
      if (chip) chip.hidden = !isData;
      if (pathI && document.activeElement !== pathI) pathI.value = isData ? '' : val;   // don't clobber while typing
    }
    function setFromFile(f) {
      if (!f) return;
      if (!/^image\//.test(f.type)) { toast('Bitte eine Bilddatei wählen.'); return; }
      scaleImage(f, 1600, function (url) { hidden.value = url; paint(); toast('Bild übernommen.'); }, function () { toast('Bild konnte nicht gelesen werden.'); });
    }

    drop.addEventListener('click', function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'remove') { e.stopPropagation(); hidden.value = ''; paint(); return; }
      file.click();                                    // click anywhere else = choose / replace
    });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
    file.addEventListener('change', function () { var f = file.files && file.files[0]; file.value = ''; setFromFile(f); });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-drag'); }); });
    ['dragleave', 'dragend'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove('is-drag'); }); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('is-drag'); setFromFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
    if (pathI) pathI.addEventListener('input', function () { hidden.value = pathI.value.trim(); paint(); });
    paint();
  }
  function input(id, val) { return '<input class="admin-input form-control-full" id="' + id + '" value="' + esc(val) + '">'; }
  function numInput(id, val) { return '<input type="number" class="admin-input form-control-full" id="' + id + '" value="' + esc(val) + '" min="0">'; }
  function dateInput(id, val) { return '<input type="date" class="admin-input form-control-full" id="' + id + '" value="' + esc(val || '') + '">'; }
  var CHEV_SVG = '<svg class="msel__chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var CHECK_SVG = '<svg class="msel__check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 6.5"/></svg>';

  // Premium custom select. Falls back to the same value contract as a native
  // <select>: a hidden <input id> carries the value, so collectForm()'s v() is
  // unchanged. `meta` (optional) maps value → { desc, premium } for richer rows.
  function select(id, opts, sel, meta) {
    meta = meta || {};
    var selStr = String(sel);
    var current = opts.filter(function (o) { return String(o[0]) === selStr; })[0] || opts[0];
    var rich = opts.some(function (o) { var m = meta[String(o[0])]; return m && m.desc; });
    function premiumChip(v) { return (meta[String(v)] && meta[String(v)].premium) ? '<span class="msel__premium">Premium</span>' : ''; }

    var optsHTML = opts.map(function (o, i) {
      var v = String(o[0]);
      var isSel = v === selStr;
      var m = meta[v] || {};
      var desc = m.desc ? '<span class="msel__opt-desc">' + esc(m.desc) + '</span>' : '';
      return '<div class="msel__opt' + (isSel ? ' is-selected' : '') + (m.premium ? ' is-premium' : '') + '"' +
        ' id="' + id + '-opt-' + i + '" role="option" data-value="' + esc(o[0]) + '" aria-selected="' + (isSel ? 'true' : 'false') + '">' +
        '<span class="msel__opt-body"><span class="msel__opt-label">' + esc(o[1]) + premiumChip(o[0]) + '</span>' + desc + '</span>' +
        CHECK_SVG + '</div>';
    }).join('');

    return '<div class="msel' + (rich ? ' msel--rich' : '') + '">' +
      '<input type="hidden" id="' + id + '" value="' + esc(sel) + '">' +
      '<button type="button" class="msel__trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="' + id + '-panel">' +
        '<span class="msel__value">' + esc(current[1]) + premiumChip(current[0]) + '</span>' + CHEV_SVG +
      '</button>' +
      '<div class="msel__panel" id="' + id + '-panel" role="listbox" tabindex="-1">' + optsHTML + '</div>' +
    '</div>';
  }

  // ── Custom-select behavior (open/close, keyboard, positioning) ──
  var openMsel = null;
  function closeAllSelects() { if (openMsel) openMsel.close(false); }

  function initSelects(root) {
    var list = (root || document).querySelectorAll('.msel');
    Array.prototype.forEach.call(list, function (msel) {
      if (msel.__wired) return; msel.__wired = true;
      var trigger = msel.querySelector('.msel__trigger');
      var panel = msel.querySelector('.msel__panel');
      var hidden = msel.querySelector('input[type="hidden"]');
      var opts = Array.prototype.slice.call(panel.querySelectorAll('.msel__opt'));
      var activeIdx = Math.max(0, opts.map(function (o) { return o.classList.contains('is-selected'); }).indexOf(true));

      function position() {
        var r = trigger.getBoundingClientRect();
        var gap = 6, margin = 8;
        panel.style.minWidth = r.width + 'px';
        panel.style.left = r.left + 'px';
        var below = window.innerHeight - r.bottom - margin;
        var h = panel.offsetHeight;
        if (below < h && r.top - margin > below) {
          panel.classList.add('is-up');
          panel.style.top = Math.max(margin, r.top - h - gap) + 'px';
        } else {
          panel.classList.remove('is-up');
          panel.style.top = (r.bottom + gap) + 'px';
        }
      }
      function setActive(i) {
        if (i < 0) i = 0; if (i > opts.length - 1) i = opts.length - 1;
        activeIdx = i;
        opts.forEach(function (o, k) { o.classList.toggle('is-active', k === i); });
        panel.setAttribute('aria-activedescendant', opts[i].id);
        opts[i].scrollIntoView({ block: 'nearest' });
      }
      function commit(i) {
        var o = opts[i]; if (!o) return;
        hidden.value = o.getAttribute('data-value');
        opts.forEach(function (n, k) { n.classList.toggle('is-selected', k === i); n.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
        msel.querySelector('.msel__value').innerHTML = o.querySelector('.msel__opt-label').innerHTML;
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
        close(true);
      }
      function open() {
        if (msel.classList.contains('is-open')) return;
        closeAllSelects();
        // Portal to <body>: the drawer has a CSS transform, which would otherwise
        // make this position:fixed panel resolve against the drawer, not the viewport.
        document.body.appendChild(panel);
        position();
        panel.getBoundingClientRect();               // reflow so the entrance transition runs
        msel.classList.add('is-open');
        panel.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        setActive(activeIdx);
        document.addEventListener('mousedown', onDoc, true);
        window.addEventListener('scroll', position, true);
        window.addEventListener('resize', position);
        openMsel = api;
      }
      function close(focus) {
        if (!msel.classList.contains('is-open')) return;
        msel.classList.remove('is-open');
        panel.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        panel.removeAttribute('aria-activedescendant');
        msel.appendChild(panel);                     // return home so it's cleared on re-render
        document.removeEventListener('mousedown', onDoc, true);
        window.removeEventListener('scroll', position, true);
        window.removeEventListener('resize', position);
        openMsel = null;
        if (focus) trigger.focus();
      }
      function onDoc(e) { if (!msel.contains(e.target) && !panel.contains(e.target)) close(false); }

      trigger.addEventListener('click', function () { msel.classList.contains('is-open') ? close(false) : open(); });
      // Focus stays on the trigger while open; drive the listbox from here.
      trigger.addEventListener('keydown', function (e) {
        var isOpen = msel.classList.contains('is-open');
        if (!isOpen) {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
          return;
        }
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIdx + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIdx - 1); }
        else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
        else if (e.key === 'End') { e.preventDefault(); setActive(opts.length - 1); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(activeIdx); }
        else if (e.key === 'Escape') { e.preventDefault(); close(true); }
        else if (e.key === 'Tab') { close(false); }
      });
      opts.forEach(function (o, i) {
        // Pointer: let :hover own the visual and clear the keyboard highlight,
        // so no row stays highlighted once the cursor leaves. Keyboard nav
        // (setActive) re-applies .is-active from where the pointer left off.
        o.addEventListener('mouseenter', function () {
          activeIdx = i;
          opts.forEach(function (n) { n.classList.remove('is-active'); });
          panel.setAttribute('aria-activedescendant', o.id);
        });
        o.addEventListener('click', function () { commit(i); });
      });

      var api = { close: close };
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
