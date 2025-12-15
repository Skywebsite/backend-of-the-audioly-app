import { Schema, model, Types, Document } from 'mongoose';

export interface ISong extends Document {
  owner: Types.ObjectId;
  title: string;
  category?: string;
  audioUrl: string;
  audioPublicId?: string;
  coverUrl?: string;
  coverPublicId?: string;
  isPublic: boolean;
}

const songSchema = new Schema<ISong>(
  {
    owner: { type: Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    audioUrl: { type: String, required: true },
    audioPublicId: { type: String },
    coverUrl: { type: String },
    coverPublicId: { type: String },
    isPublic: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Song = model<ISong>('Song', songSchema);


