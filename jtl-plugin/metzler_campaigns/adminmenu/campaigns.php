<?php

declare(strict_types=1);

/**
 * Backend tab — "Saison-Kampagnen".
 *
 * Referenced by info.xml <Adminmenu><Customlink>. JTL includes this file with a
 * $smarty (JTLSmarty) instance in scope and the admin session already
 * authenticated + permission-checked. This is the server side of the authoring
 * UI; the polished standalone admin (admin.html) should be ported into
 * template/campaigns.tpl and talk to the actions below.
 *
 * @var \JTL\Smarty\JTLSmarty $smarty
 */

use JTL\Helpers\Request;
use JTL\Shop;
use Plugin\metzler_campaigns\src\CampaignRepository;
use Plugin\metzler_campaigns\src\CategoryResolver;
use Plugin\metzler_campaigns\src\SeedImporter;

$db   = Shop::Container()->getDB();
$repo = new CampaignRepository($db);
$msg  = '';
$importReport = null;
$dirty = false;

// TODO: validate the JTL admin CSRF token before mutating (Form::validateToken).
$action = Request::verifyGPDataString('action');

if ($action === 'save') {
    $repo->save([
        'kCampaign'        => Request::verifyGPCDataInt('kCampaign'),
        'identifier'       => Request::verifyGPDataString('identifier'),
        'name'             => Request::verifyGPDataString('name'),
        'season'           => Request::verifyGPDataString('season') ?: 'all',
        'startDate'        => Request::verifyGPDataString('startDate') ?: null,
        'endDate'          => Request::verifyGPDataString('endDate') ?: null,
        'recurring'        => Request::verifyGPCDataInt('recurring') === 1,
        'priority'         => Request::verifyGPCDataInt('priority'),
        'fallback'         => Request::verifyGPCDataInt('fallback') === 1,
        'disabled'         => Request::verifyGPCDataInt('disabled') === 1,
        'template'         => Request::verifyGPDataString('template') ?: null,
        'accent'           => Request::verifyGPDataString('accent') ?: null,
        'heroHeadline'     => Request::verifyGPDataString('heroHeadline'),
        'eyebrow'          => Request::verifyGPDataString('eyebrow'),
        'promoStrip'       => Request::verifyGPDataString('promoStrip'),
        'badge'            => Request::verifyGPDataString('badge'), // editorial label only, never a price claim
        'targetCategories' => array_filter(array_map('intval', (array)($_POST['targetCategories'] ?? []))),
        // The discount bridge: link to a JTL Aktion — never a stored/typed price.
        // The %/label shown to shoppers is derived from this Aktion at render
        // time (R1), so it can never disagree with the enforced cart price.
        'kAktion'          => Request::verifyGPCDataInt('kAktion') ?: null,
    ]);
    $msg = 'Kampagne gespeichert.';
    $dirty = true;
} elseif ($action === 'delete') {
    $repo->delete(Request::verifyGPCDataInt('kCampaign'));
    $msg = 'Kampagne gelöscht.';
    $dirty = true;
} elseif ($action === 'toggle') {
    $repo->setDisabled(
        Request::verifyGPCDataInt('kCampaign'),
        Request::verifyGPCDataInt('disabled') === 1
    );
    $msg = 'Status geändert.';
    $dirty = true;
} elseif ($action === 'import') {
    // R6: load the bundled prototype seed. mode=preview (dry-run) or apply.
    $apply     = Request::verifyGPDataString('mode') === 'apply';
    $overwrite = Request::verifyGPCDataInt('overwrite') === 1;
    $importer  = new SeedImporter($repo, new CategoryResolver($db));
    $importReport = $importer->importFromFile(__DIR__ . '/../data/campaigns.seed.json', $apply, $overwrite);

    if (empty($importReport['ok'])) {
        $msg = 'Import fehlgeschlagen: ' . ($importReport['error'] ?? 'unbekannt');
    } else {
        $s = $importReport['summary'];
        $msg = $apply
            ? sprintf('Seed-Import: %d neu, %d aktualisiert, %d übersprungen.', $s['insert'], $s['update'], $s['skip'])
            : sprintf('Vorschau (nichts geschrieben): %d neu, %d aktualisiert, %d übersprungen.', $s['insert'], $s['update'], $s['skip']);
        $dirty = $apply && ($s['insert'] > 0 || $s['update'] > 0);
    }
}

// Flush the campaign cache group only after a real mutation, so the storefront
// updates now (a dry-run preview writes nothing and must not flush).
if ($dirty) {
    Shop::Container()->getCache()->flushTags(['metzler_campaigns']);
}

$smarty->assign('campaigns', $repo->all())
       ->assign('mzImportReport', $importReport)
       ->assign('mzMessage', $msg);

// TODO: assign the shop's Aktionen + category tree for the editor selects.
return $smarty->fetch(__DIR__ . '/template/campaigns.tpl');
