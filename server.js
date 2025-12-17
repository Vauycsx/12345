const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

/* ==================== CORS ==================== */
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/* ==================== SOCKET.IO ==================== */
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

/* ==================== DATABASE ==================== */
mongoose.connect(
    process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/harmony',
    {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }
)
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB error:', err));

/* ==================== MODELS ==================== */
const User = mongoose.model('User', new mongoose.Schema({
    nickname: String,
    secretCode: String,
    avatar: String,
    color: String,
    role: { type: String, default: 'user' },
    createdAt: { type: Date, default: Date.now }
}));

const Song = mongoose.model('Song', new mongoose.Schema({
    userId: String,
    title: String,
    artist: String,
    duration: String,
    data: String,
    color: String,
    demo: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
}));

const Playlist = mongoose.model('Playlist', new mongoose.Schema({
    userId: String,
    name: String,
    description: String,
    songs: [String],
    color: String,
    createdAt: { type: Date, default: Date.now }
}));

const Room = mongoose.model('Room', new mongoose.Schema({
    name: String,
    code: String,
    password: String,
    host: String,
    members: [Object],
    currentSong: Object,
    isPlaying: Boolean,
    createdAt: { type: Date, default: false }
}));

/* ==================== CONSTANTS ==================== */
const SECRET_CODES = {
    "HX-0104-3107-15": {
        nickname: "Принцеса",
        avatar: "fas fa-crown",
        role: "special",
        color: "#ffcfe1"
    },
    "admin": {
        nickname: "Макс",
        avatar: "fas fa-star",
        role: "admin",
        color: "#ffb6d0"
    },
    "demo": {
        nickname: "Демо-користувач",
        avatar: "fas fa-user",
        role: "user",
        color: "#ffcfe1"
    }
};

/* ==================== AUTH MIDDLEWARE ==================== */
function auth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Токен не надано' });
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'Токен невалідний' });
    }

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'harmony-2025-secret'
        );
        req.userId = decoded.userId;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Невалідний токен' });
    }
}

/* ==================== ROUTES ==================== */

// ROOT
app.get('/', (req, res) => {
    res.json({
        status: 'Harmony Backend is running',
        health: '/health'
    });
});

// HEALTH
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        time: new Date().toISOString()
    });
});

// LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const secretCode = req.body.secretCode;
        if (!secretCode || !SECRET_CODES[secretCode]) {
            return res.status(401).json({ error: 'Невірний код' });
        }

        let user = await User.findOne({ secretCode });
        if (!user) {
            const data = SECRET_CODES[secretCode];
            user = await User.create({
                nickname: data.nickname,
                secretCode,
                avatar: data.avatar,
                color: data.color,
                role: data.role
            });
        }

        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET || 'harmony-2025-secret',
            { expiresIn: '30d' }
        );

        res.json({
            token,
            user: {
                id: user._id,
                nickname: user.nickname,
                avatar: user.avatar,
                color: user.color,
                role: user.role
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// PROFILE
app.get('/api/profile', auth, async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'Not found' });

    res.json({
        nickname: user.nickname,
        avatar: user.avatar,
        color: user.color,
        role: user.role
    });
});

/* ==================== SOCKET EVENTS ==================== */
io.on('connection', (socket) => {
    console.log('🔌 Socket connected:', socket.id);

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
    });

    socket.on('play-song', (data) => {
        socket.to(data.roomId).emit('song-playing', data);
    });

    socket.on('pause-song', (data) => {
        socket.to(data.roomId).emit('song-paused', data);
    });

    socket.on('disconnect', () => {
        console.log('❌ Socket disconnected:', socket.id);
    });
});

/* ==================== 404 ==================== */
app.use((req, res) => {
    res.status(404).json({ error: 'Маршрут не знайдено' });
});

/* ==================== START ==================== */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
