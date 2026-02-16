const socket = io();
lucide.createIcons();

const overlay = document.getElementById('username-overlay');
const usernameInput = document.getElementById('username-input');
const usernameSubmit = document.getElementById('username-submit');
const profileAvatar = document.getElementById('profile-avatar');

let currentUsername = localStorage.getItem('chat-username');
let userImage = localStorage.getItem('chat-user-image');
let userId = getUserId();

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

function submitUsername() {
    const name = usernameInput.value.trim();
    if (name) {
        currentUsername = name;
        localStorage.setItem('chat-username', name);
        overlay.style.display = 'none';
        updateHeaderAvatar();
        socket.emit('update profile', { username: currentUsername, userId: userId });
    }
}

usernameSubmit.addEventListener('click', submitUsername);

// Support touche Entrée
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        submitUsername();
    }
});

// Group Info logic
const groupNameElem = document.getElementById('group-name');
const groupDescElem = document.getElementById('group-desc');
const groupAvatarElem = document.getElementById('group-avatar');

function updateGroupUI(data) {
    if (data) {
        localStorage.setItem('chat-group-info', JSON.stringify(data));
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

// Load from LocalStorage immediately
const savedGroupInfo = localStorage.getItem('chat-group-info');
if (savedGroupInfo) {
    updateGroupUI(JSON.parse(savedGroupInfo));
}

socket.emit('get group info');
socket.on('group info', updateGroupUI);
socket.on('group info updated', updateGroupUI);

document.getElementById('profile-btn').addEventListener('click', () => {
    window.location.href = '/profil.html';
});
