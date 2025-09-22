# GamerMatch Backend

Backend API pour la plateforme de messagerie et social gaming GamerMatch.

## 🚀 Déploiement sur Render

### Prérequis
- Compte Render
- Repository GitHub avec le code
- Base de données MongoDB (MongoDB Atlas recommandé)

### Configuration des variables d'environnement

Sur Render, configurez les variables suivantes :

```env
NODE_ENV=production
PORT=10000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/gamermatch
JWT_SECRET=your-super-secret-jwt-key-here
CORS_ORIGIN=https://gamermatch-frontend.onrender.com
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads
```

### Instructions de déploiement

1. **Connecter le repository** : Liez votre repository GitHub à Render
2. **Sélectionner le dossier** : Choisissez le dossier `Back` comme racine du projet
3. **Configuration** :
   - **Build Command** : `npm install && npm run build`
   - **Start Command** : `npm start`
   - **Node Version** : 18.x ou supérieur
4. **Variables d'environnement** : Configurez toutes les variables listées ci-dessus
5. **Déployer** : Lancez le déploiement

### Endpoints principaux

- `GET /api/health` - Vérification de santé du serveur
- `POST /api/upload` - Upload de fichiers
- `GET /api/messages/*` - Routes de messagerie
- WebSocket sur le même port pour les communications temps réel

### Structure du projet

```
Back/
├── src/
│   ├── controllers/     # Contrôleurs API
│   ├── middleware/      # Middleware d'authentification
│   ├── models/          # Modèles MongoDB
│   ├── routes/          # Routes Express
│   └── server.ts        # Point d'entrée principal
├── uploads/             # Fichiers uploadés
├── package.json         # Dépendances et scripts
├── tsconfig.json        # Configuration TypeScript
└── render.yaml          # Configuration Render
```

### Scripts disponibles

- `npm start` - Démarrage en production
- `npm run build` - Compilation TypeScript
- `npm run dev` - Développement local
- `npm run messages` - Serveur de messages uniquement

### Support

Pour toute question ou problème, consultez la documentation Render ou contactez l'équipe de développement.
