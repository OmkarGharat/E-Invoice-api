/**
 * Method Enforcement Middleware
 * 
 * Returns 405 Method Not Allowed when a request uses the wrong HTTP method
 * for a known route. Must be registered BEFORE security/auth middleware
 * so the 405 is returned before header or credential checks reject
 * the request with 400/401/415.
 * 
 * Also sets the standard `Allow` response header per RFC 7231 §6.5.5.
 */

// All known API routes and their allowed methods.
// HEAD is implicitly allowed on GET routes (Express handles this natively).
const ROUTE_METHODS = [
  // ==================== Health ====================
  { path: '/health', methods: ['GET'] },

  // ==================== CSRF ====================
  { path: '/api/csrf-token', methods: ['GET'] },

  // ==================== Edge Cases ====================
  { pattern: /^\/api\/edge-cases\/rate-limit$/, methods: ['GET'] },
  { pattern: /^\/api\/edge-cases\/strict-post$/, methods: ['POST'] },
  { pattern: /^\/api\/edge-cases\/custom-header$/, methods: ['GET'] },
  { pattern: /^\/api\/edge-cases\/conditional-auth$/, methods: ['GET'] },
  { pattern: /^\/api\/edge-cases\/scope-protected$/, methods: ['GET'] },
  { pattern: /^\/api\/edge-cases\/cookie-override$/, methods: ['POST'] },
  { pattern: /^\/api\/edge-cases\/session-fixation$/, methods: ['POST'] },

  // ==================== Auth ====================
  { pattern: /^\/api\/auth\/credentials$/, methods: ['GET'] },
  { pattern: /^\/api\/auth\/login$/, methods: ['POST'] },
  { pattern: /^\/api\/auth\/session-login$/, methods: ['POST'] },
  { pattern: /^\/api\/auth\/test\/api-key$/, methods: ['GET'] },
  { pattern: /^\/api\/auth\/test\/basic$/, methods: ['GET'] },
  { pattern: /^\/api\/auth\/test\/bearer$/, methods: ['GET'] },
  { pattern: /^\/api\/auth\/test\/oauth$/, methods: ['GET'] },
  { pattern: /^\/api\/auth\/test\/session$/, methods: ['GET'] },

  // ==================== E-Invoice (GET) ====================
  { pattern: /^\/api\/e-invoice\/invoices$/, methods: ['GET'] },
  { pattern: /^\/api\/e-invoice\/invoices\/\d+$/, methods: ['GET'] },
  { pattern: /^\/api\/e-invoice\/invoice\/[^/]+$/, methods: ['GET'] },
  { pattern: /^\/api\/e-invoice\/samples$/, methods: ['GET'] },
  { pattern: /^\/api\/e-invoice\/sample$/, methods: ['GET'] },
  { pattern: /^\/api\/e-invoice\/sample\/[^/]+$/, methods: ['GET'] },
  { pattern: /^\/api\/e-invoice\/fields$/, methods: ['GET'] },
  { pattern: /^\/api\/e-invoice\/stats$/, methods: ['GET'] },
  { pattern: /^\/api\/e-invoice\/filter-options$/, methods: ['GET'] },
  { pattern: /^\/api\/e-invoice\/search$/, methods: ['GET'] },
  { pattern: /^\/api\/e-invoice\/scenarios$/, methods: ['GET'] },
  { pattern: /^\/api\/e-invoice\/schema$/, methods: ['GET'] },
  { pattern: /^\/api\/e-invoice\/validation-rules$/, methods: ['GET'] },
  { pattern: /^\/api\/e-invoice\/test-scenarios$/, methods: ['GET'] },

  // ==================== E-Invoice (POST) ====================
  { pattern: /^\/api\/e-invoice\/generate$/, methods: ['POST'] },
  { pattern: /^\/api\/e-invoice\/generate-dynamic$/, methods: ['POST'] },
  { pattern: /^\/api\/e-invoice\/validate$/, methods: ['POST'] },
  { pattern: /^\/api\/e-invoice\/cancel$/, methods: ['POST'] },
  { pattern: /^\/api\/e-invoice\/bulk-generate$/, methods: ['POST'] },
  { pattern: /^\/api\/e-invoice\/reset-data$/, methods: ['POST'] },

  // ==================== E-Invoice XML ====================
  { pattern: /^\/api\/e-invoice-xml\/schema$/, methods: ['GET'] },
  { pattern: /^\/api\/e-invoice-xml\/validate$/, methods: ['POST'] },
  { pattern: /^\/api\/e-invoice-xml\/\d+$/, methods: ['GET'] },
];

/**
 * Middleware function.
 * Match the incoming request path against known routes.
 * If the path matches but the method is wrong → 405.
 * If no route matches → let Express handle it normally (will eventually 404).
 */
function enforceAllowedMethods(req, res, next) {
  // Never block CORS preflight
  if (req.method === 'OPTIONS') return next();

  // HEAD is implicitly allowed wherever GET is allowed
  const effectiveMethod = req.method === 'HEAD' ? 'GET' : req.method;

  const requestPath = req.path; // e.g. /api/e-invoice/invoices

  for (const route of ROUTE_METHODS) {
    let matches = false;

    if (route.path) {
      // Exact string match
      matches = requestPath === route.path;
    } else if (route.pattern) {
      // Regex match
      matches = route.pattern.test(requestPath);
    }

    if (matches) {
      if (!route.methods.includes(effectiveMethod)) {
        // Build Allow header value (include HEAD for GET routes)
        const allowed = [...route.methods];
        if (allowed.includes('GET') && !allowed.includes('HEAD')) {
          allowed.push('HEAD');
        }

        res.set('Allow', allowed.join(', '));
        return res.status(405).json({
          success: false,
          error: 'Method Not Allowed',
          message: `${req.method} is not allowed on ${requestPath}. Use ${route.methods.join(' or ')} instead.`,
          allowedMethods: allowed
        });
      }
      // Method is allowed — continue
      return next();
    }
  }

  // No route matched — let Express handle it (will eventually hit 404 handler)
  next();
}

module.exports = enforceAllowedMethods;
