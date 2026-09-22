# JTL-Shop 5 Plugin

Production packaging of the Seasonal Campaign System as a JTL-Shop 5 plugin.

The plugin lives in [`metzler_campaigns/`](metzler_campaigns/) — that folder is
the deployable unit (its `PluginID` is `metzler_campaigns`). See
[`metzler_campaigns/README.md`](metzler_campaigns/README.md) for install and the
storefront-wiring steps.

## Design decision

The plugin is a **thin presentation + scheduling layer**. It owns campaign
resolution and the on-page dressing; **JTL/Wawi owns products, prices, VAT,
stock and discounts**. A campaign references a native JTL **Aktion** rather than
computing a price — which is what makes the discount checkout-correct and
PAngV-compliant, and keeps the plugin from fighting the Wawi price sync.

## Verified against the live shop (edelstahl-tuerklingel.de)

- **JTL-Shop 5**, **OnPage Composer (OPC)** in active use — the Portlet
  integration path is confirmed, not assumed.
- Storefront template: **Snackys** base + custom **ETK2022** child template
  (Bootstrap 4 + jQuery already loaded). Integrate via OPC Portlets or the
  ETK2022 child template — never edit the Snackys base directly.
- Brand primary teal `#005253` (matches the prototype's `#015253`). Campaigns
  target real **kKategorie** IDs; the live catalogue uses granular SEO slugs
  (`/briefkasten`, `/paketboxen`, …), not the prototype's mock slugs.

See the companion documents in [`../docs/`](../docs/):

- `feasibility-assessment.html` — feature-by-feature production feasibility.
- `jtl-implementation-blueprint.html` — the architecture this plugin implements.

## Status

Build-ready **scaffold**. The resolution engine (`src/CampaignResolver.php`) is
complete and portable; the JTL glue (hooks, admin, templates) follows JTL 5.x
conventions but must be confirmed and finished inside a real JTL dev shop — it
cannot be executed here.
