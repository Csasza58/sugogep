document.addEventListener('DOMContentLoaded', () => {
    // ===================================
    // 1. DOM ELEMEK
    // ===================================
    const loadBtn = document.getElementById('btn-load');
    const startBtn = document.getElementById('btn-start');
    const scriptInput = document.getElementById('script-input');
    const prompterContent = document.getElementById('prompter-content');
    const debugBar = document.getElementById('debug-bar');
    const restartBtn = document.getElementById('btn-restart');

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

    const sysStatus = document.getElementById('sys-status');
    const sysWpm = document.getElementById('sys-wpm');

    // ===================================
    // 2. OSZTÁLYOK
    // ===================================
    const tokenizer = new Tokenizer();
    let trackingEngine = null;
    let speechService = null;
    let isListening = false;
    let wakeLock = null; // ÚJ: Képernyő ébrentartás
    
    const renderer = new PrompterRenderer('prompter-viewport', 'prompter-content', {
        easingFactor: 0.4,
        focusZoneRatio: 0.35,
        onWordClick: (index) => {
            if (trackingEngine) {
                trackingEngine.jumpTo(index);
            }
        }
    });

    // ===================================
    // 3. SZKRIPT BETÖLTÉSE
    // ===================================
    loadBtn.addEventListener('click', () => {
        const text = scriptInput.value;
        if (!text.trim()) return;

        const tokens = tokenizer.tokenize(text);
        
        trackingEngine = new TrackingEngine(tokens);

        // Tracking -> Renderer
        trackingEngine.onPositionUpdate((info) => {
            sysWpm.textContent = `${info.wpm} WPM`;
            sysStatus.textContent = "Szinkronban";
            sysStatus.style.color = "#a3e635";
            renderer.updateActiveWord(info.index);
        });

        // Debug sáv frissítése
        trackingEngine.onDebug((d) => {
            if (debugBar) {
                debugBar.textContent = `🎤 "${d.heard}" → ${d.message} | Pozíció: ${d.position}/${trackingEngine.totalWords}`;
            }
        });

        renderer.init(tokens, trackingEngine);

        startBtn.disabled = false;
        restartBtn.disabled = false;
        document.getElementById('settings-panel').classList.add('collapsed');
    });

    // Új: Vissza az elejére gomb
    restartBtn.addEventListener('click', () => {
        if (trackingEngine) {
            trackingEngine.jumpTo(0);
        }
    });

    // ===================================
    // 4. ÉLES INDÍTÁS / LEÁLLÍTÁS
    // ===================================
    startBtn.addEventListener('click', () => {
        if (!isListening) {
            if (!speechService) {
                speechService = new SpeechRecognitionService();
                
                if (!speechService.isBrowserSupported()) {
                    alert("A böngésződ nem támogatja a Web Speech API-t! Használj Chrome-ot.");
                    return;
                }

                // ASR -> Tracking Engine
                speechService.onWordDetected((payload) => {
                    if (trackingEngine) {
                        trackingEngine.processWord(payload);
                    }
                });

                speechService.onError((err) => {
                    console.error("ASR hiba:", err);
                    if (debugBar) {
                        debugBar.textContent = `❌ ASR Hiba: ${err}`;
                        debugBar.style.color = '#ef4444';
                    }
                    if (err === 'not-allowed') {
                        alert("Engedélyezd a mikrofont!");
                        stopListening();
                    }
                });

                // Hangerő feedback
                speechService.onVolumeChange((v) => {
                    if (debugBar && v.isSpeaking) {
                        debugBar.style.borderColor = '#a3e635';
                    } else if (debugBar) {
                        debugBar.style.borderColor = 'rgba(255,255,255,0.1)';
                    }
                });
            }

            speechService.start();
            isListening = true;
            startBtn.textContent = "⏹️ Leállítás";
            startBtn.style.background = "#ef4444";
            if (debugBar) {
                debugBar.textContent = "🎤 Mikrofon aktív — beszélj...";
                debugBar.style.color = '#a3e635';
            }

            // 1. Teljes képernyő kérése (mobilon kritikus kihasználni a helyet)
            if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {});
            }

            // 2. Képernyő kikapcsolásának megakadályozása (Wake Lock API)
            if ('wakeLock' in navigator) {
                navigator.wakeLock.request('screen')
                    .then(lock => { wakeLock = lock; })
                    .catch(() => {});
            }

            // 3. Opcionális: Kényszerített fekvő nézet (ha beavatkozást enged a rendszer)
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
        startBtn.textContent = "🎙️ 2. Éles Indítás";
        startBtn.style.background = "";
        if (debugBar) {
            debugBar.textContent = "Mikrofon leállítva";
            debugBar.style.color = '#a1a1aa';
        }

        // Tisztítás: Teljes képernyő és Wake Lock elengedése
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
        if (wakeLock !== null) {
            wakeLock.release().catch(() => {});
            wakeLock = null;
        }
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    }

    // ===================================
    // 5. BEÁLLÍTÁSOK
    // ===================================
    setFs.addEventListener('input', (e) => {
        const v = e.target.value;
        valFs.textContent = v;
        prompterContent.style.fontSize = `${v}px`;
        renderer.forceRecalculateFocus(); 
    });

    setLh.addEventListener('input', (e) => {
        const v = e.target.value;
        valLh.textContent = v;
        prompterContent.style.lineHeight = v;
        renderer.forceRecalculateFocus(); 
    });

    setPad.addEventListener('input', (e) => {
        const v = e.target.value;
        valPad.textContent = v;
        prompterContent.style.paddingLeft = `${v}px`;
        prompterContent.style.paddingRight = `${v}px`;
        renderer.forceRecalculateFocus(); 
    });

    setAnch.addEventListener('input', (e) => {
        const v = e.target.value;
        valAnch.textContent = v;
        focusGuide.style.top = `${v}%`;
        renderer.options.focusZoneRatio = parseInt(v) / 100;
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

    // ===================================
    // 6. PANEL TOGGLE
    // ===================================
    document.getElementById('panel-toggle').addEventListener('click', () => {
        document.getElementById('settings-panel').classList.toggle('collapsed');
    });

    // ===================================
    // 7. BILLENTYŰZET NAVIGÁCIÓ (Fel/Le nyilak)
    // ===================================
    window.addEventListener('keydown', (e) => {
        if (!trackingEngine) return;
        
        // Ha nem input/textarea elemben vagyunk
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            trackingEngine.jumpTo(Math.max(0, trackingEngine.currentIndex - 5));
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            trackingEngine.jumpTo(Math.min(trackingEngine.totalWords - 1, trackingEngine.currentIndex + 5));
        }
    });
});
