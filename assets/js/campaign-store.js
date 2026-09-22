/**
 * Metzler SeasonalCampaignSystem — Campaign Store
 * -----------------------------------------------
 * Shared persistence used by BOTH the storefront and the admin UI.
 *
 * There is no backend, so authored campaigns live in localStorage as an
 * override on top of the shipped seed (data/campaigns.seed.json). The admin
 * edits the override; the storefront reads it so changes preview instantly.
 * Export writes a JSON file the developer can drop back into data/ to make an
 * edit permanent.
 */
(function (global) {
  'use strict';

  var LS_KEY = 'metzler.campaigns.v1';
  var SEED_JS = 'data/campaigns.seed.js';
  var SEED_JSON = 'data/campaigns.seed.json';
  var seedCache = null;

  // Load a local script once. Works over file:// AND http:// (unlike fetch,
  // which browsers block on file://), so the app runs opened directly from disk.
  var _scripts = {};
  function loadScriptOnce(src) {
    if (_scripts[src]) return _scripts[src];
    _scripts[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('script failed: ' + src)); };
      document.head.appendChild(s);
    });
    return _scripts[src];
  }

  function loadSeed() {
    if (seedCache) return Promise.resolve(seedCache);
    if (window.__CAMPAIGNS_SEED__) { seedCache = window.__CAMPAIGNS_SEED__; return Promise.resolve(seedCache); }
    return loadScriptOnce(SEED_JS)
      .then(function () {
        if (window.__CAMPAIGNS_SEED__) { seedCache = window.__CAMPAIGNS_SEED__; return seedCache; }
        throw new Error('seed global missing');
      })
      .catch(function () {
        return fetch(SEED_JSON).then(function (r) { return r.json(); }).then(function (d) { seedCache = d; return d; });
      });
  }

  function readOverride() {
    try { var s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; }
    catch (e) { return null; }
  }
  function hasOverride() { return !!readOverride(); }

  /**
   * Resolve the working campaign set.
   * @returns {Promise<{campaigns:Array, meta:Object, source:'local'|'seed', savedAt:?string}>}
   */
  function load() {
    var ov = readOverride();
    return loadSeed().then(function (seed) {
      if (ov && ov.campaigns) {
        return { campaigns: ov.campaigns, meta: seed.meta, source: 'local', savedAt: ov.savedAt || null };
      }
      return { campaigns: (seed.campaigns || []).map(clone), meta: seed.meta, source: 'seed', savedAt: null };
    });
  }

  function save(campaigns) {
    var payload = { campaigns: campaigns, savedAt: new Date().toISOString() };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    return payload;
  }

  function reset() { localStorage.removeItem(LS_KEY); }

  /** Full export object matching the seed file's shape (meta + campaigns). */
  function exportPayload() {
    return load().then(function (state) {
      return { meta: state.meta, campaigns: state.campaigns };
    });
  }

  function importCampaigns(json) {
    var data = typeof json === 'string' ? JSON.parse(json) : json;
    var campaigns = Array.isArray(data) ? data : data.campaigns;
    if (!Array.isArray(campaigns)) throw new Error('Kein gültiges Kampagnen-Array gefunden.');
    return save(campaigns);
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function slugify(s) {
    return String(s || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || ('kampagne-' + Date.now());
  }

  var api = {
    LS_KEY: LS_KEY,
    load: load, save: save, reset: reset,
    hasOverride: hasOverride,
    exportPayload: exportPayload, importCampaigns: importCampaigns,
    clone: clone, slugify: slugify
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CampaignStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
