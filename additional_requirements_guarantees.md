## Additional Requirements and Guarantees

This section explicitly addresses further requirements and guarantees of the CMS, ensuring comprehensive coverage of its intended features and operational principles.

---

### 1. Accessibility (A11y)

The CMS is committed to providing an accessible experience for both administrators and end-users of the websites it generates.

*   **Commitment:** The CMS aims to meet the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA as a standard for the admin panel UI and the structure of themes it generates.
*   **Semantic HTML & ARIA Roles:** Semantic HTML will be prioritized in all generated templates and within the admin user interface. Where semantic HTML alone is insufficient to convey meaning or interactivity (e.g., for custom components or dynamic updates), appropriate ARIA (Accessible Rich Internet Applications) roles, states, and properties will be used.
*   **Contrast Checker:** The Visual Theme Builder will include a basic automated contrast checker. This tool will help administrators choose color combinations for text, backgrounds, and UI elements that meet WCAG AA contrast ratio requirements, preventing common accessibility issues.
*   **WCAG-Aware Builder:** The Visual Theme Builder interface itself will be designed with accessibility in mind. This includes:
    *   Keyboard navigability for all controls and elements.
    *   Proper labeling of form fields, buttons, and interactive elements.
    *   Sufficient color contrast in the admin UI.
    *   Generated content structures (e.g., headings, landmarks) will follow accessibility best practices.
*   **Focus Management:** For Single Page Application (SPA) views within the admin panel and any dynamic frontend components, careful focus management will be implemented to ensure that keyboard focus is logical and predictable after route changes or UI updates.

---

### 2. Form Builder Features

While a full drag-and-drop form builder is an advanced feature, the CMS will support robust form handling.

*   **Form Creation:**
    *   **Simplified Approach:** Initially, forms will be based on predefined structures that users can include on their pages (e.g., a standard contact form with fields like name, email, message). The structure of these forms will be part of the theme templates.
    *   **Content Type Fields:** For more customized data collection, users can define content types (via `schemas.json`) that include fields which can be rendered as part of a form on a page. The submission would then be handled by the generic form submission endpoint.
*   **Validation:**
    *   **Client-Side:** `email.js` (or equivalent frontend JavaScript) will perform client-side validation for common cases like required fields, email format correctness, and basic length checks. This provides immediate feedback to the user.
    *   **Server-Side (Cloudflare Worker):** The Cloudflare Worker endpoint handling form submissions (e.g., `/submit-form` or `/api-proxy/brevo/send-email`) will also perform validation on the received data before processing it further (e.g., storing in KV or sending via Brevo). This is crucial for data integrity and security.
*   **Asynchronous Email Submission:** Form submissions that trigger emails (e.g., contact forms) will be sent asynchronously using `fetch` from the client-side (`email.js`) to the Cloudflare Worker. This ensures a non-blocking user experience, where the user isn't waiting for the email sending process to complete.
*   **Spam Protection:** Multiple layers of spam protection will be encouraged and supported:
    *   **Honeypot Field:** A hidden input field will be included in forms. If this field is filled out, the submission is likely from a bot and can be discarded by the Cloudflare Worker.
    *   **Timestamp Checks:** Basic timestamp checks can be implemented (e.g., minimum time between page load and form submission) by `email.js` and verified by the worker to deter fast bot submissions.
    *   **Cloudflare Turnstile/reCAPTCHA (User Configuration):** While not built-in directly to avoid external dependencies for core functionality, users can integrate Cloudflare Turnstile or Google reCAPTCHA on their frontend and configure their Cloudflare Worker to verify the challenge token. Documentation will guide this process.

---

### 3. Ultra-Lightweight (< 10MB Goal) & Core Web Vitals

