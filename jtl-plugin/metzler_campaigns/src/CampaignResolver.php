<?php

declare(strict_types=1);

namespace Plugin\metzler_campaigns\src;

use DateTimeImmutable;
use DateTimeZone;

/**
 * CampaignResolver — pure, dependency-free port of campaign-engine.js.
 *
 * Decides WHICH seasonal campaign is live for a given date. No DB, no Shop
 * globals, no side effects — so it unit-tests in isolation exactly like the
 * JavaScript original. The repository feeds it plain arrays.
 *
 * A campaign is an associative array with (at least) these keys:
 *   identifier   string   slug, unique
 *   name         string
 *   startDate    ?string  'Y-m-d' or null
 *   endDate      ?string  'Y-m-d' or null
 *   recurring    bool     year-agnostic (month/day only), may wrap New Year
 *   priority     int      highest wins on overlap
 *   fallback     bool     evergreen baseline (isFallback)
 *   disabled     bool     paused — never wins, anywhere
 *   kAktion      ?int     FK to the enforced JTL promotion; the badge is derived
 *                         from it at render time (see badgeFromAktion), never
 *                         stored here — so a badge can't outlive its discount.
 *
 * Rules mirror data/campaigns.seed.json:
 *   1. Active when the date is inside [startDate, endDate].
 *   2. Recurring repeats every year (month/day); windows may wrap 12-26 -> 01-06.
 *   3. On overlap the highest `priority` wins.
 *   4. If nothing is active, the `fallback` campaign wins.
 */
final class CampaignResolver
{
    private DateTimeZone $tz;

    public function __construct(string $timezone = 'Europe/Berlin')
    {
        $this->tz = new DateTimeZone($timezone);
    }

