import { Router } from 'express';
import {
  getTickets,
  getUserTickets,
  createTicket,
  updateTicket,
  deleteTicket,
  updateTicketStatus,
} from '../controllers/ticketController';
import {
  getMessages,
  createMessage,
} from '../controllers/messageController';
import { auth } from '../middleware/auth';

const router = Router();

// Route pour récupérer tous les tickets (admin)
router.get('/', getTickets);

// Route pour récupérer tous les tickets pour admin
router.get('/admin', auth, getTickets);

// Route pour récupérer les tickets de l'utilisateur connecté
router.get('/user', auth, getUserTickets);

// Route pour créer un ticket
router.post('/', auth, createTicket);

// Route pour mettre à jour un ticket
router.put('/:ticketId', updateTicket);

// Route pour mettre à jour le statut d'un ticket
router.put('/:ticketId/status', updateTicketStatus);

// Route pour récupérer les messages associés à un ticket
router.get('/:ticketId/messages', getMessages);

// Route pour ajouter un message à un ticket (avec gestion des fichiers)
router.post(
  '/:ticketId/messages',
  createMessage
);

// Route pour supprimer un ticket
router.delete('/:ticketId', deleteTicket);

export default router;
