const socket = io();
lucide.createIcons();

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

// Dictation vocale
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

    recognition.onstart = () => {
        micBtn.classList.add('recording');
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        input.value += transcript;
    };

    recognition.onerror = (event) => {
        console.error('Erreur reconnaissance vocale:', event.error);
        micBtn.classList.remove('recording');
    };

    recognition.onend = () => {
        micBtn.classList.remove('recording');
    };
} else {
    micBtn.style.display = 'none'; // Cacher si pas supporté
}

// Gestion du Pseudo et de l'Avatar
const overlay = document.getElementById('username-overlay');
const usernameInput = document.getElementById('username-input');
const usernameSubmit = document.getElementById('username-submit');
const profileAvatar = document.getElementById('profile-avatar');

let currentUsername = localStorage.getItem('chat-username');
let userColor = localStorage.getItem('chat-user-color');
let userImage = localStorage.getItem('chat-user-image');
let userId = localStorage.getItem('chat-user-id');

if (!userId) {
    userId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('chat-user-id', userId);
}

const softColors = [
    '#3498db', '#2ecc71', '#e74c3c', '#9b59b6', '#1abc9c', 
    '#e67e22', '#3f51b5', '#e91e63', '#00bcd4', '#27ae60', 
    '#2980b9', '#8e44ad', '#d35400', '#c0392b', '#16a085'
];

// Fonction pour générer une couleur stable basée sur le pseudo
function getColorForUser(username) {
    if (!username) return softColors[0];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % softColors.length;
    return softColors[index];
}

function updateAvatar() {
    if (currentUsername) {
        userColor = getColorForUser(currentUsername);
        localStorage.setItem('chat-user-color', userColor);
        
        if (userImage) {
            profileAvatar.innerHTML = `<img src="${userImage}" alt="Profil">`;
            profileAvatar.style.backgroundColor = 'transparent';
        } else {
            profileAvatar.textContent = currentUsername.charAt(0).toUpperCase();
            profileAvatar.style.backgroundColor = userColor;
            profileAvatar.style.color = 'white';
        }
        // Informer le serveur du changement pour mettre à jour l'historique
        socket.emit('update profile', { 
            username: currentUsername, 
            image: userImage, 
            userId: userId,
            bio: localStorage.getItem('chat-user-bio') || "Bonjour ! J'utilise Messagerie instantanée.",
            status: localStorage.getItem('chat-user-status') || ""
        });
    }
}

if (currentUsername) {
    overlay.style.display = 'none';
    updateAvatar();
}

usernameSubmit.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (name) {
        currentUsername = name;
        localStorage.setItem('chat-username', name);
        overlay.style.display = 'none';
        updateAvatar();
    }
});

// Gestion de l'indicateur d'écriture
const typingIndicator = document.getElementById('typing-indicator');
let typingTimeout;

input.addEventListener('input', () => {
    if (currentUsername) {
        socket.emit('typing', currentUsername);
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('stop typing');
        }, 2000); // S'arrête après 2 secondes sans taper
    }
});

