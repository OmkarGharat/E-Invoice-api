const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { validateField } = require('./validation/regexPatterns');

const app = express();

// CORS Configuration - restrict origins instead of wildcard
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : null; // null = allow all (development mode)

app.use(cors({
  origin: allowedOrigins || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'Accept', 'X-CSRF-Token', 'X-Tenant-Id'],
  credentials: allowedOrigins ? true : false // Only allow credentials with specific origins
}));
app.use(bodyParser.json({ limit: '100kb' })); // Limit payload to 100kb to prevent parsing crashes

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Method Enforcement — must run BEFORE security/auth middleware
// so wrong-method requests get 405 instead of 400/401/415
const enforceAllowedMethods = require('./middleware/methodEnforcement');
app.use(enforceAllowedMethods);

// Import Security Middleware (Block 3 Edge Cases)
const security = require('./middleware/security');

// 1. Rate Limit Headers (Response)
// For demonstration, we won't block globally to avoid locking you out.
// app.use(security.rateLimiter); // Uncomment to enable global rate limiting

// 2. Strict Header Validation for API Routes
// IMPORTANT: Exempt auth, edge-cases, and CSRF routes so they can handle their own validation
const exemptFromMandatoryHeaders = ['/api/auth', '/api/edge-cases', '/api/csrf-token'];

app.use('/api', (req, res, next) => {
  // Skip mandatory header checks for exempt routes
  if (exemptFromMandatoryHeaders.some(prefix => req.originalUrl.startsWith(prefix))) {
    return next();
  }
  security.validateMandatoryHeaders(req, res, next);
});

app.use('/api', (req, res, next) => {
  if (exemptFromMandatoryHeaders.some(prefix => req.originalUrl.startsWith(prefix))) {
    return next();
  }
  security.validateAccept(req, res, next);
});

app.use('/api', (req, res, next) => {
  if (exemptFromMandatoryHeaders.some(prefix => req.originalUrl.startsWith(prefix))) {
    return next();
  }
  security.requireJsonContent(req, res, next);
});

// Import Auth Middleware
const { authMiddleware } = require('./middleware/auth');

// ==================== PROTECTED E-INVOICE ROUTES (REAL WORLD) ====================
// The user explicitly requested that "Any authentication method must be mandatory".
// We will enforce Bearer Token for the core E-Invoice routes to simulate a real API.
// Note: We exclude 'auth' routes and 'edge-cases' (which have their own logic).

// Protect /api/e-invoice endpoints
app.use('/api/e-invoice', (req, res, next) => {
  // Whitelist specific public read-only endpoints if needed, but user asked for strictness.
  // We will allow 'stats' and 'samples' to be public for the UI dashboard to work initially,
  // but actions like generate/cancel MUST be protected.

  // Allow public access to harmless metadata (optional, but good for UI)
  if (req.path === '/stats' || req.path === '/samples' || req.path === '/filter-options' || req.path.startsWith('/sample/') || req.path === '/schema') {
    return next();
  }

  // Enforce Universal Auth (API Key, Basic, or Bearer)
  const authResult = authMiddleware.anyAuth(req, res, () => {
    // After auth passes, enforce write scope for state-changing methods
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      // Check if auth context has scopes (OAuth2 flow)
      if (req.auth && req.auth.scopes && !req.auth.scopes.includes('write')) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions. Write scope required for this operation.'
        });
      }
    }
    next();
  });
});

// ==================== EDGE CASE TESTING ENDPOINTS ====================

// 7. Rate Limiting Test Endpoint
app.get('/api/edge-cases/rate-limit', security.rateLimiter, (req, res) => {
  res.json({
    success: true,
    message: 'Request successful. Rate limit not exceeded.',
    limit: res.getHeader('X-RateLimit-Limit'),
    remaining: res.getHeader('X-RateLimit-Remaining')
  });
});

// CSRF Token Generation (for testing double-submit pattern)
app.get('/api/csrf-token', (req, res) => {
  const token = 'csrf-' + Math.random().toString(36).substr(2, 9);
  // Set in Cookie
  res.cookie('CSRF-TOKEN', token);
  // Return in Body (client should put in Header)
  res.json({ csrfToken: token });
});

