/**
 * SpaceHub — Onboarding Wizard
 * Parcours de découverte utilisateur et administrateur.
 */
'use strict';

import Logger from '../../core/Logger.js';
import Modal from './Modal.js';

import './OnboardingWizard.css';
import * as svc from '../../core/services.js';
const USER_VERSION = 1;
const ADMIN_VERSION = 1;

const USER_STEPS = [
    {
        icon: '🚀',
        title: 'Bienvenue dans SpaceHub',
        text: 'Votre interface client Jellyfin unifiée. Les bibliothèques, médias et statuts affichés proviennent de votre serveur.',
        hint: 'Utilisez les flèches ou la télécommande pour parcourir le guide.'
    },
    {
        icon: '🧭',
        title: 'Naviguez rapidement',
        text: 'Depuis la barre supérieure, accédez à Accueil, Bibliothèques et Flux. Le focus visible indique toujours l’action active.',
        hint: 'Flèches : déplacer le focus · Entrée/A : sélectionner · Retour/B : revenir.'
    },
    {
        icon: '☰',
        title: 'Retrouvez le menu latéral',
        text: 'Ouvrez le menu avec la touche Menu de votre télécommande ou de votre manette pour accéder aux sections disponibles.',
        hint: 'Le menu se referme avec Retour/B ou en sélectionnant une destination.'
    },
    {
        icon: '🔎',
        title: 'Recherchez vos médias',
        text: 'La recherche permet de retrouver les éléments réellement indexés par Jellyfin et d’ouvrir leur fiche détaillée.',
        hint: 'Les résultats dépendent des droits de votre compte et des données du serveur.'
    },
    {
        icon: '▶️',
        title: 'Lisez et reprenez vos médias',
        text: 'Depuis une fiche ou une carte, lancez la lecture. SpaceHub conserve le parcours de navigation et s’appuie sur la progression Jellyfin.',
        hint: 'La lecture dépend du média, du serveur et des capacités de votre appareil.'
    },
    {
        icon: '✨',
        title: 'Personnalisez votre expérience',
        text: 'Choisissez un thème, ajustez votre accueil et retrouvez vos préférences dans Réglages. Ces préférences sont propres à votre appareil.',
        hint: 'Vous pourrez revoir ce guide à tout moment depuis Réglages.'
    }
];

const ADMIN_STEPS = [
    {
        icon: '🛡️',
        title: 'Espace administrateur',
        text: 'Vous disposez des droits administrateur Jellyfin. Les actions sensibles de SpaceHub restent protégées par les permissions du serveur.',
        hint: 'SpaceHub n’invente jamais une capacité que Jellyfin ne fournit pas.'
    },
    {
        icon: '🗄️',
        title: 'Bibliothèques et métadonnées',
        text: 'Les bibliothèques sont lues depuis Jellyfin. Les fournisseurs externes peuvent être fusionnés selon une politique, avec une provenance conservée pour chaque champ.',
        hint: 'Une écriture de métadonnées exige une confirmation explicite.'
    },
    {
        icon: '🧩',
        title: 'Plugins Jellyfin et SDK',
        text: 'Les plugins installés sur le serveur Jellyfin sont distincts des extensions SDK exécutées dans le client. Leur état n’est marqué actif que si le serveur le confirme.',
        hint: 'Les extensions SDK distantes doivent être signées, intègres et approuvées.'
    },
    {
        icon: '🔌',
        title: 'Intégrations externes',
        text: 'Sonarr, Radarr, Prowlarr, Bazarr, Jellyseerr et qBittorrent sont des intégrations SpaceHub séparées des plugins Jellyfin.',
        hint: 'Chaque service indique clairement : non configuré, connecté, hors ligne ou accès refusé.'
    },
    {
        icon: '🎨',
        title: 'Personnalisez SpaceHub',
        text: 'Configurez les thèmes, widgets et sections du dashboard. Les choix locaux concernent l’appareil ; une politique globale nécessite le bridge serveur SpaceHub.',
        hint: 'Les données du serveur restent prioritaires sur les préférences de présentation.'
    },
    {
        icon: '✅',
        title: 'Vous êtes prêt',
        text: 'La console d’administration permet de vérifier les services, les plugins et les capacités réellement exposées par Jellyfin.',
        hint: 'Commencez par vérifier les connexions puis testez le client avec un compte utilisateur standard.'
    }
];

