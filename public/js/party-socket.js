// Socket.IO adapter with polling fallback for Vercel
class PartySocketAdapter {
  constructor(options = {}) {
    this.room = options.room || 'default';
    this.listeners = {};
    this.connected = false;
    this.messageQueue = [];
    
    // Use Vercel server with polling (no WebSocket on serverless)
    const socketUrl = window.location.origin;
    
    // Create socket with polling transport only
    this.socket = io({
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000
    });
    
    this.socket.on('connect', () => {
      this.connected = true;
      console.log('Connected via polling');
      this.emit('connect', {});
      
      // Send queued messages
      while (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift();
        this.socket.emit(msg.type, msg.data);
      }
    });
    
    this.socket.on('disconnect', () => {
      this.connected = false;
      this.emit('disconnect', {});
    });
    
    // Forward all events
    this.socket.on('load history', (data) => this.emit('load history', data));
    this.socket.on('chat message', (data) => this.emit('chat message', data));
    this.socket.on('message reaction updated', (data) => this.emit('message reaction updated', data));
    this.socket.on('user typing', (data) => this.emit('user typing', data));
    this.socket.on('user stop typing', () => this.emit('user stop typing', {}));
    this.socket.on('user recording', (data) => this.emit('user recording', data));
    this.socket.on('user stop recording', () => this.emit('user stop recording', {}));
    this.socket.on('profile updated', (data) => this.emit('profile updated', data));
    this.socket.on('user profile data', (data) => this.emit('user profile data', data));
    this.socket.on('message deleted', (data) => this.emit('message deleted', data));
    this.socket.on('messages cleared', () => this.emit('messages cleared', {}));
    this.socket.on('messages existence', (data) => this.emit('messages existence', data));
    this.socket.on('group info', (data) => this.emit('group info', data));
    this.socket.on('group info updated', (data) => this.emit('group info updated', data));
    this.socket.on('user-joined', (data) => this.emit('user-joined', data));
    this.socket.on('user-left', (data) => this.emit('user-left', data));
    this.socket.on('offer', (data) => this.emit('offer', data));
    this.socket.on('answer', (data) => this.emit('answer', data));
    this.socket.on('ice-candidate', (data) => this.emit('ice-candidate', data));
    this.socket.on('video-state-change', (data) => this.emit('video-state-change', data));
    this.socket.on('mic-state-change', (data) => this.emit('mic-state-change', data));
  }
  
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }
  
  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => cb(data));
  }
  
  send(event, data) {
    const message = { type: event, data };
    if (this.connected) {
      this.socket.emit(event, data);
    } else {
      this.messageQueue.push(message);
    }
  }
  
  // For Socket.IO compatibility
  onAny(callback) {
    for (const event in this.listeners) {
      this.listeners[event].push((data) => callback(event, data));
    }
  }
  
  disconnect() {
    this.socket.disconnect();
  }
  
  get id() {
    return this.socket?.id || null;
  }
}

// Replace global io() with our adapter
window.io = function(options = {}) {
  return new PartySocketAdapter(options);
};
