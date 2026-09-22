# Metzler Saison-Kampagnen — JTL-Shop 5 Plugin

Date-/season-driven campaigns for JTL-Shop 5. The plugin **presents and
schedules**; **JTL prices**. A campaign never computes a discount — it
references a JTL **Aktion** (`kAktion`), so badge, PDP and cart always agree and
pricing stays PAngV-compliant and customer-group correct.

> **Scaffold status.** This is a build-ready skeleton, not a released plugin. It
> cannot be run or tested outside a JTL-Shop 5 environment. Items marked `TODO`
> and the version-sensitive hook/API calls must be confirmed against your exact
> Shop 5.x minor before shipping.

## What's here

```
metzler_campaigns/
├─ info.xml                     manifest: admin tab, settings
├─ Bootstrap.php                resolves the active campaign per request, assigns to Smarty, caches
├─ Migrations/
│  └─ Migration20260908120000.php   xplugin_metzler_campaign (+ _log) tables
├─ src/
│  ├─ CampaignResolver.php      pure PHP port of campaign-engine.js (unit-testable)
│  └─ CampaignRepository.php    CRUD + DB row ⇄ resolver-array mapping
├─ adminmenu/
│  ├─ campaigns.php             backend tab controller (save/delete/toggle)
│  └─ template/campaigns.tpl    authoring view (port the polished admin here)
└─ template/
   ├─ hero.tpl  promo.tpl  countdown.tpl
   └─ campaign.css             mz- presentation styles (METZLER palette)
```

## Install

1. Zip the `metzler_campaigns/` folder and upload via **Plugin-Manager → Upload**,
   or copy it into `plugins/` and install from **Available**.
2. Migrations create the tables on install.
3. Under the plugin **Einstellungen**, confirm the timezone (`Europe/Berlin`).

## Wiring the storefront (the remaining integration)

- **Where the hero/promo render:** place `template/hero.tpl` and `promo.tpl` via
  an OnPage Composer **Portlet** (OPC is in use on the live shop), a **Box**
  region, or an `{include}` in the **ETK2022 child template** — never by editing
  the Snackys base template directly. They read `$oKampagne`, which `Bootstrap`
  assigns on every frontend page.
- **CSS:** enqueue `template/campaign.css` (inject a `<link>` via an output hook,
  or add it to the child template head). Or drop in the prototype's full
  design-system CSS and keep the `mz-` class names.
- **Discount bridge:** create the discount as a JTL **Aktion/Sonderpreis** in
  Wawi (date range, target category, customer groups), then set its id in the
  campaign's **kAktion** field. Product badges/prices read the priced product —
  the plugin adds no price math.
- **Product slots:** query the shop catalog by the campaign's `targetCategories`
  (`kKategorie`) with the standard JTL product APIs; render priced products.

## Porting the prototype

| Prototype | JTL plugin |
|---|---|
| `campaign-engine.js` | `src/CampaignResolver.php` — near line-for-line, keeps its tests |
| seed JSON fields | migration columns; `discountRule` → `kAktion` reference |
| `admin.html` authoring UI | `adminmenu/template/campaigns.tpl` (swap localStorage → POST) |
| storefront markup | `template/*.tpl` Smarty partials |

## Not included (deliberately)

Price/VAT calculation, discount enforcement, catalog and stock — all owned by
JTL/Wawi. The plugin references them; it never reimplements them.
