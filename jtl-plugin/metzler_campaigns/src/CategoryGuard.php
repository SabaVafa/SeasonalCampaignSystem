<?php

declare(strict_types=1);

namespace Plugin\metzler_campaigns\src;

use JTL\DB\DbInterface;

/**
 * CategoryGuard — stops a campaign winning the hero when it has nothing to sell
 * (R7). Wawi owns stock and category membership; a category can empty out or be
 * renamed between syncs. If a campaign's targeted categories hold no active,
 * in-stock article, the resolver skips it and the next-priority campaign (or
 * evergreen) shows instead — so the shop never fronts a hero that leads to an
 * empty listing.
 *
 * Fail-OPEN by contract: the caller treats a thrown/uncertain result as
 * "eligible", so a transient DB hiccup degrades to showing the campaign, never
 * to blanking every campaign. (Compare AktionGateway, which is fail-CLOSED:
 * a wrong price claim is worse than a missing one.)
 */
final class CategoryGuard
{
    public function __construct(private DbInterface $db)
    {
    }

    /**
     * True if ANY of $kKategorien has at least one in-stock article. An empty
     * list means the campaign does not gate on stock (e.g. evergreen, a brand
     * campaign) and is always eligible.
     *
     * NOTE: uses JTL core tables tkategorieartikel + tartikel. Verify column
     * names against your Shop minor and extend the WHERE with visibility /
     * customer-group rules if your catalogue needs them. Keep it indexed and
     * LIMIT 1 — this runs inside campaign resolution.
     */
    public function hasVisibleStock(array $kKategorien, int $customerGroupId): bool
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $kKategorien))));
        if ($ids === []) {
            return true;
        }

        $row = $this->db->getSingleArray(
            'SELECT 1 AS ok
               FROM tkategorieartikel ka
               JOIN tartikel a ON a.kArtikel = ka.kArtikel
              WHERE ka.kKategorie IN (' . implode(',', $ids) . ')
                AND a.fLagerbestand > 0
              LIMIT 1'
        );

        return !empty($row);
    }
}
