<?php

declare(strict_types=1);

namespace Plugin\metzler_campaigns\src;

use JTL\DB\DbInterface;

/**
 * CategoryResolver — maps a prototype SEO slug (e.g. "paketboxen") to the real
 * JTL `kKategorie` on this shop. Used only by the one-shot SeedImporter (R6):
 * the prototype targets categories by slug, the plugin stores category IDs.
 *
 * Resolution order:
 *   1. `tseo` — the authoritative slug→object map (cKey='kKategorie').
 *   2. Fallback: category name match (dashes → spaces) via `tkategorie`.
 * An unknown slug returns null; the importer records it as a warning and imports
 * the campaign without that target (fail-open — a missing category never blocks
 * the whole import).
 *
 * NOTE: verify `tseo` / `tkategorie` column names against your Shop minor. On a
 * multi-language shop `tseo` may hold one row per language; LIMIT 1 is fine here
 * because a category resolves to the same kKategorie across languages.
 */
final class CategoryResolver
{
    /** @var array<string,?int> slug → kKategorie (or null), memoised per run. */
    private array $cache = [];

    public function __construct(private DbInterface $db)
    {
    }

    public function slugToKategorie(string $slug): ?int
    {
        $slug = trim($slug);
        if ($slug === '') {
            return null;
        }
        if (array_key_exists($slug, $this->cache)) {
            return $this->cache[$slug];
        }

        $row = $this->db->getSingleArray(
            "SELECT kKey FROM tseo WHERE cKey = 'kKategorie' AND cSeo = :s LIMIT 1",
            ['s' => $slug]
        );
        $id = $row ? (int)$row['kKey'] : null;

        if ($id === null) {
            $name = str_replace('-', ' ', $slug);
            $row  = $this->db->getSingleArray(
                'SELECT kKategorie FROM tkategorie WHERE cName = :n LIMIT 1',
                ['n' => $name]
            );
            $id = $row ? (int)$row['kKategorie'] : null;
        }

        return $this->cache[$slug] = $id;
    }
}
