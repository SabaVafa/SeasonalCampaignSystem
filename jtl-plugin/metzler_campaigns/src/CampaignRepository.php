<?php

declare(strict_types=1);

namespace Plugin\metzler_campaigns\src;

use JTL\DB\DbInterface;
use stdClass;

/**
 * CampaignRepository — CRUD over the plugin tables, and the mapping between DB
 * rows (JTL `xplugin_metzler_campaign` columns) and the plain arrays the
 * CampaignResolver consumes. Keeping the mapping here means the resolver stays
 * storage-agnostic and testable.
 */
final class CampaignRepository
{
    private const TABLE = 'xplugin_metzler_campaign';

    public function __construct(private DbInterface $db)
    {
    }

    /** All campaigns as resolver-shaped arrays. */
    public function all(): array
    {
        $rows = $this->db->getArrays('SELECT * FROM ' . self::TABLE . ' ORDER BY nPriority DESC, cName ASC');
        return array_map([$this, 'toArray'], $rows);
    }

    /** One campaign by primary key, or null. */
    public function find(int $kCampaign): ?array
    {
        $row = $this->db->getSingleArray(
            'SELECT * FROM ' . self::TABLE . ' WHERE kCampaign = :id',
            ['id' => $kCampaign]
        );
        return $row ? $this->toArray($row) : null;
    }

    /** One campaign by its slug identifier, or null. Used for idempotent import. */
    public function findByIdentifier(string $identifier): ?array
    {
        $row = $this->db->getSingleArray(
            'SELECT * FROM ' . self::TABLE . ' WHERE cIdentifier = :id',
            ['id' => $identifier]
        );
        return $row ? $this->toArray($row) : null;
    }

    /** Insert or update; returns the campaign id. */
    public function save(array $data): int
    {
        $now = (new \DateTimeImmutable())->format('Y-m-d H:i:s');
        $obj = $this->toRow($data);
        $obj->dModified = $now;

        if (!empty($data['kCampaign'])) {
            $id = (int)$data['kCampaign'];
            $this->db->update(self::TABLE, 'kCampaign', $id, $obj);
            return $id;
        }
        $obj->dCreated = $now;
        return (int)$this->db->insert(self::TABLE, $obj);
    }

    public function delete(int $kCampaign): void
    {
        $this->db->delete(self::TABLE, 'kCampaign', $kCampaign);
    }

    public function setDisabled(int $kCampaign, bool $disabled): void
    {
        $obj = new stdClass();
        $obj->nDisabled = $disabled ? 1 : 0;
        $obj->dModified = (new \DateTimeImmutable())->format('Y-m-d H:i:s');
        $this->db->update(self::TABLE, 'kCampaign', $kCampaign, $obj);
    }

    // ── mapping ──────────────────────────────────────────────────────────

    /** DB row (stdClass|array) -> resolver-shaped array. */
    private function toArray($row): array
    {
        $row = (array)$row;
        return [
            'kCampaign'        => (int)($row['kCampaign'] ?? 0),
            'identifier'       => (string)($row['cIdentifier'] ?? ''),
            'name'             => (string)($row['cName'] ?? ''),
            'season'           => (string)($row['cSeason'] ?? 'all'),
            'startDate'        => $row['dStart'] ?: null,
            'endDate'          => $row['dEnd'] ?: null,
            'recurring'        => (bool)($row['nRecurring'] ?? true),
            'priority'         => (int)($row['nPriority'] ?? 50),
            'fallback'         => (bool)($row['nFallback'] ?? false),
            'disabled'         => (bool)($row['nDisabled'] ?? false),
            'template'         => $row['cTemplate'] ?: null,
            'accent'           => $row['cAccent'] ?: null,
            'heroHeadline'     => $row['cHeroHeadline'] ?? null,
            'eyebrow'          => $row['cEyebrow'] ?? null,
            'promoStrip'       => $row['cPromoStrip'] ?? null,
            'badge'            => $row['cBadge'] ?? null,
            'heroImage'        => $row['cHeroImage'] ?? null,
            'heroImageMobile'  => $row['cHeroImageMobile'] ?? null,
            'targetCategories' => $this->decodeCategories($row['cTargetCategories'] ?? null),
            // kAktion is the sole discount source (R1). The badge is derived from
            // the live Aktion by AktionGateway, never stored/labelled here.
            'kAktion'          => isset($row['kAktion']) ? (int)$row['kAktion'] : null,
        ];
    }

    /** Resolver-shaped array -> DB row object for insert/update. */
    private function toRow(array $c): stdClass
    {
        $o = new stdClass();
        $o->cIdentifier       = (string)($c['identifier'] ?? '');
        $o->cName             = (string)($c['name'] ?? '');
        $o->cSeason           = (string)($c['season'] ?? 'all');
        $o->dStart            = $c['startDate'] ?: null;
        $o->dEnd              = $c['endDate'] ?: null;
        $o->nRecurring        = !empty($c['recurring']) ? 1 : 0;
        $o->nPriority         = (int)($c['priority'] ?? 50);
        $o->nFallback         = !empty($c['fallback']) ? 1 : 0;
        $o->nDisabled         = !empty($c['disabled']) ? 1 : 0;
        $o->cTemplate         = ($c['template'] ?? null) ?: null;
        $o->cAccent           = ($c['accent'] ?? null) ?: null;
        $o->cHeroHeadline     = $c['heroHeadline'] ?? null;
        $o->cEyebrow          = $c['eyebrow'] ?? null;
        $o->cPromoStrip       = $c['promoStrip'] ?? null;
        $o->cBadge            = $c['badge'] ?? null;
        $o->cHeroImage        = $c['heroImage'] ?? null;
        $o->cHeroImageMobile  = $c['heroImageMobile'] ?? null;
        $o->cTargetCategories = json_encode(array_values($c['targetCategories'] ?? []));
        $o->kAktion           = !empty($c['kAktion']) ? (int)$c['kAktion'] : null;
        return $o;
    }

    private function decodeCategories($raw): array
    {
        if (empty($raw)) {
            return [];
        }
        $decoded = json_decode((string)$raw, true);
        return is_array($decoded) ? $decoded : [];
    }
}
