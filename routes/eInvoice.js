const express = require('express');
const path = require('path');
const router = express.Router();  // ← THIS LINE MUST EXIST

// This creates an absolute path to utils/dataGenerator.js from the project root
const EInvoiceDataGenerator = require(path.join(__dirname, '..', 'utils', 'dataGenerator'));

const dataGenerator = new EInvoiceDataGenerator();
const { INVOICE_SCHEMA, validateSchema } = require('../validation/jsonSchemaValidator');

// Dynamic storage with auto-generated data
let generatedInvoices = [];

// Auto-generate 20 sample invoices on startup
function initializeSampleData() {
  if (generatedInvoices.length === 0) {
    const sampleInvoices = dataGenerator.generateMultipleInvoices(20);
    sampleInvoices.forEach((invoice, index) => {
      generatedInvoices.push({
        id: index + 1,
        irn: `IRN${Date.now()}${index}${Math.random().toString(36).substr(2, 8)}`.toUpperCase(),
        invoiceData: invoice,
        status: Math.random() > 0.8 ? 'Cancelled' : 'Generated',
        generatedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        ...(Math.random() > 0.8 ? {
          cancelledAt: new Date().toISOString(),
          cancelReason: ['Order cancelled', 'Price dispute', 'Duplicate invoice'][Math.floor(Math.random() * 3)]
        } : {})
      });
    });
  }
}

// Initialize sample data
initializeSampleData();
let invoiceCounter = generatedInvoices.length + 1;

