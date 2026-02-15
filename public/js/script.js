const socket = io();
lucide.createIcons();

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const typingIndicator = document.getElementById('typing-indicator');

// Logic for Speech Recognition
const micBtn = document.getElementById('mic-btn');
const imgBtn = document.getElementById('img-btn');
const inputContainer = document.getElementById('input-container');
const recordingContainer = document.getElementById('recording-container');
const recordingTimer = document.getElementById('recording-timer');
const deleteRecBtn = document.getElementById('delete-rec-btn');
const stopRecBtn = document.getElementById('stop-rec-btn');
const sendRecBtn = document.getElementById('send-rec-btn');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;

    let recInterval;
    let seconds = 0;
    let audioContext, analyser, dataArray, source, animationId;
    let lastDrawTime = 0;
    let heightsBuffer = []; // Stocker les hauteurs pour l'envoi
    const waveform = document.getElementById('waveform');

    let mediaRecorder;
    let audioChunks = [];
    window.isRecordingVoice = false; // Utiliser une variable globale ou mieux scopée
    let pendingSend = false;

    async function initVisualizer() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Déterminer le type MIME supporté (WebM pour Android/PC, MP4 pour iOS)
            const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
            
            // Initialisation MediaRecorder pour le vrai audio
            mediaRecorder = new MediaRecorder(stream, { mimeType });
            audioChunks = [];
            heightsBuffer = [];
            window.isRecordingVoice = true;
            pendingSend = false;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: mimeType });
                const reader = new FileReader();
                reader.onload = () => {
                    const base64Audio = reader.result;
                    window.currentAudioData = base64Audio;
                    window.currentAudioDuration = seconds;
                    window.currentAudioWaveform = JSON.stringify(heightsBuffer.slice(-100));
                    
                    if (pendingSend) {
                        sendCurrentMessage();
                        pendingSend = false;
                    }
                };
                reader.readAsDataURL(audioBlob);
                window.isRecordingVoice = false;
            };

            mediaRecorder.start();

            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            
            analyser = audioContext.createAnalyser();
            source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 256; 
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
            waveform.innerHTML = ''; // Nettoyer les ondes précédentes
            draw(performance.now());
        } catch (e) {
            console.error("Visualizer error:", e);
        }
    }

    function draw(timestamp) {
        animationId = requestAnimationFrame(draw);
        
        // Nouvelle barre toutes les 80ms
        if (timestamp - lastDrawTime < 80) return;
        lastDrawTime = timestamp;

        if (!analyser) return;
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
        }
        let rms = Math.sqrt(sum / dataArray.length);
        
        let height = (rms / 128) * 40 + 2;
        if (height > 38) height = 38;

        heightsBuffer.push(Math.round(height));

        const bar = document.createElement('div');
        bar.className = 'wave-bar';
        bar.style.height = `${height}px`;
        
        waveform.appendChild(bar);
    }

    function stopVisualizer() {
        if (animationId) cancelAnimationFrame(animationId);
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close().catch(console.error);
        }
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    }

    function startTimer() {
        seconds = 0;
        recordingTimer.textContent = "0:00";
        recInterval = setInterval(() => {
            seconds++;
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            recordingTimer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
    }

    function stopTimer() {
        clearInterval(recInterval);
    }

    function showRecordingUI() {
        imgBtn.style.display = 'none';
        micBtn.style.display = 'none';
        inputContainer.style.display = 'none';
        recordingContainer.style.display = 'flex';
        recordingContainer.classList.add('active');
        startTimer();
        initVisualizer();
    }

    function hideRecordingUI() {
        imgBtn.style.display = 'flex';
        micBtn.style.display = 'flex';
        inputContainer.style.display = 'flex';
        recordingContainer.style.display = 'none';
        recordingContainer.classList.remove('active');
        stopTimer();
        stopVisualizer();
    }

    sendRecBtn.addEventListener('click', () => {
        pendingSend = true;
        hideRecordingUI();
    });

    micBtn.addEventListener('click', () => {
        if (window.isRecordingVoice) return;
        showRecordingUI();
        try {
            recognition.start();
        } catch (e) {
            console.error("Speech recognition already started or error:", e);
        }
    });

    deleteRecBtn.addEventListener('click', () => {
        try { recognition.abort(); } catch(e) {}
        input.value = '';
        hideRecordingUI();
        window.currentAudioData = null;
        pendingSend = false;
    });

    stopRecBtn.addEventListener('click', () => {
        if (window.isRecordingVoice) {
            try { recognition.stop(); } catch(e) {}
            recordingContainer.classList.remove('active');
            stopTimer();
            stopVisualizer();
            stopRecBtn.innerHTML = '<i data-lucide="play"></i>';
            lucide.createIcons();
        }
    });

    recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            }
        }
        if (finalTranscript) {
            input.value += finalTranscript;
        }
    };

    recognition.onend = () => {
        // Si on n'est plus en mode actif (stop appuyé), on reste dans l'UI pour envoyer
        // Sinon c'est une fin naturelle ou erreur, on pourrait reset
    };

    // Modifier la soumission du formulaire pour reset l'UI
    const originalSubmit = form.onsubmit;
    form.addEventListener('submit', () => {
        hideRecordingUI();
        stopRecBtn.innerHTML = '<i data-lucide="pause"></i>';
        lucide.createIcons();
    });

} else {
    micBtn.style.display = 'none';
}

