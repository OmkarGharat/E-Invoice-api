const request = require('supertest');
const app = require('../server');

describe('XML Validation Endpoint', () => {
    // Mandatory headers helper
    const defaultHeaders = {
        'Authorization': 'Bearer placeholder',
        'x-api-key': 'placeholder',
        'Accept': 'application/xml', // Tests expect XML
        // Content-Type set per request
    };

    const getHeaders = (overrides = {}) => ({ ...defaultHeaders, ...overrides });

    it('should validate correct XML', async () => {
        // Fetch a valid sample first
        const sampleRes = await request(app)
            .get('/api/e-invoice-xml/1')
            .set(getHeaders({ 'Content-Type': 'application/json' })); // GET content type usually empty but strict check requires one? 
        // Wait, does GET check Content-Type?
        // "if (['POST', 'PUT', 'PATCH'].includes(req.method))" checks Content-Type value for JSON.
        // But validationMandatoryHeaders checks PRESENCE for ALL methods.
        // So GET must have Content-Type header even if irrelevant? Yes, per my implementation: "if (req.headers['content-type'] === undefined) missing.push..."
        // It's a bit odd for GET but requested by user ("Make the following headers mandatory").

        const validXml = sampleRes.text;

        const res = await request(app)
            .post('/api/e-invoice-xml/validate')
            .set(getHeaders({ 'Content-Type': 'application/xml' }))
            .send(validXml);

        expect(res.statusCode).toEqual(200);
        if (!res.text.includes('<Valid>true</Valid>')) {
            console.log('Validation Failed. Response:', res.text);
        }
        expect(res.text).toContain('<Valid>true</Valid>');
        console.log('XML Validation: Valid XML passed');
    });

    it('should reject invalid XML (missing Version)', async () => {
        const invalidXml = `
        <Invoice>
            <TranDtls><SupTyp>B2B</SupTyp></TranDtls>
        </Invoice>
        `;

        const res = await request(app)
            .post('/api/e-invoice-xml/validate')
            .set(getHeaders({ 'Content-Type': 'text/xml' }))
            .send(invalidXml);

        expect(res.statusCode).toEqual(200);
        expect(res.text).toContain('<Valid>false</Valid>');
        expect(res.text).toContain('<Error>root: Missing required field \'Version\'</Error>');
        console.log('XML Validation: Invalid XML rejected');
    });
});
