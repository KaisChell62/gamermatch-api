import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';

/**
 * Petit helper : vérifie la validité d'un ObjectId Mongo.
 */
function isValidObjectId(id?: string): boolean {
  return !!id && mongoose.Types.ObjectId.isValid(id);
}

/**
 * Retourne deux indicateurs :
 * - blockedByMe: est-ce que "meId" a bloqué "otherId" ?
 * - blockedMe:   est-ce que "otherId" a bloqué "meId" ?
 */
export async function getBlockFlags(meId: string, otherId: string): Promise<{ blockedByMe: boolean; blockedMe: boolean }> {
  const [me, other] = await Promise.all([
    User.findById(meId).select('blockedUsers'),
    User.findById(otherId).select('blockedUsers'),
  ]);

  const meBlocked = !!me && (me.blockedUsers || []).some((id: mongoose.Types.ObjectId) => id.equals(new mongoose.Types.ObjectId(otherId)));
  const otherBlocked = !!other && (other.blockedUsers || []).some((id: mongoose.Types.ObjectId) => id.equals(new mongoose.Types.ObjectId(meId)));

  return { blockedByMe: meBlocked, blockedMe: otherBlocked };
}

/**
 * Middleware d'envoi : empêche l'envoi d'un message si blocage.
 *
 * - 403 { code: 'blocked_by_you' }        si l'expéditeur a bloqué le destinataire
 * - 403 { code: 'blocked_by_recipient' }  si le destinataire a bloqué l'expéditeur
 *
 * Hypothèses :
 * - `auth` a déjà ajouté `req.user?.id`
 * - le body contient `receiverId`
 */
export async function ensureNotBlockedForSend(req: Request, res: Response, next: NextFunction) {
  try {
    // @ts-ignore - req.user injecté par auth middleware
    const meId: string | undefined = req.user?.id;
    const { receiverId } = req.body as { receiverId?: string };

    if (!meId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }
    if (!isValidObjectId(receiverId)) {
      res.status(400).json({ message: 'receiverId invalide' });
      return;
    }

    const { blockedByMe, blockedMe } = await getBlockFlags(meId, receiverId!);

    if (blockedByMe) {
      res.status(403).json({
        code: 'blocked_by_you',
        message: 'Vous avez bloqué cet utilisateur. Débloquez-le pour reprendre la conversation.',
      });
      return;
    }

    if (blockedMe) {
      res.status(403).json({
        code: 'blocked_by_recipient',
        message: 'Cet utilisateur vous a bloqué. Vous ne pouvez pas lui envoyer de message.',
      });
      return;
    }

    next();
  } catch (err) {
    console.error('[ensureNotBlockedForSend] ❌ Error:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
}

/**
 * (Optionnel) Middleware lecture conversation : ajoute les flags de blocage sur req
 * pour que la route puisse les renvoyer au front si besoin.
 *
 * Usage dans une route :
 *   router.get('/conversation/:friendId', auth, attachBlockFlags, (req, res) => {
 *     const flags = (req as any).blockFlags as { blockedByMe: boolean; blockedMe: boolean };
 *     ...
 *   });
 */
export async function attachBlockFlags(req: Request, res: Response, next: NextFunction) {
  try {
    // @ts-ignore
    const meId: string | undefined = req.user?.id;
    const { friendId, recipientId } = req.params as { friendId?: string; recipientId?: string };
    const otherId = friendId || recipientId;

    if (!meId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }
    if (!isValidObjectId(otherId)) {
      res.status(400).json({ message: 'friendId/recipientId invalide' });
      return;
    }

    const flags = await getBlockFlags(meId, otherId!);
    (req as any).blockFlags = flags;
    next();
  } catch (err) {
    console.error('[attachBlockFlags] ❌ Error:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
}
