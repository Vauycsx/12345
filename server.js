const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Для Render.com статичні файли
app.use(express.static('public'));

// Підключення до MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://admin:password@cluster0.mongodb.net/harmony?retryWrites=true&w=majority', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Моделі MongoDB
const userSchema = new mongoose.Schema({
    secretCode: { type: String, required: true, unique: true },
    nickname: { type: String, default: 'Користувач' },
    avatar: { type: String, default: 'fas fa-user' },
    playlists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Playlist' }],
    createdAt: { type: Date, default: Date.now }
});

const songSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: String,
    artist: String,
    filename: String,
    originalName: String,
    duration: Number,
    size: Number,
    uploadDate: { type: Date, default: Date.now }
});

const playlistSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    description: String,
    songs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
    createdAt: { type: Date, default: Date.now }
});

const roomSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    name: String,
    password: String,
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    currentSong: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' },
    queue: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
    isPlaying: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Song = mongoose.model('Song', songSchema);
const Playlist = mongoose.model('Playlist', playlistSchema);
const Room = mongoose.model('Room', roomSchema);

// Налаштування multer для завантаження файлів
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /mp3|wav|ogg|m4a|flac/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Непідтримуваний тип файлу. Дозволені: MP3, WAV, OGG, M4A, FLAC'));
        }
    }
});

// Маршрути API

// Авторизація
app.post('/api/auth/login', async (req, res) => {
    try {
        const { secretCode } = req.body;
        
        if (!secretCode) {
            return res.status(400).json({ error: 'Секретний код обов\'язковий' });
        }

        let user = await User.findOne({ secretCode });
        
        if (!user) {
            user = new User({ 
                secretCode,
                nickname: `Користувач${Math.floor(Math.random() * 1000)}`,
                avatar: 'fas fa-user'
            });
            await user.save();
        }
        
        res.json({ 
            success: true, 
            user: {
                id: user._id,
                nickname: user.nickname,
                avatar: user.avatar
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Оновлення профілю
app.put('/api/user/:id', async (req, res) => {
    try {
        const { nickname, avatar } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { nickname, avatar },
            { new: true }
        );
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Завантаження пісні
app.post('/api/songs/upload', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не завантажено' });
        }

        const { userId, title, artist } = req.body;
        
        const song = new Song({
            userId,
            title: title || req.file.originalname.replace(/\.[^/.]+$/, ""),
            artist: artist || 'Невідомий виконавець',
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size
        });

        await song.save();
        res.json({ success: true, song });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Отримання пісень користувача
app.get('/api/songs/user/:userId', async (req, res) => {
    try {
        const songs = await Song.find({ userId: req.params.userId }).sort({ uploadDate: -1 });
        res.json(songs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Створення плейлиста
app.post('/api/playlists', async (req, res) => {
    try {
        const { userId, name, description } = req.body;
        
        const playlist = new Playlist({
            userId,
            name,
            description
        });

        await playlist.save();
        
        // Додаємо плейлист до користувача
        await User.findByIdAndUpdate(userId, {
            $push: { playlists: playlist._id }
        });

        res.json({ success: true, playlist });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Отримання плейлистів користувача
app.get('/api/playlists/user/:userId', async (req, res) => {
    try {
        const playlists = await Playlist.find({ userId: req.params.userId })
            .populate('songs')
            .sort({ createdAt: -1 });
        res.json(playlists);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Додавання пісні до плейлиста
app.post('/api/playlists/:playlistId/songs', async (req, res) => {
    try {
        const { songId } = req.body;
        
        const playlist = await Playlist.findByIdAndUpdate(
            req.params.playlistId,
            { $addToSet: { songs: songId } },
            { new: true }
        ).populate('songs');

        res.json({ success: true, playlist });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Створення кімнати
app.post('/api/rooms', async (req, res) => {
    try {
        const { name, password, hostId } = req.body;
        
        // Генеруємо унікальний код
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        const room = new Room({
            code,
            name,
            password,
            host: hostId,
            members: [hostId]
        });

        await room.save();
        res.json({ success: true, room });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Приєднання до кімнати
app.post('/api/rooms/join', async (req, res) => {
    try {
        const { code, password, userId } = req.body;
        
        const room = await Room.findOne({ code });
        
        if (!room) {
            return res.status(404).json({ error: 'Кімната не знайдена' });
        }

        if (room.password && room.password !== password) {
            return res.status(401).json({ error: 'Невірний код доступу' });
        }

        // Додаємо користувача до кімнати, якщо його ще немає
        if (!room.members.includes(userId)) {
            room.members.push(userId);
            await room.save();
        }

        res.json({ success: true, room });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Обслуговування аудіофайлів
app.get('/uploads/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    
    if (fs.existsSync(filePath)) {
        // Встановлюємо правильний Content-Type для потокового відтворення
        res.setHeader('Content-Type', 'audio/mpeg');
        res.sendFile(filePath);
    } else {
        res.status(404).json({ error: 'Файл не знайдений' });
    }
});

// Health check для Render.com
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

// Обробка всіх інших запитів - для SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});
