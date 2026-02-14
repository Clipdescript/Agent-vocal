const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();

// Middleware de logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 5e7,
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    allowEIO3: true
});

// Servir les fichiers statiques
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

app.get('/health', (req, res) => {
    res.send('OK');
});

// Initialisation de la base de données
const db = new sqlite3.Database('./database.sqlite');

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
        roomId TEXT
    )`);

    // Migrations pour ajouter les colonnes si elles n'existent pas
    const columns = ['userId', 'bio', 'status', 'messageImage', 'isVisio', 'roomId'];
    columns.forEach(col => {
        db.run(`ALTER TABLE messages ADD COLUMN ${col} ${col === 'isVisio' ? 'INTEGER DEFAULT 0' : 'TEXT'}`, (err) => {
            // Ignorer l'erreur si la colonne existe déjà
        });
    });
});

io.on('connection', (socket) => {
    console.log('Un utilisateur s\'est connecté');

    // Charger l'historique depuis la base de données
    db.all("SELECT * FROM messages ORDER BY timestamp ASC", (err, rows) => {
        if (err) {
            console.error('Erreur lors du chargement de l\'historique:', err);
        } else {
            socket.emit('load history', rows);
        }
    });

    socket.on('chat message', (msg) => {
        if (!msg.timestamp) msg.timestamp = Date.now();
        
        // Sauvegarder dans la base de données
        const stmt = db.prepare("INSERT INTO messages (id, username, text, time, timestamp, color, image, messageImage, userId, bio, status, isVisio, roomId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        stmt.run(msg.id, msg.username, msg.text, msg.time, msg.timestamp, msg.color, msg.image, msg.messageImage, msg.userId, msg.bio, msg.status, msg.isVisio ? 1 : 0, msg.roomId);
        stmt.finalize();

        io.emit('chat message', msg);
    });

    socket.on('typing', (username) => {
        socket.broadcast.emit('user typing', username);
    });

    socket.on('stop typing', () => {
        socket.broadcast.emit('user stop typing');
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

    socket.on('clear messages', () => {
        db.run("DELETE FROM messages", (err) => {
            if (!err) {
                io.emit('messages cleared');
            }
        });
    });

    // --- WebRTC Signaling ---
    socket.on('join-room', (payload) => {
        const { roomID, username } = payload;
        socket.join(roomID);
        socket.roomID = roomID; // Stocker pour le disconnect
        socket.to(roomID).emit('user-joined', { userId: socket.id, username });
    });

    socket.on('offer', (payload) => {
        io.to(payload.target).emit('offer', { sdp: payload.sdp, from: socket.id, username: payload.username });
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
