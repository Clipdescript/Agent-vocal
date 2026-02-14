const socket = io();
lucide.createIcons();

const urlParams = new URLSearchParams(window.location.search);
const roomID = urlParams.get('room') || 'default-room';
const username = localStorage.getItem('chat-username') || 'Anonyme';

const localVideo = document.getElementById('local-video');
const videoGrid = document.getElementById('video-grid');
const quitBtn = document.getElementById('quit-visio');
const toggleMicBtn = document.getElementById('toggle-mic');
const toggleVideoBtn = document.getElementById('toggle-video');

const localLabel = document.querySelector('#local-video-wrapper .video-label');
localLabel.textContent = username + " (Moi)";

let localStream;
const peerConnections = {};
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

async function start() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        
        socket.emit('join-room', { roomID, username });
        
        socket.on('user-joined', async (data) => {
            if (peerConnections[data.userId]) return;
            const pc = createPeerConnection(data.userId, data.username);
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('offer', { target: data.userId, sdp: pc.localDescription, username });
            } catch (e) { console.error("Error creating offer", e); }
        });

        socket.on('offer', async (data) => {
            const pc = createPeerConnection(data.from, data.username);
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('answer', { target: data.from, sdp: pc.localDescription });
                
                // Process queued candidates
                if (pc.iceQueue) {
                    pc.iceQueue.forEach(cand => pc.addIceCandidate(new RTCIceCandidate(cand)));
                    pc.iceQueue = [];
                }
            } catch (e) { console.error("Error handling offer", e); }
        });

        socket.on('answer', async (data) => {
            const pc = peerConnections[data.from];
            if (pc) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    // Process queued candidates
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
                        // Queue candidate if remote description not yet set
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

function createPeerConnection(userId, remoteUsername) {
    const pc = new RTCPeerConnection(config);
    peerConnections[userId] = pc;

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

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
            
            const label = document.createElement('div');
            label.className = 'video-label';
            label.textContent = remoteUsername || 'Utilisateur';
            
            wrapper.appendChild(video);
            wrapper.appendChild(label);
            videoGrid.appendChild(wrapper);
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

toggleMicBtn.onclick = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    toggleMicBtn.classList.toggle('off', !audioTrack.enabled);
    toggleMicBtn.innerHTML = audioTrack.enabled ? '<i data-lucide="mic"></i>' : '<i data-lucide="mic-off"></i>';
    lucide.createIcons();
};

toggleVideoBtn.onclick = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    toggleVideoBtn.classList.toggle('off', !videoTrack.enabled);
    toggleVideoBtn.innerHTML = videoTrack.enabled ? '<i data-lucide="video"></i>' : '<i data-lucide="video-off"></i>';
    lucide.createIcons();
};

start();
