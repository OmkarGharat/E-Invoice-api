/**
 * Security Middleware Hub
 * Handles Header Validation, CSRF, Rate Limiting, and Cookie Security
 * Blocks 3 Edge Cases
 */

// Helper to parse cookies manually (since cookie-parser might not be installed)
const parseCookies = (req) => {
    const list = {};
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return list;

    cookieHeader.split(';').forEach(function (cookie) {
        let [name, ...rest] = cookie.split('=');
        name = name?.trim();
        if (!name) return;
        const value = rest.join('=').trim();
        if (!value) return;
        list[name] = decodeURIComponent(value);
    });
    return list;
};

const securityMiddleware = {
    // 1. Strict Content-Type for State Changing Methods
    requireJsonContent: (req, res, next) => {
        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            const contentType = req.headers['content-type'];

            // Missing Content-Type
            if (!contentType) {
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Missing Content-Type header'
                });
            }

            // Exception: Allow XML for the specific XML test endpoint
            if (req.originalUrl && req.originalUrl.includes('/api/e-invoice-xml')) {
                if (!contentType.toLowerCase().includes('application/json') &&
                    !contentType.toLowerCase().includes('application/xml') &&
                    !contentType.toLowerCase().includes('text/xml')) {
                    return res.status(415).json({
                        success: false,
                        error: 'Unsupported Media Type',
                        message: 'Content-Type must be application/json or application/xml'
                    });
                }
                return next();
            }

            // Wrong Content-Type
            if (!contentType.toLowerCase().includes('application/json')) {
                return res.status(415).json({
                    success: false,
                    error: 'Unsupported Media Type',
                    message: 'Content-Type must be application/json'
                });
            }
        }
        next();
    },

    // 2. Accept Header Control
    validateAccept: (req, res, next) => {
        const accept = req.headers['accept'];

        // Exception: Allow XML for the specific XML test endpoint
        if (req.originalUrl && req.originalUrl.includes('/api/e-invoice-xml')) {
            return next();
        }

        // If client explicitly asks for XML (which we don't support)
        if (accept && accept.toLowerCase().includes('application/xml')) {
            return res.status(406).json({
                success: false,
                error: 'Not Acceptable',
                message: 'API only supports application/json'
            });
        }
        next();
    },

    // 7. Rate Limiting (Actual Implementation)
    // Simple in-memory rate limiter for demonstration
    rateLimiter: (req, res, next) => {
        // Use global mock storage for simplicity in this demo environment
        if (!global.rateLimitStore) global.rateLimitStore = {};

        const ip = req.ip || '127.0.0.1';
        const now = Date.now();
        const windowMs = 60 * 1000; // 1 minute window
        const limit = 5; // Low limit for easy testing

        if (!global.rateLimitStore[ip]) {
            global.rateLimitStore[ip] = { count: 0, startTime: now };
        }

        const data = global.rateLimitStore[ip];

        // Reset if window passed
        if (now - data.startTime > windowMs) {
            data.count = 0;
            data.startTime = now;
        }

        data.count++;

        // Set Response Headers (Response Only)
        res.setHeader('X-RateLimit-Limit', limit);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - data.count));

        if (data.count > limit) {
            return res.status(429).json({
                success: false,
                error: 'Too Many Requests',
                message: 'Rate limit exceeded. Please try again later.'
            });
        }

        next();
    },

    // 9. CSRF Double Submit Cookie Pattern (Strict Enforcement)
    csrfProtection: (req, res, next) => {
        // Skip for read-only methods
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

        const cookies = parseCookies(req);
        const headerToken = req.headers['x-csrf-token'];
        const cookieToken = cookies['CSRF-TOKEN'];

        // Strict: BOTH must exist and match
        if (!cookieToken || !headerToken || cookieToken !== headerToken) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'CSRF Validation Failed. Missing or mismatched token (Double Submit Cookie required).'
            });
        }
        next();
    },

    // 4. Mandatory Headers Check
    validateMandatoryHeaders: (req, res, next) => {
        // Skip for OPTIONS (CORS preflight)
        if (req.method === 'OPTIONS') return next();

        const missing = [];
        if (req.headers['authorization'] === undefined) missing.push('Authorization');
        if (req.headers['content-type'] === undefined) missing.push('Content-Type');
        if (req.headers['accept'] === undefined) missing.push('Accept');
        if (req.headers['x-api-key'] === undefined) missing.push('x-api-key');

        if (missing.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Missing Headers',
                message: `The following headers are mandatory: ${missing.join(', ')}`
            });
        }
        next();
    },

    // Cookie Validation Helper
    validateSessionCookie: (req, res, next) => {
        const cookies = parseCookies(req);
        const sessionCookie = cookies['JSESSIONID'];

        // Check for "wrong name" trap
        if (cookies['session'] && !sessionCookie) {
            // Just specific logic for the interview trap example
            // We don't fail here, but we log or potentially fail if strictly required
        }

        next();
    }
};

module.exports = securityMiddleware;
