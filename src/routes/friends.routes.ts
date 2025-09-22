import express from 'express';
import { auth } from '../middleware/auth';
import User from '../models/User';
import FriendRequest from '../models/FriendRequest';
import mongoose from 'mongoose';

const router = express.Router();

/* ===================== UTILITAIRES ===================== */

function isValidObjectId(id?: string): boolean {
  return !!id && mongoose.Types.ObjectId.isValid(id);
}

/* ===================== AMIS / DEMANDES ===================== */

// Obtenir la liste des amis
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user?.id).populate('friends', 'username email avatar');
    res.json(user?.friends || []);
  } catch (error) {
    console.error('Erreur lors de la récupération des amis:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir les demandes d'amis en attente (reçues par l'utilisateur)
router.get('/pending', auth, async (req, res) => {
  try {
    const pendingRequests = await FriendRequest.find({
      receiver: req.user?.id,
      status: 'pending'
    }).populate('sender', 'username email avatar');
    res.json(pendingRequests);
  } catch (error) {
    console.error('Erreur lors de la récupération des demandes reçues:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir les demandes d'amis envoyées par l'utilisateur
router.get('/sent', auth, async (req, res) => {
  try {
    const sentRequests = await FriendRequest.find({
      sender: req.user?.id,
      status: 'pending'
    }).populate('receiver', 'username email avatar');
    res.json(sentRequests);
  } catch (error) {
    console.error('Erreur lors de la récupération des demandes envoyées:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Rechercher des utilisateurs
router.get('/search', auth, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ message: 'Paramètre de recherche manquant' });
    }

    const users = await User.find({
      username: new RegExp(query as string, 'i'),
      _id: { $ne: req.user?.id }
    }).select('username email avatar');

    res.json(users);
  } catch (error) {
    console.error('Erreur lors de la recherche:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Envoyer une demande d'ami
router.post('/request/send/:userId', auth, async (req, res) => {
  const io = req.app.get('io');
  try {
    const { userId } = req.params;
    const senderId = req.user?.id;

    if (!senderId) {
      return res.status(401).json({ message: 'Non authentifié.' });
    }
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ message: 'userId invalide.' });
    }
    if (senderId === userId) {
      return res.status(400).json({ message: 'Vous ne pouvez pas vous envoyer une demande à vous-même.' });
    }

    // Vérifier si utilisateurs OK + blocages croisés
    const [senderUser, receiverUser] = await Promise.all([
      User.findById(senderId).select('friends blockedUsers'),
      User.findById(userId).select('friends blockedUsers'),
    ]);
    if (!senderUser || !receiverUser) {
      return res.status(404).json({ message: 'Un des utilisateurs n\'existe pas.' });
    }
    if (
      (senderUser.blockedUsers || []).some((id: mongoose.Types.ObjectId) => id.equals(receiverUser._id)) ||
      (receiverUser.blockedUsers || []).some((id: mongoose.Types.ObjectId) => id.equals(senderUser._id))
    ) {
      return res.status(403).json({ message: 'Action impossible : un des utilisateurs a bloqué l\'autre.' });
    }
    if ((senderUser.friends || []).some((id: mongoose.Types.ObjectId) => id.equals(receiverUser._id))) {
      return res.status(400).json({ message: 'Vous êtes déjà amis.' });
    }

    // Demande déjà en attente ?
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { sender: senderId, receiver: userId, status: 'pending' },
        { sender: userId, receiver: senderId, status: 'pending' }
      ]
    });
    if (existingRequest) {
      return res.status(400).json({ message: 'Une demande d\'ami est déjà en attente.' });
    }

    const newRequest = new FriendRequest({
      sender: senderId,
      receiver: userId,
      status: 'pending'
    });
    await newRequest.save();
    await newRequest.populate('sender', 'username email avatar');
    await newRequest.populate('receiver', 'username email avatar');

    io.to(userId).emit('friendRequestUpdate', { type: 'new', request: newRequest });
    io.to(senderId).emit('sentFriendRequestUpdate', { type: 'new', request: newRequest });

    res.status(200).json({ message: 'Demande d\'ami envoyée.', request: newRequest });
  } catch (error) {
    console.error('Erreur lors de l\'envoi de la demande d\'ami:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Accepter une demande d'ami
router.post('/request/accept/:requestId', auth, async (req, res) => {
  const io = req.app.get('io');
  try {
    const { requestId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Non authentifié.' });
    }

    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest) {
      return res.status(404).json({ message: 'Demande d\'ami non trouvée.' });
    }
    if (friendRequest.receiver.toString() !== userId) {
      return res.status(403).json({ message: 'Non autorisé à accepter cette demande.' });
    }

    friendRequest.status = 'accepted';
    await friendRequest.save();

    // Ajouter les deux utilisateurs dans leurs listes d'amis
    await User.findByIdAndUpdate(friendRequest.sender, { $addToSet: { friends: userId } });
    await User.findByIdAndUpdate(userId, { $addToSet: { friends: friendRequest.sender } });

    const newFriend = await User.findById(friendRequest.sender).select('username email avatar');
    const accepterUser = await User.findById(userId).select('username email avatar');

    io.to(userId).emit('friendListUpdate', { type: 'added', friend: newFriend });
    io.to(friendRequest.sender.toString()).emit('friendListUpdate', { type: 'added', friend: accepterUser });
    io.to(userId).emit('friendRequestUpdate', { type: 'removed', requestId });
    io.to(friendRequest.sender.toString()).emit('sentFriendRequestUpdate', { type: 'removed', requestId });

    res.status(200).json({ message: 'Demande d\'ami acceptée.', friend: newFriend });
  } catch (error) {
    console.error('Erreur lors de l\'acceptation de la demande d\'ami:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Rejeter une demande d'ami
router.post('/request/reject/:requestId', auth, async (req, res) => {
  const io = req.app.get('io');
  try {
    const { requestId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Non authentifié.' });
    }

    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest) {
      return res.status(404).json({ message: 'Demande d\'ami non trouvée.' });
    }
    if (friendRequest.receiver.toString() !== userId) {
      return res.status(403).json({ message: 'Non autorisé à rejeter cette demande.' });
    }

    await FriendRequest.findByIdAndDelete(requestId);

    io.to(friendRequest.sender.toString()).emit('sentFriendRequestUpdate', { type: 'removed', requestId });
    io.to(userId).emit('friendRequestUpdate', { type: 'removed', requestId });

    res.status(200).json({ message: 'Demande d\'ami rejetée.' });
  } catch (error) {
    console.error('Erreur lors du rejet de la demande d\'ami:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Annuler une demande d'ami (envoyée)
router.post('/request/cancel/:requestId', auth, async (req, res) => {
  const io = req.app.get('io');
  try {
    const { requestId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Non authentifié.' });
    }

    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest) {
      return res.status(404).json({ message: 'Demande d\'ami non trouvée.' });
    }
    if (friendRequest.sender.toString() !== userId) {
      return res.status(403).json({ message: 'Non autorisé à annuler cette demande.' });
    }

    await FriendRequest.findByIdAndDelete(requestId);

    io.to(friendRequest.receiver.toString()).emit('friendRequestUpdate', { type: 'removed', requestId });
    io.to(userId).emit('sentFriendRequestUpdate', { type: 'removed', requestId });

    res.status(200).json({ message: 'Demande d\'ami annulée avec succès.' });
  } catch (error) {
    console.error('Erreur lors de l\'annulation de la demande d\'ami:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer un ami (UNFRIEND)
router.delete('/:friendId', auth, async (req, res) => {
  const io = req.app.get('io');
  try {
    const { friendId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Non authentifié.' });
    }
    if (!isValidObjectId(friendId)) {
      return res.status(400).json({ message: 'friendId invalide.' });
    }

    await User.findByIdAndUpdate(userId, { $pull: { friends: friendId } });
    await User.findByIdAndUpdate(friendId, { $pull: { friends: userId } });

    // Optionnel : supprimer la FriendRequest "accepted" qui liait les deux
    await FriendRequest.findOneAndDelete({
      $or: [
        { sender: userId, receiver: friendId, status: 'accepted' },
        { sender: friendId, receiver: userId, status: 'accepted' }
      ]
    });

    io.to(userId).emit('friendListUpdate', { type: 'removed', friendId });
    io.to(friendId).emit('friendListUpdate', { type: 'removed', friendId: userId });

    res.json({ message: 'Ami supprimé avec succès.' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'ami:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/* ===================== BLOCAGE / DÉBLOCAGE ===================== */

// Lister les utilisateurs que J'AI bloqués
router.get('/blocked', auth, async (req, res) => {
  try {
    const me = await User.findById(req.user?.id).select('blockedUsers');
    if (!me) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }
    const blockedUsers = await User.find({ _id: { $in: me.blockedUsers || [] } })
      .select('username email avatar');
    res.json(blockedUsers);
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs bloqués:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Savoir si J'AI bloqué :userId
router.get('/blocked/:userId', auth, async (req, res) => {
  try {
    const me = await User.findById(req.user?.id).select('blockedUsers');
    if (!me) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }
    const { userId } = req.params;
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ message: 'userId invalide.' });
    }
    const blocked = (me.blockedUsers || []).some((id: mongoose.Types.ObjectId) => id.equals(new mongoose.Types.ObjectId(userId)));
    res.json({ blocked });
  } catch (error) {
    console.error('Erreur lors du check blocage:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Bloquer un utilisateur (NE SUPPRIME PAS DES AMIS)
router.post('/:userId/block', auth, async (req, res) => {
  const io = req.app.get('io');
  try {
    const meId = req.user?.id;
    const { userId: targetId } = req.params;

    if (!meId) {
      return res.status(401).json({ message: 'Non authentifié.' });
    }
    if (!isValidObjectId(targetId)) {
      return res.status(400).json({ message: 'userId invalide.' });
    }
    if (meId === targetId) {
      return res.status(400).json({ message: 'Impossible de se bloquer soi-même.' });
    }

    const [me, target] = await Promise.all([
      User.findById(meId).select('blockedUsers'),
      User.findById(targetId).select('_id'),
    ]);
    if (!me || !target) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }

    // Ajouter à blockedUsers (si pas déjà)
    await User.findByIdAndUpdate(meId, { $addToSet: { blockedUsers: target._id } });

    // Supprimer toutes les demandes d'amis (peu importe le statut) entre les deux
    await FriendRequest.deleteMany({
      $or: [
        { sender: meId, receiver: targetId },
        { sender: targetId, receiver: meId }
      ]
    });

    // IMPORTANT : ne pas retirer de la liste d'amis.
    // On notifie juste les deux côtés du nouvel état.
    io.to(meId).emit('friendListUpdate', { type: 'blocked', userId: targetId });
    io.to(targetId).emit('friendListUpdate', { type: 'blockedBy', userId: meId });

    res.json({ ok: true, message: 'Utilisateur bloqué.' });
  } catch (error) {
    console.error('Erreur lors du blocage:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Débloquer un utilisateur
router.delete('/:userId/block', auth, async (req, res) => {
  const io = req.app.get('io');
  try {
    const meId = req.user?.id;
    const { userId: targetId } = req.params;

    if (!meId) {
      return res.status(401).json({ message: 'Non authentifié.' });
    }
    if (!isValidObjectId(targetId)) {
      return res.status(400).json({ message: 'userId invalide.' });
    }

    await User.findByIdAndUpdate(meId, { $pull: { blockedUsers: targetId } });

    io.to(meId).emit('friendListUpdate', { type: 'unblocked', userId: targetId });
    io.to(targetId).emit('friendListUpdate', { type: 'unblockedBy', userId: meId });

    res.json({ ok: true, message: 'Utilisateur débloqué.' });
  } catch (error) {
    console.error('Erreur lors du déblocage:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

export default router;
