#!/usr/bin/env node
/**
 * Codemod — les capitales quittent les étiquettes de métadonnées
 * ==============================================================
 *
 * POURQUOI. 27 déclarations `text-transform: uppercase` habillent des
 * métadonnées — badges, tags, libellés de cellules, en-têtes de section. Les
 * capitales détruisent la silhouette des mots : elles coûtent exactement ce que
 * la télévision ne peut pas payer, la reconnaissance à distance. Le badge
 * « CRITIQUES » ne se lit pas plus vite que « Critiques » ; il se lit moins vite.
 *
 * CE QU'IL NE TOUCHE PAS, ET POURQUOI.
 *   · `.sh-lib-table th` — un en-tête de colonne est un repère structurel dans
 *     un tableau, pas une étiquette décorative. La convention y est ancienne et
 *     utile.
 *   · `.sh-hero-scroll-hint` — un libellé de CONTRÔLE compact, pas une
 *     métadonnée.
 * La frontière est celle-ci : la casse peut servir une structure, jamais meubler.
 *
 * Le codemod cible des SÉLECTEURS nommés, pas un motif : c'est la seule façon
 * de retirer la bonne déclaration sans emporter ses voisines. Usage unique —
 * supprimé après passage.
 */

import fs from 'node:fs';

const CIBLES = {
    'core/TrailerService.css': ['.sh-trailer-window__badge'],
    'jellyfin/player/VideoPlayer.css': ['.sh-popover-section-title', '.sh-popover-sub-sync-title'],
    'jellyfin/search/UnifiedSearch.css': ['.sh-jellyseerr-search-badge'],
    'ui/components/AppSidebarDrawer.css': ['.sh-sidebar-modal-badge', '.sh-ambilight-section-label'],
    // Le plus parlant du lot : une étiquette de codec à 9 px, graisse 800,
    // capitales et interlettrage — le texte le plus difficile à lire de
    // l'application, posé sur une affiche, sur l'appareil qu'on regarde à
    // trois mètres.
    'ui/components/CardBuilder.css': [
        '.sh-popover-tag', '.sh-context-menu__header', '.sh-card__codec-tag',
    ],
    'ui/components/HeroSpotlightComponent.css': ['.sh-hero-series-tag'],
    'ui/components/ModalSlideUpSheet.css': [
        '.sh-bonus-pill-tag', '.sh-popover-section-header', '.sh-section-subtitle',
        '.sh-critics-badge', '.sh-cell-label',
    ],
    'ui/views/DownloadsView.css': ['.sh-bazarr-type-badge'],
    'ui/views/LibraryView.css': ['.sh-lib-badge-pill', '.sh-lib-modal-badge'],
    'ui/views/LoginView.css': ['.sh-login-field label'],
    'integrations/bazarr/BazarrWidgets.css': ['.sh-bazarr-type-badge'],
    'integrations/jellyseerr/JellyseerrWidgets.css': [
        '.sh-jellyseerr-section-header', '.sh-jellyseerr-modal-type-tag',
    ],
    'integrations/prowlarr/ProwlarrWidgets.css': ['.sh-prowlarr-stat-label', '.sh-prowlarr-badge'],
    'integrations/qbittorrent/QBittorrentWidgets.css': ['.sh-qbit-speed-lbl'],
};

let retires = 0;

for (const [chemin, selecteurs] of Object.entries(CIBLES)) {
    if (!fs.existsSync(chemin)) {
        console.error(`  ✖ ${chemin} : introuvable`);
        continue;
    }
    const source = fs.readFileSync(chemin, 'utf8');
    // Les fichiers d'intégration sont en CRLF : joindre en LF réécrirait le
    // fichier entier pour une déclaration retirée. On préserve la convention.
    const saut = source.includes('\r\n') ? '\r\n' : '\n';
    const lignes = source.split(/\r?\n/);
    const sortie = [];
    let selecteurCourant = null;

    for (const ligne of lignes) {
        // Repère du bloc courant : la dernière ligne ouvrante avant la déclaration.
        // Un sélecteur commence par `.`, `#` ou une lettre ; `@media` est ignoré.
        const entete = ligne.split('{')[0].trim();
        if (ligne.includes('{') && /^[.#A-Za-z]/.test(entete) && !entete.startsWith('@')) {
            selecteurCourant = entete;
        }
        if (ligne.includes('}')) selecteurCourant = null;

        const dansLaCible = selecteurCourant !== null
            && selecteurs.some(s => selecteurCourant.includes(s));

        if (dansLaCible && /text-transform:\s*uppercase/.test(ligne)) {
            retires += 1;
            continue; // la ligne disparaît
        }
        sortie.push(ligne);
    }
    fs.writeFileSync(chemin, sortie.join(saut));
}

console.log(`Codemod : ${retires} déclaration(s) « text-transform: uppercase » retirée(s).`);
