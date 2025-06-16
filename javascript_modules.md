## JavaScript Modules

This section details the purpose and primary functionalities of each key JavaScript module within the `/assets/js/` directory. These modules form the core of the client-side logic for both the admin panel and the live frontend site. All scripts are expected to be ES Modules and should be loaded with the `defer` attribute where appropriate to optimize page loading performance.

---

### 1. `main.js` (CMS Frontend SPA Logic)

*   **Primary Responsibility:** To manage the rendering and interactivity of the live, visitor-facing website. It can operate as a Single Page Application (SPA) or simply enhance statically generated pages.
*   **Key Functionalities/Tasks:**
    *   Handles client-side routing if the frontend is set up as an SPA (e.g., using Navigo or History API).
    *   Renders pages and content dynamically using data from local sources (if applicable for SPA mode) or fetched from the Cloudflare Worker.
    *   Utilizes HTML templates from `/templates/` to construct views.
    *   Manages dynamic content updates or interactive elements on the page (e.g., image carousels, simple form submissions not requiring worker interaction).
    *   Initiates the registration of the service worker by calling functions from `sw-registrar.js`.
    *   Handles user interactions and events on the frontend.
*   **Interactions:**
    *   `sw-registrar.js`: To register the service worker.
    *   `cloudflare/worker.js` (via fetch): For any dynamic data or actions needed by the live site that aren't pre-rendered.
    *   `/templates/`: Consumes HTML templates for rendering.
*   **General Notes:** This module will be lightweight, especially if the site is mostly statically generated. Its complexity increases if a full SPA approach is chosen for the frontend.

---

### 2. `admin.js` (Admin Interface Logic)

*   **Primary Responsibility:** To power the entire admin dashboard, providing a comprehensive interface for managing the website.
*   **Key Functionalities/Tasks:**
    *   Manages administrator login, authentication, and session management (potentially using client-side tokens or integrating with an auth provider via the Cloudflare Worker).
    *   Renders the main dashboard UI, including navigation, content listings, and settings panels.
    *   Handles all Content CRUD (Create, Read, Update, Delete) operations by interfacing with `db.js`.
    *   Allows administrators to update site settings (e.g., site name, theme choice), which are then saved via `db.js`.
    *   Integrates with `builder.js` to provide theme customization capabilities.
    *   Manages the "Publish" action, which involves:
        *   Triggering static HTML/CSS/JS file generation logic (potentially in a web worker or coordinated with `builder.js` and `seo.js`).
        *   Invoking `seo.js` to generate sitemaps and necessary SEO metadata.
        *   Coordinating the deployment or update of files to the hosting platform (e.g., via Cloudflare Pages API or Git).
    *   Handles client-side routing within the admin panel (e.g., using Navigo).
    *   Interacts with `ai.js` to provide AI-assisted content creation or suggestions.
    *   Interacts with `email.js` for configuring email settings or viewing form submissions (if stored).
*   **Interactions:**
    *   `db.js`: For all data storage and retrieval.
    *   `builder.js`: For theme editing and preview.
    *   `seo.js`: For SEO metadata generation during publish.
    *   `ai.js`: For AI-powered assistance.
    *   `email.js`: For email-related configurations or data.
    *   `plugin-loader.js`: To enable plugin functionalities within the admin UI.
    *   `cloudflare/worker.js` (via fetch): For actions like triggering deployment, fetching external data, or authentication.
*   **General Notes:** This is the largest and most complex client-side module.

---

### 3. `db.js` (IndexedDB/SQLite Initialization and Abstraction)

*   **Primary Responsibility:** To abstract and manage all interactions with the client-side database (Dexie.js for IndexedDB or SQL.js via WASM).
*   **Key Functionalities/Tasks:**
    *   Initializes the chosen client-side database (Dexie.js or SQL.js).
    *   Defines the database schema (tables/stores for posts, pages, theme settings, site configurations, etc.).
    *   Provides asynchronous CRUD (Create, Read, Update, Delete) methods for all data types.
    *   Handles data validation against schemas defined in `/config/schemas.json` before saving.
    *   Manages database versioning and migrations if the schema evolves.
    *   Exports data in a format suitable for static site generation or backup.
