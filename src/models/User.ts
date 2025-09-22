import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

// Interface pour le typage TypeScript
export interface IUser {
  username: string;
  email: string;
  password: string;
  avatar?: string;
  friends?: mongoose.Types.ObjectId[];
  blockedUsers?: mongoose.Types.ObjectId[]; // 👈 ajouté
  blockedUsersWithTimestamp?: Array<{
    userId: mongoose.Types.ObjectId;
    blockedAt: Date;
  }>; // 👈 nouveau champ pour blocage temporaire
  createdAt: Date;
  updatedAt: Date;
}

// Schéma Mongoose
const userSchema = new mongoose.Schema<IUser>({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: 'default-avatar.png'
  },
  friends: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: []
  }],
  // 👇 nouveau champ pour le blocage
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: []
  }],
  // 👇 nouveau champ pour blocage temporaire (1 minute)
  blockedUsersWithTimestamp: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    blockedAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index utiles (perf sur grosses listes d'amis / blocages)
userSchema.index({ _id: 1, friends: 1 });
userSchema.index({ _id: 1, blockedUsers: 1 });

// Vérifier si le modèle existe déjà pour éviter l'erreur "Cannot overwrite model"
const User = mongoose.models.User || mongoose.model<IUser>('User', userSchema);

export default User;
