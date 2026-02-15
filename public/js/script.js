const socket = io();
lucide.createIcons();

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('SW registered');
        }).catch(err => {
            console.log('SW registration failed: ', err);
        });
    });
}

// Request Notification Permission
if ("Notification" in window) {
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
}

// Listen for messages from Service Worker (Quick Reply)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.type === 'REPLY_MSG' || event.data.type === 'REPLY_MSG') {
            const replyText = event.data.text;
            if (replyText && currentUsername) {
                const now = new Date();
                const msg = {
                    username: currentUsername,
                    userId: userId,
                    text: replyText,
                    image: userImage,
                    time: now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0'),
                    timestamp: Date.now()
                };
                socket.emit('chat message', msg);
            }
        }
    });
}

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const typingIndicator = document.getElementById('typing-indicator');

// Reply Logic Elements
const replyPreview = document.getElementById('reply-preview-container');
const replyPreviewUser = document.getElementById('reply-preview-user');
const replyPreviewText = document.getElementById('reply-preview-text');
const replyPreviewBar = document.getElementById('reply-preview-bar');
const closeReplyBtn = document.getElementById('close-reply-btn');
let replyingTo = null;

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
    let audioContext, analyser, dataArray, source, animationId, currentStream;
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
            currentStream = stream;
            
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
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
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
        if (currentUsername) {
            socket.emit('recording', { username: currentUsername, image: userImage });
        }
    }

    function hideRecordingUI() {
        imgBtn.style.display = 'flex';
        micBtn.style.display = 'flex';
        inputContainer.style.display = 'flex';
        recordingContainer.style.display = 'none';
        recordingContainer.classList.remove('active');
        stopTimer();
        stopVisualizer();
        try { recognition.stop(); } catch(e) {}
        socket.emit('stop recording');
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

function updateGroupHeaderUI(data) {
    if (data) {
        localStorage.setItem('chat-group-info', JSON.stringify(data));
        const nameElem = document.getElementById('header-group-name');
        const avatarElem = document.getElementById('header-group-avatar');
        if (nameElem) nameElem.textContent = data.name;
        if (avatarElem) {
            if (data.image) {
                avatarElem.innerHTML = `<img src="${data.image}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            } else {
                avatarElem.innerHTML = "💬";
            }
        }
    }
}

// Load group info from LocalStorage immediately
const savedGroupInfo = localStorage.getItem('chat-group-info');
if (savedGroupInfo) {
    updateGroupHeaderUI(JSON.parse(savedGroupInfo));
}

socket.on('group info', updateGroupHeaderUI);
socket.on('group info updated', updateGroupHeaderUI);

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


// --- IndexedDB Management for Massive Storage ---
const dbName = "ChatAppDB";
const storeName = "messages";
let db;

const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: "timestamp" });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = (e) => reject(e);
    });
};

async function saveMessageToDB(msg) {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        store.put(msg);
        transaction.oncomplete = () => resolve();
        transaction.onerror = (e) => reject(e);
    });
}

async function getAllMessagesFromDB() {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e);
    });
}

async function clearOldMessages(expirationMs) {
    if (!db) await initDB();
    const now = Date.now();
    const messages = await getAllMessagesFromDB();
    const toDelete = messages.filter(m => (now - m.timestamp) > expirationMs);
    
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    toDelete.forEach(m => store.delete(m.timestamp));
}

// Typing Indicator logic with Debounce
let typingTimeout;
const sendTyping = () => {
    socket.emit('typing', { username: currentUsername, image: userImage });
};

input.addEventListener('input', () => {
    if (currentUsername) {
        if (!typingTimeout) sendTyping();
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('stop typing');
            typingTimeout = null;
        }, 2000);
    }
});

socket.on('user typing', (data) => {
    const { username, image } = data;
    
    let avatarContent = '';
    if (image) {
        avatarContent = `<img src="${image}" alt="${username}">`;
    } else {
        avatarContent = username.charAt(0).toUpperCase();
    }

    typingIndicator.innerHTML = `
        <div class="typing-avatar" style="background-color: ${image ? 'transparent' : getColorForUser(username)}">
            ${avatarContent}
        </div>
        <div class="typing-bubble">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    typingIndicator.classList.add('active');
    
    // Auto scroll to bottom if we are near it
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
        window.scrollTo(0, document.body.scrollHeight);
    }
});

socket.on('user stop typing', () => {
    typingIndicator.classList.remove('active');
    typingIndicator.innerHTML = '';
});

socket.on('user recording', (data) => {
    const { username, image } = data;
    
    let avatarContent = '';
    if (image) {
        avatarContent = `<img src="${image}" alt="${username}">`;
    } else {
        avatarContent = username.charAt(0).toUpperCase();
    }

    typingIndicator.innerHTML = `
        <div class="typing-avatar" style="background-color: ${image ? 'transparent' : getColorForUser(username)}">
            ${avatarContent}
        </div>
        <div class="typing-bubble">
            <i data-lucide="mic" style="width: 20px; height: 20px; color: #555;"></i>
        </div>
    `;
    typingIndicator.classList.add('active');
    lucide.createIcons();
    
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
        window.scrollTo(0, document.body.scrollHeight);
    }
});

socket.on('user stop recording', () => {
    typingIndicator.classList.remove('active');
    typingIndicator.innerHTML = '';
});

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
            timestamp: Date.now(),
            replyTo: replyingTo
        };
        socket.emit('chat message', msg);
        input.value = '';
        selectedImage = null;
        window.currentAudioData = null;
        window.currentAudioWaveform = null;
        window.currentAudioDuration = null;
        previewContainer.style.display = 'none';
        messageImageInput.value = '';
        closeReplyPreview();
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
            text: `Rejoignez ma visioconférence !`,
            isVisio: true,
            roomId: 'room_' + Math.random().toString(36).substr(2, 9),
            time: new Date().getHours().toString().padStart(2, '0') + ':' + new Date().getMinutes().toString().padStart(2, '0'),
            timestamp: Date.now()
        });
    }
});

