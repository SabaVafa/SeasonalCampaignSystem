<?php

declare(strict_types=1);

namespace Plugin\metzler_campaigns\Migrations;

use JTL\Plugin\Migration;
use JTL\Update\IMigration;

/**
 * Create the campaign tables.
 *
 * The base Migration parses the run order from the timestamp in the class name
 * (Migration<YYYYMMDDHHMMSS>). `xplugin_` is the JTL convention for plugin
 * tables. These hold PRESENTATION + SCHEDULING only — never prices. The link to
 * the enforced discount is `kAktion` (a JTL Aktion) / `kSonderpreis`.
 */
class Migration20260908120000 extends Migration implements IMigration
{
    public function up(): void
    {
        $this->execute(
            "CREATE TABLE IF NOT EXISTS `xplugin_metzler_campaign` (
                `kCampaign`         INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
                `cIdentifier`       VARCHAR(64)  NOT NULL,
                `cName`             VARCHAR(255) NOT NULL,
                `cSeason`           VARCHAR(32)  NOT NULL DEFAULT 'all',
                `dStart`            DATE         DEFAULT NULL,
                `dEnd`              DATE         DEFAULT NULL,
                `nRecurring`        TINYINT(1)   NOT NULL DEFAULT 1,
                `nPriority`         INT(11)      NOT NULL DEFAULT 50,
                `nFallback`         TINYINT(1)   NOT NULL DEFAULT 0,
                `nDisabled`         TINYINT(1)   NOT NULL DEFAULT 0,
                `cTemplate`         VARCHAR(64)  DEFAULT NULL COMMENT 'e.g. blackfriday',
                `cAccent`           VARCHAR(32)  DEFAULT NULL COMMENT 'data-camp-theme palette key, e.g. festive-gold',
                `cHeroHeadline`     VARCHAR(255) DEFAULT NULL,
                `cEyebrow`          VARCHAR(255) DEFAULT NULL,
                `cPromoStrip`       VARCHAR(255) DEFAULT NULL,
                `cBadge`            VARCHAR(128) DEFAULT NULL,
                `cHeroImage`        VARCHAR(255) DEFAULT NULL,
                `cHeroImageMobile`  VARCHAR(255) DEFAULT NULL,
                `cTargetCategories` TEXT         DEFAULT NULL COMMENT 'JSON array of kKategorie',
                `kAktion`           INT(10) UNSIGNED DEFAULT NULL COMMENT 'FK -> JTL Aktion (via vMetzlerAktion): the SOLE source of the badge/discount. No discount value is stored here (R1) - the badge is derived from the live Aktion, so it can never disagree with the enforced price.',
                `dCreated`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `dModified`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`kCampaign`),
                UNIQUE KEY `idx_identifier` (`cIdentifier`),
                KEY `idx_window` (`dStart`, `dEnd`),
                KEY `idx_active` (`nDisabled`, `nFallback`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );

        $this->execute(
            "CREATE TABLE IF NOT EXISTS `xplugin_metzler_campaign_log` (
                `kLog`       INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
                `kCampaign`  INT(10) UNSIGNED DEFAULT NULL,
                `cAction`    VARCHAR(32)  NOT NULL COMMENT 'create|update|delete|pause|resume',
                `cUser`      VARCHAR(128) NOT NULL,
                `cDetail`    TEXT         DEFAULT NULL,
                `dTime`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`kLog`),
                KEY `idx_campaign` (`kCampaign`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `xplugin_metzler_campaign_log`');
        $this->execute('DROP TABLE IF EXISTS `xplugin_metzler_campaign`');
    }
}
