from flask import Flask, request
from flask_socketio import SocketIO, join_room, emit

app = Flask(__name__, static_folder='.', static_url_path='')
app.config['SECRET_KEY'] = 'secret-video-call-key'

# Initialize SocketIO
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route('/')
def index():
    return app.send_static_file('index.html')

@socketio.on('join-room')
def on_join(data):
    room = data.get('roomId')
    peer_id = data.get('peerId')
    
    if not room or not peer_id:
        print(f"Error: Invalid join-room data received: {data}")
        return

    join_room(room)
    print(f"User {peer_id} joined room {room}")
    
    # Broadcast to everyone in the room (except the sender) that a new user joined
    emit('user-connected', peer_id, to=room, include_self=False)
    print(f"Signaled 'user-connected' for {peer_id} to room {room}")

@socketio.on('send-message')
def on_message(data):
    room = data['roomId']
    message = data['message']
    user = data['user']
    # Broadcast message to everyone in the room
    emit('receive-message', {'message': message, 'user': user}, to=room)

@socketio.on('disconnect')
def on_disconnect():
    print('Client disconnected')

if __name__ == '__main__':
    print("Starting Video Call Signaling Server on http://127.0.0.1:5000")
    socketio.run(app, debug=True, port=5000, host='0.0.0.0', allow_unsafe_werkzeug=True)
