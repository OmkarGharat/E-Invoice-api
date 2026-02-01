// API Base URL
// const API_BASE = '';

// Global function definitions
// Global state to store fetched credentials
let APP_CREDENTIALS = {
    apiKey: '',
    username: '',
    password: ''
};

// Global function definitions
window.testEndpoint = async function (endpoint, containerId = 'testResult', contentId = 'resultContent') {
    const testResult = document.getElementById(containerId);
    const resultContent = document.getElementById(contentId);

    if (!testResult || !resultContent) {
        console.error('Required DOM elements not found');
        return;
    }

    // Show loading state
    testResult.style.display = 'block';
    resultContent.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"></div><div class="mt-2">Loading...</div></div>';
    testResult.querySelector('.card').className = 'card bg-dark border-secondary';

    try {
        // Auto-Auth for "Quick Testing" dashboard (Simulating User w/ Headers)
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + (APP_CREDENTIALS.token || 'demo-token'),
            'x-api-key': APP_CREDENTIALS.apiKey || 'ei_demo_8x92m3c7-4j5k-2h1g-9s8d-7f6g5h4j3k2l'
        };

        // Allow valid auth override if specific auth is needed
        if (APP_CREDENTIALS.apiKey) {
            headers['x-api-key'] = APP_CREDENTIALS.apiKey;
        }

        const response = await fetch(endpoint, { headers });
        const contentType = response.headers.get('content-type');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (contentType && contentType.includes('application/xml')) {
            const text = await response.text();
            resultContent.textContent = text;
        } else {
            const data = await response.json();
            resultContent.textContent = JSON.stringify(data, null, 2);
        }

        testResult.querySelector('.card').className = 'card bg-dark border-success';

        // Update stats if health endpoint was tested
        if (endpoint === '/health') {
            loadStats();
        }

        // Scroll to the result section
        testResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (error) {
        console.error('Error testing endpoint:', error);
        resultContent.textContent = 'Error: ' + error.message;
        testResult.querySelector('.card').className = 'card bg-dark border-danger';

        // Scroll to the error
        testResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
};


window.testSample = function (sampleId) {
    window.testEndpoint('/api/e-invoice/sample/' + sampleId);
};

window.copySchema = async function (event) {
    try {
        const response = await fetch('/api/e-invoice/schema');
        const data = await response.json();

        if (data.success) {
            const schemaString = JSON.stringify(data.data, null, 2);
            await navigator.clipboard.writeText(schemaString);

            // Show temporary feedback
            const btn = event.target.closest('button');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="bi bi-check me-1"></i>Copied!';
            btn.className = 'btn btn-outline-success';

            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.className = 'btn btn-outline-info';
            }, 2000);
        } else {
            alert('Failed to fetch schema');
        }
    } catch (error) {
        console.error('Error copying schema:', error);
        alert('Error copying schema');
    }
};

window.copyXmlSchema = async function (event) {
    try {
        const response = await fetch('/api/e-invoice-xml/schema');

        if (response.ok) {
            const schemaString = await response.text();
            await navigator.clipboard.writeText(schemaString);

            // Show temporary feedback
            const btn = event.target.closest('button');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="bi bi-check me-1"></i>Copied!';
            btn.className = 'btn btn-outline-success';

            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.className = 'btn btn-outline-info';
            }, 2000);
        } else {
            alert('Failed to fetch XML schema');
        }
    } catch (error) {
        console.error('Error copying XML schema:', error);
        alert('Error copying XML schema');
    }
};

window.copyResult = async function () {
    const resultContent = document.getElementById('resultContent');
    if (!resultContent) return;

    try {
        await navigator.clipboard.writeText(resultContent.textContent);

        // Show temporary feedback
        const btn = event.target;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-check me-1"></i>Copied!';
        btn.className = 'btn btn-sm btn-success';

        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.className = 'btn btn-sm btn-outline-light';
        }, 2000);
    } catch (error) {
        console.error('Failed to copy:', error);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = resultContent.textContent;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);

        const btn = event.target;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-check me-1"></i>Copied!';
        btn.className = 'btn btn-sm btn-success';

        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.className = 'btn btn-sm btn-outline-light';
        }, 2000);
    }
};

