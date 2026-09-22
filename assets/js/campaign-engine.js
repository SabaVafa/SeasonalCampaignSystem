/**
 * Metzler SeasonalCampaignSystem — Campaign Engine
 * -------------------------------------------------
 * Pure, dependency-free logic that decides WHICH seasonal campaign is live
 * for a given date. No DOM, no fetch — so it can be unit-tested in isolation.
 *
 * Core rules (mirrors data/campaigns.seed.json):
 *   1. A campaign is "active" when the date falls inside [startDate, endDate].
 *   2. Recurring campaigns repeat every year — only month/day matter, the year
 *      of startDate/endDate is ignored. Windows may wrap across New Year
 *      (e.g. 12-26 → 01-06).
 *   3. When several campaigns overlap, the highest `priority` wins the page.
 *   4. If nothing is active, the `evergreen` fallback (isFallback:true) wins.
 */

(function (global) {
  'use strict';

  /** Parse "YYYY-MM-DD" (or a Date) into a UTC-safe Date at midnight. */
  function toDate(value) {
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    if (typeof value === 'string') {
      var m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    var d = new Date(value);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /** Day-of-year ordinal (1–366) for month/day comparison, year-agnostic. */
  function monthDayOrdinal(date) {
    return (date.getMonth() + 1) * 100 + date.getDate(); // e.g. 23 Nov -> 1123
  }

  /**
   * Is `date` inside a campaign's window?
   * - Non-recurring: strict calendar comparison against the seeded years.
   * - Recurring: compare month/day only, supporting year-wrap windows.
   */
  function isActive(campaign, date) {
    if (campaign.isFallback) return false;
    if (campaign.disabled) return false;              // paused campaigns never win
    if (!campaign.startDate || !campaign.endDate) return false;

    var start = toDate(campaign.startDate);
    var end = toDate(campaign.endDate);

    if (!campaign.recurring) {
      return date >= start && date <= end;
    }

    var d = monthDayOrdinal(date);
    var s = monthDayOrdinal(start);
    var e = monthDayOrdinal(end);

    if (s <= e) return d >= s && d <= e;          // normal window
    return d >= s || d <= e;                        // wraps past New Year
  }

  /** All active campaigns for a date, highest priority first. */
  function getActiveCampaigns(campaigns, date) {
    var d = toDate(date);
    return campaigns
      .filter(function (c) { return isActive(c, d); })
      .sort(function (a, b) { return (b.priority || 0) - (a.priority || 0); });
  }

  /** The single winning campaign (or the evergreen fallback). */
  function resolveActiveCampaign(campaigns, date) {
    var active = getActiveCampaigns(campaigns, date);
    if (active.length) return active[0];
    var fallback = campaigns.filter(function (c) { return c.isFallback; })[0];
    return fallback || null;
  }

  /**
   * Secondary campaigns worth surfacing as smaller promos below the hero:
   * the active campaigns that did NOT win the hero (excludes the winner + fallback).
   */
  function getSecondaryCampaigns(campaigns, date) {
    var active = getActiveCampaigns(campaigns, date);
    return active.slice(1).filter(function (c) { return !c.isFallback; });
  }

  /**
   * Look ahead: the next campaign that will start after `date` (year-agnostic
   * for recurring). Useful for "Coming soon" teasers.
   */
  function getUpcomingCampaign(campaigns, date) {
    var d = monthDayOrdinal(toDate(date));
    var upcoming = campaigns
      .filter(function (c) { return !c.isFallback && !c.disabled && c.startDate; })
      .map(function (c) {
        var s = monthDayOrdinal(toDate(c.startDate));
        var distance = s - d;
        if (distance <= 0) distance += 1300; // wrap to next year (ordinals max ~1231)
        return { campaign: c, distance: distance };
      })
      .filter(function (x) { return x.distance > 0; })
      .sort(function (a, b) { return a.distance - b.distance; });
    return upcoming.length ? upcoming[0].campaign : null;
  }

  /** Human-readable discount label for a campaign, or null. */
  function formatDiscount(campaign) {
    var r = campaign && campaign.discountRule;
    if (!r) return null;
    switch (r.type) {
      case 'percent':       return '-' + r.value + '%';
      case 'free_shipping': return 'Gratis Versand';
      case 'free_gravur':   return 'Gratis Gravur';
      case 'bundle':        return 'Set-Vorteil';
      case 'gift':          return 'Gratis Zugabe';
      default:              return null;
    }
  }

  var api = {
    toDate: toDate,
    monthDayOrdinal: monthDayOrdinal,
    isActive: isActive,
    getActiveCampaigns: getActiveCampaigns,
    resolveActiveCampaign: resolveActiveCampaign,
    getSecondaryCampaigns: getSecondaryCampaigns,
    getUpcomingCampaign: getUpcomingCampaign,
    formatDiscount: formatDiscount
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;            // Node / tests
  } else {
    global.CampaignEngine = api;     // Browser
  }
})(typeof window !== 'undefined' ? window : globalThis);
