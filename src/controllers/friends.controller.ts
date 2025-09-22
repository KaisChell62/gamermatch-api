import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';
import FriendRequest from '../models/FriendRequest';

// ---------- Helpers ----------
function getIO(req: Request) {
  // Assure-toi dans ton server : app.set('io', io)
  return req.app.get('io');
}

async function getFriendIds(userId: string): Promise<string[]> {
  const acceptedRequests = await FriendRequest.find({
    $or: [
      { sender: userId, status: 'accepted' },
      { receiver: userId, status: 'accepted' },
    ],
  });

  return acceptedRequests.map((request) =>
    request.sender.toString() === userId
      ? request.receiver.toString()
      : request.sender.toString()
  );
}

async function removeAllRequestsBetween(a: string, b: string) {
  await FriendRequest.deleteMany({
    $or: [
      { sender: a, receiver: b },
      { sender: b, receiver: a },
    ],
  });
}

function isValidObjectId(id?: string) {
  return !!id && mongoose.Types.ObjectId.isValid(id);
}

function emitFriendListUpdate(io: any, userId: string, payload: any) {
  if (io && userId) {
    io.to(userId).emit('friendListUpdate', payload);
  }
}

function emitRequestUpdates(io: any, userId: string, type: 'new' | 'removed', data: any) {
  if (!io || !userId) return;
  if (type === 'new') {
    io.to(userId).emit('friendRequestUpdate', { type: 'new', request: data });
  } else {
    io.to(userId).emit('friendRequestUpdate', { type: 'removed', requestId: data });
    io.to(userId).emit('sentFriendRequestUpdate', { type: 'removed', requestId: data });
  }
}

// ---------- Controllers ----------

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
      _id: { $ne: currentUserId },
    }).select('username email avatar');

    res.json(users);
  } catch (error) {
    console.error('Erreur de recherche:', error);
    res.status(500).json({ message: 'Erreur lors de la recherche' });
  }
};

