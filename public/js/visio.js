const urlParams = new URLSearchParams(window.location.search);
const roomName = urlParams.get('room') || 'General_Room_' + Math.floor(Math.random() * 10000);
const username = localStorage.getItem('chat-username') || 'Anonyme';

const domain = 'meet.jit.si';
const options = {
    roomName: roomName,
    width: '100%',
    height: '100%',
    parentNode: document.querySelector('#visio-container'),
    userInfo: {
        displayName: username
    },
    configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        prejoinPageEnabled: false
    },
    interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: [
            'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
            'fodeviceselection', 'hangup', 'profile', 'chat', 'recording',
            'livestreaming', 'etherpad', 'sharedvideo', 'settings', 'raisehand',
            'videoquality', 'filmstrip', 'invite', 'feedback', 'stats', 'shortcuts',
            'tileview', 'videobackgroundblur', 'download', 'help', 'mute-everyone',
            'security'
        ],
    }
};

const api = new JitsiMeetExternalAPI(domain, options);

document.getElementById('quit-visio').addEventListener('click', () => {
    api.executeCommand('hangup');
    window.location.href = '/';
});

api.addEventListener('videoConferenceLeft', () => {
    window.location.href = '/';
});
