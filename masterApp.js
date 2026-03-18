document.addEventListener('DOMContentLoaded', () => {
    // ===================================
    // 1. DOM ELEMEK
    // ===================================
    const loadBtn = document.getElementById('btn-load');
    const startBtn = document.getElementById('btn-start');
    const restartBtn = document.getElementById('btn-restart');
    const scriptInput = document.getElementById('script-input');
    const prompterContent = document.getElementById('prompter-content');
    
    const setFs = document.getElementById('set-fs');
    const valFs = document.getElementById('val-fs');
    const setLh = document.getElementById('set-lh');
    const valLh = document.getElementById('val-lh');
    const setPad = document.getElementById('set-pad');
    const valPad = document.getElementById('val-pad');
    const setAnch = document.getElementById('set-anch');
    const valAnch = document.getElementById('val-anch');
    
    const setMirror = document.getElementById('set-mirror');
    const setGuide = document.getElementById('set-guide');
    const setHighlight = document.getElementById('set-highlight');
    const focusGuide = document.getElementById('focus-guide');

    const debugBar = document.getElementById('debug-bar');
    const sysStatus = document.getElementById('sys-status');
    const sysWpm = document.getElementById('sys-wpm');
    const mobileToggle = document.getElementById('mobile-toggle');

    // MIKROFON DIAGNOSZTIKA: HTTPS ellenőrzés
    if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        if (debugBar) {
            debugBar.style.color = '#ef4444';
            debugBar.textContent = '⚠️ FIGYELEM: A MIKROFON CSAK HTTPS KAPCSOLATON MŰKÖDIK!';
        }
    }

    // ===================================
    // 2. OSZTÁLYOK INICIALIZÁLÁSA
    // ===================================
    const tokenizer = new Tokenizer();
    let trackingEngine = null;
    let speechService = null;
    let isListening = false;
    let wakeLock = null;
    
    const renderer = new PrompterRenderer('prompter-viewport', 'prompter-content', {
        easingFactor: 0.4,
        focusZoneRatio: 0.35,
        onWordClick: (index) => {
            if (trackingEngine) trackingEngine.jumpTo(index);
        }
    });

    // ===================================
    // 3. UI LOGIKA (PANEL)
    // ===================================
    const togglePanel = () => {
        document.getElementById('settings-panel').classList.toggle('collapsed');
    };
    document.querySelector('.panel-header').addEventListener('click', togglePanel);
    if (mobileToggle) mobileToggle.addEventListener('click', togglePanel);

    // ===================================
    // 4. SZKRIPT BETÖLTÉSE
    // ===================================
    loadBtn.addEventListener('click', () => {
        const text = scriptInput.value;
        if (!text.trim()) return;

        const tokens = tokenizer.tokenize(text);
        trackingEngine = new TrackingEngine(tokens);

        trackingEngine.onPositionUpdate((info) => {
            sysWpm.textContent = `${info.wpm} WPM`;
            sysStatus.textContent = "Aktív";
            renderer.updateActiveWord(info.index);
        });

        trackingEngine.onDebug((d) => {
            if (debugBar) debugBar.textContent = `🎤 "${d.heard}" → ${d.message}`;
        });

        renderer.init(tokens, trackingEngine);
        startBtn.disabled = false;
        restartBtn.disabled = false;
        
        // Vizuális visszajelzés betöltéskor, de ne csukjuk be automatikusan
        loadBtn.textContent = "Szkript Betöltve! ✓";
        setTimeout(() => { loadBtn.textContent = "Szkript Frissítése"; }, 2000);
    });

    restartBtn.addEventListener('click', () => {
        if (trackingEngine) trackingEngine.jumpTo(0);
    });

    // ===================================
    // 5. INDÍTÁS / LEÁLLÍTÁS
    // ===================================
    startBtn.addEventListener('click', () => {
        if (!isListening) {
            if (!speechService) {
                speechService = new SpeechRecognitionService();
                
                speechService.onWordDetected((payload) => {
                    if (trackingEngine) trackingEngine.processWord(payload);
                });

                speechService.onError((err) => {
                    if (debugBar) debugBar.textContent = `❌ Hiba: ${err}`;
                    if (err === 'not-allowed') stopListening();
                });
            }

            speechService.start();
            isListening = true;
            
            // UI Update (Glassmorphism Flow)
            startBtn.classList.add('active');
            startBtn.querySelector('.icon').textContent = "⏹";
            startBtn.querySelector('.text').textContent = "Leállítás";
            
            // Auto-collapse setting panel on start
            document.getElementById('settings-panel').classList.add('collapsed');

            // Screen & Orientation locks
            if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {});
            }
            if ('wakeLock' in navigator) {
                navigator.wakeLock.request('screen').then(lock => { wakeLock = lock; }).catch(() => {});
            }
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(() => {});
            }
            
        } else {
            stopListening();
        }
    });

    function stopListening() {
        if (speechService) speechService.stop();
        isListening = false;
        
        startBtn.classList.remove('active');
        startBtn.querySelector('.icon').textContent = "▶";
        startBtn.querySelector('.text').textContent = "Indítás";

        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
        if (wakeLock) {
            wakeLock.release().then(() => { wakeLock = null; });
        }
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    }

    // ===================================
    // 6. CSÚSZKÁK ÉS KAPCSOLÓK
    // ===================================
    setFs.addEventListener('input', (e) => {
        valFs.textContent = e.target.value;
        prompterContent.style.fontSize = `${e.target.value}px`;
        renderer.forceRecalculateFocus(); 
    });

    setLh.addEventListener('input', (e) => {
        valLh.textContent = e.target.value;
        prompterContent.style.lineHeight = e.target.value;
        renderer.forceRecalculateFocus(); 
    });

    setPad.addEventListener('input', (e) => {
        valPad.textContent = e.target.value;
        prompterContent.style.paddingLeft = `${e.target.value}px`;
        prompterContent.style.paddingRight = `${e.target.value}px`;
        renderer.forceRecalculateFocus(); 
    });

    setAnch.addEventListener('input', (e) => {
        valAnch.textContent = e.target.value;
        focusGuide.style.top = `${e.target.value}%`;
        renderer.options.focusZoneRatio = parseInt(e.target.value) / 100;
        renderer.forceRecalculateFocus(); 
    });

    setMirror.addEventListener('change', (e) => {
        prompterContent.classList.toggle('mirror-mode', e.target.checked);
    });

    setGuide.addEventListener('change', (e) => {
        focusGuide.style.display = e.target.checked ? 'block' : 'none';
    });

    setHighlight.addEventListener('change', (e) => {
        prompterContent.classList.toggle('hide-highlights', !e.target.checked);
    });

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
        if (!trackingEngine || document.activeElement.tagName === 'TEXTAREA') return;
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            trackingEngine.jumpTo(Math.max(0, trackingEngine.currentIndex - 5));
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            trackingEngine.jumpTo(Math.min(trackingEngine.totalWords - 1, trackingEngine.currentIndex + 5));
        } else if (e.key === ' ') {
            e.preventDefault();
            startBtn.click();
        }
    });
});