window.generateInvoice = async function () {
    const count = prompt('How many invoices to generate?', '1');
    if (count) {
        const testResult = document.getElementById('testResult');
        const resultContent = document.getElementById('resultContent');

        if (testResult && resultContent) {
            testResult.style.display = 'block';
            resultContent.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"></div><div class="mt-2">Generating invoices...</div></div>';
            testResult.querySelector('.card').className = 'card bg-dark border-secondary';
        }

        try {
            const headers = { 'Content-Type': 'application/json' };
            // Auto-Auth for convenience
            if (APP_CREDENTIALS.apiKey) {
                headers['x-api-key'] = APP_CREDENTIALS.apiKey;
            }

            const response = await fetch('/api/e-invoice/generate-dynamic', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ count: parseInt(count) })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (testResult && resultContent) {
                resultContent.textContent = JSON.stringify(data, null, 2);
                testResult.querySelector('.card').className = 'card bg-dark border-success';
            }

            // Refresh stats and invoices
            loadStats();

            // Scroll to result
            testResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        } catch (error) {
            console.error('Error generating invoice:', error);
            if (testResult && resultContent) {
                resultContent.textContent = 'Error: ' + error.message;
                testResult.querySelector('.card').className = 'card bg-dark border-danger';

                // Scroll to error
                testResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }
};

// Load API statistics
async function loadStats() {
    try {
        const response = await fetch('/health');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        const totalInvoicesEl = document.getElementById('totalInvoices');
        const apiStatusEl = document.getElementById('apiStatus');

        if (totalInvoicesEl) {
            totalInvoicesEl.textContent = data.totalInvoices || '--';
        }

        if (apiStatusEl) {
            apiStatusEl.textContent = data.status === 'OK' ? '✅ Online' : '❌ Offline';
            apiStatusEl.className = data.status === 'OK' ? 'h2 mb-1 text-success' : 'h2 mb-1 text-danger';
        }

        // Load additional stats
        const statsResponse = await fetch('/api/e-invoice/stats');
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();

            if (statsData.success) {
                const totalValueEl = document.getElementById('totalValue');
                if (totalValueEl) {
                    const totalValue = new Intl.NumberFormat('en-IN', {
                        style: 'currency',
                        currency: 'INR',
                        maximumFractionDigits: 0
                    }).format(statsData.data.totalValue);

                    totalValueEl.textContent = totalValue;
                }
            }
        }
    } catch (error) {
        console.error('Error loading stats:', error);
        const apiStatusEl = document.getElementById('apiStatus');
        if (apiStatusEl) {
            apiStatusEl.textContent = '❌ Offline';
            apiStatusEl.className = 'h2 mb-1 text-danger';
        }
    }
}

// Load available samples
async function loadSamples() {
    try {
        const response = await fetch('/api/e-invoice/samples');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        if (data.success) {
            const container = document.getElementById('samplesContainer');
            if (!container) return;

            container.innerHTML = '';

            data.data.forEach(sample => {
                const totalValue = new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: 'INR',
                    maximumFractionDigits: 0
                }).format(sample.totalValue);

                const card = document.createElement('div');
                card.className = 'col-md-6 col-lg-4';
                card.innerHTML = `
                    <div class="card sample-card bg-secondary border-0 h-100" onclick="testSample(${sample.id})" style="cursor: pointer;">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <h5 class="card-title mb-0">Sample #${sample.id}</h5>
                                <span class="badge bg-primary">${sample.type}</span>
                            </div>
                            <p class="card-text text-muted small mb-2">${sample.description}</p>
                            <div class="d-flex justify-content-between align-items-center">
                                <small class="text-light">${totalValue}</small>
                                <small class="text-muted">${sample.invoiceNo}</small>
                            </div>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
        }
    } catch (error) {
        console.error('Error loading samples:', error);
    }
}

// Auto-test health on page load
window.addEventListener('load', function () {
    console.log('E-Invoice API UI loaded successfully');

    // Force page to start at top on refresh
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    // Reset scroll position when switching tabs
    document.querySelectorAll('button[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', () => {
            window.scrollTo({ top: 0, behavior: 'instant' });
        });
    });


    // Custom Scrollspy using IntersectionObserver for Documentation
    const docsTab = document.getElementById('docs-tab');
    if (docsTab) {
        docsTab.addEventListener('shown.bs.tab', function () {
            const observerOptions = {
                root: null,
                rootMargin: '-20% 0px -60% 0px', // Trigger when section is near top
                threshold: 0
            };

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const id = entry.target.getAttribute('id');
                        // Remove active from all
                        document.querySelectorAll('#docs-nav .nav-link').forEach(link => {
                            link.classList.remove('active');
                        });
                        // Add active to current
                        const currentLink = document.querySelector(`#docs-nav .nav-link[href="#${id}"]`);
                        if (currentLink) {
                            currentLink.classList.add('active');
                        }
                    }
                });
            }, observerOptions);

            // Observe all documentation sections
            document.querySelectorAll('section[id^="doc-"]').forEach((section) => {
                observer.observe(section);
            });
        });
    }

    // Fetch Credentials for Auto-Auth from the backend
    fetch('/api/auth/credentials')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // Securely store for session usage (Client-side memory)
                APP_CREDENTIALS.apiKey = data.credentials.apiKey;
                APP_CREDENTIALS.username = data.credentials.username;
                APP_CREDENTIALS.password = data.credentials.password;
                console.log('✅ Demo Credentials Loaded for Auto-Auth');
            }
        })
        .catch(err => console.error('Failed to load demo credentials', err));

    loadStats();
    loadSamples();

    // Initialize Bootstrap Tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    })

    // Auto-test health endpoint after a short delay - REMOVED to save space
    /* setTimeout(() => {
        const testResult = document.getElementById('testResult');
        const resultContent = document.getElementById('resultContent');

        if (testResult && resultContent) {
            testResult.style.display = 'block';
            resultContent.innerHTML = '<div class="text-center text-muted"><i class="bi bi-info-circle me-2"></i>Click any test button to see API responses here</div>';
        }
    }, 1000); */
});

