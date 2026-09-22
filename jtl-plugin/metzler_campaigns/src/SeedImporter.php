<?php

declare(strict_types=1);

namespace Plugin\metzler_campaigns\src;

/**
 * SeedImporter — loads the bundled prototype campaigns (data/campaigns.seed.json)
 * into the plugin tables (R6), so nobody re-types 20 campaigns by hand.
 *
 * Fail-safe by design:
 *   • Idempotent, keyed on cIdentifier. Re-running never duplicates.
 *   • Insert-only by default: an existing campaign is SKIPPED, so a re-run can
 *     never clobber an admin's edits. Pass $overwrite=true to refresh from seed.
 *   • Even on overwrite, the linked `kAktion` is PRESERVED — the importer never
 *     touches the discount binding (R1 stays intact; no seed discount is loaded).
 *   • Dry-run: pass $apply=false to get the full report without writing a row.
 *   • Unknown category slug → warning, not a stop (fail-open).
 *
 * The prototype's discountRule / heroBanner / rationale / mood are intentionally
 * NOT imported: prices come from a JTL Aktion (R1), imagery from JTL/OPC.
 */
final class SeedImporter
{
    public function __construct(
        private CampaignRepository $repo,
        private CategoryResolver $categories
    ) {
    }

    /** Import from a JSON file shaped like data/campaigns.seed.json. */
    public function importFromFile(string $path, bool $apply, bool $overwrite = false): array
    {
        if (!is_file($path)) {
            return $this->fail('Seed-Datei nicht gefunden: ' . $path);
        }
        $json = json_decode((string)file_get_contents($path), true);
        if (!is_array($json) || empty($json['campaigns']) || !is_array($json['campaigns'])) {
            return $this->fail('Ungültige oder leere Seed-Datei.');
        }
        return $this->import($json['campaigns'], $apply, $overwrite);
    }

    /** @param array<int,array<string,mixed>> $campaigns */
    public function import(array $campaigns, bool $apply, bool $overwrite = false): array
    {
        $rows = [];
        $counts = ['insert' => 0, 'update' => 0, 'skip' => 0];
        foreach ($campaigns as $c) {
            if (!is_array($c)) {
                continue;
            }
            $r = $this->handle($c, $apply, $overwrite);
            $rows[] = $r;
            $counts[$r['action']] = ($counts[$r['action']] ?? 0) + 1;
        }
        return [
            'ok'      => true,
            'apply'   => $apply,
            'summary' => $counts + ['total' => count($rows)],
            'rows'    => $rows,
        ];
    }

    /** @param array<string,mixed> $c */
    private function handle(array $c, bool $apply, bool $overwrite): array
    {
        $identifier = (string)($c['id'] ?? $c['identifier'] ?? '');
        if ($identifier === '') {
            return ['identifier' => '(ohne id)', 'name' => '', 'action' => 'skip',
                    'categories' => 0, 'warnings' => ['Kampagne ohne id — übersprungen.']];
        }

        $warnings = [];
        $kKats    = [];
        foreach ((array)($c['targetCategories'] ?? []) as $slug) {
            $id = $this->categories->slugToKategorie((string)$slug);
            if ($id === null) {
                $warnings[] = 'Kategorie-Slug nicht gefunden: ' . (string)$slug;
            } else {
                $kKats[] = $id;
            }
        }

        $existing = $this->repo->findByIdentifier($identifier);
        if ($existing !== null && !$overwrite) {
            return ['identifier' => $identifier, 'name' => (string)($c['name'] ?? ''),
                    'action' => 'skip', 'categories' => count($kKats),
                    'warnings' => array_merge(['Existiert bereits — übersprungen (Überschreiben aus).'], $warnings)];
        }

        $action = $existing !== null ? 'update' : 'insert';

        if ($apply) {
            $accent = null;
            if (isset($c['theme']) && is_array($c['theme'])) {
                $accent = $c['theme']['accent'] ?? null;
            }
            $this->repo->save([
                'kCampaign'       => $existing['kCampaign'] ?? null,
                'identifier'      => $identifier,
                'name'            => (string)($c['name'] ?? $identifier),
                'season'          => (string)($c['season'] ?? 'all'),
                'startDate'       => $c['startDate'] ?? null,
                'endDate'         => $c['endDate'] ?? null,
                'recurring'       => !empty($c['recurring']),
                'priority'        => (int)($c['priority'] ?? 50),
                'fallback'        => !empty($c['isFallback']) || !empty($c['fallback']),
                'disabled'        => !empty($c['disabled']),
                'template'        => $c['template'] ?? null,
                'accent'          => $accent,
                'heroHeadline'    => $c['heroHeadline'] ?? null,
                'eyebrow'         => $c['eyebrow'] ?? null,
                'promoStrip'      => $c['promoStrip'] ?? null,
                'badge'           => $c['badge'] ?? null,
                'heroImage'       => $c['heroImage'] ?? null,
                'heroImageMobile' => $c['heroImageMobile'] ?? null,
                'targetCategories' => $kKats,
                // Preserve any linked Aktion; never import a discount (R1).
                'kAktion'         => $existing['kAktion'] ?? null,
            ]);
        }

        return ['identifier' => $identifier, 'name' => (string)($c['name'] ?? ''),
                'action' => $action, 'categories' => count($kKats), 'warnings' => $warnings];
    }

    private function fail(string $error): array
    {
        return ['ok' => false, 'error' => $error, 'apply' => false,
                'summary' => ['insert' => 0, 'update' => 0, 'skip' => 0, 'total' => 0], 'rows' => []];
    }
}