// Context Menu Logic
const contextMenu = document.getElementById('message-context-menu');
const messageOverlay = document.getElementById('message-overlay');
let selectedMessageId = null;
let highlightedMessage = null;

function showContextMenu(e, msgId, isMe, messageElement) {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    selectedMessageId = msgId;
    
    if (highlightedMessage) {
        highlightedMessage.classList.remove('highlighted');
        highlightedMessage.style.transform = '';
    }
    highlightedMessage = messageElement;
    highlightedMessage.classList.add('highlighted');
    
    messageOverlay.style.display = 'block';
    contextMenu.style.display = 'flex';
    contextMenu.classList.add('active');
    
    const rect = messageElement.getBoundingClientRect();
    const reactionBar = contextMenu.querySelector('.reaction-bar');
    const menuList = contextMenu.querySelector('.context-menu-list');
    
    // Calcul du déplacement nécessaire (Translation) pour éviter que ça sorte de l'écran
    let translateY = 0;
    const reactionHeight = 60;
    const menuHeight = 320;
    const margin = 20;

    if (rect.top < reactionHeight + margin) {
        // Trop haut : on décale vers le bas
        translateY = (reactionHeight + margin) - rect.top;
    } else if (rect.bottom > window.innerHeight - menuHeight - margin) {
        // Trop bas : on décale vers le haut
        translateY = (window.innerHeight - menuHeight - margin) - rect.bottom;
    }

    // Appliquer la translation au message
    highlightedMessage.style.transform = `scale(1.02) translateY(${translateY}px)`;

    const shiftedRect = {
        top: rect.top + translateY,
        bottom: rect.bottom + translateY,
        left: rect.left,
        right: rect.right
    };

    // Vérifier si l'utilisateur a déjà réagi pour griser l'émoji dans le menu
    const msgs = getLocalMessages();
    const currentMsg = msgs.find(m => m.timestamp == msgId);
    let myEmoji = null;
    if (currentMsg && currentMsg.reactions) {
        try {
            const reactions = JSON.parse(currentMsg.reactions);
            const found = reactions.find(r => r.userId === userId);
            if (found) myEmoji = found.emoji;
        } catch(e) {}
    }

    // Réinitialiser les états grisé du menu
    reactionBar.querySelectorAll('span').forEach(span => {
        if (span.textContent === myEmoji) {
            span.classList.add('selected');
        } else {
            span.classList.remove('selected');
        }
    });

    // Vérifier si une réaction existe déjà pour décaler le menu vers le bas
    const hasReaction = messageElement.querySelector('.message-reactions');
    const offset = hasReaction ? 25 : 10;
    
    // Positionnement de la barre de réactions AU-DESSUS du message décalé
    reactionBar.style.position = 'fixed';
    reactionBar.style.bottom = `${window.innerHeight - shiftedRect.top + 10}px`;
    
    // Positionnement de la liste d'actions EN-DESSOUS du message décalé
    menuList.style.position = 'fixed';
    menuList.style.top = `${shiftedRect.bottom + offset}px`;

    if (isMe) {
        menuList.style.right = `${Math.max(10, window.innerWidth - shiftedRect.right)}px`;
        menuList.style.left = 'auto';
        reactionBar.style.right = `${Math.max(10, window.innerWidth - shiftedRect.right)}px`;
        reactionBar.style.left = 'auto';
    } else {
        menuList.style.left = `${Math.max(10, shiftedRect.left)}px`;
        menuList.style.right = 'auto';
        reactionBar.style.left = `${Math.max(10, shiftedRect.left)}px`;
        reactionBar.style.right = 'auto';
    }

    const deleteBtn = document.getElementById('menu-delete');
    if (deleteBtn) deleteBtn.style.display = isMe ? 'flex' : 'none';

    // Cacher l'option Répondre pour ses propres messages
    const replyBtn = document.getElementById('menu-reply');
    if (replyBtn) replyBtn.style.display = isMe ? 'none' : 'flex';

    // Cacher l'option Copier pour les messages vocaux
    const copyBtn = document.getElementById('menu-copy');
    const isAudio = messageElement.querySelector('.audio-message');
    if (copyBtn) copyBtn.style.display = isAudio ? 'none' : 'flex';
}