// Helper functions
function generateIRN() {
  return `IRN${Date.now()}${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
}

function validateBasicInvoice(data) {
  return validateSchema(data, INVOICE_SCHEMA);
}

// ==================== DYNAMIC GENERATION ENDPOINTS ====================

// Generate dynamic invoice
router.post('/generate-dynamic', (req, res) => {
  try {
    const { supplyType = "B2B", scenario, count = 1 } = req.body;

    let invoices = [];

    if (scenario) {
      // Generate specific scenario
      invoices.push(dataGenerator.generateScenario(scenario));
    } else if (count > 1) {
      // Generate multiple invoices
      invoices = dataGenerator.generateMultipleInvoices(count);
    } else {
      // Generate single invoice
      invoices.push(dataGenerator.generateInvoice(supplyType));
    }

    const results = invoices.map(invoice => {
      const irn = `IRN${Date.now()}${Math.random().toString(36).substr(2, 8)}`.toUpperCase();

      const invoiceRecord = {
        id: invoiceCounter++,
        irn: irn,
        invoiceData: invoice,
        status: 'Generated',
        generatedAt: new Date().toISOString()
      };

      generatedInvoices.push(invoiceRecord);

      return {
        Irn: irn,
        AckNo: `ACK${Date.now()}${Math.random().toString(36).substr(2, 6)}`.toUpperCase(),
        AckDt: new Date().toLocaleDateString('en-GB'),
        SignedInvoice: {
          ...invoice,
          IRN: irn
        },
        QRCode: `QR_${irn}`
      };
    });

    res.json({
      success: true,
      data: count === 1 ? results[0] : results,
      count: results.length,
      message: `Successfully generated ${results.length} dynamic invoice(s)`
    });

  } catch (error) {
    console.error('Error generating dynamic invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating dynamic invoice',
      error: error.message
    });
  }
});

// Bulk generate invoices
router.post('/bulk-generate', (req, res) => {
  try {
    const { count = 10, supplyTypes = ["B2B", "EXPWP", "SEZWP"] } = req.body;

    if (count > 100) {
      return res.status(400).json({
        success: false,
        message: "Cannot generate more than 100 invoices at once"
      });
    }

    const invoices = [];

    for (let i = 0; i < count; i++) {
      const supplyType = supplyTypes[Math.floor(Math.random() * supplyTypes.length)];
      const invoice = dataGenerator.generateInvoice(supplyType);
      const irn = `IRN${Date.now()}${i}${Math.random().toString(36).substr(2, 8)}`.toUpperCase();

      invoices.push({
        id: invoiceCounter++,
        irn: irn,
        invoiceData: invoice,
        status: 'Generated',
        generatedAt: new Date().toISOString()
      });
    }

    generatedInvoices.push(...invoices);

    res.json({
      success: true,
      data: {
        generated: invoices.length,
        totalInvoices: generatedInvoices.length,
        sampleIrn: invoices[0]?.irn
      },
      message: `Successfully generated ${invoices.length} invoices`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error in bulk generation",
      error: error.message
    });
  }
});

// Reset and regenerate data
router.post('/reset-data', (req, res) => {
  const { count = 20 } = req.body;

  generatedInvoices = [];
  invoiceCounter = 1;
  initializeSampleData();

  // Generate additional data if requested
  if (count > 20) {
    const additionalInvoices = dataGenerator.generateMultipleInvoices(count - 20);
    additionalInvoices.forEach((invoice, index) => {
      generatedInvoices.push({
        id: invoiceCounter++,
        irn: `IRN${Date.now()}${index}${Math.random().toString(36).substr(2, 8)}`.toUpperCase(),
        invoiceData: invoice,
        status: 'Generated',
        generatedAt: new Date().toISOString()
      });
    });
  }

  res.json({
    success: true,
    data: {
      totalInvoices: generatedInvoices.length,
      message: `Data reset with ${generatedInvoices.length} invoices`
    }
  });
});

// Get available scenarios
router.get('/scenarios', (req, res) => {
  res.json({
    success: true,
    data: {
      scenarios: [
        {
          name: "b2b_interstate",
          description: "B2B transaction between different states (IGST applicable)",
          endpoint: "POST /api/e-invoice/generate-dynamic",
          body: { "scenario": "b2b_interstate" }
        },
        {
          name: "b2b_intrastate",
          description: "B2B transaction within same state (CGST+SGST applicable)",
          endpoint: "POST /api/e-invoice/generate-dynamic",
          body: { "scenario": "b2b_intrastate" }
        },
        {
          name: "export",
          description: "Export transaction with zero tax",
          endpoint: "POST /api/e-invoice/generate-dynamic",
          body: { "scenario": "export" }
        },
        {
          name: "sez",
          description: "Supply to SEZ unit",
          endpoint: "POST /api/e-invoice/generate-dynamic",
          body: { "scenario": "sez" }
        },
        {
          name: "reverse_charge",
          description: "Reverse charge mechanism invoice",
          endpoint: "POST /api/e-invoice/generate-dynamic",
          body: { "scenario": "reverse_charge" }
        },
        {
          name: "credit_note",
          description: "Credit note for returns",
          endpoint: "POST /api/e-invoice/generate-dynamic",
          body: { "scenario": "credit_note" }
        }
      ],
      supplyTypes: ["B2B", "EXPWP", "EXPWOP", "SEZWP", "SEZWOP", "DEXP"],
      states: Object.keys(dataGenerator.states)
    }
  });
});

// ==================== ORIGINAL ENDPOINTS ====================

// Get all invoices with filtering
router.get('/invoices', (req, res) => {
  const { status, supplyType, state, page = 1, limit = 10 } = req.query;

  let filteredInvoices = [...generatedInvoices];

  // Apply filters
  if (status) {
    filteredInvoices = filteredInvoices.filter(inv => inv.status === status);
  }

  if (supplyType) {
    filteredInvoices = filteredInvoices.filter(inv =>
      inv.invoiceData.TranDtls.SupTyp === supplyType
    );
  }

  if (state) {
    filteredInvoices = filteredInvoices.filter(inv =>
      inv.invoiceData.SellerDtls.Stcd === state ||
      inv.invoiceData.BuyerDtls.Stcd === state
    );
  }

  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedInvoices = filteredInvoices.slice(startIndex, endIndex);

  res.json({
    success: true,
    data: paginatedInvoices.map(inv => ({
      id: inv.id,
      irn: inv.irn,
      invoiceNo: inv.invoiceData.DocDtls.No,
      sellerGstin: inv.invoiceData.SellerDtls.Gstin,
      buyerGstin: inv.invoiceData.BuyerDtls.Gstin,
      supplyType: inv.invoiceData.TranDtls.SupTyp,
      totalValue: inv.invoiceData.ValDtls.TotInvVal,
      status: inv.status,
      generatedAt: inv.generatedAt,
      documentType: inv.invoiceData.DocDtls.Typ,
      sellerState: inv.invoiceData.SellerDtls.Stcd,
      buyerState: inv.invoiceData.BuyerDtls.Stcd
    })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: filteredInvoices.length,
      pages: Math.ceil(filteredInvoices.length / limit)
    },
    count: filteredInvoices.length,
    message: "✅ Dynamically generated test data"
  });
});

// Get invoice by IRN
router.get('/invoice/:irn', (req, res) => {
  const { irn } = req.params;
  const invoice = generatedInvoices.find(inv => inv.irn === irn);

  if (!invoice) {
    return res.status(404).json({
      success: false,
      message: 'Invoice not found'
    });
  }

  res.json({
    success: true,
    data: invoice
  });
});

// Generate E-Invoice (Original endpoint)
router.post('/generate', (req, res) => {
  try {
    const invoiceData = req.body;

    // Basic validation
    const errors = validateBasicInvoice(invoiceData);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    // Check payload size
    const payloadSize = Buffer.byteLength(JSON.stringify(req.body), 'utf8');
    if (payloadSize > 2 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'Payload size exceeds 2MB limit'
      });
    }

    // Generate IRN
    const irn = generateIRN();

    const response = {
      success: true,
      data: {
        Irn: irn,
        AckNo: `ACK${Date.now()}`,
        AckDt: new Date().toLocaleDateString('en-GB'),
        SignedInvoice: {
          ...invoiceData,
          IRN: irn
        },
        QRCode: `QR_${irn}`
      },
      message: 'E-Invoice generated successfully',
      important_notice: '⚠️ THIS IS A TEST IRN - NOT VALID FOR TAX PURPOSES'
    };

    // Store invoice
    generatedInvoices.push({
      id: invoiceCounter++,
      irn: irn,
      invoiceData: invoiceData,
      status: 'Generated',
      generatedAt: new Date().toISOString()
    });

    res.json(response);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Validate E-Invoice
router.post('/validate', (req, res) => {
  try {
    const invoiceData = req.body;
    const errors = validateBasicInvoice(invoiceData);

    if (errors.length > 0) {
      return res.json({
        isValid: false,
        errors: errors.map(error => ({ message: error }))
      });
    }

    res.json({
      isValid: true,
      message: 'E-Invoice data is valid for basic checks'
    });

  } catch (error) {
    res.status(500).json({
      isValid: false,
      message: 'Validation error',
      error: error.message
    });
  }
});

// Cancel invoice
router.post('/cancel', (req, res) => {
  try {
    const { irn, cancelReason } = req.body;

    if (!irn) {
      return res.status(400).json({
        success: false,
        message: 'IRN is required'
      });
    }

    const invoice = generatedInvoices.find(inv => inv.irn === irn);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    invoice.status = 'Cancelled';
    invoice.cancelledAt = new Date().toISOString();
    invoice.cancelReason = cancelReason;

    res.json({
      success: true,
      message: 'Invoice cancelled successfully',
      data: {
        irn: irn,
        status: 'Cancelled'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error cancelling invoice',
      error: error.message
    });
  }
});

// Get sample invoice
router.get('/sample', (req, res) => {
  const sampleInvoice = dataGenerator.generateInvoice("B2B");

  res.json({
    success: true,
    data: sampleInvoice,
    message: "Use this sample for testing the generate endpoint"
  });
});

// Get specific sample by ID
router.get('/sample/:id', (req, res) => {
  try {
    const id = req.params.id;
    const samples = dataGenerator.getTestSamples();

    if (samples[id]) {
      const sample = samples[id];
      res.json({
        success: true,
        data: samples[id],
        sampleId: parseInt(id),
        description: dataGenerator.getSampleDescription(id),
        type: samples[id].TranDtls.SupTyp,
        metadata: {
          id: parseInt(id),
          type: sample.TranDtls.SupTyp,
          description: dataGenerator.getSampleDescription(id),
          invoiceNo: sample.DocDtls.No,
          totalValue: sample.ValDtls.TotInvVal,
          documentType: sample.DocDtls.Typ,
          sellerState: sample.SellerDtls.Stcd,
          buyerState: sample.BuyerDtls.Stcd,
          isInterstate: sample.SellerDtls.Stcd !== sample.BuyerDtls.Pos,
          reverseCharge: sample.TranDtls.RegRev === 'Y',
          itemCount: sample.ItemList ? sample.ItemList.length : 0,
          invoiceDate: sample.DocDtls.Dt,
          endpoint: `/api/e-invoice/sample/${id}`
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: `Sample ${id} not found. Available samples: ${Object.keys(samples).join(', ')}`,
        availableSamples: Object.keys(samples)
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add this route for /samples (plural)
router.get('/samples', (req, res) => {
  try {
    const testSamples = dataGenerator.getTestSamples();
    const samples = Object.keys(testSamples).map(key => {
      const sample = testSamples[key];
      return {
        id: parseInt(key),
        type: sample.TranDtls.SupTyp,
        description: dataGenerator.getSampleDescription(parseInt(key)),
        totalValue: sample.ValDtls.TotInvVal,
        invoiceNo: sample.DocDtls.No
      };
    });

    res.json({
      success: true,
      data: samples
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error loading samples',
      error: error.message
    });
  }
});

// GET /api/e-invoice/filter-options - Get filter metadata
router.get('/filter-options', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        statuses: ['Generated', 'Cancelled'],
        supplyTypes: ['B2B', 'EXPWP', 'EXPWOP', 'SEZWP', 'SEZWOP', 'DEXP'],
        states: Object.keys(dataGenerator.states).map(code => ({
          code: code,
          name: dataGenerator.states[code].name
        })),
        documentTypes: ['INV', 'CRN', 'DBN']
      },
      message: 'Filter options loaded successfully'
    });
  } catch (error) {
    console.error('Error in /filter-options endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading filter options',
      error: error.message
    });
  }
});

// Get validation rules
router.get('/validation-rules', (req, res) => {
  res.json({
    success: true,
    data: {
      version: "1.1",
      maxItems: 1000,
      maxPayload: "2MB",
      mandatoryFields: [
        "Version", "TranDtls", "DocDtls", "SellerDtls", "BuyerDtls", "ItemList", "ValDtls"
      ],
      allowedDocTypes: ["INV", "CRN", "DBN"],
      allowedSupplyTypes: ["B2B", "SEZWP", "SEZWOP", "EXPWP", "EXPWOP", "DEXP"],
      sampleIRNs: generatedInvoices.slice(0, 3).map(inv => inv.irn)
    }
  });
});

// Get test scenarios
router.get('/test-scenarios', (req, res) => {
  const scenarios = generatedInvoices.slice(0, 5).map(inv => ({
    irn: inv.irn,
    type: inv.invoiceData.TranDtls.SupTyp,
    sellerState: inv.invoiceData.SellerDtls.Stcd,
    buyerState: inv.invoiceData.BuyerDtls.Stcd,
    totalValue: inv.invoiceData.ValDtls.TotInvVal,
    status: inv.status
  }));

  res.json({
    success: true,
    data: {
      scenarios: scenarios,
      totalInvoices: generatedInvoices.length,
      message: "Ready for API testing with dynamic data"
    }
  });
});

// Get statistics
router.get('/stats', (req, res) => {
  const stats = {
    totalInvoices: generatedInvoices.length,
    generated: generatedInvoices.filter(inv => inv.status === 'Generated').length,
    cancelled: generatedInvoices.filter(inv => inv.status === 'Cancelled').length,
    bySupplyType: {},
    byState: {},
    totalValue: generatedInvoices.reduce((sum, inv) => sum + inv.invoiceData.ValDtls.TotInvVal, 0)
  };

  generatedInvoices.forEach(inv => {
    const supplyType = inv.invoiceData.TranDtls.SupTyp;
    const state = inv.invoiceData.SellerDtls.Stcd;

    stats.bySupplyType[supplyType] = (stats.bySupplyType[supplyType] || 0) + 1;
    stats.byState[state] = (stats.byState[state] || 0) + 1;
  });

  res.json({
    success: true,
    data: stats
  });
});

// Get JSON Schema
router.get('/schema', (req, res) => {
  res.json({
    success: true,
    data: INVOICE_SCHEMA,
    message: "JSON Schema for E-Invoice 1.1 Validation"
  });
});

module.exports = router;