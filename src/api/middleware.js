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

        if (config.discord.adminIds.length > 0) {
            if (!config.discord.adminIds.includes(decoded.id)) {
                logger.warn(`Unauthorized access attempt by ${decoded.username} (${decoded.id})`);
                return res.status(403).json({ error: 'Access denied. You are not a bot admin.' });
            }
        }

        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ error: 'Token expired' });
        }
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        return res.status(500).json({ error: 'Authentication error' });
    }
}
