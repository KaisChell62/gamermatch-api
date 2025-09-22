import { Request, Response } from 'express';
import Ticket, { ITicket } from '../models/ticketModel';

// Obtenir tous les tickets pour les administrateurs
export const getTickets = async (req: Request, res: Response): Promise<void> => {
  try {
    const tickets: ITicket[] = await Ticket.find();
    res.status(200).json(tickets);
  } catch (err: any) {
    console.error('[GET /api/tickets] Error fetching tickets:', err);
    res.status(500).json({ error: "Failed to fetch tickets.", details: err.message });
  }
};

// Obtenir les tickets pour un utilisateur connecté
export const getUserTickets = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized. User ID not provided." });
      return;
    }

    const tickets: ITicket[] = await Ticket.find({ userId });
    res.status(200).json(tickets);
  } catch (err: any) {
    console.error('[GET /api/tickets/user] Error fetching user tickets:', err);
    res.status(500).json({ error: "Failed to fetch user tickets.", details: err.message });
  }
};

// Créer un nouveau ticket
export const createTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    const { subject, message, priority, category, attachments } = req.body;

    if (!subject || !message || !priority || !category) {
      res.status(400).json({ error: "All fields (subject, message, priority, category) are required." });
      return;
    }

    const newTicket = new Ticket({
      userId: req.user?.id || 'default-user-id', 
      subject,
      message,
      priority,
      category,
      attachments: attachments || [],
      status: 'in_progress',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await newTicket.save();
    res.status(201).json(newTicket);
  } catch (err: any) {
    console.error('[POST /api/tickets] Error creating ticket:', err);
    res.status(500).json({ error: "Failed to create ticket.", details: err.message });
  }
};

// Mettre à jour un ticket existant
export const updateTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ticketId } = req.params;

    const updatedTicket = await Ticket.findByIdAndUpdate(ticketId, req.body, { new: true });
    if (!updatedTicket) {
      res.status(404).json({ error: "Ticket not found." });
      return;
    }

    res.status(200).json(updatedTicket);
  } catch (err: any) {
    console.error('[PUT /api/tickets/:ticketId] Error updating ticket:', err);
    res.status(500).json({ error: "Failed to update ticket." });
  }
};

// Supprimer un ticket
export const deleteTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ticketId } = req.params;

    const deletedTicket = await Ticket.findByIdAndDelete(ticketId);
    if (!deletedTicket) {
      res.status(404).json({ error: "Ticket not found." });
      return;
    }

    res.status(204).send();
  } catch (err: any) {
    console.error('[DELETE /api/tickets/:ticketId] Error deleting ticket:', err);
    res.status(500).json({ error: "Failed to delete ticket." });
  }
};

// Mettre à jour le statut d'un ticket
export const updateTicketStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ticketId } = req.params;
    const { status } = req.body;

    console.log(`🟢 [BACKEND] Tentative de mise à jour : Ticket ID = "${ticketId}", Nouveau statut = "${status}"`);

    if (!ticketId) {
      console.error("❌ ERREUR: Aucun Ticket ID fourni");
      res.status(400).json({ error: "Ticket ID is required in the URL." });
      return;
    }

    if (!status) {
      console.error("❌ ERREUR: Aucun statut fourni");
      res.status(400).json({ error: "Status is required in the request body." });
      return;
    }

    const validStatuses = ['open', 'in_progress', 'closed'];
    if (!validStatuses.includes(status)) {
      console.error("❌ ERREUR: Statut invalide");
      res.status(400).json({ error: `Invalid status. Allowed values: ${validStatuses.join(', ')}` });
      return;
    }

    const updatedTicket = await Ticket.findByIdAndUpdate(
      ticketId,
      { 
        status,
        updatedAt: new Date()
      },
      { 
        new: true,
        runValidators: false // Désactive la validation pour cette mise à jour
      }
    );

    if (!updatedTicket) {
      console.error("❌ ERREUR: Ticket introuvable");
      res.status(404).json({ error: "Ticket not found." });
      return;
    }

    console.log(`✅ [BACKEND] Mise à jour réussie : ${JSON.stringify(updatedTicket)}`);
    res.status(200).json(updatedTicket);
  } catch (err: any) {
    console.error('[PUT /api/tickets/:ticketId/status] ❌ ERREUR:', err);
    res.status(500).json({ error: "Failed to update ticket status.", details: err.message });
  }
};

