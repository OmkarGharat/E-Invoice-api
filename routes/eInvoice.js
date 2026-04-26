const express = require('express');
const path = require('path');
const router = express.Router();  // ← THIS LINE MUST EXIST

// This creates an absolute path to utils/dataGenerator.js from the project root
const EInvoiceDataGenerator = require(path.join(__dirname, '..', 'utils', 'dataGenerator'));

const dataGenerator = new EInvoiceDataGenerator();
const { INVOICE_SCHEMA, validateSchema } = require('../validation/jsonSchemaValidator');
const { validateInvoiceRegex, validateField, determineSupplyType } = require('../validation/regexPatterns');

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
          CnlRsn: String([1, 2, 3, 4][Math.floor(Math.random() * 4)]),
          CnlRem: ['Duplicate invoice entry', 'Data entry mistake in GSTIN', 'Order cancelled by buyer', 'Incorrect tax amount'][Math.floor(Math.random() * 4)]
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

    // Regex validation for supplyType
    if (supplyType) {
      const supTypResult = validateField('SupTyp', supplyType);
      if (!supTypResult.valid) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: [supTypResult.message]
        });
      }
    }

    // Validate count is a positive integer within limits
    if (count !== undefined && (typeof count !== 'number' || count < 1 || count > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: ['count must be a number between 1 and 100']
      });
    }

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

    // Regex validation for each supplyType in the array
    if (Array.isArray(supplyTypes)) {
      for (const st of supplyTypes) {
        const result = validateField('SupTyp', st);
        if (!result.valid) {
          return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: [result.message]
          });
        }
      }
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

  // Regex validation for query parameters
  if (supplyType) {
    const r = validateField('SupTyp', supplyType);
    if (!r.valid) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Invalid supplyType: '${supplyType}'. ${r.message}`
      });
    }
  }

  if (state) {
    const r = validateField('Stcd', state);
    if (!r.valid) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Invalid state code: '${state}'. ${r.message}`
      });
    }
  }

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
    data: paginatedInvoices.map(inv => {
      const supplyResult = determineSupplyType(inv.invoiceData.SellerDtls.Stcd, inv.invoiceData.BuyerDtls.Pos);
      return {
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
        buyerState: inv.invoiceData.BuyerDtls.Stcd,
        isInterstate: supplyResult.isInterstate,
        taxType: supplyResult.taxType
      };
    }),
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

