### Manual End-to-End Email Testing Steps

This guide outlines the steps required to manually test the email sending functionality of the CMS using your own Brevo (formerly Sendinblue) and Cloudflare accounts.

**1. Prerequisites:**

*   **Brevo Account:** You must have an active Brevo account.
    *   Obtain your **API v3 Key**. This can typically be found in your Brevo dashboard under SMTP & API settings.
    *   Ensure you have a **validated sender** configured in Brevo (e.g., `noreply@yourdomain.com` or an email address you own and have validated with Brevo). Emails sent via the API should ideally use a validated sender.
*   **Cloudflare Account:** You need a Cloudflare account to deploy the worker and use KV storage.

**2. Cloudflare Worker Setup:**

1.  **Deploy Worker:**
    *   Log in to your Cloudflare dashboard.
    *   Navigate to "Workers & Pages".
    *   Click "Create application" > "Create Worker".
    *   Give your worker a unique name (e.g., `my-cms-worker`). This will form part of its URL.
    *   Click "Deploy".
    *   Click "Edit code".
    *   Delete the existing example code in the editor.
    *   Copy the entire content of the `/cloudflare/worker.js` file provided with the CMS.
    *   Paste this code into the Cloudflare Worker editor.
    *   Click "Deploy" (or "Save and Deploy") to save your worker code.
2.  **Configure Worker Secrets:**
    *   In your Worker's settings page (navigate to your worker > Settings > Variables).
    *   Under "Secrets" (not "Environment Variables"), add the following secrets:
        *   `BREVO_API_KEY`: Paste your Brevo API v3 key here.
        *   `ADMIN_SETUP_TOKEN`: Create a strong, unique secret string (e.g., using a password generator like `openssl rand -hex 32`). Save this token securely, as you will need to enter it into the CMS admin panel.
        *   *(Optional)* `CLIENT_WORKER_SECRET`: If you plan to use client-to-worker authentication for API proxy calls (not strictly needed for Brevo email sending itself but good for other proxies), define it here.
3.  **Bind KV Namespaces:**
    *   In your Worker's settings page (Settings > KV Namespace Bindings).
    *   Click "Add binding" for each of the following:
        *   **Variable name:** `CONFIG_KV` -> Select or create a KV namespace for CMS configurations.
        *   **Variable name:** `VISITOR_DATA_KV` -> Select or create a KV namespace for visitor form submissions.
        *   **Variable name:** `ANALYTICS_KV` -> Select or create a KV namespace for page view analytics.
    *   Ensure these namespaces are created in your Cloudflare account (Account Home > Workers & Pages > KV).

**3. CMS Admin Panel Configuration:**

1.  **Access Admin Panel:** Open your deployed CMS admin panel (e.g., `https://yourdomain.com/admin/index.html`).
2.  **Setup Wizard / Settings Page:**
    *   If it's your first time, the Setup Wizard should appear.
    *   If you've already completed the wizard, navigate to the "Settings" page from the sidebar.
3.  **Enter Cloudflare Details:**
    *   **Cloudflare Worker URL:** Enter the full URL of the worker you deployed in Step 2.1 (e.g., `https://my-cms-worker.yourusername.workers.dev`).
    *   **Cloudflare Worker Admin Setup Token:** Enter the unique `ADMIN_SETUP_TOKEN` string you created and set as a secret in Step 2.2.
    *   **Admin Email for Brevo (Sender Email):** Enter the email address you have validated as a sender in your Brevo account. This will be used as the default "From" address for emails sent by the CMS (like test emails or form submission notifications). This email will be synced to the worker.
    *   **KV Namespace IDs (if prompted by wizard/settings page):** Enter the exact KV Namespace IDs for `VISITOR_DATA_KV` and `ANALYTICS_KV` that you bound to your worker. You can find these IDs in the Cloudflare dashboard (Workers & Pages > KV).
    *   Fill in other required fields like "Site Name".
4.  **Save Settings:**
    *   Click "Save All Settings" or "Complete Setup".
    *   Look for a success message confirming that settings were saved. It should also indicate if the "Admin Email for Brevo" was successfully synced to the worker. If there's an error syncing to the worker, double-check your Worker URL and Admin Setup Token in both the CMS settings and your Cloudflare Worker secrets.

**4. Sending a Test Email:**

1.  **Navigate to Email Test Page:** In the CMS admin panel sidebar, go to "Tools" -> "Email Test".
2.  **Compose Test Email:**
    *   **Recipient Email:** Enter an email address where you can receive the test message.
    *   **Subject:** Enter a subject line (e.g., "CMS Email Test").
    *   **Message Body:** Use the rich text editor to type a simple message. You can try some basic formatting like bold or a list.
3.  **Send:** Click the "Send Test Email" button.

**5. Verification:**

1.  **CMS Feedback:** Observe the status message displayed on the "Email Test" page. It should indicate if the email was sent successfully or if an error occurred.
2.  **Recipient Inbox:** Check the inbox (and spam/junk folder) of the recipient email address you entered.
3.  **Brevo Dashboard (Optional):** Log in to your Brevo account and check the sending activity or logs to see if the API call was received and processed.
4.  **Cloudflare Worker Logs (Troubleshooting):** If the email is not received or the CMS shows an error, check the logs for your Cloudflare Worker in the Cloudflare dashboard. This can provide detailed error messages from the worker itself or from the Brevo API.

---
### Potential Failure Points for User Troubleshooting

*   **Incorrect Brevo API Key:** Ensure the `BREVO_API_KEY` secret in the Cloudflare Worker is correct and is a v3 API key.
*   **Cloudflare Worker URL Misconfiguration:** The URL entered in CMS settings must exactly match the deployed worker's URL.
*   **`ADMIN_SETUP_TOKEN` Mismatch:** The token entered in CMS settings must be identical to the `ADMIN_SETUP_TOKEN` secret set in the Cloudflare Worker.
*   **KV Namespaces Not Bound or Incorrectly Named:** Ensure `CONFIG_KV`, `VISITOR_DATA_KV`, and `ANALYTICS_KV` are correctly bound to the worker in Cloudflare with these exact variable names.
*   **Unvalidated Sender in Brevo:** Brevo might reject emails if the "Admin Email for Brevo" (sender email) is not validated in your Brevo account.
*   **Brevo Account Issues:** Account suspension, out of credits (if on a limited plan beyond free tier), or other Brevo-specific issues.
*   **DNS Propagation (Less Likely for Worker URL):** If you just set up a custom domain for your worker, there might be a short delay.
*   **JSON Parsing Errors:** If the worker returns an unexpected response (e.g., HTML error page instead of JSON), the client-side `email.js` might fail to parse it. Worker logs are key here.
*   **Network Issues:** General internet connectivity issues for the user or Cloudflare.
*   **Typos in KV Key Names:** Ensure `ADMIN_EMAIL_BREVO` and `SITE_NAME` are the exact keys used in the worker script when it tries to `env.CONFIG_KV.get()`.
