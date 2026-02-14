const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');
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

// Servir les fichiers statiques AVANT les autres routes
const publicPath = path.join(__dirname, 'public');
console.log(`Static files path: ${publicPath}`);

const fs = require('fs');
if (fs.existsSync(publicPath)) {
    console.log('Public directory exists');
} else {
    console.error('Public directory NOT FOUND!');
}

app.use(express.static(publicPath));

app.get('/health', (req, res) => {
    res.send('OK');
});

// Initialisation de la base de données PostgreSQL (Supabase)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:L9QUOo7LEK0IFzjq@db.ptuisotxdbcltnfduzsx.supabase.co:5432/postgres',
    ssl: {
        rejectUnauthorized: false
    }
});

// Tester la connexion immédiatement avec plus de détails
pool.connect((err, client, release) => {
    if (err) {
        console.error('CRITICAL: ERREUR DE CONNEXION SUPABASE:', err.message);
        return;
    }
    console.log('✅ CONNEXION SUPABASE RÉUSSIE');
    release();
});

async function initDb() {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS messages (
            id TEXT,
            username TEXT,
            text TEXT,
            time TEXT,
            timestamp BIGINT,
            color TEXT,
            image TEXT,
            userId TEXT,
            bio TEXT,
            status TEXT
        )`);
        console.log('Base de données initialisée');
    } catch (err) {
        console.error('Erreur lors de l\'initialisation de la DB:', err);
    }
}

initDb();

io.on('connection', (socket) => {
    console.log('Un utilisateur s\'est connecté');

    // Charger l'historique depuis la base de données
    pool.query("SELECT * FROM messages ORDER BY timestamp ASC", (err, result) => {
        if (err) {
            console.error('Erreur lors du chargement de l\'historique:', err);
        } else {
            socket.emit('load history', result.rows);
        }
    });

    socket.on('chat message', async (msg) => {
        if (!msg.timestamp) msg.timestamp = Date.now();
        
        try {
            const query = "INSERT INTO messages (id, username, text, time, timestamp, color, image, userId, bio, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)";
            const values = [msg.id, msg.username, msg.text, msg.time, msg.timestamp, msg.color, msg.image, msg.userId, msg.bio, msg.status];
            await pool.query(query, values);
            io.emit('chat message', msg);
        } catch (err) {
            console.error('Erreur lors de la sauvegarde du message:', err);
        }
    });

    socket.on('typing', (username) => {
        socket.broadcast.emit('user typing', username);
    });

    socket.on('stop typing', () => {
        socket.broadcast.emit('user stop typing');
    });

    socket.on('update profile', async (data) => {
        try {
            const query = "UPDATE messages SET image = $1, userId = $2, bio = $3, status = $4 WHERE userId = $2 OR username = $5";
            const values = [data.image, data.userId, data.bio, data.status, data.username];
            await pool.query(query, values);
            io.emit('profile updated', data);
        } catch (err) {
            console.error('Erreur lors de la mise à jour du profil:', err);
        }
    });

    socket.on('get user profile', async (uid) => {
        try {
            const query = "SELECT username, image, bio, status, userId FROM messages WHERE userId = $1 ORDER BY timestamp DESC LIMIT 1";
            const result = await pool.query(query, [uid]);
            if (result.rows.length > 0) {
                socket.emit('user profile data', result.rows[0]);
            } else {
                socket.emit('user profile data', null);
            }
        } catch (err) {
            console.error('Erreur lors de la récupération du profil:', err);
        }
    });

    socket.on('clear messages', async () => {
        try {
            await pool.query("DELETE FROM messages");
            io.emit('messages cleared');
        } catch (err) {
            console.error('Erreur lors de la suppression des messages:', err);
        }
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