function showToast(message) {
    const toast = document.getElementById('custom-toast');
    toast.querySelector('span').textContent = message;
    toast.style.display = 'flex';
    toast.classList.remove('fade-out');
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
            toast.style.display = 'none';
        }, 500);
    }, 2000);
}

const reactionsDetailMenu = document.getElementById('reactions-detail-menu');
const reactionsDetailList = document.getElementById('reactions-detail-list');

function showAllReactions(msgId, messageElement) {
    selectedMessageId = msgId;
    
    if (highlightedMessage) {
        highlightedMessage.classList.remove('highlighted');
        highlightedMessage.style.transform = '';
    }
    highlightedMessage = messageElement;
    highlightedMessage.classList.add('highlighted');
    
    messageOverlay.style.display = 'block';
    reactionsDetailMenu.style.display = 'flex';
    reactionsDetailMenu.classList.add('active');
    
    const rect = messageElement.getBoundingClientRect();
    const reactionBar = reactionsDetailMenu.querySelector('.reaction-bar');
    
    let translateY = 0;
    const reactionHeight = 60;
    const listHeight = 250;
    const margin = 20;

    if (rect.top < reactionHeight + margin) {
        translateY = (reactionHeight + margin) - rect.top;
    } else if (rect.bottom > window.innerHeight - listHeight - margin) {
        translateY = (window.innerHeight - listHeight - margin) - rect.bottom;
    }

    highlightedMessage.style.transform = `scale(1.02) translateY(${translateY}px)`;

    const shiftedRect = {
        top: rect.top + translateY,
        bottom: rect.bottom + translateY,
        left: rect.left,
        right: rect.right
    };

    // Griser l'émoji actuel de l'utilisateur
    const msgs = getLocalMessages();
    const currentMsg = msgs.find(m => m.timestamp == msgId);
    let myEmoji = null;
    let allReactions = [];

    if (currentMsg && currentMsg.reactions) {
        try {
            allReactions = JSON.parse(currentMsg.reactions);
            const found = allReactions.find(r => r.userId === userId);
            if (found) myEmoji = found.emoji;
        } catch(e) {}
    }

    reactionBar.querySelectorAll('span').forEach(span => {
        if (span.textContent === myEmoji) span.classList.add('selected');
        else span.classList.remove('selected');
    });

    // Remplir la liste détaillée
    reactionsDetailList.innerHTML = '';
    allReactions.forEach(r => {
        const item = document.createElement('div');
        item.className = 'reaction-item';
        
        // Trouver le nom et l'image de l'utilisateur dans l'historique
        const userMsg = msgs.find(m => m.userId === r.userId);
        const name = userMsg ? userMsg.username : "Utilisateur";
        const img = userMsg ? userMsg.image : null;
        
        item.innerHTML = `
            <div class="reaction-item-avatar" style="background-color: ${img ? 'transparent' : getColorForUser(name)}">
                ${img ? `<img src="${img}">` : name.charAt(0).toUpperCase()}
            </div>
            <div class="reaction-item-name">${name} ${r.userId === userId ? "(Moi)" : ""}</div>
            <div class="reaction-item-emoji">${r.emoji}</div>
        `;
        reactionsDetailList.appendChild(item);
    });

    reactionBar.style.position = 'fixed';
    reactionBar.style.bottom = `${window.innerHeight - shiftedRect.top + 10}px`;
    
    reactionsDetailList.style.position = 'fixed';
    reactionsDetailList.style.top = `${shiftedRect.bottom + 10}px`;

    const isMe = currentMsg ? currentMsg.userId === userId : false;
    if (isMe) {
        reactionsDetailList.style.right = `${Math.max(10, window.innerWidth - shiftedRect.right)}px`;
        reactionsDetailList.style.left = 'auto';
        reactionBar.style.right = `${Math.max(10, window.innerWidth - shiftedRect.right)}px`;
        reactionBar.style.left = 'auto';
    } else {
        reactionsDetailList.style.left = `${Math.max(10, shiftedRect.left)}px`;
        reactionsDetailList.style.right = 'auto';
        reactionBar.style.left = `${Math.max(10, shiftedRect.left)}px`;
        reactionBar.style.right = 'auto';
    }
}