function safePart(value, fallback) {
    const input = String(value || fallback || 'unknown');
    return Array.from(input).map(char => char.codePointAt(0).toString(16)).join('') || 'unknown';
}

export class OnboardingWizard {
    constructor({ settings = null, auth = null, eventBus = null } = {}) {
        this._settings = settings || svc.settings() || null;
        this._auth = auth || svc.auth() || null;
        this._eventBus = eventBus || svc.eventBus() || null;
        this._log = new Logger('OnboardingWizard');
        this._modal = null;
        this._role = null;
        this._steps = [];
        this._index = 0;
        this._onComplete = null;
    }

    getStorageKey(role, suffix = 'completed') {
        const server = safePart(this._auth?.getServerUrl?.(), 'server');
        const user = safePart(this._auth?.getUserId?.(), 'user');
        return `onboarding.${server}.${user}.${role}.${suffix}`;
    }

    getVersion(role) { return role === 'admin' ? ADMIN_VERSION : USER_VERSION; }

    isCompleted(role) {
        return this._settings?.get(this.getStorageKey(role), false) === true
            && this._settings?.get(this.getStorageKey(role, 'version'), 0) >= this.getVersion(role);
    }

    isDismissed(role) {
        return this._settings?.get(this.getStorageKey(role, 'dismissed'), false) === true
            && this._settings?.get(this.getStorageKey(role, 'version'), 0) >= this.getVersion(role);
    }

    reset(role = null) {
        const targetRole = role || 'user';
        this._settings?.delete(this.getStorageKey(targetRole));
        this._settings?.delete(this.getStorageKey(targetRole, 'dismissed'));
        this._settings?.delete(this.getStorageKey(targetRole, 'version'));
        this._eventBus?.emit('onboarding:reset', { role: targetRole });
    }

    open(role = 'user', { force = true, onComplete = null } = {}) {
        const normalizedRole = role === 'admin' ? 'admin' : 'user';
        if (normalizedRole === 'admin' && this._auth?.getUser?.()?.Policy?.IsAdministrator !== true) {
            this._log.warn('Parcours administrateur refusé pour un utilisateur non administrateur.');
            return false;
        }
        if (!force && (this.isCompleted(normalizedRole) || this.isDismissed(normalizedRole))) return false;

        this.close();
        this._role = normalizedRole;
        this._steps = normalizedRole === 'admin' ? ADMIN_STEPS : USER_STEPS;
        this._index = 0;
        this._onComplete = onComplete;
        this._modal = new Modal({
            id: 'spacehub-onboarding',
            title: normalizedRole === 'admin' ? 'Découverte administrateur' : 'Découverte de SpaceHub',
            size: 'md',
            closeOnBackdrop: false,
            content: this._renderContent(),
            footer: this._renderFooter(),
            onOpen: modal => this._bindModal(modal),
            onClose: () => {
                // Le bouton de fermeture natif, Escape ou le backdrop ne doivent
                // pas faire réapparaître le guide automatiquement à chaque session.
                if (this._modal?.isOpen === false && this._role && !this.isCompleted(this._role) && !this.isDismissed(this._role)) {
                    this._settings?.set(this.getStorageKey(this._role, 'dismissed'), true);
                    this._settings?.set(this.getStorageKey(this._role, 'version'), this.getVersion(this._role));
                    this._eventBus?.emit('onboarding:skipped', { role: this._role, step: this._index + 1 });
                }
                if (this._modal?.isOpen === false) this._modal = null;
            }
        });
        this._modal.open();
        return true;
    }

    close({ completed = false } = {}) {
        if (!this._modal) return;
        const role = this._role;
        const callback = this._onComplete;
        if (completed) {
            this._settings?.set(this.getStorageKey(role), true);
            this._settings?.delete(this.getStorageKey(role, 'dismissed'));
            this._settings?.set(this.getStorageKey(role, 'version'), this.getVersion(role));
            this._eventBus?.emit('onboarding:completed', { role, version: this.getVersion(role) });
        } else {
            this._settings?.set(this.getStorageKey(role, 'dismissed'), true);
            this._settings?.set(this.getStorageKey(role, 'version'), this.getVersion(role));
            this._eventBus?.emit('onboarding:skipped', { role, step: this._index + 1 });
        }
        const modal = this._modal;
        modal.close();
        callback?.({ role, completed });
    }

