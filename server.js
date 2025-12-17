const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Налаштування CORS для 2025
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Додаткові CORS заголовки
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
});

// Socket.io з підтримкою 2025
const io = socketIo(server, {
    cors: corsOptions,
    transports: ['websocket', 'polling']
});

// ============ ПОЛІПШЕНЕ ПІДКЛЮЧЕННЯ MONGODB ДЛЯ 2025 ============
async function connectDB() {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/harmony';
        console.log('🔗 Підключення до MongoDB...');
        
        await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            minPoolSize: 2
        });
        
        console.log('✅ MongoDB успішно підключено');
        
        // Обробники подій для стабільного з'єднання
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
        
        // Обробка завершення процесу
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

// Запускаємо підключення до БД
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
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'harmony-2025-secret');
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

// 2. Отримати профіль
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

// 3. Health check для Render
app.get('/health', (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Harmony Backend API 2025',
        version: '2025.1.1',
        database: dbStatus,
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});
// 5. Завантажити пісню
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

// 6. Отримати пісні користувача
app.get('/api/songs', auth, async (req, res) => {
    try {
        const songs = await Song.find({ userId: req.userId });
        res.json(songs);
    } catch (error) {
        console.error('Get songs error:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// 7. Створити плейлист
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

// 8. Отримати плейлисти
app.get('/api/playlists', auth, async (req, res) => {
    try {
        const playlists = await Playlist.find({ userId: req.userId });
        res.json(playlists);
    } catch (error) {
        console.error('Get playlists error:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// 9. Створити кімнату
app.post('/api/rooms', auth, async (req, res) => {
    try {
        const { name, password } = req.body;
        const code = Math.random().toString(36
