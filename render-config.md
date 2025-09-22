# Configuration Render pour GamerMatch Backend

## Variables d'environnement à configurer sur Render :

### Server Configuration
- `NODE_ENV` = `production`
- `PORT` = `10000`

### Database
- `MONGODB_URI` = `mongodb+srv://username:password@cluster.mongodb.net/gamermatch?retryWrites=true&w=majority`

### JWT Configuration
- `JWT_SECRET` = `your-super-secret-jwt-key-here` (généré automatiquement par Render)

### CORS Configuration
- `CORS_ORIGIN` = `https://gamermatch-frontend.onrender.com`

### File Upload
- `MAX_FILE_SIZE` = `10485760`
- `UPLOAD_PATH` = `./uploads`

### Socket.IO
- `SOCKET_PORT` = `10001`

## Instructions de déploiement :

1. Connecter le repository GitHub
2. Sélectionner le dossier `Back` comme racine
3. Configurer les variables d'environnement ci-dessus
4. Le build se fera automatiquement avec `npm install && npm run build`
5. Le démarrage se fera avec `npm start`
