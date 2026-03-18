/**
 * 2. Mérföldkő - SpeechRecognitionService
 * Magas pontosságú Audio Stream és ASR Interfész
 */

class SpeechRecognitionService {
    constructor() {
        // Natív API támogatás ellenőrzése
        this.isSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
        
        if (!this.isSupported) {
            console.error("Web Speech API nem támogatott a jelenlegi böngészőben!");
            return;
        }

        // ASR konfiguráció
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRec();
        this.recognition.continuous = true;
        this.recognition.interimResults = true; // Kritikus konfiguráció a részeredményekhez
        this.recognition.lang = 'hu-HU';

        // Eseménykezelő visszahívások
        this.wordCallback = null;
        this.volumeCallback = null;
        this.errorCallback = null;

        // Állapottartók
        this.isManuallyStopped = true;
        this.isRecognizing = false;
        
        // VAD (Voice Activity Detection) - AnalyserNode állapottartók
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.animationId = null;
        this.isSpeaking = false;
        this.lastSpokeTime = Date.now(); // ÚJ: Szellempuffer védelem
        
        // Delta stream adatfolyam nyomkövető 
        this.lastInterimWords = [];

        this._setupEvents();
    }

    /**
     * Visszaadja, hogy a böngésző alkalmas-e a Speech szolgáltatás futtatására.
     */
    isBrowserSupported() {
        return this.isSupported;
    }

    /**
     * Eseménykezelők belesítése a SpeechRecognition objektumba
     */
    _setupEvents() {
        this.recognition.onstart = () => {
            this.isRecognizing = true;
            this._startAudioAnalyzer(); // VAD indítása
        };

        this.recognition.onresult = (event) => {
            const now = Date.now();
            
            // SZELLEMPUFFER VÉDELEM (Csak asztali gépen, ahol fut a VAD)
            // Ha a helyi mikrofon >1.5 másodperce csendet érzékel...
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            if (!isMobile && (now - this.lastSpokeTime > 1500)) {
                console.warn("[VÉDELEM] ASR adat eldobva: A szerver 1.5mp-nél többet késett a csendben.");
                return;
            }

            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    interimTranscript += result[0].transcript;
                }
            }

            // --- 1. Véglegesített (Final) szavak feldolgozása ---
            if (finalTranscript) {
                const words = finalTranscript.trim().split(/\s+/).filter(w => w.length > 0);
                const conf = event.results[event.results.length - 1][0].confidence;
                
                words.forEach(word => {
                    this._emitWord(word, true, conf);
                });
                
                // Mivel a mondat lezárult, ürítjük az interim deltát
                this.lastInterimWords = [];
            }
            
            // --- 2. Részleges (Interim) szavak Delta-alapú feldolgozása ---
            if (interimTranscript) {
                this._processInterimWords(interimTranscript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('ASR Hiba:', event.error);
            if (this.errorCallback) this.errorCallback(event.error);
            
            // Auto-Restart biztonsági háló (pl. hálózati megszakadás vagy no-speech Timeout esetén)
            if (event.error === 'network' || event.error === 'no-speech' || event.error === 'aborted') {
                if (!this.isManuallyStopped) {
                    this._safeRestart();
                }
            } else if (event.error === 'not-allowed' || event.error === 'audio-capture') {
                // Fatális hiba, nem próbáljuk újraindítani (engedély megtagadva stb.)
                this.stop();
            }
        };

        this.recognition.onend = () => {
            this.isRecognizing = false;
            // Ha a szolgáltatás megszakadt a felhasználó parancsa nélkül -> Újraindítás
            if (!this.isManuallyStopped) {
                // Mobilon (iOS) hírhedt a hívás megszakadása "continuous" ellenére
                this._safeRestart();
            } else {
                this._stopAudioAnalyzer();
            }
        };
    }

    /**
     * Biztonságos újraindítási logika
     */
    _safeRestart() {
        if (this.isManuallyStopped) return;
        setTimeout(() => {
            if (!this.isRecognizing && !this.isManuallyStopped) {
                try {
                    this.recognition.start();
                } catch (e) {
                    console.warn("Újraindítási kísérlet meghiúsult:", e);
                }
            }
        }, 500); // Fél másodperc késleltetés a spam kiküszöbölésére
    }

