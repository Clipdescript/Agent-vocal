const socket = io();
lucide.createIcons();

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const typingIndicator = document.getElementById('typing-indicator');

// Logic for Speech Recognition
const micBtn = document.getElementById('mic-btn');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;

    micBtn.addEventListener('click', () => {
        if (micBtn.classList.contains('recording')) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });

    recognition.onstart = () => micBtn.classList.add('recording');
    recognition.onresult = (event) => { input.value += event.results[0][0].transcript; };
    recognition.onerror = () => micBtn.classList.remove('recording');
    recognition.onend = () => micBtn.classList.remove('recording');
} else {
    micBtn.style.display = 'none';
}

// User Profile & Storage
const overlay = document.getElementById('username-overlay');
const usernameInput = document.getElementById('username-input');
const usernameSubmit = document.getElementById('username-submit');
const profileAvatar = document.getElementById('profile-avatar');

let currentUsername = localStorage.getItem('chat-username');
let userImage = localStorage.getItem('chat-user-image');
let userId = localStorage.getItem('chat-user-id') || 'user_' + Math.random().toString(36).substr(2, 9);
localStorage.setItem('chat-user-id', userId);

const softColors = ['#3498db', '#2ecc71', '#e74c3c', '#9b59b6', '#1abc9c', '#e67e22', '#3f51b5', '#e91e63', '#00bcd4', '#27ae60'];
function getColorForUser(username) {
    let hash = 0;
    for (let i = 0; i < (username || "").length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
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

if (currentUsername) {
    overlay.style.display = 'none';
    updateHeaderAvatar();
}

usernameSubmit.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (name) {
        currentUsername = name;
        localStorage.setItem('chat-username', name);
        overlay.style.display = 'none';
        updateHeaderAvatar();
        socket.emit('update profile', { username: currentUsername, userId: userId });
    }
});

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

// Image Selection & Preview
const imgBtn = document.getElementById('img-btn');
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
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if ((text || selectedImage) && currentUsername) {
        const now = new Date();
        const msg = {
            username: currentUsername,
            userId: userId,
            text: text,
            messageImage: selectedImage,
            image: userImage,
            time: now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0'),
            timestamp: Date.now()
        };
        socket.emit('chat message', msg);
        input.value = '';
        selectedImage = null;
        previewContainer.style.display = 'none';
        messageImageInput.value = '';
        socket.emit('stop typing');
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

// Modals
const clearBtn = document.getElementById('clear-btn');
const modal = document.getElementById('confirm-modal');
clearBtn.addEventListener('click', () => modal.style.display = 'flex');
document.getElementById('modal-no').addEventListener('click', () => modal.style.display = 'none');
document.getElementById('modal-yes').addEventListener('click', () => {
    localStorage.setItem('chat-last-clear', Date.now());
    messages.innerHTML = '';
    modal.style.display = 'none';
});

document.getElementById('profile-btn').addEventListener('click', () => window.location.href = '/profil.html');

document.getElementById('visio-btn').addEventListener('click', () => {
    if (currentUsername) {
        socket.emit('chat message', {
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

function renderMessage(msg) {
    const lastClear = parseInt(localStorage.getItem('chat-last-clear') || "0");
    // If the lastClear is in the future (bad clock), reset it
    if (lastClear > Date.now()) localStorage.removeItem('chat-last-clear');
    
    if (msg.timestamp && msg.timestamp < lastClear) return;

    const isMe = msg.userId === userId;
    const isConsecutive = lastSenderId === msg.userId;
    lastSenderId = msg.userId;

    const li = document.createElement('li');
    li.className = isMe ? 'sent' : 'received';

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    if (isMe || isConsecutive) {
        avatar.style.visibility = 'hidden';
        avatar.style.width = isMe ? '0' : '32px'; // Preserve space for received
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

    if (msg.text) {
        const txtWrapper = document.createElement('div');
        txtWrapper.className = 'message-text-inner';
        const txt = document.createElement('span');
        txt.className = 'text';
        txt.textContent = msg.text;
        if (msg.isVisio) {
            content.classList.add('visio-message');
            txt.innerHTML = `<strong>${msg.text}</strong><br><a href="/visio.html?room=${msg.roomId}" class="visio-link" target="_blank">REJOINDRE</a>`;
        }
        txtWrapper.appendChild(txt);
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
    window.scrollTo(0, document.body.scrollHeight);
}

socket.on('chat message', renderMessage);
socket.on('load history', (history) => {
    messages.innerHTML = '';
    lastSenderId = null;
    history.forEach(renderMessage);
});
socket.on('messages cleared', () => {
    messages.innerHTML = '';
});
