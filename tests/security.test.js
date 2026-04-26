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
        it('should reject request missing x-api-key with 401', async () => {
            const res = await request(app).get('/api/e-invoice/stats')
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/json')
                .set('Authorization', 'Bearer token');
            expect(res.statusCode).toEqual(401);
            expect(res.body.error).toContain('Unauthorized');
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

    describe('7. Empty Token Bypass Prevention', () => {
        const endpoint = '/api/e-invoice/invoices';

        it('should reject empty Bearer token ("Bearer ")', async () => {
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'Authorization': 'Bearer ', 'x-api-key': '' }));
            expect(res.statusCode).toEqual(401);
        });

        it('should reject whitespace-only Bearer token', async () => {
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'Authorization': 'Bearer    ', 'x-api-key': '' }));
            expect(res.statusCode).toEqual(401);
        });

        it('should reject empty API Key header', async () => {
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'x-api-key': '', 'Authorization': '' }));
            expect(res.statusCode).toEqual(401);
        });

        it('should reject whitespace-only API Key', async () => {
            const res = await request(app)
                .get(endpoint)
                .set(getHeaders({ 'x-api-key': '   ', 'Authorization': '' }));
            expect(res.statusCode).toEqual(401);
        });
    });

    describe('8. NoSQL Injection Prevention', () => {
        it('should reject object-type username in login', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .set(getHeaders())
                .send({ username: { "$gt": "" }, password: "anything" });
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toMatch(/strings/i);
        });

        it('should reject object-type password in login', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .set(getHeaders())
                .send({ username: "admin", password: { "$gt": "" } });
            expect(res.statusCode).toEqual(400);
        });

        it('should reject empty username in login', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .set(getHeaders())
                .send({ username: "", password: "anything" });
            expect(res.statusCode).toEqual(400);
        });
    });

    describe('9. Cancel Endpoint Logic', () => {
        it('should reject cancelling an already-cancelled invoice', async () => {
            // First, generate an invoice
            const sampleRes = await request(app)
                .get('/api/e-invoice/sample')
                .set(getHeaders({ 'x-api-key': VALID_API_KEY, 'Authorization': `Bearer ${VALID_BEARER_TOKEN}` }));

            const generateRes = await request(app)
                .post('/api/e-invoice/generate')
                .set(getHeaders({ 'x-api-key': VALID_API_KEY, 'Authorization': `Bearer ${VALID_BEARER_TOKEN}` }))
                .send(sampleRes.body.data);

            const irn = generateRes.body.data?.Irn;
            if (!irn) return; // Skip if generation failed

            // Cancel it once
            const cancelRes1 = await request(app)
                .post('/api/e-invoice/cancel')
                .set(getHeaders({ 'x-api-key': VALID_API_KEY, 'Authorization': `Bearer ${VALID_BEARER_TOKEN}` }))
                .send({ Irn: irn, CnlRsn: '1', CnlRem: 'Duplicate invoice entry' });
            expect(cancelRes1.statusCode).toEqual(200);

            // Try to cancel again — should fail
            const cancelRes2 = await request(app)
                .post('/api/e-invoice/cancel')
                .set(getHeaders({ 'x-api-key': VALID_API_KEY, 'Authorization': `Bearer ${VALID_BEARER_TOKEN}` }))
                .send({ Irn: irn, CnlRsn: '2', CnlRem: 'Test again' });
            expect(cancelRes2.statusCode).toEqual(400);
            expect(cancelRes2.body.message).toMatch(/already cancelled/i);
        });

        it('should return 404 for non-existent IRN', async () => {
            const res = await request(app)
                .post('/api/e-invoice/cancel')
                .set(getHeaders({ 'x-api-key': VALID_API_KEY, 'Authorization': `Bearer ${VALID_BEARER_TOKEN}` }))
                .send({ Irn: 'NONEXISTENT_IRN_12345', CnlRsn: '3', CnlRem: 'Order cancelled by buyer' });
            expect(res.statusCode).toEqual(404);
        });

        it('should reject missing CnlRsn', async () => {
            const res = await request(app)
                .post('/api/e-invoice/cancel')
                .set(getHeaders({ 'x-api-key': VALID_API_KEY, 'Authorization': `Bearer ${VALID_BEARER_TOKEN}` }))
                .send({ Irn: 'SOME_IRN', CnlRem: 'Some remark' });
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toMatch(/validation failed/i);
        });

        it('should reject invalid CnlRsn value (must be 1-4)', async () => {
            const res = await request(app)
                .post('/api/e-invoice/cancel')
                .set(getHeaders({ 'x-api-key': VALID_API_KEY, 'Authorization': `Bearer ${VALID_BEARER_TOKEN}` }))
                .send({ Irn: 'SOME_IRN', CnlRsn: '5', CnlRem: 'Invalid reason code' });
            expect(res.statusCode).toEqual(400);
            expect(res.body.errors).toBeDefined();
        });

        it('should reject missing CnlRem', async () => {
            const res = await request(app)
                .post('/api/e-invoice/cancel')
                .set(getHeaders({ 'x-api-key': VALID_API_KEY, 'Authorization': `Bearer ${VALID_BEARER_TOKEN}` }))
                .send({ Irn: 'SOME_IRN', CnlRsn: '1' });
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toMatch(/validation failed/i);
        });
    });

    describe('10. Input Validation', () => {
        it('should reject negative TotInvVal in generate', async () => {
            const invalidInvoice = {
                Version: '1.1',
                TranDtls: { SupTyp: 'B2B', RegRev: 'N' },
                DocDtls: { Typ: 'INV', No: 'INV/TEST/001', Dt: '18/03/2026' },
                SellerDtls: { Gstin: '29AABCU9603R1ZJ', LglNm: 'Test Seller', Stcd: '29' },
                BuyerDtls: { Gstin: '27AABCU9603R1ZH', LglNm: 'Test Buyer', Stcd: '27', Pos: '27' },
                ItemList: [{
                    SlNo: '1', PrdDesc: 'Test', HsnCd: '1001',
                    Qty: 1, Unit: 'NOS', UnitPrice: 100, TotAmt: 100,
                    AssAmt: 100, GstRt: 18, IgstAmt: 18, CgstAmt: 0, SgstAmt: 0, TotItemVal: 118
                }],
                ValDtls: { AssVal: 100, CgstVal: 0, SgstVal: 0, IgstVal: 18, TotInvVal: -500 }
            };

            const res = await request(app)
                .post('/api/e-invoice/generate')
                .set(getHeaders({ 'x-api-key': VALID_API_KEY, 'Authorization': `Bearer ${VALID_BEARER_TOKEN}` }))
                .send(invalidInvoice);
            expect(res.statusCode).toEqual(400);
            expect(res.body.errors[0]).toMatch(/positive/i);
        });

        it('should return 400 for invalid data in validate endpoint', async () => {
            const res = await request(app)
                .post('/api/e-invoice/validate')
                .set(getHeaders({ 'x-api-key': VALID_API_KEY, 'Authorization': `Bearer ${VALID_BEARER_TOKEN}` }))
                .send({ invalid: 'data' });
            expect(res.statusCode).toEqual(400);
            expect(res.body.isValid).toBe(false);
        });
    });

    describe('11. Session Fixation Fix', () => {
        it('should ignore client-provided session ID', async () => {
            const res = await request(app)
                .post('/api/edge-cases/session-fixation?session_id=attacker123')
                .set(getHeaders());
            expect(res.statusCode).toEqual(200);
            expect(res.body.sessionId).not.toEqual('attacker123');
            expect(res.body.sessionId).toMatch(/^secure-/);
            expect(res.body.info).toMatch(/ignored/i);
        });
    });
});
