import mongoose, { Document, Schema } from 'mongoose';

// Interface pour un ticket
export interface ITicket extends Document {
  userId: string;
  subject: string;
  message: string;
  priority: string;
  category: string;
  status: 'open' | 'in_progress' | 'closed';
  createdAt: Date;
  updatedAt: Date;
  attachments?: { name: string; url: string }[];
}

// Schéma de données pour un ticket
const TicketSchema: Schema = new Schema({
  userId: {
    type: String,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  priority: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'closed'],
    default: 'in_progress',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  attachments: [
    {
      name: { type: String },
      url: { type: String },
    },
  ],
});

// Crée un modèle de ticket basé sur le schéma défini
const Ticket = mongoose.model<ITicket>('Ticket', TicketSchema);

export default Ticket;