    static async startForCurrentUser(wizard, { force = false } = {}) {
        if (!wizard || !wizard._auth?.isAuthenticated?.()) return false;
        const userFinished = wizard.isCompleted('user') || wizard.isDismissed('user');
        if (!force && userFinished && wizard._auth.getUser()?.Policy?.IsAdministrator !== true) return false;

        const openAdminIfNeeded = () => {
            if (wizard._auth.getUser()?.Policy?.IsAdministrator === true && (force || !wizard.isCompleted('admin'))) {
                return wizard.open('admin', { force: true });
            }
            return false;
        };

        if (force || !userFinished) {
            return wizard.open('user', {
                force: true,
                onComplete: () => {
                    if (!wizard.isCompleted('admin') && wizard._auth.getUser()?.Policy?.IsAdministrator === true) {
                        wizard.open('admin', { force: true });
                    }
                }
            });
        }
        return openAdminIfNeeded();
    }

    _renderContent() {
        const step = this._steps[this._index] || this._steps[0];
        const progress = Math.round(((this._index + 1) / this._steps.length) * 100);
        const roleLabel = this._role === 'admin' ? 'PARCOURS ADMINISTRATEUR' : 'PREMIÈRE DÉCOUVERTE';
        return `
            <div class="sh-onboarding" data-onboarding-role="${this._role}">
                <div class="sh-onboarding__badge">${roleLabel}</div>
                <div class="sh-onboarding__hero" aria-live="polite">
                    <div class="sh-onboarding__icon" aria-hidden="true">${step.icon}</div>
                    <div class="sh-onboarding__progress"><span style="width:${progress}%"></span></div>
                    <span class="sh-onboarding__counter">Étape ${this._index + 1} sur ${this._steps.length}</span>
                </div>
                <h3 class="sh-onboarding__title">${step.title}</h3>
                <p class="sh-onboarding__text">${step.text}</p>
                <div class="sh-onboarding__hint">${step.hint}</div>
            </div>
        `;
    }

    _renderFooter() {
        return `
            <button class="sh-btn sh-btn--ghost" data-onboarding-action="skip">Ignorer</button>
            <span class="sh-onboarding__footer-spacer"></span>
            <button class="sh-btn sh-btn--ghost" data-onboarding-action="previous" disabled>Précédent</button>
            <button class="sh-btn sh-btn--primary" data-onboarding-action="next">Suivant</button>
        `;
    }

    _bindModal(modal) {
        const root = modal._el;
        root.classList.add('sh-onboarding-modal');
        const refresh = () => {
            modal.setContent(this._renderContent());
            const previous = root.querySelector('[data-onboarding-action="previous"]');
            const next = root.querySelector('[data-onboarding-action="next"]');
            if (previous) previous.disabled = this._index === 0;
            if (next) next.textContent = this._index === this._steps.length - 1 ? 'Terminer' : 'Suivant';
            const focusTarget = next?.disabled ? previous : next;
            const spatialNav = svc.nav() || svc.nav();
            if (focusTarget) {
                spatialNav?.onModalOpened?.(root, focusTarget);
                focusTarget.focus?.();
            }
        };

        root.querySelector('[data-onboarding-action="skip"]')?.addEventListener('click', () => this.close());
        root.querySelector('[data-onboarding-action="previous"]')?.addEventListener('click', () => {
            if (this._index > 0) { this._index -= 1; refresh(); }
        });
        root.querySelector('[data-onboarding-action="next"]')?.addEventListener('click', () => {
            if (this._index < this._steps.length - 1) {
                this._index += 1;
                refresh();
            } else {
                this.close({ completed: true });
            }
        });
        // Modal.open() programme son propre focus dans requestAnimationFrame.
        // Programmer le nôtre après lui garantit que Suivant est bien le focus TV initial.
        requestAnimationFrame(refresh);
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans OnboardingWizard.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default OnboardingWizard;
