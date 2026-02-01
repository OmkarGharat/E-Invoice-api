const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const convert = require('xml-js');

// Load Data Generator
const EInvoiceDataGenerator = require(path.join(__dirname, '..', 'utils', 'dataGenerator'));
const dataGenerator = new EInvoiceDataGenerator();

// 2. GET XML Schema
// Endpoint: /api/e-invoice-xml/schema
router.get('/schema', (req, res) => {
    const schemaPath = path.join(__dirname, '..', 'validation', 'invoice.xsd');
    res.sendFile(schemaPath);
});

// 1. GET XML Sample by ID
// Endpoint: /api/e-invoice-xml/:id
router.get('/:id', (req, res) => {
    try {
        const id = req.params.id;
        const samples = dataGenerator.getTestSamples();

        if (samples[id]) {
            const jsonSample = samples[id];

            // Transform JSON to XML-friendly structure
            const xmlStructure = {
                Invoice: {
                    ...jsonSample,
                    ItemList: {
                        Item: jsonSample.ItemList
                    }
                }
            };

            const options = { compact: true, ignoreComment: true, spaces: 4 };
            const xml = convert.json2xml(xmlStructure, options);

            res.set('Content-Type', 'application/xml');
            res.send(xml);
        } else {
            res.status(404).set('Content-Type', 'application/xml').send(`
                <Error>
                    <Message>Sample ${id} not found</Message>
                    <AvailableSamples>${Object.keys(samples).join(', ')}</AvailableSamples>
                </Error>
            `);
        }
    } catch (error) {
        res.status(500).set('Content-Type', 'application/xml').send(`
            <Error>
                <Message>Internal Server Error</Message>
                <Details>${error.message}</Details>
            </Error>
        `);
    }
});

// Import Validator
const { validateSchema, INVOICE_SCHEMA } = require('../validation/jsonSchemaValidator');

// 3. POST Validate XML
// Endpoint: /api/e-invoice-xml/validate
router.post('/validate', express.text({ type: ['application/xml', 'text/xml'] }), (req, res) => {
    try {
        const xml = req.body;

        if (!xml || typeof xml !== 'string') {
            return res.status(400).set('Content-Type', 'application/xml').send(`
                <ValidationResponse>
                    <Valid>false</Valid>
                    <Errors>
                        <Error>Empty or invalid XML payload</Error>
                    </Errors>
                </ValidationResponse>
            `);
        }

        // Parse XML to JS
        // Disable nativeType to ensure strings stay strings
        // ignoreAttributes: true simplifies parsing for simple elements to just content
        const options = { compact: true, nativeType: false, ignoreAttributes: true, textKey: '_text' };
        const result = convert.xml2js(xml, options);

        if (!result.Invoice) {
            return res.status(400).set('Content-Type', 'application/xml').send(`
                <ValidationResponse>
                    <Valid>false</Valid>
                    <Errors>
                        <Error>XML root must be &lt;Invoice&gt;</Error>
                    </Errors>
                </ValidationResponse>
            `);
        }

        let data = result.Invoice;

        // Helper to normalize xml-js object output
        const normalize = (obj) => {
            if (obj && typeof obj === 'object' && obj._text !== undefined) {
                return obj._text;
            }
            if (Array.isArray(obj)) {
                return obj.map(normalize);
            }
            if (obj && typeof obj === 'object') {
                const newObj = {};
                for (const key in obj) {
                    newObj[key] = normalize(obj[key]);
                }
                return newObj;
            }
            return obj;
        };

        const cleanData = normalize(data);

        // Handle ItemList array (if normalized, it might still be { Item: [...] } or just array?)
        // convert.json2xml wrapped ItemList: { Item: [...] }.
        // so xml2js parses it as ItemList: { Item: [...] }.
        // Normalized: ItemList: { Item: [ ... ] }.
        // Schema expects ItemList to be Array.

        if (cleanData.ItemList && cleanData.ItemList.Item) {
            if (Array.isArray(cleanData.ItemList.Item)) {
                cleanData.ItemList = cleanData.ItemList.Item;
            } else {
                cleanData.ItemList = [cleanData.ItemList.Item]; // Wrap single
            }
        }

        // Validate using existing JSON Schema logic
        // We reuse INVOICE_SCHEMA because logic is identical
        const errors = validateSchema(cleanData, INVOICE_SCHEMA);

        if (errors.length > 0) {
            const errorTags = errors.map(err => `<Error>${err}</Error>`).join('');
            res.set('Content-Type', 'application/xml');

            // Correct XML Construction
            res.send(`
                 <ValidationResponse>
                    <Valid>false</Valid>
                    <Message>Validation Failed</Message>
                    <Errors>
                        ${errorTags}
                 </ValidationResponse>
             `);
        } else {
            res.set('Content-Type', 'application/xml');
            res.send(`
                 <ValidationResponse>
                    <Valid>true</Valid>
                    <Message>XML is valid against the Invoice Schema</Message>
                 </ValidationResponse>
             `);
        }

    } catch (error) {
        console.error(error);
        res.status(400).set('Content-Type', 'application/xml').send(`
            <ValidationResponse>
                <Valid>false</Valid>
                <Errors>
                    <Error>Invalid XML Format: ${error.message}</Error>
                </Errors>
            </ValidationResponse>
        `);
    }
});

module.exports = router;