// ==================== AUTH FUNCTIONS ====================

window.testEndpointWithHeaders = async function (endpoint, headers = {}) {
    const testResult = document.getElementById('authTestResult');
    const resultContent = document.getElementById('authResultContent');

    if (!testResult || !resultContent) return;

    // Show loading
    testResult.style.display = 'block';
    resultContent.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"></div><div class="mt-2">Authenticating...</div></div>';
    testResult.querySelector('.card').className = 'card bg-dark border-secondary';

    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        });

        const data = await response.json();

        resultContent.textContent = JSON.stringify(data, null, 2);

        if (response.ok) {
            testResult.querySelector('.card').className = 'card bg-dark border-success';
        } else {
            testResult.querySelector('.card').className = 'card bg-dark border-danger';
        }

        testResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (error) {
        resultContent.textContent = 'Error: ' + error.message;
        testResult.querySelector('.card').className = 'card bg-dark border-danger';
    }
};

window.testAuth = function (type, simulateFailure = false) {
    let endpoint = '';
    let headers = {};

    if (simulateFailure) {
        // Explictly send NO headers to trigger 401
        if (type === 'apiKey') endpoint = '/api/auth/test/api-key';
        else if (type === 'basic') endpoint = '/api/auth/test/basic';
        else if (type === 'bearer') endpoint = '/api/auth/test/bearer';
        else if (type === 'oauth') endpoint = '/api/auth/test/oauth';

        // No headers added = intentional failure
    } else {
        if (type === 'apiKey') {
            const apiKey = document.getElementById('apiKeyInput').value;
            if (!apiKey) { alert('Please enter an API Key'); return; }
            endpoint = '/api/auth/test/api-key';
            headers = { 'x-api-key': apiKey };
        }
        else if (type === 'basic') {
            const user = document.getElementById('basicUser').value;
            const pass = document.getElementById('basicPass').value;
            if (!user || !pass) { alert('Please enter Username and Password'); return; }
            endpoint = '/api/auth/test/basic';
            const token = btoa(user + ':' + pass);
            headers = { 'Authorization': 'Basic ' + token };
        }
        else if (type === 'bearer') {
            const token = document.getElementById('bearerTokenInput').value;
            if (!token) { alert('Please login first to get a token'); return; }
            endpoint = '/api/auth/test/bearer';
            headers = { 'Authorization': 'Bearer ' + token };
        }
        else if (type === 'oauth') {
            const token = document.getElementById('bearerTokenInput').value;
            if (!token) { alert('Please login first to get a token'); return; }
            endpoint = '/api/auth/test/oauth';
            headers = { 'Authorization': 'Bearer ' + token };
        }
    }

    window.testEndpointWithHeaders(endpoint, headers);
};

