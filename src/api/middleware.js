/**
 * API Middleware
 * JWT authentication and authorization for dashboard API
 */

import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('API:Auth');

/**
 * Generate a JWT token for a Discord user
 */
export function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
        },
        config.api.secret,
        { expiresIn: '7d' }
    );
}

/**
 * Verify JWT token middleware
 */
export function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, config.api.secret);
        req.user = decoded;

        // Check if user is an admin (if BOT_ADMIN_IDS is configured)
        if (config.discord.adminIds.length > 0) {
            if (!config.discord.adminIds.includes(decoded.id)) {
                logger.warn(`Unauthorized access attempt by ${decoded.username} (${decoded.id})`);
                return res.status(403).json({ error: 'Access denied. You are not a bot admin.' });
            }
        }

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(401).json({ error: 'Invalid token' });
    }
}
