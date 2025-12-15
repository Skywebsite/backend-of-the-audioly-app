import { Router } from 'express';
import multer from 'multer';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { User } from '../models/User';
import { Song } from '../models/Song';
import cloudinary from '../config/cloudinary';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get current user profile
router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  const user = await User.findById(req.userId).select('-password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json(user);
});

// Update basic settings (currently only isPrivate)
router.patch('/me', authMiddleware, async (req: AuthRequest, res) => {
  const { isPrivate, name } = req.body as { isPrivate?: boolean; name?: string };

  const user = await User.findByIdAndUpdate(
    req.userId,
    {
      $set: {
        ...(typeof isPrivate === 'boolean' ? { isPrivate } : {}),
        ...(name ? { name } : {}),
      },
    },
    { new: true }
  ).select('-password');

  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json(user);
});

// Update profile with optional avatar upload
router.patch(
  '/me/profile',
  authMiddleware,
  upload.single('avatar'),
  async (req: AuthRequest, res) => {
    try {
      const { name, isPrivate } = req.body as { name?: string; isPrivate?: string };

      const updates: any = {};
      if (name) updates.name = name;
      if (typeof isPrivate === 'string') updates.isPrivate = isPrivate === 'true';

      if (req.file) {
        const uploadResult = await new Promise<{ url: string; public_id: string }>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: 'audioly/avatars',
              resource_type: 'image',
            },
            (error, result) => {
              if (error || !result) return reject(error);
              resolve({ url: result.secure_url, public_id: result.public_id });
            }
          );

          stream.end(req.file.buffer);
        });

        updates.profileImage = {
          url: uploadResult.url,
          publicId: uploadResult.public_id,
        };
      }

      const user = await User.findByIdAndUpdate(
        req.userId,
        { $set: updates },
        { new: true }
      ).select('-password');

      if (!user) return res.status(404).json({ message: 'User not found' });
      return res.json(user);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      return res.status(500).json({ message: 'Failed to update profile' });
    }
  }
);

// List all users with simple status relative to current user
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const me = await User.findById(req.userId);
  if (!me) return res.status(404).json({ message: 'User not found' });

  const friends = new Set(me.friends.map((id) => id.toString()));
  const requests = new Set(me.friendRequests.map((id) => id.toString()));

  const users = await User.find({ _id: { $ne: me.id } }).select('name email isPrivate friends friendRequests');

  const result = users.map((u) => {
    const id = u.id;
    const isFriend = friends.has(id);
    const sentRequest = u.friendRequests.some((rid) => rid.toString() === me.id);
    const incomingRequest = requests.has(id);
    return {
      id,
      name: u.name,
      email: u.email,
      isPrivate: u.isPrivate,
      isFriend,
      sentRequest,
      incomingRequest,
    };
  });

  return res.json(result);
});

// Get my friends and pending requests
router.get('/friends', authMiddleware, async (req: AuthRequest, res) => {
  const me = await User.findById(req.userId)
    .populate('friends', 'name email isPrivate')
    .populate('friendRequests', 'name email isPrivate');

  if (!me) return res.status(404).json({ message: 'User not found' });

  return res.json({
    friends: me.friends,
    incomingRequests: me.friendRequests,
  });
});

// Send friend (follow) request
router.post('/request/:userId', authMiddleware, async (req: AuthRequest, res) => {
  const { userId } = req.params;
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });
  if (userId === req.userId) {
    return res.status(400).json({ message: 'Cannot send request to yourself' });
  }

  const target = await User.findById(userId);
  if (!target) return res.status(404).json({ message: 'User not found' });

  const alreadyRequested = target.friendRequests.some((id) => id.toString() === req.userId);
  const alreadyFriend = target.friends.some((id) => id.toString() === req.userId);
  if (alreadyRequested || alreadyFriend) {
    return res.status(400).json({ message: 'Already requested or friends' });
  }

  target.friendRequests.push(req.userId as any);
  await target.save();

  return res.json({ message: 'Request sent' });
});

// Accept friend request (mutual friendship)
router.post('/request/:userId/accept', authMiddleware, async (req: AuthRequest, res) => {
  const { userId } = req.params;
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const [me, other] = await Promise.all([
    User.findById(req.userId),
    User.findById(userId),
  ]);

  if (!me || !other) return res.status(404).json({ message: 'User not found' });

  // Remove from my incoming requests
  me.friendRequests = me.friendRequests.filter((id) => id.toString() !== other.id);

  const myFriends = new Set(me.friends.map((id) => id.toString()));
  const otherFriends = new Set(other.friends.map((id) => id.toString()));

  myFriends.add(other.id);
  otherFriends.add(me.id);

  me.friends = Array.from(myFriends) as any;
  other.friends = Array.from(otherFriends) as any;

  await Promise.all([me.save(), other.save()]);

  return res.json({ message: 'Request accepted' });
});

// Public profile for a given user, with privacy rules
router.get('/:userId/profile', authMiddleware, async (req: AuthRequest, res) => {
  const { userId } = req.params;
  const viewerId = String(req.userId);

  const target = await User.findById(userId);
  if (!target) return res.status(404).json({ message: 'User not found' });

  const isSelf = viewerId === String(target.id);
  const isFriend = target.friends.some((id) => id.toString() === viewerId);

  const friendsCount = target.friends.length;

  let canSeeUploads = true;
  if (!isSelf && !isFriend && target.isPrivate) {
    canSeeUploads = false;
  }

  let uploads;
  if (!canSeeUploads) {
    uploads = [];
  } else if (isSelf || isFriend) {
    uploads = await Song.find({ owner: target.id }).sort({ createdAt: -1 });
  } else {
    // public viewer, only public songs
    uploads = await Song.find({ owner: target.id, isPublic: true }).sort({ createdAt: -1 });
  }

  return res.json({
    id: target.id,
    name: target.name,
    email: target.email,
    isPrivate: target.isPrivate,
    profileImage: target.profileImage,
    friendsCount,
    uploadsCount: uploads.length,
    isSelf,
    isFriend,
    canSeeUploads,
    uploads,
  });
});

export default router;


