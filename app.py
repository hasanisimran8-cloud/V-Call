from flask import Flask, request
from flask_socketio import SocketIO, join_room, leave_room, emit
import os

app = Flask(__name__, static_folder='.', static_url_path='')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'secret-video-call-key')

# Initialize SocketIO
# In Vercel serverless environment, SocketIO might face limitations with long polling/websockets
# 'async_mode' is set to 'threading' for better compatibility with serverless functions
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Store mapping of sid to (room, peer_id)
connected_users = {}

@app.route('/')
def index():
    return app.send_static_file('index.html')

@socketio.on('join-room')
def on_join(data):
    room = data.get('roomId')
    peer_id = data.get('peerId')
    
    if not room or not peer_id:
        return

    sid = request.sid
    connected_users[sid] = {'room': room, 'peerId': peer_id}
    
    join_room(room)
    print(f"User {peer_id} (SID: {sid}) joined room {room}")
    
    # Broadcast to everyone in the room (except the sender) that a new user joined
    emit('user-connected', peer_id, to=room, include_self=False)

@socketio.on('send-message')
def on_message(data):
    room = data.get('roomId')
    message = data.get('message')
    user = data.get('user')
    if room and message:
        emit('receive-message', {'message': message, 'user': user}, to=room)

@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    if sid in connected_users:
        user_data = connected_users[sid]
        room = user_data['room']
        peer_id = user_data['peerId']
        
        print(f"User {peer_id} (SID: {sid}) disconnected from room {room}")
        
        emit('user-disconnected', peer_id, to=room)
        del connected_users[sid]

# For Vercel, the 'app' object is the entry point.
# Running directly via 'python app.py' is still supported.
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting Video Call Signaling Server on http://0.0.0.0:{port}")
    socketio.run(app, debug=True, port=port, host='0.0.0.0', allow_unsafe_werkzeug=True)
