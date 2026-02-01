const request = require('supertest');
const app = require('../server');
const { VALID_API_KEY } = require('../middleware/auth').CONSTANTS || { VALID_API_KEY: 'ei_demo_8x92m3c7-4j5k-2h1g-9s8d-7f6g5h4j3k2l' };

// Mandatory headers helper for Sanity
const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': 'Bearer verify',
    'x-api-key': VALID_API_KEY || 'ei_demo_8x92m3c7-4j5k-2h1g-9s8d-7f6g5h4j3k2l'
};

describe('SANITY TESTS - Core Business Logic', () => {

    it('Should retrieve a specific invoice sample (Happy Path)', async () => {
        const res = await request(app)
            .get('/api/e-invoice/invoices')
            .set(headers);

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        console.log('Sanity Test: Invoice Retrieval OK');
    });

    it('Should generate a new dynamic invoice (Happy Path)', async () => {
        // Requesting 2 to ensure we get a list back and test dynamic list generation
        const res = await request(app)
            .post('/api/e-invoice/generate-dynamic')
            .set(headers)
            .send({ count: 2 });

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBe(2);
        console.log('Sanity Test: Dynamic Generation OK');
    });

    it('Should validate XML Schema feature (Feature Check)', async () => {
        // 1. Get XML
        const xmlRes = await request(app)
            .get('/api/e-invoice-xml/1')
            .set(headers) // Requires mandatory headers too
            .set('Accept', 'application/xml'); // Override Accept for this request

        expect(xmlRes.statusCode).toEqual(200);
        const xml = xmlRes.text;

        // 2. Validate it
        const valRes = await request(app)
            .post('/api/e-invoice-xml/validate')
            .set(headers)
            .set('Content-Type', 'application/xml') // Override
            .set('Accept', 'application/xml')
            .send(xml);

        expect(valRes.statusCode).toEqual(200);
        expect(valRes.text).toContain('<Valid>true</Valid>');
        console.log('Sanity Test: XML Feature OK');
    });
});
