## Admin UI Flows

This section describes the user's journey and key interactions within the `/admin` dashboard. The admin panel is a Single Page Application (SPA) designed for intuitive content management, theme customization, and site configuration.

---

### 1. Login & Authentication

*   **User Action:** Navigates to `/admin` or is redirected if attempting to access a protected admin route without an active session.
*   **System Response:**
    *   If no active session, displays a login page with a password input field.
    *   The placeholder for the password field might indicate if it's the initial setup (e.g., "Set your admin password") or a subsequent login.
*   **User Action:** Enters their password and submits the form.
*   **System Response:**
    *   The `admin.js` module captures the password.
    *   The password is then hashed client-side using the WebCrypto API (PBKDF2 is a strong candidate).
    *   **Initial Setup:** If it's the first login (no admin password set in `db.js` or `/config/settings.json` hasn't been updated yet), the hashed password is stored via `db.js` as the admin password. A new entry in `/config/settings.json` might be prepared for download by the user if settings are managed this way, or directly updated in `db.js`.
    *   **Subsequent Logins:** The client-side hashed password is compared against the hashed password retrieved by `db.js` (originally from `/config/settings.json` or updated by the user).
    *   **Success:** If the hashes match, an authenticated session is established. This could involve setting a flag in `localStorage` or `sessionStorage` and potentially storing a session token or timestamp in `db.js` for validation. The user is redirected to the Dashboard Overview.
    *   **Failure:** If the hashes do not match, an error message is displayed on the login page.

---

### 2. Dashboard Overview

*   **User Action:** Successfully logs in or navigates to the main dashboard view.
*   **System Response:**
    *   The `admin.js` module renders the main dashboard interface.
    *   **Summary Widgets:** Displays key information at a glance:
        *   Number of published pages.
        *   Number of posts/articles.
        *   Recent activity feed (e.g., "Page 'About Us' updated," "Theme 'Nova' saved").
        *   Quick links to common actions (e.g., "Create New Page," "Edit Homepage," "Customize Theme").
    *   **Visitor Data Highlights:**
        *   Displays a count of new form submissions or comments (data synced periodically from Cloudflare KV via the Cloudflare Worker and stored/cached in `db.js`).
        *   (Optional) A mini-chart from `uPlot` showing recent visitor trends if basic analytics are captured.

---

### 3. Content Creation & Management (Pages/Posts)

*   **User Action:** Navigates to the "Pages" or "Posts" section from the admin menu.
*   **System Response:**
    *   `admin.js` fetches and displays a list of existing pages or posts from `db.js`.
    *   Each item in the list shows the title, status (e.g., Draft, Published), and modification date.
    *   Options are provided for each item: "Edit," "Delete," "View" (opens the live page in a new tab if published).
*   **User Action (Create New):** Clicks "Create New Page" or "Create New Post."
*   **System Response:**
    *   `admin.js` renders a content creation form.
    *   **Content Type Selection:** If multiple content types are defined in `/config/schemas.json` (e.g., "Page," "Article," "Product"), the user might first select the type, and the form fields will adjust accordingly.
    *   **Form Fields:**
        *   **Title:** Text input for the page/post title.
        *   **Slug:** Auto-generated from the title (editable by the user for SEO-friendly URLs).
        *   **Content Editor:** A rich text editor (e.g., TinyMCE, Quill.js) or a lightweight markdown editor for the main body content.
        *   **Meta Description:** Textarea for SEO meta description.
        *   **Featured Image:** File upload interface or selection from a media library (if implemented).
        *   Other custom fields based on the content type schema from `/config/schemas.json`.
    *   **AI Integration:**
        *   Buttons like "Generate with AI" or "Suggest SEO Keywords" are present near relevant fields (e.g., content body, meta description).
        *   Clicking these buttons triggers functions in `ai.js`, which call the Cloudflare Worker to interact with OpenAI/Gemini. Results are displayed back in the form.
*   **User Action:** Fills in the content and clicks "Save Draft" or "Save & Publish."
*   **System Response:**
    *   `admin.js` collects form data.
    *   Data is validated against the schema (if applicable) and then saved to `db.js`.
    *   If "Save & Publish" is clicked:
        *   The system initiates the publish process: `seo.js` is used to generate metadata, static files are (conceptually) generated based on templates and the new content.
        *   The status of the content is updated to "Published."
        *   (Further details in a dedicated "Publishing Flow" if needed, but this is the initiation point).
    *   User is redirected to the content list or stays on the edit page with a success message.

---

### 4. Visual Theme Builder

*   **User Action:** Navigates to "Appearance" > "Customize Theme" or a similar menu item.
*   **System Response:**
    *   `admin.js` loads the `builder.js` module and transitions to the theme builder interface.
    *   A live preview of the homepage (or a selected page) is displayed.
    *   A sidebar or panel shows available theme customization options.
