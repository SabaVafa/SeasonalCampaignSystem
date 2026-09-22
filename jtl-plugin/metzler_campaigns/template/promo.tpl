{*
  Sitewide promo strip. Wire under the header (Box region or child-template
  include). Reads $oKampagne assigned by Bootstrap.
*}
{if isset($oKampagne) && $oKampagne && !$oKampagne.fallback && $oKampagne.promoStrip}
    <div class="mz-promo-strip{if $oKampagne.template == 'blackfriday'} mz-promo-strip--bf{/if}">
        <div class="container">
            <span class="mz-promo-strip__text">{$oKampagne.promoStrip|escape}</span>
        </div>
    </div>
{/if}
