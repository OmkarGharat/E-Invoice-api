const request = require('supertest');
const app = require('../server');
const { CONSTANTS } = require('../middleware/auth');

/**
 * COMPREHENSIVE AUTHENTICATION TEST SUITE
 * Covers: API Key, Basic Auth, Bearer Token, OAuth 2.0
 */
describe('Authentication Security Suite', () => {

    const { VALID_API_KEY, VALID_USERNAME, VALID_PASSWORD, VALID_BEARER_TOKEN } = CONSTANTS;

    // Ensure helper matcher is available
    expect.extend({
        toBeOneOf(received, validValues) {
            const pass = validValues.includes(received);
            return {
                message: () => `expected ${received} to be one of ${validValues}`,
                pass: pass,
            };
        },
    });

    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer placeholder', // Placeholder to pass mandatory check, overridden by specific tests
        'x-api-key': 'placeholder' // Placeholder
    };

    // Helper to get headers with specific overrides
    const getHeaders = (overrides = {}) => {
        return { ...defaultHeaders, ...overrides };
    };

    describe('1. API Key Authentication', () => {
        const endpoint = '/api/e-invoice/invoices';

        it('should allow access with Valid API Key (Header)', async () => {
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'x-api-key': VALID_API_KEY, 'Authorization': '' }));
            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
        });

        it('should allow access with Valid API Key (Query Param)', async () => {
            // Even if query param used, headers must be present
            const res = await request(app)
                .get(`${endpoint}?api_key=${VALID_API_KEY}`)
                .set(getHeaders({ 'x-api-key': '', 'Authorization': '' }));
            expect(res.statusCode).toEqual(200);
        });

        it('should reject Invalid API Key', async () => {
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'x-api-key': 'invalid_key_12345', 'Authorization': '' }));
            expect(res.statusCode).toEqual(403);
            expect(res.body.error).toMatch(/Access Denied/);
        });

        it('should reject Missing API Key (if no other auth provided)', async () => {
            // Send empty headers to pass mandatory check, but fail auth
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'x-api-key': '', 'Authorization': '' }));
            expect(res.statusCode).toEqual(401);
        });
    });

    describe('2. Basic Authentication', () => {
        const endpoint = '/api/e-invoice/invoices';

        it('should allow access with Valid Credentials', async () => {
            // Supertest .auth() helper uses Basic Auth
            // We need to set other mandatory headers manually
            const res = await request(app)
                .get(endpoint)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/json')
                .set('x-api-key', '') // Empty API key to skip strategy 1
                .auth(VALID_USERNAME, VALID_PASSWORD);
            expect(res.statusCode).toEqual(200);
        });

        it('should reject Invalid Username', async () => {
            const res = await request(app)
                .get(endpoint)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/json')
                .set('x-api-key', '')
                .auth('wrong_user', VALID_PASSWORD);
            expect(res.statusCode).toEqual(403);
        });

        it('should reject Invalid Password', async () => {
            const res = await request(app)
                .get(endpoint)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/json')
                .set('x-api-key', '')
                .auth(VALID_USERNAME, 'wrong_pass');
            expect(res.statusCode).toEqual(403);
        });

        it('should reject Malformed Basic Header', async () => {
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'Authorization': 'Basic not_base64_encoded_garbage', 'x-api-key': '' }));
            expect(res.statusCode).not.toEqual(200);
        });
    });

    describe('3. Bearer Token Authentication', () => {
        const endpoint = '/api/e-invoice/invoices';

        it('should allow access with Valid Bearer Token', async () => {
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'Authorization': `Bearer ${VALID_BEARER_TOKEN}`, 'x-api-key': '' }));
            expect(res.statusCode).toEqual(200);
        });

        it('should reject Invalid Bearer Token', async () => {
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'Authorization': 'Bearer invalid.token.123', 'x-api-key': '' }));
            expect(res.statusCode).toEqual(403);
        });

        it('should reject Expired Bearer Token', async () => {
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'Authorization': 'Bearer expired-token', 'x-api-key': '' }));
            expect(res.statusCode).toEqual(401);
            expect(res.body.message).toMatch(/expired/i);
        });

        it('should reject Malformed Bearer Header (missing "Bearer " prefix)', async () => {
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'Authorization': VALID_BEARER_TOKEN, 'x-api-key': '' }));
            expect(res.statusCode).not.toEqual(200);
        });
    });

    describe('4. OAuth 2.0 Scenarios', () => {
        // We use the scope-protected endpoint which relies on authMiddleware.oauth2
        const endpoint = '/api/edge-cases/scope-protected';

        it('should allow access with Valid Token (Write Scope)', async () => {
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'Authorization': `Bearer ${VALID_BEARER_TOKEN}`, 'x-api-key': '' }));
            expect(res.statusCode).toEqual(200);
            expect(res.body.scopes).toContain('write');
        });

        it('should reject Token with Insufficient Scope (Read Only)', async () => {
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'Authorization': 'Bearer read-only-token', 'x-api-key': '' }));

            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toMatch(/Insufficient permissions/);
        });

        it('should reject Invalid OAuth Token', async () => {
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'Authorization': 'Bearer oauth-invalid-luck', 'x-api-key': '' }));
            expect(res.statusCode).toEqual(403);
        });

        it('should reject Blank Token', async () => {
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'Authorization': 'Bearer ', 'x-api-key': '' }));
            expect(res.statusCode).toBeOneOf([403, 401]);
        });

        it('should reject No Token', async () => {
            // Sends headers but empty authorization
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'Authorization': '', 'x-api-key': '' }));
            expect(res.statusCode).toEqual(401);
        });
    }); // End of OAuth 2.0 Scenarios

    describe('5. Mandatory Headers Security', () => {
        it('should reject request missing x-api-key', async () => {
            const res = await request(app).get('/api/e-invoice/stats')
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/json')
                .set('Authorization', 'Bearer token');
            expect(res.statusCode).toEqual(400);
            expect(res.body.error).toContain('Missing Headers');
        });

        it('should reject request missing Content-Type', async () => {
            const res = await request(app).get('/api/e-invoice/stats')
                .set('x-api-key', 'key')
                .set('Accept', 'application/json')
                .set('Authorization', 'Bearer token');
            expect(res.statusCode).toEqual(400);
        });
    });

    describe('6. Rate Limiting Security', () => {
        it('should enforce rate limits (Test Burst)', async () => {
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(
                    request(app)
                        .get('/api/edge-cases/rate-limit')
                        .set('Content-Type', 'application/json')
                        .set('Accept', 'application/json')
                        .set('Authorization', 'Bearer token')
                        .set('x-api-key', 'key')
                );
            }

            const responses = await Promise.all(promises);
            const tooManyRequests = responses.filter(r => r.statusCode === 429);
            expect(tooManyRequests.length).toBeGreaterThan(0);
        });
    });
});