// Get invoice by numeric ID
router.get('/invoices/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid invoice ID. Must be a number.'
    });
  }

  const invoice = generatedInvoices.find(inv => inv.id === id);
  if (!invoice) {
    return res.status(404).json({
      success: false,
      message: `Invoice with ID ${id} not found`
    });
  }

  // IDOR Prevention: Check ownership if auth context exists
  if (req.auth && invoice.userId && invoice.userId.toString() !== req.auth.user) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'You do not have access to this invoice'
    });
  }

  res.json({
    success: true,
    data: invoice
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

  // IDOR Prevention: Check ownership if auth context exists
  if (req.auth && invoice.userId && invoice.userId.toString() !== req.auth.user) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'You do not have access to this invoice'
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

    // Regex pattern validation (field-level format checks)
    const regexErrors = validateInvoiceRegex(invoiceData);
    if (regexErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Regex validation failed',
        errors: regexErrors
      });
    }

    // Basic validation (required fields, types, schema structure)
    const errors = validateBasicInvoice(invoiceData);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    // Inter/Intra-State tax consistency validation
    if (invoiceData.SellerDtls && invoiceData.BuyerDtls) {
      const supplyResult = determineSupplyType(
        invoiceData.SellerDtls.Stcd,
        invoiceData.BuyerDtls.Pos
      );

      if (supplyResult.valid && invoiceData.ValDtls) {
        const taxErrors = [];
        if (supplyResult.isInterstate) {
          // Inter-State: CGST and SGST must be 0, IGST should carry the tax
          if (invoiceData.ValDtls.CgstVal && invoiceData.ValDtls.CgstVal !== 0) {
            taxErrors.push(`Inter-State supply (sellerState=${invoiceData.SellerDtls.Stcd}, Pos=${invoiceData.BuyerDtls.Pos}): CgstVal must be 0 for IGST transactions`);
          }
          if (invoiceData.ValDtls.SgstVal && invoiceData.ValDtls.SgstVal !== 0) {
            taxErrors.push(`Inter-State supply (sellerState=${invoiceData.SellerDtls.Stcd}, Pos=${invoiceData.BuyerDtls.Pos}): SgstVal must be 0 for IGST transactions`);
          }
        } else {
          // Intra-State: IGST must be 0, CGST+SGST should carry the tax (unless IgstOnIntra = 'Y')
          const igstOnIntra = invoiceData.TranDtls && invoiceData.TranDtls.IgstOnIntra === 'Y';
          if (!igstOnIntra && invoiceData.ValDtls.IgstVal && invoiceData.ValDtls.IgstVal !== 0) {
            taxErrors.push(`Intra-State supply (sellerState=${invoiceData.SellerDtls.Stcd}, Pos=${invoiceData.BuyerDtls.Pos}): IgstVal must be 0 for CGST+SGST transactions (unless IgstOnIntra is 'Y')`);
          }
        }
        if (taxErrors.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Inter/Intra-State tax mismatch',
            errors: taxErrors
          });
        }
      }
    }

    // Validate positive amounts
    if (invoiceData.ValDtls && invoiceData.ValDtls.TotInvVal !== undefined) {
      if (invoiceData.ValDtls.TotInvVal <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: ['Amount must be positive: TotInvVal must be greater than 0']
        });
      }
    }

    // Validate item-level amounts
    if (invoiceData.ItemList && Array.isArray(invoiceData.ItemList)) {
      for (let i = 0; i < invoiceData.ItemList.length; i++) {
        const item = invoiceData.ItemList[i];
        if (item.UnitPrice !== undefined && item.UnitPrice < 0) {
          return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: [`ItemList[${i}].UnitPrice must not be negative`]
          });
        }
        if (item.TotItemVal !== undefined && item.TotItemVal < 0) {
          return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: [`ItemList[${i}].TotItemVal must not be negative`]
          });
        }
      }
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

    // Regex pattern validation (field-level format checks)
    const regexErrors = validateInvoiceRegex(invoiceData);
    if (regexErrors.length > 0) {
      return res.status(400).json({
        isValid: false,
        errors: regexErrors.map(error => ({ message: error, type: 'regex' }))
      });
    }

    // Schema validation (required fields, types, structure)
    const errors = validateBasicInvoice(invoiceData);

    if (errors.length > 0) {
      return res.status(400).json({
        isValid: false,
        errors: errors.map(error => ({ message: error }))
      });
    }

    // Inter/Intra-State tax consistency validation
    if (invoiceData.SellerDtls && invoiceData.BuyerDtls) {
      const supplyResult = determineSupplyType(
        invoiceData.SellerDtls.Stcd,
        invoiceData.BuyerDtls.Pos
      );

      if (supplyResult.valid && invoiceData.ValDtls) {
        const taxErrors = [];
        if (supplyResult.isInterstate) {
          if (invoiceData.ValDtls.CgstVal && invoiceData.ValDtls.CgstVal !== 0) {
            taxErrors.push(`Inter-State supply (sellerState=${invoiceData.SellerDtls.Stcd}, Pos=${invoiceData.BuyerDtls.Pos}): CgstVal must be 0 for IGST transactions`);
          }
          if (invoiceData.ValDtls.SgstVal && invoiceData.ValDtls.SgstVal !== 0) {
            taxErrors.push(`Inter-State supply (sellerState=${invoiceData.SellerDtls.Stcd}, Pos=${invoiceData.BuyerDtls.Pos}): SgstVal must be 0 for IGST transactions`);
          }
        } else {
          const igstOnIntra = invoiceData.TranDtls && invoiceData.TranDtls.IgstOnIntra === 'Y';
          if (!igstOnIntra && invoiceData.ValDtls.IgstVal && invoiceData.ValDtls.IgstVal !== 0) {
            taxErrors.push(`Intra-State supply (sellerState=${invoiceData.SellerDtls.Stcd}, Pos=${invoiceData.BuyerDtls.Pos}): IgstVal must be 0 for CGST+SGST transactions (unless IgstOnIntra is 'Y')`);
          }
        }
        if (taxErrors.length > 0) {
          return res.status(400).json({
            isValid: false,
            errors: taxErrors.map(e => ({ message: e, type: 'tax_mismatch' }))
          });
        }
      }
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

// Cancel invoice (NIC e-Invoice API spec)
// Accepts: { Irn, CnlRsn, CnlRem } (also supports lowercase 'irn' for backward compat)
router.post('/cancel', (req, res) => {
  try {
    // Support both NIC-spec PascalCase and lowercase field names
    const irn = req.body.Irn || req.body.irn;
    const CnlRsn = req.body.CnlRsn;
    const CnlRem = req.body.CnlRem;

    // --- Validate required fields ---
    const errors = [];

    if (!irn) {
      errors.push('Irn is required');
    }

    if (CnlRsn === undefined || CnlRsn === null || CnlRsn === '') {
      errors.push('CnlRsn (Cancellation Reason) is required. Valid values: 1 (Duplicate), 2 (Data entry mistake), 3 (Order Cancelled), 4 (Others)');
    } else {
      const cnlRsnResult = validateField('CnlRsn', String(CnlRsn));
      if (!cnlRsnResult.valid) {
        errors.push(cnlRsnResult.message);
      }
    }

    if (CnlRem === undefined || CnlRem === null || CnlRem === '') {
      errors.push('CnlRem (Cancellation Remarks) is required. Max 100 characters.');
    } else {
      const cnlRemResult = validateField('CnlRem', CnlRem);
      if (!cnlRemResult.valid) {
        errors.push(cnlRemResult.message);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    // --- Find invoice ---
    const invoice = generatedInvoices.find(inv => inv.irn === irn);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // IDOR Prevention: Check ownership on cancel (same as GET /invoice/:irn)
    if (req.auth && invoice.userId && invoice.userId.toString() !== req.auth.user) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have access to cancel this invoice'
      });
    }

    // Prevent double cancellation
    if (invoice.status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Invoice is already cancelled',
        data: {
          Irn: irn,
          status: 'Cancelled',
          cancelledAt: invoice.cancelledAt,
          CnlRsn: invoice.CnlRsn,
          CnlRem: invoice.CnlRem
        }
      });
    }

    // --- Perform cancellation ---
    invoice.status = 'Cancelled';
    invoice.cancelledAt = new Date().toISOString();
    invoice.CnlRsn = String(CnlRsn);
    invoice.CnlRem = CnlRem;

    res.json({
      success: true,
      message: 'Invoice cancelled successfully',
      data: {
        Irn: irn,
        status: 'Cancelled',
        cancelledAt: invoice.cancelledAt,
        CnlRsn: invoice.CnlRsn,
        CnlRem: invoice.CnlRem
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
      const supplyResult = determineSupplyType(sample.SellerDtls.Stcd, sample.BuyerDtls.Pos);
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
          pos: sample.BuyerDtls.Pos,
          isInterstate: supplyResult.isInterstate,
          taxType: supplyResult.taxType,
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
      const supplyResult = determineSupplyType(sample.SellerDtls.Stcd, sample.BuyerDtls.Pos);
      return {
        id: parseInt(key),
        type: sample.TranDtls.SupTyp,
        description: dataGenerator.getSampleDescription(parseInt(key)),
        totalValue: sample.ValDtls.TotInvVal,
        invoiceNo: sample.DocDtls.No,
        sellerState: sample.SellerDtls.Stcd,
        buyerState: sample.BuyerDtls.Stcd,
        pos: sample.BuyerDtls.Pos,
        isInterstate: supplyResult.isInterstate,
        taxType: supplyResult.taxType
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
  const { PATTERNS } = require('../validation/regexPatterns');

  // Build a simplified view of the regex patterns for the API consumer
  const regexRules = {};
  for (const [key, val] of Object.entries(PATTERNS)) {
    regexRules[key] = {
      pattern: val.pattern,
      message: val.message,
      ...(val.length ? { length: val.length } : {}),
      ...(val.range ? { range: val.range } : {})
    };
  }

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
      regexPatterns: regexRules,
      sampleIRNs: generatedInvoices.slice(0, 3).map(inv => inv.irn)
    }
  });
});

