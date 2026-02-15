class AudioRecorder {
    constructor(socket, currentUsername, getUserImage) {
        this.socket = socket;
        this.getCurrentUsername = () => currentUsername;
        this.getUserImage = getUserImage;
        
        this.recInterval = null;
        this.seconds = 0;
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.source = null;
        this.animationId = null;
        this.currentStream = null;
        this.lastDrawTime = 0;
        this.heightsBuffer = [];
        
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.pendingSend = false;
        
        this.elements = {
            micBtn: document.getElementById('mic-btn'),
            imgBtn: document.getElementById('img-btn'),
            inputContainer: document.getElementById('input-container'),
            recordingContainer: document.getElementById('recording-container'),
            recordingTimer: document.getElementById('recording-timer'),
            deleteRecBtn: document.getElementById('delete-rec-btn'),
            stopRecBtn: document.getElementById('stop-rec-btn'),
            sendRecBtn: document.getElementById('send-rec-btn'),
            waveform: document.getElementById('waveform'),
            input: document.getElementById('input')
        };
        
        this.initEvents();
    }
    
    initEvents() {
        this.elements.micBtn?.addEventListener('click', () => this.start());
        this.elements.deleteRecBtn?.addEventListener('click', () => this.cancel());
        this.elements.stopRecBtn?.addEventListener('click', () => this.pause());
        this.elements.sendRecBtn?.addEventListener('click', () => this.send());
    }
    
    async initVisualizer() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.currentStream = stream;
            
            const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
            
            this.mediaRecorder = new MediaRecorder(stream, { mimeType });
            this.audioChunks = [];
            this.heightsBuffer = [];
            this.isRecording = true;
            this.pendingSend = false;

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: mimeType });
                const reader = new FileReader();
                reader.onload = () => {
                    window.currentAudioData = reader.result;
                    window.currentAudioDuration = this.seconds;
                    window.currentAudioWaveform = JSON.stringify(this.heightsBuffer.slice(-100));
                    
                    if (this.pendingSend && typeof this.onSendCallback === 'function') {
                        this.onSendCallback();
                        this.pendingSend = false;
                    }
                };
                reader.readAsDataURL(audioBlob);
                this.isRecording = false;
            };

            this.mediaRecorder.start();

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            this.analyser = this.audioContext.createAnalyser();
            this.source = this.audioContext.createMediaStreamSource(stream);
            this.source.connect(this.analyser);
            this.analyser.fftSize = 256; 
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);
            this.elements.waveform.innerHTML = '';
            this.draw(performance.now());
        } catch (e) {
            console.error("Visualizer error:", e);
        }
    }
    
    draw(timestamp) {
        this.animationId = requestAnimationFrame((t) => this.draw(t));
        
        if (timestamp - this.lastDrawTime < 80) return;
        this.lastDrawTime = timestamp;

        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(this.dataArray);

        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i] * this.dataArray[i];
        }
        let rms = Math.sqrt(sum / this.dataArray.length);
        
        let height = (rms / 128) * 40 + 2;
        if (height > 38) height = 38;

        this.heightsBuffer.push(Math.round(height));

        const bar = document.createElement('div');
        bar.className = 'wave-bar';
        bar.style.height = `${height}px`;
        
        this.elements.waveform.appendChild(bar);
    }
    
    stopVisualizer() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(console.error);
        }
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
            this.currentStream = null;
        }
    }
    
    startTimer() {
        this.seconds = 0;
        this.elements.recordingTimer.textContent = "0:00";
        this.recInterval = setInterval(() => {
            this.seconds++;
            const mins = Math.floor(this.seconds / 60);
            const secs = this.seconds % 60;
            this.elements.recordingTimer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
    }
    
    stopTimer() {
        clearInterval(this.recInterval);
    }
    
    showRecordingUI() {
        this.elements.imgBtn.style.display = 'none';
        this.elements.micBtn.style.display = 'none';
        this.elements.inputContainer.style.display = 'none';
        this.elements.recordingContainer.style.display = 'flex';
        this.elements.recordingContainer.classList.add('active');
        this.startTimer();
        this.initVisualizer();
        
        const username = this.getCurrentUsername();
        if (username) {
            this.socket.emit('recording', { username: username, image: this.getUserImage() });
        }
    }
    
    hideRecordingUI() {
        this.elements.imgBtn.style.display = 'flex';
        this.elements.micBtn.style.display = 'flex';
        this.elements.inputContainer.style.display = 'flex';
        this.elements.recordingContainer.style.display = 'none';
        this.elements.recordingContainer.classList.remove('active');
        this.stopTimer();
        this.stopVisualizer();
        this.socket.emit('stop recording');
    }
    
    start() {
        if (this.isRecording) return;
        this.showRecordingUI();
    }
    
    pause() {
        if (this.isRecording) {
            this.elements.recordingContainer.classList.remove('active');
            this.stopTimer();
            this.stopVisualizer();
            this.elements.stopRecBtn.innerHTML = '<i data-lucide="play"></i>';
            lucide.createIcons();
        }
    }
    
    cancel() {
        this.elements.input.value = '';
        this.hideRecordingUI();
        window.currentAudioData = null;
        this.pendingSend = false;
    }
    
    send() {
        this.pendingSend = true;
        this.hideRecordingUI();
    }
    
    isCurrentlyRecording() {
        return this.isRecording;
    }
    
    setSendCallback(callback) {
        this.onSendCallback = callback;
    }
}