window.authLogin = async function (grantType) {
    const testResult = document.getElementById('authTestResult');
    const resultContent = document.getElementById('authResultContent');
    const tokenInput = document.getElementById('bearerTokenInput');

    // Hardcoded credentials for the user's convenience in this demo
    const body = {
        username: 'einvoice_sys_admin',
        password: 'SecurePass!@#2024',
        grant_type: grantType
    };

    if (testResult) {
        testResult.style.display = 'block';
        if (resultContent) resultContent.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"></div><div class="mt-2">Logging in...</div></div>';
    }

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (resultContent) resultContent.textContent = JSON.stringify(data, null, 2);

        if (data.success && data.access_token) {
            if (tokenInput) {
                tokenInput.value = data.access_token;
                // Flash styling to indicate success
                tokenInput.classList.add('is-valid');
                setTimeout(() => tokenInput.classList.remove('is-valid'), 2000);
            }
            if (testResult) testResult.querySelector('.card').className = 'card bg-dark border-success';
        } else {
            if (testResult) testResult.querySelector('.card').className = 'card bg-dark border-danger';
        }

        if (testResult) testResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (e) {
        console.error(e);
        if (resultContent) resultContent.textContent = "Error: " + e.message;
    }
};

// ==================== EDGE CASE TESTING (Block 3) ====================

