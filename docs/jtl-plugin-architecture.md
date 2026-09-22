# JTL-Shop 5 Plugin — Architecture & Hand-off

**Deliverable:** production packaging of the Seasonal Campaign System prototype as a
native **JTL-Shop 5** plugin for `edelstahl-tuerklingel.de` (METZLER).

**Companion docs (HTML, same folder):** `feasibility-assessment.html` (feature-by-feature
feasibility) and `jtl-implementation-blueprint.html` (visual blueprint). This file is the
concise developer/marketing hand-off and reflects the **current state of the scaffold** in
[`../jtl-plugin/metzler_campaigns/`](../jtl-plugin/metzler_campaigns/).

---

## 1. Platform (verified against the live shop)

| Fact | Value | How confirmed |
|---|---|---|
| Shop system | **JTL-Shop 5.x** | `templates/NOVA/` parent present; jQuery 3.6; `eModal` |
| Template | **Snackys** base + **ETK2022** child (Bootstrap 4 + jQuery) | script paths on the live page |
| Page builder | **OnPage Composer (OPC)** in active use | live shop inspection |
| Catalog / prices | **JTL-Wawi** (synced to shop DB) | real `kKategorie`, granular SEO slugs |
| Scope | **Single shop** | product decision |

**Consequence:** a single shop on JTL → a **native plugin** beats a standalone dashboard.
One source of truth, the real catalog, native SEO. The standalone prototype stays as the
**design reference + preview sandbox**, not the production runtime.

---

## 2. Design decision — thin presentation + scheduling layer

The plugin **presents and schedules**. **JTL/Wawi owns products, prices, VAT, stock and
discounts.** A campaign never computes a price — it references a native JTL **Aktion**
(`kAktion`), so the badge, the PDP and the cart always agree, pricing stays
**PAngV-compliant** and customer-group-correct, and the plugin never fights the Wawi price
sync.

Everything the prototype's `product-provider.js` + `product-images.json` did is **dropped** —
the JTL catalog is the source.

---

## 3. Current scaffold — file map & status

```
jtl-plugin/metzler_campaigns/          PluginID: metzler_campaigns  (deployable unit)
├─ info.xml                     manifest: admin tab "Saison-Kampagnen", settings (timezone)      ✅
├─ Bootstrap.php                resolves winning campaign per request → Smarty $oKampagne, caches ✅
├─ Migrations/
│  └─ Migration20260908120000.php   xplugin_metzler_campaign (+ _log) tables                      ✅
├─ src/
│  ├─ CampaignResolver.php      pure PHP port of the JS engine (unit-testable, no JTL deps)       ✅
│  └─ CampaignRepository.php    CRUD + DB row ⇄ resolver-array mapping                            ✅
├─ adminmenu/
│  ├─ campaigns.php             backend controller: save / delete / toggle + cache flush          ✅ (TODOs)
│  └─ template/campaigns.tpl    authoring view                                                    ✅ (TODOs)
└─ template/
   ├─ hero.tpl  promo.tpl  countdown.tpl   Smarty partials (read $oKampagne)                      ⚠️ early stub
   └─ campaign.css                          mz- presentation styles                               ⚠️ early stub
```

### Engine — how resolution works (`CampaignResolver.php`)
- `resolveActiveCampaign($campaigns, $date)` → the single winning campaign, or the evergreen
  fallback, or `null`.
- Active = date inside `[startDate, endDate]`. **Recurring** compares month/day only and
  **wraps New Year** (e.g. Dec 26 → Jan 06). Highest `priority` wins on overlap.
- Also: `getActiveCampaigns`, `getSecondaryCampaigns`, `getUpcomingCampaign` (look-ahead),
  `formatDiscount` (display label only).

### Bootstrap wiring
- Listens on `HOOK_LETZTERINCLUDE_INC` (fires before the content template on every frontend
  page) and assigns `$oKampagne` + the template URL to Smarty.
- Resolution is **cached** per `day + customer group + language`, tagged
  `CACHING_GROUP_PLUGIN` / `metzler_campaigns`; a backend save flushes that tag so the
  storefront updates immediately.
- Wrapped in try/catch — a campaign lookup can never take the storefront down.