*   **Interactions:**
    *   `admin.js`: Consumes its methods for all data operations.
    *   `builder.js`: Saves and retrieves theme configurations.
    *   `/config/schemas.json`: Uses these schemas for data validation.
*   **General Notes:** Provides a clean API for the rest of the admin application, so the choice of underlying database technology can be swapped with minimal impact elsewhere.

---

### 4. `seo.js` (Meta, JSON-LD, Sitemap Generation - Client-side aspects)

*   **Primary Responsibility:** To handle the generation of SEO-related metadata and data structures.
*   **Key Functionalities/Tasks:**
    *   Generates HTML meta tags (e.g., `<title>`, `<meta name="description">`, `<meta name="keywords">`, canonical URLs, Open Graph tags) based on content from `db.js`.
    *   Creates JSON-LD structured data snippets (e.g., for `Article`, `Product`, `WebSite`, `Organization`) based on content and site settings.
    *   Prepares the data structure (list of URLs, last modified dates) required for generating the `sitemap.xml` file. The actual XML file generation might occur via a utility function or within the main publish process coordinated by `admin.js`.
    *   Provides functions to embed SEO data into page templates during the static site generation process.
*   **Interactions:**
    *   `admin.js`: Invoked during the publish process and content saving.
    *   `db.js`: Reads content and settings to generate relevant SEO data.
*   **General Notes:** Focuses on preparing SEO data; the actual file writing (for sitemap) or HTML embedding is coordinated by other modules involved in the build process.

---

### 5. `builder.js` (Visual Theme Editor Logic)

*   **Primary Responsibility:** To power the visual theme editor, allowing administrators to customize the appearance and layout of the website.
*   **Key Functionalities/Tasks:**
    *   Renders the drag-and-drop interface for arranging and configuring theme sections and components.
    *   Manages a live preview of the website as changes are made.
    *   Handles theme settings adjustments, such as:
        *   OKLCH color palette selections and application.
        *   Font choices and integration with local fonts (from `/assets/fonts/`) or Google Fonts, including controls for font subsetting if possible.
        *   Responsive layout controls (e.g., adjusting column widths, visibility on different devices).
    *   Loads and applies HTML templates from `/templates/` for sections and components.
    *   Saves the modified theme configuration (e.g., color schemes, layout settings, chosen components) to `db.js`.
    *   Generates or updates the necessary CSS based on theme customizations.
*   **Interactions:**
    *   `admin.js`: Integrated into the admin panel UI.
    *   `db.js`: To save and retrieve theme configurations and styles.
    *   `/templates/`: Uses these for rendering editable sections and components.
*   **General Notes:** This module will be highly interactive and visually focused.

---

### 6. `sw-registrar.js` (Service Worker Registration & Communication)

*   **Primary Responsibility:** To manage the registration and lifecycle of the root service worker (`/service-worker.js`).
*   **Key Functionalities/Tasks:**
    *   Checks for browser support for Service Workers.
    *   Registers the `/service-worker.js` script, specifying its scope.
    *   Handles events related to the service worker lifecycle (e.g., installation, activation, updates).
    *   Provides a mechanism for the client (e.g., `main.js` or `admin.js`) to communicate with the active service worker (e.g., to trigger cache updates, skip waiting).
    *   Listens for messages from the service worker.
*   **Interactions:**
    *   `main.js` (and potentially `admin.js`): Initiates registration.
    *   `/service-worker.js`: Registers and communicates with this script.
*   **General Notes:** This script is distinct from `/service-worker.js` itself; it's the client-side code that manages the worker.

---

### 7. `email.js` (Client-side Email Logic)

