{*
  Backend authoring view (scaffold).

  This is a minimal, working list + status/delete controls. The polished
  standalone admin (admin.html: premium dropdowns, search/filter, overlap
  warning, drawer editor) should be ported here — its markup/CSS/JS drops in
  almost unchanged; only swap the localStorage store for POSTs to campaigns.php
  (action=save|delete|toggle).
*}
{if $mzMessage}
    <div class="alert alert-success">{$mzMessage}</div>
{/if}

{* R6 — one-shot seed importer (idempotent, dry-run first). *}
<div class="card mb-3">
    <div class="card-header">Seed importieren (20 Prototyp-Kampagnen)</div>
    <div class="card-body">
        <p class="text-muted mb-2">
            Lädt die mitgelieferten Kampagnen aus <code>data/campaigns.seed.json</code>.
            Idempotent: bestehende Kampagnen werden standardmäßig <strong>übersprungen</strong>
            (keine Überschreibung von Admin-Änderungen). Verknüpfte JTL-Aktionen bleiben immer erhalten;
            es wird kein Rabatt importiert.
        </p>
        <form method="post" class="form-inline">
            <input type="hidden" name="action" value="import">
            <label class="mr-3"><input type="checkbox" name="overwrite" value="1"> Bestehende überschreiben</label>
            <button class="btn btn-outline-secondary mr-2" type="submit" name="mode" value="preview">Vorschau (Probelauf)</button>
            <button class="btn btn-primary" type="submit" name="mode" value="apply"
                    onclick="return confirm('Seed jetzt importieren?');">Import ausführen</button>
        </form>

        {if $mzImportReport && $mzImportReport.ok}
            <div class="table-responsive mt-3">
                <table class="table table-sm mb-0">
                    <thead>
                        <tr><th>Kampagne</th><th>Aktion</th><th>Kategorien</th><th>Hinweise</th></tr>
                    </thead>
                    <tbody>
                        {foreach $mzImportReport.rows as $r}
                            <tr>
                                <td><strong>{$r.name|escape}</strong><br><small class="text-muted">{$r.identifier|escape}</small></td>
                                <td>
                                    {if $r.action == 'insert'}<span class="badge badge-success">neu</span>
                                    {elseif $r.action == 'update'}<span class="badge badge-info">aktualisiert</span>
                                    {else}<span class="badge badge-secondary">übersprungen</span>{/if}
                                </td>
                                <td>{$r.categories}</td>
                                <td>
                                    {if $r.warnings}
                                        {foreach $r.warnings as $w}<div class="text-warning small">{$w|escape}</div>{/foreach}
                                    {else}<span class="text-muted">&mdash;</span>{/if}
                                </td>
                            </tr>
                        {/foreach}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
</div>

<div class="card">
    <div class="card-header d-flex align-items-center">
        <span>Saison-Kampagnen</span>
        <a href="#mz-editor" class="btn btn-primary btn-sm ml-auto">Neue Kampagne</a>
    </div>
    <div class="card-body p-0">
        <table class="table table-hover mb-0">
            <thead>
                <tr>
                    <th>Status</th>
                    <th>Name</th>
                    <th>Zeitraum</th>
                    <th>Priorität</th>
                    <th>Aktion (Rabatt)</th>
                    <th class="text-right">Aktionen</th>
                </tr>
            </thead>
            <tbody>
                {foreach $campaigns as $c}
                    <tr>
                        <td>
                            {if $c.fallback}<span class="badge badge-secondary">Fallback</span>
                            {elseif $c.disabled}<span class="badge badge-warning">Pausiert</span>
                            {else}<span class="badge badge-success">Aktiv planbar</span>{/if}
                        </td>
                        <td>
                            <strong>{$c.name|escape}</strong><br>
                            <small class="text-muted">{$c.identifier|escape}</small>
                        </td>
                        <td>
                            {if $c.startDate}{$c.startDate}&nbsp;&ndash;&nbsp;{$c.endDate}{if $c.recurring} · jährl.{/if}
                            {else}<span class="text-muted">Immer</span>{/if}
                        </td>
                        <td>{$c.priority}</td>
                        <td>
                            {if $c.kAktion}<span class="badge badge-info">Aktion #{$c.kAktion}</span>
                            {else}<span class="text-muted">&mdash;</span>{/if}
                        </td>
                        <td class="text-right">
                            {if !$c.fallback}
                                <form method="post" class="d-inline">
                                    <input type="hidden" name="action" value="toggle">
                                    <input type="hidden" name="kCampaign" value="{$c.kCampaign}">
                                    <input type="hidden" name="disabled" value="{if $c.disabled}0{else}1{/if}">
                                    <button class="btn btn-sm btn-outline-secondary">
                                        {if $c.disabled}Fortsetzen{else}Pausieren{/if}
                                    </button>
                                </form>
                                <form method="post" class="d-inline" onsubmit="return confirm('Kampagne löschen?');">
                                    <input type="hidden" name="action" value="delete">
                                    <input type="hidden" name="kCampaign" value="{$c.kCampaign}">
                                    <button class="btn btn-sm btn-outline-danger">Löschen</button>
                                </form>
                            {/if}
                        </td>
                    </tr>
                {foreachelse}
                    <tr><td colspan="6" class="text-center text-muted py-4">Noch keine Kampagnen angelegt.</td></tr>
                {/foreach}
            </tbody>
        </table>
    </div>
