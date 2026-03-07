// Initialize Socket.IO connection
// For Vercel/Production, we use auto-discovery
const socket = io({
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 15
});

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
const chatToggleBtn = document.getElementById('chat-toggle-btn');
const chatSidebar = document.getElementById('chat-sidebar');
const closeChatBtn = document.getElementById('close-chat');

// 1. Get or create Room ID from URL query parameters
function getRoomId() {
    const urlParams = new URLSearchParams(window.location.search);
    let id = urlParams.get('room');
    
    // Check if ID is present and not just empty/null string
    if (id && id !== 'null' && id !== 'undefined' && id.trim() !== '') {
        console.log('Detected room ID from URL:', id);
        return id.trim();
    }
    
    // Generate a new random ID if not present: format xxxx-xxxx-xxxx
    const part1 = Math.random().toString(36).substring(2, 6);
    const part2 = Math.random().toString(36).substring(2, 6);
    const part3 = Math.random().toString(36).substring(2, 6);
    const newId = `${part1}-${part2}-${part3}`;
    
    // Update the URL without reloading the page to include the room ID
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('room', newId);
    window.history.replaceState({ path: newUrl.href }, '', newUrl.toString());
    
    console.log('Generated new room ID:', newId);
    return newId;
}

const roomId = getRoomId();
meetingIdDisplay.textContent = `Meeting ID: ${roomId}`;

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

        // Initialize PeerJS
        peer = new Peer(undefined, {
            debug: 1,
            config: { 
                'iceServers': [
                    { 'urls': 'stun:stun.l.google.com:19302' },
                    { 'urls': 'stun:stun1.l.google.com:19302' },
                    { 'urls': 'stun:stun2.l.google.com:19302' }
                ] 
            }
        }); 

        peer.on('open', id => {
            console.log('Step 3: PeerJS ID is: ' + id);
            console.log(`Step 4: Joining room: ${roomId} with peer: ${id}`);
            socket.emit('join-room', { roomId: roomId, peerId: id });
        });

        peer.on('error', err => {
            console.error('PeerJS Error:', err);
        });

        // Answer incoming calls
        peer.on('call', call => {
            console.log('Inbound call from:', call.peer);
            call.answer(localStream); 
            
            const video = document.createElement('video');
            call.on('stream', userVideoStream => {
                addVideoStream(video, userVideoStream, call.peer);
            });
            
            call.on('close', () => {
                removeVideo(call.peer);
            });
            
            peers[call.peer] = call;
        });

        // Listen for new users
        socket.on('user-connected', peerId => {
            console.log('Socket signaled: New user connected to this room:', peerId);
            // Delay slightly to ensure the other peer is ready to answer
            setTimeout(() => {
                connectToNewUser(peerId, localStream);
            }, 2000);
        });

        socket.on('user-disconnected', peerId => {
            console.log('User disconnected from room:', peerId);
            if (peers[peerId]) peers[peerId].close();
            removeVideo(peerId);
        });

    } catch (err) {
        console.error('Failed to start app:', err);
        alert('Could not access camera/microphone. Please ensure you are on HTTPS (on Vercel) and have granted permissions.');
    }
}

// 3. Connect to a new user
function connectToNewUser(peerId, stream) {
    console.log('Initiating WebRTC call to peer:', peerId);
    const call = peer.call(peerId, stream);
    const video = document.createElement('video');
    
    call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream, peerId);
    });
    
    call.on('close', () => {
        removeVideo(peerId);
    });

    peers[peerId] = call;
}

// 4. Video helpers
function addVideoStream(video, stream, peerId) {
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

function removeVideo(peerId) {
    const videoElem = document.getElementById(`peer-${peerId}`);
    if (videoElem) videoElem.remove();
}

// 5. Control Handlers
muteBtn.addEventListener('click', () => {
    if(!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    muteBtn.classList.toggle('off', !audioTrack.enabled);
    muteBtn.innerHTML = audioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
});

cameraBtn.addEventListener('click', () => {
    if(!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    cameraBtn.classList.toggle('off', !videoTrack.enabled);
    cameraBtn.innerHTML = videoTrack.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
});

// 6. Robust Link Sharing for Vercel (HTTPS)
copyLinkBtn.addEventListener('click', () => {
    // Generate an absolute URL based on current page and the fixed roomId
    const joinLink = new URL(window.location.href);
    joinLink.searchParams.set('room', roomId);
    
    // Ensure it uses https on Vercel, allow http for localhost
    let finalLink = joinLink.toString();
    if (!finalLink.includes('localhost')) {
        finalLink = finalLink.replace('http:', 'https:');
    }

    console.log('Copying joining link:', finalLink);

    navigator.clipboard.writeText(finalLink).then(() => {
        const originalText = copyLinkBtn.innerHTML;
        copyLinkBtn.innerHTML = '<i class="fas fa-check"></i> Link Copied!';
        copyLinkBtn.classList.add('accent');
        
        setTimeout(() => { 
            copyLinkBtn.innerHTML = originalText;
            copyLinkBtn.classList.remove('accent');
        }, 3000);
    }).catch(err => {
        console.error('Fallback copy used', err);
        const textArea = document.createElement("textarea");
        textArea.value = finalLink;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Link copied to clipboard!');
    });
});

// 7. UI Toggles
toggleBlogBtn.addEventListener('click', () => {
    blogSidebar.classList.toggle('active');
    chatSidebar.classList.remove('active');
});

document.getElementById('close-blog').addEventListener('click', () => {
    blogSidebar.classList.remove('active');
});

chatToggleBtn.addEventListener('click', () => {
    chatSidebar.classList.toggle('active');
    blogSidebar.classList.remove('active');
});

closeChatBtn.addEventListener('click', () => {
    chatSidebar.classList.remove('active');
});

// Chat Functionality
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat');
const chatMessages = document.getElementById('chat-messages');

function appendMessage(user, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message';
    msgDiv.innerHTML = `
        <div class="message-user">${user}</div>
        <div class="message-text">${text}</div>
    `;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

sendChatBtn.addEventListener('click', () => {
    const message = chatInput.value.trim();
    if (message) {
        socket.emit('send-message', { roomId, message, user: 'Me' });
        appendMessage('You', message);
        chatInput.value = '';
    }
});

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatBtn.click();
});

socket.on('receive-message', data => {
    if (data.user !== 'Me') {
        appendMessage(data.user, data.message);
    }
});

// Clock
setInterval(() => {
    document.getElementById('current-time').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}, 1000);

startApp();


