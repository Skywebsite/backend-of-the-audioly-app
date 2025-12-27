"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = require("mongoose");
const userSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    bio: { type: String, default: '' },
    isPrivate: { type: Boolean, default: false },
    profileImage: {
        url: { type: String, default: '' },
        publicId: { type: String, default: '' },
    },
    uploadedSongs: [{ type: mongoose_1.Types.ObjectId, ref: 'Song' }],
    friends: [{ type: mongoose_1.Types.ObjectId, ref: 'User' }],
    friendRequests: [{ type: mongoose_1.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });
exports.User = (0, mongoose_1.model)('User', userSchema);
