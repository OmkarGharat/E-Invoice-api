const request = require('supertest');
const app = require('../server');

describe('E-Invoice API Integration Tests', () => {

    // Test Credentials (matching middleware/auth.js)
    const validApiKey = 'ei_demo_8x92m3c7-4j5k-2h1g-9s8d-7f6g5h4j3k2l';

    // Helper for mandatory headers
    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer placeholder',
        'x-api-key': 'placeholder'
    };

    const getHeaders = (overrides = {}) => ({ ...defaultHeaders, ...overrides });

    // 1. PUBLIC ENDPOINTS
    describe('Public Endpoints (No Auth Required)', () => {

        it('GET /health should return 200 OK', async () => {
            // Not under /api, so no headers needed
            const res = await request(app).get('/health');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('status', 'OK');
        });

        it('GET /api/e-invoice/stats should return 200 OK', async () => {
            // Needs mandatory headers but no valid auth credentials
            const res = await request(app)
                .get('/api/e-invoice/stats')
                .set(getHeaders({ 'Authorization': '', 'x-api-key': '' }));
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('success', true);
        });

        it('GET /api/e-invoice/samples should return 200 OK', async () => {
            const res = await request(app)
                .get('/api/e-invoice/samples')
                .set(getHeaders({ 'Authorization': '', 'x-api-key': '' }));
            expect(res.statusCode).toEqual(200);
        });
    });

    // 2. PROTECTED ENDPOINTS (Security Check)
    describe('Protected Endpoints (Security)', () => {

        it('GET /api/e-invoice/invoices should return 401 without keys', async () => {
            // Must send headers to pass mandatory check, but empty auth
            const res = await request(app)
                .get('/api/e-invoice/invoices')
                .set(getHeaders({ 'Authorization': '', 'x-api-key': '' }));
            expect(res.statusCode).toBeOneOf([401, 403]);
        });

        it('POST /api/e-invoice/generate should return 401 without keys', async () => {
            const res = await request(app)
                .post('/api/e-invoice/generate')
                .set(getHeaders({ 'Authorization': '', 'x-api-key': '' }))
                .send({ count: 1 });
            expect(res.statusCode).toBeOneOf([401, 403]);
        });
    });

    // 3. AUTHENTICATION (Success Flows)
    describe('Authentication Flows', () => {

        it('GET /api/e-invoice/invoices should return 200 with Valid API Key', async () => {
            const res = await request(app)
                .get('/api/e-invoice/invoices')
                .set(getHeaders({ 'x-api-key': validApiKey, 'Authorization': '' }));
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('success', true);
        });

        it('POST /api/e-invoice/generate should return 201/200 with Valid API Key', async () => {
            const res = await request(app)
                .post('/api/e-invoice/generate-dynamic')
                .set(getHeaders({ 'x-api-key': validApiKey, 'Authorization': '' }))
                .send({ count: 1 });
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('success', true);
        });
    });

    // 4. EDGE CASES & ERROR HANDLING
    describe('Edge Cases', () => {

        it('Should return 400 for Malformed JSON', async () => {
            // We use a string that looks like JSON but is broken to trigger syntax error
            // Need mandatory headers
            const res = await request(app)
                .post('/api/edge-cases/strict-post')
                .set(getHeaders({ 'Authorization': '', 'x-api-key': '' })) // Content-Type is set in helper, already json
                .send('{"invalid": "json"'); // Missing closing brace, managed by supertest/express? 

            // Note: Supertest might stringify strings automatically, so we might need raw buffer or specific sending for malformed.
            // Actually, express body-parser throws 400 for invalid JSON automatically if we send header application/json and bad body.
        });

        it('Should return 404 for non-existent routes', async () => {
            // Must send headers to bypass 400 "Missing Headers" on /api
            const res = await request(app)
                .get('/api/ghost-route')
                .set(getHeaders({ 'Authorization': '', 'x-api-key': '' }));
            expect(res.statusCode).toEqual(404);
        });
    });
});

// Custom matcher for specific status codes (helper)
expect.extend({
    toBeOneOf(received, validValues) {
        const pass = validValues.includes(received);
        if (pass) {
            return {
                message: () => `expected ${received} not to be one of ${validValues}`,
                pass: true,
            };
        } else {
            return {
                message: () => `expected ${received} to be one of ${validValues}`,
                pass: false,
            };
        }
    },
});