// User Profile & Storage
const profileAvatar = document.getElementById('profile-avatar');
const backBtn = document.getElementById('back-btn');

let currentUsername = localStorage.getItem('chat-username');
let userImage = localStorage.getItem('chat-user-image');
let userId = localStorage.getItem('chat-user-id') || 'user_' + Math.random().toString(36).substr(2, 9);
localStorage.setItem('chat-user-id', userId);

if (!currentUsername) {
    window.location.href = '/index.html';
}

if (backBtn) {
    backBtn.addEventListener('click', () => {
        window.location.href = '/index.html';
    });
}

const groupHeaderInfo = document.getElementById('group-header-info');
if (groupHeaderInfo) {
    groupHeaderInfo.addEventListener('click', (e) => {
        if (e.target.closest('#back-btn')) return;
        window.location.href = '/groupe-profil.html';
    });
}

socket.emit('get group info');
socket.on('group info', (data) => {
    if (data) {
        const nameElem = document.getElementById('header-group-name');
        const avatarElem = document.getElementById('header-group-avatar');
        if (nameElem) nameElem.textContent = data.name;
        if (avatarElem && data.image) {
            avatarElem.innerHTML = `<img src="${data.image}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        }
    }
});

socket.on('group info updated', (data) => {
    const nameElem = document.getElementById('header-group-name');
    const avatarElem = document.getElementById('header-group-avatar');
    if (nameElem) nameElem.textContent = data.name;
    if (avatarElem && data.image) {
        avatarElem.innerHTML = `<img src="${data.image}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    }
});

const softColors = [
    '#3498db', '#2ecc71', '#e74c3c', '#9b59b6', '#1abc9c', 
    '#e67e22', '#3f51b5', '#e91e63', '#00bcd4', '#27ae60', 
    '#2980b9', '#8e44ad', '#d35400', '#c0392b', '#16a085'
];
function getColorForUser(username) {
    if (!username) return softColors[0];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return softColors[Math.abs(hash) % softColors.length];
}

function updateHeaderAvatar() {
    if (!currentUsername) return;
    if (userImage) {
        profileAvatar.innerHTML = `<img src="${userImage}">`;
        profileAvatar.style.backgroundColor = 'transparent';
    } else {
        profileAvatar.textContent = currentUsername.charAt(0).toUpperCase();
        profileAvatar.style.backgroundColor = getColorForUser(currentUsername);
        profileAvatar.style.color = 'white';
    }
}

updateHeaderAvatar();


// Typing Indicator logic
let typingTimeout;
input.addEventListener('input', () => {
    if (currentUsername) {
        socket.emit('typing', currentUsername);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => socket.emit('stop typing'), 2000);
    }
});

socket.on('user typing', (user) => { typingIndicator.textContent = `${user} écrit...`; });
socket.on('user stop typing', () => { typingIndicator.textContent = ''; });

socket.on('profile updated', (data) => {
    if (data.userId === userId) {
        if (data.username) {
            currentUsername = data.username;
            localStorage.setItem('chat-username', data.username);
        }
        if (data.image !== undefined) {
            userImage = data.image;
            if (userImage) localStorage.setItem('chat-user-image', userImage);
            else localStorage.removeItem('chat-user-image');
        }
        updateHeaderAvatar();
    }
});

// Image Selection & Preview
const messageImageInput = document.getElementById('message-image-input');
const previewContainer = document.getElementById('image-preview-container');
const previewImg = document.getElementById('image-preview');
const removeImgBtn = document.getElementById('remove-image-btn');
let selectedImage = null;

imgBtn.addEventListener('click', () => messageImageInput.click());
messageImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            selectedImage = ev.target.result;
            previewImg.src = selectedImage;
            previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});
removeImgBtn.addEventListener('click', () => {
    selectedImage = null;
    previewContainer.style.display = 'none';
    messageImageInput.value = '';
});

