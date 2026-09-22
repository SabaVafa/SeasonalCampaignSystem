<?php

declare(strict_types=1);

namespace Plugin\metzler_campaigns\src;

use JTL\DB\DbInterface;

/**
 * AktionGateway — the ONLY source of a campaign's discount badge (R1).
 *
 * The plugin stores no discount value of its own. A campaign carries just a
 * `kAktion` FK; this gateway reads the *enforced* promotion behind it and
 * reports it only while it is genuinely live today. If nothing is linked, or
 * the linked promotion is inactive / outside its window, it returns null and
 * the storefront shows NO badge — so the shop can never advertise a reduction
 * the cart will not honour (PAngV/UWG fail-closed).
 *
 * ── The contract is a view, not a table ──────────────────────────────────────
 * JTL exposes promotions through several mechanisms (Sonderpreis, Kategorie-
 * rabatt, Kupon, customer-group discount). Rather than hard-code any one of
 * them, the integrator creates ONE small SQL view named `vMetzlerAktion`
 * mapping their chosen mechanism to this stable shape:
 *
 *   CREATE OR REPLACE VIEW vMetzlerAktion AS
 *   SELECT  <promo id>            AS kAktion,
 *           <'percent'|...>       AS cType,
 *           <numeric or NULL>     AS fValue,
 *           <date or NULL>        AS dStart,
 *           <date or NULL>        AS dEnd,
 *           <1|0>                 AS nActive
 *   FROM    <the real JTL promotion source>;
 *
 * That view is the adapter: the plugin never touches JTL promo internals, and
 * the mapping is defined once, on the shop where the real schema is known.
 */
final class AktionGateway
{
    private const VIEW = 'vMetzlerAktion';

    public function __construct(private DbInterface $db)
    {
    }

    /**
     * The enforced discount behind $kAktion, or null when none is live today.
     * $today is 'Y-m-d' in the shop timezone (from the resolver).
     */
    public function activeAktion(?int $kAktion, string $today): ?array
    {
        if (empty($kAktion)) {
            return null;                              // nothing linked -> no badge
        }

        try {
            $row = $this->db->getSingleArray(
                'SELECT cType, fValue, dStart, dEnd, nActive
                   FROM ' . self::VIEW . '
                  WHERE kAktion = :id',
                ['id' => (int)$kAktion]
            );
        } catch (\Throwable $e) {
            // Missing view / schema drift must not fake a discount: fail-closed.
            return null;
        }

        if (!$row) {
            return null;
        }

        $live = (int)($row['nActive'] ?? 0) === 1
            && (empty($row['dStart']) || $row['dStart'] <= $today)
            && (empty($row['dEnd'])   || $row['dEnd']   >= $today);

        if (!$live) {
            return null;                              // linked but not live -> no badge
        }

        return [
            'type'   => (string)($row['cType'] ?? ''),
            'value'  => $row['fValue'] ?? null,
            'active' => true,
            'dStart' => $row['dStart'] ?? null,
            'dEnd'   => $row['dEnd'] ?? null,
        ];
    }
}
