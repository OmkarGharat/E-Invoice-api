const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { validateField, determineSupplyType } = require('./validation/regexPatterns');

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

// Mount the E-Invoice Router (single source of truth for all /api/e-invoice/* endpoints)
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