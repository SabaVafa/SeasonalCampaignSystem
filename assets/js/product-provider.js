/**
 * Metzler SeasonalCampaignSystem — Product Provider
 * -------------------------------------------------
 * Bridges campaign `targetCategories` to real products from the finder JSON
 * datasets (Json Folder/*.json). Loads only the files a campaign needs, caches
 * them, and returns showcase-worthy models (accessories/spares filtered out).
 *
 * Prices in the finder data are indicative gross EUR (net x 1.19).
 */

(function (global) {
  'use strict';

  // Campaign category slug -> finder dataset file. Slugs without a dataset
  // (beleuchtung, hausnummern-…, garten) resolve to null and render as tiles.
  var FINDER_FILES = {
    'briefkasten':        'briefkasten-finder.json',
    'paketboxen':         'paketboxen-finder.json',
    'muelltonnenbox':     'muelltonnenbox-finder.json',
    'tuersprechanlagen':  'tuersprechanlagen-finder.json',
    'sicherheitstechnik': 'sicherheitstechnik-finder.json',
    'tuerklingel':        'tuerklingel-finder.json'
  };

  var DATA_DIR = 'Json Folder/';
  var FINDER_JS_DIR = 'data/finders/';
  var IMAGE_MAP_JS = 'data/product-images.js';
  var IMAGE_MAP_URL = 'data/product-images.json';

  // Load a local script once — works over file:// AND http:// (fetch is blocked
  // on file://), so the app runs when opened directly from disk.
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

  // Category names that mark a product as an accessory/spare, not a showcase item.
  var ACCESSORY_RE = /(Ersatz|Zubeh|Reiniger|Pflege|Montage|Anschlussdose|Gravurleiste|Konfigurator|Namensschild|Namens- )/i;

  var cache = {};
  var imageMap = {};
  var imagePromise = null;

  // sku -> product image URL (built by tools/enrich-images.py). Missing SKUs
  // simply render the neutral placeholder tile.
  function ensureImages() {
    if (imagePromise) return imagePromise;
    if (window.__PRODUCT_IMAGES__) { imageMap = window.__PRODUCT_IMAGES__; imagePromise = Promise.resolve(imageMap); return imagePromise; }
    imagePromise = loadScriptOnce(IMAGE_MAP_JS)
      .then(function () { imageMap = window.__PRODUCT_IMAGES__ || {}; return imageMap; })
      .catch(function () {
        return fetch(IMAGE_MAP_URL).then(function (r) { return r.ok ? r.json() : {}; })
          .then(function (m) { imageMap = m || {}; return imageMap; })
          .catch(function () { imageMap = {}; return imageMap; });
      });
    return imagePromise;
  }

  function finderGlobal(slug) {
    return (window.__FINDERS__ && window.__FINDERS__[slug]) || null;
  }

  function fetchFinder(slug) {
    var file = FINDER_FILES[slug];
    if (!file) return Promise.resolve(null);
    if (cache[slug]) return cache[slug];

    // Prefer the JS dataset (script injection works over file:// and http);
    // fall back to fetching the JSON if the script is unavailable.
    if (finderGlobal(slug)) { cache[slug] = Promise.resolve(finderGlobal(slug)); return cache[slug]; }
    cache[slug] = loadScriptOnce(FINDER_JS_DIR + slug + '.js')
      .then(function () { return finderGlobal(slug); })
      .catch(function () {
        var url = DATA_DIR + encodeURIComponent(file);
        return fetch(url).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
          return r.json();
        });
      })
      .catch(function (err) {
        console.warn('[product-provider] could not load', slug, err.message);
        return null;
      });
    return cache[slug];
  }

  function isShowcase(product) {
    var cats = product.categories || [];
    // Drop products that live ONLY in accessory categories.
    var hasMainCat = cats.some(function (c) { return !ACCESSORY_RE.test(c); });
    var priceOk = product.price_eur_gross && product.price_eur_gross.from >= 15;
    return hasMainCat && priceOk;
  }

  /** Popularity proxy: more variants + higher price = flagship-ish. */
  function rank(product) {
    var variants = product.variants_count || 1;
    var xsell = product.cross_sell_count || 0;
    return variants * 3 + xsell;
  }

  function normalize(product, slug) {
    var price = product.price_eur_gross || {};
    return {
      sku: product.sku,
      name: product.name,
      url: product.url,
      categorySlug: slug,
      categories: product.categories || [],
      priceFrom: price.from || null,
      priceTo: price.to || null,
      shortDescription: product.short_description || '',
      variantsCount: product.variants_count || 1,
      characteristics: product.characteristics || {},
      image: imageMap[product.sku] || null
    };
  }

  /**
   * Top products for a single category slug.
   * @returns {Promise<Array>} normalized product objects (may be empty).
   */
  function getProductsForCategory(slug, limit) {
    limit = limit || 8;
    return Promise.all([ensureImages(), fetchFinder(slug)]).then(function (res) {
      var data = res[1];
      if (!data || !data.products) return [];
      return data.products
        .filter(isShowcase)
        .sort(function (a, b) {
          var ai = imageMap[a.sku] ? 1 : 0, bi = imageMap[b.sku] ? 1 : 0;
          if (ai !== bi) return bi - ai;   // products WITH an image first
          return rank(b) - rank(a);
        })
        .slice(0, limit)
        .map(function (p) { return normalize(p, slug); });
    });
  }

  /**
   * Merged, de-duplicated showcase products across a campaign's categories.
   * Interleaves categories so a multi-category campaign shows variety.
   */
  // Stocked datasets used to top up campaigns whose own categories have no
  // product data yet (garten / beleuchtung / hausnummern) — imaged placeholders
  // so every campaign shows a full product grid until real data is wired.
  var DEFAULT_SLUGS = ['briefkasten', 'tuersprechanlagen', 'paketboxen', 'sicherheitstechnik', 'tuerklingel', 'muelltonnenbox'];

  function getProductsForCampaign(campaign, limit) {
    limit = limit || 8;
    var primary = (campaign.targetCategories || []).filter(function (s) { return FINDER_FILES[s]; });
    var fill = DEFAULT_SLUGS.filter(function (s) { return primary.indexOf(s) === -1; });
    var order = primary.concat(fill);

    return Promise.all(order.map(function (s) { return getProductsForCategory(s, 8); }))
      .then(function (lists) {
        var out = [], seen = {};
        function drain(from, to) {
          var idx = 0, more = true;
          while (out.length < limit && more) {
            more = false;
            for (var i = from; i < to; i++) {
              var p = lists[i] && lists[i][idx];
              if (p) { more = true; if (!seen[p.sku] && out.length < limit) { seen[p.sku] = 1; out.push(p); } }
            }
            idx++;
          }
        }
        drain(0, primary.length);                 // the campaign's own products first
        if (out.length < limit) drain(primary.length, order.length); // then imaged placeholders
        return out.slice(0, limit);
      });
  }

  /** Which of a campaign's categories have no product dataset (render as tiles). */
  function getTileCategories(campaign) {
    return (campaign.targetCategories || []).filter(function (s) {
      return !FINDER_FILES[s];
    });
  }

  function formatPrice(value) {
    if (value == null) return '';
    return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  var api = {
    FINDER_FILES: FINDER_FILES,
    getProductsForCategory: getProductsForCategory,
    getProductsForCampaign: getProductsForCampaign,
    getTileCategories: getTileCategories,
    formatPrice: formatPrice
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ProductProvider = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