// Get test scenarios
router.get('/test-scenarios', (req, res) => {
  const scenarios = generatedInvoices.slice(0, 5).map(inv => {
    const supplyResult = determineSupplyType(inv.invoiceData.SellerDtls.Stcd, inv.invoiceData.BuyerDtls.Pos);
    return {
      irn: inv.irn,
      type: inv.invoiceData.TranDtls.SupTyp,
      sellerState: inv.invoiceData.SellerDtls.Stcd,
      buyerState: inv.invoiceData.BuyerDtls.Stcd,
      isInterstate: supplyResult.isInterstate,
      taxType: supplyResult.taxType,
      totalValue: inv.invoiceData.ValDtls.TotInvVal,
      status: inv.status
    };
  });

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
  const activeInvoices = generatedInvoices.filter(inv => inv.status === 'Generated');
  const cancelledInvoices = generatedInvoices.filter(inv => inv.status === 'Cancelled');

  const stats = {
    totalInvoices: generatedInvoices.length,
    generated: activeInvoices.length,
    cancelled: cancelledInvoices.length,
    bySupplyType: {},
    byState: {},
    totalValue: activeInvoices.reduce((sum, inv) => sum + inv.invoiceData.ValDtls.TotInvVal, 0),
    cancelledValue: cancelledInvoices.reduce((sum, inv) => sum + inv.invoiceData.ValDtls.TotInvVal, 0)
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