### Data model (`xplugin_metzler_campaign`)
`kCampaign, cIdentifier, cName, cSeason, dStart, dEnd, nRecurring, nPriority, nFallback,
nDisabled, cTemplate, cHeroHeadline, cEyebrow, cPromoStrip, cBadge, cHeroImage,
cHeroImageMobile, cTargetCategories (JSON of kKategorie), kAktion (→ JTL Aktion),
cDiscountType/cDiscountValue (display only), dCreated, dModified` — plus an audit
`xplugin_metzler_campaign_log`.

---

## 4. Storefront integration path

- **Where hero/promo render:** an OPC **Portlet** (OPC is in use), a **Box** region, or an
  `{include}` in the **ETK2022 child template**. **Never edit the Snackys base template.**
- **CSS:** enqueue `template/campaign.css` (a `<link>` via an output hook, or the child-template
  head).
- **Product slots:** query the catalog by the campaign's `targetCategories` (`kKategorie`) with
  standard JTL product APIs; render priced products. Product-card badges attach via the NOVA
  **productbox** template hook.
- **Discount bridge:** create the discount as a JTL **Aktion/Sonderpreis** in Wawi (date range,
  target category, customer groups), then set its id in the campaign's **`kAktion`** field.

---

## 5. Porting map — prototype → plugin

| Prototype | Plugin | State |
|---|---|---|
| `assets/js/*` campaign engine | `src/CampaignResolver.php` | ✅ ported (keeps its test shape) |
| `data/campaigns.seed.json` fields | migration columns; `discountRule` → `kAktion` | ✅ schema done · seed rows TODO |
| `admin.html` authoring UI | `adminmenu/template/campaigns.tpl` (localStorage → POST) | ✅ functional · polish TODO |
| `app.js` `renderHero` / `renderPromoStrip` / countdown | `template/hero.tpl` / `promo.tpl` / `countdown.tpl` | ⚠️ **early stub — not yet the current design** |
| `assets/css/campaign.css` (12 palettes, BF-parity hero, top bar, badges) | `template/campaign.css` | ⚠️ **only 1 palette baked — not ported** |
| `product-provider.js` + `product-images.json` | — | ❌ **dropped** (JTL catalog) |

---

## 6. Known gaps / TODO before shipping

1. **Presentation layer is intentionally behind the prototype.** The plugin templates + CSS
   do **not** yet carry this session's premium redesign: the 12-palette `data-camp-theme`
   system, the Black-Month-parity hero frame/CTA, the relocated top bar with the live
   **D/H/M/S** countdown, or the product-card value badges. **Deferred on purpose** — palettes
   are on hold until marketing delivers the final campaign list (see the colour audit). Porting
   them now would mean redoing them.
2. **Admin controller:** validate the JTL admin **CSRF token** before mutating
   (`Form::validateToken`); populate the editor's **Aktionen** + **category-tree** selects.
3. **Seed rows — DONE (R6).** [`SeedImporter`](../jtl-plugin/metzler_campaigns/src/SeedImporter.php)
   loads the bundled `data/campaigns.seed.json` (20 campaigns) from the backend tab:
   idempotent (keyed on `cIdentifier`), **insert-only by default** (never clobbers admin
   edits), **dry-run preview** before apply, slug → `kKategorie` via
   [`CategoryResolver`](../jtl-plugin/metzler_campaigns/src/CategoryResolver.php) (`tseo` →
   name fallback; unmatched = warning, not a stop), and it **never imports a discount** and
   **preserves any linked `kAktion`** (R1 intact). Added a `cAccent` column so each campaign
   carries its `data-camp-theme` palette key. *Still verify on staging that the shop's SEO
   slugs resolve to the intended categories.*
4. **Version-sensitive API calls** (`HOOK_LETZTERINCLUDE_INC`, adminmenu include contract,
   migration base class) must be confirmed against the shop's exact 5.x minor in a real JTL
   dev environment — none of this can be executed outside JTL.

---

## 6.1 Risk hardening — JTL feasibility audit

