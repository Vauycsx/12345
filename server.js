const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://your-frontend-url.vercel.app'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
});
app.use('/api/', limiter);

// In-memory storage for fallback
const memoryStorage = {
  users: [
    {
      id: 1,
      nickname: "Принцеса",
      avatar: "fas fa-crown",
      secretCode: "1312",
      role: "admin",
      color: "#ffcfe1",
      createdAt: new Date()
    },
    {
      id: 2,
      nickname: "Гість",
      avatar: "fas fa-user",
      secretCode: "demo",
      role: "user",
      color: "#ffb6d0",
      createdAt: new Date()
    }
  ],
  songs: [
    {
      id: 1,
      title: "Інь-Ян",
      artist: "Arina Polishchuk",
      duration: "3:45",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      color: "#ffcfe1",
      demo: true,
      uploadedBy: 1,
      plays: 0
    },
    {
      id: 2,
      title: "Сонячна",
      artist: "Melovin",
      duration: "3:22",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      color: "#ffb6d0",
      demo: true,
      uploadedBy: 1,
      plays: 0
    },
    {
      id: 3,
      title: "Веснянка",
      artist: "Океан Ельзи",
      duration: "4:15",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
      color: "#ffa8d9",
      demo: true,
      uploadedBy: 1,
      plays: 0
    },
    {
      id: 4,
      title: "Місто Весни",
      artist: "СКАЙ",
      duration: "3:58",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
      color: "#ff9ac8",
      demo: true,
      uploadedBy: 1,
      plays: 0
    },
    {
      id: 5,
      title: "Ти і Я",
      artist: "The Hardkiss",
      duration: "4:32",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
      color: "#ff8cb7",
      demo: true,
      uploadedBy: 1,
      plays: 0
    }
  ],
  playlists: [
    {
      id: 1,
      name: "Улюблене",
      description: "Мої улюблені пісні",
      songs: [1, 2, 3],
      color: "#ffcfe1",
      created: Date.now(),
      userId: 1
    },
    {
      id: 2,
      name: "Для натхнення",
      description: "Пісні для натхнення",
      songs: [4, 5],
      color: "#ffb6d0",
      created: Date.now() - 86400000,
      userId: 1
    }
  ],
  rooms: [],
  nextUserId: 3,
  nextSongId: 6,
  nextPlaylistId: 3,
  nextRoomId: 1
};

// JWT Secret (use environment variable or default)
const JWT_SECRET = process.env.JWT_SECRET || 'harmony-secret-key-2025-princess-edition';

