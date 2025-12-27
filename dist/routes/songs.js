"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../middleware/auth");
const Song_1 = require("../models/Song");
const User_1 = require("../models/User");
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// Upload audio (and optional cover) to Cloudinary and create Song
router.post('/upload', auth_1.authMiddleware, upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
]), async (req, res) => {
    try {
        const { title, category, isPublic } = req.body;
        if (!title) {
            return res.status(400).json({ message: 'Title is required' });
        }
        const files = req.files;
        const audioFile = files?.audio?.[0];
        if (!audioFile) {
            return res.status(400).json({ message: 'Audio file is required' });
        }
        const coverFile = files?.cover?.[0];
        const uploadToCloudinary = async (file, folder, resourceType) => new Promise((resolve, reject) => {
            const stream = cloudinary_1.default.uploader.upload_stream({
                folder,
                resource_type: resourceType,
            }, (error, result) => {
                if (error || !result)
                    return reject(error);
                resolve({ url: result.secure_url, public_id: result.public_id });
            });
            stream.end(file.buffer);
        });
        const owner = await User_1.User.findById(req.userId);
        const [audioUpload, coverUpload] = await Promise.all([
            uploadToCloudinary(audioFile, 'audioly/audio', 'auto'),
            coverFile ? uploadToCloudinary(coverFile, 'audioly/covers', 'image') : null,
        ]);
        const song = await Song_1.Song.create({
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
        await User_1.User.findByIdAndUpdate(req.userId, {
            $addToSet: { uploadedSongs: song.id },
        });
        return res.status(201).json(song);
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        return res.status(500).json({ message: 'Internal server error' });
    }
});
// Explore: all public songs
router.get('/explore', async (_req, res) => {
    const songs = await Song_1.Song.find({ isPublic: true }).populate('owner', 'name');
    return res.json(songs);
});
// Feed: own songs + friends' songs (public + private)
router.get('/feed', auth_1.authMiddleware, async (req, res) => {
    const me = await User_1.User.findById(req.userId);
    if (!me)
        return res.status(404).json({ message: 'User not found' });
    const ids = [me.id, ...me.friends.map((f) => f.toString())];
    const songs = await Song_1.Song.find({ owner: { $in: ids } }).populate('owner', 'name');
    return res.json(songs);
});
// Current user's own uploads
router.get('/mine', auth_1.authMiddleware, async (req, res) => {
    const songs = await Song_1.Song.find({ owner: req.userId }).sort({ createdAt: -1 });
    return res.json(songs);
});
// Update song (title, category, isPublic, cover)
router.put('/:id', auth_1.authMiddleware, upload.fields([{ name: 'cover', maxCount: 1 }]), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, category, isPublic } = req.body;
        const song = await Song_1.Song.findById(id);
        if (!song) {
            return res.status(404).json({ message: 'Song not found' });
        }
        // Check if user owns this song
        if (song.owner.toString() !== req.userId) {
            return res.status(403).json({ message: 'Not authorized' });
        }
        const files = req.files;
        const coverFile = files?.cover?.[0];
        let coverUrl = song.coverUrl;
        let coverPublicId = song.coverPublicId;
        // If new cover is uploaded, replace old one
        if (coverFile) {
            const uploadToCloudinary = async (file, folder, resourceType) => new Promise((resolve, reject) => {
                const stream = cloudinary_1.default.uploader.upload_stream({
                    folder,
                    resource_type: resourceType,
                }, (error, result) => {
                    if (error || !result)
                        return reject(error);
                    resolve({ url: result.secure_url, public_id: result.public_id });
                });
                stream.end(file.buffer);
            });
            // Delete old cover from Cloudinary if exists
            if (song.coverPublicId) {
                try {
                    await cloudinary_1.default.uploader.destroy(song.coverPublicId);
                }
                catch {
                    // ignore deletion errors
                }
            }
            const coverUpload = await uploadToCloudinary(coverFile, 'audioly/covers', 'image');
            coverUrl = coverUpload.url;
            coverPublicId = coverUpload.public_id;
        }
        // Update song
        const updateData = {};
        if (title !== undefined)
            updateData.title = title;
        if (category !== undefined)
            updateData.category = category;
        if (isPublic !== undefined) {
            updateData.isPublic = typeof isPublic === 'string' ? isPublic === 'true' : isPublic;
        }
        updateData.coverUrl = coverUrl;
        updateData.coverPublicId = coverPublicId;
        const updatedSong = await Song_1.Song.findByIdAndUpdate(id, updateData, { new: true });
        return res.json(updatedSong);
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        return res.status(500).json({ message: 'Internal server error' });
    }
});
// Delete song
router.delete('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const song = await Song_1.Song.findById(id);
        if (!song) {
            return res.status(404).json({ message: 'Song not found' });
        }
        // Check if user owns this song
        if (song.owner.toString() !== req.userId) {
            return res.status(403).json({ message: 'Not authorized' });
        }
        // Delete files from Cloudinary
        try {
            if (song.audioPublicId) {
                await cloudinary_1.default.uploader.destroy(song.audioPublicId, { resource_type: 'video' });
            }
            if (song.coverPublicId) {
                await cloudinary_1.default.uploader.destroy(song.coverPublicId);
            }
        }
        catch {
            // ignore deletion errors
        }
        // Remove from user's uploadedSongs
        await User_1.User.findByIdAndUpdate(req.userId, {
            $pull: { uploadedSongs: id },
        });
        // Delete song from database
        await Song_1.Song.findByIdAndDelete(id);
        return res.json({ message: 'Song deleted successfully' });
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        return res.status(500).json({ message: 'Internal server error' });
    }
});
exports.default = router;
