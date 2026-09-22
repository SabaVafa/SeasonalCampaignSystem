/**
 * Homepage seasonal-campaign integration.
 * Resolves the active campaign (same engine/store as the storefront) and:
 *   1. injects an announcement bar at the very top (Black Month countdown bar,
 *      or a teal promo bar for other campaigns), and
 *   2. REPLACES the homepage hero banner (.hero-banner) with the campaign's own
 *      banner — the Black Month lifestyle hero, or a seasonal variant.
 * When nothing is active (evergreen) the homepage keeps its default XDM10 hero.
 * "Zu den Angeboten" / "Jetzt entdecken" link through to the campaign landing.
 */
(function () {
  'use strict';
  var E = window.CampaignEngine, S = window.CampaignStore;
  if (!E || !S) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function getDate() {
    var q = new URLSearchParams(location.search).get('date');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    // Fall back to the date selected on the campaign landing (same origin).
    try { var s = localStorage.getItem('metzler.previewDate'); if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s; } catch (e) {}
    var t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  }
  var OFFERS_URL = 'index.html?date=' + getDate();

  // Prototype nav: an always-on chip linking back to the campaign dashboard
  // (storefront), so team members can hop between the homepage mockup and the
  // dashboard while reviewing how the active components look on the home screen.
  injectDashboardLink();
  function injectDashboardLink() {
    if (document.getElementById('proto-dash-link')) return;
    var style = document.createElement('style');
    style.textContent =
      '#proto-dash-link{position:fixed;right:1rem;bottom:1rem;z-index:2000;display:inline-flex;align-items:center;gap:0.5rem;' +
      'padding:0.5625rem 0.9375rem;border-radius:2rem;background:#0f3b38;color:#fff;' +
      'font:600 0.8125rem/1 system-ui,-apple-system,sans-serif;text-decoration:none;' +
      'box-shadow:0 0.375rem 1.25rem rgba(0,0,0,0.28);border:0.0625rem solid rgba(255,255,255,0.16);' +
      'transition:transform .18s ease,background .18s ease;}' +
      '#proto-dash-link:hover{background:#12514c;transform:translateY(-0.0625rem);}' +
      '#proto-dash-link svg{width:1rem;height:1rem;flex:none;}' +
      '@media(max-width:35rem){#proto-dash-link .proto-dash-label{display:none;}#proto-dash-link{padding:0.625rem;}}';
    document.head.appendChild(style);
    var a = document.createElement('a');
    a.id = 'proto-dash-link';
    a.href = 'index.html?date=' + getDate();
    a.setAttribute('aria-label', 'Zurück zum Kampagnen-Dashboard');
    a.innerHTML =
      '<span class="proto-dash-label">Zurück zum Dashboard</span>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    document.body.appendChild(a);
  }

  S.load().then(function (payload) {
    var c = E.resolveActiveCampaign(payload.campaigns || [], getDate());
    if (!c || c.isFallback) return;                 // keep the default homepage

    var top = document.getElementById('campaign-top');
    if (top) {
      if (c.template === 'blackfriday') renderBFBar(c, top);
      else if (c.promoStrip) renderPromo(c, top);
    }

    var hero = document.querySelector('.hero-banner');
    if (hero) {
      if (c.template === 'blackfriday') hero.outerHTML = bfHeroHTML(c);
      else replaceHeroCopy(c, hero);
    }
    updateCategoryBadges(c);
    if (c.template === 'blackfriday') startCountdown(c);   // (re)bind after hero swap
  });

  // ── category-grid discount badges ──
  var TITLE_TO_SLUG = {
    'Mülltonnenboxen': 'muelltonnenbox', 'Sprechanlagen': 'tuersprechanlagen', 'Hochbeete': 'garten',
    'Paketboxen': 'paketboxen', 'Briefkästen': 'briefkasten', 'Türklingeln': 'tuerklingel',
    'Hausnummern': 'hausnummern-schilder-schriftzuege', 'Außenleuchten': 'beleuchtung',
    'Funkklingeln': 'tuerklingel', 'Briefkastenschilder': 'briefkasten', 'Schriftzüge': 'hausnummern-schilder-schriftzuege'
  };
  function updateCategoryBadges(c) {
    var r = c.discountRule;
    var cards = document.querySelectorAll('.cat-card');
    if (!cards.length) return;
    var sitewide = r && r.scope === 'sitewide';
    var targets = c.targetCategories || [];
    var bf = c.template === 'blackfriday';
    var pct = (r && r.type === 'percent') ? r.value : null;
    var mainText = pct != null ? (bf ? '−' : '') + pct + ' %' : (E.formatDiscount(c) || '');
    var subText = bf ? (c.barLabel || c.name) : 'Rabatt';

    cards.forEach(function (card) {
      var existing = card.querySelector('.cat-card__discount');
      if (existing) existing.remove();                 // clear any hardcoded badge
      if (!r || !mainText) return;
      var titleEl = card.querySelector('.cat-card__title');
      var title = titleEl ? titleEl.textContent.trim() : '';
      var slug = TITLE_TO_SLUG[title];
      var show = sitewide || (slug && targets.indexOf(slug) !== -1);
      if (!show) return;
      var badge = document.createElement('span');
      badge.className = 'cat-card__discount' + (bf ? ' cat-card__discount--bf' : '');
      badge.innerHTML = esc(mainText) + '<span>' + esc(subText) + '</span>';
      card.appendChild(badge);                          // absolute-positioned → order-independent
    });
  }

  // ── top announcement bar ──
  function renderPromo(c, top) {
    top.innerHTML =
      '<div class="home-promo-bar"><div class="container home-promo-bar__inner">' +
        '<span class="home-promo-bar__msg">' + esc(c.promoStrip) + '</span>' +
        '<a class="home-promo-bar__cta" href="' + OFFERS_URL + '">Zu den Angeboten →</a>' +
      '</div></div>';
  }
  function renderBFBar(c, top) {
    var label = c.barLabel || c.name;
    top.innerHTML =
      '<div class="bf-bar" role="region" aria-label="' + esc(label) + '"><div class="container bf-bar__inner">' +
        '<span class="bf-bar__label"><span class="bf-bar__dot" aria-hidden="true"></span>' + esc(label) + '</span>' +
        '<span class="bf-bar__msg">' + esc(c.barMessage || c.promoStrip || '') + '</span>' +
        '<span class="bf-bar__timer" id="bfTimer" aria-label="Verbleibende Zeit">' +
          '<span class="bf-seg"><b data-bf="d">–</b><i>Tage</i></span>' +
          '<span class="bf-seg"><b data-bf="h">–</b><i>Std</i></span>' +
          '<span class="bf-seg"><b data-bf="m">–</b><i>Min</i></span>' +
          '<span class="bf-seg"><b data-bf="s">–</b><i>Sek</i></span>' +
        '</span>' +
        '<a class="bf-bar__cta" href="' + OFFERS_URL + '">Zu den Angeboten</a>' +
      '</div></div>';
  }

  // ── hero banner replacement ──
  function bfHeroHTML(c) {
    var pct = (c.discountRule && c.discountRule.type === 'percent') ? c.discountRule.value : null;
    var offer = pct
      ? 'Bis&nbsp;zu <span class="num">' + pct + '&thinsp;%</span> reduziert<span class="bf-hero__offer-tail"> – auf das gesamte Sortiment</span>'
      : '';
    var imgD = c.heroImage || 'assets/img/bf-hero-desktop.png';
    var imgM = c.heroImageMobile || imgD;
    return '<section class="bf-hero" aria-label="' + esc(c.name) + '">' +
      '<div class="bf-hero__primary container">' +
        '<div class="bf-hero__copy-col"><div class="bf-hero__copy">' +
          '<p class="bf-hero__eyebrow">' + esc(c.eyebrow || c.name) + '</p>' +
          '<h1 class="bf-hero__title">' + esc(c.heroHeadline || c.name) + '</h1>' +
          (offer ? '<p class="bf-hero__offer">' + offer + '</p>' : '') +
          '<p class="bf-hero__meta"><b>Kauf auf Rechnung</b> · Versand ab 99&nbsp;€ gratis</p>' +
          '<div class="bf-hero__ctas"><a class="bf-hero__cta" href="' + OFFERS_URL + '">Jetzt entdecken</a></div>' +
        '</div></div>' +
        '<div class="bf-hero__media" aria-hidden="true"><picture>' +
          '<source media="(max-width: 47.5rem)" srcset="' + esc(imgM) + '">' +
          '<img class="bf-hero__photo" src="' + esc(imgD) + '" alt="">' +
        '</picture></div>' +
      '</div>' +
    '</section>';
  }

  function replaceHeroCopy(c, hero) {
    var t = hero.querySelector('.hero-banner__title'); if (t) t.textContent = c.heroHeadline || c.name;
    var b = hero.querySelector('.hero-banner__body'); if (b) b.textContent = c.promoStrip || '';
    var chips = hero.querySelector('.hero-banner__chips');
    if (chips) {
      var d = E.formatDiscount(c);
      chips.innerHTML = d ? '<span class="hero-chip"><span class="hero-chip__pre">' + esc(d) + ' · auf das gesamte Sortiment</span></span>' : '';
    }
    var ctas = hero.querySelector('.hero-banner__ctas');
    if (ctas) ctas.innerHTML = '<a class="btn btn--primary hero-banner__cta" href="' + OFFERS_URL + '">Zu den Angeboten</a>';
    hero.setAttribute('aria-label', c.name);
  }

  // ── Black Month countdown ──
  function startCountdown(c) {
    var el = document.getElementById('bfTimer');
    if (!el || !c.endDate) return;
    var out = {
      d: el.querySelector('[data-bf="d"]'), h: el.querySelector('[data-bf="h"]'),
      m: el.querySelector('[data-bf="m"]'), s: el.querySelector('[data-bf="s"]')
    };
    var eff = E.toDate(getDate());
    var endMD = E.toDate(c.endDate);
    var tgt = new Date(eff.getFullYear(), endMD.getMonth(), endMD.getDate() + 1);
    if (tgt < eff) tgt = new Date(eff.getFullYear() + 1, endMD.getMonth(), endMD.getDate() + 1);
    var real = new Date();
    var base = new Date(eff.getFullYear(), eff.getMonth(), eff.getDate(), real.getHours(), real.getMinutes(), real.getSeconds()).getTime();
    var startedAt = Date.now();
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function tick() {
      var diff = tgt.getTime() - (base + (Date.now() - startedAt));
      if (diff < 0) diff = 0;
      var s = Math.floor(diff / 1000);
      out.d.textContent = Math.floor(s / 86400);
      out.h.textContent = pad(Math.floor(s % 86400 / 3600));
      out.m.textContent = pad(Math.floor(s % 3600 / 60));
      out.s.textContent = pad(s % 60);
    }
    tick();
    setInterval(tick, 1000);
  }
})();