A JTL-platform audit of the whole chain (Wawi → Shop-DB → plugin → template). The
guiding principle: **turn process risk into fail-closed structural guarantees** — when
someone forgets a step, the system degrades to *no badge / baseline theme*, never to a
*wrong price claim / broken page / outage*. "Minimized risk" here means **zero harmful
outcomes**, not zero events.

### Implemented in the scaffold

| Risk | Failure it prevents | Solution (fail-safe direction) |
|---|---|---|
| **R1 — badge vs. cart price** (Abmahnung) | Hero shows "−15 %" while the cart charges full price | The plugin stores **no discount value** — only `kAktion`. `AktionGateway` reads the *enforced* promotion and the badge is derived from it at render time (`badgeFromAktion`). No live Aktion ⇒ **no badge**. Badge and price are the same object; they cannot disagree. **Fail-closed.** |
| **R7 — empty / out-of-stock category** | Hero leads to an empty listing after a Wawi stock/rename change | `CategoryGuard.hasVisibleStock()` gates each win; `resolveActiveCampaignWith()` skips an ineligible campaign to the next priority (then evergreen). **Fail-open** (a guard error shows the campaign, never blanks the shop). |
| **R3 — stale campaign past a date flip** (plugin cache) | Yesterday's campaign served after midnight | Resolution cache keyed by day **and** given a lifetime of `secondsUntilNextMidnight()` — it self-expires at the boundary; the admin also flushes the `metzler_campaigns` cache group on every edit. |

The discount contract is a **view, not a table**: the integrator creates one
`vMetzlerAktion` view mapping their real promotion mechanism (Sonderpreis /
Kategorierabatt / Kupon) to `(kAktion, cType, fValue, dStart, dEnd, nActive)`. The plugin
never touches JTL promo internals; the mapping is defined once, on the shop.

### Must be validated on a staging clone (environment-specific — cannot be proven in code)

| Risk | Design already in place | What staging must confirm |
|---|---|---|
| **R2 — Omnibus / 30-day-low price** | Plugin renders **no € price at all** — only hero + badge; all reference/struck prices come from JTL's own Streichpreis/Omnibus engine | Enable JTL Omnibus handling; verify a real PDP shows the lowest-30-day reference; sign-off from whoever owns Abmahn-risk |
| **R3 — full-page / reverse-proxy cache** | Plugin cache is boundary-safe (above) | Confirm the **full-page cache / Cloudflare** doesn't serve a stale hero — ESI hole-punch the hero fragment or schedule a midnight FPC flush; run a real `31 Okt→1 Nov` / `30 Nov→1 Dez` date-flip |
| **R4 — Shop/PHP version & hook** | try/catch spine; degrades to evergreen | Confirm live Shop 5.x minor + PHP, that `HOOK_LETZTERINCLUDE_INC` fires on all needed page types (incl. OPC/cached), and `XMLVersion`/`ShopVersion` in `info.xml` |
| **R5 — child-template theme injection** | `mz-`-namespaced CSS scoped under `[data-camp-theme]`; hero via OPC portlet | Inject the `data-camp-theme` body attribute via a header hook (no child-template edit); confirm no CSS collision in NOVA+ETK2022 desktop+mobile and that it survives a template update |

**Go-live gate:** install on a staging clone → create the 20 campaigns + their linked JTL
Aktionen (window == campaign window) → legal QA on 3 PDPs (badge == cart, Omnibus shown) →
date-flip test through the full-page cache → confirm midnight flush → theme renders in
ETK2022 desktop+mobile → evergreen fallback + plugin-disable kill-switch both work.

---

## 7. Suggested phasing

- **Phase 1 (MVP):** engine + `HOOK_LETZTERINCLUDE_INC` rendering + backend list/edit + palette
  CSS. A campaign goes live on schedule and skins the storefront.
- **Phase 2:** year-timeline calendar, draft→live preview (`?metzlerPreview=<id>` for logged-in
  admins), Aktion binding, category-targeting UI.
- **Phase 3:** per-campaign impressions/clicks, A/B variants, multi-locale.

---

## 8. Deliberately out of scope

Price/VAT calculation, discount enforcement, catalog and stock — all owned by JTL/Wawi. The
plugin references them; it never reimplements them.
