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
    allowEIO3: true // Pour la compatibilité au cas où
});

// Servir les fichiers statiques AVANT les autres routes
const publicPath = path.join(__dirname, 'public');
console.log(`Static files path: ${publicPath}`);

const fs = require('fs');
if (fs.existsSync(publicPath)) {
    console.log('Public directory exists');
    console.log('Contents:', fs.readdirSync(publicPath));
} else {
    console.error('Public directory NOT FOUND!');
}

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
        userId TEXT,
        bio TEXT,
        status TEXT
    )`);

    // Migrations pour ajouter les colonnes si elles n'existent pas
    const columns = ['userId', 'bio', 'status'];
    columns.forEach(col => {
        db.run(`ALTER TABLE messages ADD COLUMN ${col} TEXT`, (err) => {
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
        // S'assurer qu'il y a un timestamp pour la persistence locale
        if (!msg.timestamp) msg.timestamp = Date.now();
        
        // Sauvegarder dans la base de données
        const stmt = db.prepare("INSERT INTO messages (id, username, text, time, timestamp, color, image, userId, bio, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        stmt.run(msg.id, msg.username, msg.text, msg.time, msg.timestamp, msg.color, msg.image, msg.userId, msg.bio, msg.status);
        stmt.finalize();

        // On renvoie l'objet message tel quel (contient .text, .id, .timestamp, .image)
        io.emit('chat message', msg);
    });

    socket.on('typing', (username) => {
        socket.broadcast.emit('user typing', username);
    });

    socket.on('stop typing', () => {
        socket.broadcast.emit('user stop typing');
    });

    socket.on('update profile', (data) => {
        // Mettre à jour tous les messages de cet utilisateur dans la base de données
        const stmt = db.prepare("UPDATE messages SET image = ?, userId = ?, bio = ?, status = ? WHERE userId = ? OR username = ?");
        stmt.run(data.image, data.userId, data.bio, data.status, data.userId, data.username, (err) => {
            if (!err) {
                // Notifier tous les clients pour qu'ils mettent à jour l'affichage
                io.emit('profile updated', data);
            }
        });
        stmt.finalize();
    });

    socket.on('get user profile', (uid) => {
        // On récupère les infos depuis le message le plus récent de cet utilisateur
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
            if (err) {
                console.error('Erreur lors de la suppression des messages:', err);
            } else {
                io.emit('messages cleared');
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('Un utilisateur s\'est déconnecté');
    });
});

// Gestionnaire 404 pour déboguer les fichiers manquants
app.use((req, res) => {
    console.warn(`404 - Not Found: ${req.url}`);
    res.status(404).send(`La ressource demandée n'existe pas : ${req.url}`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
