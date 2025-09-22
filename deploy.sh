#!/bin/bash

# Script de déploiement pour Render
echo "🚀 Démarrage du déploiement GamerMatch Backend..."

# Vérifier que nous sommes dans le bon répertoire
if [ ! -f "package.json" ]; then
    echo "❌ Erreur: package.json non trouvé. Assurez-vous d'être dans le dossier Back/"
    exit 1
fi

# Installer les dépendances
echo "📦 Installation des dépendances..."
npm install

# Compiler TypeScript
echo "🔨 Compilation TypeScript..."
npm run build

# Vérifier que la compilation a réussi
if [ ! -d "dist" ]; then
    echo "❌ Erreur: La compilation a échoué. Le dossier dist/ n'existe pas."
    exit 1
fi

echo "✅ Compilation réussie!"

# Vérifier les variables d'environnement
echo "🔍 Vérification des variables d'environnement..."
required_vars=("MONGODB_URI" "JWT_SECRET" "CORS_ORIGIN")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "⚠️  Attention: La variable $var n'est pas définie"
    else
        echo "✅ $var est définie"
    fi
done

echo "🎉 Déploiement prêt! Le serveur peut être démarré avec 'npm start'"
