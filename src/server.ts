import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import messageRoutes from './routes/messages';
import authRoutes from './routes/auth.routes';
import { auth } from './middleware/auth';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Configuration CORS pour production
const allowedOrigins = [
  'http://localhost:5173', // Vite dev
  'http://localhost:3000', // HTTP server
  'http://localhost:3001', // Alternative port
  'https://gamermatch-desktop.netlify.app', // Si vous déployez le frontend
];

const corsOptions = {
  origin: (origin, callback) => {
    // Autoriser les requêtes sans origine (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Vérifier si c'est une origine de développement local
    if (origin && origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
};

const io = new Server(httpServer, {
  cors: corsOptions,
});

// ✅ Exposer io à Express pour l'utiliser dans les controllers (markMessageRead)
app.set('io', io);

// Middleware CORS + JSON
app.use(
  cors(corsOptions)
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configuration Multer pour les uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB par défaut
  },
  fileFilter: (req, file, cb) => {
    // Accepter tous les types de fichiers pour le moment
    cb(null, true);
  }
});

// Connexion MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gamermatch';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connecté à MongoDB');
  })
  .catch((error) => {
    console.error('❌ Erreur de connexion MongoDB:', error);
    process.exit(1);
  });

// Route de santé pour Render
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'GamerMatch Backend is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Routes
app.use('/api/messages', messageRoutes);
app.use('/api/auth', authRoutes);

// Route d'upload de fichiers
app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  try {
    console.log('📁 Upload request received');
    console.log('📁 File:', req.file);

    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    
    res.json({
      success: true,
      message: 'Fichier uploadé avec succès',
      file: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        url: fileUrl
      }
    });
  } catch (error) {
    console.error('❌ Erreur upload:', error);
    res.status(500).json({ error: 'Erreur lors de l\'upload' });
  }
});

// Servir les fichiers statiques
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Gestion des erreurs 404
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route non trouvée',
    path: req.originalUrl,
    method: req.method
  });
});

// Gestion des erreurs globales
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Erreur globale:', error);
  res.status(500).json({
    error: 'Erreur interne du serveur',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Une erreur est survenue'
  });
});

// Socket.IO events
io.on('connection', (socket) => {
  console.log('🔌 Nouveau client connecté:', socket.id);

  // Rejoindre une room pour un utilisateur spécifique
  socket.on('join:user', (userId: string) => {
    socket.join(`user:${userId}`);
    console.log(`👤 Utilisateur ${userId} a rejoint sa room`);
  });

  // Rejoindre une room pour une conversation
  socket.on('join:conversation', (conversationId: string) => {
    socket.join(`conversation:${conversationId}`);
    console.log(`💬 Socket ${socket.id} a rejoint la conversation ${conversationId}`);
  });

  // Quitter une conversation
  socket.on('leave:conversation', (conversationId: string) => {
    socket.leave(`conversation:${conversationId}`);
    console.log(`💬 Socket ${socket.id} a quitté la conversation ${conversationId}`);
  });

  // Gestion des messages
  socket.on('message:send', (data) => {
    console.log('📨 Message reçu:', data);
    // Diffuser le message à tous les clients de la conversation
    socket.to(`conversation:${data.conversationId}`).emit('message:received', data);
  });

  // Gestion des appels
  socket.on('call:start', (data) => {
    console.log('📞 Appel démarré:', data);
    socket.to(`user:${data.to}`).emit('call:incoming', data);
  });

  socket.on('call:accept', (data) => {
    console.log('📞 Appel accepté:', data);
    socket.to(`user:${data.to}`).emit('call:accepted', data);
  });

  socket.on('call:reject', (data) => {
    console.log('📞 Appel rejeté:', data);
    socket.to(`user:${data.to}`).emit('call:rejected', data);
  });

  socket.on('call:end', (data) => {
    console.log('📞 Appel terminé:', data);
    socket.to(`user:${data.to}`).emit('call:ended', data);
  });

  // Gestion du typing
  socket.on('typing:start', (data) => {
    socket.to(`conversation:${data.conversationId}`).emit('typing:start', data);
  });

  socket.on('typing:stop', (data) => {
    socket.to(`conversation:${data.conversationId}`).emit('typing:stop', data);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client déconnecté:', socket.id);
  });
});

// Démarrage du serveur
const PORT = process.env.PORT || 10000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 CORS Origin: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
});