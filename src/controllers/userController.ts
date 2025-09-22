import { Request, Response } from 'express';
import User from '../models/User';

// Rechercher des utilisateurs
export const searchUsers = async (req: Request, res: Response) => {
  try {
    const { query } = req.query;
    const currentUserId = req.user?.id;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ message: 'Terme de recherche invalide' });
      return;
    }

    const users = await User.find({
      username: new RegExp(query, 'i'),
      _id: { $ne: currentUserId }
    }).select('username email avatar');

    res.json(users);
  } catch (error) {
    console.error('Erreur de recherche:', error);
    res.status(500).json({ message: 'Erreur lors de la recherche' });
  }
};

// Obtenir le profil d'un utilisateur
export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    res.json(user);
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Mettre à jour le profil de l'utilisateur
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const { username, email, avatar } = req.body;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    if (username) user.username = username;
    if (email) user.email = email;
    if (avatar) user.avatar = avatar;

    await user.save();
    res.json({ message: 'Profil mis à jour avec succès', user });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du profil:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

export default {
  searchUsers,
  getUserProfile,
  updateProfile
}; 