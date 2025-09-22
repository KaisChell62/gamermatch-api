import express from 'express';
import mongoose from 'mongoose';
import { auth } from '../middleware/auth';
import Message from '../models/Message';
import { ensureNotBlockedForSend, attachBlockFlags } from '../middleware/checkBlock';
import { 
  addReaction, 
  deleteMessage, 
  pinMessage, 
  unpinMessage,
  forwardMessage,
  editMessage
} from '../controllers/messageController';

const router = express.Router();

function isValidObjectId(id?: string): boolean {
  return !!id && mongoose.Types.ObjectId.isValid(id);
}

/**
 * GET /api/messages/conversation/:friendId
 * - Sans paramètre: renvoie le tableau de messages (comportement historique)
 * - Avec ?withFlags=1 : renvoie { messages, blockedByMe, blockedMe }
 */
router.get('/conversation/:friendId', auth, attachBlockFlags, async (req, res) => {
  try {
    // @ts-ignore - req.user injecté par middleware auth
    const currentUserId: string | undefined = req.user?.id;
    const { friendId } = req.params as { friendId?: string };
    const withFlags = String(req.query.withFlags || '') === '1';

    if (!currentUserId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }
    if (!isValidObjectId(friendId)) {
      return res.status(400).json({ message: 'friendId invalide' });
    }

    const messages = await Message.find({
      $or: [
        { senderId: currentUserId, receiverId: friendId },
        { senderId: friendId, receiverId: currentUserId },
      ],
    }).sort({ timestamp: 1 });

    if (withFlags) {
      const flags = (req as any).blockFlags as { blockedByMe: boolean; blockedMe: boolean } | undefined;
      return res.json({
        messages,
        blockedByMe: !!flags?.blockedByMe,
        blockedMe: !!flags?.blockedMe,
      });
    }

    return res.json(messages);
  } catch (error) {
    console.error('[GET /api/messages/conversation/:friendId] ❌ Error:', error);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * POST /api/messages
 * Body attendu:
 * {
 *   content: string,
 *   receiverId: string,
 *   attachments?: { name: string; url: string; mimeType?: string; size?: number; durationMs?: number; thumbnailUrl?: string }[]
 * }
 *
 * → Vérifie les blocages, enregistre et renvoie le message créé.
 *   (On n’émet PAS via socket ici pour éviter les doublons si le front émet déjà.)
 */
router.post('/', auth, ensureNotBlockedForSend, async (req, res) => {
  try {
    // @ts-ignore - req.user injecté par middleware auth
    const currentUserId: string | undefined = req.user?.id;
    if (!currentUserId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const { content, receiverId, attachments, ticketId, replyTo } = req.body as {
      content?: string;
      receiverId?: string;
      attachments?: Array<{
        name: string;
        url: string;
        mimeType?: string;
        size?: number;
        durationMs?: number;
        thumbnailUrl?: string;
      }>;
      ticketId?: string;
      replyTo?: {
        messageId: string;
        content: string;
        username: string;
      };
    };

    // Permettre content vide si des attachments sont présents
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    if ((!content || typeof content !== 'string' || !content.trim()) && !hasAttachments) {
      return res.status(400).json({ message: 'content ou attachments requis' });
    }

    // Si pas de content, utiliser une chaîne vide
    const messageContent = content ? content.trim() : '';
    if (!isValidObjectId(receiverId)) {
      return res.status(400).json({ message: 'receiverId invalide' });
    }

    const newMessage = new Message({
      content: messageContent,
      senderId: currentUserId,
      receiverId,
      ticketId: isValidObjectId(ticketId) ? new mongoose.Types.ObjectId(ticketId as string) : undefined,
      sender: currentUserId === 'support-user' ? 'support' : 'user',
      timestamp: new Date(),
      attachments: Array.isArray(attachments) ? attachments : undefined,
      replyTo: replyTo ? {
        messageId: replyTo.messageId,
        content: replyTo.content,
        username: replyTo.username,
      } : undefined,
      // readBy / readAt restent gérés par les routes de lecture
    });

    await newMessage.save();
    return res.status(201).json(newMessage);
  } catch (error) {
    console.error('[POST /api/messages] ❌ Error:', error);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * PATCH /api/messages/:id/read
 * Marque un message comme lu par l'utilisateur authentifié.
 * - Ajoute l'userId à readBy s'il n'y est pas déjà
 * - Définit readAt si non défini
 * - Émet un évènement socket "message:read" aux rooms du sender et du receiver
 */
router.patch('/:id/read', auth, async (req, res) => {
  try {
    // @ts-ignore - req.user injecté par middleware auth
    const currentUserId: string | undefined = req.user?.id;
    const { id } = req.params as { id?: string };

    if (!currentUserId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'id invalide' });
    }

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({ message: 'Message non trouvé' });
    }

    // Optionnel: n'autoriser que le destinataire à marquer comme lu
    // if (String(message.receiverId) !== String(currentUserId)) {
    //   return res.status(403).json({ message: 'Interdit' });
    // }

    const readBy: string[] = Array.isArray((message as any).readBy)
      ? ((message as any).readBy as string[])
      : [];

    const alreadyRead = readBy.includes(currentUserId);
    if (!alreadyRead) {
      readBy.push(currentUserId);
      (message as any).readBy = readBy;
    }

    if (!(message as any).readAt) {
      (message as any).readAt = new Date().toISOString();
    }

    await message.save();

    // Émettre aux rooms des deux utilisateurs
    const io = req.app.get('io');
    if (io && typeof io.to === 'function') {
      io.to(String(message.senderId)).emit('message:read', {
        messageId: String(message._id),
        userId: currentUserId,
        readAt: (message as any).readAt,
      });
      io.to(String(message.receiverId)).emit('message:read', {
        messageId: String(message._id),
        userId: currentUserId,
        readAt: (message as any).readAt,
      });
    }

    return res.json(message);
  } catch (error) {
    console.error('[PATCH /api/messages/:id/read] ❌ Error:', error);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Nouvelles routes pour les actions sur les messages
router.post('/:id/react', auth, addReaction);
router.delete('/:id', auth, deleteMessage);
router.put('/:id', auth, editMessage);
router.post('/:id/pin', auth, pinMessage);
router.post('/:id/unpin', auth, unpinMessage);
router.post('/:id/forward', auth, forwardMessage);

export default router;