*   **Primary Responsibility:** To handle client-side aspects of email functionalities, primarily for form submissions that will be processed via the Cloudflare Worker and sent using Brevo.
*   **Key Functionalities/Tasks:**
    *   Collects data from HTML forms (e.g., contact forms, newsletter sign-ups).
    *   Performs client-side validation of form data (e.g., checking for required fields, email format).
    *   Implements client-side spam protection measures (e.g., honeypot fields, timestamp checks before submission).
    *   Prepares the data payload in a structured format (e.g., JSON).
    *   Sends the prepared payload to the designated Cloudflare Worker endpoint (e.g., `/api-proxy/brevo/send-email`) using `fetch`.
    *   Handles UI feedback for form submission (e.g., success messages, error messages).
*   **Interactions:**
    *   `admin.js`: May be used to configure Brevo settings or view submission data if it's stored.
    *   `cloudflare/worker.js` (via fetch): Sends data to the worker for actual email dispatch.
*   **General Notes:** Does not send emails directly from the client. All email sending is proxied through the Cloudflare Worker to protect API keys and manage sending logic centrally.

---

### 8. `ai.js` (Client-side AI Interaction Logic)

*   **Primary Responsibility:** To facilitate interaction with AI services (OpenAI, Gemini) by acting as a client-side interface to the Cloudflare Worker proxy.
*   **Key Functionalities/Tasks:**
    *   Provides functions that map to specific AI tasks (e.g., `generateText(prompt)`, `suggestSeoKeywords(content)`).
    *   Constructs the request payload for the AI service.
    *   Sends requests to the appropriate Cloudflare Worker API proxy endpoints (e.g., `/api-proxy/openai/generate-text`, `/api-proxy/gemini/suggest-seo`).
    *   Receives responses from the Cloudflare Worker.
    *   Handles the display or integration of AI-generated content/suggestions within the admin panel UI (e.g., populating text fields, showing suggestion lists).
    *   Manages loading states and error handling for AI interactions.
*   **Interactions:**
    *   `admin.js`: Provides UI elements that trigger AI functions and display results.
    *   `cloudflare/worker.js` (via fetch): Sends requests to and receives responses from the AI proxy endpoints.
*   **General Notes:** This module ensures that direct calls to AI services and API keys are kept out of the client-side code.

---

### 9. `plugin-loader.js` (Plugin Loading and Registration)

*   **Primary Responsibility:** To discover, load, and register client-side plugins located in the `/assets/js/plugins/` directory.
*   **Key Functionalities/Tasks:**
    *   On initialization (likely when `admin.js` or `main.js` starts), it scans the `/assets/js/plugins/` directory for valid plugin modules. (Note: Direct filesystem scanning is not possible in browsers; this would typically involve a predefined list of plugins or a manifest file generated at build time if truly dynamic, or plugins are explicitly imported).
    *   Alternatively, plugins might be explicitly listed in a configuration and imported.
    *   Dynamically imports valid JavaScript modules found (e.g., using `import()`).
    *   Each plugin module is expected to expose a standard interface, such as a `register` function or specific named exports for hooks.
    *   Calls the `register` function or otherwise integrates the plugin's hooks with a central dispatcher, event emitter, or hook system within the CMS. This system allows plugins to extend or modify core functionalities at predefined points.
    *   Manages error handling for plugin loading and registration.
*   **Interactions:**
    *   `admin.js` / `main.js`: Initiates the plugin loading process.
    *   Plugins in `/assets/js/plugins/`: Loads and registers these modules.
    *   Core CMS modules: Registered plugins will interact with various parts of the CMS through the established hook system.
*   **General Notes:** The exact mechanism for "discovering" plugins in a browser environment needs careful consideration. A common approach is for plugins to self-register or be explicitly imported and initialized. For a fully dynamic system without a build step, a manifest file listing available plugins might be necessary.

---

This modular structure ensures that functionalities are well-encapsulated, promoting easier development, testing, and maintenance.
