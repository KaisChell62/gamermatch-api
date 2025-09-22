import { Request, Response } from 'express';
import Message from '../models/Message';
import Ticket from '../models/ticketModel';

/**
 * GET /api/tickets/:ticketId/messages
 * Récupère tous les messages d'un ticket
 */
export const getMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ticketId } = req.params;

    if (!ticketId) {
      res.status(400).json({ error: 'ticketId is required in params.' });
      return;
    }

    const messages = await Message.find({ ticketId }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (error) {
    console.error('[GET /api/tickets/:ticketId/messages] ❌ Error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
};

/**
 * POST /api/tickets/:ticketId/messages
 * Crée un message lié à un ticket (support)
 */
export const createMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ticketId } = req.params;
    const { content, senderId, attachments } = req.body;
    const receiverId = process.env.SUPPORT_USER_ID || 'support-user';

    if (!ticketId) {
      res.status(400).json({ error: 'ticketId is required in params.' });
      return;
    }
    if (!content || !senderId) {
      console.log('[POST /api/tickets/:ticketId/messages] ❌ Missing content or senderId.');
      res.status(400).json({ error: 'Content and senderId are required.' });
      return;
    }

    // Vérifie que le ticket existe
    const ticketExists = await Ticket.findById(ticketId);
    if (!ticketExists) {
      console.log(`[POST /api/tickets/${ticketId}/messages] ❌ Ticket not found.`);
      res.status(404).json({ error: 'Ticket not found.' });
      return;
    }

    const newMessage = new Message({
      ticketId,
      content,
      senderId,
      receiverId,
      sender: senderId === 'support-user' ? 'support' : 'user',
      timestamp: new Date(),
      attachments: Array.isArray(attachments) ? attachments : undefined,
      readBy: [],
      readAt: null,
    });

    await newMessage.save();
    console.log(`[POST /api/tickets/${ticketId}/messages] ✅ Message saved in MongoDB:`, newMessage);

    res.status(201).json(newMessage);
  } catch (err: any) {
    console.error('[POST /api/tickets/:ticketId/messages] ❌ Error:', err.message);
    res.status(500).json({ error: 'Failed to create message.', details: err.message });
  }
};

/**
 * GET /api/messages/conversation/:friendId
 * (ou :recipientId si tu changes la route)
 * Récupère les messages entre l'utilisateur courant et l'autre participant.
 */
