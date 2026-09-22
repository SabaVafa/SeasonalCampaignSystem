{*
  Campaign hero. Render this where the start-page hero belongs — via an OnPage
  Composer Portlet, a Box, or an {include} in a child template. Reads $oKampagne
  assigned by Bootstrap. The `mz-` CSS ships with the plugin (see README).
*}
{if isset($oKampagne) && $oKampagne && !$oKampagne.fallback}
    <section class="mz-campaign-hero{if $oKampagne.template == 'blackfriday'} mz-hero--bf{/if}"
             {if $oKampagne.heroImage} style="--mz-hero-img:url('{$oKampagne.heroImage|escape}')"{/if}>
        <div class="container">
            {if $oKampagne.eyebrow}
                <span class="mz-hero__eyebrow">{$oKampagne.eyebrow|escape}</span>
            {/if}
            <h1 class="mz-hero__headline">{$oKampagne.heroHeadline|escape}</h1>
            {if isset($metzlerCampaignBadge) && $metzlerCampaignBadge}
                <span class="mz-hero__badge">{$metzlerCampaignBadge|escape}</span>
            {/if}

            {if $oKampagne.endDate}
                <div class="mz-hero__countdown" data-mz-countdown data-end="{$oKampagne.endDate}T23:59:59"
                     aria-live="polite">Aktion l&auml;uft&hellip;</div>
            {/if}
        </div>
    </section>

    {* Progressive enhancement only — never blocks the server-rendered hero. *}
    <script>
    (function () {
        var el = document.querySelector('[data-mz-countdown]');
        if (!el) { return; }
        function tick() {
            var end = new Date(el.getAttribute('data-end')).getTime();
            var days = Math.max(0, Math.ceil((end - Date.now()) / 86400000));
            el.textContent = days > 0 ? 'Aktion läuft noch ' + days + ' Tage' : 'Aktion endet heute';
        }
        tick();
        setInterval(tick, 3600000);
    })();
    </script>
{/if}
