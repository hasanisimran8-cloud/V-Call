// Initialize Socket.IO connection to the Python backend
const socket = io('/');

// State variables
let localStream;
let peer;
const peers = {}; // Store all active connections

// DOM Elements
const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('local-video');
const muteBtn = document.getElementById('mute-btn');
const cameraBtn = document.getElementById('camera-btn');
const toggleBlogBtn = document.getElementById('toggle-blog');
const copyLinkBtn = document.getElementById('copy-link');
const blogSidebar = document.getElementById('blog-sidebar');
const meetingIdDisplay = document.querySelector('.meeting-id');

// 1. Get or create Room ID from URL query parameters
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');

if (!roomId) {
    // Generate a random ID if not present
    roomId = Math.random().toString(36).substring(2, 11);
    // Update the URL without reloading the page
    urlParams.set('room', roomId);
    const newRelativePathQuery = window.location.pathname + '?' + urlParams.toString();
    history.replaceState(null, '', newRelativePathQuery);
}

meetingIdDisplay.textContent = `Meeting ID: ${roomId}`;
console.log('Final Room ID:', roomId);

// 2. Initialize Media and Peer Connections
async function startApp() {
    try {
        console.log('Step 1: Requesting camera/mic...');
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;
        console.log('Step 2: Local stream active.');

        // Initialize PeerJS with explicit configuration to help with connectivity
        // Using default PeerJS cloud server
        peer = new Peer(undefined, {
            debug: 2
        }); 

        peer.on('open', id => {
            console.log('Step 3: PeerJS ID is: ' + id);
            console.log(`Step 4: Joining room signaling: ${roomId}`);
            socket.emit('join-room', { roomId: roomId, peerId: id });
        });

        peer.on('error', err => {
            console.error('PeerJS Error:', err);
            if(err.type === 'peer-unavailable') {
                console.warn('Peer was unavailable, they might have disconnected.');
            }
        });

        // Answer incoming calls
        peer.on('call', call => {
            console.log('Inbound call from peer:', call.peer);
            call.answer(localStream); 
            
            const video = document.createElement('video');
            call.on('stream', userVideoStream => {
                console.log('Receiving remote stream from caller:', call.peer);
                addVideoStream(video, userVideoStream, call.peer);
            });
            
            call.on('close', () => {
                console.log('Remote user closed call:', call.peer);
                if (video.parentElement) video.parentElement.remove();
            });
            
            peers[call.peer] = call;
        });

        // Listen for new users from the Python backend
        socket.on('user-connected', peerId => {
            console.log('Socket signaled new user joined room:', peerId);
            // Wait slightly to ensure the other peer is fully ready
            setTimeout(() => {
                console.log('Attempting to call new user:', peerId);
                connectToNewUser(peerId, localStream);
            }, 1500);
        });

    } catch (err) {
        console.error('Failed to start app:', err);
        if (err.name === 'NotAllowedError') {
            alert('Camera/Mic access denied. Please allow permissions in your browser settings.');
        } else {
            alert('Could not start video chat. Ensure you are on HTTPS or localhost.');
        }
    }
}

// 3. Connect to a new user when backend signals they joined
function connectToNewUser(peerId, stream) {
    console.log('Initializing WebRTC call to:', peerId);
    const call = peer.call(peerId, stream);
    const video = document.createElement('video');
    
    call.on('stream', userVideoStream => {
        console.log('Connected! Receiving remote stream from:', peerId);
        addVideoStream(video, userVideoStream, peerId);
    });
    
    call.on('close', () => {
        console.log('Call ended with:', peerId);
        if (video.parentElement) video.parentElement.remove();
    });

    peers[peerId] = call;
}

// 4. Helper to add video elements to the DOM
function addVideoStream(video, stream, peerId) {
    // Prevent duplicate videos for the same peer
    if (document.getElementById(`peer-${peerId}`)) return;

    const container = document.createElement('div');
    container.className = 'video-box remote-video';
    container.id = `peer-${peerId}`;
    
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => {
        video.play();
    });

    const label = document.createElement('div');
    label.className = 'video-label';
    label.innerText = 'Guest';

    container.append(video);
    container.append(label);
    videoGrid.append(container);
}

// 5. Control Handlers
muteBtn.addEventListener('click', () => {
    if(!localStream) return;
    const enabled = localStream.getAudioTracks()[0].enabled;
    localStream.getAudioTracks()[0].enabled = !enabled;
    muteBtn.classList.toggle('off', enabled);
    muteBtn.innerHTML = enabled ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
});

cameraBtn.addEventListener('click', () => {
    if(!localStream) return;
    const enabled = localStream.getVideoTracks()[0].enabled;
    localStream.getVideoTracks()[0].enabled = !enabled;
    cameraBtn.classList.toggle('off', enabled);
    cameraBtn.innerHTML = enabled ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
});

// 6. Link Sharing
copyLinkBtn.addEventListener('click', () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        const originalText = copyLinkBtn.innerHTML;
        copyLinkBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => { copyLinkBtn.innerHTML = originalText; }, 2000);
    });
});

// 7. UI Toggles
toggleBlogBtn.addEventListener('click', () => blogSidebar.classList.toggle('active'));
document.getElementById('close-blog').addEventListener('click', () => blogSidebar.classList.remove('active'));

// Clock
setInterval(() => {
    document.getElementById('current-time').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}, 1000);

startApp();
