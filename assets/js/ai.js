// /assets/js/ai.js

// Import the getSetting function from db.js
import { getSetting } from './db.js';

/**
 * Generates text using OpenAI via the Cloudflare Worker proxy.
 *
 * @param {object} params - The parameters for the text generation request.
 * @param {string} [params.prompt] - A direct prompt string. Will be converted to a user message if 'messages' is not provided.
 * @param {Array<object>} [params.messages] - An array of message objects (e.g., [{role: 'user', content: '...'}, ...]). Takes precedence over 'prompt'.
 * @param {string} [params.model] - Optional. The OpenAI model to use (e.g., 'gpt-3.5-turbo'). Defaults handled by worker if not provided.
 * @param {number} [params.max_tokens] - Optional. Maximum number of tokens to generate. Defaults handled by worker.
 * @param {number} [params.temperature] - Optional. Sampling temperature. Defaults handled by worker.
 * @returns {Promise<{success: boolean, generatedText?: string, usage?: object, error?: string, details?: any}>}
 *          An object indicating success or failure, with generated text, usage stats, or error details.
 */
async function generateTextWithOpenAI({ prompt, messages, model, max_tokens, temperature }) {
  let workerUrlValue = '';
  try {
    workerUrlValue = await getSetting('cloudflareWorkerUrl');
    if (!workerUrlValue) {
      console.error('Cloudflare Worker URL not configured in settings.');
      return { success: false, error: 'AI service endpoint not configured (Worker URL missing).' };
    }
  } catch (dbError) {
    console.error('Error fetching worker URL from DB:', dbError);
    return { success: false, error: 'Could not retrieve AI service configuration.' };
  }

  const workerUrl = workerUrlValue.replace(/\/$/, ''); // Remove trailing slash, if any
  const endpoint = `${workerUrl}/api-proxy/openai/v1/chat/completions`;

  let effectiveModel = model; // model is a parameter of generateTextWithOpenAI
  if (!effectiveModel) { // If no model explicitly passed to this function
    try {
      const defaultModelSetting = await getSetting('OPENAI_DEFAULT_MODEL');
      if (defaultModelSetting) { // Check if setting exists and has a value
        effectiveModel = defaultModelSetting; // Assumes getSetting returns the value directly
        // console.log(`Using default OpenAI model from settings: ${effectiveModel}`); // Optional: for debugging
      }
    } catch (dbError) {
      console.warn('Could not retrieve default OpenAI model from settings:', dbError);
      // Proceed without a client-side default, worker will use its own default
    }
  }

  const payload = {};
  if (messages && Array.isArray(messages) && messages.length > 0) {
    payload.messages = messages;
  } else if (prompt && typeof prompt === 'string' && prompt.trim() !== '') {
    payload.messages = [{ role: 'user', content: prompt }];
  } else {
    return { success: false, error: 'Either "prompt" or "messages" must be provided.' };
  }

  // Add optional parameters to payload only if they are explicitly provided
  if (effectiveModel !== undefined) payload.model = effectiveModel; // Use effectiveModel here
  if (max_tokens !== undefined) payload.max_tokens = max_tokens;
  if (temperature !== undefined) payload.temperature = temperature;
  // stream is intentionally omitted as the worker handler doesn't support it for now

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // No client-to-worker Authorization header assumed for this specific function for now.
        // If needed, it would be added here, possibly retrieved from db.js (e.g., an adminSetupToken or a different client token).
      },
      body: JSON.stringify(payload),
    });

    let result;
    try {
        result = await response.json();
    } catch (e) {
        console.error('Failed to parse JSON response from AI proxy endpoint:', response.status, response.statusText);
        return {
            success: false,
            error: `Invalid response from AI service endpoint (Status: ${response.status}).`,
            details: await response.text().catch(() => 'Could not retrieve response text.')
        };
    }

    if (!response.ok || !result.success) {
      console.error('Failed to generate text via worker:', result.error || response.statusText, result.details);
      return {
        success: false,
        error: result.error || `Failed to generate text via worker (Status: ${response.status}).`,
        details: result.details
      };
    }

    return {
        success: true,
        generatedText: result.generatedText,
        usage: result.usage
    };

  } catch (error) { // Catches network errors (fetch promise rejected)
    console.error('Network or other error generating text with OpenAI:', error);
    return { success: false, error: 'Network error or unexpected issue while trying to generate text.' };
  }
}

export { generateTextWithOpenAI };