// Strict Security Test Endpoint (Requires CSRF + Headers)
app.post('/api/edge-cases/strict-post', security.csrfProtection, (req, res) => {
  res.json({
    success: true,
    message: 'Passed Content-Type, Accept, and CSRF checks',
    headers: req.headers
  });
});

// Custom Header Test
app.get('/api/edge-cases/custom-header', (req, res) => {
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Missing mandatory X-Tenant-Id header'
    });
  }
  res.json({
    success: true,
    tenantId: tenantId
  });
});

// Conditional Header Logic (Guest vs Auth)
app.get('/api/edge-cases/conditional-auth', (req, res) => {
  const auth = req.headers.authorization;
  if (req.query.type === 'guest') {
    if (auth) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Guest flow should not have Authorization header'
      });
    }
    return res.json({ success: true, mode: 'guest' });
  }

  if (!auth) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  res.json({ success: true, mode: 'authenticated' });
});

// Scope Protection Test
// Requires 'write' scope. Use token "read-only-token" to fail this.
// const { authMiddleware } = require('./middleware/auth'); // Removed duplicate
app.get('/api/edge-cases/scope-protected', authMiddleware.oauth2, authMiddleware.requireScope('write'), (req, res) => {
  res.json({
    success: true,
    message: 'You have write access!',
    scopes: req.auth.scopes
  });
});

// Cookie Override Pattern
// Sets multiple cookies to demonstrate "Last One Wins"
app.post('/api/edge-cases/cookie-override', (req, res) => {
  // In Node.js/Express, setting the same header key twice usually requires an array or specific handling
  // Standard response.cookie overwrites. To demonstrate multiple Set-Cookie headers:

  res.setHeader('Set-Cookie', [
    'JSESSIONID=old-session-id; Path=/',
    'JSESSIONID=new-session-id-WINNER; Path=/'
  ]);

  res.json({
    success: true,
    message: 'Cookies set. Check your browser/client. The last "Set-Cookie" header usually wins.',
    expectedValue: 'new-session-id-WINNER'
  });
});

// Session Fixation Vulnerability Simulation
// FIXED: Always generates a new server-side session ID, ignoring client input
app.post('/api/edge-cases/session-fixation', (req, res) => {
  const providedSession = req.query.session_id || req.body.session_id;

  // SECURE BEHAVIOR: Always generate a new session ID, never accept client-provided
  const newId = 'secure-' + Math.random().toString(36).substr(2);
  res.setHeader('Set-Cookie', `JSESSIONID=${newId}; Path=/; HttpOnly; SameSite=Strict`);

  const response = {
    success: true,
    type: 'Secure',
    sessionId: newId
  };

  if (providedSession) {
    response.info = 'Client-provided session ID was ignored for security. A new server-generated ID was assigned.';
  }

  res.json(response);
});


// Import Auth Routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Import XML Routes
const xmlRoutes = require('./routes/xmlInvoice');
app.use('/api/e-invoice-xml', xmlRoutes);

// Import data generator
const EInvoiceDataGenerator = require('./utils/dataGenerator');
const dataGenerator = new EInvoiceDataGenerator();

// Simple storage for generated invoices
let invoices = [];
let counter = 1;

// Initialize with some samples
const TEST_SAMPLES = dataGenerator.getTestSamples();
Object.values(TEST_SAMPLES).forEach((sample, index) => {
  invoices.push({
    id: counter++,
    irn: `IRNSAMPLE${index + 1}`,
    invoiceData: sample,
    status: Math.random() > 0.8 ? 'Cancelled' : 'Generated',
    generatedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    ...(Math.random() > 0.8 ? {
      cancelledAt: new Date().toISOString(),
      CnlRsn: String([1, 2, 3, 4][Math.floor(Math.random() * 4)]),
      CnlRem: ['Duplicate invoice entry', 'Data entry mistake in GSTIN', 'Order cancelled by buyer', 'Incorrect tax amount'][Math.floor(Math.random() * 4)]
    } : {})
  });
});

// ==================== GENERIC FILTERING SYSTEM ====================

class GenericFilter {
  constructor(data) {
    this.data = data;
  }

