import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import ticketRoutes from './routes/ticketRoutes';

// Charger les variables d'environnement
dotenv.config();

// Étendre le type Request pour inclure une propriété `user`
declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

const app = express();
const PORT = process.env.PORT_TICKETS || 5000;

// Middleware pour parser le JSON - AVANT CORS
app.use(express.json());

// Configuration CORS - NOUVELLE CONFIG
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Servir les fichiers statiques du dossier uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Headers CORS - SIMPLIFIÉS avec types corrects
app.use((req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// Middleware utilisateur simulé (remplace par une authentification réelle si nécessaire)
const mockUserMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  req.user = { id: 'test-user-id' }; // Simule un utilisateur avec un ID fixe
  next();
};
app.use(mockUserMiddleware);

// Routes pour les tickets
app.use('/api/tickets', ticketRoutes);

// Route de test
app.get('/', (req: Request, res: Response): void => {
  res.send('🚀 Ticketing System API is running!');
});

// Connexion à MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ticket-system';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('[MongoDB] Connected to:', MONGO_URI);
    mongoose.connection.once('open', async () => {
      console.log('[MongoDB] Collections initialized.');
    });

    // Démarrer le serveur après une connexion réussie à MongoDB
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err: Error) => {
    console.error('[MongoDB] Connection error:', err.message);
    process.exit(1);
  });
