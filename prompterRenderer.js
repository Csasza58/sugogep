/**
 * 4. Mérföldkő - PrompterRenderer
 * High-Performance Vizuális Megjelenítő és LERP Görgető Motor
 * 
 * FONTOS: A renderer két DOM elemet kap:
 *   - scrollContainer: a görgethető viewport (ahol a scrollTop-ot módosítjuk)
 *   - contentContainer: a szöveges tartalom konténere (ahová a <span>-okat rendereljük)
 */
class PrompterRenderer {
    constructor(scrollContainerId, contentContainerId, options = {}) {
        this.scrollContainer = document.getElementById(scrollContainerId);
        this.contentContainer = document.getElementById(contentContainerId);
        this.options = {
            easingFactor: 0.4, // Gyors, de nem "teleportáló" mozgás
            focusZoneRatio: 0.5,
            onWordClick: null,
            ...options
        };

        // Görgetési Állapotok
        this.currentScrollY = 0;
        this.targetScrollY = 0;
        
        // Adati Állapotok
        this.tokens = [];
        this.domElements = [];
        this.activeIndex = -1;

        // Resize optimalizálás
        this.resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                this.forceRecalculateFocus();
            }, 100);
        });

        // RAF loop
        this._animationLoop = this._animationLoop.bind(this);
        this._isAnimating = false;
    }

    /**
     * DOM renderelés: <span> elemek a contentContainer-be
     */
    init(tokens, trackerInstance = null) {
        this.tokens = tokens;
        this.tracker = trackerInstance;
        this.domElements = [];
        this.activeIndex = -1;
        
        this.currentScrollY = 0;
        this.targetScrollY = 0;
        this.scrollContainer.scrollTop = 0;

        const fragment = document.createDocumentFragment();
        
        this.tokens.forEach((token) => {
            if (token.type === 'whitespace') {
                const space = document.createTextNode(token.original);
                fragment.appendChild(space);
            } else {
                const span = document.createElement('span');
                span.className = 'p-word pending';
                span.textContent = token.original;
                span.setAttribute('data-index', token.index); // Új: index mentése a DOM-ba
                this.domElements[token.index] = span;
                fragment.appendChild(span);
            }
        });

        this.contentContainer.innerHTML = '';
        this.contentContainer.appendChild(fragment);

        // Kattintás eseménykezelő (Event Delegation)
        this.contentContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('p-word')) {
                const index = parseInt(e.target.getAttribute('data-index'), 10);
                if (!isNaN(index) && this.options.onWordClick) {
                    this.options.onWordClick(index);
                }
            }
        });

        this.updateActiveWord(0);

        // LERP animation loop indítása
        if (!this._isAnimating) {
            this._isAnimating = true;
            requestAnimationFrame(this._animationLoop);
        }
    }

    /**
     * Szavak állapotfrissítése: csak a változtatásokon iterál.
     */
    updateActiveWord(newIndex) {
        if (!this.domElements.length || newIndex < 0 || newIndex >= this.domElements.length) return;
        if (newIndex === this.activeIndex) return;

        const oldIndex = this.activeIndex === -1 ? 0 : this.activeIndex;
        
        if (newIndex > oldIndex) {
            for (let i = oldIndex; i < newIndex; i++) {
                if (this.domElements[i]) this.domElements[i].className = 'p-word completed';
            }
        } else {
            for (let i = newIndex + 1; i <= oldIndex; i++) {
                if (this.domElements[i]) this.domElements[i].className = 'p-word pending';
            }
        }

        if (this.domElements[newIndex]) {
            this.domElements[newIndex].className = 'p-word active';
        }

        this.activeIndex = newIndex;
        this.forceRecalculateFocus();
    }

    /**
     * Fókusz koordináta kiszámítása az aktív szó pozíciója alapján
     */
    forceRecalculateFocus() {
        if (this.activeIndex < 0 || !this.domElements[this.activeIndex]) return;

        const el = this.domElements[this.activeIndex];
        const focusOffset = this.scrollContainer.clientHeight * this.options.focusZoneRatio;
        
        this.targetScrollY = Math.max(0, el.offsetTop - focusOffset);
    }

    /**
     * LERP Scroll loop. Interpoláció fut itt + predikció ha van tracker.
     */
    _animationLoop() {
        if (!this._isAnimating) return;

        // Prediktív görgetés (Jövőbelátó funkció)
        if (this.tracker && this.domElements.length > 0) {
            const estProgress = this.tracker.getEstimatedProgress();
            
            if (estProgress > 0) {
                const baseIndex = Math.floor(estProgress);
                const nextIndex = Math.min(baseIndex + 1, this.domElements.length - 1);
                const fraction = estProgress - baseIndex;

                const baseEl = this.domElements[baseIndex];
                const nextEl = this.domElements[nextIndex];

                if (baseEl && nextEl) {
                    const basePos = baseEl.offsetTop;
                    const nextPos = nextEl.offsetTop;
                    
                    const interpolatedY = basePos + (nextPos - basePos) * fraction;
                    const focusOffset = this.scrollContainer.clientHeight * this.options.focusZoneRatio;
                    
                    this.targetScrollY = Math.max(0, interpolatedY - focusOffset);
                }
            }
        }

        const diff = this.targetScrollY - this.currentScrollY;
        
        if (Math.abs(diff) > 0.5) {
            let step = diff * this.options.easingFactor;
            
            // SEBESSÉG LIMITÁLÁS VÉDELEM (TELEPORTÁLÁS ELLEN):
            // Ha a Google egyszerre kiköp 15 szót (vagy mi ugrottunk a sliderrel), 
            // a sorozat ne engedje "odarátni" (teleportálni) a képernyőt, hanem 
            // villámgyorsan, de az emberi szemnek követhetően (max 15px/frame -> ~900px/mp) görgessen!
            const maxStep = 15;
            if (step > maxStep) step = maxStep;
            if (step < -maxStep) step = -maxStep;

            this.currentScrollY += step;
            this.scrollContainer.scrollTop = this.currentScrollY;
        }

        requestAnimationFrame(this._animationLoop);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PrompterRenderer };
} else if (typeof window !== 'undefined') {
    window.PrompterRenderer = PrompterRenderer;
}
