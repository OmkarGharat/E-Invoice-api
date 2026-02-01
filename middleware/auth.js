/**
 * Authentication Middleware Hub
 * Handles multiple authentication strategies
 */

// realistic production-like credentials
const VALID_API_KEY = "ei_demo_8x92m3c7-4j5k-2h1g-9s8d-7f6g5h4j3k2l";
const VALID_USERNAME = "einvoice_sys_admin";
const VALID_PASSWORD = "SecurePass!@#2024";
// Realistic looking JWT (Header.Payload.Signature)
const VALID_BEARER_TOKEN = "eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlByb2RBZG1pbiIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
const MOCK_JWT_SECRET = "production-secret-key-do-not-reveal";

// Helper to decode Base64
const decodeBase64 = (str) => Buffer.from(str, 'base64').toString('ascii');

const authMiddleware = {
    // 1. API Key Authentication
    apiKey: (req, res, next) => {
        const apiKey = req.headers['x-api-key'] || req.query.api_key;

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'Authentication Failed',
                message: 'Missing x-api-key header or api_key query parameter'
            });
        }

        if (apiKey !== VALID_API_KEY) {
            return res.status(403).json({
                success: false,
                error: 'Access Denied',
                message: 'Invalid API Key'
            });
        }

        req.auth = { type: 'API Key' };
        next();
    },

    // 2. Basic Authentication
    basicAuth: (req, res, next) => {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Basic ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication Failed',
                message: 'Missing or invalid Authorization header (Basic)'
            });
        }

        const token = authHeader.split(' ')[1];
        const credentials = decodeBase64(token);
        const [username, password] = credentials.split(':');

        if (username !== VALID_USERNAME || password !== VALID_PASSWORD) {
            return res.status(403).json({
                success: false,
                error: 'Access Denied',
                message: 'Invalid username or password'
            });
        }

        req.auth = { type: 'Basic Auth', user: username };
        next();
    },

    // 3. Bearer Token (Simulated JWT)
    bearerToken: (req, res, next) => {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication Failed',
                message: 'Missing or invalid Authorization header (Bearer)'
            });
        }

        const token = authHeader.split(' ')[1];

        // Edge Case: Expired Token
        if (token === "expired-token" || token.includes("expired")) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'Token has expired'
            });
        }

        if (token !== VALID_BEARER_TOKEN) {
            // Strict check: Only matching the specific valid token
            return res.status(403).json({
                success: false,
                error: 'Access Denied',
                message: 'Invalid Bearer Token'
            });
        }

        req.auth = { type: 'Bearer Token', token: token };
        next();
    },

    // 4. OAuth 2.0 (Simulated)
    oauth2: (req, res, next) => {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication Failed',
                message: 'Missing Authorization header'
            });
        }

        const token = authHeader.split(' ')[1];

        // Edge Case: Wrong Scope Token
        if (token === "read-only-token") {
            req.auth = { type: 'OAuth 2.0', scopes: ['read'] };
            return next();
        }

        // Simulate token validation (e.g., expiry, scope)
        if (token !== VALID_BEARER_TOKEN) {
            return res.status(403).json({
                success: false,
                error: 'Access Denied',
                message: 'Invalid OAuth Token.'
            });
        }

        req.auth = { type: 'OAuth 2.0', scopes: ['read', 'write'] };
        next();
    },

    // Helper: Verify Scopes
    requireScope: (requiredScope) => {
        return (req, res, next) => {
            const userScopes = req.auth?.scopes || [];
            if (!userScopes.includes(requiredScope)) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    message: `Insufficient permissions. Required scope: ${requiredScope}`
                });
            }
            next();
        };
    },

    // 5. Session Cookie Auth (Simulated for Block 3)
    sessionAuth: (req, res, next) => {
        const cookieHeader = req.headers.cookie;

        // Check for JSESSIONID (Strict Name Check)
        if (!cookieHeader || !cookieHeader.match(/JSESSIONID=[^;]+/)) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'Authentication failed: Missing JSESSIONID cookie'
            });
        }

        next();
    },

    // 6. Universal Auth (Combined)
    // Allows API Key, Basic Auth, OR Bearer Token
    anyAuth: (req, res, next) => {
        const apiKey = req.headers['x-api-key'] || req.query.api_key;
        const authHeader = req.headers.authorization;

        // Strategy 1: API Key
        if (apiKey) {
            if (apiKey === VALID_API_KEY) {
                req.auth = { type: 'API Key' };
                return next();
            }
            return res.status(403).json({ success: false, error: 'Access Denied', message: 'Invalid API Key' });
        }

        // Strategy 2: Authorization Header (Basic or Bearer)
        if (authHeader) {
            if (authHeader.startsWith('Basic ')) {
                // Validate Basic
                const token = authHeader.split(' ')[1];
                const credentials = decodeBase64(token);
                const [username, password] = credentials.split(':');

                if (username === VALID_USERNAME && password === VALID_PASSWORD) {
                    req.auth = { type: 'Basic Auth', user: username };
                    return next();
                }
                return res.status(403).json({ success: false, error: 'Access Denied', message: 'Invalid Basic credentials' });

            } else if (authHeader.startsWith('Bearer ')) {
                // Validate Bearer
                const token = authHeader.split(' ')[1];

                // Check Expiry
                if (token === "expired-token" || token.includes("expired")) {
                    return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Token has expired' });
                }

                // Check Validity
                if (token === VALID_BEARER_TOKEN) {
                    req.auth = { type: 'Bearer Token', token: token };
                    return next();
                }
                return res.status(403).json({ success: false, error: 'Access Denied', message: 'Invalid Bearer/OAuth Token' });
            }
        }

        // Strategy 3: Session Cookie (Optional, but included for completeness)
        // const cookieHeader = req.headers.cookie;
        // if (cookieHeader && cookieHeader.match(/JSESSIONID=[^;]+/)) {
        //     return next();
        // }

        // Failure: No valid auth found
        return res.status(401).json({
            success: false,
            error: 'Authentication Required',
            message: 'You must provide a valid Authentication method (API Key, Basic Auth, or Bearer Token) to access this endpoint.'
        });
    }

};

module.exports = {
    authMiddleware,
    CONSTANTS: {
        VALID_API_KEY,
        VALID_USERNAME,
        VALID_PASSWORD,
        VALID_BEARER_TOKEN
    }
};
