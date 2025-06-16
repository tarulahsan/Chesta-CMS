export default {
  async fetch(request, env, ctx) {
    // Add CORS preflight response for all routes
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }
    return handleRequest(request, env, ctx);
  }
};

function handleOptions(request) {
  // Make sure the necesssary headers are present
  // for this to be a valid pre-flight request
  let headers = request.headers;
  if (
    headers.get('Origin') !== null &&
    headers.get('Access-Control-Request-Method') !== null &&
    headers.get('Access-Control-Request-Headers') !== null
  ) {
    // Handle CORS pre-flight request.
    let respHeaders = {
      'Access-Control-Allow-Origin': '*', // Allow all origins
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
      'Access-Control-Max-Age': '86400', // 1 day
      // Allow all future content Request headers to go back to browser
      // such as Authorization (Bearer) or X-Client-Name-Version
      'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers'),
    };
    return new Response(null, { headers: respHeaders });
  } else {
    // Handle standard OPTIONS request.
    return new Response(null, {
      headers: {
        Allow: 'GET, HEAD, POST, OPTIONS',
      },
    });
  }
}


async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Health check endpoint
  if (path === '/status' && method === 'GET') {
    return jsonResponse({ success: true, message: 'Worker is active' });
  }

  // API Proxy Routes
  if (path.startsWith('/api-proxy/openai/')) { // More generic OpenAI proxy path
    // Example: /api-proxy/openai/v1/chat/completions
    const openAIPath = path.substring('/api-proxy/openai'.length);
    if (openAIPath === '/v1/chat/completions' && method === 'POST') {
        return handleOpenAIChatCompletions(request, env);
    }
    // Add more specific OpenAI routes here if needed
    return jsonResponse({ success: false, error: 'OpenAI endpoint not found or method not allowed for this proxy.' }, { status: 404 });

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
    return handleSetupConfig(request, env);
  }

  // Visitor Data Retrieval (Admin Only)
  else if (path === '/get-visitor-data' && method === 'GET') {
    // return handleGetVisitorData(request, env); // Placeholder
  }

  return jsonResponse({ success: false, error: 'Not Found', path: path }, { status: 404 });
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


async function handleOpenAIChatCompletions(request, env) {
  try {
    if (request.headers.get("Content-Type") !== "application/json") {
      return jsonResponse({ success: false, error: 'Invalid Content-Type. Expected application/json.' }, { status: 415 });
    }

    let requestBody;
    try {
      requestBody = await request.json();
    } catch (e) {
      return jsonResponse({ success: false, error: 'Invalid JSON payload.' }, { status: 400 });
    }

    const {
        messages, // User can pass the full messages array
        prompt,   // Or just a simple prompt string
        model = 'gpt-3.5-turbo',
        max_tokens = 256, // Adjusted default
        temperature = 0.7,
        stream = false // OpenAI supports streaming, but this handler will not stream back to client for simplicity in V1
    } = requestBody;

    if (stream) {
        return jsonResponse({ success: false, error: 'Streaming responses are not supported by this proxy endpoint.' }, { status: 400 });
    }

    let finalMessages;
    if (messages && Array.isArray(messages) && messages.length > 0) {
        finalMessages = messages;
    } else if (prompt && typeof prompt === 'string' && prompt.trim() !== '') {
        finalMessages = [{ role: 'user', content: prompt }];
    } else {
        return jsonResponse({ success: false, error: 'Missing required field: either "messages" array or a "prompt" string must be provided.' }, { status: 400 });
    }

    const openAIApiKey = env.OPENAI_API_KEY;
    if (!openAIApiKey) {
      console.error('OpenAI API key not configured in Worker secrets (OPENAI_API_KEY).');
      return jsonResponse({ success: false, error: 'AI service not configured (missing API key).' }, { status: 500 });
    }

    const openAIPayload = {
      model: model,
      messages: finalMessages,
      max_tokens: max_tokens,
      temperature: temperature,
      stream: false, // Explicitly false for this handler
    };

    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openAIPayload),
    });

    const responseBody = await openAIResponse.json().catch(() => ({ message: 'Non-JSON response from OpenAI', status: openAIResponse.status }));

    if (!openAIResponse.ok) {
      console.error('OpenAI API Error:', openAIResponse.status, JSON.stringify(responseBody));
      const errorMessage = responseBody.error?.message || responseBody.message || 'Unknown error from AI provider.';
      return jsonResponse({ success: false, error: 'Failed to get response from AI provider.', details: errorMessage }, { status: openAIResponse.status < 500 && openAIResponse.status >=400 ? openAIResponse.status : 502 });
    }

    const generatedText = responseBody.choices?.[0]?.message?.content?.trim();
    if (!generatedText) {
        console.error('OpenAI response missing expected content:', JSON.stringify(responseBody));
        return jsonResponse({ success: false, error: 'AI provider response did not contain expected text content.'}, { status: 500 });
    }

    return jsonResponse({ success: true, generatedText: generatedText, usage: responseBody.usage }, { status: 200 });

  } catch (error) {
    console.error('Unhandled error in handleOpenAIChatCompletions:', error.stack || error);
    return jsonResponse({ success: false, error: 'Internal server error while processing AI request.' }, { status: 500 });
  }
}