window.testEdge = async function (type) {
    const testResult = document.getElementById('edgeTestResult');
    const resultContent = document.getElementById('edgeResultContent');
    const badge = document.getElementById('edgeStatusBadge');

    if (testResult) {
        testResult.style.display = 'block';
        if (resultContent) resultContent.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"></div><div class="mt-2">Testing Edge Case...</div></div>';
        testResult.querySelector('.card').className = 'card bg-dark border-secondary';
    }

    try {
        let response;
        let endpoint = '';
        let options = {};

        // 1. Headers & MIME Types
        if (type === 'strictParams') {
            // First get CSRF Token
            const csrfRes = await fetch('/api/csrf-token');
            const csrfData = await csrfRes.json();

            // Then use it
            endpoint = '/api/edge-cases/strict-post';
            options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfData.csrfToken
                },
                body: JSON.stringify({ message: 'This is valid' })
            };
        }
        else if (type === 'missingContentType') {
            endpoint = '/api/edge-cases/strict-post';
            options = {
                method: 'POST',
                // INTENTIONALLY MISSING CONTENT-TYPE
                body: JSON.stringify({ message: 'I will fail' })
            };
        }
        else if (type === 'wrongAccept') {
            endpoint = '/api/e-invoice/invoices'; // Any GET API
            options = {
                method: 'GET',
                headers: {
                    'Accept': 'application/xml' // Fail
                }
            };
        }
        else if (type === 'missingCustomHeader') {
            endpoint = '/api/edge-cases/custom-header';
            options = { method: 'GET' }; // Missing 'X-Tenant-Id'
        }
        else if (type === 'guestAuthFail') {
            endpoint = '/api/edge-cases/conditional-auth?type=guest';
            options = {
                method: 'GET',
                headers: { 'Authorization': 'Bearer unexpected-token' }
            };
        }

        // 2. Auth Edge Cases
        else if (type === 'expiredToken') {
            endpoint = '/api/auth/test/bearer';
            options = {
                method: 'GET',
                headers: { 'Authorization': 'Bearer expired-token' }
            };
        }
        else if (type === 'missingBearer') {
            endpoint = '/api/auth/test/bearer';
            options = {
                method: 'GET',
                headers: { 'Authorization': 'valid-mock-bearer-token' } // Missing 'Bearer ' prefix
            };
        }
        else if (type === 'wrongScope') {
            endpoint = '/api/edge-cases/scope-protected';
            options = {
                method: 'GET',
                headers: { 'Authorization': 'Bearer read-only-token' }
            };
        }
        else if (type === 'validScope') {
            // Login first to get scope? No, we use a magic token for simplicity in this demo
            endpoint = '/api/edge-cases/scope-protected';
            const randomToken = "oauth-" + Math.random().toString(36).substr(2);
            options = {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + randomToken }
            };
        }

        // 3. Cookies & Sessions
        else if (type === 'cookieOverride') {
            endpoint = '/api/edge-cases/cookie-override';
            options = { method: 'POST' };
        }
        else if (type === 'sessionFixation') {
            endpoint = '/api/edge-cases/session-fixation?session_id=hacked-session-id';
            options = { method: 'POST' };
        }
        else if (type === 'strictSession') {
            endpoint = '/api/auth/test/session';
            // Browser automatically sends cookies if they are set.
            options = { method: 'GET' };
        }

        // 4. Rate Limiting
        else if (type === 'rateLimit1') {
            endpoint = '/api/edge-cases/rate-limit';
            options = { method: 'GET' };
        }
        else if (type === 'rateLimit5') {
            // TRIGGER 429
            // Loop 6 times to ensure limit of 5 is hit
            if (testResult) {
                testResult.style.display = 'block';
                if (resultContent) resultContent.innerHTML = 'Spamming server 6 times...';
            }

            let lastRes;
            for (let i = 0; i < 6; i++) {
                lastRes = await fetch('/api/edge-cases/rate-limit');
                if (lastRes.status === 429) break; // Stop if we hit lucky
            }

            // We only care about the last one (should be 429)
            response = lastRes;
            endpoint = '/api/edge-cases/rate-limit'; // Just for display

            // Allow standard parsing below...
            // Manually set options for display consistency if needed
        }

        // 5. Chaining Validation
        else if (type === 'chainingFlow') {
            // Step 1: Login
            if (resultContent) resultContent.innerHTML = 'Step 1: Logging in...';

            const loginRes = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'einvoice_sys_admin', password: 'SecurePass!@#2024' })
            });
            const loginData = await loginRes.json();

            if (!loginData.access_token) throw new Error('Login failed, cannot chain.');

            // Step 2: Extract
            const token = loginData.access_token;
            if (resultContent) resultContent.innerHTML += `<br>Step 2: Token Extracted (${token.substr(0, 10)}...)`;

            // Step 3: Use Token
            if (resultContent) resultContent.innerHTML += `<br>Step 3: Calling Protected API...`;

            endpoint = '/api/auth/test/bearer';
            options = {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + token }
            };

            // Let the main flow execute the final fetch
        }

        // Execute Request (if not already done manually like in rateLimit loop, but here we just set response for rateLimit loop)
        if (type !== 'rateLimit5') {
            response = await fetch(endpoint, options);
        }
        let data;

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            data = await response.json();
        } else {
            data = await response.text();
            // Try to parse if it looks like JSON
            try { data = JSON.parse(data); } catch (e) { }
        }

        // Display Result
        if (resultContent) resultContent.textContent = JSON.stringify(data, null, 2);

        // Styling based on expected outcome (some "Errors" are actually Success for our tests)
        let isSuccess = response.ok;

        // For negative tests, getting an error IS the success
        const negativeTests = ['missingContentType', 'wrongAccept', 'missingCustomHeader', 'guestAuthFail',
            'expiredToken', 'missingBearer', 'wrongScope'];

        // Session fixation returns success but with a warning, so we handle it uniquely 
        // Cookie override returns success

        if (negativeTests.includes(type)) {
            if (!response.ok) {
                // If we got an error as expected, verify it's the RIGHT error code
                // e.g. missingContent -> 400 or 415
                if (badge) {
                    badge.className = 'badge bg-success';
                    badge.textContent = `PASS (Got expected ${response.status})`;
                }
                testResult.querySelector('.card').className = 'card bg-dark border-success';
            } else {
                if (badge) {
                    badge.className = 'badge bg-danger';
                    badge.textContent = `FAIL (Unexpected Success ${response.status})`;
                }
                testResult.querySelector('.card').className = 'card bg-dark border-danger';
            }
        }
        else if (type === 'sessionFixation') {
            if (data.warning && data.warning.includes('VULNERABLE')) {
                // We WANTED to simulate the attack, so getting "VULNERABLE" confirmation is technically a "PASS" of the simulation,
                // but visually it might be better to show it as a Warning.
                if (badge) {
                    badge.className = 'badge bg-warning text-dark';
                    badge.textContent = `SIMULATED VULNERABILITY`;
                }
                testResult.querySelector('.card').className = 'card bg-dark border-warning';
            } else {
                if (badge) {
                    badge.className = 'badge bg-success';
                    badge.textContent = `SECURE`;
                }
            }
        }
        else {
            // Normal tests
            if (response.ok) {
                if (badge) {
                    badge.className = 'badge bg-success';
                    badge.textContent = `SUCCESS (${response.status})`;
                }
                testResult.querySelector('.card').className = 'card bg-dark border-success';
            } else {
                if (badge) {
                    badge.className = 'badge bg-danger';
                    badge.textContent = `ERROR (${response.status})`;
                }
                testResult.querySelector('.card').className = 'card bg-dark border-danger';
            }
        }

        if (testResult) testResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (e) {
        console.error(e);
        if (resultContent) resultContent.textContent = "Error: " + e.message;
        if (badge) {
            badge.className = 'badge bg-danger';
            badge.textContent = 'NETWORK ERROR';
        }
    }
};

// Make functions globally available
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        testEndpoint: window.testEndpoint,
        testSample: window.testSample,
        copyResult: window.copyResult,
        generateInvoice: window.generateInvoice,
        testEdge: window.testEdge
    };
}