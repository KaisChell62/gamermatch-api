import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.routes';
import friendRoutes from './routes/friends.routes';

// Charger les variables d'environnement
dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
  }
});

const PORT = process.env.PORT_AUTH || 4001;

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Rendre l'instance Socket.IO accessible aux routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/friends', friendRoutes);

// Route de test
app.get('/health', (_, res) => {
  res.json({ status: 'ok' });
});

// Socket.IO connection handling (basic example, can be expanded)
io.on('connection', (socket) => {
  console.log('👋 Client connected to Auth Server');

  // Gérer l'événement joinRoom
  socket.on('joinRoom', (userId) => {
    console.log(`👤 User ${userId} joining room`);
    socket.join(userId);
    console.log(`✅ User ${userId} joined their room`);
  });

  socket.on('disconnect', () => {
    console.log('👋 Client disconnected from Auth Server');
  });

  // Vous pouvez ajouter ici des événements spécifiques pour l'authentification si nécessaire
});

// Connexion MongoDB et démarrage du serveur
mongoose.connect(process.env.MONGO_URI!)
  .then(() => {
    console.log('📦 Connexion MongoDB établie');
    httpServer.listen(PORT, () => {
      console.log(`🔐 Serveur d'authentification démarré sur le port ${PORT}`);
      console.log('Routes disponibles :');
      console.log('- GET /api/friends');
      console.log('- GET /api/friends/pending');
      console.log('- GET /api/friends/sent');
      console.log('- GET /api/friends/search');
      console.log('- POST /api/friends/request/send/:userId');
      console.log('- POST /api/friends/request/accept/:requestId');
      console.log('- POST /api/friends/request/reject/:requestId');
      console.log('- POST /api/friends/request/cancel/:requestId');
      console.log('- DELETE /api/friends/:friendId');
    });
  })
  .catch((err) => {
    console.error('❌ Erreur de connexion MongoDB:', err);
    process.exit(1);
  }); 