    /**
     * Intelligens Delta-alapú számítás a részeredményeknél.
     * Csak azokat a szavakat küldi tovább, amelyek újonnan jelentek meg a mondat bővülése során.
     */
    _processInterimWords(transcript) {
        const currentWords = transcript.trim().split(/\s+/).filter(w => w.length > 0);
        
        // Delta index keresése: Végignézzük, hogy meddig egyezik az előző részeredménnyel
        let matchIndex = 0;
        while (
            matchIndex < this.lastInterimWords.length && 
            matchIndex < currentWords.length && 
            this.lastInterimWords[matchIndex] === currentWords[matchIndex]
        ) {
            matchIndex++;
        }

        // Esemény küldése csak az új (vagy megváltozott) szavakra (Delta)
        for (let i = matchIndex; i < currentWords.length; i++) {
            this._emitWord(currentWords[i], false, 0); // Interim esetében 0 a bizalomérték
        }
        
        // Állapot frissítése a következő delta körhöz
        this.lastInterimWords = currentWords;
    }

    /**
     * Normalizáló Filter és Esemény emittáló 
     * Hozzáigazítva az 1. fázis Clean Text struktúrájához.
     */
    _emitWord(rawWord, isFinal, confidence) {
        if (!this.wordCallback) return;
        
        // Alapvető tisztítás a Prompt leírása alapján (kisbetűsítés, írásjelek nélkül)
        const clean = rawWord.replace(/[.,!?/:;"'()\[\]{}]/g, '').toLowerCase();
        
        if (clean.length > 0) {
            this.wordCallback({
                word: rawWord,
                clean: clean,
                isFinal: isFinal,
                confidence: confidence
            });
        }
    }

    // ==========================================
    // API Interfész Publikus Metódusok
    // ==========================================

    start() {
        if (!this.isSupported) {
            if (this.errorCallback) this.errorCallback('not-supported');
            return;
        }
        this.isManuallyStopped = false;
        if (!this.isRecognizing) {
            try {
                this.recognition.start();
            } catch(e) {
                console.warn("Már fut a felismerés.", e);
            }
        }
    }

    stop() {
        this.isManuallyStopped = true;
        if (this.isSupported && this.isRecognizing) {
            this.recognition.stop();
        }
        this._stopAudioAnalyzer();
    }

    onWordDetected(callback) {
        this.wordCallback = callback;
    }

    onVolumeChange(callback) {
        this.volumeCallback = callback;
    }

    onError(callback) {
        this.errorCallback = callback;
    }

    // ==========================================
    // VAD ÉS AUDIO VIZUALIZÁCIÓ (Web Audio API)
    // ==========================================

    async _startAudioAnalyzer() {
        if (this.audioContext && this.audioContext.state !== 'closed') return;
        
        // MOBIL HARDVER KONFLIKTUS VÉDELEM:
        // A telefonok (iOS/Android) szigorúan zárolják a mikrofont 1 processznek.
        // Ha a WebAudio VAD és a SpeechRecognition egyszerre kéri el a mikrofont, összeomlik.
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
            console.warn("Mobil eszköz érzékelve: WebAudio VAD kikapcsolva, hogy ne lophassa el a mikrofont az ASR-től.");
            // Szimuláljuk, hogy beszél, hogy ne essen ki a ghost-buffer védelemből
            this.isSpeaking = true;
            this.lastSpokeTime = Date.now();
            return;
        }

        try {
            // Natív user stream elkérése elemzés céljából
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 512;
            this.analyser.smoothingTimeConstant = 0.8;

            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);

            this._monitorVolume();
        } catch (err) {
            console.warn("VAD analyser indítása blokkolva:", err);
            if (this.errorCallback) this.errorCallback('audio-capture');
        }
    }

    _monitorVolume() {
        if (!this.analyser || this.isManuallyStopped) return;

        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        
        const check = () => {
            if (this.isManuallyStopped) return;

            this.analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            let average = sum / dataArray.length;
            
            // Konvertálás 0-100 skálára (erősített láthatóság)
            let volume = Math.min(100, Math.round((average / 128) * 100));

            // Hang jelenlétének érzékelése (Aktív Beszéd Küszöbérték / Threshold)
            let isSpk = volume > 8; // >8% hangerő felett aktív beszédként érzékeljük
            
            if (isSpk) {
                this.lastSpokeTime = Date.now(); // Rögzítjük az utolsó hanghatás idejét
            }

            this.isSpeaking = isSpk;
            if (this.volumeCallback) {
                this.volumeCallback({ volume: volume, isSpeaking: this.isSpeaking });
            }

            // Real-time folyamatos hurok
            this.animationId = requestAnimationFrame(check);
        };
        
        check();
    }

    _stopAudioAnalyzer() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.audioContext) {
            this.audioContext.close().catch(() => {});
            this.audioContext = null;
        }
        this.analyser = null;
        this.microphone = null;
        this.isSpeaking = false;
        
        if (this.volumeCallback) {
            this.volumeCallback({ volume: 0, isSpeaking: false });
        }
    }
}

// Module / Browser Exportálhatóság
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SpeechRecognitionService };
} else if (typeof window !== 'undefined') {
    window.SpeechRecognitionService = SpeechRecognitionService;
}
