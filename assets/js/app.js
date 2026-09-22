/**
 * Metzler SeasonalCampaignSystem — App controller
 * Loads the campaign calendar, resolves the live campaign for the effective
 * date, and renders the seasonal storefront. A ?date=YYYY-MM-DD override (and
 * the on-screen demo panel) let you preview any point in the year.
 */
(function () {
  'use strict';

  var E = window.CampaignEngine;
  var P = window.ProductProvider;
  var GARANTIE_URL = 'https://edelstahl-tuerklingel.de/metzler-garantieerklaerung';

  var CATEGORY_META = {
    'briefkasten':        { label: 'Briefkästen',        url: 'https://edelstahl-tuerklingel.de/briefkasten' },
    'paketboxen':         { label: 'Paketboxen',         url: 'https://edelstahl-tuerklingel.de/paketboxen' },
    'muelltonnenbox':     { label: 'Mülltonnenboxen',    url: 'https://edelstahl-tuerklingel.de/muelltonnenbox' },
    'tuersprechanlagen':  { label: 'Sprechanlagen',      url: 'https://edelstahl-tuerklingel.de/tuersprechanlagen' },
    'sicherheitstechnik': { label: 'Sicherheitstechnik', url: 'https://edelstahl-tuerklingel.de/sicherheitstechnik' },
    'tuerklingel':        { label: 'Türklingeln',        url: 'https://edelstahl-tuerklingel.de/tuerklingel' },
    'beleuchtung':        { label: 'Außenleuchten',      url: 'https://edelstahl-tuerklingel.de/beleuchtung' },
    'hausnummern-schilder-schriftzuege': { label: 'Hausnummern & Schriftzüge', url: 'https://edelstahl-tuerklingel.de/hausnummern-schilder-schriftzuege' },
    'garten':             { label: 'Garten',             url: 'https://edelstahl-tuerklingel.de/garten' }
  };

  // ── tiny helpers ──────────────────────────────────────
  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  }); }

  var ICON_BOX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4v10l-9 4-9-4V7z"/><path d="M3 7l9 4 9-4M12 21V11"/></svg>';
  var ICON_TAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0l-6.4-6.4a2 2 0 0 1-.6-1.4V5a2 2 0 0 1 2-2h7.4a2 2 0 0 1 1.4.6l6.2 6.2a2 2 0 0 1 0 2.6z"/><circle cx="8.5" cy="8.5" r="1.2"/></svg>';

  // ── effective date ────────────────────────────────────
  // Persist the previewed date so the selection carries to other pages
  // (e.g. the homepage banner) within the same origin.
  var PREVIEW_KEY = 'metzler.previewDate';
  function isValidDate(s) { return s && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function getEffectiveDate() {
    var q = new URLSearchParams(location.search).get('date');
    if (isValidDate(q)) { try { localStorage.setItem(PREVIEW_KEY, q); } catch (e) {} return q; }
    try { var s = localStorage.getItem(PREVIEW_KEY); if (isValidDate(s)) return s; } catch (e) {}
    var t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  }
  function isSale(c) {
    return c.id === 'black-month' || (c.discountRule && c.discountRule.type === 'percent' && c.discountRule.scope === 'sitewide');
  }
  function isBF(c) { return c && c.template === 'blackfriday'; }
  function fmtDate(iso) {
    var p = iso.split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }

  // ── Black Month template (brand-authored components) ──
  function renderBlackfriday(c, host, top) {
    var pct = (c.discountRule && c.discountRule.type === 'percent') ? c.discountRule.value : null;
    var offer = pct
      ? 'Bis&nbsp;zu <span class="num">' + pct + '&thinsp;%</span> reduziert<span class="bf-hero__offer-tail"> – auf das gesamte Sortiment</span>'
      : '';
    var imgD = c.heroImage || 'assets/img/bf-hero-desktop.png';
    var imgM = c.heroImageMobile || imgD;
    host.innerHTML =
      '<div class="bf-hero__primary container">' +
        '<div class="bf-hero__copy-col"><div class="bf-hero__copy">' +
          '<p class="bf-hero__eyebrow">' + esc(c.eyebrow || c.name) + '</p>' +
          '<h1 class="bf-hero__title">' + esc(c.heroHeadline || c.name) + '</h1>' +
          (offer ? '<p class="bf-hero__offer">' + offer + '</p>' : '') +
          '<p class="bf-hero__meta"><b>Kauf auf Rechnung</b> · Versand ab 99&nbsp;€ gratis</p>' +
          '<div class="bf-hero__ctas">' +
            '<a class="bf-hero__cta" href="#products">Jetzt entdecken</a>' +
          '</div>' +
        '</div></div>' +
        '<div class="bf-hero__media" aria-hidden="true"><picture>' +
          '<source media="(max-width: 47.5rem)" srcset="' + esc(imgM) + '">' +
          '<img class="bf-hero__photo" src="' + esc(imgD) + '" alt="">' +
        '</picture></div>' +
      '</div>';

    var barLabel = c.barLabel || c.name;
    top.innerHTML =
      '<div class="bf-bar" role="region" aria-label="' + esc(barLabel) + '"><div class="container bf-bar__inner">' +
        '<span class="bf-bar__label"><span class="bf-bar__dot" aria-hidden="true"></span>' + esc(barLabel) + '</span>' +
        '<span class="bf-bar__msg">' + esc(c.barMessage || c.promoStrip || '') + '</span>' +
        '<span class="bf-bar__timer" id="bfTimer" aria-label="Verbleibende Zeit">' +
          '<span class="bf-seg"><b data-bf="d">–</b><i>Tage</i></span>' +
          '<span class="bf-seg"><b data-bf="h">–</b><i>Std</i></span>' +
          '<span class="bf-seg"><b data-bf="m">–</b><i>Min</i></span>' +
          '<span class="bf-seg"><b data-bf="s">–</b><i>Sek</i></span>' +
        '</span>' +
        '<a class="bf-bar__cta" href="#products">Zu den Angeboten</a>' +
      '</div></div>';

    startCountdown(c);
  }

  var _bfInterval = null;
  function stopCountdown() { if (_bfInterval) { clearInterval(_bfInterval); _bfInterval = null; } }
  function startCountdown(c) {
    stopCountdown();
    var el = document.getElementById('bfTimer');
    if (!el || !c.endDate) return;
    var out = {
      d: el.querySelector('[data-bf="d"]'), h: el.querySelector('[data-bf="h"]'),
      m: el.querySelector('[data-bf="m"]'), s: el.querySelector('[data-bf="s"]')
    };
    // Count to the end of the last active day, projected into the effective year
    // (recurring). Uses a simulated "now" so the ?date preview stays coherent.
    var eff = E.toDate(getEffectiveDate());
    var endMD = E.toDate(c.endDate);
    var tgt = new Date(eff.getFullYear(), endMD.getMonth(), endMD.getDate() + 1);
    if (tgt < eff) tgt = new Date(eff.getFullYear() + 1, endMD.getMonth(), endMD.getDate() + 1);
    var real = new Date();
    var base = new Date(eff.getFullYear(), eff.getMonth(), eff.getDate(), real.getHours(), real.getMinutes(), real.getSeconds()).getTime();
    var startedAt = Date.now();
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function tick() {
      var vnow = base + (Date.now() - startedAt);
      var diff = tgt.getTime() - vnow;
      if (diff < 0) diff = 0;
      var s = Math.floor(diff / 1000);
      out.d.textContent = Math.floor(s / 86400);
      out.h.textContent = pad(Math.floor(s % 86400 / 3600));
      out.m.textContent = pad(Math.floor(s % 3600 / 60));
      out.s.textContent = pad(s % 60);
    }
    tick();
    _bfInterval = setInterval(tick, 1000);
  }

  // ── renderers ─────────────────────────────────────────
  function renderHero(c) {
    var host = $('#hero');
    var top = $('#campaign-top');
    // Brand-authored Black Month template takes over the hero + top bar.
    if (isBF(c)) { host.classList.add('bf-hero'); host.classList.remove('is-sale'); renderBlackfriday(c, host, top); return; }
    host.classList.remove('bf-hero');
    top.innerHTML = '';
    stopCountdown();

    var actionCat = (c.targetCategories && c.targetCategories[0] && CATEGORY_META[c.targetCategories[0]]);
    var primaryHref = actionCat ? actionCat.url : 'https://edelstahl-tuerklingel.de';
    // Hero image: a campaign's own image if set; otherwise (for now) the Black Month
    // lifestyle image + its mobile crop as the placeholder for every banner.
    var imgD = c.heroImage || 'assets/img/bf-hero-desktop.png';
    var imgM = c.heroImageMobile || (c.heroImage ? imgD : 'assets/img/bf-hero-mobile.png');

    // Offer line mirrors the Black Month hero: "Bis zu 15 % reduziert – auf Sicherheitstechnik".
    var offer = '';
    var d = c.discountRule;
    if (d) {
      var scope = discountScopeLabel(c);
      var tail = scope ? '<span class="hero__offer-tail"> – ' + esc(scope) + '</span>' : '';
      if (d.type === 'percent') offer = 'Bis&nbsp;zu <span class="num">' + esc(d.value) + '&thinsp;%</span> reduziert' + tail;
      else { var lbl = E.formatDiscount(c); if (lbl) offer = '<span class="num">' + esc(lbl) + '</span>' + tail; }
    }

    // Same structure as the Black Month copy column: eyebrow, title, offer, meta, CTA + text link.
    host.innerHTML =
      '<div class="hero__frame container">' +
        '<div class="hero__copy-col"><div class="hero__copy">' +
          '<p class="hero__eyebrow">' + esc(c.eyebrow || c.name) + '</p>' +
          '<h1 class="hero__title">' + esc(c.heroHeadline || c.name) + '</h1>' +
          (offer ? '<p class="hero__offer">' + offer + '</p>' : '') +
          '<p class="hero__meta"><b>Kauf auf Rechnung</b> · Versand ab 99&nbsp;€ gratis</p>' +
          '<div class="hero__ctas">' +
            '<a class="hero__cta" href="' + primaryHref + '">Jetzt entdecken</a>' +
            '<a class="hero__link" href="https://edelstahl-tuerklingel.de">Alle Kategorien <span aria-hidden="true">→</span></a>' +
          '</div>' +
        '</div></div>' +
        '<div class="hero__media" aria-hidden="true"><picture>' +
          '<source media="(max-width: 47.5rem)" srcset="' + esc(imgM) + '">' +
          '<img class="hero__photo" src="' + esc(imgD) + '" alt="">' +
        '</picture></div>' +
      '</div>';
  }


  function discountScopeLabel(c) {
    var r = c.discountRule; if (!r) return '';
    if (r.scope === 'sitewide') return 'auf das gesamte Sortiment';
    var slug = String(r.scope).split(',')[0];
    var meta = CATEGORY_META[slug];
    return meta ? 'auf ' + meta.label : '';
  }

  var DEFAULT_SUBLINE = 'Briefkästen, Sprechanlagen, Türklingeln und mehr — in Premium-Qualität, individuell graviert. Designed in Germany.';
  function seasonSubline(c) {
    // Customer-facing copy only. `rationale` is internal and must never surface.
    return c.promoStrip || DEFAULT_SUBLINE;
  }

  function daysBetweenOrdinals(today, end) {
    var y = today.getFullYear();
    var e = new Date(y, end.getMonth(), end.getDate());
    if (e < today) e = new Date(y + 1, end.getMonth(), end.getDate());
    return Math.round((e - today) / 86400000);
  }

  // Top bar mirrors the Black Month bar: [● label]  message  |  live timer  |  CTA.
  // Colours come from the campaign theme; the Black Month template owns its own bar.
  function renderPromoStrip(c) {
    var host = $('#promo-strip');
    if (isBF(c) || c.isFallback) { host.hidden = true; return; }
    host.hidden = false;
    var seg = function (k, lbl) { return '<span class="promo-strip__seg"><b data-bf="' + k + '">–</b><i>' + lbl + '</i></span>'; };
    host.innerHTML =
      '<div class="container promo-strip__inner" role="region" aria-label="' + esc(c.name) + '">' +
        '<span class="promo-strip__label"><span class="promo-strip__dot" aria-hidden="true"></span><span class="promo-strip__label-text">' + esc(c.name) + '</span></span>' +
        (c.promoStrip ? '<span class="promo-strip__msg" title="' + esc(c.promoStrip) + '">' + esc(c.promoStrip) + '</span>' : '') +
        (c.endDate ? '<span class="promo-strip__timer" id="bfTimer" aria-label="Verbleibende Zeit">' + seg('d', 'Tage') + seg('h', 'Std') + seg('m', 'Min') + seg('s', 'Sek') + '</span>' : '') +
        '<a class="promo-strip__cta" href="#products">Zu den Angeboten</a>' +
      '</div>';
    startCountdown(c);
  }


  function productCard(p, c) {
    var discount = E.formatDiscount(c);
    var isPercent = !!(c.discountRule && c.discountRule.type === 'percent');
    var badgeCls = isBF(c) ? 'is-bf' : (isPercent ? '' : 'product-card__badge--benefit');
    var badge = discount ? '<span class="product-card__badge ' + badgeCls + '">' + esc(discount) + '</span>' : '';
    var cat = p.categories && p.categories[0] ? p.categories[0] : (CATEGORY_META[p.categorySlug] || {}).label || '';
    var priceHtml = p.priceFrom != null
      ? '<span class="product-card__price-prefix">ab</span><span class="product-card__price">' + esc(P.formatPrice(p.priceFrom)) + '</span>'
      : '';
    var media = p.image
      ? '<img class="product-card__img" src="' + esc(p.image) + '" alt="' + esc(p.name) + '" onerror="this.parentNode.classList.add(\'is-empty\');this.remove();">'
      : ICON_BOX;
    return '<a class="product-card" href="' + esc(p.url) + '">' +
      '<div class="product-card__media' + (p.image ? '' : ' is-empty') + '">' + badge + media + '</div>' +
      '<div class="product-card__body">' +
        '<span class="product-card__cat">' + esc(cat) + '</span>' +
        '<span class="product-card__name">' + esc(p.name) + '</span>' +
        '<span class="product-card__foot">' + priceHtml + '</span>' +
      '</div>' +
    '</a>';
  }

  function renderProducts(c, products) {
    var section = $('#products');
    var grid = $('#product-grid');
    var intro = $('#products-intro');
    grid.classList.remove('is-loading');

    intro.innerHTML = '';
    intro.hidden = true;

    if (products.length) {
      grid.innerHTML = products.map(function (p) { return productCard(p, c); }).join('');
      grid.hidden = false;
    } else {
      grid.hidden = true;
    }

    if (!products.length) {
      grid.hidden = false; grid.innerHTML = '<p class="empty-note">Für diese Aktion sind aktuell keine Produkte hinterlegt.</p>';
    }
    section.hidden = false;
  }

  function renderSecondary(list) {
    var section = $('#secondary');
    var host = $('#secondary-cards');
    if (!section || !host) return;               // section removed from the dashboard
    if (!list.length) { section.hidden = true; return; }
    host.innerHTML = list.map(function (c) {
      var d = E.formatDiscount(c);
      var cat = c.targetCategories && c.targetCategories[0] && CATEGORY_META[c.targetCategories[0]];
      return '<div class="promo-card">' +
        (d ? '<span class="promo-card__badge">' + esc(d) + '</span>' : '') +
        '<span class="promo-card__title">' + esc(c.name) + '</span>' +
        '<span class="promo-card__text">' + esc(c.promoStrip || '') + '</span>' +
        '<a class="promo-card__link" href="' + (cat ? cat.url : '#') + '">Mehr erfahren →</a>' +
      '</div>';
    }).join('');
    section.hidden = false;
  }

  // ── demo panel ────────────────────────────────────────
  function ddmm(iso) { var p = String(iso).split('-'); return p[2] + '.' + p[1] + '.'; }

  function setupDemo(campaigns, active) {
    var input = $('#demo-date');
    var activeEl = $('#demo-active');
    var activeId = active && active.id;
    var activeLabel = (active ? active.name : 'Standard') + (active && active.isFallback ? ' (Standard)' : '');
    input.value = getEffectiveDate();
    activeEl.innerHTML = 'Aktiv: <b>' + esc(activeLabel) + '</b>';
    var headSub = $('#demo-head-sub'); if (headSub) headSub.textContent = active ? active.name : 'Standard';

    // Reflect the selected/active campaign in the Schnellwahl trigger.
    var jumpLabel = $('#demo-jump-label');
    if (jumpLabel) {
      if (active && !active.isFallback) { jumpLabel.textContent = active.name; jumpLabel.classList.add('is-selected'); }
      else { jumpLabel.textContent = 'Zu Kampagne springen…'; jumpLabel.classList.remove('is-selected'); }
    }

    // Carry the previewed date to the homepage so its banner matches the selection.
    var eff = getEffectiveDate();
    document.querySelectorAll('a[href="home.html"], a[href^="home.html?"]').forEach(function (a) {
      a.setAttribute('href', 'home.html?date=' + eff);
    });

    function go(dateStr) { try { localStorage.setItem(PREVIEW_KEY, dateStr); } catch (e) {} location.search = '?date=' + dateStr; }
    input.addEventListener('change', function () { if (input.value) go(input.value); });

    // Custom quick-jump dropdown (native <select> popups don't render reliably
    // inside embedded webviews, so we build our own). Each item previews the
    // campaign's window + discount, and the currently-active one is marked.
    var dd = $('#demo-jump');
    var btn = $('#demo-jump-btn');
    var list = $('#demo-jump-list');
    var items = campaigns
      .filter(function (c) { return !c.isFallback && c.startDate; })
      .sort(function (a, b) { return E.monthDayOrdinal(E.toDate(a.startDate)) - E.monthDayOrdinal(E.toDate(b.startDate)); });

    var GO = '<svg class="demo-opt__go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>';
    list.innerHTML = '<li class="demo-dd__hd" aria-hidden="true">Zu Kampagne springen</li>' + items.map(function (c) {
      var disc = E.formatDiscount(c);
      var chipCls = isBF(c) ? 'is-bf' : (isSale(c) ? 'is-sale' : '');
      var isCur = c.id === activeId;
      var range = c.startDate ? ddmm(c.startDate) + '–' + ddmm(c.endDate) : '';
      return '<li class="demo-opt' + (isCur ? ' is-current' : '') + (c.disabled ? ' is-paused' : '') + '" role="option" aria-selected="' + (isCur ? 'true' : 'false') + '" data-date="' + jumpDate(c.startDate) + '">' +
        '<span class="demo-opt__main">' +
          '<span class="demo-opt__name-row">' +
            '<span class="demo-opt__name">' + esc(c.name) + '</span>' +
            (isCur ? '<span class="demo-opt__now">Aktiv</span>' : (c.disabled ? '<span class="demo-opt__paused">Pausiert</span>' : '')) +
          '</span>' +
          '<span class="demo-opt__meta">' +
            '<span class="demo-opt__range">' + esc(range) + (c.recurring ? ' · jährl.' : '') + '</span>' +
            (disc ? '<span class="demo-opt__chip ' + chipCls + '">' + esc(disc) + '</span>' : '') +
          '</span>' +
        '</span>' + GO +
      '</li>';
    }).join('');

    var opts = function () { return [].slice.call(list.querySelectorAll('.demo-opt')); };
    var focusIdx = -1;
    function centerOn(el) {
      // Manual centering (reliable inside a fixed-position scroll container).
      list.scrollTop = el.offsetTop - (list.clientHeight / 2) + (el.offsetHeight / 2);
    }
    function setFocus(i) {
      var o = opts(); if (!o.length) return;
      focusIdx = (i + o.length) % o.length;
      o.forEach(function (el, n) { el.classList.toggle('is-focused', n === focusIdx); });
      var el = o[focusIdx], top = el.offsetTop, bot = top + el.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top - 4;
      else if (bot > list.scrollTop + list.clientHeight) list.scrollTop = bot - list.clientHeight + 4;
    }
    function positionList() {
      // Anchor the fixed menu above the trigger (panel sits at viewport bottom).
      var r = btn.getBoundingClientRect();
      list.style.width = r.width + 'px';
      list.style.left = r.left + 'px';
      list.style.bottom = (window.innerHeight - r.top + 6) + 'px';
    }
    function openDD() {
      positionList();
      dd.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true');
      var o = opts();
      var cur = o.findIndex(function (el) { return el.classList.contains('is-current'); });
      focusIdx = cur;
      o.forEach(function (el, n) { el.classList.toggle('is-focused', n === cur); });
      // Land on the active campaign instead of the top of the list.
      if (cur >= 0) centerOn(o[cur]); else list.scrollTop = 0;
    }
    function closeDD() { dd.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); focusIdx = -1; opts().forEach(function (el) { el.classList.remove('is-focused'); }); }

    btn.addEventListener('click', function (e) { e.stopPropagation(); if (dd.classList.contains('is-open')) closeDD(); else openDD(); });
    list.addEventListener('click', function (e) { var li = e.target.closest('li[data-date]'); if (li) go(li.getAttribute('data-date')); });
    document.addEventListener('click', function (e) { if (!dd.contains(e.target) && !list.contains(e.target)) closeDD(); });
    window.addEventListener('resize', function () { if (dd.classList.contains('is-open')) positionList(); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); if (!dd.classList.contains('is-open')) openDD(); setFocus(e.key === 'ArrowUp' ? focusIdx - 1 : (focusIdx < 0 ? 0 : focusIdx + 1));
      }
    });
    document.addEventListener('keydown', function (e) {
      if (!dd.classList.contains('is-open')) return;
      if (e.key === 'Escape') { closeDD(); btn.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setFocus(focusIdx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setFocus(focusIdx - 1); }
      else if (e.key === 'Home') { e.preventDefault(); setFocus(0); }
      else if (e.key === 'End') { e.preventDefault(); setFocus(opts().length - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); var o = opts()[focusIdx]; if (o) go(o.getAttribute('data-date')); }
    });

    // Collapse toggle (animated pill ⇄ card)
    var bar = $('#demo-bar');
    // On small screens the panel starts collapsed so it never covers the page.
    if (window.matchMedia && window.matchMedia('(max-width: 48rem)').matches) {
      bar.classList.add('is-collapsed');
      $('#demo-collapse').setAttribute('aria-expanded', 'false');
    }
    $('#demo-collapse').addEventListener('click', function () {
      var collapsed = bar.classList.toggle('is-collapsed');
      $('#demo-collapse').setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      if (collapsed) closeDD();
    });
  }
  function jumpDate(startIso) {
    // Return start month/day in a fixed reference year (2026), +1 day.
    var d = E.toDate(startIso);
    var ref = new Date(2026, d.getMonth(), d.getDate() + 1);
    return ref.getFullYear() + '-' + String(ref.getMonth() + 1).padStart(2, '0') + '-' + String(ref.getDate()).padStart(2, '0');
  }

  // ── boot ──────────────────────────────────────────────
  function boot() {
    // Header sticky/scroll behaviour is handled by the homepage header script + CSS.
    window.CampaignStore.load()
      .then(function (payload) {
        var campaigns = payload.campaigns || [];
        var date = getEffectiveDate();
        var active = E.resolveActiveCampaign(campaigns, date);
        var secondary = E.getSecondaryCampaigns(campaigns, date);

        if (!active) { active = { name: 'Standard', heroHeadline: 'Original Metzler Qualität', targetCategories: [] }; }

        document.title = (active.barLabel || active.name) + ' — Metzler';
        // Seasonal palette: one theme per campaign (see campaign.css "Campaign themes").
        document.body.setAttribute('data-camp-theme', (active.theme && active.theme.accent) || 'brand-default');
        renderHero(active);
        renderPromoStrip(active);
        renderSecondary(secondary);
        setupDemo(campaigns, active);

        // The evergreen fallback has no seasonal focus — show bestsellers instead.
        var showcase = active;
        if (active.isFallback || !(active.targetCategories && active.targetCategories.length)) {
          showcase = Object.assign({}, active, { targetCategories: ['briefkasten', 'tuersprechanlagen', 'paketboxen'] });
        }

        $('#product-grid').classList.add('is-loading');
        P.getProductsForCampaign(showcase, 8).then(function (products) {
          renderProducts(active, products);
        });
      })
      .catch(function (err) {
        console.error('[app] failed to load campaigns', err);
        $('#hero').innerHTML = '<div class="container"><h1 class="hero__title">Kampagnen konnten nicht geladen werden</h1><p class="hero__sub">Bitte sicherstellen, dass die Datendateien vorhanden sind (ggf. <code>python tools/build-data.py</code> ausführen).</p></div>';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
