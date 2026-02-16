import type * as Party from "partykit/server";

interface Message {
  id?: string;
  username?: string;
  text?: string;
  time?: string;
  timestamp: number;
  color?: string;
  image?: string;
  messageImage?: string;
  userId?: string;
  bio?: string;
  status?: string;
  isVisio?: boolean;
  roomId?: string;
  audio?: string;
  audioWaveform?: string;
  audioDuration?: string;
  reactions?: any;
  replyTo?: any;
}

interface GroupInfo {
  name: string;
  description: string;
  image: string | null;
}

interface UserConnection {
  id: string;
  roomId?: string;
}

export default class Server implements Party.Server {
  messages: Message[] = [];
  groupInfo: GroupInfo = { 
    name: 'Général', 
    description: 'Bienvenue dans le groupe général !', 
    image: null 
  };
  
  // Stocker les rooms des utilisateurs
  userRooms: Map<string, string> = new Map();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    console.log(`Connected: ${conn.id}`);
    
    // Envoyer l'historique des messages
    conn.send(JSON.stringify({
      type: 'load history',
      data: this.messages.slice(-100).reverse()
    }));

    // Envoyer les infos du groupe
    conn.send(JSON.stringify({
      type: 'group info',
      data: this.groupInfo
    }));
  }

  onMessage(message: string, sender: Party.Connection) {
    try {
      const msg = JSON.parse(message);
      
      switch (msg.type) {
        case 'chat message':
          if (!msg.timestamp) msg.timestamp = Date.now();
          this.messages.push(msg);
          // Garder seulement les 200 derniers messages
          if (this.messages.length > 200) {
            this.messages = this.messages.slice(-200);
          }
          // Broadcast à tous
          this.room.broadcast(JSON.stringify({ type: 'chat message', data: msg }));
          break;

        case 'message reaction':
          const msgIndex = this.messages.findIndex(m => m.timestamp === msg.timestamp);
          if (msgIndex !== -1) {
            let reactions = this.messages[msgIndex].reactions || [];
            if (typeof reactions === 'string') {
              reactions = JSON.parse(reactions);
            }
            
            const index = reactions.findIndex((r: any) => r.userId === msg.userId);
            if (index !== -1) {
              if (reactions[index].emoji === msg.emoji) {
                reactions.splice(index, 1);
              } else {
                reactions[index].emoji = msg.emoji;
              }
            } else {
              reactions.push({ userId: msg.userId, emoji: msg.emoji });
            }
            
            if (reactions.length > 20) reactions.shift();
            
            this.messages[msgIndex].reactions = reactions;
            this.room.broadcast(JSON.stringify({ 
              type: 'message reaction updated', 
              data: { timestamp: msg.timestamp, reactions } 
            }));
          }
          break;

        case 'typing':
          this.room.broadcast(JSON.stringify({ 
            type: 'user typing', 
            data: msg.data 
          }), [sender.id]);
          break;

        case 'stop typing':
          this.room.broadcast(JSON.stringify({ type: 'user stop typing' }), [sender.id]);
          break;

        case 'recording':
          this.room.broadcast(JSON.stringify({ 
            type: 'user recording', 
            data: msg.data 
          }), [sender.id]);
          break;

        case 'stop recording':
          this.room.broadcast(JSON.stringify({ type: 'user stop recording' }), [sender.id]);
          break;

        case 'update profile':
          this.messages = this.messages.map(m => {
            if (m.userId === msg.data.userId || m.username === msg.data.username) {
              return { 
                ...m, 
                image: msg.data.image !== undefined ? msg.data.image : m.image, 
                bio: msg.data.bio !== undefined ? msg.data.bio : m.bio, 
                status: msg.data.status !== undefined ? msg.data.status : m.status 
              };
            }
            return m;
          });
          this.room.broadcast(JSON.stringify({ 
            type: 'profile updated', 
            data: msg.data 
          }));
          break;

        case 'get user profile':
          const userMsg = this.messages.find(m => m.userId === msg.userId);
          sender.send(JSON.stringify({ 
            type: 'user profile data', 
            data: userMsg || null 
          }));
          break;

        case 'delete message':
          const deleteIndex = this.messages.findIndex(m => m.timestamp === msg.timestamp && m.userId === msg.userId);
          if (deleteIndex !== -1) {
            this.messages.splice(deleteIndex, 1);
            this.room.broadcast(JSON.stringify({ 
              type: 'message deleted', 
              data: { timestamp: msg.timestamp } 
            }));
          }
          break;

        case 'clear messages':
          this.messages = [];
          this.room.broadcast(JSON.stringify({ type: 'messages cleared' }));
          break;

        case 'get group info':
          sender.send(JSON.stringify({ 
            type: 'group info', 
            data: this.groupInfo 
          }));
          break;

        case 'update group info':
          this.groupInfo = { ...this.groupInfo, ...msg.data };
          this.room.broadcast(JSON.stringify({ 
            type: 'group info updated', 
            data: this.groupInfo 
          }));
          break;

        // WebRTC Signaling
        case 'join-room':
          this.userRooms.set(sender.id, msg.roomID);
          this.room.broadcast(JSON.stringify({
            type: 'user-joined',
            data: { userId: sender.id, username: msg.username, image: msg.image }
          }), [sender.id]);
          break;

        case 'offer':
          this.room.broadcast(JSON.stringify({
            type: 'offer',
            data: { sdp: msg.sdp, from: sender.id, username: msg.username, image: msg.image }
          }), [msg.target]);
          break;

        case 'answer':
          this.room.broadcast(JSON.stringify({
            type: 'answer',
            data: { sdp: msg.sdp, from: sender.id }
          }), [msg.target]);
          break;

        case 'ice-candidate':
          this.room.broadcast(JSON.stringify({
            type: 'ice-candidate',
            data: { candidate: msg.candidate, from: sender.id }
          }), [msg.target]);
          break;

        case 'video-state-change':
          this.room.broadcast(JSON.stringify({
            type: 'video-state-change',
            data: { userId: sender.id, enabled: msg.enabled }
          }), [sender.id]);
          break;

        case 'mic-state-change':
          this.room.broadcast(JSON.stringify({
            type: 'mic-state-change',
            data: { userId: sender.id, enabled: msg.enabled }
          }), [sender.id]);
          break;
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  }

  onClose(conn: Party.Connection) {
    console.log(`Disconnected: ${conn.id}`);
    // Notifier les autres utilisateurs
    const roomId = this.userRooms.get(conn.id);
    if (roomId) {
      this.room.broadcast(JSON.stringify({
        type: 'user-left',
        data: conn.id
      }));
      this.userRooms.delete(conn.id);
    }
  }
}