async function handleBrevoEmailSend(request, env) { /* ... (existing, unchanged from previous step) ... */
  try {
    if (request.headers.get("Content-Type") !== "application/json") {
      return jsonResponse({ success: false, error: 'Invalid Content-Type. Expected application/json.' }, { status: 415 });
    }
    let requestBody;
    try { requestBody = await request.json(); } catch (e) { return jsonResponse({ success: false, error: 'Invalid JSON payload.' }, { status: 400 }); }
    const { to, subject, htmlContent, senderName: customSenderName, replyTo: customReplyTo } = requestBody;
    if (!to || !subject || !htmlContent) { return jsonResponse({ success: false, error: 'Missing required fields: to, subject, htmlContent.' }, { status: 400 }); }
    if (typeof to !== 'string' || !to.includes('@')) { return jsonResponse({ success: false, error: 'Invalid "to" email address format.'}, { status: 400}); }
    const brevoApiKey = env.BREVO_API_KEY;
    if (!brevoApiKey) { console.error('Brevo API key not configured in Worker secrets (BREVO_API_KEY).'); return jsonResponse({ success: false, error: 'Email service not configured (missing API key).' }, { status: 500 }); }
    const adminEmail = await env.CONFIG_KV.get('ADMIN_EMAIL_BREVO');
    if (!adminEmail) { console.error('Admin email for Brevo sender not configured in CONFIG_KV (ADMIN_EMAIL_BREVO).'); return jsonResponse({ success: false, error: 'Email service not configured (missing sender email).' }, { status: 500 }); }
    const siteName = await env.CONFIG_KV.get('SITE_NAME') || 'Your Website';
    const senderEmail = adminEmail; const senderName = customSenderName || siteName; const replyToEmail = customReplyTo || adminEmail;
    const brevoPayload = { sender: { email: senderEmail, name: senderName }, to: [{ email: to }], subject: subject, htmlContent: htmlContent, replyTo: { email: replyToEmail } };
    const brevoApiUrl = 'https://api.brevo.com/v3/smtp/email';
    const brevoResponse = await fetch(brevoApiUrl, { method: 'POST', headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(brevoPayload) });
    const responseBody = await brevoResponse.json().catch(() => ({ message: 'Non-JSON response from Brevo', status: brevoResponse.status }));
    if (!brevoResponse.ok) { console.error('Brevo API Error:', brevoResponse.status, JSON.stringify(responseBody)); return jsonResponse({ success: false, error: 'Failed to send email via provider.', details: responseBody.message || responseBody.error?.message || 'Unknown error from provider.' }, { status: brevoResponse.status < 500 && brevoResponse.status >= 400 ? brevoResponse.status : 502 }); }
    return jsonResponse({ success: true, message: 'Email sent successfully.', data: responseBody }, { status: 200 });
  } catch (error) { console.error('Unhandled error in handleBrevoEmailSend:', error.stack || error); return jsonResponse({ success: false, error: 'Internal server error while processing email request.' }, { status: 500 }); }
}

async function handleSetupConfig(request, env) { /* ... (existing, unchanged from previous step) ... */
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.ADMIN_SETUP_TOKEN}`) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { adminEmailForBrevo, siteName } = await request.json();
    if (adminEmailForBrevo) await env.CONFIG_KV.put('ADMIN_EMAIL_BREVO', adminEmailForBrevo);
    if (siteName) await env.CONFIG_KV.put('SITE_NAME', siteName);
    return jsonResponse({ success: true, message: 'Configuration saved to worker.' });
  } catch (e) {
    return jsonResponse({ success: false, error: 'Invalid request payload for setup-config.' }, { status: 400 });
  }
}

// Placeholder for other handlers to be implemented later
// async function handleGeminiProxy(request, env) { /* ... */ }
// async function handleStripeProxy(request, env) { /* ... */ }
// async function handleDocuSignProxy(request, env) { /* ... */ }
// async function handleFormSubmission(request, env) { /* ... */ }
// async function handleGenericDataSync(request, env) { /* ... */ }
// async function handleTrackView(request, env) { /* ... */ }
// async function handleGetVisitorData(request, env) { /* ... */ }
