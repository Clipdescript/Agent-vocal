const socket = io();
lucide.createIcons();

const backBtn = document.getElementById('back-btn');
const profileBtn = document.getElementById('profile-btn');
const profileAvatar = document.getElementById('profile-avatar');
const nameInput = document.getElementById('group-name-input');

let currentUsername = localStorage.getItem('chat-username');
let userImage = localStorage.getItem('chat-user-image');

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

if (profileBtn) {
    profileBtn.addEventListener('click', () => {
        window.location.href = '/profil.html?from=group';
    });
}

const descInput = document.getElementById('group-desc-input');
const imageInput = document.getElementById('image-input');
const deleteChatBtn = document.getElementById('delete-chat-btn');
const confirmModal = document.getElementById('confirm-modal');
const modalYes = document.getElementById('modal-yes');
const modalNo = document.getElementById('modal-no');

// Fonction pour vérifier l'existence des messages
function checkMessages() {
    const lastClear = localStorage.getItem('chat-last-clear') || "0";
    socket.emit('check messages exist', { lastClear: parseInt(lastClear) });
}

// Vérifier au chargement et lors de la connexion
socket.on('connect', checkMessages);
checkMessages();

// Mettre à jour en temps réel si un message est reçu (pour réactiver le bouton)
socket.on('chat message', checkMessages);

// Mettre à jour si la discussion est vidée globalement
socket.on('messages cleared', checkMessages);

socket.on('messages existence', (data) => {
    if (data.exists) {
        deleteChatBtn.disabled = false;
        deleteChatBtn.classList.remove('disabled');
    } else {
        deleteChatBtn.disabled = true;
        deleteChatBtn.classList.add('disabled');
    }
});

deleteChatBtn.addEventListener('click', () => {
    confirmModal.style.display = 'flex';
});

modalNo.addEventListener('click', () => {
    confirmModal.style.display = 'none';
});

modalYes.addEventListener('click', () => {
    localStorage.setItem('chat-last-clear', Date.now().toString());
    confirmModal.style.display = 'none';
    deleteChatBtn.disabled = true;
    deleteChatBtn.classList.add('disabled');
    alert("La discussion a été effacée pour vous.");
});

const avatarBig = document.getElementById('group-avatar-big');
const avatarContent = document.getElementById('avatar-content');
const bottomSheet = document.getElementById('bottom-sheet');
const cameraInput = document.getElementById('camera-input');
const btnTakePhoto = document.getElementById('btn-take-photo');
const btnChoosePhoto = document.getElementById('btn-choose-photo');
const btnDeletePhoto = document.getElementById('btn-delete-photo');
const closeSheet = document.getElementById('close-sheet');
const sheetOverlay = document.getElementById('sheet-overlay');

let currentGroupData = {
    name: "Général",
    image: null,
    description: "Bienvenue dans le groupe général !"
};

// Charger les données actuelles du groupe
socket.emit('get group info');

socket.on('group info', (data) => {
    if (data) {
        currentGroupData = data;
        // Remplissage forcé des valeurs des inputs
        nameInput.value = data.name || "Général";
        descInput.value = data.description || "";
        
        // Mise à jour visuelle
        updatePreview();
    }
});

function updatePreview() {
    if (currentGroupData.image) {
        avatarContent.innerHTML = `<img src="${currentGroupData.image}">`;
    } else {
        avatarContent.innerHTML = "💬";
    }
    checkChanges();
}

function checkChanges() {
    const newData = {
        name: nameInput.value.trim(),
        description: descInput.value.trim()
    };
    
    // On n'enregistre que si le nom n'est pas vide
    if (newData.name && (newData.name !== currentGroupData.name || newData.description !== currentGroupData.description)) {
        socket.emit('update group info', newData);
        // On met à jour localement pour éviter les boucles d'envoi si le serveur renvoie l'info
        currentGroupData.name = newData.name;
        currentGroupData.description = newData.description;
    }
}

nameInput.addEventListener('input', checkChanges);
descInput.addEventListener('input', checkChanges);

function openBottomSheet() {
    bottomSheet.classList.add('active');
    // Afficher le bouton supprimer si une image existe
    btnDeletePhoto.style.display = currentGroupData.image ? 'flex' : 'none';
}

function closeBottomSheet() {
    bottomSheet.classList.remove('active');
}

avatarBig.addEventListener('click', openBottomSheet);
document.getElementById('camera-badge').addEventListener('click', openBottomSheet);
closeSheet.addEventListener('click', closeBottomSheet);
sheetOverlay.addEventListener('click', closeBottomSheet);

btnTakePhoto.addEventListener('click', () => {
    cameraInput.click();
});

btnChoosePhoto.addEventListener('click', () => {
    imageInput.click();
});

btnDeletePhoto.addEventListener('click', () => {
    if (confirm("Supprimer l'image du groupe ?")) {
        currentGroupData.image = null;
        updatePreview();
        socket.emit('update group info', { image: null });
    }
});

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            currentGroupData.image = ev.target.result;
            updatePreview();
            socket.emit('update group info', { image: currentGroupData.image });
        };
        reader.readAsDataURL(file);
    }
}

imageInput.addEventListener('change', handleFileSelect);
cameraInput.addEventListener('change', handleFileSelect);

backBtn.addEventListener('click', () => {
    window.location.href = '/Groupe.html';
});
