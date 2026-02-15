const socket = io({
    transports: ['websocket'],
    upgrade: false
});
lucide.createIcons();

const urlParams = new URLSearchParams(window.location.search);
const roomID = urlParams.get('room') || 'default-room';
const username = localStorage.getItem('chat-username') || 'Anonyme';

const localVideo = document.getElementById('local-video');
const videoGrid = document.getElementById('video-grid');
const quitBtn = document.getElementById('quit-visio');
const toggleMicBtn = document.getElementById('toggle-mic');
const toggleVideoBtn = document.getElementById('toggle-video');

const localAvatar = document.getElementById('local-avatar');
const userImage = localStorage.getItem('chat-user-image');

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

function updateAvatar(element, name, image) {
    if (image) {
        element.innerHTML = `<img src="${image}">`;
        element.style.backgroundColor = 'transparent';
    } else {
        element.textContent = name ? name.charAt(0).toUpperCase() : '?';
        element.style.backgroundColor = getColorForUser(name);
    }
}

updateAvatar(localAvatar, username, userImage);

let localStream;
const peerConnections = {};
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
};

async function start() {
    try {
        console.log("Démarrage de la visio dans la room:", roomID);
        const constraints = {
            video: {
                width: { min: 640, ideal: 1280, max: 1920 },
                height: { min: 480, ideal: 720, max: 1080 },
                frameRate: { ideal: 30, max: 60 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        
        socket.emit('join-room', { roomID, username, image: userImage });
        
        socket.on('user-joined', async (data) => {
            console.log("Utilisateur rejoint:", data.username);
            if (peerConnections[data.userId]) return;
            const pc = createPeerConnection(data.userId, data.username, data.image);
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('offer', { target: data.userId, sdp: pc.localDescription, username, image: userImage });
            } catch (e) { console.error("Error creating offer", e); }
        });

        socket.on('offer', async (data) => {
            console.log("Offre reçue de:", data.username);
            const pc = createPeerConnection(data.from, data.username, data.image);
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('answer', { target: data.from, sdp: pc.localDescription });
                
                if (pc.iceQueue) {
                    pc.iceQueue.forEach(cand => pc.addIceCandidate(new RTCIceCandidate(cand)));
                    pc.iceQueue = [];
                }
            } catch (e) { console.error("Error handling offer", e); }
        });

        socket.on('answer', async (data) => {
            console.log("Réponse reçue");
            const pc = peerConnections[data.from];
            if (pc) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    if (pc.iceQueue) {
                        pc.iceQueue.forEach(cand => pc.addIceCandidate(new RTCIceCandidate(cand)));
                        pc.iceQueue = [];
                    }
                } catch (e) { console.error("Error handling answer", e); }
            }
        });

        socket.on('ice-candidate', async (data) => {
            const pc = peerConnections[data.from];
            if (pc) {
                try {
                    if (pc.remoteDescription) {
                        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                    } else {
                        if (!pc.iceQueue) pc.iceQueue = [];
                        pc.iceQueue.push(data.candidate);
                    }
                } catch (e) { console.error("Error adding ice candidate", e); }
            }
        });

        socket.on('user-left', (userId) => {
            removeUserVideo(userId);
        });

    } catch (err) {
        console.error('Erreur accès média:', err);
        alert('Impossible d\'accéder à la caméra ou au micro.');
    }
}