function hideContextMenu() {
    if (!contextMenu.classList.contains('active') && !reactionsDetailMenu.classList.contains('active')) return;
    
    contextMenu.classList.add('closing');
    reactionsDetailMenu.classList.add('closing');
    messageOverlay.classList.add('closing');
    
    if (highlightedMessage) {
        highlightedMessage.classList.remove('highlighted');
        highlightedMessage.style.transform = '';
    }

    setTimeout(() => {
        contextMenu.style.display = 'none';
        contextMenu.classList.remove('active', 'closing');
        reactionsDetailMenu.style.display = 'none';
        reactionsDetailMenu.classList.remove('active', 'closing');
        messageOverlay.style.display = 'none';
        messageOverlay.classList.remove('closing');
        highlightedMessage = null;
        selectedMessageId = null;
    }, 300);
}

messageOverlay.addEventListener('click', hideContextMenu);
document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target) && !e.target.closest('.message-main')) hideContextMenu();
});

document.addEventListener('touchstart', (e) => {
    if (!contextMenu.contains(e.target) && !e.target.closest('.message-main')) hideContextMenu();
}, { passive: true });

// Reactions click/touch
contextMenu.querySelector('.reaction-bar').addEventListener('click', (e) => {
    if (e.target.tagName === 'SPAN') {
        const emoji = e.target.textContent;
        socket.emit('message reaction', { timestamp: selectedMessageId, emoji: emoji, userId: userId });
        hideContextMenu();
    }
});

socket.on('message reaction updated', (data) => {
    const { timestamp, reactions } = data;
    
    // Update LocalStorage
    let msgs = getLocalMessages();
    const msgIndex = msgs.findIndex(m => m.timestamp == timestamp);
    if (msgIndex !== -1) {
        msgs[msgIndex].reactions = JSON.stringify(reactions);
        saveLocalMessages(msgs);
    }

    const messageLi = Array.from(messages.querySelectorAll('li')).find(li => {
        return li.dataset.timestamp == timestamp;
    });
    
    if (messageLi) {
        updateReactionsUI(messageLi, reactions);
    }
});

