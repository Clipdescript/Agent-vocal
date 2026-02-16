const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const compression = require('compression');

const app = express();

// Force garbage collection périodique (toutes les 5 minutes)
if (global.gc) {
    setInterval(() => {
        global.gc();
        console.log('Garbage collection forcé');
    }, 5 * 60 * 1000);
}

// Compression GZIP pour toutes les réponses
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));

// Middleware de logging minimal (réduit la mémoire)
app.use((req, res, next) => {
    if (req.url !== '/health') {
        console.log(`${req.method} ${req.url}`);
    }
    next();
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 2e6,
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

// Servir les fichiers statiques
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

app.get('/health', (req, res) => {
    res.send('OK');
});

// Initialisation de la base de données avec optimisations
const db = new sqlite3.Database('./database.sqlite');

// Optimisations SQLite pour performance et mémoire
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA synchronous = NORMAL');
db.run('PRAGMA cache_size = 1000');
db.run('PRAGMA temp_store = MEMORY');
db.run('PRAGMA mmap_size = 30000000');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT,
        username TEXT,
        text TEXT,
        time TEXT,
        timestamp INTEGER,
        color TEXT,
        image TEXT,
        messageImage TEXT,
        userId TEXT,
        bio TEXT,
        status TEXT,
        isVisio INTEGER DEFAULT 0,
        roomId TEXT,
        audio TEXT,
        audioWaveform TEXT,
        audioDuration TEXT,
        reactions TEXT,
        replyTo TEXT
    )`);

    // Index critiques pour performance
    db.run('CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp DESC)');
    db.run('CREATE INDEX IF NOT EXISTS idx_userId ON messages(userId)');

    db.run(`CREATE TABLE IF NOT EXISTS group_info (
        id INTEGER PRIMARY KEY,
        name TEXT,
        image TEXT,
        description TEXT
    )`);

    db.get("SELECT * FROM group_info WHERE id = 1", (err, row) => {
        if (err) console.error("Error checking group_info:", err.message);
        if (!row) {
            console.log("Initializing group_info table...");
            db.run("INSERT INTO group_info (id, name, description) VALUES (1, 'Général', 'Bienvenue dans le groupe général !')");
        }
    });

    // Migrations de secours pour les bases existantes
    const migrations = [
        { name: 'audio', type: 'TEXT' },
        { name: 'audioWaveform', type: 'TEXT' },
        { name: 'audioDuration', type: 'TEXT' },
        { name: 'reactions', type: 'TEXT' },
        { name: 'replyTo', type: 'TEXT' },
        { name: 'isVisio', type: 'INTEGER DEFAULT 0' },
        { name: 'roomId', type: 'TEXT' }
    ];

    migrations.forEach(col => {
        db.run(`ALTER TABLE messages ADD COLUMN ${col.name} ${col.type}`, (err) => {
            // On ignore l'erreur si la colonne existe déjà
        });
    });
});

// Nettoyage automatique : messages > 7 jours OU garde max 200 messages
function cleanOldMessages() {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    db.get("SELECT COUNT(*) as count FROM messages", (err, row) => {
        if (!err && row) {
            if (row.count > 200) {
                db.run(`DELETE FROM messages WHERE timestamp < ? OR timestamp NOT IN (
                    SELECT timestamp FROM messages ORDER BY timestamp DESC LIMIT 200
                )`, [sevenDaysAgo], (err) => {
                    if (!err) {
                        db.run('VACUUM');
                        console.log('Nettoyage DB effectué');
                    }
                });
            }
        }
    });
}

// Nettoyer toutes les heures
setInterval(cleanOldMessages, 60 * 60 * 1000);
cleanOldMessages();

io.on('connection', (socket) => {
    console.log('Un utilisateur s\'est connecté');

    // Charger seulement les 100 derniers messages pour économiser la mémoire
    db.all("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 100", (err, rows) => {
        if (!err) {
            socket.emit('load history', rows.reverse());
        }
    });

    socket.on('chat message', (msg) => {
        if (!msg.timestamp) msg.timestamp = Date.now();
        
        const params = [
            msg.id || null, msg.username || null, msg.text || null, msg.time || null, 
            msg.timestamp, msg.color || null, msg.image || null, msg.messageImage || null, 
            msg.userId || null, msg.bio || null, msg.status || null, 
            msg.isVisio ? 1 : 0, msg.roomId || null, 
            msg.audio || null, msg.audioWaveform || null, msg.audioDuration || null,
            msg.reactions || null,
            msg.replyTo ? JSON.stringify(msg.replyTo) : null
        ];

        db.run(`INSERT INTO messages (
            id, username, text, time, timestamp, color, image, messageImage, 
            userId, bio, status, isVisio, roomId, audio, audioWaveform, audioDuration, reactions, replyTo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, params, function(err) {
            if (err) console.error("Erreur INSERT:", err.message);
        });

        io.emit('chat message', msg);
    });

    socket.on('message reaction', (data) => {
        const { timestamp, emoji, userId } = data;
        
        db.get("SELECT reactions FROM messages WHERE timestamp = ?", [timestamp], (err, row) => {
            if (!err && row) {
                let reactions = [];
                try {
                    reactions = JSON.parse(row.reactions || '[]');
                } catch(e) { reactions = []; }
                
                // Si ce n'est pas un tableau d'objets (ancien format), on reset
                if (reactions.length > 0 && typeof reactions[0] === 'string') {
                    reactions = [];
                }

                // Trouver si l'utilisateur a déjà réagi
                const index = reactions.findIndex(r => r.userId === userId);
                if (index !== -1) {
                    if (reactions[index].emoji === emoji) {
                        // Si c'est le même émoji, on le retire (Toggle)
                        reactions.splice(index, 1);
                    } else {
                        // Sinon on change l'émoji
                        reactions[index].emoji = emoji;
                    }
                } else {
                    // Sinon on ajoute la nouvelle réaction
                    reactions.push({ userId, emoji });
                }
                
                // Limiter à 20 réactions par message
                if (reactions.length > 20) reactions.shift();
                
                const reactionsStr = JSON.stringify(reactions);
                db.run("UPDATE messages SET reactions = ? WHERE timestamp = ?", [reactionsStr, timestamp], (err) => {
                    if (!err) {
                        io.emit('message reaction updated', { timestamp, reactions });
                    }
                });
            }
        });
    });

    socket.on('typing', (data) => {
        socket.broadcast.emit('user typing', data);
    });

    socket.on('recording', (data) => {
        socket.broadcast.emit('user recording', data);
    });

    socket.on('stop typing', () => {
        socket.broadcast.emit('user stop typing');
    });

    socket.on('stop recording', () => {
        socket.broadcast.emit('user stop recording');
    });

    socket.on('update profile', (data) => {
        // Récupérer les données existantes d'abord pour ne pas écraser par du vide
        db.get("SELECT image, bio, status FROM messages WHERE userId = ? OR username = ? ORDER BY timestamp DESC LIMIT 1", [data.userId, data.username], (err, row) => {
            const finalImage = data.image !== undefined ? data.image : (row ? row.image : null);
            const finalBio = data.bio !== undefined ? data.bio : (row ? row.bio : null);
            const finalStatus = data.status !== undefined ? data.status : (row ? row.status : null);

            const stmt = db.prepare("UPDATE messages SET image = ?, bio = ?, status = ? WHERE userId = ? OR username = ?");
            stmt.run(finalImage, finalBio, finalStatus, data.userId, data.username, (err) => {
                if (!err) {
                    io.emit('profile updated', { ...data, image: finalImage, bio: finalBio, status: finalStatus });
                }
            });
            stmt.finalize();
        });
    });

    socket.on('get user profile', (uid) => {
        db.get("SELECT username, image, bio, status, userId FROM messages WHERE userId = ? ORDER BY timestamp DESC LIMIT 1", [uid], (err, row) => {
            if (!err && row) {
                socket.emit('user profile data', row);
            } else {
                socket.emit('user profile data', null);
            }
        });
    });

    socket.on('delete message', (data) => {
        const { timestamp, userId: senderUserId } = data;
        // Vérifier que l'utilisateur supprime son propre message
        db.get("SELECT userId FROM messages WHERE timestamp = ?", [timestamp], (err, row) => {
            if (!err && row && row.userId === senderUserId) {
                db.run("DELETE FROM messages WHERE timestamp = ?", [timestamp], (err) => {
                    if (!err) {
                        io.emit('message deleted', { timestamp });
                    }
                });
            }
        });
    });

    socket.on('clear messages', () => {
        db.run("DELETE FROM messages", (err) => {
            if (!err) {
                io.emit('messages cleared');
            }
        });
    });

    socket.on('check messages exist', (data) => {
        const lastClear = data ? (data.lastClear || 0) : 0;
        db.get("SELECT COUNT(*) as count FROM messages WHERE timestamp > ?", [lastClear], (err, row) => {
            socket.emit('messages existence', { exists: row && row.count > 0 });
        });
    });

    socket.on('get group info', () => {
        db.get("SELECT * FROM group_info WHERE id = 1", (err, row) => {
            if (err) {
                console.error("Error getting group info:", err.message);
                socket.emit('group info', { name: "Général", description: "Bienvenue dans le groupe général !" });
            } else {
                socket.emit('group info', row || { name: "Général", description: "Bienvenue dans le groupe général !" });
            }
        });
    });

    socket.on('update group info', (data) => {
        db.get("SELECT * FROM group_info WHERE id = 1", (err, row) => {
            const name = data.name !== undefined ? data.name : row.name;
            const image = data.image !== undefined ? data.image : row.image;
            const description = data.description !== undefined ? data.description : row.description;
            
            db.run("UPDATE group_info SET name = ?, image = ?, description = ? WHERE id = 1", [name, image, description], (err) => {
                if (!err) {
                    io.emit('group info updated', { name, image, description });
                }
            });
        });
    });

    // --- WebRTC Signaling ---
    socket.on('join-room', (payload) => {
        const { roomID, username, image } = payload;
        socket.join(roomID);
        socket.roomID = roomID; // Stocker pour le disconnect
        socket.to(roomID).emit('user-joined', { userId: socket.id, username, image });
    });

    socket.on('offer', (payload) => {
        io.to(payload.target).emit('offer', { sdp: payload.sdp, from: socket.id, username: payload.username, image: payload.image });
    });

    socket.on('video-state-change', (data) => {
        if (socket.roomID) {
            socket.to(socket.roomID).emit('video-state-change', { userId: socket.id, enabled: data.enabled });
        }
    });

    socket.on('mic-state-change', (data) => {
        if (socket.roomID) {
            socket.to(socket.roomID).emit('mic-state-change', { userId: socket.id, enabled: data.enabled });
        }
    });

    socket.on('answer', (payload) => {
        io.to(payload.target).emit('answer', { sdp: payload.sdp, from: socket.id });
    });

    socket.on('ice-candidate', (payload) => {
        io.to(payload.target).emit('ice-candidate', { candidate: payload.candidate, from: socket.id });
    });
    // ------------------------

    socket.on('disconnect', () => {
        console.log('Un utilisateur s\'est déconnecté');
        if (socket.roomID) {
            socket.to(socket.roomID).emit('user-left', socket.id);
        }
    });
});

app.use((req, res) => {
    res.status(404).send(`La ressource demandée n'existe pas : ${req.url}`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
