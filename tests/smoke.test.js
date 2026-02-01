const request = require('supertest');
const app = require('../server');

describe('SMOKE TESTS - Environment & Health Check', () => {

    // 1. App Health
    it('Server should be up and responding (GET /health)', async () => {
        const res = await request(app).get('/health');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('status', 'OK');
        console.log('Smoke Test: System Health OK');
    });

    // 2. Static Assets (Checking if public files are served)
    it('Frontend should be accessible (GET /index.html)', async () => {
        const res = await request(app).get('/index.html');
        // Express static serves index.html at root usually, or checking status 200
        expect(res.statusCode).toEqual(200);
        console.log('Smoke Test: Frontend Accessible');
    });

    // 3. Basic Configuration Check
    it('API Stats should be reachable (GET /api/e-invoice/stats)', async () => {
        // Stats is public? In integration test it was public. 
        // Need to check strict headers.
        const res = await request(app)
            .get('/api/e-invoice/stats')
            // Minimal mandatory headers (even if public, our strict rules apply to /api)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .set('Authorization', 'Bearer smoke-test')
            .set('x-api-key', 'smoke-test');

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('success', true);
        console.log('Smoke Test: API Configuration OK');
    });
});
