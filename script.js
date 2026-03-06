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
    // Redirect to the URL with the room parameter to ensure it's in the browser history
    urlParams.set('room', roomId);
    window.location.search = urlParams.toString();
}

meetingIdDisplay.textContent = `Meeting ID: ${roomId}`;
console.log('Room ID initialized:', roomId);

// 2. Initialize Media and Peer Connections
async function startApp() {
    try {
        console.log('Requesting media devices...');
        // Get media stream (Camera & Mic)
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;
        console.log('Local stream obtained.');

        // Initialize PeerJS (Uses public cloud server for WebRTC handshakes)
        peer = new Peer(); 

        peer.on('open', id => {
            console.log('My PeerJS ID is: ' + id);
            // Tell the Python backend we joined this specific room
            console.log(`Joining room: ${roomId} with peer ID: ${id}`);
            socket.emit('join-room', { roomId: roomId, peerId: id });
        });

        // Answer incoming calls
        peer.on('call', call => {
            console.log('Receiving call from:', call.peer);
            call.answer(localStream); // Answer with our stream
            
            const video = document.createElement('video');
            call.on('stream', userVideoStream => {
                console.log('Receiving remote stream from call');
                addVideoStream(video, userVideoStream, call.peer);
            });
            
            call.on('close', () => {
                console.log('Call closed');
                if (video.parentElement) video.parentElement.remove();
            });
            
            peers[call.peer] = call;
        });

        // Listen for new users from the Python backend
        socket.on('user-connected', peerId => {
            console.log('New user detected in room:', peerId);
            // Wait slightly to ensure the other peer is fully ready to accept calls
            setTimeout(() => {
                console.log('Initiating call to:', peerId);
                connectToNewUser(peerId, localStream);
            }, 1000);
        });

    } catch (err) {
        console.error('Initialization error:', err);
        alert('Could not access camera or microphone. Please ensure you have granted permissions and are using HTTPS or localhost.');
    }
}

// 3. Connect to a new user when backend signals they joined
function connectToNewUser(peerId, stream) {
    const call = peer.call(peerId, stream);
    const video = document.createElement('video');
    
    call.on('stream', userVideoStream => {
        console.log('Connected to new user stream:', peerId);
        addVideoStream(video, userVideoStream, peerId);
    });
    
    call.on('close', () => {
        console.log('Connection to user closed:', peerId);
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