    /** Normalise a 'Y-m-d' string or DateTimeImmutable to local midnight. */
    public function toDate($value): DateTimeImmutable
    {
        if ($value instanceof DateTimeImmutable) {
            return $value->setTime(0, 0, 0);
        }
        if (is_string($value) && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $m)) {
            return (new DateTimeImmutable('now', $this->tz))
                ->setDate((int)$m[1], (int)$m[2], (int)$m[3])
                ->setTime(0, 0, 0);
        }
        return (new DateTimeImmutable((string)$value, $this->tz))->setTime(0, 0, 0);
    }

    /** Day-of-year ordinal (month*100 + day), year-agnostic. 23 Nov -> 1123. */
    public function monthDayOrdinal(DateTimeImmutable $date): int
    {
        return ((int)$date->format('n')) * 100 + (int)$date->format('j');
    }

    /**
     * Is $campaign active on $date?
     * Non-recurring: strict calendar comparison. Recurring: month/day with wrap.
     */
    public function isActive(array $campaign, DateTimeImmutable $date): bool
    {
        if (!empty($campaign['fallback'])) {
            return false;
        }
        if (!empty($campaign['disabled'])) {
            return false;                       // paused campaigns never win
        }
        if (empty($campaign['startDate']) || empty($campaign['endDate'])) {
            return false;
        }

        $start = $this->toDate($campaign['startDate']);
        $end   = $this->toDate($campaign['endDate']);

        if (empty($campaign['recurring'])) {
            return $date >= $start && $date <= $end;
        }

        $d = $this->monthDayOrdinal($date);
        $s = $this->monthDayOrdinal($start);
        $e = $this->monthDayOrdinal($end);

        if ($s <= $e) {
            return $d >= $s && $d <= $e;         // normal window
        }
        return $d >= $s || $d <= $e;             // wraps past New Year
    }

    /** All active campaigns for a date, highest priority first. */
    public function getActiveCampaigns(array $campaigns, $date): array
    {
        $d = $this->toDate($date);
        $active = array_values(array_filter(
            $campaigns,
            fn (array $c): bool => $this->isActive($c, $d)
        ));
        usort(
            $active,
            fn (array $a, array $b): int => (int)($b['priority'] ?? 0) <=> (int)($a['priority'] ?? 0)
        );
        return $active;
    }

    /** The single winning campaign (or the evergreen fallback, or null). */
    public function resolveActiveCampaign(array $campaigns, $date): ?array
    {
        $active = $this->getActiveCampaigns($campaigns, $date);
        if (!empty($active)) {
            return $active[0];
        }
        foreach ($campaigns as $c) {
            if (!empty($c['fallback'])) {
                return $c;
            }
        }
        return null;
    }

    /** Active campaigns that did NOT win the hero (excludes winner + fallback). */
    public function getSecondaryCampaigns(array $campaigns, $date): array
    {
        $active = $this->getActiveCampaigns($campaigns, $date);
        $rest   = array_slice($active, 1);
        return array_values(array_filter($rest, fn (array $c): bool => empty($c['fallback'])));
    }

    /** Look ahead: the next campaign that starts after $date (year-agnostic). */
    public function getUpcomingCampaign(array $campaigns, $date): ?array
    {
        $d = $this->monthDayOrdinal($this->toDate($date));
        $best = null;
        $bestDistance = PHP_INT_MAX;
        foreach ($campaigns as $c) {
            if (!empty($c['fallback']) || !empty($c['disabled']) || empty($c['startDate'])) {
                continue;
            }
            $s = $this->monthDayOrdinal($this->toDate($c['startDate']));
            $distance = $s - $d;
            if ($distance <= 0) {
                $distance += 1300;               // wrap to next year (ordinals max ~1231)
            }
            if ($distance > 0 && $distance < $bestDistance) {
                $bestDistance = $distance;
                $best = $c;
            }
        }
        return $best;
    }

    /**
     * The single winning campaign, but skipping any whose targeted categories
     * currently have nothing to sell (R7). $isEligible is injected by the caller
     * (Bootstrap) so the resolver stays pure/DB-free and unit-testable.
     *
     * A campaign wins only if it is the highest-priority ACTIVE one that also
     * passes $isEligible; otherwise we fall through to the next priority, and
     * finally to the evergreen fallback. Passing null keeps the plain behaviour.
     */
    public function resolveActiveCampaignWith(array $campaigns, $date, ?callable $isEligible = null): ?array
    {
        foreach ($this->getActiveCampaigns($campaigns, $date) as $c) {
            if ($isEligible === null || $isEligible($c) === true) {
                return $c;
            }
        }
        foreach ($campaigns as $c) {
            if (!empty($c['fallback'])) {
                return $c;
            }
        }
        return null;
    }

    /**
     * Badge text derived from the ENFORCED promotion (R1), not from the campaign
     * row. $aktion comes from AktionGateway and is null unless a linked JTL
     * promotion is genuinely live today. No live promotion => no badge, so the
     * shop can never advertise a discount the cart will not honour (fail-closed).
     */
    public function badgeFromAktion(?array $aktion): ?string
    {
        if ($aktion === null || empty($aktion['active'])) {
            return null;
        }
        switch ($aktion['type'] ?? null) {
            case 'percent':       return '-' . (int)($aktion['value'] ?? 0) . '%';
            case 'free_shipping': return 'Gratis Versand';
            case 'free_gravur':   return 'Gratis Gravur';
            case 'bundle':        return 'Set-Vorteil';
            case 'gift':          return 'Gratis Zugabe';
            default:              return null;
        }
    }

    /**
     * Cache lifetime so a resolution never survives past the next local midnight
     * (R3). The daily date is also part of the cache key, so this is the belt to
     * that suspenders: even a mis-keyed entry self-expires at the day boundary.
     * Clamped to a 5-minute floor to avoid thrashing right before midnight.
     */
    public function secondsUntilNextMidnight(?DateTimeImmutable $now = null): int
    {
        $now = $now ? $now->setTimezone($this->tz) : new DateTimeImmutable('now', $this->tz);
        $nextMidnight = $now->setTime(0, 0, 0)->modify('+1 day');
        return max(300, $nextMidnight->getTimestamp() - $now->getTimestamp());
    }
}