*   **Lightweight Goal:** The entire CMS, including its core admin panel assets (HTML, CSS, JS), the default theme, and the generated assets for a small to medium-sized static site, aims for a total package size well under 10MB (excluding user-uploaded large media, which is optimized).
*   **Achieving Lightweightness:** This is achieved through:
    *   Careful selection of small, efficient JavaScript libraries (Preact/Alpine.js, Nano Stores, Navigo).
    *   Utilizing WebAssembly (WASM) for computationally intensive client-side tasks like image compression (Squoosh.wasm) and potentially CSS minification or font subsetting, keeping JavaScript bundles smaller.
    *   A "no heavy backend" architecture, relying on client-side logic and Cloudflare Workers.
    *   Optimized static output from the "Publish" process.
*   **Core Web Vitals Adherence:** The performance optimization strategies detailed in the "SEO and Performance Optimizations" section are designed to meet or exceed the following Core Web Vitals targets:
    *   **LCP (Largest Contentful Paint):** < 1.0 second
    *   **INP (Interaction to Next Paint):** < 100 milliseconds
    *   **CLS (Cumulative Layout Shift):** < 0.05

---

### 4. No Paid Service Dependencies (Beyond Free Tiers for Core Functionality)

*   **Core Functionality:** The CMS's core functionality (content creation, static site generation, admin panel operation) does not rely on any paid third-party services.
*   **Brevo (Email Sending):** The integration with Brevo for email sending is designed to work with their free tier (typically around 300 emails/day), which is sufficient for many small to medium websites. Users can opt for paid Brevo plans if their volume increases.
*   **Cloudflare Workers & KV:** Cloudflare provides generous free tiers for Workers (requests, CPU time) and KV storage (reads, writes, storage volume) that should cover the needs of many users for the backend logic and visitor data storage.
*   **Optional Premium Integrations:** Integrations with services like OpenAI, Gemini, Stripe, and DocuSign are optional. Users who choose to use these services will manage their own accounts and any associated costs based on their usage. The CMS itself does not impose these costs or require these services for its fundamental operation.

---

### 5. Works Out-of-the-Box (No Build Step for Deployment)

*   **Core Principle Reaffirmed:** A primary design goal is that the CMS works "out-of-the-box." Users download the CMS package (ZIP file), upload it to their hosting provider, and it becomes operational.
*   **No Compilation/Bundling Required for Use:** There are no server-side compilation steps (e.g., Node.js build, PHP composer install) or command-line build tools required to deploy or run the CMS for its basic functionality.
*   **"Publish" as Content Generation:** The "Publish" action within the admin panel is a *content generation and packaging* step. It generates static HTML files and organizes assets but does not involve compiling source code in the traditional sense of a build pipeline.

---

### 6. ES Modules and Deferred Scripts

*   **Modern JavaScript:** All custom JavaScript developed for the CMS (e.g., `main.js`, `admin.js`, `db.js`, plugins) will be written as ES Modules. This promotes better code organization, maintainability, and efficient loading by modern browsers.
*   **Optimized Script Loading:** Non-critical JavaScript files will use the `defer` attribute in their `<script>` tags. This instructs the browser to download the script in parallel with page parsing and execute it only after the HTML document has been fully parsed, preventing render-blocking and improving perceived load times.

---

### 7. Sitemap Updates on Each Publish

*   **Automatic Sitemap Generation:** The `sitemap.xml` file is automatically generated or updated every time the administrator performs the "Publish" action.
*   **Responsibility:** This process is managed by the `seo.js` module (or equivalent logic triggered by `admin.js` during publishing), ensuring that the sitemap always reflects the current set of published pages and posts.

---

### 8. Full HTML Page Generation (Static Output)

*   **Static HTML Output:** The "Publish" process is fundamentally about generating complete, static HTML files for each page and post. These files contain all the necessary content and markup and require no server-side processing to be displayed by a browser.
*   **JSON Output (Optional/Future Consideration):**
    *   While the primary output is static HTML, the system could optionally be extended to generate JSON representations of content (e.g., `/api/pages/my-page.json`, `/api/posts.json`).
    *   This would support headless CMS use cases, allowing the content to be consumed by other applications, frameworks, or static site generators if desired.
    *   For the initial version, the focus is on generating a fully functional static HTML website. JSON output would be considered an advanced feature for future iterations.

These additional requirements and guarantees further define the CMS's commitment to accessibility, performance, ease of use, and modern web standards.
