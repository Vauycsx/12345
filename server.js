const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
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

// Socket.io з підтримкою 2025
const io = socketIo(server, {
    cors: corsOptions,
    transports: ['websocket', 'polling']
});

async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://gejmgejm989_db_user:K2NPh3GeZwvRRl7I@harmony.aquqway.mongodb.net/?appName=harmony', {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log('✅ MongoDB connected successfully');
        
        // Перевірка підключення
        mongoose.connection.on('error', err => {
            console.error('❌ MongoDB connection error:', err);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.log('⚠️ MongoDB disconnected');
        });
        
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            console.log('👋 MongoDB connection closed through app termination');
            process.exit(0);
        });
        
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        process.exit(1);
    }
}

// Виклик функції підключення
connectDB();
// Моделі
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
    data: String, // base64
    color: String,
    demo: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const Playlist = mongoose.model('Playlist', {
    userId: String,
    name: String,
    description: String,
    songs: [String], // IDs пісень
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

// Секретні коди
const SECRET_CODES = {
    "HX-3107-0104-15": {
        nickname: "Принцеса",
        avatar: "fas fa-crown",
        role: "special",
        color: "#ffcfe1"
    },
    "HX-0104-3107-15": {
        nickname: "Макс",
        avatar: "fas fa-star",
        role: "admin",
        color: "#ffb6d0"
    };
// Middleware для перевірки токена
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

// ==================== API ENDPOINTS ====================

// 1. Логін
app.post('/api/login', async (req, res) => {
    try {
        const { secretCode } = req.body;
        
        if (!secretCode) {
            return res.status(400).json({ error: 'Секретний код обов\'язковий' });
        }
        
        const userData = SECRET_CODES[secretCode];
        if (!userData) {
            return res.status(401).json({ error: 'Невірний секретний код' });
        }
        
        // Перевіряємо чи є користувач в базі
        let user = await User.findOne({ secretCode });
        if (!user) {
            user = new User({
                nickname: userData.nickname,
                secretCode,
                avatar: userData.avatar,
                color: userData.color,
                role: userData.role
            });
            await user.save();
        }
        
        // Створюємо JWT токен
        const token = jwt.sign(
            { userId: user._id, nickname: user.nickname },
            process.env.JWT_SECRET || 'harmony-2025-secret',
            { expiresIn: '30d' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                nickname: user.nickname,
                avatar: user.avatar,
                color: user.color,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
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
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// 3. Оновити профіль
app.put('/api/profile', auth, async (req, res) => {
    try {
        const { nickname, avatar, color } = req.body;
        
        await User.findByIdAndUpdate(req.userId, {
            nickname,
            avatar,
            color
        });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// 4. Завантажити пісню
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
                data: song.data,
                color: song.color
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Не вдалося завантажити пісню' });
    }
});

// 5. Отримати пісні користувача
app.get('/api/songs', auth, async (req, res) => {
    try {
        const songs = await Song.find({ userId: req.userId });
        res.json(songs);
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// 6. Видалити пісню
app.delete('/api/songs/:id', auth, async (req, res) => {
    try {
        await Song.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        res.json({ success: true });
    } catch (error) {
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
        res.status(500).json({ error: 'Не вдалося створити плейлист' });
    }
});

// 8. Отримати плейлисти
app.get('/api/playlists', auth, async (req, res) => {
    try {
        const playlists = await Playlist.find({ userId: req.userId });
        res.json(playlists);
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// 9. Оновити плейлист
app.put('/api/playlists/:id', auth, async (req, res) => {
    try {
        const { name, description, songs } = req.body;
        
        await Playlist.findOneAndUpdate(
            { _id: req.params.id, userId: req.userId },
            { name, description, songs }
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// 10. Видалити плейлист
app.delete('/api/playlists/:id', auth, async (req, res) => {
    try {
        await Playlist.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// 11. Створити кімнату
app.post('/api/rooms', auth, async (req, res) => {
    try {
        const { name, password } = req.body;
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        const room = new Room({
            name,
            code,
            password,
            host: req.userId,
            members: [],
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
        res.status(500).json({ error: 'Не вдалося створити кімнату' });
    }
});

// 12. Приєднатися до кімнати
app.post('/api/rooms/join', auth, async (req, res) => {
    try {
        const { code, password } = req.body;
        
        const room = await Room.findOne({ code });
        if (!room) {
            return res.status(404).json({ error: 'Кімнату не знайдено' });
        }
        
        if (room.password && room.password !== password) {
            return res.status(401).json({ error: 'Невірний пароль' });
        }
        
        // Отримуємо інформацію про користувача
        const user = await User.findById(req.userId);
        
        // Додаємо користувача до кімнати
        const member = {
            id: user._id,
            name: user.nickname,
            avatar: user.avatar,
            color: user.color
        };
        
        if (!room.members.some(m => m.id === user._id.toString())) {
            room.members.push(member);
            await room.save();
        }
        
        res.json({
            success: true,
            room: {
                id: room._id,
                name: room.name,
                code: room.code,
                members: room.members
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Не вдалося приєднатися до кімнати' });
    }
});
// 14. Health check для Render
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Harmony Backend API',
        version: '2025.1.0'
    });
});

// 15. Отримати всіх користувачів (для адмінів)
app.get('/api/users', auth, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Доступ заборонено' });
        }
        
        const users = await User.find({}, { secretCode: 0 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Socket.io події
io.on('connection', (socket) => {
    console.log('🔌 Нове підключення:', socket.id);
    
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`👥 ${socket.id} приєднався до кімнати ${roomId}`);
    });
    
    socket.on('leave-room', (roomId) => {
        socket.leave(roomId);
        console.log(`👋 ${socket.id} покинув кімнату ${roomId}`);
    });
    
    socket.on('play-song', (data) => {
        const { roomId, song, time } = data;
        socket.to(roomId).emit('song-playing', { song, time });
    });
    
    socket.on('pause-song', (data) => {
        const { roomId, time } = data;
        socket.to(roomId).emit('song-paused', { time });
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Відключення:', socket.id);
    });
});

// Допоміжні функції
function getRandomColor() {
    const colors = ['#ffcfe1', '#ffb6d0', '#ffa8d9', '#ff9ac8', '#ff8cb7', '#ff7ea6'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Обробка помилок
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
});

app.get("/", (req, res) => {
    res.json({
        message: "Harmony Backend is running",
        api: true,
        health: "/health"
    });
});

// Обробка неіснуючих маршрутів
app.use((req, res) => {
    res.status(404).json({ error: 'Маршрут не знайдено' });
});

// Старт сервера
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Harmony Backend запущено на порті ${PORT}`);
    console.log(`🔗 API: http://localhost:${PORT}`);
    console.log(`📡 WebSocket: ws://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);

});

