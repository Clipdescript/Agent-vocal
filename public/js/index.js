const socket = io();
lucide.createIcons();

const overlay = document.getElementById('username-overlay');
const usernameInput = document.getElementById('username-input');
const usernameSubmit = document.getElementById('username-submit');
const profileAvatar = document.getElementById('profile-avatar');

let currentUsername = localStorage.getItem('chat-username');
let userImage = localStorage.getItem('chat-user-image');
let userId = localStorage.getItem('chat-user-id') || 'user_' + Math.random().toString(36).substr(2, 9);
localStorage.setItem('chat-user-id', userId);

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

if (!currentUsername) {
    overlay.style.display = 'flex';
} else {
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

// Group Info logic
const groupNameElem = document.getElementById('group-name');
const groupDescElem = document.getElementById('group-desc');
const groupAvatarElem = document.getElementById('group-avatar');

function updateGroupUI(data) {
    if (data) {
        if (groupNameElem) groupNameElem.textContent = data.name;
        if (groupDescElem) groupDescElem.textContent = data.description;
        if (groupAvatarElem) {
            if (data.image) {
                groupAvatarElem.innerHTML = `<img src="${data.image}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                groupAvatarElem.style.backgroundColor = 'transparent';
            } else {
                groupAvatarElem.innerHTML = "💬";
                groupAvatarElem.style.backgroundColor = '';
            }
        }
    }
}

socket.emit('get group info');
socket.on('group info', updateGroupUI);
socket.on('group info updated', updateGroupUI);

document.getElementById('profile-btn').addEventListener('click', () => {
    window.location.href = '/profil.html';
});
