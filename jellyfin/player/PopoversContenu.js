/**
 * Popovers du lecteur — contenu et bascule, extraits de VideoPlayer.js (peau 4).
 * =============================================================================
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * Les quatre panneaux du dock (audio/sous-titres, réglages, versions,
 * épisodes) et leur bascule représentaient plus de trois cents lignes de
 * rendu DOM dans le monolithe — la plus grosse peau de la décomposition
 * (docs/DECOMPOSITION_VIDEOPLAYER.md). C'est du rendu : aucune de ces
 * lignes ne lit l'état du lecteur autrement que par les valeurs passées en
 * injection.
 *
 * CE QUI RESTE SUR LE LECTEUR
 * ---------------------------
 * Tout l'état (`_audioStreams`, `_selectedSubIndex`, `_subOffset`,
 * `_playbackRate`, `_versions`, `_seasonEpisodes`…) et tous les effets
 * (rechargement de la source, OSD, localStorage, lecture). Le module ne
 * connaît que des accesseurs (`obtenirEl`, `lireAudio`…) et des actions
 * (`choisirAudio`, `decalerSousTitres`…) — il n'écrit JAMAIS sur le lecteur.
 *
 * La bascule (`toggle`/`fermerTous`) reproduit l'original : un popover
 * ouvert est refermé avant d'en ouvrir un autre, et le contenu est rendu
 * au moment de l'ouverture — pas au montage du lecteur.
 */

/**
 * Crée l'objet popovers câblé sur UNE instance de lecteur. Les injections
 * sont des fonctions, jamais l'instance : le module ne peut ni lire ni
 * écrire un champ du lecteur par mégarde.
 */