export const getConversation = async (req: Request, res: Response) => {
  try {
    // ⚠️ La route déclare :friendId, mais certains contrôleurs s'attendaient à :recipientId
    const recipientId = (req.params as any).recipientId || (req.params as any).friendId;

    // @ts-ignore - req.user injecté par un middleware d'auth
    const currentUserId: string | undefined = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!recipientId) {
      res.status(400).json({ message: 'Paramètre manquant: friendId/recipientId' });
      return;
    }

    const baseFilter: any = {
      $or: [
        { senderId: currentUserId, receiverId: recipientId },
        { senderId: recipientId,   receiverId: currentUserId },
      ],
    };

    // Optionnel: filtrage par ticket via ?ticketId=...
    const ticketId = req.query.ticketId as string | undefined;
    if (ticketId) baseFilter.ticketId = ticketId;

    const messages = await Message.find(baseFilter).sort({ timestamp: 1 });
    res.json(messages);
  } catch (error) {
    console.error('[GET /api/messages/conversation/:friendId] ❌ Error:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * POST /api/messages
 * Body: { content, receiverId, ticketId?, attachments? }
 * Crée un message direct (sans ticket) OU lié à un ticket si ticketId fourni.
 * -> ticketId est OPTIONNEL.
 */
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { content, receiverId, ticketId, attachments } = req.body;

    // @ts-ignore - req.user injecté par un middleware d'auth
    const currentUserId: string | undefined = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!content || !receiverId) {
      res.status(400).json({ message: 'content et receiverId sont requis.' });
      return;
    }

    const newMessage = new Message({
      content,
      senderId: currentUserId,
      receiverId,
      ticketId: ticketId || undefined,
      sender: currentUserId === 'support-user' ? 'support' : 'user',
      timestamp: new Date(),
      attachments: Array.isArray(attachments) ? attachments : undefined,
      readBy: [],
      readAt: null,
    });

    await newMessage.save();
    res.status(201).json(newMessage);
  } catch (error) {
    console.error('[POST /api/messages] ❌ Error:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * GET /api/messages
 * Récupère tous les messages où l'utilisateur courant est senderId ou receiverId
 * Optionnel: ?ticketId=...
 */
export const getAllMessages = async (req: Request, res: Response) => {
  try {
    // @ts-ignore - req.user injecté par un middleware d'auth
    const currentUserId: string | undefined = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const ticketId = req.query.ticketId as string | undefined;

    const filter: any = {
      $or: [{ senderId: currentUserId }, { receiverId: currentUserId }],
    };

    if (ticketId) {
      filter.ticketId = ticketId;
    }

    const messages = await Message.find(filter).sort({ timestamp: -1 });
    res.json(messages);
  } catch (error) {
    console.error('[GET /api/messages] ❌ Error:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * PATCH /api/messages/:id/read
 * Marque un message comme lu par l'utilisateur courant:
 * - ajoute son userId dans readBy si absent
 * - définit readAt au premier "read"
 * - émet un évènement socket `message:read` à l'expéditeur en temps réel
 */
export const markMessageRead = async (req: Request, res: Response) => {
  try {
    const { id: messageId } = req.params;

    // @ts-ignore
    const currentUserId: string | undefined = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const message = await Message.findById(messageId);
    if (!message) {
      res.status(404).json({ message: 'Message non trouvé' });
      return;
    }

    // @ts-ignore - message.readBy peut être undefined sur anciens docs
    const readBy: string[] = Array.isArray(message.readBy) ? message.readBy : [];

    const updatedFields: Record<string, unknown> = {};
    if (!readBy.includes(currentUserId)) {
      readBy.push(currentUserId);
      updatedFields.readBy = readBy;
      if (!message.readAt) {
        updatedFields.readAt = new Date();
      }
    }

    if (Object.keys(updatedFields).length === 0) {
      // déjà lu par cet utilisateur : on renvoie l'existant
      res.status(200).json(message);
      return;
    }

    const updated = await Message.findByIdAndUpdate(
      messageId,
      { $set: updatedFields },
      { new: true }
    );

    // --- ÉMISSION SOCKET EN TEMPS RÉEL ---
    try {
      // Récupère l'instance io stockée dans l'app (configurée dans server.ts via app.set('io', io))
      const io = req.app.get('io') as { to: (room: string) => { emit: (event: string, payload: unknown) => void } } | undefined;
      if (io && updated) {
        const senderId = (updated as any).senderId as string; // room = userId de l'expéditeur
        if (senderId) {
          io.to(senderId).emit('message:read', {
            messageId: updated._id?.toString?.() || messageId,
            userId: currentUserId,
            readAt: (updated as any).readAt
              ? new Date((updated as any).readAt).toISOString()
              : new Date().toISOString(),
          });
        } else {
          console.warn('[markMessageRead] senderId manquant sur le message, émission socket ignorée.');
        }
      } else {
        console.warn('[markMessageRead] io non dispo ou message non mis à jour, pas d’émission.');
      }
    } catch (emitErr) {
      console.warn('[markMessageRead] ⚠️ Unable to emit socket event:', emitErr);
    }

    res.status(200).json(updated);
  } catch (error) {
    console.error('[PATCH /api/messages/:id/read] ❌ Error:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * POST /api/messages/:id/react
 * Ajoute une réaction à un message
 */
export const addReaction = async (req: Request, res: Response) => {
  try {
    const { id: messageId } = req.params;
    const { emoji } = req.body;

    // @ts-ignore
    const currentUserId: string | undefined = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!emoji) {
      res.status(400).json({ message: 'Emoji requis' });
      return;
    }

    const message = await Message.findById(messageId);
    if (!message) {
      res.status(404).json({ message: 'Message non trouvé' });
      return;
    }

    // Initialiser reactions si pas encore défini
    if (!message.reactions) {
      message.reactions = [];
    }

    // Chercher si l'utilisateur a déjà réagi avec cet emoji
    const existingReaction = message.reactions.find((r: any) => r.emoji === emoji);
    
    if (existingReaction) {
      // Si l'utilisateur a déjà réagi avec cet emoji, le supprimer (système Discord)
      if (existingReaction.users.includes(currentUserId)) {
        existingReaction.users = existingReaction.users.filter((userId: string) => userId !== currentUserId);
        existingReaction.count = existingReaction.users.length;
        
        // Supprimer la réaction si plus personne n'a réagi
        if (existingReaction.count === 0) {
          message.reactions = message.reactions.filter((r: any) => r.emoji !== emoji);
        }
      } else {
        // Si l'utilisateur n'a pas encore réagi avec cet emoji, l'ajouter
        existingReaction.users.push(currentUserId);
        existingReaction.count = existingReaction.users.length;
      }
    } else {
      // Vérifier la limite de 3 réactions maximum
      if (message.reactions.length >= 3) {
        res.status(400).json({ message: 'Maximum 3 réactions par message' });
        return;
      }
      
      // Créer une nouvelle réaction
      message.reactions.push({
        emoji,
        count: 1,
        users: [currentUserId]
      });
    }

    await message.save();

    // Émettre la réaction via socket
    const io = req.app.get('io');
    if (io) {
      // Émettre vers l'expéditeur et le destinataire
      io.to(message.senderId).emit('message:reaction', {
        messageId: messageId,
        reactions: message.reactions
      });
      io.to(message.receiverId).emit('message:reaction', {
        messageId: messageId,
        reactions: message.reactions
      });
    }

    res.status(200).json(message);
  } catch (error) {
    console.error('[POST /api/messages/:id/react] ❌ Error:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * DELETE /api/messages/:id
 * Supprime un message (pour moi ou pour tout le monde)
 */
export const deleteMessage = async (req: Request, res: Response) => {
  try {
    const { id: messageId } = req.params;
    const { deleteForEveryone } = req.body;

    // @ts-ignore
    const currentUserId: string | undefined = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const message = await Message.findById(messageId);
    if (!message) {
      res.status(404).json({ message: 'Message non trouvé' });
      return;
    }

    // Vérifier que l'utilisateur peut supprimer ce message
    if (message.senderId !== currentUserId) {
      res.status(403).json({ message: 'Vous ne pouvez pas supprimer ce message' });
      return;
    }

    if (deleteForEveryone) {
      // Supprimer pour tout le monde - marquer comme supprimé au lieu de supprimer
      console.log('🗑️ Suppression pour tout le monde - Message original:', {
        id: message._id,
        content: message.content,
        attachments: message.attachments,
        isDeleted: message.isDeleted
      });
      
      message.isDeleted = true;
      message.content = 'Ce message a été supprimé';
      // Supprimer aussi les attachments pour les médias
      if (message.attachments && message.attachments.length > 0) {
        message.attachments = [];
      }
      await message.save();
      
      console.log('🗑️ Message supprimé - Nouveau état:', {
        id: message._id,
        content: message.content,
        attachments: message.attachments,
        isDeleted: message.isDeleted
      });
      
      // Émettre l'événement socket pour synchroniser avec les deux utilisateurs
      const io = req.app.get('io');
      if (io) {
        console.log('Émission message:deleted vers:', message.receiverId, 'et', message.senderId);
        // Émettre vers le destinataire
        io.to(String(message.receiverId)).emit('message:deleted', {
          messageId: messageId,
          content: 'Ce message a été supprimé',
          isDeleted: true
        });
        // Émettre vers l'expéditeur aussi
        io.to(String(message.senderId)).emit('message:deleted', {
          messageId: messageId,
          content: 'Ce message a été supprimé',
          isDeleted: true
        });
        // Émettre aussi en broadcast pour être sûr
        io.emit('message:deleted', {
          messageId: messageId,
          content: 'Ce message a été supprimé',
          isDeleted: true
        });
      }
      
      res.status(200).json({ message: 'Message supprimé pour tout le monde' });
    } else {
      // Marquer comme supprimé pour l'utilisateur seulement
      console.log('🗑️ Suppression pour moi - Message original:', {
        id: message._id,
        content: message.content,
        attachments: message.attachments,
        isDeleted: message.isDeleted
      });
      
      message.isDeleted = true;
      message.content = 'Vous avez supprimé ce message';
      // Supprimer aussi les attachments pour les médias
      if (message.attachments && message.attachments.length > 0) {
        message.attachments = [];
      }
      await message.save();
      
      console.log('🗑️ Message supprimé pour moi - Nouveau état:', {
        id: message._id,
        content: message.content,
        attachments: message.attachments,
        isDeleted: message.isDeleted
      });
      
      res.status(200).json({ message: 'Message supprimé pour vous' });
    }
  } catch (error) {
    console.error('[DELETE /api/messages/:id] ❌ Error:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * POST /api/messages/:id/pin
 * Épingle un message
 */
export const pinMessage = async (req: Request, res: Response) => {
  try {
    const { id: messageId } = req.params;

    // @ts-ignore
    const currentUserId: string | undefined = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const message = await Message.findById(messageId);
    if (!message) {
      res.status(404).json({ message: 'Message non trouvé' });
      return;
    }

    // Vérifier que l'utilisateur peut épingler ce message
    if (message.senderId !== currentUserId && message.receiverId !== currentUserId) {
      res.status(403).json({ message: 'Vous ne pouvez pas épingler ce message' });
      return;
    }

    message.isPinned = true;
    await message.save();

    // Émettre l'événement de pin via socket
    const io = req.app.get('io');
    if (io) {
      io.to(message.senderId).emit('message:pinned', {
        messageId: messageId,
        isPinned: true
      });
      io.to(message.receiverId).emit('message:pinned', {
        messageId: messageId,
        isPinned: true
      });
      console.log(`📌 Message ${messageId} épinglé - émis vers ${message.senderId} et ${message.receiverId}`);
    }

    res.status(200).json({ message: 'Message épinglé' });
  } catch (error) {
    console.error('[POST /api/messages/:id/pin] ❌ Error:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * POST /api/messages/:id/forward
 * Transfère un message vers d'autres amis
 */
export const forwardMessage = async (req: Request, res: Response) => {
  try {
    const { id: messageId } = req.params;
    const { friendIds } = req.body;

    // @ts-ignore
    const currentUserId: string | undefined = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!friendIds || !Array.isArray(friendIds) || friendIds.length === 0) {
      res.status(400).json({ message: 'friendIds requis' });
      return;
    }

    const originalMessage = await Message.findById(messageId);
    if (!originalMessage) {
      res.status(404).json({ message: 'Message non trouvé' });
      return;
    }

    // Créer des messages transférés pour chaque ami
    const forwardedMessages = [];
    for (const friendId of friendIds) {
      const forwardedMessage = new Message({
        content: originalMessage.content,
        senderId: currentUserId,
        receiverId: friendId,
        isForwarded: true,
        originalSender: originalMessage.senderId,
        sender: currentUserId === 'support-user' ? 'support' : 'user',
        timestamp: new Date(),
        attachments: originalMessage.attachments,
        readBy: [],
        readAt: null,
      });
      
      await forwardedMessage.save();
      forwardedMessages.push(forwardedMessage);
    }

    // Émettre les messages transférés via socket
    const io = req.app.get('io');
    if (io) {
      for (const forwardedMessage of forwardedMessages) {
        // Émettre vers le destinataire
        io.to(forwardedMessage.receiverId).emit('newMessage', {
          id: forwardedMessage._id?.toString(),
          content: forwardedMessage.content,
          senderId: forwardedMessage.senderId,
          receiverId: forwardedMessage.receiverId,
          timestamp: forwardedMessage.timestamp,
          isForwarded: forwardedMessage.isForwarded,
          originalSender: forwardedMessage.originalSender,
          attachments: forwardedMessage.attachments,
          readBy: forwardedMessage.readBy,
          readAt: forwardedMessage.readAt,
        });
      }
    }

    res.status(200).json({ 
      message: `Message transféré vers ${friendIds.length} ami(s)`,
      forwardedMessages 
    });
  } catch (error) {
    console.error('[POST /api/messages/:id/forward] ❌ Error:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * PUT /api/messages/:id
 * Modifie un message
 */
export const editMessage = async (req: Request, res: Response) => {
  try {
    const { id: messageId } = req.params;
    const { content } = req.body;

    // @ts-ignore
    const currentUserId: string | undefined = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ message: 'Contenu requis' });
      return;
    }

    const message = await Message.findById(messageId);
    if (!message) {
      res.status(404).json({ message: 'Message non trouvé' });
      return;
    }

    // Vérifier que l'utilisateur peut modifier ce message
    if (message.senderId !== currentUserId) {
      res.status(403).json({ message: 'Vous ne pouvez pas modifier ce message' });
      return;
    }

    message.content = content.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    // Émettre la modification via socket
    const io = req.app.get('io');
    if (io) {
      const editData = {
        messageId: messageId,
        content: message.content,
        timestamp: message.timestamp,
        isEdited: message.isEdited,
        editedAt: message.editedAt
      };
      
      // Émettre vers l'expéditeur et le destinataire
      io.to(message.senderId).emit('message:edited', editData);
      io.to(message.receiverId).emit('message:edited', editData);
      
      // Émettre aussi en broadcast pour être sûr
      io.emit('message:edited', editData);
      
      console.log(`📝 Message ${messageId} modifié - émis vers ${message.senderId} et ${message.receiverId}`);
    }

    res.status(200).json({ message: 'Message modifié', updatedMessage: message });
  } catch (error) {
    console.error('[PUT /api/messages/:id] ❌ Error:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * POST /api/messages/:id/unpin
 * Désépingle un message
 */
export const unpinMessage = async (req: Request, res: Response) => {
  try {
    const { id: messageId } = req.params;

    // @ts-ignore
    const currentUserId: string | undefined = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const message = await Message.findById(messageId);
    if (!message) {
      res.status(404).json({ message: 'Message non trouvé' });
      return;
    }

    // Vérifier que l'utilisateur peut désépingler ce message
    if (message.senderId !== currentUserId && message.receiverId !== currentUserId) {
      res.status(403).json({ message: 'Vous ne pouvez pas désépingler ce message' });
      return;
    }

    message.isPinned = false;
    await message.save();

    // Émettre l'événement de unpin via socket
    const io = req.app.get('io');
    if (io) {
      io.to(message.senderId).emit('message:pinned', {
        messageId: messageId,
        isPinned: false
      });
      io.to(message.receiverId).emit('message:pinned', {
        messageId: messageId,
        isPinned: false
      });
      console.log(`📌 Message ${messageId} désépinglé - émis vers ${message.senderId} et ${message.receiverId}`);
    }

    res.status(200).json({ message: 'Message désépinglé' });
  } catch (error) {
    console.error('[POST /api/messages/:id/unpin] ❌ Error:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};