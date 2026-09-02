/**
 * SpaceHub — Dedicated Carousel Controller (Pure Function Navigation)
 * Version: 2.0.0
 * Moteur autonome de gestion et défilement synchronisé des carrousels
 */

'use strict';

export class CarouselController {
    /**
     * Calcule la carte cible à l'intérieur d'un carrousel donné (Fonction Pure)
     * @param {HTMLElement} carousel
     * @param {HTMLElement} currentCard
     * @param {string} direction - 'left' | 'right'
     * @param {boolean} isFastScroll
     * @returns {HTMLElement|null} La carte cible calculée ou null si frontière atteinte
     */
    navigate(carousel, currentCard, direction, isFastScroll = false) {
        if (!carousel || !currentCard) return null;
        const cards = Array.from(carousel.querySelectorAll('.sh-card, [data-nav-focusable="true"]'));
        const curIdx = cards.indexOf(currentCard);
        if (curIdx === -1) return null;

        const targetIdx = direction === 'right' ? curIdx + 1 : curIdx - 1;
        if (targetIdx < 0 || targetIdx >= cards.length) {
            return null; // Frontière du carrousel atteinte
        }

        // Le scroll est désormais entièrement délégué à SpatialNavigation.setFocus()
        // (seul responsable du défilement, cf. audit §1.1 — évite le double scrollBy relatif).
        return cards[targetIdx];
    }

    /**
     * Centre précisément une carte dans le viewport du carrousel
     * @param {HTMLElement} carousel
     * @param {HTMLElement} card
     * @param {'auto'|'smooth'} behavior
     */
    scrollToCard(carousel, card, behavior = 'smooth') {
        const scroller = carousel.querySelector('.sh-carousel-viewport, .sh-carousel-track, .sh-carousel-scroll') || carousel;
        const cardRect = card.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        const offsetLeft = cardRect.left - scrollerRect.left;
        const centerTarget = offsetLeft - (scrollerRect.width / 2) + (cardRect.width / 2);
        scroller.scrollBy({ left: centerTarget, behavior });
    }
}

export default CarouselController;