function updateReactionsUI(li, reactions) {
    const main = li.querySelector('.message-main');
    let reactionsDiv = main.querySelector('.message-reactions');
    
    if (reactions && reactions.length > 0) {
        if (!reactionsDiv) {
            reactionsDiv = document.createElement('div');
            reactionsDiv.className = 'message-reactions';
            main.appendChild(reactionsDiv);
            
            reactionsDiv.onclick = (e) => {
                e.stopPropagation();
                showAllReactions(li.dataset.timestamp, main);
            };
        }
        
        // Gérer le cas où reactions est un tableau d'objets ou de strings
        const normalizedReactions = reactions.map(r => typeof r === 'string' ? {emoji: r} : r);
        
        // Compter les occurrences
        const counts = {};
        normalizedReactions.forEach(r => {
            counts[r.emoji] = (counts[r.emoji] || 0) + 1;
        });
        
        // Trier par fréquence
        const sortedEmojis = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
        
        // Top 3
        const top3 = sortedEmojis.slice(0, 3);
        reactionsDiv.innerHTML = top3.map(e => `<span>${e}</span>`).join('');
    } else if (reactionsDiv) {
        reactionsDiv.remove();
    }
}

function openReplyPreview(username, text, timestamp) {
    replyingTo = { username, text, timestamp };
    replyPreviewUser.textContent = username;
    replyPreviewUser.style.color = getColorForUser(username);
    replyPreviewText.textContent = text;
    replyPreviewBar.style.backgroundColor = getColorForUser(username);
    replyPreview.style.display = 'flex';
    replyPreview.classList.add('active');
    input.focus();
}

function closeReplyPreview() {
    replyingTo = null;
    replyPreview.style.display = 'none';
    replyPreview.classList.remove('active');
}

closeReplyBtn.addEventListener('click', closeReplyPreview);

document.getElementById('menu-reply')?.addEventListener('click', () => {
    const messageLi = Array.from(messages.querySelectorAll('li')).find(li => li.dataset.timestamp == selectedMessageId);
    if (messageLi) {
        const username = messageLi.querySelector('.username')?.textContent || (messageLi.className === 'sent' ? currentUsername : "Utilisateur");
        const textElem = messageLi.querySelector('.text');
        const text = textElem ? textElem.textContent : (messageLi.querySelector('.audio-message') ? "Message vocal" : "Image");
        openReplyPreview(username, text, selectedMessageId);
    }
    hideContextMenu();
});

document.getElementById('menu-copy')?.addEventListener('click', () => {
    const messageLi = Array.from(messages.querySelectorAll('li')).find(li => li.dataset.timestamp == selectedMessageId);
    if (messageLi) {
        const textElem = messageLi.querySelector('.text');
        if (textElem) {
            navigator.clipboard.writeText(textElem.textContent).then(() => {
                showToast("Copié dans le presse-papier");
            });
        }
    }
    hideContextMenu();
});

document.getElementById('menu-delete')?.addEventListener('click', () => {
    if (confirm("Supprimer ce message ?")) {
        hideContextMenu();
    }
});

// Message Rendering
let lastSenderId = null;