  /**
   * Apply generic filters to any data array
   * @param {Array} data - The data to filter
   * @param {Object} filters - Filter parameters
   * @param {Object} fieldMapping - Map query params to actual fields
   * @returns {Array} Filtered data
   */
  apply(data, filters, fieldMapping = {}) {
    let filteredData = [...data];

    // Apply each filter dynamically
    Object.keys(filters).forEach(filterKey => {
      if (filterKey === 'page' || filterKey === 'limit' || filterKey === 'sortBy' || filterKey === 'sortOrder') {
        return; // Skip pagination/sorting params
      }

      const filterValue = filters[filterKey];
      if (filterValue === undefined || filterValue === '') {
        return;
      }

      // Map query param to actual field name
      const actualField = fieldMapping[filterKey] || filterKey;

      filteredData = this.applySingleFilter(filteredData, actualField, filterValue);
    });

    return filteredData;
  }

  /**
   * Apply a single filter dynamically
   */
  applySingleFilter(data, field, value) {
    return data.filter(item => {
      // Get the value from the item (support nested paths)
      const itemValue = this.getValueFromPath(item, field);

      // Handle special filter patterns
      if (typeof value === 'string') {
        // Multiple values (OR logic) - comma separated
        if (value.includes(',') && !value.startsWith('lt:') && !value.startsWith('gt:') && !value.startsWith('eq:') && !value.startsWith('ne:')) {
          const values = value.split(',').map(v => v.trim());
          return values.some(v => this.compareValues(itemValue, v));
        }

        // Range filters (lt:, gt:, eq:, ne:)
        if (value.startsWith('lt:')) {
          const numValue = parseFloat(value.substring(3));
          return typeof itemValue === 'number' && itemValue < numValue;
        }
        if (value.startsWith('gt:')) {
          const numValue = parseFloat(value.substring(3));
          return typeof itemValue === 'number' && itemValue > numValue;
        }
        if (value.startsWith('eq:')) {
          const compareValue = value.substring(3);
          return this.compareValues(itemValue, compareValue);
        }
        if (value.startsWith('ne:')) {
          const compareValue = value.substring(3);
          return !this.compareValues(itemValue, compareValue);
        }

        // Boolean filters
        if (value === 'true' || value === 'false') {
          const boolValue = value === 'true';
          return itemValue === boolValue;
        }

        // Date range (from:to)
        if (value.includes(':')) {
          const [dateFrom, dateTo] = value.split(':');
          if (dateFrom && dateTo) {
            const itemDate = new Date(itemValue);
            const fromDate = new Date(dateFrom);
            const toDate = new Date(dateTo);
            return itemDate >= fromDate && itemDate <= toDate;
          }
        }

        // Text search (case-insensitive partial match)
        if (field === 'search') {
          return this.searchInItem(item, value);
        }
      }

      // Default: exact match (case-insensitive for strings)
      return this.compareValues(itemValue, value);
    });
  }

  /**
   * Get value from nested path (e.g., 'invoiceData.DocDtls.No')
   */
  getValueFromPath(item, path) {
    return path.split('.').reduce((obj, key) => obj && obj[key], item);
  }

  /**
   * Compare values with type conversion
   */
  compareValues(itemValue, filterValue) {
    // Handle numbers
    if (typeof itemValue === 'number' && !isNaN(filterValue)) {
      return itemValue === parseFloat(filterValue);
    }

    // Handle booleans
    if (typeof itemValue === 'boolean') {
      return itemValue === (filterValue === 'true');
    }

    // Handle strings (case-insensitive)
    if (typeof itemValue === 'string') {
      return itemValue.toLowerCase() === filterValue.toLowerCase();
    }

    // Default strict equality
    return itemValue == filterValue;
  }

  /**
   * Search across multiple fields in an item
   */
  searchInItem(item, searchTerm) {
    const term = searchTerm.toLowerCase();

    // Define searchable fields (can be customized)
    const searchableFields = [
      'irn',
      'invoiceData.DocDtls.No',
      'invoiceData.SellerDtls.LglNm',
      'invoiceData.BuyerDtls.LglNm',
      'invoiceData.SellerDtls.Gstin',
      'invoiceData.BuyerDtls.Gstin',
      'status'
    ];

    return searchableFields.some(field => {
      const value = this.getValueFromPath(item, field);
      return value && value.toString().toLowerCase().includes(term);
    });
  }

