"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const User_1 = require("../models/User");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, username } = req.body;
        if (!name || !email || !password || !username) {
            return res
                .status(400)
                .json({ message: 'Name, email, username and password are required' });
        }
        const normalizedUsername = String(username).trim().toLowerCase();
        const existing = await User_1.User.findOne({
            $or: [{ email: email.toLowerCase() }, { username: normalizedUsername }],
        });
        if (existing) {
            if (existing.email.toLowerCase() === email.toLowerCase()) {
                return res.status(409).json({ message: 'Email already in use' });
            }
            if (existing.username === normalizedUsername) {
                return res.status(409).json({ message: 'Username already taken' });
            }
        }
        const hashed = await bcryptjs_1.default.hash(password, 10);
        const user = await User_1.User.create({
            name,
            email: email.toLowerCase(),
            username: normalizedUsername,
            password: hashed,
        });
        const accessToken = (0, auth_1.signAccessToken)(user.id);
        const refreshToken = (0, auth_1.signRefreshToken)(user.id);
        return res.status(201).json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                username: user.username,
            },
            tokens: {
                accessToken,
                refreshToken,
            },
        });
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        return res.status(500).json({ message: 'Internal server error' });
    }
});
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }
        const user = await User_1.User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const ok = await bcryptjs_1.default.compare(password, user.password);
        if (!ok) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const accessToken = (0, auth_1.signAccessToken)(user.id);
        const refreshToken = (0, auth_1.signRefreshToken)(user.id);
        return res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                username: user.username,
            },
            tokens: {
                accessToken,
                refreshToken,
            },
        });
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        return res.status(500).json({ message: 'Internal server error' });
    }
});
exports.default = router;
