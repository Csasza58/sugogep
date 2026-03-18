/**
 * 3. Mérföldkő - TrackingEngine v2
 * 
 * EGYSZERŰ LOGIKA, NULLA UGRÁS:
 *   - Mindig csak ELŐRE halad, max 10 szót ugorhat előre
 *   - Az aktuális pozíciótól kezdve keresi az első egyező szót
 *   - Ha nem talál, eldobja a szót
 *   - Visszafelé SOHA nem megy
 */
class TrackingEngine {
    constructor(tokens) {
        this.wordTokens = tokens.filter(t => t.type === 'word');
        this.totalWords = this.wordTokens.length;
        this.currentIndex = 0;

        // BIZTONSÁGOS LÁTÓTÁVOLSÁG: 15 szó (kb 2 sor), elég nagy a gyors beszédhez
        this.maxLookAhead = 15;

        this.wordsMatched = 0;
        this.startTime = null;
        this.wpm = 110; // Nyugodtabb induló tempó
        this.lastMatchTime = null; // Új: predikcióhoz

        // Callback
        this.positionCallback = null;

        // Debug callback
        this.debugCallback = null;
    }

    onPositionUpdate(callback) {
        this.positionCallback = callback;
    }

    onDebug(callback) {
        this.debugCallback = callback;
    }

    /**
     * Szó feldolgozása: keres az aktuális pozíciótól max 10 szóval előre.
     * Előnyben részesíti a legközelebbi egyezést.
     */
    processWord(payload) {
        const now = Date.now();
        if (!this.startTime) this.startTime = now;

        const heard = payload.clean;

        // Nagyon rövid szavak: csak pontos egyezés az azonnali következő 3 szóban
        if (heard.length <= 2) {
            for (let i = this.currentIndex; i < Math.min(this.currentIndex + 3, this.totalWords); i++) {
                const token = this.wordTokens[i];
                if (token.clean === heard || token.phonetic === heard) {
                    this._advance(i, heard, token, 1, now);
                    return;
                }
            }
            this._debugLog(heard, null, 'rövid szó, nincs pontos egyezés');
            return;
        }

        // Normál szavak: keresés előrefelé, Szigorúan az első elfogadható találatig!
        const searchEnd = Math.min(this.currentIndex + this.maxLookAhead, this.totalWords);

        for (let i = this.currentIndex; i < searchEnd; i++) {
            const token = this.wordTokens[i];

            // 1. Pontos egyezés -> azonnal elfogadjuk
            if (token.clean === heard || token.phonetic === heard) {
                this._advance(i, heard, token, 1, now);
                return;
            }

            // 2. Fuzzy egyezés
            const sim = Math.max(
                this._similarity(heard, token.clean),
                this._similarity(heard, token.phonetic)
            );

            // ÚJ: Ha időrendben ez az ELSŐ szó, ami meglehetősen hasonlít (>70%),
            // azonnal ráugrunk! Nem keresünk tovább a jövőben a "tökéletesre", mert az átugorhatná a sort.
            if (sim > 0.70) {
                this._advance(i, heard, token, sim, now);
                return;
            }
        }

        // Ha a teljes kis ablakban nem volt legalább 70%-os találat, ELDOBJUK a szót (nincs ugrás)
        this._debugLog(heard, null, `ignorantia -> (nincs >70% találat a közelben)`);
    }

    /**
     * Pozíció előreléptetése
     */
    _advance(newIndex, heard, token, similarity, now) {
        this.currentIndex = newIndex + 1; // Következőre lépünk, mert ezt már megtaláltuk!
        
        // WPM
        this.wordsMatched++;
        const elapsedMin = (now - this.startTime) / 60000;
        // Simított WPM: nem engedjük 250 fölé (nehogy elszálljon a becslés)
        this.wpm = elapsedMin > 0 ? Math.min(250, Math.round(this.wordsMatched / elapsedMin)) : 0;
        this.lastMatchTime = now;

        this._debugLog(heard, token, `✓ egyezés pozíció ${newIndex}`);

        if (this.positionCallback) {
            this.positionCallback({
                index: newIndex,
                confidence: Math.round(similarity * 100),
                wpm: this.wpm,
                token: token
            });
        }
    }

    _debugLog(heard, token, msg) {
        if (this.debugCallback) {
            this.debugCallback({
                heard: heard,
                expected: token ? token.clean : '-',
                position: this.currentIndex,
                message: msg
            });
        }
    }

    /**
     * Levenshtein hasonlóság (0-1)
     */
    _similarity(a, b) {
        if (!a || !b) return 0;
        if (a === b) return 1;
        const maxLen = Math.max(a.length, b.length);
        if (maxLen === 0) return 1;
        return 1 - this._levenshtein(a, b) / maxLen;
    }

    _levenshtein(a, b) {
        const m = a.length, n = b.length;
        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
            }
        }
        return dp[m][n];
    }

    reset() {
        this.currentIndex = 0;
        this.wordsMatched = 0;
        this.startTime = null;
        this.wpm = 110;
        this.lastMatchTime = null;
    }

    /**
     * Visszaadja a jelenlegi valós pozíció + a felolvasási tempó miatti "jövőbeli" pozíciót.
     * Tört számot ad vissza (pl. 24.5), ami a 24. és 25. szó közötti utat jelenti.
     */
    getEstimatedProgress() {
        if (!this.startTime || !this.lastMatchTime) return this.currentIndex;
        
        const now = Date.now();
        // Csend-detektor: max 2.5 másodperc múlva leáll az automatikus tekerés (kis szünet is belefér)
        if (now - this.lastMatchTime > 2500) return this.currentIndex;

        // Szóközönkénti sebesség: szándékosan ráhúzunk 1.25x szorzót a valós tempóra,
        // így a kijelölés mindig "húzni" fog téged (előrébb jár), nem pedig lemarad mögötted!
        const effectiveWpm = Math.max(140, this.wpm * 1.25);
        const wordsPerMs = effectiveWpm / 60000;
        const msSinceLastMatch = now - this.lastMatchTime;
        
        // Védőháló: megnövelt mozgástér, akár 8 szót (egy egész sort) is haladhat előre az ASR előtt,
        // így 130+ WPM-nél sem fog várni a szerverre.
        const predictedDelta = Math.min(msSinceLastMatch * wordsPerMs, 8.0);
        
        return Math.min(this.currentIndex + predictedDelta, this.totalWords - 1);
    }

    /**
     * Manuális ugrás (pl. kattintásra)
     */
    jumpTo(index) {
        if (index < 0 || index >= this.totalWords) return;
        
        const now = Date.now();
        if (!this.startTime) this.startTime = now;
        
        const token = this.wordTokens[index];
        this._advance(index, token.clean, token, 1, now);
        this._debugLog("-", token, `🔄 Manuális ugrás ide: ${index}`);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TrackingEngine };
} else if (typeof window !== 'undefined') {
    window.TrackingEngine = TrackingEngine;
}