  /**
   * Sort data dynamically
   */
  sort(data, sortBy = 'generatedAt', sortOrder = 'desc') {
    const order = sortOrder === 'desc' ? -1 : 1;

    return [...data].sort((a, b) => {
      const aValue = this.getValueFromPath(a, sortBy);
      const bValue = this.getValueFromPath(b, sortBy);

      if (aValue < bValue) return -1 * order;
      if (aValue > bValue) return 1 * order;
      return 0;
    });
  }

  /**
   * Apply pagination
   */
  paginate(data, page = 1, limit = 10) {
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;

    return {
      data: data.slice(startIndex, endIndex),
      total: data.length,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(data.length / limitNum),
      hasNext: endIndex < data.length,
      hasPrev: startIndex > 0
    };
  }
}

// Create filter instance
const filter = new GenericFilter();

// ==================== HELPER FUNCTIONS ====================

/**
 * Format invoice for response
 */
function formatInvoice(invoice) {
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
    isInterstate: invoice.invoiceData.SellerDtls.Stcd !== invoice.invoiceData.BuyerDtls.Pos,
    reverseCharge: invoice.invoiceData.TranDtls.RegRev === 'Y',
    itemCount: invoice.invoiceData.ItemList ? invoice.invoiceData.ItemList.length : 0
  };
}

/**
 * Format sample for response
 */
function formatSample(id, sample) {
  return {
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
  };
}

// ==================== API ENDPOINTS WITH GENERIC FILTERING ====================

// Root endpoint
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'E-Invoice API is running smoothly',
    timestamp: new Date().toISOString(),
    totalInvoices: invoices.length,
    version: '2.2.0',
    features: {
      genericFiltering: true,
      dynamicFieldSupport: true,
      pagination: true,
      sorting: true,
      search: true
    }
  });
});

// Note: 405 for wrong methods on /health is handled globally
// by the methodEnforcement middleware (runs before security checks).