// Authentication middleware
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Необхідна авторизація' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Недійсний токен' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Термін дії токена закінчився' });
    }
    return res.status(500).json({ error: 'Помилка авторизації' });
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '1.0.0'
  });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { secretCode } = req.body;
    
    if (!secretCode) {
      return res.status(400).json({ error: 'Секретний код обов\'язковий' });
    }
    
    // Find user by secret code
    const user = memoryStorage.users.find(u => u.secretCode === secretCode);
    
    if (!user) {
      return res.status(401).json({ error: 'Невірний секретний код' });
    }
    
    // Create JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role,
        color: user.color
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    // Prepare user data without secret code
    const userData = {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      role: user.role,
      color: user.color,
      createdAt: user.createdAt
    };
    
    res.json({
      success: true,
      token,
      user: userData
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Get profile endpoint
app.get('/api/profile', authMiddleware, (req, res) => {
  try {
    const user = memoryStorage.users.find(u => u.id === req.user.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Користувача не знайдено' });
    }
    
    const userData = {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      role: user.role,
      color: user.color,
      createdAt: user.createdAt
    };
    
    res.json(userData);
    
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Update profile endpoint
app.put('/api/profile', authMiddleware, (req, res) => {
  try {
    const { nickname, avatar, color } = req.body;
    const userIndex = memoryStorage.users.findIndex(u => u.id === req.user.userId);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'Користувача не знайдено' });
    }
    
    // Update user
    if (nickname) memoryStorage.users[userIndex].nickname = nickname;
    if (avatar) memoryStorage.users[userIndex].avatar = avatar;
    if (color) memoryStorage.users[userIndex].color = color;
    
    const updatedUser = memoryStorage.users[userIndex];
    
    // Create new token with updated info
    const token = jwt.sign(
      {
        userId: updatedUser.id,
        nickname: updatedUser.nickname,
        avatar: updatedUser.avatar,
        role: updatedUser.role,
        color: updatedUser.color
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        id: updatedUser.id,
        nickname: updatedUser.nickname,
        avatar: updatedUser.avatar,
        role: updatedUser.role,
        color: updatedUser.color,
        createdAt: updatedUser.createdAt
      }
    });
    
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Get demo songs endpoint
app.get('/api/demo-songs', (req, res) => {
  try {
    const demoSongs = memoryStorage.songs.filter(song => song.demo);
    
    // Format songs for frontend
    const formattedSongs = demoSongs.map(song => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      duration: song.duration,
      url: song.url,
      color: song.color,
      demo: true
    }));
    
    res.json(formattedSongs);
    
  } catch (error) {
    console.error('Demo songs error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Get all songs endpoint
app.get('/api/songs', (req, res) => {
  try {
    const songs = memoryStorage.songs.map(song => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      duration: song.duration,
      url: song.url,
      color: song.color,
      demo: song.demo || false,
      plays: song.plays || 0
    }));
    
    res.json(songs);
    
  } catch (error) {
    console.error('Get songs error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Upload song endpoint
app.post('/api/songs/upload', authMiddleware, (req, res) => {
  try {
    const { title, artist, duration, url, color = '#ffcfe1' } = req.body;
    
    if (!title || !artist || !duration) {
      return res.status(400).json({ error: 'Назва, виконавець та тривалість обов\'язкові' });
    }
    
    // Generate new song ID
    const songId = memoryStorage.nextSongId++;
    
    const newSong = {
      id: songId,
      title,
      artist,
      duration,
      url: url || `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${songId}.mp3`,
      color,
      demo: false,
      uploadedBy: req.user.userId,
      plays: 0,
      uploadedAt: new Date()
    };
    
    memoryStorage.songs.push(newSong);
    
    res.status(201).json({
      success: true,
      song: {
        id: newSong.id,
        title: newSong.title,
        artist: newSong.artist,
        duration: newSong.duration,
        url: newSong.url,
        color: newSong.color,
        demo: false
      }
    });
    
  } catch (error) {
    console.error('Upload song error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Get playlists endpoint
app.get('/api/playlists', authMiddleware, (req, res) => {
  try {
    const userPlaylists = memoryStorage.playlists.filter(
      playlist => playlist.userId === req.user.userId
    );
    
    // Add song count
    const playlistsWithCount = userPlaylists.map(playlist => ({
      ...playlist,
      songCount: playlist.songs ? playlist.songs.length : 0
    }));
    
    res.json(playlistsWithCount);
    
  } catch (error) {
    console.error('Get playlists error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Create playlist endpoint
app.post('/api/playlists', authMiddleware, (req, res) => {
  try {
    const { name, description = '', color = '#ffcfe1' } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Назва плейлиста обов\'язкова' });
    }
    
    const playlistId = memoryStorage.nextPlaylistId++;
    
    const newPlaylist = {
      id: playlistId,
      name,
      description,
      songs: [],
      color,
      created: Date.now(),
      userId: req.user.userId
    };
    
    memoryStorage.playlists.push(newPlaylist);
    
    res.status(201).json({
      success: true,
      playlist: {
        id: newPlaylist.id,
        name: newPlaylist.name,
        description: newPlaylist.description,
        songs: newPlaylist.songs,
        color: newPlaylist.color,
        created: newPlaylist.created
      }
    });
    
  } catch (error) {
    console.error('Create playlist error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Update playlist endpoint
app.put('/api/playlists/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color } = req.body;
    
    const playlistIndex = memoryStorage.playlists.findIndex(
      p => p.id === parseInt(id) && p.userId === req.user.userId
    );
    
    if (playlistIndex === -1) {
      return res.status(404).json({ error: 'Плейлист не знайдено' });
    }
    
    // Update fields
    if (name) memoryStorage.playlists[playlistIndex].name = name;
    if (description !== undefined) memoryStorage.playlists[playlistIndex].description = description;
    if (color) memoryStorage.playlists[playlistIndex].color = color;
    
    res.json({
      success: true,
      playlist: memoryStorage.playlists[playlistIndex]
    });
    
  } catch (error) {
    console.error('Update playlist error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Delete playlist endpoint
app.delete('/api/playlists/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    
    const playlistIndex = memoryStorage.playlists.findIndex(
      p => p.id === parseInt(id) && p.userId === req.user.userId
    );
    
    if (playlistIndex === -1) {
      return res.status(404).json({ error: 'Плейлист не знайдено' });
    }
    
    memoryStorage.playlists.splice(playlistIndex, 1);
    
    res.json({
      success: true,
      message: 'Плейлист видалено'
    });
    
  } catch (error) {
    console.error('Delete playlist error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Add song to playlist endpoint
app.post('/api/playlists/:id/songs', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { songId } = req.body;
    
    if (!songId) {
      return res.status(400).json({ error: 'ID пісні обов\'язковий' });
    }
    
    const playlistIndex = memoryStorage.playlists.findIndex(
      p => p.id === parseInt(id) && p.userId === req.user.userId
    );
    
    if (playlistIndex === -1) {
      return res.status(404).json({ error: 'Плейлист не знайдено' });
    }
    
    // Check if song exists
    const songExists = memoryStorage.songs.some(s => s.id === parseInt(songId));
    if (!songExists) {
      return res.status(404).json({ error: 'Пісню не знайдено' });
    }
    
    // Check if song already in playlist
    if (!memoryStorage.playlists[playlistIndex].songs) {
      memoryStorage.playlists[playlistIndex].songs = [];
    }
    
    if (memoryStorage.playlists[playlistIndex].songs.includes(parseInt(songId))) {
      return res.status(400).json({ error: 'Пісня вже є в плейлисті' });
    }
    
    memoryStorage.playlists[playlistIndex].songs.push(parseInt(songId));
    
    res.json({
      success: true,
      playlist: memoryStorage.playlists[playlistIndex]
    });
    
  } catch (error) {
    console.error('Add song to playlist error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Remove song from playlist endpoint
app.delete('/api/playlists/:id/songs/:songId', authMiddleware, (req, res) => {
  try {
    const { id, songId } = req.params;
    
    const playlistIndex = memoryStorage.playlists.findIndex(
      p => p.id === parseInt(id) && p.userId === req.user.userId
    );
    
    if (playlistIndex === -1) {
      return res.status(404).json({ error: 'Плейлист не знайдено' });
    }
    
    const songIndex = memoryStorage.playlists[playlistIndex].songs.indexOf(parseInt(songId));
    
    if (songIndex === -1) {
      return res.status(404).json({ error: 'Пісню не знайдено в плейлисті' });
    }
    
    memoryStorage.playlists[playlistIndex].songs.splice(songIndex, 1);
    
    res.json({
      success: true,
      message: 'Пісню видалено з плейлиста'
    });
    
  } catch (error) {
    console.error('Remove song from playlist error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Create room endpoint
app.post('/api/rooms', authMiddleware, (req, res) => {
  try {
    const { name, password = '' } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Назва кімнати обов\'язкова' });
    }
    
    const roomId = memoryStorage.nextRoomId++;
    
    // Generate room code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const newRoom = {
      id: roomId,
      name,
      code,
      password,
      host: req.user.userId,
      hostName: req.user.nickname,
      members: [req.user.userId],
      createdAt: new Date(),
      currentSong: null,
      queue: []
    };
    
    memoryStorage.rooms.push(newRoom);
    
    res.status(201).json({
      success: true,
      room: {
        id: newRoom.id,
        name: newRoom.name,
        code: newRoom.code,
        host: newRoom.hostName,
        memberCount: 1
      }
    });
    
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Join room endpoint
app.post('/api/rooms/join', authMiddleware, (req, res) => {
  try {
    const { code, password = '' } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Код кімнати обов\'язковий' });
    }
    
    const roomIndex = memoryStorage.rooms.findIndex(r => r.code === code);
    
    if (roomIndex === -1) {
      return res.status(404).json({ error: 'Кімнату не знайдено' });
    }
    
    // Check password
    if (memoryStorage.rooms[roomIndex].password && memoryStorage.rooms[roomIndex].password !== password) {
      return res.status(403).json({ error: 'Невірний пароль кімнати' });
    }
    
    // Check if user already in room
    if (!memoryStorage.rooms[roomIndex].members.includes(req.user.userId)) {
      memoryStorage.rooms[roomIndex].members.push(req.user.userId);
    }
    
    res.json({
      success: true,
      room: {
        id: memoryStorage.rooms[roomIndex].id,
        name: memoryStorage.rooms[roomIndex].name,
        code: memoryStorage.rooms[roomIndex].code,
        host: memoryStorage.rooms[roomIndex].hostName,
        memberCount: memoryStorage.rooms[roomIndex].members.length
      }
    });
    
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Get room info endpoint
app.get('/api/rooms/:code', authMiddleware, (req, res) => {
  try {
    const { code } = req.params;
    
    const room = memoryStorage.rooms.find(r => r.code === code);
    
    if (!room) {
      return res.status(404).json({ error: 'Кімнату не знайдено' });
    }
    
    // Get user info for members
    const members = room.members.map(memberId => {
      const user = memoryStorage.users.find(u => u.id === memberId);
      return {
        id: user.id,
        name: user.nickname,
        avatar: user.avatar,
        color: user.color
      };
    });
    
    res.json({
      success: true,
      room: {
        id: room.id,
        name: room.name,
        code: room.code,
        host: room.hostName,
        members,
        memberCount: members.length,
        currentSong: room.currentSong,
        queue: room.queue || []
      }
    });
    
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Register user endpoint (admin only)
app.post('/api/register', (req, res) => {
  try {
    const { nickname, secretCode, avatar = 'fas fa-user', color = '#ffcfe1', role = 'user' } = req.body;
    
    if (!nickname || !secretCode) {
      return res.status(400).json({ error: 'Нікнейм та секретний код обов\'язкові' });
    }
    
    // Check if user already exists
    const existingUser = memoryStorage.users.find(u => u.nickname === nickname || u.secretCode === secretCode);
    if (existingUser) {
      return res.status(400).json({ error: 'Користувач з таким нікнеймом або кодом вже існує' });
    }
    
    const userId = memoryStorage.nextUserId++;
    
    const newUser = {
      id: userId,
      nickname,
      avatar,
      secretCode,
      role,
      color,
      createdAt: new Date()
    };
    
    memoryStorage.users.push(newUser);
    
    // Create token for new user
    const token = jwt.sign(
      {
        userId: newUser.id,
        nickname: newUser.nickname,
        avatar: newUser.avatar,
        role: newUser.role,
        color: newUser.color
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser.id,
        nickname: newUser.nickname,
        avatar: newUser.avatar,
        role: newUser.role,
        color: newUser.color,
        createdAt: newUser.createdAt
      }
    });
    
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Get server stats endpoint
app.get('/api/stats', (req, res) => {
  try {
    const stats = {
      users: memoryStorage.users.length,
      songs: memoryStorage.songs.length,
      playlists: memoryStorage.playlists.length,
      rooms: memoryStorage.rooms.length,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
    
    res.json(stats);
    
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Reset data endpoint (for development only)
app.post('/api/reset', (req, res) => {
  try {
    const { secret } = req.query;
    
    // Only allow reset with secret key in development
    if (process.env.NODE_ENV !== 'development' && secret !== 'harmony-reset-2025') {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }
    
    // Reset to initial state
    memoryStorage.users = [
      {
        id: 1,
        nickname: "Принцеса",
        avatar: "fas fa-crown",
        secretCode: "1312",
        role: "admin",
        color: "#ffcfe1",
        createdAt: new Date()
      },
      {
        id: 2,
        nickname: "Гість",
        avatar: "fas fa-user",
        secretCode: "demo",
        role: "user",
        color: "#ffb6d0",
        createdAt: new Date()
      }
    ];
    
    memoryStorage.songs = [
      {
        id: 1,
        title: "Інь-Ян",
        artist: "Arina Polishchuk",
        duration: "3:45",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        color: "#ffcfe1",
        demo: true,
        uploadedBy: 1,
        plays: 0
      },
      {
        id: 2,
        title: "Сонячна",
        artist: "Melovin",
        duration: "3:22",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
        color: "#ffb6d0",
        demo: true,
        uploadedBy: 1,
        plays: 0
      },
      {
        id: 3,
        title: "Веснянка",
        artist: "Океан Ельзи",
        duration: "4:15",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
        color: "#ffa8d9",
        demo: true,
        uploadedBy: 1,
        plays: 0
      },
      {
        id: 4,
        title: "Місто Весни",
        artist: "СКАЙ",
        duration: "3:58",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
        color: "#ff9ac8",
        demo: true,
        uploadedBy: 1,
        plays: 0
      },
      {
        id: 5,
        title: "Ти і Я",
        artist: "The Hardkiss",
        duration: "4:32",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
        color: "#ff8cb7",
        demo: true,
        uploadedBy: 1,
        plays: 0
      }
    ];
    
    memoryStorage.playlists = [
      {
        id: 1,
        name: "Улюблене",
        description: "Мої улюблені пісні",
        songs: [1, 2, 3],
        color: "#ffcfe1",
        created: Date.now(),
        userId: 1
      },
      {
        id: 2,
        name: "Для натхнення",
        description: "Пісні для натхнення",
        songs: [4, 5],
        color: "#ffb6d0",
        created: Date.now() - 86400000,
        userId: 1
      }
    ];
    
    memoryStorage.rooms = [];
    memoryStorage.nextUserId = 3;
    memoryStorage.nextSongId = 6;
    memoryStorage.nextPlaylistId = 3;
    memoryStorage.nextRoomId = 1;
    
    res.json({
      success: true,
      message: 'Дані успішно скинуті до початкового стану'
    });
    
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ 
    error: 'Внутрішня помилка сервера',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Маршрут не знайдено' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Harmony Backend запущено на порті ${PORT}`);
  console.log(`🔗 API доступне за адресою: http://localhost:${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Demo user: Принцеса (код: 1312), Гість (код: demo)`);
  console.log(`💾 Memory storage: ${memoryStorage.users.length} users, ${memoryStorage.songs.length} songs`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed. Process terminated.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed. Process terminated.');
    process.exit(0);
  });
});

// Export for testing
module.exports = { app, memoryStorage };
