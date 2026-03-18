document.addEventListener('DOMContentLoaded', () => {
    // Inicializáljuk a tokenizáló modult (tokenizer.js betöltve előtte globálisként)
    const tokenizer = new Tokenizer();

    const inputText = document.getElementById('input-text');
    const tokenizeBtn = document.getElementById('tokenize-btn');
    const resultContainer = document.getElementById('result-container');
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const runTestsBtn = document.getElementById('run-tests-btn');
    const jsonPreview = document.getElementById('json-preview');
    const jsonPreviewContainer = document.getElementById('json-preview-container');

    let currentTokens = [];

    // Fő Tokenizáló Gomb Logika
    tokenizeBtn.addEventListener('click', () => {
        const text = inputText.value;
        if (!text.trim()) return;

        // Végrehajtja a moduláris tokenizálást
        currentTokens = tokenizer.tokenize(text);
        
        // Eredmény vizuális megjelenítése
        renderTokens(currentTokens);
        
        // JSON adatszerkezet kimentése
        updateJsonPreview(currentTokens);
    });

    // Visszakereső Rendszer
    searchBtn.addEventListener('click', () => {
        const textToFind = searchInput.value;
        if (!textToFind.trim() || currentTokens.length === 0) return;

        // Szó visszakeresése (Normalizálás alapú okos keresés!)
        const found = tokenizer.getTokenByText(currentTokens, textToFind);
        
        // Eltávolítjuk a régi vizuális kiemeléseket
        document.querySelectorAll('.token').forEach(el => el.classList.remove('highlight'));

        if (found) {
            // Megtalált elem kiemelése
            const tokenEl = document.getElementById(`token-${found.index}`);
            if (tokenEl) {
                tokenEl.classList.add('highlight');
                tokenEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
            // Nincs találat - UI visszajelzés
            const originalPh = searchInput.placeholder;
            searchInput.value = '';
            searchInput.placeholder = 'Nincs találat a szótárban!';
            setTimeout(() => {
                searchInput.placeholder = originalPh;
            }, 2500);
        }
    });

    // Keresés indítása Enterrel is
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchBtn.click();
        }
    });

    runTestsBtn.addEventListener('click', () => {
        runUnitTests(tokenizer);
    });

    /**
     * DOM Renderelő a vizuális megjelenéshez
     */
    function renderTokens(tokens) {
        // Ürítjük a konténert
        resultContainer.innerHTML = '';
        
        tokens.forEach((token, i) => {
            if (token.type === 'whitespace') {
                // Fehér szóköz megőrzése a vizuális terekhez
                const spaceEl = document.createElement('span');
                spaceEl.className = 'whitespace-token';
                spaceEl.textContent = token.original;
                resultContainer.appendChild(spaceEl);
            } else {
                // Érvényes szó renderelése szép DOM elemként
                const wrapper = document.createElement('div');
                wrapper.className = 'token-wrapper';
                // Lépcsőzetes animáció hatás
                wrapper.style.animationDelay = `${(i % 30) * 0.04}s`; 

                const el = document.createElement('div');
                el.className = 'token';
                el.id = `token-${token.index}`;
                
                // Hover tooltip információk
                el.title = `Eredeti: "${token.original}" | Tisztított: "${token.clean}" | Hossz: ${token.metadata.length}`;
                
                el.innerHTML = `
                    <div class="original">${token.original}</div>
                    <div class="phonetic">${token.phonetic}</div>
                `;
                
                wrapper.appendChild(el);
                resultContainer.appendChild(wrapper);
            }
        });
    }

    /**
     * Generált adatstruktúra megmutatása fejlesztői nézetben
     */
    function updateJsonPreview(tokens) {
        // A hangkövetésnek elsősorban csak a releváns szavak kellenek, 
        // a whitespace-eket kiszűrhetjük az outputból.
        const exportableData = tokens.filter(t => t.type === 'word').map(t => ({
            original: t.original,
            clean: t.clean,
            phonetic: t.phonetic,
            index: t.index,
            state: t.state,
            metadata: t.metadata
        }));

        jsonPreview.textContent = JSON.stringify(exportableData, null, 4);
        jsonPreviewContainer.style.display = 'block';
    }

    /**
     * Konzol alapú tesztek demonstrációs célból
     */
    function runUnitTests(tok) {
        console.clear();
        console.log("%c=== 1. Mérföldkő Unit Tesztek ===", "color: #818cf8; font-size: 16px; font-weight: bold; background: rgba(0,0,0,0.5); padding: 5px;");

        const testCases = [
            { 
                text: "Ma 200 Ft-ot költöttem.", 
                desc: "1. Szám és mértékegység raggal (200, Ft-ot)" 
            },
            { 
                text: "Az 1. alkalommal kb. 10%-ot engedtek stb.", 
                desc: "2. Sorszámnév, rövidítések, speciális karakter (% és kb., stb.)" 
            },
            { 
                text: "A kft. 2024-ben alakult & sikeres maradt.", 
                desc: "3. Nagy számok kötőjellel (2024), '&' szimbólum (és), kft rövidítés" 
            }
        ];

        testCases.forEach((tc, idx) => {
            console.log(`%cKifejezés ${idx + 1}: ${tc.desc}`, "color: #10b981; font-weight: bold; margin-top: 15px; font-size: 13px;");
            console.log(`Nyers szöveg: "${tc.text}"`);
            
            // Futtatás kiszűrve a visual whitespaceket
            const results = tok.tokenize(tc.text).filter(t => t.type === 'word');
            
            // Format table output
            const tableData = results.map(r => ({
                'Szó (Tok)': r.original,
                'Tisztított': r.clean,
                'Fonetikus': r.phonetic,
                'Index': r.index
            }));
            
            console.table(tableData);
        });
        
        // Tokenizer keresés teszt
        console.log("%cKeresés Unit Teszt ('például'): keresünk 'például' szóra a 'pl.' szövegben:", "color: #10b981; margin-top: 15px; font-weight: bold;");
        const srchRes = tok.tokenize("Vegyünk pl. egy almát");
        console.log("Tokens:");
        console.table(srchRes.filter(t => t.type === "word").map(t => ({original: t.original, phonetic: t.phonetic})));
        const found = tok.getTokenByText(srchRes, "például");
        console.log("Eredmény 'például' keresésre:");
        console.log(found ? `✅ Megtalálva! Eredeti: ${found.original}, Normalizált: ${found.phonetic}` : '❌ Nem található');

        alert("A Unit tesztek sikeresen lefutottak! Kérjük, nyissa meg a böngésző konzolját (F12 vagy Ctrl+Shift+I).");
    }
});
