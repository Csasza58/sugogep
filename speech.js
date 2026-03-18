document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializáljuk a Speech Service-t
    const speechService = new SpeechRecognitionService();

    // UI Elemek
    const micBtn = document.getElementById('mic-btn');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    
    // VAD Elemek
    const volumeFill = document.getElementById('volume-fill');
    const speakingText = document.getElementById('speaking-text');
    const volLabel = document.getElementById('vol-label');
    
    // Stream és Log elemek
    const transcriptContainer = document.getElementById('transcript-container');
    const streamEmpty = document.getElementById('stream-empty');
    const payloadLog = document.getElementById('payload-log');
    const clearLogBtn = document.getElementById('clear-log-btn');

    let isListening = false;

    // Ellenőrizni, hogy támogatott-e a böngésző
    if (!speechService.isBrowserSupported()) {
        statusText.textContent = "Hiba: Böngésző nem támogatott (Használj Chrome-ot)";
        statusText.style.color = "#ef4444";
        micBtn.style.opacity = "0.5";
        return;
    }

    // ==========================================
    // ESEMÉNYFELIRATKOZÁSOK (SERVICE -> UI)
    // ==========================================

    let payloadHistory = [];

    // Új felismert szó "Delta" érkezése (Mind Interim, mind Final)
    speechService.onWordDetected((payload) => {
        // payload = { word, clean, isFinal, confidence }
        
        if (streamEmpty) streamEmpty.style.display = 'none';

        // 1. Vizualizáció a UI-n
        const wordEl = document.createElement('div');
        wordEl.className = `stream-word ${payload.isFinal ? 'final' : 'interim'}`;
        wordEl.textContent = payload.word;
        transcriptContainer.appendChild(wordEl);
        
        // Auto-scroll
        transcriptContainer.scrollTop = transcriptContainer.scrollHeight;

        // 2. Logolás (Payload, amit a Prompter kapna meg fázis 3-ban)
        const logEntry = `[${payload.isFinal ? 'FINAL' : 'INTERIM'}] -> clean: "${payload.clean}", word: "${payload.word}"`;
        payloadHistory.push(logEntry);
        if (payloadHistory.length > 30) payloadHistory.shift(); // Keep last 30
        
        payloadLog.textContent = payloadHistory.join('\n');
        payloadLog.parentElement.scrollTop = payloadLog.parentElement.scrollHeight;
    });

    // VAD Hangerő változás és Beszéd állapot
    speechService.onVolumeChange((data) => {
        // data = { volume: 0-100, isSpeaking: boolean }
        
        // Volume Bar frissítése
        volumeFill.style.width = `${data.volume}%`;
        volLabel.textContent = `${data.volume}%`;

        // Beszéd státusz szöveg
        if (data.isSpeaking) {
            speakingText.textContent = "Beszél...";
            speakingText.classList.add('is-speaking');
        } else {
            speakingText.textContent = "Csend";
            speakingText.classList.remove('is-speaking');
        }
    });

    // Hibakezelés
    speechService.onError((error) => {
        if (error === 'not-allowed') {
            statusText.textContent = "Hiba: Mikrofon engedély megtagadva!";
            stopListening();
        } else if (error === 'network') {
            statusText.textContent = "Hálózati hiba... Újraindítás...";
        } else {
            console.log("ASR Hiba Info:", error);
        }
    });

    // ==========================================
    // UI VEZÉRLÉS (UI -> SERVICE)
    // ==========================================

    micBtn.addEventListener('click', () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    });

    clearLogBtn.addEventListener('click', () => {
        payloadHistory = [];
        payloadLog.textContent = '';
        transcriptContainer.innerHTML = '';
    });

    function startListening() {
        speechService.start();
        isListening = true;
        
        // UI Frissítés
        micBtn.classList.add('active');
        statusDot.className = 'dot online';
        statusText.textContent = "Hallgatás folyamatban (Folyamatos)";
    }

    function stopListening() {
        speechService.stop();
        isListening = false;
        
        // UI Frissítés
        micBtn.classList.remove('active');
        statusDot.className = 'dot offline';
        statusText.textContent = "Készenlét (Kattints a mikrofonra)";
        
        // VAD alaphelyzet
        volumeFill.style.width = '0%';
        volLabel.textContent = '0%';
        speakingText.textContent = "Csend";
        speakingText.classList.remove('is-speaking');
    }
});
