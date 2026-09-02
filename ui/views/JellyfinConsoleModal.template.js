/**
 * SpaceHub — Gabarit : console d'administration — onglet Modules
 *
 * 135 lignes listant les modules, les plugins SDK et les integrations Servarr.
 *
 * Ce module ne contient que du HTML. Il ne lit rien, n'ecrit rien, n'ecoute
 * rien : il transforme un objet de valeurs en chaine. Le comportement reste
 * entierement dans le composant appelant.
 *
 * Extrait mecaniquement du composant, sans reecriture : le HTML produit est
 * identique octet pour octet a celui d'avant l'extraction, ce que verifie
 * tests/gabarits.test.js contre une empreinte prise avant le deplacement.
 */

'use strict';

/**
 * @param {Object} ctx  valeurs necessaires au gabarit, fournies par l'appelant
 * @returns {string} HTML
 */
export function gabaritConsoleModules(ctx) {
    const { sdkPlugins, servarrIntegrations, serverPlugins, settings, svc } = ctx;
    return `
            <div class="sh-console-section">
                <!-- Section 1 : Intégrations Natives Servarr -->
                <div class="sh-console-section-header">
                    <div>
                        <div class="sh-console-brand-badge small">INTÉGRATIONS MÉDIAS & SERVARR</div>
                        <h3 class="sh-console-section-title">Services Connectés (${servarrIntegrations.length})</h3>
                        <p class="sh-console-section-sub">Services multimédias managés par SpaceHub avec supervision opérationnelle.</p>
                    </div>
                </div>

                <div class="sh-console-plugins-grid">
                    ${servarrIntegrations.map(mod => {
                        const isEnabled = settings?.get(`${mod.id}.enabled`, true) !== false;                                        const serviceInstance = svc.integration(mod.id);
                        const isConfigured = Boolean(
                            settings?.has?.(`${mod.id}.url`) && settings.get(`${mod.id}.url`)?.trim()
                        );


                        return `
                            <div class="sh-console-plugin-card">
                                <div class="sh-console-plugin-header">
                                    <div class="sh-console-plugin-icon">${ctx._escape(mod.icon)}</div>
                                    <div class="sh-console-plugin-info">
                                        <strong>${ctx._escape(mod.name)}</strong>
                                        <code>${isConfigured ? '🟢 Configuré & Actif' : '⚪ Non configuré'}</code>
                                    </div>
                                    <label class="sh-apple-switch">
                                        <input type="checkbox" class="sh-servarr-toggle" data-module-id="${mod.id}" ${isEnabled ? 'checked' : ''} />
                                        <span class="sh-apple-switch-slider"></span>
                                    </label>
                                </div>
                                <p class="sh-console-plugin-desc">${mod.desc}</p>
                            </div>
                        `;
                    }).join('')}
                </div>

                <!-- Section 2 : Extensions & Plugins SDK Reconnus -->
                <div class="sh-console-section-header" style="margin-top: 32px;">
                    <div>
                        <div class="sh-console-brand-badge small">SPACEHUB SDK CLIENT</div>
                        <h3 class="sh-console-section-title">Extensions & Plugins SDK (${sdkPlugins.length})</h3>
                        <p class="sh-console-section-sub">Plugins tiers et communautaires gérés par le PluginManager officiel.</p>
                    </div>
                </div>

                <div class="sh-console-plugins-grid" id="sh-console-sdk-plugins-grid">
                    ${sdkPlugins.length > 0 ? sdkPlugins.map(plugin => `
                        <div class="sh-console-plugin-card">
                            <div class="sh-console-plugin-header">
                                <div class="sh-console-plugin-icon">${plugin.icon}</div>
                                <div class="sh-console-plugin-info">
                                    <strong>${ctx._escape(plugin.name)}</strong>
                                    <code>v${ctx._escape(plugin.version)} • ${ctx._escape(plugin.author)}</code>
                                </div>
                                <label class="sh-apple-switch">
                                    <input type="checkbox" class="sh-sdk-plugin-toggle" data-plugin-id="${plugin.id}" ${plugin.isEnabled ? 'checked' : ''} />
                                    <span class="sh-apple-switch-slider"></span>
                                </label>
                            </div>
                            <p class="sh-console-plugin-desc">${ctx._escape(plugin.description || 'Aucune description.')}</p>
                            <small>Permissions : ${ctx._escape((plugin.permissions || []).join(', ') || 'aucune')}<br>Approuvées : ${ctx._escape((plugin.permissionPolicy?.approved || []).join(', ') || 'aucune')}</small>
                            <button class="sh-console-action-btn sh-sdk-approve" data-plugin-id="${ctx._escape(plugin.id)}">Approuver les permissions</button>
                        </div>
                    `).join('') : `
                        <div class="sh-console-empty-plugin-state" style="grid-column: 1 / -1; padding: 24px; text-align: center; background: rgba(var(--sh-ink, 255, 255, 255), 0.02); border-radius: 16px; border: 1px dashed rgba(var(--sh-ink, 255, 255, 255), 0.1);">
                            <p style="color: rgba(var(--sh-ink, 255, 255, 255), 0.5); font-size: 13.5px; margin: 0;">Aucun plugin SDK tiers installé. Vous pouvez enregistrer des extensions via <code>SpaceHub.sdk.registerPlugin()</code>.</p>
                        </div>
                    `}
                </div>

                <!-- Section 2.5 : Ratings Plugin Configuration (spacehub.ratings) -->
                <div class="sh-console-section-header" style="margin-top: 32px;" id="sh-ratings-config-header">
                    <div>
                        <div class="sh-console-brand-badge small">🍅 RATINGS PLUGIN</div>
                        <h3 class="sh-console-section-title">Notes Externes (OMDb)</h3>
                        <p class="sh-console-section-sub">Configurez la clé API OMDb et choisissez les fournisseurs de notes par défaut.</p>
                    </div>
                </div>
                <div class="sh-console-plugins-grid" id="sh-ratings-config-grid">
                    <div class="sh-console-plugin-card" style="grid-column: 1 / -1;">
                        <div class="sh-console-plugin-header">
                            <div class="sh-console-plugin-icon">🍅</div>
                            <div class="sh-console-plugin-info">
                                <strong>Ratings Plugin (spacehub.ratings)</strong>
                                <code id="sh-ratings-plugin-status">Chargement…</code>
                            </div>
                        </div>
                        <div class="sh-console-btn-group" style="margin-top: 12px;">
                            <input class="sh-console-input" id="sh-omdb-api-key" type="password" placeholder="Clé API OMDb" value="" style="flex:1;" />
                            <button class="sh-console-action-btn" id="sh-omdb-save-key">Enregistrer la clé</button>
                            <button class="sh-console-action-btn" id="sh-omdb-test">Tester la connexion</button>
                        </div>
                        <div id="sh-omdb-test-result" style="margin-top: 8px; font-size: 13px; color: rgba(var(--sh-ink, 255, 255, 255), 0.7);"></div>
                        <div class="sh-console-btn-group" style="margin-top: 12px;">
                            <input class="sh-console-input" id="sh-tmdb-api-key" type="password" placeholder="Clé API TMDB (textes de critiques — optionnel, gratuite sur themoviedb.org)" value="" style="flex:1;" />
                            <button class="sh-console-action-btn" id="sh-tmdb-save-key">Enregistrer TMDB</button>
                            <button class="sh-console-action-btn" id="sh-tmdb-test">Tester TMDB</button>
                        </div>
                        <div id="sh-tmdb-test-result" style="margin-top: 8px; font-size: 13px; color: rgba(var(--sh-ink, 255, 255, 255), 0.7);"></div>
                        <div style="margin-top: 16px;">
                            <label style="font-size: 13px; color: rgba(var(--sh-ink, 255, 255, 255), 0.8); font-weight: 600;">Fournisseurs par défaut :</label>
                            <div style="display: flex; gap: 16px; margin-top: 8px; flex-wrap: wrap;">
                                <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(var(--sh-ink, 255, 255, 255), 0.8);"><input type="checkbox" class="sh-ratings-provider" value="jellyfin" /> Jellyfin ★</label>
                                <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(var(--sh-ink, 255, 255, 255), 0.8);"><input type="checkbox" class="sh-ratings-provider" value="rt" /> Rotten Tomatoes 🍅</label>
                                <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(var(--sh-ink, 255, 255, 255), 0.8);"><input type="checkbox" class="sh-ratings-provider" value="imdb" /> IMDb</label>
                                <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(var(--sh-ink, 255, 255, 255), 0.8);"><input type="checkbox" class="sh-ratings-provider" value="metacritic" /> Metacritic</label>
                                <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(var(--sh-ink, 255, 255, 255), 0.8);"><input type="checkbox" class="sh-ratings-provider" value="tmdb" /> Textes TMDB</label>
                            </div>
                        </div>
                        <div class="sh-console-btn-group" style="margin-top: 12px;">
                            <button class="sh-console-action-btn" id="sh-ratings-save-providers">Enregistrer les fournisseurs</button>
                        </div>
                        <div id="sh-ratings-save-result" style="margin-top: 8px; font-size: 13px; color: rgba(var(--sh-ink, 255, 255, 255), 0.7);"></div>
                    </div>
                </div>

                <!-- Section 3 : Catalogue SDK approuvé -->
                <div class="sh-console-section-header" style="margin-top: 32px;">
                    <div>
                        <div class="sh-console-brand-badge small">CATALOGUE SIGNÉ SPACEHUB</div>
                        <h3 class="sh-console-section-title">Extensions disponibles (${svc.pluginCatalog()?.list?.({ includeRevoked: true })?.length || 0})</h3>
                        <p class="sh-console-section-sub">Seuls les catalogues HTTPS signés et les packages intègres peuvent être chargés.</p>
                    </div>
                    <div class="sh-console-btn-group">
                        <input class="sh-console-input" id="sh-catalog-url" type="url" placeholder="https://.../catalog.json" value="${ctx._escape(settings?.get('plugins.catalogUrl', '') || '')}" />
                        <button class="sh-console-action-btn" id="sh-catalog-load">Charger</button>
                    </div>
                </div>
                <div class="sh-console-plugins-grid" id="sh-catalog-grid">
                    ${(svc.pluginCatalog()?.list?.({ includeRevoked: true }) || []).map(entry => {
                        const status = svc.pluginCatalog()?.getStatus?.(entry.id) || { state: 'available' };
                        const installed = svc.pluginCatalog()?.isInstalled?.(entry.id);
                        return `
                            <div class="sh-console-plugin-card">
                                <div class="sh-console-plugin-header">
                                    <div class="sh-console-plugin-icon">${ctx._escape(entry.icon || '🧩')}</div>
                                    <div class="sh-console-plugin-info">
                                        <strong>${ctx._escape(entry.name || entry.id)}</strong>
                                        <code>${ctx._escape(entry.id)} • v${ctx._escape(entry.version)} • ${ctx._escape(status.state)}</code>
                                    </div>
                                </div>
                                <p class="sh-console-plugin-desc">${ctx._escape(entry.description || entry.manifest?.description || 'Aucune description.')}</p>
                                <div class="sh-console-btn-group">
                                    <button class="sh-console-action-btn sh-catalog-approve" data-plugin-id="${ctx._escape(entry.id)}">Approuver</button>
                                    <button class="sh-console-action-btn sh-catalog-install" data-plugin-id="${ctx._escape(entry.id)}">${installed ? 'Mettre à jour' : 'Installer'}</button>
                                    ${installed ? `<button class="sh-console-action-btn sh-catalog-rollback" data-plugin-id="${ctx._escape(entry.id)}">Rollback</button>` : ''}
                                    <button class="sh-console-action-btn sh-catalog-revoke" data-plugin-id="${ctx._escape(entry.id)}">Révoquer</button>
                                </div>
                            </div>
                        `;
                    }).join('') || '<div class="sh-console-empty-plugin-state" style="grid-column:1/-1"><p>Aucun catalogue chargé.</p></div>'}
                </div>

                <!-- Section 4 : Plugins Serveur Jellyfin (Backend) -->
                <div class="sh-console-section-header" style="margin-top: 32px;">
                    <div>
                        <div class="sh-console-brand-badge small">JELLYFIN BACKEND SERVEUR</div>
                        <h3 class="sh-console-section-title">Plugins Installés sur le Serveur (${serverPlugins.length})</h3>
                        <p class="sh-console-section-sub">Extensions installées directement sur votre instance Jellyfin.</p>
                    </div>
                </div>

                <div class="sh-console-plugins-grid">
                    ${serverPlugins.length > 0 ? serverPlugins.map(p => {
                        const nameLower = (p.Name || '').toLowerCase();
                        const isLegacySkin = nameLower.includes('skin') || nameLower.includes('css') || nameLower.includes('tweak');

                        return `
                            <div class="sh-console-plugin-card server ${isLegacySkin ? 'legacy' : ''}">
                                <div class="sh-console-plugin-header">
                                    <div class="sh-console-plugin-icon">📦</div>
                                    <div class="sh-console-plugin-info">
                                        <strong>${ctx._escape(p.Name || 'Plugin serveur')}</strong>
                                        <code>v${ctx._escape(p.Version || '—')} • Statut: ${ctx._escape(p.statusVerified ? p.Status : 'Inconnu')}</code>
                                    </div>
                                    <span class="sh-plugin-status-badge ${p.statusVerified ? 'loaded' : 'warn'}">${p.statusVerified ? '🟢 Vérifié' : '🟡 Inconnu'}</span>
                                </div>
                                <p class="sh-console-plugin-desc">${ctx._escape(p.Description || 'Aucune description fournie par Jellyfin.')}</p>
                                ${p.canConfigure ? `<button class="sh-console-action-btn sh-server-plugin-config" data-plugin-id="${ctx._escape(p.id)}">Lire la configuration</button>` : '<small>Configuration non exposée par cette réponse Jellyfin.</small>'}
                            </div>
                        `;
                    }).join('') : `
                        <div class="sh-console-empty-plugin-state">
                            <p>Aucun plugin serveur tiers détecté sur votre instance Jellyfin.</p>
                        </div>
                    `}
                </div>
            </div>
        `;
}

export default gabaritConsoleModules;
