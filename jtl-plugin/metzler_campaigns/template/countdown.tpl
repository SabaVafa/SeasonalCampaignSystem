{*
  Standalone countdown Portlet variant (hero.tpl already inlines one). Use this
  when placing a countdown independently. Reads $oKampagne.endDate.
*}
{if isset($oKampagne) && $oKampagne && $oKampagne.endDate}
    <div class="mz-countdown" data-mz-countdown data-end="{$oKampagne.endDate}T23:59:59" aria-live="polite">
        Aktion l&auml;uft&hellip;
    </div>
    <script>
    (function () {
        var nodes = document.querySelectorAll('[data-mz-countdown]');
        nodes.forEach(function (el) {
            if (el.dataset.mzBound) { return; }
            el.dataset.mzBound = '1';
            function tick() {
                var end = new Date(el.getAttribute('data-end')).getTime();
                var days = Math.max(0, Math.ceil((end - Date.now()) / 86400000));
                el.textContent = days > 0 ? 'Aktion läuft noch ' + days + ' Tage' : 'Aktion endet heute';
            }
            tick();
            setInterval(tick, 3600000);
        });
    })();
    </script>
{/if}
