# ✅ Checklist de déploiement Render - GamerMatch Backend

## 📋 Avant le déploiement

### 1. Configuration du repository
- [ ] Code pushé sur GitHub
- [ ] Dossier `Back/` est la racine du projet
- [ ] Tous les fichiers sont présents

### 2. Base de données
- [ ] MongoDB Atlas configuré
- [ ] URI de connexion obtenue
- [ ] Base de données `gamermatch` créée
- [ ] Utilisateur avec permissions créé

### 3. Variables d'environnement sur Render
- [ ] `NODE_ENV` = `production`
- [ ] `PORT` = `10000`
- [ ] `MONGODB_URI` = `mongodb+srv://...`
- [ ] `JWT_SECRET` = `votre-clé-secrète`
- [ ] `CORS_ORIGIN` = `https://votre-frontend.onrender.com`
- [ ] `MAX_FILE_SIZE` = `10485760`
- [ ] `UPLOAD_PATH` = `./uploads`

## 🚀 Déploiement

### 1. Configuration Render
- [ ] Service Web créé
- [ ] Repository GitHub connecté
- [ ] Dossier racine : `Back/`
- [ ] Build Command : `npm install && npm run build`
- [ ] Start Command : `npm start`
- [ ] Node Version : 18.x ou supérieur

### 2. Variables d'environnement
- [ ] Toutes les variables configurées
- [ ] Valeurs testées localement
- [ ] Pas de caractères spéciaux dans les valeurs

### 3. Déploiement
- [ ] Build réussi
- [ ] Service démarré
- [ ] Health check OK (`/api/health`)
- [ ] Logs sans erreurs

## 🔍 Tests post-déploiement

### 1. Endpoints de base
- [ ] `GET /api/health` retourne 200
- [ ] Service accessible via l'URL Render

### 2. Base de données
- [ ] Connexion MongoDB établie
- [ ] Collections créées automatiquement

### 3. WebSocket
- [ ] Connexion WebSocket fonctionne
- [ ] Messages temps réel opérationnels

### 4. Upload de fichiers
- [ ] Endpoint `/api/upload` fonctionne
- [ ] Fichiers sauvegardés correctement

## 🐛 Résolution de problèmes

### Erreurs communes
1. **Build failed** : Vérifier les dépendances dans package.json
2. **Database connection failed** : Vérifier MONGODB_URI
3. **CORS errors** : Vérifier CORS_ORIGIN
4. **Port already in use** : Vérifier la variable PORT

### Logs utiles
- Logs de build : Vérifier la compilation TypeScript
- Logs runtime : Vérifier les erreurs d'exécution
- Logs de base de données : Vérifier la connexion MongoDB

## 📞 Support

En cas de problème :
1. Vérifier les logs Render
2. Tester les endpoints individuellement
3. Vérifier les variables d'environnement
4. Consulter la documentation Render

---

**✅ Une fois tous les éléments cochés, votre backend GamerMatch sera opérationnel sur Render !**
