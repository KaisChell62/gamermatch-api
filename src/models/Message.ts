import mongoose from 'mongoose';

// Définir l'interface pour le typage TypeScript
export interface IMessage {
  content: string;
  senderId: string; // aligné sur le schéma (String)
  receiverId: string; // aligné sur le schéma (String)
  ticketId?: mongoose.Types.ObjectId; // devenu optionnel
  sender: 'user' | 'support';
  timestamp: Date;
  attachments?: { 
    name: string; 
    url: string; 
    mimeType?: string; 
    size?: number; 
    durationMs?: number; 
    thumbnailUrl?: string; 
  }[];
  readBy?: string[]; // IDs d'utilisateurs (String) qui ont lu
  readAt?: Date | null; // date de première lecture
  replyTo?: {
    messageId: string;
    content: string;
    username: string;
  };
  isForwarded?: boolean;
  originalSender?: string;
  isDeleted?: boolean;
  isPinned?: boolean;
  isEdited?: boolean;
  editedAt?: Date;
  reactions?: Array<{
    emoji: string;
    count: number;
    users: string[];
  }>;
}

const messageSchema = new mongoose.Schema({
  content: {
    type: String,
    required: false, // On gère la validation manuellement dans les routes
  },
  senderId: {
    type: String,
    required: true,
  },
  receiverId: {
    type: String,
    required: true,
  },
  // ticketId devient OPTIONNEL pour permettre les messages "direct chat"
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: false,
  },
  sender: {
    type: String,
    enum: ['user', 'support'],
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  attachments: [
    {
      name: String,
      url: String,
      mimeType: String,
      size: Number,
      durationMs: Number,
      thumbnailUrl: String,
    },
  ],
  // On stocke des userId en String pour être cohérent avec senderId/receiverId
  readBy: [
    {
      type: String,
    },
  ],
  readAt: {
    type: Date,
    default: null,
  },
  replyTo: {
    messageId: String,
    content: String,
    username: String,
  },
  isForwarded: {
    type: Boolean,
    default: false,
  },
  originalSender: String,
  isDeleted: {
    type: Boolean,
    default: false,
  },
  isPinned: {
    type: Boolean,
    default: false,
  },
  isEdited: {
    type: Boolean,
    default: false,
  },
  editedAt: {
    type: Date,
    default: null,
  },
  reactions: [{
    emoji: String,
    count: Number,
    users: [String],
  }],
});

// Validation personnalisée : au moins content ou attachments doit être présent
messageSchema.pre('validate', function(next) {
  const hasContent = this.content && this.content.trim().length > 0;
  const hasAttachments = this.attachments && this.attachments.length > 0;
  
  if (!hasContent && !hasAttachments) {
    const error = new Error('Message doit contenir du texte ou des pièces jointes');
    return next(error);
  }
  
  next();
});

const Message =
  mongoose.models.Message || mongoose.model('Message', messageSchema);
export default Message;
