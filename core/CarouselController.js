/**
 * SpaceHub — Dedicated Carousel Controller
 * Version: 1.0.0
 * Moteur autonome de gestion et défilement synchronisé des carrousels
 */

'use strict';

export class CarouselController {
    /**
     * Navigue à l'intérieur d'un carrousel donné par index arithmétique pur
     * @param {HTMLElement} carousel
     * @param {HTMLElement} currentCard
     * @param {string} direction - 'left' | 'right'
     * @param {boolean} isFastScroll
     * @returns {HTMLElement|null} La carte cible ou null si frontière atteinte
     */
    navigate(carousel, currentCard, direction, isFastScroll = false) {
        if (!carousel || !currentCard) return null;
        const cards = Array.from(carousel.querySelectorAll('.sh-card[data-nav-focusable="true"], [data-nav-focusable="true"]'));
        const curIdx = cards.indexOf(currentCard);
        if (curIdx === -1) return null;

        const targetIdx = direction === 'right' ? curIdx + 1 : curIdx - 1;
        if (targetIdx < 0 || targetIdx >= cards.length) {
            return null; // Frontière du carrousel atteinte
        }

        const targetCard = cards[targetIdx];
        this.scrollToCard(carousel, targetCard, isFastScroll ? 'auto' : 'smooth');
        return targetCard;
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