export function creerPopovers(injections) {
    const {
        obtenirEl,
        echapper,
        echapperUrl,
        obtenirApi,
        lireAudio,          // () => { flux, selection }
        choisirAudio,       // (index, titre) => void
        lireSousTitres,     // () => { flux, selection }
        choisirSousTitre,   // (index, titre) => void
        decalerSousTitres,  // (delta) => void — la classe applique, annonce, étiquette
        lireVitesse,        // () => nombre
        choisirVitesse,     // (vitesse) => void
        lireAspect,         // () => modes (liste des object-fit)
        choisirAspect,      // (index, libelle) => void
        lireVersions,       // () => { versions, sourceActive }
        choisirVersion,     // (id) => void
        lireEpisodes,       // () => { episodes, itemCourant }
        choisirEpisode,     // (episode) => void
        lireSommeil,        // () => { actif, mode, restantMs } | null
        armerSommeil,       // ({ mode, minutes }) => boolean
        annulerSommeil,     // () => boolean
    } = injections;

    return {
        fermerTous() {
            const el = obtenirEl();
            el?.querySelectorAll('.sh-player-popover').forEach((p) => p.classList.remove('open'));
            el?.querySelectorAll('.sh-dock-pill-btn').forEach((b) => b.classList.remove('active'));
        },

        toggle(popoverId, triggerBtn) {
            const popover = obtenirEl()?.querySelector(`#${popoverId}`);
            if (!popover) return;

            const isOpen = popover.classList.contains('open');
            // Fermer tous les popovers ouverts, puis rouvrir si besoin.
            this.fermerTous();
            if (!isOpen) {
                this.rendreTous();
                popover.classList.add('open');
                triggerBtn?.classList.add('active');
            }
        },

        rendreTous() {
            this.rendreAudioSubs();
            this.rendreReglages();
            this.rendreVersions();
            this.rendreEpisodes();
        },

        rendreAudioSubs() {
            const el = obtenirEl();
            const audioList = el?.querySelector('#sh-player-audio-list');
            const subsList = el?.querySelector('#sh-player-subs-list');

            // 1. Pistes Audio
            if (audioList) {
                const { flux, selection } = lireAudio();
                if (!flux || flux.length === 0) {
                    audioList.innerHTML = '<div class="sh-popover-empty">Stéréo Standard</div>';
                } else {
                    audioList.innerHTML = flux.map((s) => {
                        const isSel = s.Index === selection;
                        const lang = (s.Language || 'und').toUpperCase();
                        const codec = (s.Codec || 'AAC').toUpperCase();
                        const channels = s.ChannelLayout || (s.Channels ? `${s.Channels} ch` : 'Stéréo');
                        const title = s.DisplayTitle || s.Title || `${lang} · ${codec} ${channels}`;

                        return `
                        <div class="sh-popover-item ${isSel ? 'selected' : ''}" tabindex="0" data-nav-focusable="true" data-audio-idx="${s.Index}">
                            <div class="sh-popover-item-name">${echapper(title)}</div>
                            <div class="sh-popover-item-badge">${codec} ${channels}</div>
                        </div>
                    `;
                    }).join('');

                    audioList.querySelectorAll('.sh-popover-item').forEach((item) => {
                        item.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const selectedIndex = parseInt(item.dataset.audioIdx, 10);
                            choisirAudio(selectedIndex, item.querySelector('.sh-popover-item-name')?.textContent || 'Audio');
                        });
                    });
                }
            }

            // 2. Sous-titres
            if (subsList) {
                const { flux: subFlux, selection: subSelection } = lireSousTitres();
                let subsHtml = `
                <div class="sh-popover-item ${subSelection === -1 ? 'selected' : ''}" tabindex="0" data-nav-focusable="true" data-sub-idx="-1">
                    <div class="sh-popover-item-name">Désactivé</div>
                </div>
            `;

                if (subFlux && subFlux.length > 0) {
                    subsHtml += subFlux.map((s) => {
                        const isSel = s.Index === subSelection;
                        const lang = (s.Language || 'und').toUpperCase();
                        const title = s.DisplayTitle || s.Title || `${lang} ${s.IsForced ? '(Forcé)' : ''}`;

                        return `
                        <div class="sh-popover-item ${isSel ? 'selected' : ''}" tabindex="0" data-nav-focusable="true" data-sub-idx="${s.Index}">
                            <div class="sh-popover-item-name">${echapper(title)}</div>
                            ${s.IsForced ? '<span class="sh-popover-item-badge" tabindex="0" data-nav-focusable="true">FORCÉ</span>' : ''}
                        </div>
                    `;
                    }).join('');
                }

                subsList.innerHTML = subsHtml;

                subsList.querySelectorAll('.sh-popover-item').forEach((item) => {
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const selectedIndex = parseInt(item.dataset.subIdx, 10);
                        choisirSousTitre(selectedIndex, item.querySelector('.sh-popover-item-name')?.textContent || 'Sous-titre');
                    });
                });
            }

            // 3. Stepper de Synchronisation
            const syncGrid = el?.querySelector('#sh-popover-audio-subs .sh-sync-grid');
            syncGrid?.querySelectorAll('.sh-sync-btn').forEach((btn) => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    decalerSousTitres(parseFloat(btn.dataset.offset));
                };
            });
        },

        rendreReglages() {
            const el = obtenirEl();
            const speedChips = el?.querySelector('#sh-player-speed-chips');
            const aspectChips = el?.querySelector('#sh-player-aspect-chips');
            const modes = lireAspect();
            const aspectLabels = { contain: '16:9 Adapté', cover: '21:9 Cinéma Scope', fill: 'Plein écran Étiré' };

            if (speedChips) {
                speedChips.querySelectorAll('[data-speed]').forEach((btn) => {
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        const spd = parseFloat(btn.dataset.speed);
                        choisirVitesse(spd);
                        const speedInd = el?.querySelector('#sh-speed-indicator');
                        if (speedInd) speedInd.textContent = `${spd}x`;
                        speedChips.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('active', parseFloat(b.dataset.speed) === spd));
                    };
                });
            }

            if (aspectChips) {
                aspectChips.querySelectorAll('[data-aspect-idx]').forEach((btn) => {
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        const idx = parseInt(btn.dataset.aspectIdx, 10);
                        const mode = modes[idx];
                        choisirAspect(idx, aspectLabels[mode] || mode);
                        aspectChips.querySelectorAll('[data-aspect-idx]').forEach((b) => b.classList.toggle('active', parseInt(b.dataset.aspectIdx, 10) === idx));
                    };
                });
            }

            this.rendreSommeil();
        },

        /**
         * Minuteur de sommeil — la seule porte d'entrée du module
         * `core/MinuteurSommeil.js`, qui n'en avait aucune.
         *
         * L'ÉTAT AFFICHÉ EST LU, JAMAIS SUPPOSÉ. Le panneau est reconstruit à
         * chaque ouverture : il doit donc montrer ce que le minuteur dit de
         * lui-même, y compris quand le minuteur a basculé tout seul de
         * « durée » à « fin du titre » (ce qu'il fait quand l'échéance tombe à
         * moins de cinq minutes de la fin). Deviner l'état depuis la pastille
         * cliquée en dernier afficherait « 30 min » alors que l'arrêt est déjà
         * programmé à la fin du titre.
         *
         * `restantMs` vaut `null` en mode « fin du titre », et ce `null` a un
         * sens : la durée est INCONNUE, pas nulle. On n'écrit donc pas
         * « 0 min » — le piège habituel de ce dépôt, où `Number(null)` vaut
         * zéro et zéro est fini.
         */
        rendreSommeil() {
            const el = obtenirEl();
            const chips = el?.querySelector('#sh-player-sommeil-chips');
            const etat = el?.querySelector('#sh-player-sommeil-etat');
            if (!chips) return;

            const courant = lireSommeil?.() ?? null;

            // Sans minuteur disponible, la section disparaît au lieu de
            // proposer des boutons morts.
            const section = chips.closest('.sh-popover-section');
            if (!courant) {
                if (section) section.hidden = true;
                return;
            }
            if (section) section.hidden = false;

            const actifDuree = courant.actif && courant.mode === 'duree';
            const minutesRestantes = actifDuree && typeof courant.restantMs === 'number'
                ? Math.max(1, Math.round(courant.restantMs / 60000))
                : null;

            chips.querySelectorAll('[data-sommeil]').forEach((btn) => {
                const valeur = btn.dataset.sommeil;
                const choisi = valeur === 'aucun'
                    ? !courant.actif
                    : (valeur === 'fin-titre'
                        ? courant.mode === 'fin-titre'
                        : false);
                btn.classList.toggle('active', choisi);
                btn.onclick = (e) => {
                    e.stopPropagation();
                    if (valeur === 'aucun') annulerSommeil?.();
                    else if (valeur === 'fin-titre') armerSommeil?.({ mode: 'fin-titre' });
                    else armerSommeil?.({ mode: 'duree', minutes: parseInt(valeur, 10) });
                    this.rendreSommeil();
                };
            });

            if (etat) {
                if (!courant.actif) etat.textContent = '';
                else if (courant.mode === 'fin-titre') etat.textContent = 'Arrêt à la fin de ce titre.';
                else if (minutesRestantes !== null) etat.textContent = `Arrêt dans ${minutesRestantes} min.`;
                else etat.textContent = 'Arrêt programmé.';
            }
        },

        /**
         * Propose les versions du média quand il y en a plusieurs.
         *
         * Avec le greffon « Merge Versions », un film peut exister en remux 4K
         * de 40 Go et en 1080p de 6 Go. Le lecteur prenait toujours la
         * première. Depuis l'extérieur du réseau, ce n'est pas le bon choix —
         * et personne ne pouvait le corriger.
         *
         * La section reste masquée quand il n'y a qu'une version : proposer un
         * « choix » d'une seule option est du bruit.
         */
        rendreVersions() {
            const el = obtenirEl();
            const section = el?.querySelector('#sh-player-versions-section');
            const chips = el?.querySelector('#sh-player-versions-chips');
            if (!section || !chips) return;

            const { versions, sourceActive } = lireVersions();
            if (versions.length < 2) { section.style.display = 'none'; return; }
            section.style.display = '';

            chips.innerHTML = versions.map((v) => {
                const actif = v.id === sourceActive ? 'active' : '';
                // Taille et débit sont ce qui décide réellement du choix.
                const details = [
                    v.taille ? `${(v.taille / 1073741824).toFixed(1)} Go` : '',
                    v.debit ? `${Math.round(v.debit / 1000000)} Mb/s` : '',
                ].filter(Boolean).join(' · ');
                return `<button class="sh-chip-btn ${actif}" tabindex="0" data-nav-focusable="true"
                        data-version-id="${echapper(v.id)}">${echapper(v.nom)}${details ? ` — ${details}` : ''}</button>`;
            }).join('');

            chips.querySelectorAll('[data-version-id]').forEach((btn) => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    choisirVersion(btn.dataset.versionId);
                };
            });
        },

        rendreEpisodes() {
            const el = obtenirEl();
            const epList = el?.querySelector('#sh-player-episodes-list');
            if (!epList) return;

            const { episodes, itemCourant } = lireEpisodes();
            if (episodes.length === 0) {
                epList.innerHTML = '<div class="sh-popover-empty">Aucun épisode disponible.</div>';
                return;
            }

            const currentId = itemCourant.Id || itemCourant.id;
            epList.innerHTML = episodes.map((ep) => {
                const isCur = ep.Id === currentId;
                const sNum = String(ep.ParentIndexNumber || 1).padStart(2, '0');
                const eNum = String(ep.IndexNumber || 1).padStart(2, '0');
                const imgUrl = echapperUrl(obtenirApi()?.getImageUrl(ep.Id, 'Primary', { maxWidth: 200, maxHeight: 112 }) || '');

                return `
                <div class="sh-popover-episode-row ${isCur ? 'selected' : ''}" data-ep-id="${ep.Id}">
                    <div class="sh-popover-ep-thumb">
                        <img decoding="async" src="${imgUrl}" alt="${echapper(ep.Name)}" onerror="this.style.display='none';"/>
                        <span class="sh-popover-ep-tag">S${sNum}E${eNum}</span>
                    </div>
                    <div class="sh-popover-ep-meta">
                        <div class="sh-popover-ep-name">${echapper(ep.Name)}</div>
                        <div class="sh-popover-ep-dur">${ep.RunTimeTicks ? Math.round(ep.RunTimeTicks / 600000000) + ' min' : ''}</div>
                    </div>
                </div>
            `;
            }).join('');

            epList.querySelectorAll('.sh-popover-episode-row').forEach((row) => {
                row.addEventListener('click', () => {
                    const epId = row.dataset.epId;
                    const targetEp = episodes.find((e) => e.Id === epId);
                    if (targetEp) choisirEpisode(targetEp);
                });
            });
        },
    };
}