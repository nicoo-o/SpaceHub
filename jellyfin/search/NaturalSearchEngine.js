/**
 * SpaceHub — Natural Language Search Engine
 * Version: 1.0.0
 *
 * Moteur de recherche sémantique et en langage naturel.
 * Analyse les requêtes ("Films de science-fiction des années 90", "Séries policières bien notées")
 * et les convertit en requêtes Jellyfin multi-critères précises.
 */

'use strict';

import Logger from '../../core/Logger.js';

class NaturalSearchEngine {
    constructor() {
        this._log = new Logger('NaturalSearchEngine');
    }

    get _apiClient() {
        return window.SpaceHub?.core?.api?.getClient('jellyfin');
    }

    /**
     * Analyse une phrase en langage naturel et extrait les filtres.
     * @param {string} text
     * @returns {Object} Critères extraits
     */
    parseQuery(text) {
        const query = (text || '').toLowerCase().trim();
        const filters = {
            searchTerm: '',
            includeItemTypes: ['Movie', 'Series'],
            genres: [],
            years: [],
            minRating: null,
            isPlayed: null,
            sortBy: 'CommunityRating',
            sortOrder: 'Descending'
        };

        // 1. Détection du type de média
        if (/\b(films?|movie|long-métrage)\b/i.test(query)) {
            filters.includeItemTypes = ['Movie'];
        } else if (/\b(séries?|shows?|saisons?)\b/i.test(query)) {
            filters.includeItemTypes = ['Series'];
        }

        // 2. Détection des Genres
        const genreMap = {
            'action': 'Action',
            'comédie|comedie|humour|drole': 'Comedy',
            'horreur|peur|epouvante|angoisse': 'Horror',
            'science-fiction|sci-fi|sf|espace': 'Science Fiction',
            'drame|dramatique': 'Drama',
            'animation|anime|manga|dessin animé': 'Animation',
            'aventure': 'Adventure',
            'policier|crime|thriller|enquête': 'Crime',
            'fantastique|fantasy|magie': 'Fantasy',
            'romance|romantique|amour': 'Romance',
            'documentaire|docu': 'Documentary'
        };

        for (const [pattern, genreName] of Object.entries(genreMap)) {
            const regex = new RegExp(`\\b(${pattern})\\b`, 'i');
            if (regex.test(query)) {
                filters.genres.push(genreName);
            }
        }

        // 3. Détection des Années / Décennies
        if (/années\s*80|80s/i.test(query)) {
            filters.years = ['1980', '1981', '1982', '1983', '1984', '1985', '1986', '1987', '1988', '1989'];
        } else if (/années\s*90|90s/i.test(query)) {
            filters.years = ['1990', '1991', '1992', '1993', '1994', '1995', '1996', '1997', '1998', '1999'];
        } else if (/années\s*2000|2000s/i.test(query)) {
            filters.years = ['2000', '2001', '2002', '2003', '2004', '2005', '2006', '2007', '2008', '2009'];
        } else if (/récents?|nouveaux?|derniers?/i.test(query)) {
            filters.years = ['2022', '2023', '2024', '2025', '2026'];
            filters.sortBy = 'PremiereDate';
        }

        const yearMatch = query.match(/\b(19\d{2}|20\d{2})\b/);
        if (yearMatch) {
            filters.years = [yearMatch[1]];
        }

        // 4. Détection de Note / Qualité
        if (/plus de (\d+)|> ?(\d+)|supérieur à (\d+)/i.test(query)) {
            const m = query.match(/plus de (\d+)|> ?(\d+)|supérieur à (\d+)/i);
            const val = parseFloat(m[1] || m[2] || m[3]);
            filters.minRating = val > 10 ? val / 10 : val;
        } else if (/bien noté|top|meilleurs?|chef d'oeuvre/i.test(query)) {
            filters.minRating = 7.5;
        }

        // 5. Statut de visionnage
        if (/non vus?|pas encore vu|à voir/i.test(query)) {
            filters.isPlayed = false;
        } else if (/déjà vu|vus?/i.test(query)) {
            filters.isPlayed = true;
        }

        return filters;
    }

    /**
     * Exécute une recherche en langage naturel.
     * @param {string} naturalQuery
     * @returns {Promise<Array<Object>>}
     */
    async search(naturalQuery) {
        const filters = this.parseQuery(naturalQuery);
        this._log.info('Exécution recherche sémantique avec filtres:', filters);

        const params = new URLSearchParams({
            Recursive: 'true',
            IncludeItemTypes: filters.includeItemTypes.join(','),
            SortBy: filters.sortBy,
            SortOrder: filters.sortOrder,
            Limit: '24',
            Fields: 'PrimaryImageAspectRatio,ProductionYear,CommunityRating,Overview,Genres,UserData'
        });

        if (filters.genres.length > 0) {
            params.append('Genres', filters.genres.join('|'));
        }
        if (filters.years.length > 0) {
            params.append('Years', filters.years.join(','));
        }
        if (filters.minRating) {
            params.append('MinCommunityRating', filters.minRating.toString());
        }
        if (filters.isPlayed !== null) {
            params.append('IsPlayed', filters.isPlayed.toString());
        }

        try {
            const data = await this._apiClient?.get(`/Items?${params.toString()}`);
            return data?.Items || [];
        } catch (err) {
            this._log.error('Erreur recherche en langage naturel:', err);
            return [];
        }
    }
}

export default NaturalSearchEngine;