// Obtenir la liste des amis (via FriendRequest acceptées)
export const getFriends = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const friendIds = await getFriendIds(req.user.id);
    const friends = await User.find({ _id: { $in: friendIds } }).select('username email avatar');

    res.json(friends);
  } catch (error) {
    console.error('Erreur lors de la récupération des amis:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Obtenir les demandes d'amis en attente (reçues)
export const getFriendRequests = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const requests = await FriendRequest.find({
      receiver: req.user.id,
      status: 'pending',
    }).populate('sender', 'username email avatar');

    res.json(requests);
  } catch (error) {
    console.error('Erreur lors de la récupération des demandes:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Envoyer une demande d'ami
export const sendFriendRequest = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const senderId = req.user?.id;

    if (!senderId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }
    if (!isValidObjectId(userId)) {
      res.status(400).json({ message: 'userId invalide' });
      return;
    }
    if (userId === senderId) {
      res.status(400).json({ message: 'Vous ne pouvez pas vous envoyer une demande d\'ami' });
      return;
    }

    // Vérifie si bloqué dans un sens ou dans l'autre
    const [sender, receiver] = await Promise.all([
      User.findById(senderId).select('_id blockedUsers'),
      User.findById(userId).select('_id blockedUsers'),
    ]);

    if (!sender || !receiver) {
      res.status(404).json({ message: 'Utilisateur introuvable' });
      return;
    }
    if (sender.blockedUsers?.includes(receiver._id) || receiver.blockedUsers?.includes(sender._id)) {
      res.status(403).json({ message: 'Action impossible : un des utilisateurs a bloqué l\'autre.' });
      return;
    }

    const existingRequest = await FriendRequest.findOne({
      $or: [
        { sender: senderId, receiver: userId },
        { sender: userId, receiver: senderId },
      ],
    });

    if (existingRequest) {
      res.status(400).json({ message: 'Une demande d\'ami existe déjà' });
      return;
    }

    const newRequest = await new FriendRequest({
      sender: senderId,
      receiver: userId,
      status: 'pending',
    }).save();

    // Optionnel : notif temps réel du côté receiver
    const io = getIO(req);
    io && io.to(userId).emit('friendRequestUpdate', { type: 'new', request: await newRequest.populate('sender', 'username email avatar') });

    res.status(201).json({ message: 'Demande d\'ami envoyée' });
  } catch (error) {
    console.error('Erreur lors de l\'envoi de la demande:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Accepter une demande d'ami
export const acceptFriendRequest = async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    if (!req.user?.id) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const request = await FriendRequest.findOne({
      _id: requestId,
      receiver: req.user.id,
      status: 'pending',
    });

    if (!request) {
      res.status(404).json({ message: 'Demande non trouvée' });
      return;
    }

    request.status = 'accepted';
    await request.save();

    const io = getIO(req);
    // Mettre à jour les listes d'amis côté front
    emitFriendListUpdate(io, request.sender.toString(), { type: 'added', friend: { _id: req.user.id } });
    emitFriendListUpdate(io, request.receiver.toString(), { type: 'added', friend: { _id: request.sender.toString() } });

    res.json({ message: 'Demande d\'ami acceptée' });
  } catch (error) {
    console.error('Erreur lors de l\'acceptation de la demande:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Rejeter une demande d'ami
export const rejectFriendRequest = async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    if (!req.user?.id) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const request = await FriendRequest.findOne({
      _id: requestId,
      receiver: req.user.id,
      status: 'pending',
    });

    if (!request) {
      res.status(404).json({ message: 'Demande non trouvée' });
      return;
    }

    request.status = 'rejected';
    await request.save();

    // Optionnel : notifier l'expéditeur
    const io = getIO(req);
    emitRequestUpdates(io, request.sender.toString(), 'removed', request._id.toString());

    res.json({ message: 'Demande d\'ami rejetée' });
  } catch (error) {
    console.error('Erreur lors du rejet de la demande:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Supprimer un ami (supprime la FriendRequest acceptée)
export const removeFriend = async (req: Request, res: Response) => {
  try {
    const { friendId } = req.params;
    const me = req.user?.id;
    if (!me) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }
    if (!isValidObjectId(friendId)) {
      res.status(400).json({ message: 'friendId invalide' });
      return;
    }

    const fr = await FriendRequest.findOneAndDelete({
      $or: [
        { sender: me, receiver: friendId, status: 'accepted' },
        { sender: friendId, receiver: me, status: 'accepted' },
      ],
    });

    if (!fr) {
      res.status(404).json({ message: 'Relation d’amitié introuvable' });
      return;
    }

    // Notifs temps réel
    const io = getIO(req);
    emitFriendListUpdate(io, me, { type: 'removed', friendId });
    emitFriendListUpdate(io, friendId, { type: 'removed', friendId: me });

    res.json({ message: 'Ami supprimé' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'ami:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Bloquer un utilisateur
export const blockUser = async (req: Request, res: Response) => {
  try {
    const me = req.user?.id;
    const { userId: targetId } = req.params;

    if (!me) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }
    if (!isValidObjectId(targetId)) {
      res.status(400).json({ message: 'userId invalide' });
      return;
    }
    if (me === targetId) {
      res.status(400).json({ message: 'Impossible de se bloquer soi-même' });
      return;
    }

    const [meUser, targetUser] = await Promise.all([
      User.findById(me).select('_id blockedUsers blockedUsersWithTimestamp'),
      User.findById(targetId).select('_id blockedUsers'),
    ]);

    if (!meUser || !targetUser) {
      res.status(404).json({ message: 'Utilisateur introuvable' });
      return;
    }

    // Nettoyer les blocages expirés (plus de 1 minute)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    meUser.blockedUsersWithTimestamp = (meUser.blockedUsersWithTimestamp || []).filter(
      block => block.blockedAt > oneMinuteAgo
    );

    // Ajouter le nouveau blocage temporaire
    const existingBlock = meUser.blockedUsersWithTimestamp?.find(
      block => block.userId.equals(targetUser._id)
    );

    if (!existingBlock) {
      meUser.blockedUsersWithTimestamp = meUser.blockedUsersWithTimestamp || [];
      meUser.blockedUsersWithTimestamp.push({
        userId: targetUser._id,
        blockedAt: new Date()
      });
    }

    // Mettre à jour blockedUsers pour compatibilité
    if (!meUser.blockedUsers?.some((id) => id.equals(targetUser._id))) {
      meUser.blockedUsers = meUser.blockedUsers || [];
      meUser.blockedUsers.push(targetUser._id);
    }

    await meUser.save();

    // Retirer la relation d'ami s'il y en a une + effacer toutes les demandes
    await removeAllRequestsBetween(me, targetId);

    // Notifs temps réel (retrait d'ami)
    const io = getIO(req);
    emitFriendListUpdate(io, me, { type: 'removed', friendId: targetId });
    emitFriendListUpdate(io, targetId, { type: 'removed', friendId: me });

    // Programmer le déblocage automatique après 1 minute
    setTimeout(async () => {
      try {
        const user = await User.findById(me);
        if (user) {
          user.blockedUsers = (user.blockedUsers || []).filter(
            id => !id.equals(targetUser._id)
          );
          user.blockedUsersWithTimestamp = (user.blockedUsersWithTimestamp || []).filter(
            block => !block.userId.equals(targetUser._id)
          );
          await user.save();
          console.log(`🔓 Utilisateur ${targetId} automatiquement débloqué par ${me}`);
          
          // Notifier le déblocage
          emitFriendListUpdate(io, me, { type: 'unblocked', userId: targetId });
          emitFriendListUpdate(io, targetId, { type: 'unblockedBy', userId: me });
        }
      } catch (error) {
        console.error('Erreur lors du déblocage automatique:', error);
      }
    }, 60 * 1000); // 1 minute

    res.json({ ok: true, message: 'Utilisateur bloqué temporairement (1 minute)' });
  } catch (error) {
    console.error('Erreur lors du blocage:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Débloquer un utilisateur
export const unblockUser = async (req: Request, res: Response) => {
  try {
    const me = req.user?.id;
    const { userId: targetId } = req.params;

    if (!me) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }
    if (!isValidObjectId(targetId)) {
      res.status(400).json({ message: 'userId invalide' });
      return;
    }

    const meUser = await User.findById(me).select('_id blockedUsers');
    if (!meUser) {
      res.status(404).json({ message: 'Utilisateur introuvable' });
      return;
    }

    meUser.blockedUsers = (meUser.blockedUsers || []).filter(
      (id) => !id.equals(new mongoose.Types.ObjectId(targetId))
    );
    await meUser.save();

    res.json({ ok: true, message: 'Utilisateur débloqué' });
  } catch (error) {
    console.error('Erreur lors du déblocage:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};