function createPeerConnection(userId, remoteUsername, remoteImage) {
    const pc = new RTCPeerConnection(config);
    peerConnections[userId] = pc;

    localStream.getTracks().forEach(track => {
        const sender = pc.addTrack(track, localStream);
        
        // Augmenter le bitrate pour une meilleure qualité si c'est de la vidéo
        if (track.kind === 'video') {
            const parameters = sender.getParameters();
            if (!parameters.encodings) parameters.encodings = [{}];
            parameters.encodings[0].maxBitrate = 5000000; // 5 Mbps pour du 1080p net
            sender.setParameters(parameters).catch(e => console.error("Bitrate error:", e));
        }
    });

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { target: userId, candidate: event.candidate });
        }
    };

    pc.ontrack = (event) => {
        if (!document.getElementById(`wrapper-${userId}`)) {
            const wrapper = document.createElement('div');
            wrapper.className = 'video-wrapper';
            wrapper.id = `wrapper-${userId}`;
            
            const video = document.createElement('video');
            video.autoplay = true;
            video.playsinline = true;
            video.srcObject = event.streams[0];

            const placeholder = document.createElement('div');
            placeholder.className = 'avatar-placeholder';
            updateAvatar(placeholder, remoteUsername, remoteImage);

            const icons = document.createElement('div');
            icons.className = 'status-icons';
            icons.innerHTML = `
                <div id="wrapper-${userId}-mic-status" class="status-icon active"><i data-lucide="mic"></i></div>
                <div id="wrapper-${userId}-video-status" class="status-icon active"><i data-lucide="video"></i></div>
            `;
            
            const label = document.createElement('div');
            label.className = 'video-label';
            label.textContent = remoteUsername || 'Utilisateur';
            
            wrapper.appendChild(video);
            wrapper.appendChild(placeholder);
            wrapper.appendChild(icons);
            wrapper.appendChild(label);
            videoGrid.appendChild(wrapper);

            // Gérer le cas où l'utilisateur arrive avec la caméra déjà coupée
            const vTrack = event.streams[0].getVideoTracks()[0];
            if (vTrack) {
                wrapper.classList.toggle('video-off', !vTrack.enabled);
                vTrack.onmute = () => wrapper.classList.add('video-off');
                vTrack.onunmute = () => wrapper.classList.remove('video-off');
            }
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            removeUserVideo(userId);
        }
    };

    return pc;
}

function removeUserVideo(userId) {
    const wrapper = document.getElementById(`wrapper-${userId}`);
    if (wrapper) wrapper.remove();
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }
}

quitBtn.onclick = () => {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    window.location.href = '/';
};

function updateStatusIcon(wrapperId, type, enabled) {
    const iconDiv = document.getElementById(`${wrapperId}-${type}-status`);
    if (iconDiv) {
        iconDiv.className = `status-icon ${enabled ? 'active' : 'inactive'}`;
        iconDiv.innerHTML = enabled ? `<i data-lucide="${type}"></i>` : `<i data-lucide="${type}-off"></i>`;
        lucide.createIcons();
    }
}

toggleMicBtn.onclick = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        // Coupure réelle : on pourrait aussi utiliser track.stop() mais enabled=false suffit pour WebRTC
        updateStatusIcon('local', 'mic', audioTrack.enabled);
        toggleMicBtn.classList.toggle('off', !audioTrack.enabled);
        toggleMicBtn.innerHTML = audioTrack.enabled ? '<i data-lucide="mic"></i>' : '<i data-lucide="mic-off"></i>';
        lucide.createIcons();
        socket.emit('mic-state-change', { enabled: audioTrack.enabled });
    }
};

toggleVideoBtn.onclick = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const wrapper = document.getElementById('local-video-wrapper');
        wrapper.classList.toggle('video-off', !videoTrack.enabled);
        updateStatusIcon('local', 'video', videoTrack.enabled);
        toggleVideoBtn.classList.toggle('off', !videoTrack.enabled);
        toggleVideoBtn.innerHTML = videoTrack.enabled ? '<i data-lucide="video"></i>' : '<i data-lucide="video-off"></i>';
        lucide.createIcons();
        socket.emit('video-state-change', { enabled: videoTrack.enabled });
    }
};

socket.on('mic-state-change', (data) => {
    updateStatusIcon(`wrapper-${data.userId}`, 'mic', data.enabled);
});

socket.on('video-state-change', (data) => {
    const wrapper = document.getElementById(`wrapper-${data.userId}`);
    if (wrapper) {
        wrapper.classList.toggle('video-off', !data.enabled);
        updateStatusIcon(`wrapper-${data.userId}`, 'video', data.enabled);
    }
});

start();
