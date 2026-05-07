const express = require('express');
const crypto = require('crypto');
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
function generateIRN(gstin, docType, docNo, docDt) {
  const input = `${gstin}${docType}${docNo}${docDt}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

function getDocumentKey(invoiceData) {
  const gstin = invoiceData.SellerDtls?.Gstin || '';
  const docType = invoiceData.DocDtls?.Typ || '';
  const docNo = invoiceData.DocDtls?.No || '';
  const docDt = invoiceData.DocDtls?.Dt || '';
  return `${gstin}|${docType}|${docNo}|${docDt}`;
}

function findDuplicateInvoice(invoiceData) {
  const key = getDocumentKey(invoiceData);
  return generatedInvoices.find(inv => {
    const existingKey = getDocumentKey(inv.invoiceData);
    return existingKey === key;
  });
}

function validateBasicInvoice(data) {
  return validateSchema(data, INVOICE_SCHEMA);
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Shared amount validation — used by both /generate and /validate
 * Validates positive amounts, cross-field math, and item-level consistency.
 */
function validateAmounts(invoiceData) {
  const errors = [];

  // Validate positive TotInvVal
  if (invoiceData.ValDtls && invoiceData.ValDtls.TotInvVal !== undefined) {
    if (invoiceData.DocDtls?.Typ !== 'CRN' && invoiceData.DocDtls?.Typ !== 'DBN') {
      if (invoiceData.ValDtls.TotInvVal <= 0) {
        errors.push('Amount must be positive: TotInvVal must be greater than 0');
      }
    }
  }

  // Validate item-level amounts
  if (invoiceData.ItemList && Array.isArray(invoiceData.ItemList)) {
    for (let i = 0; i < invoiceData.ItemList.length; i++) {
      const item = invoiceData.ItemList[i];

      // UnitPrice must not be negative (except for credit notes)
      if (item.UnitPrice !== undefined && invoiceData.DocDtls?.Typ !== 'CRN') {
        if (item.UnitPrice < 0) {
          errors.push(`ItemList[${i}].UnitPrice must not be negative`);
        }
      }

      // TotItemVal must not be negative (except for credit notes)
      if (item.TotItemVal !== undefined && invoiceData.DocDtls?.Typ !== 'CRN') {
        if (item.TotItemVal < 0) {
          errors.push(`ItemList[${i}].TotItemVal must not be negative`);
        }
      }

      // Cross-field: TotAmt should equal Qty * UnitPrice
      if (item.Qty !== undefined && item.UnitPrice !== undefined && item.TotAmt !== undefined) {
        const expectedTotAmt = round2(item.Qty * item.UnitPrice);
        if (round2(item.TotAmt) !== expectedTotAmt) {
          errors.push(`ItemList[${i}].TotAmt (${item.TotAmt}) does not match Qty * UnitPrice (${expectedTotAmt})`);
        }
      }

      // Cross-field: TotItemVal should equal AssAmt + IgstAmt + CgstAmt + SgstAmt
      if (item.AssAmt !== undefined && item.IgstAmt !== undefined && item.CgstAmt !== undefined && item.SgstAmt !== undefined && item.TotItemVal !== undefined) {
        const expectedTotItemVal = round2(item.AssAmt + item.IgstAmt + item.CgstAmt + item.SgstAmt);
        if (round2(item.TotItemVal) !== expectedTotItemVal) {
          errors.push(`ItemList[${i}].TotItemVal (${item.TotItemVal}) does not match AssAmt + IgstAmt + CgstAmt + SgstAmt (${expectedTotItemVal})`);
        }
      }
    }

    // Cross-field: Sum of item taxes should match ValDtls
    if (invoiceData.ValDtls) {
      const sumAssAmt = round2(invoiceData.ItemList.reduce((s, item) => s + (item.AssAmt || 0), 0));
      const sumCgst = round2(invoiceData.ItemList.reduce((s, item) => s + (item.CgstAmt || 0), 0));
      const sumSgst = round2(invoiceData.ItemList.reduce((s, item) => s + (item.SgstAmt || 0), 0));
      const sumIgst = round2(invoiceData.ItemList.reduce((s, item) => s + (item.IgstAmt || 0), 0));

      if (invoiceData.ValDtls.AssVal !== undefined && round2(invoiceData.ValDtls.AssVal) !== sumAssAmt) {
        errors.push(`ValDtls.AssVal (${invoiceData.ValDtls.AssVal}) does not match sum of ItemList AssAmt (${sumAssAmt})`);
      }
      if (invoiceData.ValDtls.CgstVal !== undefined && round2(invoiceData.ValDtls.CgstVal) !== sumCgst) {
        errors.push(`ValDtls.CgstVal (${invoiceData.ValDtls.CgstVal}) does not match sum of ItemList CgstAmt (${sumCgst})`);
      }
      if (invoiceData.ValDtls.SgstVal !== undefined && round2(invoiceData.ValDtls.SgstVal) !== sumSgst) {
        errors.push(`ValDtls.SgstVal (${invoiceData.ValDtls.SgstVal}) does not match sum of ItemList SgstAmt (${sumSgst})`);
      }
      if (invoiceData.ValDtls.IgstVal !== undefined && round2(invoiceData.ValDtls.IgstVal) !== sumIgst) {
        errors.push(`ValDtls.IgstVal (${invoiceData.ValDtls.IgstVal}) does not match sum of ItemList IgstAmt (${sumIgst})`);
      }
    }
  }

  return errors;
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
      const irn = generateIRN(
        invoice.SellerDtls?.Gstin || '',
        invoice.DocDtls?.Typ || '',
        invoice.DocDtls?.No || '',
        invoice.DocDtls?.Dt || ''
      );
      const ackNo = `ACK${Date.now()}${Math.floor(Math.random() * 100000)}`;
      const ackDt = new Date().toLocaleDateString('en-GB');

      const invoiceRecord = {
        id: invoiceCounter++,
        irn: irn,
        ackNo: ackNo,
        ackDt: ackDt,
        invoiceData: invoice,
        status: 'Generated',
        generatedAt: new Date().toISOString()
      };

      generatedInvoices.push(invoiceRecord);

      return {
        Irn: irn,
        AckNo: ackNo,
        AckDt: ackDt,
        SignedInvoice: invoice,
        QRCode: `QR_${irn}`
      };
    });

    res.status(201).json({
      success: true,
      data: count === 1 ? results[0] : results,
      count: results.length,
      message: `Successfully generated ${results.length} dynamic invoice(s)`,
      usage: {
        generateMultiple: 'Send { "count": 5 } in request body to generate multiple invoices',
        specifyType: 'Send { "supplyType": "EXPWP" } to specify supply type',
        useScenario: 'Send { "scenario": "b2b_interstate" } for specific tax scenarios',
        listScenarios: 'GET /api/e-invoice/scenarios for all available scenarios'
      }
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

// ==================== GENERIC FILTERING & FORMATTING ====================

const GenericFilter = require(path.join(__dirname, '..', 'utils', 'genericFilter'));
const filter = new GenericFilter();

/**
 * Format invoice for response
 */
function formatInvoice(invoice) {
  const supplyResult = determineSupplyType(
    invoice.invoiceData.SellerDtls.Stcd,
    invoice.invoiceData.BuyerDtls.Pos
  );
  return {
    id: invoice.id,
    irn: invoice.irn,
    invoiceNo: invoice.invoiceData.DocDtls.No,
    invoiceDate: invoice.invoiceData.DocDtls.Dt,
    sellerGstin: invoice.invoiceData.SellerDtls.Gstin,
    sellerName: invoice.invoiceData.SellerDtls.LglNm,
    buyerGstin: invoice.invoiceData.BuyerDtls.Gstin,
    buyerName: invoice.invoiceData.BuyerDtls.LglNm,
    supplyType: invoice.invoiceData.TranDtls.SupTyp,
    documentType: invoice.invoiceData.DocDtls.Typ,
    totalValue: invoice.invoiceData.ValDtls.TotInvVal,
    status: invoice.status,
    generatedAt: invoice.generatedAt,
    sellerState: invoice.invoiceData.SellerDtls.Stcd,
    buyerState: invoice.invoiceData.BuyerDtls.Stcd,
    pos: invoice.invoiceData.BuyerDtls.Pos,
    isInterstate: supplyResult.isInterstate,
    taxType: supplyResult.taxType,
    reverseCharge: invoice.invoiceData.TranDtls.RegRev === 'Y',
    itemCount: invoice.invoiceData.ItemList ? invoice.invoiceData.ItemList.length : 0
  };
}

/**
 * Format sample for response
 */
function formatSample(id, sample) {
  const supplyResult = determineSupplyType(sample.SellerDtls.Stcd, sample.BuyerDtls.Pos);
  return {
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
  };
}

// ==================== GET ENDPOINTS ====================

// Get all invoices with advanced generic filtering
router.get('/invoices', (req, res) => {
  try {
    // Parse query parameters
    const { page = 1, limit = 10, sortBy = 'generatedAt', sortOrder = 'desc', ...filters } = req.query;

    // Input validation — reject invalid pagination/sorting params with 400
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);

    if (isNaN(parsedPage) || parsedPage < 1) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Invalid page value: '${page}'. Must be a positive integer (1 or greater).`
      });
    }

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Invalid limit value: '${limit}'. Must be a positive integer (1-100).`
      });
    }

    if (parsedLimit > 100) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Limit value '${limit}' exceeds maximum of 100.`
      });
    }

    if (!['asc', 'desc'].includes(sortOrder)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Invalid sortOrder: '${sortOrder}'. Must be 'asc' or 'desc'.`
      });
    }

    const validPage = parsedPage;
    const validLimit = parsedLimit;
    const validSortOrder = sortOrder;

    // Validate enum/filter values
    const VALID_STATUSES = ['Generated', 'Cancelled'];
    const VALID_SUPPLY_TYPES = ['B2B', 'EXPWP', 'EXPWOP', 'SEZWP', 'SEZWOP', 'DEXP'];
    const VALID_DOC_TYPES = ['INV', 'CRN', 'DBN'];

    if (filters.status && !VALID_STATUSES.includes(filters.status)) {
      return res.status(400).json({ success: false, error: 'Bad Request', message: `Invalid status: '${filters.status}'. Valid values: ${VALID_STATUSES.join(', ')}` });
    }
    if (filters.supplyType && !VALID_SUPPLY_TYPES.includes(filters.supplyType)) {
      return res.status(400).json({ success: false, error: 'Bad Request', message: `Invalid supplyType: '${filters.supplyType}'. Valid values: ${VALID_SUPPLY_TYPES.join(', ')}` });
    }
    if (filters.documentType && !VALID_DOC_TYPES.includes(filters.documentType)) {
      return res.status(400).json({ success: false, error: 'Bad Request', message: `Invalid documentType: '${filters.documentType}'. Valid values: ${VALID_DOC_TYPES.join(', ')}` });
    }
    if (filters.interstate !== undefined && !['true', 'false'].includes(filters.interstate)) {
      return res.status(400).json({ success: false, error: 'Bad Request', message: `Invalid interstate value: '${filters.interstate}'. Must be 'true' or 'false'.` });
    }
    if (filters.reverseCharge !== undefined && !['true', 'false'].includes(filters.reverseCharge)) {
      return res.status(400).json({ success: false, error: 'Bad Request', message: `Invalid reverseCharge value: '${filters.reverseCharge}'. Must be 'true' or 'false'.` });
    }
    if (filters.minValue !== undefined && isNaN(parseFloat(filters.minValue))) {
      return res.status(400).json({ success: false, error: 'Bad Request', message: `Invalid minValue: '${filters.minValue}'. Must be a number.` });
    }
    if (filters.maxValue !== undefined && isNaN(parseFloat(filters.maxValue))) {
      return res.status(400).json({ success: false, error: 'Bad Request', message: `Invalid maxValue: '${filters.maxValue}'. Must be a number.` });
    }

    // Regex validation for GSTIN and state code filters
    if (filters.sellerGstin) { const r = validateField('Gstin', filters.sellerGstin); if (!r.valid) return res.status(400).json({ success: false, error: 'Bad Request', message: `Invalid sellerGstin: '${filters.sellerGstin}'. ${r.message}` }); }
    if (filters.buyerGstin) { const r = validateField('BuyerGstin', filters.buyerGstin); if (!r.valid) return res.status(400).json({ success: false, error: 'Bad Request', message: `Invalid buyerGstin: '${filters.buyerGstin}'. ${r.message}` }); }
    if (filters.sellerState) { const r = validateField('Stcd', filters.sellerState); if (!r.valid) return res.status(400).json({ success: false, error: 'Bad Request', message: `Invalid sellerState: '${filters.sellerState}'. ${r.message}` }); }
    if (filters.buyerState) { const r = validateField('Stcd', filters.buyerState); if (!r.valid) return res.status(400).json({ success: false, error: 'Bad Request', message: `Invalid buyerState: '${filters.buyerState}'. ${r.message}` }); }

    // Map user-friendly query param names to nested data paths
    const fieldMapping = {
      supplyType: 'invoiceData.TranDtls.SupTyp',
      documentType: 'invoiceData.DocDtls.Typ',
      sellerState: 'invoiceData.SellerDtls.Stcd',
      buyerState: 'invoiceData.BuyerDtls.Stcd',
      totalValue: 'invoiceData.ValDtls.TotInvVal',
      sellerGstin: 'invoiceData.SellerDtls.Gstin',
      buyerGstin: 'invoiceData.BuyerDtls.Gstin',
      invoiceNo: 'invoiceData.DocDtls.No',
    };

    // Separate special filters from generic filters
    const specialKeys = ['dateFrom', 'dateTo', 'minValue', 'maxValue', 'interstate', 'reverseCharge', 'supplyTypes', 'statuses'];
    const genericFilters = {};
    Object.keys(filters).forEach(key => {
      if (!specialKeys.includes(key)) genericFilters[key] = filters[key];
    });

    // 1. Apply generic filters
    let filteredData = filter.apply(generatedInvoices, genericFilters, fieldMapping);

    // 2. Apply special filters
    if (filters.dateFrom || filters.dateTo) {
      const from = filters.dateFrom ? new Date(filters.dateFrom) : new Date(0);
      const to = filters.dateTo ? new Date(filters.dateTo) : new Date('2999-12-31');
      to.setHours(23, 59, 59, 999);
      filteredData = filteredData.filter(inv => { const d = new Date(inv.generatedAt); return d >= from && d <= to; });
    }
    if (filters.minValue !== undefined) {
      const min = parseFloat(filters.minValue);
      if (!isNaN(min)) filteredData = filteredData.filter(inv => inv.invoiceData.ValDtls.TotInvVal >= min);
    }
    if (filters.maxValue !== undefined) {
      const max = parseFloat(filters.maxValue);
      if (!isNaN(max)) filteredData = filteredData.filter(inv => inv.invoiceData.ValDtls.TotInvVal <= max);
    }
    if (filters.interstate !== undefined) {
      const wantInterstate = filters.interstate === 'true';
      filteredData = filteredData.filter(inv => {
        const result = determineSupplyType(inv.invoiceData.SellerDtls.Stcd, inv.invoiceData.BuyerDtls.Pos);
        return result.valid && result.isInterstate === wantInterstate;
      });
    }
    if (filters.reverseCharge !== undefined) {
      const wantRC = filters.reverseCharge === 'true';
      filteredData = filteredData.filter(inv => (inv.invoiceData.TranDtls.RegRev === 'Y') === wantRC);
    }

    // 3. Sorting
    const sortFieldMapping = {
      totalValue: 'invoiceData.ValDtls.TotInvVal',
      supplyType: 'invoiceData.TranDtls.SupTyp',
      documentType: 'invoiceData.DocDtls.Typ',
      sellerState: 'invoiceData.SellerDtls.Stcd',
      buyerState: 'invoiceData.BuyerDtls.Stcd',
      invoiceNo: 'invoiceData.DocDtls.No',
    };
    const actualSortBy = sortFieldMapping[sortBy] || sortBy;
    filteredData = filter.sort(filteredData, actualSortBy, validSortOrder);

    // 4. Pagination
    const paginated = filter.paginate(filteredData, validPage, validLimit);
    const responseData = paginated.data.map(formatInvoice);

    res.set({
      'X-Total-Count': paginated.total,
      'X-Page-Count': paginated.pages,
      'X-Page': paginated.page,
      'X-Limit': paginated.limit,
      'X-Has-Next': paginated.hasNext,
      'X-Has-Prev': paginated.hasPrev
    });

    res.json({
      success: true,
      data: responseData,
      pagination: {
        page: paginated.page,
        limit: paginated.limit,
        total: paginated.total,
        pages: paginated.pages,
        hasNext: paginated.hasNext,
        hasPrev: paginated.hasPrev
      },
      filters: filters,
      sort: { by: sortBy, order: validSortOrder }
    });

  } catch (error) {
    console.error('Error in /invoices:', error);
    res.status(500).json({ success: false, message: 'Error fetching invoices', error: error.message });
  }
});

// Get invoice by numeric ID
router.get('/invoices/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid invoice ID. Must be a number.' });
  }

  const invoice = generatedInvoices.find(inv => inv.id === id);
  if (!invoice) {
    return res.status(404).json({ success: false, message: `Invoice with ID ${id} not found` });
  }

  // IDOR Prevention: Check ownership if auth context exists
  if (req.auth && invoice.userId && invoice.userId.toString() !== req.auth.user) {
    return res.status(403).json({ success: false, error: 'Forbidden', message: 'You do not have access to this invoice' });
  }

  res.json({ success: true, data: invoice });
});

// Get invoice by IRN
router.get('/invoice/:irn', (req, res) => {
  const { irn } = req.params;
  const invoice = generatedInvoices.find(inv => inv.irn === irn);

  if (!invoice) {
    return res.status(404).json({ success: false, message: 'Invoice not found' });
  }

  // IDOR Prevention: Check ownership if auth context exists
  if (req.auth && invoice.userId && invoice.userId.toString() !== req.auth.user) {
    return res.status(403).json({ success: false, error: 'Forbidden', message: 'You do not have access to this invoice' });
  }

  res.json({ success: true, data: invoice });
});

// Get samples with generic filtering
router.get('/samples', (req, res) => {
  try {
    const samples = dataGenerator.getTestSamples();

    // Convert samples to array format
    let samplesArray = Object.entries(samples).map(([id, sample]) =>
      formatSample(id, sample)
    );

    // Parse query parameters
    const { page = 1, limit = 100, sortBy = 'id', sortOrder = 'asc', ...filters } = req.query;

    // Apply generic filtering if filters present
    if (Object.keys(filters).length > 0) {
      samplesArray = filter.apply(samplesArray, filters);
    }

    // Apply sorting
    samplesArray = filter.sort(samplesArray, sortBy, sortOrder);

    // Apply pagination
    const paginated = filter.paginate(samplesArray, page, limit);

    res.json({
      success: true,
      data: paginated.data,
      count: paginated.data.length,
      total: samplesArray.length,
      filters: filters,
      pagination: {
        page: paginated.page,
        limit: paginated.limit,
        total: paginated.total,
        pages: paginated.pages
      },
      sort: { by: sortBy, order: sortOrder }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific sample by ID
router.get('/sample/:id', (req, res) => {
  try {
    const id = req.params.id;
    const samples = dataGenerator.getTestSamples();

    if (samples[id]) {
      res.json({
        success: true,
        data: samples[id],
        sampleId: parseInt(id),
        description: dataGenerator.getSampleDescription(id),
        type: samples[id].TranDtls.SupTyp,
        metadata: formatSample(id, samples[id])
      });
    } else {
      res.status(404).json({
        success: false,
        message: `Sample ${id} not found. Available samples: 1-${Object.keys(samples).length}`,
        availableSamples: Object.keys(samples).map(sid => formatSample(sid, samples[sid]))
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /filter-options - Get filter metadata
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
    res.status(500).json({ success: false, message: 'Error loading filter options', error: error.message });
  }
});

// Get available fields for filtering
router.get('/fields', (req, res) => {
  try {
    const invoiceFields = generatedInvoices.length > 0 ?
      Object.keys(formatInvoice(generatedInvoices[0])) : [];

    const samples = dataGenerator.getTestSamples();
    const sampleFields = Object.keys(samples).length > 0 ?
      Object.keys(formatSample('1', samples[1])) : [];

    const nestedFields = [
      'invoiceData.TranDtls.SupTyp', 'invoiceData.TranDtls.RegRev',
      'invoiceData.DocDtls.No', 'invoiceData.DocDtls.Typ', 'invoiceData.DocDtls.Dt',
      'invoiceData.SellerDtls.Gstin', 'invoiceData.SellerDtls.LglNm', 'invoiceData.SellerDtls.Stcd',
      'invoiceData.BuyerDtls.Gstin', 'invoiceData.BuyerDtls.LglNm', 'invoiceData.BuyerDtls.Stcd', 'invoiceData.BuyerDtls.Pos',
      'invoiceData.ValDtls.TotInvVal', 'invoiceData.ValDtls.AssVal', 'invoiceData.ValDtls.IgstVal', 'invoiceData.ValDtls.CgstVal', 'invoiceData.ValDtls.SgstVal'
    ];

    res.json({
      success: true,
      data: {
        invoiceFields, sampleFields, nestedFields,
        fieldTypes: {
          string: ['irn', 'invoiceNo', 'sellerGstin', 'buyerGstin', 'sellerName', 'buyerName', 'status', 'supplyType', 'documentType', 'sellerState', 'buyerState'],
          number: ['id', 'totalValue', 'itemCount'],
          boolean: ['isInterstate', 'reverseCharge'],
          date: ['generatedAt', 'invoiceDate'],
          nested: nestedFields
        },
        filterOperators: {
          exact: 'field=value', multiple: 'field=value1,value2,value3',
          lessThan: 'field=lt:value', greaterThan: 'field=gt:value',
          equalTo: 'field=eq:value', notEqualTo: 'field=ne:value',
          boolean: 'field=true or field=false', search: 'search=term'
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generic search across all endpoints
router.get('/search', (req, res) => {
  try {
    const { q: query, type = 'all', ...filters } = req.query;

    if (!query) {
      return res.status(400).json({ success: false, message: 'Search query (q) is required' });
    }

    let results = [];

    // Search in invoices
    if (type === 'all' || type === 'invoices') {
      const invoiceResults = filter.apply(generatedInvoices, { search: query, ...filters });
      results.push(...invoiceResults.map(inv => ({ type: 'invoice', data: formatInvoice(inv), score: 1.0 })));
    }

    // Search in samples
    if (type === 'all' || type === 'samples') {
      const samples = dataGenerator.getTestSamples();
      const sampleArray = Object.entries(samples).map(([id, sample]) => formatSample(id, sample));
      const sampleResults = filter.apply(sampleArray, { search: query, ...filters });
      results.push(...sampleResults.map(sample => ({ type: 'sample', data: sample, score: 1.0 })));
    }

    results.sort((a, b) => b.score - a.score);

    res.json({ success: true, query, type, count: results.length, results, filters });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get aggregate statistics
router.get('/stats', (req, res) => {
  try {
    const totalInvoices = generatedInvoices.length;
    const totalValue = generatedInvoices.reduce(
      (sum, inv) => sum + (inv.invoiceData?.ValDtls?.TotInvVal || 0), 0
    );

    const statusBreakdown = {};
    const supplyTypeBreakdown = {};

    generatedInvoices.forEach(inv => {
      // Status counts
      const status = inv.status || 'Unknown';
      statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;

      // Supply type counts
      const supplyType = inv.invoiceData?.TranDtls?.SupTyp || 'Unknown';
      supplyTypeBreakdown[supplyType] = (supplyTypeBreakdown[supplyType] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        totalInvoices,
        totalValue: Math.round(totalValue * 100) / 100,
        averageValue: totalInvoices > 0 ? Math.round((totalValue / totalInvoices) * 100) / 100 : 0,
        statusBreakdown,
        supplyTypeBreakdown
      }
    });
  } catch (error) {
    console.error('Error in /stats:', error);
    res.status(500).json({ success: false, message: 'Error fetching stats', error: error.message });
  }
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

    // Validate amounts (positive values, cross-field math)
    const amountErrors = validateAmounts(invoiceData);
    if (amountErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount validation failed',
        errors: amountErrors
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

    // Check for duplicate document (same SellerGstin + DocType + DocNo + DocDate)
    const existingInvoice = findDuplicateInvoice(invoiceData);
    if (existingInvoice) {
      return res.status(409).json({
        success: false,
        message: 'IRN already generated for this document',
        error: 'Duplicate document: An invoice with the same SellerGstin, DocType, DocNo, and DocDate already exists',
        data: {
          Irn: existingInvoice.irn,
          AckNo: existingInvoice.ackNo,
          AckDt: existingInvoice.ackDt,
          generatedAt: existingInvoice.generatedAt
        }
      });
    }

    // Generate deterministic IRN (SHA-256 hash of SellerGstin + DocType + DocNo + DocDate)
    const irn = generateIRN(
      invoiceData.SellerDtls.Gstin,
      invoiceData.DocDtls.Typ,
      invoiceData.DocDtls.No,
      invoiceData.DocDtls.Dt
    );
    const ackNo = `ACK${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const ackDt = new Date().toLocaleDateString('en-GB');

    const response = {
      success: true,
      data: {
        Irn: irn,
        AckNo: ackNo,
        AckDt: ackDt,
        SignedInvoice: invoiceData,
        QRCode: `QR_${irn}`
      },
      message: 'E-Invoice generated successfully',
      important_notice: '⚠️ THIS IS A TEST IRN - NOT VALID FOR TAX PURPOSES'
    };

    // Store invoice
    generatedInvoices.push({
      id: invoiceCounter++,
      irn: irn,
      ackNo: ackNo,
      ackDt: ackDt,
      invoiceData: invoiceData,
      status: 'Generated',
      generatedAt: new Date().toISOString()
    });

    res.status(201).json(response);

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
        success: false,
        isValid: false,
        errors: regexErrors.map(error => ({ message: error, type: 'regex' }))
      });
    }

    // Schema validation (required fields, types, structure)
    const errors = validateBasicInvoice(invoiceData);

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
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
            success: false,
            isValid: false,
            errors: taxErrors.map(e => ({ message: e, type: 'tax_mismatch' }))
          });
        }
      }
    }

    // Amount validations (positive values, cross-field math)
    const amountErrors = validateAmounts(invoiceData);
    if (amountErrors.length > 0) {
      return res.status(400).json({
        success: false,
        isValid: false,
        errors: amountErrors.map(e => ({ message: e, type: 'amount' }))
      });
    }

    res.json({
      success: true,
      isValid: true,
      message: 'E-Invoice data is valid'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
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
      return res.status(409).json({
        success: false,
        message: 'Invoice is already cancelled',
        error: 'Conflict: This invoice has already been cancelled',
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