function createMessageElement(msg) {
    const lastClear = parseInt(localStorage.getItem('chat-last-clear') || "0");
    if (msg.timestamp && msg.timestamp < lastClear) return null;

    const isMe = msg.userId === userId;
    const isConsecutive = lastSenderId === msg.userId;
    lastSenderId = msg.userId;

    const li = document.createElement('li');
    li.className = isMe ? 'sent' : 'received';
    if (isConsecutive) li.classList.add('consecutive');
    li.dataset.timestamp = msg.timestamp;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    
    if (isConsecutive) {
        avatar.style.visibility = 'hidden';
        if (isMe) avatar.style.width = '0';
    } else {
        if (msg.image) {
            avatar.innerHTML = `<img src="${msg.image}" loading="lazy">`;
        } else {
            avatar.textContent = msg.username.charAt(0).toUpperCase();
            avatar.style.backgroundColor = getColorForUser(msg.username);
            avatar.style.color = 'white';
        }
        avatar.onclick = () => window.location.href = `/profil.html?userId=${msg.userId}&from=group`;
    }

    const main = document.createElement('div');
    main.className = 'message-main';

    let pressTimer;
    const startPress = (e) => {
        pressTimer = setTimeout(() => showContextMenu(e, msg.timestamp || Date.now(), isMe, main), 500);
    };
    const cancelPress = () => clearTimeout(pressTimer);

    main.addEventListener('mousedown', startPress);
    main.addEventListener('touchstart', startPress, { passive: true });
    main.addEventListener('mouseup', cancelPress);
    main.addEventListener('mouseleave', cancelPress);
    main.addEventListener('touchend', cancelPress);
    main.addEventListener('touchmove', cancelPress);

    main.addEventListener('click', (e) => {
        if (e.target.closest('.message-reactions')) {
            e.stopPropagation();
            return;
        }
        showContextMenu(e, msg.timestamp || Date.now(), isMe, main);
    });

    const content = document.createElement('div');
    content.className = 'message-content';

    if (msg.replyTo) {
        let replyData = msg.replyTo;
        if (typeof replyData === 'string') {
            try { replyData = JSON.parse(replyData); } catch (e) { replyData = null; }
        }

        if (replyData) {
            const replyWrapper = document.createElement('div');
            replyWrapper.className = 'message-reply-wrapper';
            replyWrapper.style.borderLeftColor = getColorForUser(replyData.username);
            
            const rName = document.createElement('span');
            rName.className = 'reply-username';
            rName.textContent = replyData.username;
            rName.style.color = getColorForUser(replyData.username);
            
            const rText = document.createElement('span');
            rText.className = 'reply-text';
            rText.textContent = replyData.text;
            
            replyWrapper.appendChild(rName);
            replyWrapper.appendChild(rText);
            
            replyWrapper.onclick = (e) => {
                e.stopPropagation();
                const target = messages.querySelector(`li[data-timestamp="${replyData.timestamp}"]`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('highlight-animation');
                    setTimeout(() => target.classList.remove('highlight-animation'), 2000);
                }
            };
            content.appendChild(replyWrapper);
        }
    }

    if (!isMe && !isConsecutive) {
        const name = document.createElement('span');
        name.className = 'username';
        name.textContent = msg.username;
        name.style.color = getColorForUser(msg.username);
        name.onclick = (e) => {
            e.stopPropagation();
            window.location.href = `/profil.html?userId=${msg.userId}&from=group`;
        };
        content.appendChild(name);
    }

    if (msg.messageImage) {
        const img = document.createElement('img');
        img.src = msg.messageImage;
        img.className = 'message-img';
        img.loading = 'lazy';
        img.onclick = (e) => {
            e.stopPropagation();
            openLightbox(msg.messageImage);
        };
        content.appendChild(img);
    }

    if (msg.text || msg.isVisio || msg.audio) {
        const txtWrapper = document.createElement('div');
        txtWrapper.className = 'message-text-inner';
        
        if (msg.audio) {
            const audioWrapper = document.createElement('div');
            audioWrapper.className = 'audio-message';
            const playBtn = document.createElement('button');
            playBtn.className = 'audio-play-btn';
            playBtn.innerHTML = '<i data-lucide="play"></i>';
            const audioElem = new Audio(msg.audio);
            
            playBtn.onclick = () => {
                if (audioElem.paused) {
                    audioElem.currentTime = 0;
                    audioElem.play();
                } else {
                    audioElem.pause();
                    audioElem.currentTime = 0;
                }
            };
            
            audioElem.onplay = () => {
                playBtn.innerHTML = '<i data-lucide="pause"></i>';
                waveContainer.classList.add('playing');
                lucide.createIcons();
            };
            audioElem.onpause = () => {
                playBtn.innerHTML = '<i data-lucide="play"></i>';
                waveContainer.classList.remove('playing');
                waveContainer.querySelectorAll('.static-wave-bar').forEach(b => b.style.background = '#90a4ae');
                lucide.createIcons();
            };
            audioElem.onended = audioElem.onpause;

            const waveContainer = document.createElement('div');
            waveContainer.className = 'audio-waveform-static';
            audioElem.ontimeupdate = () => {
                const progress = audioElem.currentTime / audioElem.duration;
                if (isNaN(progress)) return;
                const bars = waveContainer.querySelectorAll('.static-wave-bar');
                const count = Math.floor(progress * bars.length);
                bars.forEach((bar, i) => bar.style.background = i <= count ? '#075e54' : '#90a4ae');
            };
            
            try {
                const heights = JSON.parse(msg.audioWaveform || '[]');
                heights.forEach(h => {
                    const b = document.createElement('div');
                    b.className = 'static-wave-bar';
                    b.style.height = `${Math.max(3, h)}px`;
                    waveContainer.appendChild(b);
                });
            } catch(e) {}

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
        } else if (msg.isVisio) {
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

    if (msg.reactions) {
        try { updateReactionsUI(li, JSON.parse(msg.reactions), main); } catch(e) {}
    }

    if (!isMe) li.appendChild(avatar);
    li.appendChild(main);
    return li;
}

function renderMessage(msg, shouldScroll = true) {
    const li = createMessageElement(msg);
    if (!li) return;
    messages.appendChild(li);
    if (shouldScroll) {
        setTimeout(() => li.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
    }
}

// Message Persistence & Expiration Logic
const MSG_EXPIRATION = 24 * 60 * 60 * 1000; // 24h

socket.on('chat message', async (msg) => {
    renderMessage(msg);
    await saveMessageToDB(msg);
    
    // Notification logic
    if (msg.userId !== userId && document.hidden) {
        if ("Notification" in window && Notification.permission === "granted") {
            const options = {
                body: msg.audio ? "🎤 Message vocal" : (msg.text || "📷 Image"),
                icon: msg.image || '/favicon.png',
                badge: '/favicon.png',
                vibrate: [100, 50, 100],
                data: { timestamp: msg.timestamp },
                actions: [
                    { action: 'reply', title: 'Répondre', type: 'text', placeholder: 'Écrire une réponse...' }
                ]
            };
            
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(msg.username, options);
            });
        }
    }
});

socket.on('load history', async (history) => {
    messages.innerHTML = '';
    lastSenderId = null;
    
    const localMsgs = await getAllMessagesFromDB();
    
    const mergedMap = new Map();
    localMsgs.forEach(m => mergedMap.set(m.timestamp, m));
    history.forEach(m => mergedMap.set(m.timestamp, m));
    
    const finalHistory = Array.from(mergedMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    
    // Update DB with history (batch)
    for (const msg of history) {
        await saveMessageToDB(msg);
    }
    
    // Optimisation : Utiliser un fragment pour un seul rendu au lieu de multiples manipulations du DOM
    const fragment = document.createDocumentFragment();
    finalHistory.forEach(msg => {
        const li = createMessageElement(msg);
        if (li) fragment.appendChild(li);
    });
    messages.appendChild(fragment);
    
    setTimeout(() => {
        window.scrollTo(0, document.body.scrollHeight);
    }, 50);
});

// Initial loading
(async () => {
    await initDB();
    await clearOldMessages(24 * 60 * 60 * 1000); // 24h
    
    const initialMsgs = await getAllMessagesFromDB();
    if (initialMsgs.length > 0) {
        const fragment = document.createDocumentFragment();
        initialMsgs.forEach(msg => {
            const li = createMessageElement(msg);
            if (li) fragment.appendChild(li);
        });
        messages.appendChild(fragment);
        setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 100);
    }
})();

socket.on('messages cleared', () => {
    messages.innerHTML = '';
    const transaction = db.transaction([storeName], "readwrite");
    transaction.objectStore(storeName).clear();
});