// Form Submission
function sendCurrentMessage() {
    const text = input.value.trim();
    const audio = window.currentAudioData;

    if ((text || selectedImage || audio) && currentUsername) {
        const now = new Date();
        const msg = {
            username: currentUsername,
            userId: userId,
            text: text,
            messageImage: selectedImage,
            audio: audio,
            audioWaveform: window.currentAudioWaveform,
            audioDuration: window.currentAudioDuration,
            image: userImage,
            time: now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0'),
            timestamp: Date.now()
        };
        socket.emit('chat message', msg);
        input.value = '';
        selectedImage = null;
        window.currentAudioData = null;
        window.currentAudioWaveform = null;
        window.currentAudioDuration = null;
        previewContainer.style.display = 'none';
        messageImageInput.value = '';
        socket.emit('stop typing');
    }
}

form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    if (window.isRecordingVoice) {
        pendingSend = true;
        hideRecordingUI();
    } else {
        sendCurrentMessage();
    }
});

// Lightbox
const viewer = document.getElementById('image-viewer');
const viewerImg = document.getElementById('viewer-content');
const viewerClose = document.getElementById('viewer-close');

function openLightbox(src) {
    viewerImg.src = src;
    viewer.style.display = 'flex';
}
viewerClose.addEventListener('click', () => viewer.style.display = 'none');
viewer.addEventListener('click', (e) => { if(e.target === viewer) viewer.style.display = 'none'; });

document.getElementById('profile-btn').addEventListener('click', () => window.location.href = '/profil.html?from=group');

document.getElementById('visio-btn').addEventListener('click', () => {
    if (currentUsername) {
        socket.emit('chat message', {
            id: 'visio_' + Date.now(),
            username: currentUsername,
            userId: userId,
            text: `Rejoignez ma visio conférence !`,
            isVisio: true,
            roomId: 'room_' + Math.random().toString(36).substr(2, 9),
            time: new Date().getHours().toString().padStart(2, '0') + ':' + new Date().getMinutes().toString().padStart(2, '0'),
            timestamp: Date.now()
        });
    }
});

// Message Rendering
let lastSenderId = null;

