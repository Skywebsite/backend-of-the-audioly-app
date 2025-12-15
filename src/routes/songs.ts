import { Router } from 'express';
import multer from 'multer';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { Song } from '../models/Song';
import { User } from '../models/User';
import cloudinary from '../config/cloudinary';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Upload audio (and optional cover) to Cloudinary and create Song
router.post(
  '/upload',
  authMiddleware,
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  async (req: AuthRequest, res) => {
    try {
      const { title, category, isPublic } = req.body as {
        title?: string;
        category?: string;
        isPublic?: string;
      };

      if (!title) {
        return res.status(400).json({ message: 'Title is required' });
      }

      const files = req.files as {
        [fieldname: string]: Express.Multer.File[];
      };

      const audioFile = files?.audio?.[0];
      if (!audioFile) {
        return res.status(400).json({ message: 'Audio file is required' });
      }

      const coverFile = files?.cover?.[0];

      const uploadToCloudinary = async (
        file: Express.Multer.File,
        folder: string,
        resourceType: 'image' | 'video' | 'auto'
      ) =>
        new Promise<{
          url: string;
          public_id: string;
        }>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder,
              resource_type: resourceType,
            },
            (error, result) => {
              if (error || !result) return reject(error);
              resolve({ url: result.secure_url, public_id: result.public_id });
            }
          );

          stream.end(file.buffer);
        });

      const owner = await User.findById(req.userId);

      const [audioUpload, coverUpload] = await Promise.all([
        uploadToCloudinary(audioFile, 'audioly/audio', 'auto'),
        coverFile ? uploadToCloudinary(coverFile, 'audioly/covers', 'image') : null,
      ]);

      const song = await Song.create({
        owner: req.userId,
        title,
        category,
        audioUrl: audioUpload.url,
        audioPublicId: audioUpload.public_id,
        coverUrl: coverUpload?.url,
        coverPublicId: coverUpload?.public_id,
        // If account is private, force songs to be private
        isPublic: owner && owner.isPrivate ? false : isPublic ? isPublic === 'true' : true,
      });

      await User.findByIdAndUpdate(req.userId, {
        $addToSet: { uploadedSongs: song.id },
      });

      return res.status(201).json(song);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Explore: all public songs
router.get('/explore', async (_req, res) => {
  const songs = await Song.find({ isPublic: true }).populate('owner', 'name');
  return res.json(songs);
});

// Feed: own songs + friends' songs (public + private)
router.get('/feed', authMiddleware, async (req: AuthRequest, res) => {
  const me = await User.findById(req.userId);
  if (!me) return res.status(404).json({ message: 'User not found' });

  const ids = [me.id, ...me.friends.map((f) => f.toString())];

  const songs = await Song.find({ owner: { $in: ids } }).populate('owner', 'name');
  return res.json(songs);
});

// Current user's own uploads
router.get('/mine', authMiddleware, async (req: AuthRequest, res) => {
  const songs = await Song.find({ owner: req.userId }).sort({ createdAt: -1 });
  return res.json(songs);
});

export default router;


