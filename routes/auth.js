const express = require('express');
const router = express.Router();
const { authMiddleware, CONSTANTS } = require('../middleware/auth');

// Login-specific rate limiter (stricter than general rate limiter)
const loginRateLimitStore = {};
const loginRateLimiter = (req, res, next) => {
    const ip = req.ip || '127.0.0.1';
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minute window
    const limit = 10; // 10 login attempts per 15 minutes

    if (!loginRateLimitStore[ip]) {
        loginRateLimitStore[ip] = { count: 0, startTime: now };
    }

    const data = loginRateLimitStore[ip];

    // Reset if window passed
    if (now - data.startTime > windowMs) {
        data.count = 0;
        data.startTime = now;
    }

    data.count++;

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - data.count));

    if (data.count > limit) {
        return res.status(429).json({
            success: false,
            error: 'Too Many Requests',
            message: 'Too many login attempts. Please try again later.'
        });
    }

    next();
};

// ==================== AUTHENTICATION PROVIDER ENDPOINTS ====================

// 1. Get API Key Information
router.get('/credentials', (req, res) => {
    res.json({
        success: true,
        message: "Use these credentials to test authentication",
        credentials: {
            apiKey: CONSTANTS.VALID_API_KEY,
            basicAuth: {
                username: CONSTANTS.VALID_USERNAME,
                password: CONSTANTS.VALID_PASSWORD
            },
            bearerToken: CONSTANTS.VALID_BEARER_TOKEN
        }
    });
});

// 2. Login (for Bearer/OAuth flow)
router.post('/login', loginRateLimiter, (req, res) => {
    const { username, password, grant_type } = req.body;

    // NoSQL injection prevention: ensure inputs are strings
    if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'Username and password must be strings'
        });
    }

    // Reject empty credentials
    if (!username.trim() || !password.trim()) {
        return res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'Username and password are required'
        });
    }

    // Simple mock login
    if (username === CONSTANTS.VALID_USERNAME && password === CONSTANTS.VALID_PASSWORD) {

        let token = CONSTANTS.VALID_BEARER_TOKEN;
        let type = "Bearer";
        let expiresIn = 3600;

        if (grant_type === 'client_credentials' || grant_type === 'authorization_code') {
            token = "oauth-" + Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
            type = "OAuth 2.0";
        }

        res.json({
            success: true,
            access_token: token,
            token_type: "Bearer",
            expires_in: expiresIn,
            scope: "read write"
        });
    } else {
        res.status(401).json({
            success: false,
            message: "Invalid credentials"
        });
    }
});

// ==================== PROTECTED ROUTES (TESTING GROUND) ====================

// Test API Key
router.get('/test/api-key', authMiddleware.apiKey, (req, res) => {
    res.json({
        success: true,
        message: "You have successfully accessed the API Key protected endpoint!",
        authData: req.auth
    });
});

// Test Basic Auth
router.get('/test/basic', authMiddleware.basicAuth, (req, res) => {
    res.json({
        success: true,
        message: "You have successfully accessed the Basic Auth protected endpoint!",
        authData: req.auth
    });
});

// Test Bearer Token
router.get('/test/bearer', authMiddleware.bearerToken, (req, res) => {
    res.json({
        success: true,
        message: "You have successfully accessed the Bearer Token protected endpoint!",
        authData: req.auth
    });
});

// Test OAuth 2.0
router.get('/test/oauth', authMiddleware.oauth2, (req, res) => {
    res.json({
        success: true,
        message: "You have successfully accessed the OAuth 2.0 protected endpoint!",
        authData: req.auth
    });
});

// 3. Session Login (Sets Cookie)
router.post('/session-login', (req, res) => {
    const { username, password } = req.body;
    if (username === CONSTANTS.VALID_USERNAME && password === CONSTANTS.VALID_PASSWORD) {
        // Set JSESSIONID cookie
        res.setHeader('Set-Cookie', 'JSESSIONID=valid-session-id-123; Path=/; HttpOnly');
        res.json({
            success: true,
            message: "Session login successful",
            sessionId: "valid-session-id-123"
        });
    } else {
        res.status(401).json({ success: false, message: "Invalid credentials" });
    }
});

// Test Session Auth (Dashboard)
router.get('/test/session', authMiddleware.sessionAuth, (req, res) => {
    res.json({
        success: true,
        message: "You have successfully accessed the Session protected dashboard!",
        user: CONSTANTS.VALID_USERNAME
    });
});

module.exports = router;