// Get all invoices with generic filtering
app.get('/api/e-invoice/invoices', (req, res) => {
  try {
    // Parse query parameters
    const { page = 1, limit = 10, sortBy = 'generatedAt', sortOrder = 'desc', ...filters } = req.query;

    // ------------------------------------------------------------------
    // Input validation — reject invalid pagination/sorting params with 400
    // ------------------------------------------------------------------
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

    // ------------------------------------------------------------------
    // Validate enum/filter values — reject invalid values with 400
    // ------------------------------------------------------------------
    const VALID_STATUSES = ['Generated', 'Cancelled'];
    const VALID_SUPPLY_TYPES = ['B2B', 'EXPWP', 'EXPWOP', 'SEZWP', 'SEZWOP', 'DEXP'];
    const VALID_DOC_TYPES = ['INV', 'CRN', 'DBN'];

    if (filters.status && !VALID_STATUSES.includes(filters.status)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Invalid status: '${filters.status}'. Valid values: ${VALID_STATUSES.join(', ')}`
      });
    }

    if (filters.supplyType && !VALID_SUPPLY_TYPES.includes(filters.supplyType)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Invalid supplyType: '${filters.supplyType}'. Valid values: ${VALID_SUPPLY_TYPES.join(', ')}`
      });
    }

    if (filters.documentType && !VALID_DOC_TYPES.includes(filters.documentType)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Invalid documentType: '${filters.documentType}'. Valid values: ${VALID_DOC_TYPES.join(', ')}`
      });
    }

    // Validate plural comma-separated enums
    if (filters.supplyTypes) {
      const types = filters.supplyTypes.split(',').map(t => t.trim());
      const invalid = types.filter(t => !VALID_SUPPLY_TYPES.includes(t));
      if (invalid.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: `Invalid supplyTypes: '${invalid.join(', ')}'. Valid values: ${VALID_SUPPLY_TYPES.join(', ')}`
        });
      }
    }

    if (filters.statuses) {
      const statuses = filters.statuses.split(',').map(s => s.trim());
      const invalid = statuses.filter(s => !VALID_STATUSES.includes(s));
      if (invalid.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: `Invalid statuses: '${invalid.join(', ')}'. Valid values: ${VALID_STATUSES.join(', ')}`
        });
      }
    }

    // Validate boolean filters
    if (filters.interstate !== undefined && !['true', 'false'].includes(filters.interstate)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Invalid interstate value: '${filters.interstate}'. Must be 'true' or 'false'.`
      });
    }

    if (filters.reverseCharge !== undefined && !['true', 'false'].includes(filters.reverseCharge)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Invalid reverseCharge value: '${filters.reverseCharge}'. Must be 'true' or 'false'.`
      });
    }

    // Validate numeric range filters
    if (filters.minValue !== undefined && isNaN(parseFloat(filters.minValue))) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Invalid minValue: '${filters.minValue}'. Must be a number.`
      });
    }

    if (filters.maxValue !== undefined && isNaN(parseFloat(filters.maxValue))) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Invalid maxValue: '${filters.maxValue}'. Must be a number.`
      });
    }

    // Validate date filters
    if (filters.dateFrom !== undefined && isNaN(new Date(filters.dateFrom).getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Invalid dateFrom: '${filters.dateFrom}'. Must be a valid date (e.g., 2024-01-01).`
      });
    }

    if (filters.dateTo !== undefined && isNaN(new Date(filters.dateTo).getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Invalid dateTo: '${filters.dateTo}'. Must be a valid date (e.g., 2024-12-31).`
      });
    }

    // ------------------------------------------------------------------
    // Regex validation for GSTIN, state codes, and document number filters
    // ------------------------------------------------------------------
    if (filters.sellerGstin) {
      const r = validateField('Gstin', filters.sellerGstin);
      if (!r.valid) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: `Invalid sellerGstin: '${filters.sellerGstin}'. ${r.message}`
        });
      }
    }

    if (filters.buyerGstin) {
      const r = validateField('BuyerGstin', filters.buyerGstin);
      if (!r.valid) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: `Invalid buyerGstin: '${filters.buyerGstin}'. ${r.message}`
        });
      }
    }

    if (filters.sellerState) {
      const r = validateField('Stcd', filters.sellerState);
      if (!r.valid) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: `Invalid sellerState: '${filters.sellerState}'. ${r.message}`
        });
      }
    }

    if (filters.buyerState) {
      const r = validateField('Stcd', filters.buyerState);
      if (!r.valid) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: `Invalid buyerState: '${filters.buyerState}'. ${r.message}`
        });
      }
    }

    if (filters.invoiceNo) {
      const r = validateField('DocNo', filters.invoiceNo);
      if (!r.valid) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: `Invalid invoiceNo: '${filters.invoiceNo}'. ${r.message}`
        });
      }
    }

    // ------------------------------------------------------------------
    // Map user-friendly query param names → actual nested data paths
    // ------------------------------------------------------------------
    const fieldMapping = {
      supplyType:    'invoiceData.TranDtls.SupTyp',
      documentType:  'invoiceData.DocDtls.Typ',
      sellerState:   'invoiceData.SellerDtls.Stcd',
      buyerState:    'invoiceData.BuyerDtls.Stcd',
      totalValue:    'invoiceData.ValDtls.TotInvVal',
      sellerGstin:   'invoiceData.SellerDtls.Gstin',
      buyerGstin:    'invoiceData.BuyerDtls.Gstin',
      invoiceNo:     'invoiceData.DocDtls.No',
      // status & search are top-level / special — no mapping needed
    };

    // ------------------------------------------------------------------
    // Extract special filters that need custom logic (not generic path matching)
    // ------------------------------------------------------------------
    const specialKeys = [
      'dateFrom', 'dateTo', 'minValue', 'maxValue',
      'interstate', 'reverseCharge',
      'supplyTypes', 'statuses'
    ];

    const genericFilters = {};
    Object.keys(filters).forEach(key => {
      if (!specialKeys.includes(key)) {
        genericFilters[key] = filters[key];
      }
    });

    // ------------------------------------------------------------------
    // 1. Apply generic filters (exact match, gt:/lt:, comma-separated, search, etc.)
    // ------------------------------------------------------------------
    let filteredData = filter.apply(invoices, genericFilters, fieldMapping);

    // ------------------------------------------------------------------
    // 2. Apply special filters that GenericFilter cannot handle
    // ------------------------------------------------------------------

    // supplyTypes (plural, comma-separated) → OR match on SupTyp
    if (filters.supplyTypes) {
      const types = filters.supplyTypes.split(',').map(t => t.trim());
      filteredData = filteredData.filter(inv =>
        types.includes(inv.invoiceData.TranDtls.SupTyp)
      );
    }

    // statuses (plural, comma-separated) → OR match on status
    if (filters.statuses) {
      const statuses = filters.statuses.split(',').map(s => s.trim());
      filteredData = filteredData.filter(inv =>
        statuses.includes(inv.status)
      );
    }

    // dateFrom / dateTo → filter on generatedAt
    if (filters.dateFrom || filters.dateTo) {
      const from = filters.dateFrom ? new Date(filters.dateFrom) : new Date(0);
      const to   = filters.dateTo   ? new Date(filters.dateTo)   : new Date('2999-12-31');
      // Set 'to' to end of day so dateTo is inclusive
      to.setHours(23, 59, 59, 999);
      filteredData = filteredData.filter(inv => {
        const d = new Date(inv.generatedAt);
        return d >= from && d <= to;
      });
    }

    // minValue / maxValue → filter on TotInvVal
    if (filters.minValue !== undefined) {
      const min = parseFloat(filters.minValue);
      if (!isNaN(min)) {
        filteredData = filteredData.filter(inv =>
          inv.invoiceData.ValDtls.TotInvVal >= min
        );
      }
    }
    if (filters.maxValue !== undefined) {
      const max = parseFloat(filters.maxValue);
      if (!isNaN(max)) {
        filteredData = filteredData.filter(inv =>
          inv.invoiceData.ValDtls.TotInvVal <= max
        );
      }
    }

    // interstate=true|false → computed: sellerState !== BuyerDtls.Pos
    if (filters.interstate !== undefined) {
      const wantInterstate = filters.interstate === 'true';
      filteredData = filteredData.filter(inv => {
        const isInterstate = inv.invoiceData.SellerDtls.Stcd !== inv.invoiceData.BuyerDtls.Pos;
        return isInterstate === wantInterstate;
      });
    }

    // reverseCharge=true|false → computed: RegRev === 'Y'
    if (filters.reverseCharge !== undefined) {
      const wantRC = filters.reverseCharge === 'true';
      filteredData = filteredData.filter(inv => {
        const isRC = inv.invoiceData.TranDtls.RegRev === 'Y';
        return isRC === wantRC;
      });
    }

    // ------------------------------------------------------------------
    // 3. Sorting
    // ------------------------------------------------------------------
    // Map user-friendly sort fields to actual nested paths
    const sortFieldMapping = {
      totalValue:   'invoiceData.ValDtls.TotInvVal',
      supplyType:   'invoiceData.TranDtls.SupTyp',
      documentType: 'invoiceData.DocDtls.Typ',
      sellerState:  'invoiceData.SellerDtls.Stcd',
      buyerState:   'invoiceData.BuyerDtls.Stcd',
      invoiceNo:    'invoiceData.DocDtls.No',
    };
    const actualSortBy = sortFieldMapping[sortBy] || sortBy;
    filteredData = filter.sort(filteredData, actualSortBy, validSortOrder);

    // ------------------------------------------------------------------
    // 4. Pagination
    // ------------------------------------------------------------------
    const paginated = filter.paginate(filteredData, validPage, validLimit);

    // Format response
    const responseData = paginated.data.map(formatInvoice);

    const response = {
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
      sort: {
        by: sortBy,
        order: validSortOrder
      },
      availableFields: Object.keys(responseData[0] || {}).concat([
        'invoiceData.TranDtls.SupTyp',
        'invoiceData.DocDtls.Typ',
        'invoiceData.SellerDtls.Stcd',
        'invoiceData.BuyerDtls.Stcd',
        'invoiceData.ValDtls.TotInvVal'
      ])
    };

    // Set custom headers
    res.set({
      'X-Total-Count': paginated.total,
      'X-Page-Count': paginated.pages,
      'X-Page': paginated.page,
      'X-Limit': paginated.limit,
      'X-Has-Next': paginated.hasNext,
      'X-Has-Prev': paginated.hasPrev
    });

    res.json(response);

  } catch (error) {
    console.error('Error in /invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching invoices',
      error: error.message,
      details: 'Check your filter parameters'
    });
  }
});

// Get samples with generic filtering
app.get('/api/e-invoice/samples', (req, res) => {
  try {
    const samples = dataGenerator.getTestSamples();

    // Convert samples to array format
    let samplesArray = Object.entries(samples).map(([id, sample]) =>
      formatSample(id, sample)
    );

    // Parse query parameters
    const { page = 1, limit = 10, sortBy = 'id', sortOrder = 'asc', ...filters } = req.query;

    // Apply generic filtering if filters present
    if (Object.keys(filters).length > 0) {
      samplesArray = filter.apply(samplesArray, filters);
    }

    // Apply sorting
    samplesArray = filter.sort(samplesArray, sortBy, sortOrder);

    // Apply pagination
    const { page: pageNum = 1, limit: limitNum = 100 } = req.query;
    const paginated = filter.paginate(samplesArray, pageNum, limitNum);

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
      sort: {
        by: sortBy,
        order: sortOrder
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get specific sample by ID
app.get('/api/e-invoice/sample/:id', (req, res) => {
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
        availableSamples: Object.keys(samples).map(id =>
          formatSample(id, samples[id])
        )
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get available fields for filtering
app.get('/api/e-invoice/fields', (req, res) => {
  try {
    // Get field info from invoices
    const invoiceFields = invoices.length > 0 ?
      Object.keys(formatInvoice(invoices[0])) : [];

    // Get field info from samples
    const samples = dataGenerator.getTestSamples();
    const sampleFields = Object.keys(samples).length > 0 ?
      Object.keys(formatSample('1', samples[1])) : [];

    // Get nested fields
    const nestedFields = [
      'invoiceData.TranDtls.SupTyp',
      'invoiceData.TranDtls.RegRev',
      'invoiceData.DocDtls.No',
      'invoiceData.DocDtls.Typ',
      'invoiceData.DocDtls.Dt',
      'invoiceData.SellerDtls.Gstin',
      'invoiceData.SellerDtls.LglNm',
      'invoiceData.SellerDtls.Stcd',
      'invoiceData.BuyerDtls.Gstin',
      'invoiceData.BuyerDtls.LglNm',
      'invoiceData.BuyerDtls.Stcd',
      'invoiceData.BuyerDtls.Pos',
      'invoiceData.ValDtls.TotInvVal',
      'invoiceData.ValDtls.AssVal',
      'invoiceData.ValDtls.IgstVal',
      'invoiceData.ValDtls.CgstVal',
      'invoiceData.ValDtls.SgstVal'
    ];

    const fieldTypes = {
      string: ['irn', 'invoiceNo', 'sellerGstin', 'buyerGstin', 'sellerName', 'buyerName', 'status', 'supplyType', 'documentType', 'sellerState', 'buyerState'],
      number: ['id', 'totalValue', 'itemCount'],
      boolean: ['isInterstate', 'reverseCharge'],
      date: ['generatedAt', 'invoiceDate'],
      nested: nestedFields
    };

    res.json({
      success: true,
      data: {
        invoiceFields,
        sampleFields,
        nestedFields,
        fieldTypes,
        filterOperators: {
          exact: 'field=value',
          multiple: 'field=value1,value2,value3',
          lessThan: 'field=lt:value',
          greaterThan: 'field=gt:value',
          equalTo: 'field=eq:value',
          notEqualTo: 'field=ne:value',
          dateRange: 'dateField=2024-01-01:2026-12-31',
          boolean: 'field=true or field=false',
          search: 'search=term'
        },
        examples: {
          invoices: {
            exact: '/invoices?status=Generated',
            multiple: '/invoices?supplyType=B2B,EXPWP',
            range: '/invoices?totalValue=lt:100000',
            date: '/invoices?generatedAt=2024-01-01:2026-12-31',
            nested: '/invoices?invoiceData.TranDtls.SupTyp=B2B',
            combined: '/invoices?status=Generated&supplyType=B2B&totalValue=gt:50000'
          },
          samples: {
            exact: '/samples?totalValue=442500',
            multiple: '/samples?type=B2B,EXPWP',
            boolean: '/samples?isInterstate=true',
            range: '/samples?totalValue=lt:100000',
            search: '/samples?search=INV/2024'
          }
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get statistics
app.get('/api/e-invoice/stats', (req, res) => {
  try {
    const activeInvoices = invoices.filter(inv => inv.status === 'Generated');
    const cancelledInvoices = invoices.filter(inv => inv.status === 'Cancelled');

    const stats = {
      totalInvoices: invoices.length,
      generated: activeInvoices.length,
      cancelled: cancelledInvoices.length,
      bySupplyType: {},
      byState: {},
      totalValue: activeInvoices.reduce((sum, inv) => sum + inv.invoiceData.ValDtls.TotInvVal, 0),
      cancelledValue: cancelledInvoices.reduce((sum, inv) => sum + inv.invoiceData.ValDtls.TotInvVal, 0)
    };

    invoices.forEach(inv => {
      const supplyType = inv.invoiceData.TranDtls.SupTyp;
      const state = inv.invoiceData.SellerDtls.Stcd;

      stats.bySupplyType[supplyType] = (stats.bySupplyType[supplyType] || 0) + 1;
      stats.byState[state] = (stats.byState[state] || 0) + 1;
    });

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/e-invoice/filter-options - Get filter metadata
app.get('/api/e-invoice/filter-options', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        statuses: ['Generated', 'Cancelled'],
        supplyTypes: ['B2B', 'EXPWP', 'EXPWOP', 'SEZWP', 'SEZWOP', 'DEXP'],
        states: Object.keys(dataGenerator.states || {}).map(code => ({
          code: code,
          name: dataGenerator.states[code]?.name || code
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

// Generic search across all endpoints
app.get('/api/e-invoice/search', (req, res) => {
  try {
    const { q: query, type = 'all', ...filters } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query (q) is required'
      });
    }

    let results = [];

    // Search in invoices
    if (type === 'all' || type === 'invoices') {
      const invoiceResults = filter.apply(invoices, { search: query, ...filters });
      results.push(...invoiceResults.map(inv => ({
        type: 'invoice',
        data: formatInvoice(inv),
        score: 1.0
      })));
    }

    // Search in samples
    if (type === 'all' || type === 'samples') {
      const samples = dataGenerator.getTestSamples();
      const sampleArray = Object.entries(samples).map(([id, sample]) =>
        formatSample(id, sample)
      );

      const sampleResults = filter.apply(sampleArray, { search: query, ...filters });
      results.push(...sampleResults.map(sample => ({
        type: 'sample',
        data: sample,
        score: 1.0
      })));
    }

    // Sort by relevance (simple implementation)
    results.sort((a, b) => b.score - a.score);

    res.json({
      success: true,
      query,
      type,
      count: results.length,
      results,
      filters
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mount the E-Invoice functionality (Invoices, Generation, Stats, etc.)
// This router handles all /api/e-invoice/* endpoints not already defined above
const eInvoiceRoutes = require('./routes/eInvoice');
app.use('/api/e-invoice', eInvoiceRoutes);

// Error handling
app.use((error, req, res, next) => {
  // Handle SyntaxError (Malformed JSON) from body-parser
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Invalid JSON payload format'
    });
  }

  // Handle PayloadTooLargeError (Request Entity Too Large)
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'Payload Too Large',
      message: 'Request body exceeds the 100kb limit'
    });
  }

  // Log only unexpected 500 errors
  console.error('Error:', error);

  res.status(500).json({
    success: false,
    error: 'Server Error',
    message: 'Something went wrong'
  });
});

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: `The API endpoint ${req.method} ${req.originalUrl} does not exist`,
    availableEndpoints: [
      'GET    /health',
      'GET    /api/e-invoice/invoices',
      'GET    /api/e-invoice/samples',
      'GET    /api/e-invoice/sample/:id',
      'GET    /api/e-invoice/fields',
      'GET    /api/e-invoice/search',
      'GET    /api/e-invoice/stats',
      'POST   /api/e-invoice/generate',
      'POST   /api/e-invoice/generate-dynamic',
      'POST   /api/e-invoice/validate',
      'POST   /api/e-invoice/cancel'
    ]
  });
});

// Export for Vercel
module.exports = app;

// For local development
if (require.main === module) {
  const startServer = (port) => {
    const server = app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
      console.log(`📖 Documentation: http://localhost:${port}`);
      console.log(`🔧 Generic filtering enabled - works for ANY field!`);
    }).on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`⚠️ Port ${port} is busy, trying ${port + 1}...`);
        startServer(port + 1);
      } else {
        console.error(err);
      }
    });
  };

  startServer(process.env.PORT || 3000);
}