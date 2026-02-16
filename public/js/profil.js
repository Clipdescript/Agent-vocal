const socket = io();
lucide.createIcons();

const backBtn = document.getElementById('back-btn');
const profileInfoInput = document.getElementById('profile-info-input');
const profileInput = document.getElementById('profile-input');
const profileStatusInput = document.getElementById('profile-status-input');
const imageInput = document.getElementById('image-input');
const profileSave = document.getElementById('profile-save');
const saveText = document.getElementById('save-text');
const saveLoader = document.getElementById('save-loader');
const profileQuit = document.getElementById('profile-quit');
const profileAvatarBig = document.getElementById('profil-avatar-big');
const avatarContent = document.getElementById('avatar-content');
const modifierText = document.getElementById('profile-modifier-text');

// Elements pour le menu du bas
const bottomSheet = document.getElementById('bottom-sheet');
const sheetOverlay = document.getElementById('sheet-overlay');
const btnTakePhoto = document.getElementById('btn-take-photo');
const btnChoosePhoto = document.getElementById('btn-choose-photo');
const btnDeletePhoto = document.getElementById('btn-delete-photo');
const cameraInput = document.getElementById('camera-input');
const closeSheetBtn = document.getElementById('close-sheet');

const userId = getUserId();
const urlParams = new URLSearchParams(window.location.search);
const viewUserId = urlParams.get('userId');
const isViewOnly = viewUserId && viewUserId !== userId;

let originalUsername = localStorage.getItem('chat-username') || "";
let originalBio = localStorage.getItem('chat-user-bio') || "Bonjour ! J'utilise Messagerie instantanée.";
let originalStatus = localStorage.getItem('chat-user-status') || "";
let currentUsername = originalUsername;
let userImage = localStorage.getItem('chat-user-image');

const headerTitle = document.getElementById('header-title');
const cameraOverlay = document.getElementById('camera-overlay');
const cameraBadge = document.getElementById('camera-badge');
const groupInputPseudo = document.getElementById('group-input-pseudo');
const groupPseudo = document.getElementById('group-pseudo');
const displayUsername = document.getElementById('display-username');
const displayBio = document.getElementById('display-bio');
const displayStatus = document.getElementById('display-status');
const saveSection = document.querySelector('.save-section');

if (isViewOnly) {
    headerTitle.textContent = "Profil";
    modifierText.style.display = "none";
    cameraOverlay.style.display = "none";
    cameraBadge.style.display = "none";
    saveSection.style.display = "none";
    groupInputPseudo.style.display = "none";
    groupPseudo.style.display = "block";
    
    profileInfoInput.style.display = "none";
    profileStatusInput.style.display = "none";
    displayBio.style.display = "block";
    displayStatus.style.display = "block";
    
    profileAvatarBig.classList.remove('clickable-avatar');
    profileAvatarBig.style.cursor = "default";

    socket.emit('get user profile', viewUserId);
}

socket.on('user profile data', (data) => {
    if (data) {
        currentUsername = data.username;
        userImage = data.image;
        displayUsername.textContent = data.username;
        displayBio.textContent = data.bio || "Bonjour ! J'utilise Messagerie instantanée.";
        displayStatus.textContent = data.status || "Aucune actu";
        updatePreview();
    } else {
        alert("Utilisateur non trouvé");
        window.location.href = "/";
    }
});

function updatePreview() {
    const nameToUse = isViewOnly ? currentUsername : (profileInput.value.trim() || currentUsername);
    
    if (userImage) {
        avatarContent.innerHTML = `<img src="${userImage}" alt="Profil">`;
        profileAvatarBig.style.backgroundColor = 'transparent';
    } else {
        avatarContent.innerHTML = "";
        avatarContent.textContent = (nameToUse.charAt(0) || "?").toUpperCase();
        profileAvatarBig.style.backgroundColor = getColorForUser(nameToUse);
    }

    if (isViewOnly) return; // Pas besoin de gérer l'état du bouton si on ne peut pas éditer

    // Gestion de l'état du bouton enregistrer
    const newName = profileInput.value.trim();
    const newBio = profileInfoInput.value.trim();
    const newStatus = profileStatusInput.value.trim();
    
    if ((newName && newName !== originalUsername) || (newBio !== originalBio) || (newStatus !== originalStatus)) {
        profileSave.disabled = false;
        profileSave.classList.remove('disabled');
    } else {
        profileSave.disabled = true;
        profileSave.classList.add('disabled');
    }
}

