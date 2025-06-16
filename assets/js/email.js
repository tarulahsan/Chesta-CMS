// /assets/js/email.js

// Attempt to import db functions.
// Note: For this module to be testable independently or used in various parts of the app,
// a more robust dependency injection or service locator pattern for 'db' might be preferable in a larger system.
// For now, direct import is used as per other modules.
import { getSetting } from './db.js';

/**
 * Sends an email by proxying the request through a Cloudflare Worker.
 *
 * @param {object} emailDetails - The details of the email to send.
 * @param {string} emailDetails.to - The recipient's email address.
 * @param {string} emailDetails.subject - The subject of the email.
 * @param {string} emailDetails.htmlContent - The HTML content of the email.
 * @param {string} [emailDetails.senderName] - Optional sender name. If not provided, site name or worker default may be used.
 * @param {string} [emailDetails.replyTo] - Optional reply-to email address. If not provided, admin email or worker default may be used.
 * @returns {Promise<{success: boolean, data?: any, error?: string, details?: any}>}
 *          An object indicating success or failure, with data or error details.
 */
async function sendEmail({ to, subject, htmlContent, senderName, replyTo }) {
  let workerUrlValue = '';
  try {
    // Retrieve the worker URL from settings stored in db.js
    workerUrlValue = await getSetting('cloudflareWorkerUrl');
    if (!workerUrlValue) { // getSetting returns the value directly, not an object {key, value}
      console.error('Cloudflare Worker URL not configured in settings.');
      return { success: false, error: 'Email service endpoint not configured (Worker URL missing).' };
    }
  } catch (dbError) {
    console.error('Error fetching worker URL from DB:', dbError);
    return { success: false, error: 'Could not retrieve email service configuration.' };
  }

  const workerUrl = workerUrlValue.replace(/\/$/, ''); // Remove trailing slash, if any
  const endpoint = `${workerUrl}/api-proxy/brevo/send-email`;

  const emailData = {
    to,
    subject,
    htmlContent,
    senderName, // Optional, worker might use a default site name
    replyTo     // Optional, worker might use a default admin email
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // No client-to-worker Authorization header assumed for this specific function for now,
        // as the primary auth is worker-to-Brevo. If needed, it would be added here.
      },
      body: JSON.stringify(emailData),
    });

    // Try to parse JSON regardless of response.ok, as error responses might also be JSON
    let result;
    try {
        result = await response.json();
    } catch (e) {
        // If response is not JSON (e.g., HTML error page from a misconfigured proxy or network issue)
        console.error('Failed to parse JSON response from worker endpoint:', response.status, response.statusText);
        return {
            success: false,
            error: `Invalid response from email service endpoint (Status: ${response.status}).`,
            details: await response.text().catch(() => 'Could not retrieve response text.') // Get text if not JSON
        };
    }

    if (!response.ok || !result.success) {
      console.error('Failed to send email via worker:', result.error || response.statusText, result.details);
      return {
        success: false,
        error: result.error || `Failed to send email via worker (Status: ${response.status}).`,
        details: result.details
      };
    }

    return { success: true, data: result.data };

  } catch (error) { // Catches network errors (fetch promise rejected)
    console.error('Network or other error sending email:', error);
    return { success: false, error: 'Network error or unexpected issue while trying to send email.' };
  }
}

export { sendEmail };
