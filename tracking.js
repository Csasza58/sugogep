document.addEventListener('DOMContentLoaded', () => {

    // Modulok példányosítása
    const tokenizer = new Tokenizer();
    // A Speech API-t később indítjuk a mikrofon kérésekor
    let speechService = null;
    let tracker = null;

    // UI Elemek
    const scriptInput = document.getElementById('script-input');
    const loadBtn = document.getElementById('load-btn');
    const startTrackBtn = document.getElementById('start-track-btn');
    const micText = document.getElementById('mic-text');
    const prompterContent = document.getElementById('prompter-content');

    // Statisztikák
    const statVad = document.getElementById('stat-vad');
    const statWpm = document.getElementById('stat-wpm');
    const statPanic = document.getElementById('stat-panic');
    const statConf = document.getElementById('stat-conf');

    // Fejlesztői (Debug) Elemek
    const devWord = document.getElementById('dev-word');
    const devSend = document.getElementById('dev-send');

    // Állapotok
    let generatedTokens = [];
    let isTrackingMode = false;

    // 1. Szkript betöltése és Tokenizálás
    loadBtn.addEventListener('click', () => {
        const text = scriptInput.value;
        if (!text.trim()) return;

        // Eredeti Tokenizer futtatása
        generatedTokens = tokenizer.tokenize(text);
        
        // UI Render
        renderPrompter(generatedTokens);
        
        // Tracking Engine inicializálása
        tracker = new TrackingEngine(generatedTokens);
        
        // Esemény feliratkozás a követett pozícióhoz
        tracker.onPositionUpdate((info) => {
            updatePrompterUI(info);
        });

        startTrackBtn.disabled = false;
        alert("Szkript betöltve és tokenizálva. A csúszóablak és a fuzzy matcher készen áll!");
    });


    // 2. ASR és Követés Indítása (Vagy leállítása)
    startTrackBtn.addEventListener('click', () => {
        if (!isTrackingMode) {
            // Indítás
            if (!speechService) {
                speechService = new SpeechRecognitionService();
                
                // Hibakezelés feliratkozás
                speechService.onError((err) => {
                    console.error("ASR Error:", err);
                    if (err === 'not-allowed') {
                        alert("Kérjük engedélyezze a mikrofont!");
                        stopTracking();
                    }
                });
                
                // Központi "érzékszerv" összekötése az "aggyal" (Tracker)
                speechService.onWordDetected((payload) => {
                    if (tracker) {
                        tracker.processWord(payload);
                    }
                });

                // VAD információk
                speechService.onVolumeChange((data) => {
                    statVad.textContent = data.isSpeaking ? "🗣️ Beszél" : "Csend";
                    statVad.style.color = data.isSpeaking ? "#10b981" : "#f8fafc";
                });
            }

            speechService.start();
            isTrackingMode = true;
            
            // UI Toggle
            startTrackBtn.classList.add('listening');
            micText.textContent = "Követés Leállítása";
            
        } else {
            stopTracking();
        }
    });

    function stopTracking() {
        if (speechService) speechService.stop();
        isTrackingMode = false;
        startTrackBtn.classList.remove('listening');
        micText.textContent = "Követés Indítása (Mikrofon)";
        statVad.textContent = "Csend";
        statVad.style.color = "#f8fafc";
    }

    // 3. UI Kiszolgáló Funkciók
    function renderPrompter(tokens) {
        prompterContent.innerHTML = '';
        
        tokens.forEach((token) => {
            const el = document.createElement('span');
            // Fehérköz vs Szó megjelenítés elkülönítése
            if (token.type === 'whitespace') {
                el.className = 'p-whitespace';
                el.textContent = token.original;
            } else {
                el.className = 'p-token unread';
                el.id = `pt-${token.index}`;
                el.textContent = token.original;
            }
            prompterContent.appendChild(el);
        });
    }

    function updatePrompterUI(info) {
        // info: { index, confidence, isJump, wpm, token }
        
        // Kijelzések frissítése
        statWpm.textContent = `${info.wpm} WPM`;
        statConf.textContent = `${info.confidence}%`;
        
        if (tracker.isPanicMode) {
            statPanic.textContent = "PÁNIK Keresés...";
            statPanic.className = "val panic";
        } else {
            statPanic.textContent = "Szinkronban";
            statPanic.className = "val safe";
        }

        // Fókusz eltolása a DOM-ban
        // Minden eddigi módosítása
        const allWords = Array.from(document.querySelectorAll('.p-token'));
        
        allWords.forEach(el => {
            const idxId = parseInt(el.id.split('-')[1]);
            
            if (idxId < info.index) {
                el.className = 'p-token passed';
            } else if (idxId === info.index) {
                // Aktuális fókusz (Jump animáció, ha hirtelen pozíciót váltottunk)
                el.className = `p-token active ${info.isJump ? 'jumped' : ''}`;
                
                // Középre görgetés finoman (Autoscroll)
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                el.className = 'p-token unread';
            }
        });
    }

    // 4. Fejlesztői eszköz (Microphone nélküli szimuláció)
    devSend.addEventListener('click', () => {
        const val = devWord.value.trim();
        if (!val || !tracker) return;

        // A Speech Service Delta Payload szimulálása
        // Végleges (Final) szóként küldjük be
        const cleanVal = tokenizer.cleanWord(val); // Tokenizerből posztulálva
        
        // Hívás a tracking enginenek
        tracker.processWord({
            word: val,
            clean: cleanVal,
            isFinal: true,
            confidence: 0.99
        });

        devWord.value = '';
    });
    
    // Enter key dev wordhöz
    devWord.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') devSend.click();
    });

});