function renderMessage(msg, shouldScroll = true) {
    const lastClear = parseInt(localStorage.getItem('chat-last-clear') || "0");
    // If the lastClear is in the future (bad clock), reset it
    if (lastClear > Date.now()) localStorage.removeItem('chat-last-clear');
    
    if (msg.timestamp && msg.timestamp < lastClear) return;

    const isMe = msg.userId === userId;
    const isConsecutive = lastSenderId === msg.userId;
    lastSenderId = msg.userId;

    const li = document.createElement('li');
    li.className = isMe ? 'sent' : 'received';
    if (isConsecutive) li.classList.add('consecutive');

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    
    // Pour les vocaux, on gère l'avatar différemment
    if (msg.audio) {
        if (isConsecutive) {
            avatar.style.display = 'none'; // Cache complètement l'avatar externe si consécutif
        } else {
            avatar.style.visibility = 'hidden'; // Garde l'espace pour l'avatar externe
        }
    }

    if (isConsecutive) {
        avatar.style.visibility = 'hidden';
        if (isMe) avatar.style.width = '0';
    } else {
        if (msg.image) {
            avatar.innerHTML = `<img src="${msg.image}">`;
        } else {
            avatar.textContent = msg.username.charAt(0).toUpperCase();
            avatar.style.backgroundColor = getColorForUser(msg.username);
            avatar.style.color = 'white';
        }
        avatar.onclick = () => window.location.href = `/profil.html?userId=${msg.userId}`;
    }

    const main = document.createElement('div');
    main.className = 'message-main';

    const content = document.createElement('div');
    content.className = 'message-content';

    if (!isMe && !isConsecutive) {
        const name = document.createElement('span');
        name.className = 'username';
        name.textContent = msg.username;
        name.style.color = getColorForUser(msg.username);
        name.onclick = () => window.location.href = `/profil.html?userId=${msg.userId}`;
        content.appendChild(name);
    }

    if (msg.messageImage) {
        const img = document.createElement('img');
        img.src = msg.messageImage;
        img.className = 'message-img';
        img.onclick = () => openLightbox(msg.messageImage);
        content.appendChild(img);
    }

    if (msg.text || msg.isVisio || msg.audio) {
        const txtWrapper = document.createElement('div');
        txtWrapper.className = 'message-text-inner';
        
        if (msg.audio) {
            const audioWrapper = document.createElement('div');
            audioWrapper.className = 'audio-message';
            
            // Avatar à l'intérieur pour les messages reçus (uniquement si non consécutif)
            if (!isMe && !isConsecutive) {
                const innerAvatar = document.createElement('div');
                innerAvatar.className = 'audio-inner-avatar';
                if (msg.image) {
                    innerAvatar.innerHTML = `<img src="${msg.image}">`;
                } else {
                    innerAvatar.textContent = msg.username.charAt(0).toUpperCase();
                    innerAvatar.style.backgroundColor = getColorForUser(msg.username);
                    innerAvatar.style.color = 'white';
                }
                audioWrapper.appendChild(innerAvatar);
            } else if (!isMe && isConsecutive) {
                // Pour les messages consécutifs sans avatar, on ajoute un padding pour ne pas coller à la bordure
                // et rester aligné avec le message au-dessus qui a un avatar
                audioWrapper.style.marginLeft = '40px'; 
            }

            const playBtn = document.createElement('button');
            playBtn.className = 'audio-play-btn';
            playBtn.innerHTML = '<i data-lucide="play"></i>';
            
            const audioElem = new Audio(msg.audio);
            let isPlaying = false;
            
            playBtn.onclick = () => {
                // Sur mobile, l'audio peut nécessiter d'être chargé/débloqué
                if (audioElem.paused) {
                    audioElem.play().catch(err => {
                        console.error("Playback error:", err);
                        // Essai de secours : re-chargement
                        audioElem.load();
                        audioElem.play();
                    });
                } else {
                    audioElem.pause();
                    audioElem.currentTime = 0; // Recommence au début si on coupe
                }
            };
            
            audioElem.onplay = () => {
                isPlaying = true;
                playBtn.innerHTML = '<i data-lucide="pause"></i>';
                waveContainer.classList.add('playing');
                lucide.createIcons();
            };
            audioElem.onpause = () => {
                isPlaying = false;
                playBtn.innerHTML = '<i data-lucide="play"></i>';
                waveContainer.classList.remove('playing');
                // Réinitialiser les couleurs des barres
                const bars = waveContainer.querySelectorAll('.static-wave-bar');
                bars.forEach(b => b.style.background = '#90a4ae');
                lucide.createIcons();
            };
            audioElem.onended = () => {
                isPlaying = false;
                audioElem.currentTime = 0;
                playBtn.innerHTML = '<i data-lucide="play"></i>';
                waveContainer.classList.remove('playing');
                const bars = waveContainer.querySelectorAll('.static-wave-bar');
                bars.forEach(b => b.style.background = '#90a4ae');
                lucide.createIcons();
            };

            const waveContainer = document.createElement('div');
            waveContainer.className = 'audio-waveform-static';

            audioElem.ontimeupdate = () => {
                const progress = audioElem.currentTime / audioElem.duration;
                if (isNaN(progress)) return;
                const bars = waveContainer.querySelectorAll('.static-wave-bar');
                const count = Math.floor(progress * bars.length);
                bars.forEach((bar, i) => {
                    bar.style.background = i <= count ? '#075e54' : '#90a4ae';
                });
            };
            
            // Générer les barres à partir du buffer stocké
            try {
                const heights = JSON.parse(msg.audioWaveform || '[]');
                heights.forEach(h => {
                    const b = document.createElement('div');
                    b.className = 'static-wave-bar';
                    b.style.height = `${Math.max(3, h)}px`;
                    waveContainer.appendChild(b);
                });
            } catch(e) { console.error("Waveform parse error", e); }

            const durationInfo = document.createElement('div');
            durationInfo.className = 'audio-duration-info';
            const mins = Math.floor((msg.audioDuration || 0) / 60);
            const secs = (msg.audioDuration || 0) % 60;
            durationInfo.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

            audioWrapper.appendChild(playBtn);
            audioWrapper.appendChild(waveContainer);
            audioWrapper.appendChild(durationInfo);
            txtWrapper.appendChild(audioWrapper);
            
            setTimeout(() => lucide.createIcons(), 0);
        } else if (msg.isVisio == true || msg.isVisio == 1) {
            const room = msg.roomId || 'default';
            const txt = document.createElement('span');
            txt.className = 'text';
            txt.innerHTML = `Invitation visio : <a href="/visio.html?room=${room}" target="_blank">Rejoindre la visio</a>`;
            txtWrapper.appendChild(txt);
        } else {
            const txt = document.createElement('span');
            txt.className = 'text';
            txt.textContent = msg.text;
            txtWrapper.appendChild(txt);
        }
        content.appendChild(txtWrapper);
    }

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = msg.time;
    content.appendChild(time);

    main.appendChild(content);
    if (!isMe) li.appendChild(avatar);
    li.appendChild(main);
    
    messages.appendChild(li);
    if (shouldScroll) {
        setTimeout(() => {
            li.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 100);
    }
}

socket.on('chat message', renderMessage);
socket.on('load history', (history) => {
    messages.innerHTML = '';
    lastSenderId = null;
    history.forEach(msg => renderMessage(msg, false));
    
    // Scroll to bottom after history is loaded
    setTimeout(() => {
        window.scrollTo(0, document.body.scrollHeight);
    }, 100);
});
socket.on('messages cleared', () => {
    messages.innerHTML = '';
});