*   **User Action (Drag-and-Drop):** Drags a section (e.g., Hero, Gallery, Text Block, CTA from a list of available sections based on `/templates/`) onto the page preview.
*   **System Response:** The `builder.js` updates the live preview to include the new section. Properties for the new section appear in the sidebar.
*   **User Action (Reorder/Configure Sections):** Drags existing sections to reorder them or clicks on a section to edit its properties (text, images, background, etc.).
*   **System Response:** Live preview updates immediately. Configuration options for the selected section are shown in the sidebar.
*   **User Action (OKLCH Color Palette Editor):** Accesses the color settings. Selects predefined palettes or uses color pickers to adjust colors for text, background, primary/secondary accents.
*   **System Response:** `builder.js` updates the live preview with the new color scheme. The OKLCH values are stored.
*   **User Action (Font Subsetting):** Chooses fonts for headings and body text from a list (local fonts from `/assets/fonts/` or Google Fonts). If Google Fonts, options to select character subsets might be available.
*   **System Response:** Live preview updates with the new fonts. Configuration is noted.
*   **User Action (Responsive Layout Editor):** Clicks icons to switch the live preview between desktop, tablet, and mobile views. Uses tools (if available) to adjust visibility or styling of elements specifically for that breakpoint.
*   **System Response:** Preview resizes. Adjustments are applied and stored as part of the responsive settings for the theme.
*   **User Action:** Clicks "Save Theme."
*   **System Response:** `builder.js` saves the complete theme configuration (section order, content overrides in sections, color palettes, font choices, responsive settings) to `db.js`. A success message is shown.

---

### 5. Plugin Management

*   **User Action:** Navigates to the "Plugins" section.
*   **System Response:**
    *   `admin.js` uses `plugin-loader.js` to get a list of discovered plugins (from `/assets/js/plugins/`).
    *   Displays the list of plugins, showing their name, description (if available from the plugin file), and current status (Enabled/Disabled).
*   **User Action:** Toggles a switch or clicks a button to "Enable" or "Disable" a plugin.
*   **System Response:**
    *   `plugin-loader.js` updates the plugin's status in `db.js`.
    *   If a plugin is enabled, its registered hooks become active. If disabled, its hooks are deactivated.
    *   The UI updates to reflect the new status.
*   **User Action (Optional Configuration):** If a plugin exposes configuration options, clicks a "Configure" button for that plugin.
*   **System Response:** A modal or separate view appears, showing form fields for the plugin's settings. These settings are saved via `db.js` and used by the plugin.
*   **User Action (Upload New Plugin):** Clicks "Add New Plugin" and uses a file picker to select a `.js` plugin file.
*   **System Response:**
    *   The selected JavaScript file is read by the browser.
    *   `admin.js` saves this file content into `db.js` (e.g., in a dedicated store for user-uploaded plugins).
    *   `plugin-loader.js` is then triggered to recognize this new plugin from the database.
    *   **Note:** On the next "Publish" action, this plugin file from `db.js` needs to be written out to the `/assets/js/plugins/` directory (or an equivalent in the generated static site) so it can be loaded normally.

---

### 6. Settings & Configuration

*   **User Action:** Navigates to the "Settings" section.
*   **System Response:** Displays a form with various configuration panels.
*   **User Action (Site Settings):**
    *   Updates the "Site Name."
    *   Changes the "Admin Password": Enters current password, new password, and confirms new password.
*   **System Response (Site Settings):**
    *   Site name is saved to `db.js`.
    *   For password change: Current password is hashed and verified. New password is hashed and updated in `db.js`.
*   **User Action (Cloudflare Worker Setup):**
    *   Enters Cloudflare Account ID, KV Namespace ID for visitor data.
    *   **Worker Deployment:**
        *   **Guidance Method (Simplest):** Sees instructions to manually copy the content of `/cloudflare/worker.js` (provided or viewable in the UI) and paste it into the Cloudflare dashboard for a new Worker.
        *   **API Key Input:** Enters API keys for OpenAI, Gemini, Stripe, DocuSign, Brevo.
*   **System Response (Cloudflare Worker Setup):**
    *   Account ID, KV Namespace ID are saved to `db.js` for reference or use by `admin.js` when constructing links or instructions.
    *   **API Key Handling:** When API keys are entered, `admin.js` makes a secure `fetch` request to a *setup* endpoint on the (already manually deployed) Cloudflare Worker. The Worker then saves these keys securely within its own settings or a separate, more secure KV namespace, NOT directly in the client-accessible `db.js`. The client only needs to know if they've been set.
*   **User Action (Email Settings):** Enters the admin email address where notifications from form submissions (via Brevo) should be sent.
*   **System Response (Email Settings):** The email address is saved to `db.js`. This email will be passed to the Cloudflare Worker when configuring Brevo or sending emails.
*   **User Action:** Clicks "Save Settings."
*   **System Response:** All changed settings are validated and saved by `admin.js` to `db.js` or handled as described for API keys. A success message is displayed.

---

### 7. Visitor Data Viewing

*   **User Action:** Navigates to a section like "Form Submissions" or "Visitor Data."
*   **System Response:**
    *   `admin.js` makes a request to the Cloudflare Worker to fetch data from the designated Cloudflare KV namespace (e.g., entries from contact forms, comments).
    *   The Worker retrieves the data and returns it.
    *   The data is displayed in a tabular or list format in the admin panel.
    *   **Basic Controls:**
        *   Pagination is implemented if the dataset is large.
        *   Simple filtering options might be available (e.g., filter by form name, date range).
        *   Option to delete individual entries (sends a request to the Worker to remove it from KV).

These flows describe the primary administrative interactions, focusing on a client-side driven experience with the Cloudflare Worker handling backend tasks and secure operations.
