/**
 * SpaceHub — Login View
 * Version: 2.0.0 — Apple TV / VisionOS Premium
 *
 * Écran de connexion immersif OLED avec fond nébuleuse, carte glass,
 * champs dark glass, bouton pill blanc animé et états de chargement premium.
 */

'use strict';


import './LoginView.css';
import * as svc from '../../core/services.js';
class LoginView {
    /**
     * @param {Function} onLoginSuccess  Rappel exécuté après une connexion réussie.
     * @param {Object}  [options]
     * @param {string}  [options.avis]   Message affiché en haut de la carte,
     *   par exemple « votre session a expiré ». Il explique POURQUOI on est
     *   revenu ici : sans lui, une session révoquée côté serveur ramenait
     *   l'utilisateur à l'écran de connexion sans un mot d'explication.
     */
    constructor(onLoginSuccess, options = {}) {
        this.onLoginSuccess = onLoginSuccess;
        this._avis = typeof options.avis === 'string' ? options.avis : '';
        this._injectStyles();
    }

    render(container) {
        container.innerHTML = `
            <div class="sh-login-wrapper">
                <!-- Fond Nébuleuse Spatiale OLED -->
                <div class="sh-login-nebula" aria-hidden="true">
                    <div class="sh-login-nebula__orb sh-login-nebula__orb--1"></div>
                    <div class="sh-login-nebula__orb sh-login-nebula__orb--2"></div>
                    <div class="sh-login-nebula__orb sh-login-nebula__orb--3"></div>
                </div>

                <!-- Carte Glass -->
                <div class="sh-login-card">
                    <!-- Logo -->
                    <div class="sh-login-header">
                        <div class="sh-login-brand">
                            <div class="sh-login-luminous-dot" title="SpaceHub Active">
                                <div class="sh-login-dot-core"></div>
                            </div>
                            <svg class="sh-login-rocket" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
                                <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"></path>
                            </svg>
                            <span class="sh-login-brand-name">SpaceHub</span>
                        </div>
                        <p class="sh-login-subtitle">Connectez-vous à votre serveur Jellyfin</p>
                    </div>

                    <!-- Avis de contexte (session expirée, déconnexion forcée…). -->
                    <div class="sh-login-notice" id="sh-login-notice" role="status" style="display:none;"></div>

                    <!-- Formulaire -->
                    <form class="sh-login-form" id="sh-login-form" novalidate>
                        <div class="sh-login-field">
                            <label for="server-url">URL du Serveur</label>
                            <div class="sh-login-input-wrap">
                                <svg class="sh-login-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="2" y1="12" x2="22" y2="12"></line>
                                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                                </svg>
                                <!-- inputmode="url" : sur un téléphone, le clavier doit
                                     proposer la barre oblique et le point sans basculer
                                     en alphabet. spellcheck="false" et autocomplete="off" :
                                     une URL n'est pas un mot à corriger, et la faire
                                     compléter par le dictionnaire est une nuisance. -->
                                <input type="url" id="server-url" class="sh-input sh-login-input" placeholder="http://192.168.1.100:8096" value="http://localhost:8096" inputmode="url" spellcheck="false" autocapitalize="none" autocomplete="off" required />
                            </div>
                        </div>

                        <!-- Comptes du serveur : rempli après lecture de /Users/Public.
                             Reste masqué si le serveur ne publie aucun compte, auquel
                             cas la saisie du nom ci-dessous reste le seul chemin. -->
                        <div class="sh-login-field sh-login-profiles" id="sh-login-profiles" style="display:none;">
                            <!-- Un label sans for et sans contrôle enveloppé n'étiquette
                                 rien : le groupe restait anonyme pour un lecteur
                                 d'écran. role="group" + aria-labelledby fait du
                                 libellé un vrai nom de groupe, sans introduire de
                                 fieldset dont la mise en page serait à refaire. -->
                            <label id="sh-login-profiles-label">Choisissez votre profil</label>
                            <div class="sh-login-profile-grid" id="sh-login-profile-grid" role="group" aria-labelledby="sh-login-profiles-label"></div>
                        </div>

                        <div class="sh-login-field">
                            <label for="username">Nom d'utilisateur</label>
                            <div class="sh-login-input-wrap">
                                <svg class="sh-login-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                </svg>
                                <!-- Pas d'autofocus : sur un téléphone, le charger ouvre
                                     le clavier virtuel d'office et masque la moitié de
                                     l'écran avant que l'utilisateur ait rien demandé.
                                     Le focus est posé explicitement quand un profil est
                                     choisi (voir _choisirProfil), là où il suit une
                                     intention. -->
                                <input type="text" id="username" class="sh-input sh-login-input" placeholder="Votre identifiant" required spellcheck="false" autocapitalize="none" autocomplete="username" />
                            </div>
                        </div>

                        <div class="sh-login-field">
                            <label for="password">Mot de passe</label>
                            <div class="sh-login-input-wrap">
                                <svg class="sh-login-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                                <input type="password" id="password" class="sh-input sh-login-input" placeholder="Mot de passe (optionnel)" autocomplete="current-password" />
                            </div>
                        </div>

                        <!-- Erreur -->
                        <div class="sh-login-error" id="sh-login-error" style="display:none;" role="alert"></div>

                        <!-- Bouton Connexion -->
                        <button type="submit" class="sh-login-btn" id="sh-login-btn">
                            <span class="sh-login-btn__content" id="sh-login-btn-content">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
                                    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"></path>
                                </svg>
                                <span>Se connecter</span>
                            </span>
                            <span class="sh-login-btn__loading" id="sh-login-btn-loading" style="display:none;">
                                <svg class="sh-login-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                    <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                                    <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
                                </svg>
                                <span>Connexion...</span>
                            </span>
                        </button>

                        <!-- Quick Connect. Masqué tant qu'on n'a pas vérifié que
                             le serveur le propose : l'administrateur peut l'avoir
                             désactivé, et un bouton qui ne marche pas est pire
                             qu'un bouton absent. -->
                        <button type="button" class="sh-login-btn sh-login-btn--secondaire"
                                id="sh-btn-quick-connect" style="display:none;"
                                tabindex="0" data-nav-focusable="true">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <rect x="5" y="2" width="14" height="20" rx="2"></rect>
                                <line x1="12" y1="18" x2="12.01" y2="18"></line>
                            </svg>
                            <span>Se connecter depuis mon téléphone</span>
                        </button>

                        <!-- Le code à recopier. Grand, très lisible : il est lu
                             à trois mètres, sur un téléviseur. -->
                        <div class="sh-quick-connect" id="sh-quick-connect" style="display:none;" role="status">
                            <p class="sh-quick-connect__consigne">
                                Ouvrez Jellyfin sur votre téléphone ou votre ordinateur,
                                puis saisissez ce code dans <strong>Quick Connect</strong> :
                            </p>
                            <p class="sh-quick-connect__code" id="sh-quick-connect-code"></p>
                            <p class="sh-quick-connect__etat" id="sh-quick-connect-etat">En attente d'autorisation…</p>
                            <button type="button" class="sh-btn sh-btn--ghost" id="sh-quick-connect-annuler"
                                    tabindex="0" data-nav-focusable="true">Annuler</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // L'avis est injecté par `textContent` et jamais par `innerHTML` : son
        // contenu peut provenir d'un message serveur.
        const avisEl = container.querySelector('#sh-login-notice');
        if (avisEl && this._avis) {
            avisEl.textContent = this._avis;
            avisEl.style.display = '';
        }

        const form    = container.querySelector('#sh-login-form');
        const btn     = container.querySelector('#sh-login-btn');
        const errorEl = container.querySelector('#sh-login-error');
        const content = container.querySelector('#sh-login-btn-content');
        const loading = container.querySelector('#sh-login-btn-loading');

        this._preremplirDepuisDerniereSession(container);
        this._brancherProfils(container);
        this._brancherQuickConnect(container);

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const serverUrl = container.querySelector('#server-url').value.trim();
            const username  = container.querySelector('#username').value.trim();
            const password  = container.querySelector('#password').value;

            btn.disabled     = true;
            content.style.display = 'none';
            loading.style.display  = 'flex';
            errorEl.style.display  = 'none';

            const auth = svc.auth();
            const res  = await auth.login(serverUrl, username, password);

            if (res.success) {
                // Succès — animation de validation
                loading.style.display = 'none';
                content.style.display = 'flex';
                btn.classList.add('sh-login-btn--success');
                this.onLoginSuccess?.(res.user);
            } else {
                errorEl.textContent      = res.error || 'Erreur lors de la connexion.';
                errorEl.style.display    = 'block';
                btn.disabled             = false;
                content.style.display   = 'flex';
                loading.style.display   = 'none';
                // Shake sur erreur
                const card = container.querySelector('.sh-login-card');
                card.classList.add('sh-login-card--shake');
                setTimeout(() => card.classList.remove('sh-login-card--shake'), 500);
            }
        });
    }

    /**
     * Propose les comptes du serveur au lieu d'un champ texte vide.
     *
     * L'audit relevait que l'application était mono-utilisateur en pratique :
     * il fallait connaître et retaper son identifiant. Jellyfin publie les
     * comptes visibles sur `/Users/Public` — de quoi afficher un choix de
     * profils, comme le fait le client officiel.
     *
     * Trois précautions :
     *   - la liste est chargée après le premier rendu, jamais avant : l'écran
     *     de connexion doit s'afficher même si le serveur est injoignable ;
     *   - un serveur qui masque ses comptes renvoie une liste vide et la
     *     section reste cachée — pas de bloc vide, pas de message d'erreur ;
     *   - choisir un profil remplit le nom et place le focus sur le mot de
     *     passe. Le compte sans mot de passe est connecté directement, ce que
     *     l'administrateur a explicitement autorisé côté serveur.
     */
    /**
     * Pré-remplit l'écran avec la dernière session connue.
     *
     * Depuis que le jeton ne survit plus à la fermeture du navigateur (voir
     * la note dans `AuthManager._loadAuth`), l'utilisateur repasse par cet
     * écran à chaque nouvelle session. Ce serait un net recul si tout était à
     * ressaisir. `AuthManager.derniereSession()` conserve — dans localStorage,
     * et sans aucun secret — l'adresse du serveur et le nom du compte : il ne
     * reste donc que le mot de passe à taper, et le focus y est posé
     * directement.
     *
     * @param {HTMLElement} container
     */
    _preremplirDepuisDerniereSession(container) {
        const derniere = svc.auth()?.derniereSession?.();
        if (!derniere) return;

        const champServeur = container.querySelector('#server-url');
        const champNom = container.querySelector('#username');
        const champMdp = container.querySelector('#password');

        if (champServeur && derniere.ServerUrl) champServeur.value = derniere.ServerUrl;
        if (champNom && derniere.UserName) champNom.value = derniere.UserName;

        // Le champ utile est celui qui reste vide.
        if (champMdp && derniere.UserName) {
            champMdp.setAttribute('autofocus', 'autofocus');
            champNom?.removeAttribute('autofocus');
            requestAnimationFrame(() => champMdp.focus());
        }
    }

    /**
     * Connexion par code, depuis un appareil qui a un clavier.
     *
     * Saisir un mot de passe complexe avec un pavé directionnel — quatre
     * flèches et Entrée pour chaque caractère — est l'un des pires moments
     * d'usage qui soient. Ici, le téléviseur affiche un code court,
     * l'utilisateur l'autorise depuis son téléphone, et la session s'ouvre.
     *
     * Deux précautions qui comptent :
     *   • le bouton reste MASQUÉ tant qu'on n'a pas vérifié que le serveur
     *     propose Quick Connect — l'administrateur peut l'avoir désactivé ;
     *   • le sondage s'arrête tout seul au bout de cinq minutes, sinon il
     *     tournerait indéfiniment sur un écran que personne ne regarde.
     *
     * @param {HTMLElement} container
     */
    _brancherQuickConnect(container) {
        const bouton = container.querySelector('#sh-btn-quick-connect');
        const zone = container.querySelector('#sh-quick-connect');
        const champCode = container.querySelector('#sh-quick-connect-code');
        const champEtat = container.querySelector('#sh-quick-connect-etat');
        const annuler = container.querySelector('#sh-quick-connect-annuler');
        const champServeur = container.querySelector('#server-url');
        if (!bouton || !zone || !champServeur) return;

        const auth = svc.auth();
        if (!auth?.quickConnectDemarrer) return;

        let sondage = null;
        let expiration = null;

        const arreter = () => {
            if (sondage) { clearInterval(sondage); sondage = null; }
            if (expiration) { clearTimeout(expiration); expiration = null; }
        };

        const fermer = () => {
            arreter();
            zone.style.display = 'none';
            bouton.style.display = '';
            bouton.focus?.();
        };

        // Le bouton n'apparaît que si le serveur répond que c'est activé.
        const verifierDisponibilite = async () => {
            bouton.style.display = 'none';
            const dispo = await auth.quickConnectDisponible?.(champServeur.value.trim());
            if (dispo) bouton.style.display = '';
        };
        verifierDisponibilite();
        champServeur.addEventListener('change', verifierDisponibilite);
        champServeur.addEventListener('blur', verifierDisponibilite);

        bouton.addEventListener('click', async () => {
            const demande = await auth.quickConnectDemarrer(champServeur.value.trim());
            if (!demande.ok) {
                const erreur = container.querySelector('#sh-login-error');
                if (erreur) {
                    erreur.textContent = demande.erreur || 'Quick Connect indisponible.';
                    erreur.style.display = 'block';
                }
                return;
            }

            // Le CODE s'affiche ; le SECRET ne quitte jamais cette variable.
            champCode.textContent = demande.code;
            champEtat.textContent = 'En attente d\'autorisation…';
            bouton.style.display = 'none';
            zone.style.display = '';
            annuler?.focus?.();

            sondage = setInterval(async () => {
                if (!(await auth.quickConnectAutorise(demande.secret))) return;
                arreter();
                champEtat.textContent = 'Autorisé — connexion en cours…';
                const res = await auth.quickConnectTerminer(demande.secret);
                if (res.success) {
                    this.onLoginSuccess?.(res.user);
                } else {
                    champEtat.textContent = res.error || 'Connexion refusée.';
                }
            }, 2000);

            // Cinq minutes : au-delà, la demande a expiré côté serveur de
            // toute façon, et rien ne sert de continuer à l'interroger.
            expiration = setTimeout(() => {
                arreter();
                champEtat.textContent = 'Code expiré. Réessayez.';
            }, 5 * 60 * 1000);
        });

        annuler?.addEventListener('click', fermer);
    }

    _brancherProfils(container) {
        const zone = container.querySelector('#sh-login-profiles');
        const grille = container.querySelector('#sh-login-profile-grid');
        const champServeur = container.querySelector('#server-url');
        const champNom = container.querySelector('#username');
        const champMdp = container.querySelector('#password');
        if (!zone || !grille || !champServeur) return;

        const auth = svc.auth();
        if (!auth?.getPublicUsers) return;

        let derniereUrl = null;
        const charger = async () => {
            const url = champServeur.value.trim();
            if (!url || url === derniereUrl) return;
            derniereUrl = url;
            let comptes = [];
            try { comptes = await auth.getPublicUsers(url); } catch { comptes = []; }
            if (!Array.isArray(comptes) || comptes.length === 0) {
                zone.style.display = 'none';
                grille.replaceChildren();
                return;
            }

            // Construction par le DOM, pas par innerHTML : les noms de comptes
            // viennent du serveur.
            const boutons = comptes.slice(0, 12).map(compte => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'sh-login-profile';
                b.setAttribute('tabindex', '0');
                b.setAttribute('data-nav-focusable', 'true');

                const vignette = document.createElement('span');
                vignette.className = 'sh-login-profile__avatar';
                if (compte.PrimaryImageTag && compte.Id) {
                    const img = document.createElement('img');
                    img.decoding = 'async';
                    img.loading = 'lazy';
                    img.alt = '';
                    img.src = `${url.replace(/\/$/, '')}/Users/${encodeURIComponent(compte.Id)}/Images/Primary?tag=${encodeURIComponent(compte.PrimaryImageTag)}&quality=90&maxHeight=160`;
                    img.addEventListener('error', () => { img.remove(); vignette.textContent = (compte.Name || '?').charAt(0).toUpperCase(); });
                    vignette.appendChild(img);
                } else {
                    vignette.textContent = (compte.Name || '?').charAt(0).toUpperCase();
                }

                const nom = document.createElement('span');
                nom.className = 'sh-login-profile__name';
                nom.textContent = compte.Name || '';

                b.append(vignette, nom);
                b.addEventListener('click', () => {
                    champNom.value = compte.Name || '';
                    grille.querySelectorAll('.sh-login-profile').forEach(x => x.classList.remove('selected'));
                    b.classList.add('selected');
                    if (compte.HasPassword === false) {
                        // Compte sans mot de passe : inutile de faire cliquer une
                        // seconde fois sur « Se connecter ».
                        container.querySelector('#sh-login-form')?.requestSubmit?.();
                    } else {
                        champMdp?.focus();
                    }
                });
                return b;
            });

            grille.replaceChildren(...boutons);
            zone.style.display = '';
        };

        // Au chargement, puis à chaque fois que l'URL du serveur change.
        charger();
        champServeur.addEventListener('change', charger);
        champServeur.addEventListener('blur', charger);
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans LoginView.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default LoginView;

