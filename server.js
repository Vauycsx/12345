const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// ПОКРАЩЕНІ НАЛАШТУВАННЯ CORS ДЛЯ RENDER
const allowedOrigins = [
    'https://frontend-harmony.onrender.com',
    'http://localhost:3000',
    'http://localhost:5000'
];

const corsOptions = {
    origin: function (origin, callback) {
        // Дозволити запити без origin (наприклад, мобільні додатки)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('CORS заблоковано для origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400 // 24 години
};

app.use(cors(corsOptions));

// Важливо: обробка preflight запитів
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Додаткові middleware для CORS (резервний варіант)
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
    
    // Обробка preflight запитів
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Socket.io з підтримкою CORS
const io = socketIo(server, {
    cors: {
        origin: allowedOrigins,
        credentials: true,
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

// ============ ПОЛІПШЕНЕ ПІДКЛЮЧЕННЯ MONGODB ============
async function connectDB() {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://gejmgejm989_db_user:K2NPh3GeZwvRRl7I@harmony.aquqway.mongodb.net/?appName=harmony';
        console.log('🔗 Підключення до MongoDB...');
        
        await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            minPoolSize: 2
        });
        
        console.log('✅ MongoDB успішно підключено');
        
        mongoose.connection.on('connected', () => {
            console.log('🟢 MongoDB connection active');
        });
        
        mongoose.connection.on('error', (err) => {
            console.error('🔴 MongoDB connection error:', err.message);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.log('🟡 MongoDB disconnected - attempting reconnect');
            setTimeout(connectDB, 5000);
        });
        
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            console.log('👋 MongoDB connection closed gracefully');
            process.exit(0);
        });
        
    } catch (error) {
        console.error('❌ Не вдалося підключитися до MongoDB:', error.message);
        console.log('⏳ Повторна спроба через 5 секунд...');
        setTimeout(connectDB, 5000);
    }
}

connectDB();

// ============ МОДЕЛІ БАЗИ ДАНИХ ============
const User = mongoose.model('User', {
    nickname: String,
    secretCode: String,
    avatar: String,
    color: String,
    role: { type: String, default: 'user' },
    createdAt: { type: Date, default: Date.now }
});

const Song = mongoose.model('Song', {
    userId: String,
    title: String,
    artist: String,
    duration: String,
    data: String,
    color: String,
    demo: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const Playlist = mongoose.model('Playlist', {
    userId: String,
    name: String,
    description: String,
    songs: [String],
    color: String,
    created: { type: Date, default: Date.now }
});

const Room = mongoose.model('Room', {
    name: String,
    code: String,
    password: String,
    host: String,
    members: [Object],
    currentSong: Object,
    isPlaying: Boolean,
    createdAt: { type: Date, default: Date.now }
});

// ============ СЕКРЕТНІ КОДИ ДОСТУПУ ============
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

// ============ MIDDLEWARE ДЛЯ ПЕРЕВІРКИ ТОКЕНУ ============
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Токен не надано' });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-2025-change-this');
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Невалідний токен' });
    }
};

// ============ API ENDPOINTS ============

// ROOT
app.get('/', (req, res) => {
    res.json({
        status: 'Harmony Backend is running',
        health: '/health',
        cors: 'configured for frontend-harmony.onrender.com'
    });
});

// HEALTH - ВАЖЛИВО: без auth middleware!
app.get('/health', async (req, res) => {
    try {
        const dbStatus = mongoose.connection.readyState;
        const statusMap = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };
        
        res.json({ 
            status: 'OK', 
            timestamp: new Date().toISOString(),
            service: 'Harmony Backend API 2025',
            version: '2025.1.1',
            database: statusMap[dbStatus] || 'unknown',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cors: {
                allowedOrigins: allowedOrigins,
                currentOrigin: req.headers.origin
            }
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'ERROR', 
            error: error.message 
        });
    }
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
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Отримати профіль
app.get('/api/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'Користувача не знайдено' });
        }
        
        res.json({
            nickname: user.nickname,
            avatar: user.avatar,
            color: user.color,
            role: user.role
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Завантажити пісню
app.post('/api/songs', auth, async (req, res) => {
    try {
        const { title, artist, duration, data, color } = req.body;
        
        const song = new Song({
            userId: req.userId,
            title,
            artist,
            duration,
            data,
            color
        });
        
        await song.save();
        
        res.json({
            success: true,
            song: {
                id: song._id,
                title: song.title,
                artist: song.artist,
                duration: song.duration,
                color: song.color
            }
        });
    } catch (error) {
        console.error('Upload song error:', error);
        res.status(500).json({ error: 'Не вдалося завантажити пісню' });
    }
});

// Отримати пісні користувача
app.get('/api/songs', auth, async (req, res) => {
    try {
        const songs = await Song.find({ userId: req.userId });
        res.json(songs);
    } catch (error) {
        console.error('Get songs error:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Створити плейлист
app.post('/api/playlists', auth, async (req, res) => {
    try {
        const { name, description, color } = req.body;
        
        const playlist = new Playlist({
            userId: req.userId,
            name,
            description,
            songs: [],
            color: color || getRandomColor()
        });
        
        await playlist.save();
        
        res.json({
            success: true,
            playlist: {
                id: playlist._id,
                name: playlist.name,
                description: playlist.description,
                color: playlist.color
            }
        });
    } catch (error) {
        console.error('Create playlist error:', error);
        res.status(500).json({ error: 'Не вдалося створити плейлист' });
    }
});

// Отримати плейлисти
app.get('/api/playlists', auth, async (req, res) => {
    try {
        const playlists = await Playlist.find({ userId: req.userId });
        res.json(playlists);
    } catch (error) {
        console.error('Get playlists error:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Створити кімнату
app.post('/api/rooms', auth, async (req, res) => {
    try {
        const { name, password } = req.body;
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        const room = new Room({
            name,
            code,
            password,
            host: req.userId,
            members: [{ userId: req.userId, joinedAt: new Date() }],
            currentSong: null,
            isPlaying: false
        });
        
        await room.save();
        
        res.json({
            success: true,
            room: {
                id: room._id,
                name: room.name,
                code: room.code,
                host: room.host
            }
        });
    } catch (error) {
        console.error('Create room error:', error);
        res.status(500).json({ error: 'Не вдалося створити кімнату' });
    }
});

// Допоміжна функція для випадкового кольору
function getRandomColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#FFD166', '#06D6A0', '#118AB2', '#EF476F'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Запуск сервера
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущено на порті ${PORT}`);
    console.log(`🌐 CORS дозволено для: ${allowedOrigins.join(', ')}`);
});