</div>

{* Minimal create/edit form. Replace with the ported drawer editor. *}
<div class="card mt-3" id="mz-editor">
    <div class="card-header">Kampagne anlegen / bearbeiten</div>
    <div class="card-body">
        <form method="post" class="form-row">
            <input type="hidden" name="action" value="save">
            <input type="hidden" name="kCampaign" value="">
            <div class="form-group col-md-6">
                <label>Name</label>
                <input class="form-control" name="name" required>
            </div>
            <div class="form-group col-md-6">
                <label>ID (Slug)</label>
                <input class="form-control" name="identifier" required>
            </div>
            <div class="form-group col-md-3">
                <label>Start</label>
                <input type="date" class="form-control" name="startDate">
            </div>
            <div class="form-group col-md-3">
                <label>Ende</label>
                <input type="date" class="form-control" name="endDate">
            </div>
            <div class="form-group col-md-3">
                <label>Priorität</label>
                <input type="number" class="form-control" name="priority" value="50">
            </div>
            <div class="form-group col-md-3">
                <label>Vorlage</label>
                <select class="form-control" name="template">
                    <option value="">Standard</option>
                    <option value="blackfriday">Black Month (Premium)</option>
                </select>
            </div>
            <div class="form-group col-md-3">
                <label>Farbwelt (data-camp-theme)</label>
                <select class="form-control" name="accent">
                    <option value="">Standard (brand-default)</option>
                    <option value="brand-default">brand-default</option>
                    <option value="cool-blue">cool-blue</option>
                    <option value="spring-green">spring-green</option>
                    <option value="warm-pastel">warm-pastel</option>
                    <option value="architect-grey">architect-grey</option>
                    <option value="security-teal">security-teal</option>
                    <option value="security-steel-soft">security-steel-soft</option>
                    <option value="sun-gold">sun-gold</option>
                    <option value="amber-warm">amber-warm</option>
                    <option value="black-deal">black-deal</option>
                    <option value="festive-red">festive-red</option>
                    <option value="festive-gold">festive-gold</option>
                    <option value="winter-silver">winter-silver</option>
                </select>
            </div>
            <div class="form-group col-md-6">
                <label>Hero-Überschrift</label>
                <input class="form-control" name="heroHeadline">
            </div>
            <div class="form-group col-md-6">
                <label>Verknüpfte JTL-Aktion (kAktion) — der bindende Rabatt</label>
                <input type="number" class="form-control" name="kAktion" placeholder="z. B. 42">
                <small class="form-text text-muted">Der Rabatt wird von JTL erzwungen. Dieses Plugin rechnet keine Preise.</small>
            </div>
            <div class="form-group col-12">
                <label class="mr-3"><input type="checkbox" name="recurring" value="1" checked> Jährlich wiederkehrend</label>
                <label><input type="checkbox" name="disabled" value="1"> Pausiert</label>
            </div>
            <div class="col-12">
                <button class="btn btn-primary" type="submit">Speichern</button>
            </div>
        </form>
    </div>
</div>
