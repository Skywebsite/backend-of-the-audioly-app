"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../middleware/auth");
const User_1 = require("../models/User");
const Song_1 = require("../models/Song");
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// Get current user profile
router.get('/me', auth_1.authMiddleware, async (req, res) => {
    const user = await User_1.User.findById(req.userId).select('-password');
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    return res.json(user);
});
// Update basic settings (name / username / privacy)
router.patch('/me', auth_1.authMiddleware, async (req, res) => {
    const { isPrivate, name, username } = req.body;
    const updates = {
        ...(typeof isPrivate === 'boolean' ? { isPrivate } : {}),
        ...(name ? { name } : {}),
    };
    if (username) {
        const normalized = username.trim().toLowerCase();
        const existing = await User_1.User.findOne({ _id: { $ne: req.userId }, username: normalized });
        if (existing) {
            return res.status(409).json({ message: 'Username already taken' });
        }
        updates.username = normalized;
    }
    const user = await User_1.User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true }).select('-password');
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    return res.json(user);
});
// Update profile with optional avatar upload
router.patch('/me/profile', auth_1.authMiddleware, upload.single('avatar'), async (req, res) => {
    try {
        const { name, isPrivate } = req.body;
        const updates = {};
        if (name)
            updates.name = name;
        if (typeof isPrivate === 'string')
            updates.isPrivate = isPrivate === 'true';
        if (req.file) {
            const file = req.file;
            const uploadResult = await new Promise((resolve, reject) => {
                const stream = cloudinary_1.default.uploader.upload_stream({
                    folder: 'audioly/avatars',
                    resource_type: 'image',
                }, (error, result) => {
                    if (error || !result)
                        return reject(error);
                    resolve({ url: result.secure_url, public_id: result.public_id });
                });
                stream.end(file.buffer);
            });
            updates.profileImage = {
                url: uploadResult.url,
                publicId: uploadResult.public_id,
            };
        }
        const user = await User_1.User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true }).select('-password');
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        return res.json(user);
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        return res.status(500).json({ message: 'Failed to update profile' });
    }
});
// List all users with simple status relative to current user
router.get('/', auth_1.authMiddleware, async (req, res) => {
    const me = await User_1.User.findById(req.userId);
    if (!me)
        return res.status(404).json({ message: 'User not found' });
    const friends = new Set(me.friends.map((id) => id.toString()));
    const requests = new Set(me.friendRequests.map((id) => id.toString()));
    const users = await User_1.User.find({ _id: { $ne: me.id } }).select('name username profileImage isPrivate friends friendRequests');
    const result = users.map((u) => {
        const id = u.id;
        const isFriend = friends.has(id);
        const sentRequest = u.friendRequests.some((rid) => rid.toString() === me.id);
        const incomingRequest = requests.has(id);
        return {
            id,
            name: u.name,
            username: u.username,
            profileImage: u.profileImage,
            isPrivate: u.isPrivate,
            isFriend,
            sentRequest,
            incomingRequest,
        };
    });
    return res.json(result);
});
// Get my friends and pending requests
router.get('/friends', auth_1.authMiddleware, async (req, res) => {
    const me = await User_1.User.findById(req.userId)
        .populate('friends', 'name username email isPrivate profileImage')
        .populate('friendRequests', 'name username email isPrivate profileImage');
    if (!me)
        return res.status(404).json({ message: 'User not found' });
    return res.json({
        friends: me.friends,
        incomingRequests: me.friendRequests,
    });
});
// Send friend (follow) request
router.post('/request/:userId', auth_1.authMiddleware, async (req, res) => {
    const { userId } = req.params;
    if (!req.userId)
        return res.status(401).json({ message: 'Unauthorized' });
    if (userId === req.userId) {
        return res.status(400).json({ message: 'Cannot send request to yourself' });
    }
    const target = await User_1.User.findById(userId);
    if (!target)
        return res.status(404).json({ message: 'User not found' });
    const alreadyRequested = target.friendRequests.some((id) => id.toString() === req.userId);
    const alreadyFriend = target.friends.some((id) => id.toString() === req.userId);
    if (alreadyRequested || alreadyFriend) {
        return res.status(400).json({ message: 'Already requested or friends' });
    }
    target.friendRequests.push(req.userId);
    await target.save();
    return res.json({ message: 'Request sent' });
});
// Accept friend request (mutual friendship)
router.post('/request/:userId/accept', auth_1.authMiddleware, async (req, res) => {
    const { userId } = req.params;
    if (!req.userId)
        return res.status(401).json({ message: 'Unauthorized' });
    const [me, other] = await Promise.all([
        User_1.User.findById(req.userId),
        User_1.User.findById(userId),
    ]);
    if (!me || !other)
        return res.status(404).json({ message: 'User not found' });
    // Remove from my incoming requests
    me.friendRequests = me.friendRequests.filter((id) => id.toString() !== other.id);
    const myFriends = new Set(me.friends.map((id) => id.toString()));
    const otherFriends = new Set(other.friends.map((id) => id.toString()));
    myFriends.add(other.id);
    otherFriends.add(me.id);
    me.friends = Array.from(myFriends);
    other.friends = Array.from(otherFriends);
    await Promise.all([me.save(), other.save()]);
    return res.json({ message: 'Request accepted' });
});
// Public profile for a given user, with privacy rules
router.get('/:userId/profile', auth_1.authMiddleware, async (req, res) => {
    const { userId } = req.params;
    const viewerId = String(req.userId);
    const target = await User_1.User.findById(userId);
    if (!target)
        return res.status(404).json({ message: 'User not found' });
    const isSelf = viewerId === String(target.id);
    const isFriend = target.friends.some((id) => id.toString() === viewerId);
    const friendsCount = target.friends.length;
    let canSeeUploads = true;
    if (!isSelf && !isFriend && target.isPrivate) {
        canSeeUploads = false;
    }
    let uploads = [];
    if (!canSeeUploads) {
        uploads = [];
    }
    else if (isSelf || isFriend) {
        uploads = await Song_1.Song.find({ owner: target.id }).sort({ createdAt: -1 });
    }
    else {
        // public viewer, only public songs
        uploads = await Song_1.Song.find({ owner: target.id, isPublic: true }).sort({ createdAt: -1 });
    }
    return res.json({
        id: target.id,
        name: target.name,
        username: target.username,
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
exports.default = router;
