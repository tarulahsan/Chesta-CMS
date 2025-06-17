// /assets/js/ai.js
import { db } from './db.js'; // Assuming db.js is in the same directory or path is correct

async function generateTextWithOpenAI({ prompt, messages, model, max_tokens, temperature }) {
  let workerUrl = '';
  try {
    const workerUrlSetting = await db.getSetting('cloudflareWorkerUrl');
    if (!workerUrlSetting || !workerUrlSetting.value) {
      console.error('Cloudflare Worker URL not configured for OpenAI.');
      return { success: false, error: 'AI service not configured: Worker URL missing.' };
    }
    workerUrl = workerUrlSetting.value.replace(/\/$/, ''); // Remove trailing slash
  } catch (dbError) {
    console.error('Error fetching worker URL from DB for OpenAI:', dbError);
    return { success: false, error: 'Could not retrieve AI service configuration for OpenAI.' };
  }

  const endpoint = `${workerUrl}/api-proxy/openai/v1/chat/completions`;

  let effectiveModel = model;
  if (!effectiveModel) {
    try {
      const defaultModelSetting = await db.getSetting('OPENAI_DEFAULT_MODEL');
      if (defaultModelSetting && defaultModelSetting.value) {
        effectiveModel = defaultModelSetting.value;
      }
    } catch (dbError) {
      console.warn('Could not retrieve default OpenAI model from settings:', dbError);
    }
  }

  const payload = { prompt, messages, model: effectiveModel, max_tokens, temperature };
  Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
  if (payload.messages && payload.prompt) delete payload.prompt; // Prefer messages if both provided
  if (!payload.messages && payload.prompt) { // If only prompt, structure it for chat completion
      payload.messages = [{role: 'user', content: payload.prompt}];
      delete payload.prompt;
  }


  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error('Failed to generate text with OpenAI via worker:', result.error, result.details);
      return { success: false, error: result.error || 'Failed to generate text with OpenAI via worker.', details: result.details };
    }

    return { success: true, generatedText: result.generatedText, usage: result.usage };
  } catch (error) {
    console.error('Error generating text with OpenAI:', error);
    return { success: false, error: 'Network error or invalid response during OpenAI text generation.' };
  }
}

async function generateTextWithGemini({ prompt, parts, generationConfig, model }) {
  let workerUrl = '';
  try {
    const workerUrlSetting = await db.getSetting('cloudflareWorkerUrl');
    if (!workerUrlSetting || !workerUrlSetting.value) {
      console.error('Cloudflare Worker URL not configured for Gemini.');
      return { success: false, error: 'AI service not configured: Worker URL missing.' };
    }
    workerUrl = workerUrlSetting.value.replace(/\/$/, ''); // Remove trailing slash
  } catch (dbError) {
    console.error('Error fetching worker URL from DB for Gemini:', dbError);
    return { success: false, error: 'Could not retrieve AI service configuration for Gemini.' };
  }

  const endpoint = `${workerUrl}/api-proxy/gemini/v1beta/models/gemini-pro:generateContent`;

  let requestParts;
  if (parts && Array.isArray(parts) && parts.length > 0) {
    requestParts = parts;
  } else if (prompt && typeof prompt === 'string') {
    requestParts = [{ text: prompt }];
  } else {
    return { success: false, error: 'Either prompt or parts must be provided for Gemini text generation.' };
  }

  let effectiveModel = model;
  // Note: Gemini model is often part of the URL in the worker, but if we allow model choice via payload to worker:
  if (!effectiveModel && generationConfig && generationConfig.model) {
      effectiveModel = generationConfig.model;
  }
  if (!effectiveModel) {
    try {
      const defaultModelSetting = await db.getSetting('GEMINI_DEFAULT_MODEL');
      if (defaultModelSetting && defaultModelSetting.value) {
        effectiveModel = defaultModelSetting.value;
      }
    } catch (dbError) {
      console.warn('Could not retrieve default Gemini model from settings:', dbError);
    }
  }

  // The worker expects 'parts' and optionally 'generationConfig' and 'model' in the top-level payload.
  // The worker will then construct the final Gemini API payload (e.g. putting 'parts' into 'contents').
  const workerPayload = { parts: requestParts, generationConfig, model: effectiveModel };
  Object.keys(workerPayload).forEach(key => workerPayload[key] === undefined && delete workerPayload[key]);
  if (workerPayload.generationConfig && Object.keys(workerPayload.generationConfig).length === 0) {
    delete workerPayload.generationConfig;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(workerPayload),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error('Failed to generate text with Gemini via worker:', result.error, result.details);
      return { success: false, error: result.error || 'Failed to generate text with Gemini via worker.', details: result.details };
    }

    return { success: true, generatedText: result.generatedText };
  } catch (error) {
    console.error('Error generating text with Gemini:', error);
    return { success: false, error: 'Network error or invalid response during Gemini text generation.' };
  }
}

export { generateTextWithOpenAI, generateTextWithGemini };
