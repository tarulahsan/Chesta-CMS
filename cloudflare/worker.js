export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Health check endpoint
  if (path === '/status' && method === 'GET') {
    return new Response(JSON.stringify({ success: true, message: 'Worker is active' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, // Added CORS for status
    });
  }

  // API Proxy Routes
  if (path.startsWith('/api-proxy/openai/')) {
    // return handleOpenAIProxy(request, env); // Placeholder
  } else if (path.startsWith('/api-proxy/gemini/')) {
    // return handleGeminiProxy(request, env); // Placeholder
  } else if (path.startsWith('/api-proxy/stripe/')) {
    // return handleStripeProxy(request, env); // Placeholder
  } else if (path.startsWith('/api-proxy/docusign/')) {
    // return handleDocuSignProxy(request, env); // Placeholder
  } else if (path === '/api-proxy/brevo/send-email' && method === 'POST') {
    return handleBrevoEmailSend(request, env);
  }

  // Data Submission Routes
  else if (path === '/submit-form' && method === 'POST') {
    // return handleFormSubmission(request, env); // Placeholder
  } else if (path === '/sync-data' && method === 'POST') {
    // return handleGenericDataSync(request, env); // Placeholder
  }
  // Analytics Route
  else if (path === '/track-view' && (method === 'POST' || method === 'GET')) {
    // return handleTrackView(request, env); // Placeholder
  }

  // Configuration Route (Admin Only)
  else if (path === '/setup-config' && method === 'POST') {
    // return handleSetupConfig(request, env); // Placeholder - Needs robust security
  }

  // Visitor Data Retrieval (Admin Only)
  else if (path === '/get-visitor-data' && method === 'GET') {
    // return handleGetVisitorData(request, env); // Placeholder - Needs robust security
  }

  return new Response(JSON.stringify({ success: false, error: 'Not Found', path: path }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// Standardized JSON response helper
function jsonResponse(data, options = {}) {
    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' // Adjust for production if needed
    };
    return new Response(JSON.stringify(data), {
        headers: { ...defaultHeaders, ...options.headers },
        status: options.status || 200,
        ...options
    });
}


async function handleBrevoEmailSend(request, env) {
  // CORS preflight handling
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*', // Allow any origin for this example
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization', // Allow Content-Type and Auth
      },
    });
  }

  try {
    // 1. Validate Content-Type
    if (request.headers.get("Content-Type") !== "application/json") {
      return jsonResponse({ success: false, error: 'Invalid Content-Type. Expected application/json.' }, { status: 415 });
    }

    // 2. Parse Request Body
    let requestBody;
    try {
      requestBody = await request.json();
    } catch (e) {
      return jsonResponse({ success: false, error: 'Invalid JSON payload.' }, { status: 400 });
    }

    const { to, subject, htmlContent, senderName: customSenderName, replyTo: customReplyTo } = requestBody;

    // 3. Validate required fields
    if (!to || !subject || !htmlContent) {
      return jsonResponse({ success: false, error: 'Missing required fields: to, subject, htmlContent.' }, { status: 400 });
    }
    // Basic email format validation (can be more robust)
    if (typeof to !== 'string' || !to.includes('@')) {
        return jsonResponse({ success: false, error: 'Invalid "to" email address format.'}, { status: 400});
    }


    // 4. Retrieve Configuration from Secrets and KV
    const brevoApiKey = env.BREVO_API_KEY;
    if (!brevoApiKey) {
      console.error('Brevo API key not configured in Worker secrets (BREVO_API_KEY).');
      return jsonResponse({ success: false, error: 'Email service not configured (missing API key).' }, { status: 500 });
    }

    const adminEmail = await env.CONFIG_KV.get('ADMIN_EMAIL_BREVO');
    if (!adminEmail) {
      console.error('Admin email for Brevo sender not configured in CONFIG_KV (ADMIN_EMAIL_BREVO).');
      return jsonResponse({ success: false, error: 'Email service not configured (missing sender email).' }, { status: 500 });
    }

    const siteName = await env.CONFIG_KV.get('SITE_NAME') || 'Your Website'; // Default site name

    // 5. Construct Brevo API Payload
    const senderEmail = adminEmail;
    const senderName = customSenderName || siteName;
    const replyToEmail = customReplyTo || adminEmail;

    const brevoPayload = {
      sender: { email: senderEmail, name: senderName },
      to: [{ email: to }], // Brevo API expects an array for 'to'
      subject: subject,
      htmlContent: htmlContent,
      replyTo: { email: replyToEmail }
    };

    // 6. Make API Call to Brevo
    const brevoApiUrl = 'https://api.brevo.com/v3/smtp/email';
    const brevoResponse = await fetch(brevoApiUrl, {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(brevoPayload),
    });

    // 7. Handle Brevo's Response
    const responseBody = await brevoResponse.json().catch(() => ({ message: 'Non-JSON response from Brevo', status: brevoResponse.status }));

    if (!brevoResponse.ok) {
      console.error('Brevo API Error:', brevoResponse.status, JSON.stringify(responseBody));
      return jsonResponse({
        success: false,
        error: 'Failed to send email via provider.',
        details: responseBody.message || responseBody.error?.message || 'Unknown error from provider.'
      }, { status: brevoResponse.status < 500 && brevoResponse.status >= 400 ? brevoResponse.status : 502 }); // Return Brevo's client errors, otherwise 502
    }

    return jsonResponse({ success: true, message: 'Email sent successfully.', data: responseBody }, { status: 200 });

  } catch (error) {
    console.error('Unhandled error in handleBrevoEmailSend:', error.stack || error);
    return jsonResponse({ success: false, error: 'Internal server error while processing email request.' }, { status: 500 });
  }
}

// Placeholder for other handlers to be implemented later
// async function handleOpenAIProxy(request, env) { /* ... */ }
// async function handleGeminiProxy(request, env) { /* ... */ }
// async function handleStripeProxy(request, env) { /* ... */ }
// async function handleDocuSignProxy(request, env) { /* ... */ }
// async function handleFormSubmission(request, env) { /* ... */ }
// async function handleGenericDataSync(request, env) { /* ... */ }
// async function handleTrackView(request, env) { /* ... */ }
// async function handleSetupConfig(request, env) { /* ... */ }
// async function handleGetVisitorData(request, env) { /* ... */ }