function savePhotoAutomatically() {
    try {
        if (userImage) {
            localStorage.setItem('chat-user-image', userImage);
        } else {
            localStorage.removeItem('chat-user-image');
        }
        socket.emit('update profile', { username: currentUsername, image: userImage, userId: userId });
    } catch (e) {
        console.error("Erreur stockage image:", e);
        alert("L'image est trop lourde pour ce téléphone.");
    }
}

// Initialisation
profileInput.value = currentUsername;
profileInfoInput.value = originalBio;
profileStatusInput.value = originalStatus;
updatePreview();

// Fonctions pour le menu du bas
function showBottomSheet() {
    // Afficher/cacher le bouton supprimer selon si une image existe
    if (userImage) {
        btnDeletePhoto.style.display = 'flex';
    } else {
        btnDeletePhoto.style.display = 'none';
    }

    bottomSheet.classList.add('active');
    document.body.style.overflow = 'hidden'; // Empêche le défilement
}

function hideBottomSheet() {
    bottomSheet.classList.remove('active');
    document.body.style.overflow = '';
}

const fromParam = urlParams.get('from');

function goBack() {
    if (fromParam === 'group') {
        window.location.href = '/Groupe.html';
    } else {
        window.location.href = '/';
    }
}

backBtn.addEventListener('click', goBack);

// Cliquer sur l'avatar ouvre le menu du bas
profileAvatarBig.addEventListener('click', () => {
    if (!isViewOnly) showBottomSheet();
});
cameraBadge.addEventListener('click', () => {
    if (!isViewOnly) showBottomSheet();
});
modifierText.addEventListener('click', () => {
    if (!isViewOnly) showBottomSheet();
});

// Bouton fermer
closeSheetBtn.addEventListener('click', hideBottomSheet);

// Options du menu
btnTakePhoto.addEventListener('click', () => {
    cameraInput.click();
});

btnChoosePhoto.addEventListener('click', () => {
    imageInput.click();
});

btnDeletePhoto.addEventListener('click', () => {
    userImage = null;
    updatePreview();
    savePhotoAutomatically();
    hideBottomSheet(); // Fermer le menu après suppression
});

socket.on('profile updated', (data) => {
    if (data.userId === userId) {
        if (data.image !== undefined) {
            userImage = data.image;
            if (userImage) localStorage.setItem('chat-user-image', userImage);
            else localStorage.removeItem('chat-user-image');
        }
        if (data.username) {
            currentUsername = data.username;
            localStorage.setItem('chat-username', data.username);
        }
        if (data.bio) {
            originalBio = data.bio;
            localStorage.setItem('chat-user-bio', data.bio);
        }
        if (data.status) {
            originalStatus = data.status;
            localStorage.setItem('chat-user-status', data.status);
        }
        updatePreview();
    }
});

async function handleImageSelect(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 10 * 1024 * 1024) {
            alert('L\'image est trop grande (max 10Mo)');
            return;
        }
        hideBottomSheet(); // Fermer le menu après sélection
        const reader = new FileReader();
        reader.onload = async (event) => {
            userImage = await MediaOptimizer.optimizeMedia(event.target.result, 'image');
            updatePreview();
            savePhotoAutomatically();
        };
        reader.readAsDataURL(file);
    }
}

imageInput.addEventListener('change', handleImageSelect);
cameraInput.addEventListener('change', handleImageSelect);

profileInput.addEventListener('input', updatePreview);
profileInfoInput.addEventListener('input', updatePreview);
profileStatusInput.addEventListener('input', updatePreview);

profileSave.addEventListener('click', () => {
    const newName = profileInput.value.trim();
    const newBio = profileInfoInput.value.trim();
    const newStatus = profileStatusInput.value.trim();
    if (!newName) return;

    // Animation
    profileSave.disabled = true;
    profileSave.classList.add('disabled');
    saveText.textContent = "Enregistrement...";
    saveLoader.style.display = "inline-block";

    setTimeout(() => {
        originalUsername = newName;
        currentUsername = newName;
        originalBio = newBio;
        originalStatus = newStatus;
        
        localStorage.setItem('chat-username', newName);
        localStorage.setItem('chat-user-bio', newBio);
        localStorage.setItem('chat-user-status', newStatus);
        
        // Informer le serveur
        socket.emit('update profile', { 
            username: currentUsername, 
            image: userImage, 
            userId: userId,
            bio: originalBio,
            status: originalStatus
        });
        
        saveLoader.style.display = "none";
        saveText.textContent = "Enregistré";
        
        setTimeout(() => {
            saveText.textContent = "Enregistrer les modifications";
            updatePreview(); // Re-vérifie l'état (sera désactivé car name === original)
        }, 2000);
    }, 1500);
});

profileQuit.addEventListener('click', goBack);
