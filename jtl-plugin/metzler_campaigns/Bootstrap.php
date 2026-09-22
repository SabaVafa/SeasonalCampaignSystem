<?php

declare(strict_types=1);

namespace Plugin\metzler_campaigns;

use JTL\Events\Dispatcher;
use JTL\Plugin\Bootstrap as PluginBootstrap;
use JTL\Shop;
use Plugin\metzler_campaigns\src\AktionGateway;
use Plugin\metzler_campaigns\src\CampaignRepository;
use Plugin\metzler_campaigns\src\CampaignResolver;
use Plugin\metzler_campaigns\src\CategoryGuard;

/**
 * Plugin entry point.
 *
 * On each storefront render it resolves the winning campaign for the effective
 * date and assigns it to Smarty so the templates (hero / promo / countdown /
 * product slot) can dress the page. Resolution is cached per
 * campaign-set + customer group + language and only recomputed on a schedule
 * change or cache flush.
 *
 * It never computes a price. The winning campaign carries `kAktion`; the
 * enforced discount is JTL's, read by the templates from the priced product.
 */
class Bootstrap extends PluginBootstrap
{
    public function boot(Dispatcher $dispatcher): void
    {
        parent::boot($dispatcher);

        // HOOK_LETZTERINCLUDE_INC fires right before the content template is
        // included on every frontend page — the right spot to assign globals.
        // (Verify the constant/argument shape against your Shop 5.x minor.)
        $dispatcher->listen('shop.hook.' . \HOOK_LETZTERINCLUDE_INC, [$this, 'onFrontendRender']);
    }

    public function onFrontendRender(array $args = []): void
    {
        try {
            $smarty   = Shop::Smarty();
            $tz       = $this->timezone();
            $today    = (new \DateTimeImmutable('now', new \DateTimeZone($tz)))->format('Y-m-d');
            $campaign = $this->resolveCached();

            $smarty->assign('oKampagne', $campaign)
                   ->assign('metzlerCampaignTemplateUrl', $this->getPlugin()->getPaths()->getBaseURL() . 'template/');

            if ($campaign !== null) {
                // R1: badge comes from the ENFORCED promotion, not the campaign
                // row. No live JTL Aktion => no badge (fail-closed).
                $aktion = (new AktionGateway(Shop::Container()->getDB()))
                    ->activeAktion($campaign['kAktion'] ?? null, $today);
                $badge  = (new CampaignResolver($tz))->badgeFromAktion($aktion);
                $smarty->assign('metzlerCampaignBadge', $badge);
            }
        } catch (\Throwable $e) {
            // Never take the storefront down over a campaign lookup.
            Shop::Container()->getLogService()->error('metzler_campaigns: ' . $e->getMessage());
        }
    }

    /** "now" resolution, cached per day + customer group + language. */
    private function resolveCached(): ?array
    {
        $tz      = $this->timezone();
        $now     = new \DateTimeImmutable('now', new \DateTimeZone($tz));
        $today   = $now->format('Y-m-d');
        $cache   = Shop::Container()->getCache();
        $groupID = (int)(Shop::getCustomerGroup()->getID() ?? 0);
        $cacheID = 'metzler_camp_active_' . $today . '_' . $groupID . '_' . Shop::getLanguageID();

        $hit = $cache->get($cacheID);
        if ($hit !== false && is_array($hit)) {
            return $hit['c'];
        }

        $db        = Shop::Container()->getDB();
        $resolver  = new CampaignResolver($tz);
        $guard     = new CategoryGuard($db);
        $campaigns = (new CampaignRepository($db))->all();

        // R7: skip a campaign whose targeted categories have nothing in stock.
        // Fail-OPEN: a guard error must not blank the storefront.
        $isEligible = static function (array $c) use ($guard, $groupID): bool {
            try {
                return $guard->hasVisibleStock($c['targetCategories'] ?? [], $groupID);
            } catch (\Throwable $e) {
                return true;
            }
        };

        $active = $resolver->resolveActiveCampaignWith($campaigns, $today, $isEligible);

        // R3: self-expiring — never live past the next local midnight (the day is
        // also in the key). Plugin cache group lets an edit/flip flush it early.
        $ttl = $resolver->secondsUntilNextMidnight($now);
        $cache->set($cacheID, ['c' => $active], [\CACHING_GROUP_PLUGIN, 'metzler_campaigns'], $ttl);
        return $active;
    }

    private function timezone(): string
    {
        $tz = (string)$this->getPlugin()->getConfig()->getValue('metzler_camp_timezone');
        return $tz !== '' ? $tz : 'Europe/Berlin';
    }
}