socket.on('user typing', (username) => {
    typingIndicator.innerHTML = `<span>${username} écrit</span><div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
});

socket.on('user stop typing', () => {
    typingIndicator.innerHTML = '';
});

form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (input.value.trim() && currentUsername) {
        socket.emit('stop typing'); // Force l'arrêt au moment de l'envoi
        const now = new Date();
        const time = now.getHours().toString().padStart(2, '0') + ':' + 
                     now.getMinutes().toString().padStart(2, '0');
        
        const msg = {
            username: currentUsername,
            text: input.value,
            time: time,
            timestamp: Date.now(),
            id: socket.id,
            userId: userId,
            color: userColor,
            image: userImage,
            bio: localStorage.getItem('chat-user-bio') || "Bonjour ! J'utilise Messagerie instantanée.",
            status: localStorage.getItem('chat-user-status') || ""
        };
        socket.emit('chat message', msg);
        input.value = '';
    }
});

// Gestion du bouton profil
const profileBtn = document.getElementById('profile-btn');
profileBtn.addEventListener('click', () => {
    window.location.href = '/profil.html';
});

// Gestion de la popup de suppression
const clearBtn = document.getElementById('clear-btn');
const confirmModal = document.getElementById('confirm-modal');
const modalClose = document.getElementById('modal-close');
const modalNo = document.getElementById('modal-no');
const modalYes = document.getElementById('modal-yes');

function showModal() {
    confirmModal.style.display = 'flex';
}

function hideModal() {
    confirmModal.style.display = 'none';
}

clearBtn.addEventListener('click', showModal);
modalClose.addEventListener('click', hideModal);

modalYes.addEventListener('click', () => {
    // On enregistre le moment de la suppression localement
    localStorage.setItem('chat-last-clear', Date.now());
    messages.innerHTML = '';
});

let lastSender = null;
let lastMessageElement = null;
let lastMessageImage = null;

function addMessage(msg, shouldVibrate = true) {
    // Si le message est plus vieux que notre dernière suppression locale, on l'ignore
    const lastClear = parseInt(localStorage.getItem('chat-last-clear') || "0");
    if (msg.timestamp && msg.timestamp < lastClear) return;

    const item = document.createElement('li');
    let showAvatar = true;
    
    // Si c'est le même utilisateur qui continue d'écrire
    if (lastSender === msg.username && lastMessageElement) {
        item.classList.add('consecutive');
        showAvatar = false; 
    }

    // On vérifie si c'est NOTRE message
    // Comparaison par userId (robuste), par socket.id (session actuelle), 
    // ou par username (pour l'historique et en cas de retour à l'ancien pseudo)
    const isMe = (msg.userId && msg.userId === userId) || 
                 (msg.id === socket.id) || 
                 (msg.username && currentUsername && msg.username.trim().toLowerCase() === currentUsername.trim().toLowerCase());

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar clickable';
    
    // Pour les autres, on masque si consécutif. Pour soi, on masque TOUJOURS.
    if (!showAvatar || isMe) {
        avatar.style.visibility = 'hidden'; 
    }
    
    if (msg.image) {
        avatar.innerHTML = `<img src="${msg.image}" alt="">`;
        avatar.style.backgroundColor = 'transparent';
    } else {
        avatar.textContent = msg.username.charAt(0).toUpperCase();
        avatar.style.backgroundColor = getColorForUser(msg.username);
        avatar.style.color = 'white';
    }

    // Clic sur l'avatar pour voir le profil
    avatar.addEventListener('click', () => {
        if (msg.userId) {
            window.location.href = `/profil.html?userId=${msg.userId}`;
        }
    });
    
    // Contenu du message
    const main = document.createElement('div');
    main.className = 'message-main';

    // Pseudo (uniquement si pas consécutif pour les autres)
    if (lastSender !== msg.username) {
        const userSpan = document.createElement('span');
        userSpan.textContent = msg.username;
        userSpan.className = 'username clickable';
        userSpan.style.color = getColorForUser(msg.username);
        
        userSpan.addEventListener('click', () => {
            if (msg.userId) {
                window.location.href = `/profil.html?userId=${msg.userId}`;
            }
        });

        main.appendChild(userSpan);
    }
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    const textSpan = document.createElement('span');
    textSpan.textContent = msg.text;
    textSpan.className = 'text';
    
    const timeSpan = document.createElement('span');
    timeSpan.textContent = msg.time;
    timeSpan.className = 'time';
    
    contentDiv.appendChild(textSpan);
    contentDiv.appendChild(timeSpan);
    main.appendChild(contentDiv);

    if (isMe) {
        item.classList.add('sent');
        item.appendChild(main);
        // Aucun avatar pour soi-même, le message sera collé à la bordure
    } else {
        item.classList.add('received');
        item.appendChild(avatar);
        item.appendChild(main);
    }
    
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;

    lastSender = msg.username;
    lastMessageElement = item;
    lastMessageImage = msg.image;
    
    if (shouldVibrate && msg.username !== currentUsername && window.navigator.vibrate) {
        try {
            window.navigator.vibrate(50);
        } catch (e) {
            // Silencieux si le navigateur bloque (ex: pas d'interaction utilisateur)
        }
    }
}

socket.on('load history', function(history) {
    console.log('Historique reçu:', history.length, 'messages');
    messages.innerHTML = '';
    // On ne fait pas vibrer pour l'historique
    history.forEach(msg => addMessage(msg, false));
});

socket.on('chat message', function(msg) {
    addMessage(msg, true);
});

socket.on('messages cleared', function() {
    messages.innerHTML = '';
});

socket.on('profile updated', function(data) {
    // Parcourir tous les messages pour mettre à jour l'avatar de l'utilisateur
    const allMessages = messages.querySelectorAll('li');
    allMessages.forEach(li => {
        const usernameSpan = li.querySelector('.username');
        if (usernameSpan && usernameSpan.textContent === data.username) {
            const avatar = li.querySelector('.message-avatar');
            if (avatar) {
                if (data.image) {
                    avatar.innerHTML = `<img src="${data.image}" alt="">`;
                    avatar.style.backgroundColor = 'transparent';
                } else {
                    avatar.textContent = data.username.charAt(0).toUpperCase();
                    avatar.style.backgroundColor = getColorForUser(data.username);
                    avatar.style.color = 'white';
                }
            }
        }
    });
});
