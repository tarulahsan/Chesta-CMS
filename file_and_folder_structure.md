## File and Folder Structure

This section details the proposed file and folder structure for the CMS. This organization aims for clarity, maintainability, and adherence to best practices for web applications.

```
/
├── index.html
├── admin/
│   └── index.html
├── assets/
│   ├── css/
│   │   ├── theme.css
│   │   └── dark-mode.css
│   ├── js/
│   │   ├── main.js
│   │   ├── admin.js
│   │   ├── db.js
│   │   ├── seo.js
│   │   ├── builder.js
│   │   ├── sw-registrar.js
│   │   ├── email.js
│   │   ├── ai.js
│   │   └── plugins/
│   │       ├── example-seo-enhancer.js
│   │       └── example-custom-form-validator.js
│   ├── images/
│   │   └── logo.png
│   ├── fonts/
│   │   └── custom-font.woff2
│   └── icons/
│       └── favicon.ico
├── sitemap.xml
├── robots.txt
├── service-worker.js
├── cloudflare/
│   └── worker.js
├── templates/
│   ├── default-page.html
│   ├── article-layout.html
│   ├── product-layout.html
│   ├── header.html
│   ├── footer.html
│   └── section-hero.html
└── config/
    ├── settings.json
    └── schemas.json
```

### Root Directory (`/`)

*   **`index.html`**:
    *   **Purpose:** The main entry point for the live, visitor-facing website. This file will typically be a static shell, with content dynamically loaded by `assets/js/main.js` if the site is behaving like an SPA, or it will be one of the fully rendered static pages if the site is purely static.
*   **`sitemap.xml`**:
    *   **Purpose:** Auto-generated XML file that lists all public URLs for the website, aiding search engines in crawling and indexing the site content. Updated during the publish process.
*   **`robots.txt`**:
    *   **Purpose:** A text file that provides instructions to web crawlers (e.g., search engine bots) about which pages or sections of the site should not be crawled or indexed.
*   **`service-worker.js`**:
    *   **Purpose:** The actual Service Worker script. It runs in the background and handles features like offline caching of assets, PWA functionality (e.g., add to home screen), and potentially enforcing HTTPS by redirecting HTTP requests. Its placement at the root ensures it can control all pages under the site's origin.

### Admin Directory (`/admin/`)

*   **`admin/index.html`**:
    *   **Purpose:** The main entry point for the CMS administration dashboard. This will be a single-page application (SPA) where users manage site content, settings, and themes.

### Assets Directory (`/assets/`)

This directory contains all static assets used by both the frontend site and the admin panel.

*   **`assets/css/`**:
    *   **Purpose:** Contains all CSS files.
    *   `theme.css`: Styles for the currently active theme on the frontend.
    *   `dark-mode.css`: (Optional) Additional styles for a dark mode variant of the theme or admin panel.
    *   Other files could include PicoCSS or purged Tailwind CSS outputs.
*   **`assets/js/`**:
    *   **Purpose:** Contains all JavaScript files.
    *   `main.js`: Core JavaScript for the frontend visitor-facing site. Handles dynamic content loading (if applicable), interactivity, and integration with the Cloudflare Worker for dynamic features.
    *   `admin.js`: Core JavaScript for the admin panel SPA. Manages UI interactions, state, routing, and communication with `db.js` and `builder.js`.
    *   `db.js`: Handles client-side database initialization (Dexie.js for IndexedDB or SQL.js via WASM) and all CRUD operations for content, settings, and configurations stored in the browser.
    *   `seo.js`: Contains logic for generating SEO-related elements such as meta tags, JSON-LD structured data, and potentially triggers sitemap generation. Used by the build/publish process.
    *   `builder.js`: Powers the visual theme editor and page builder within the admin panel. Handles drag-and-drop, component configuration, and template manipulation.
    *   `sw-registrar.js`: Client-side script responsible for registering the main `/service-worker.js`. It checks for browser support and initiates the registration process.
    *   `email.js`: Client-side logic related to email functionalities. This might involve assembling data for forms that will be submitted to the Brevo API (via the Cloudflare Worker) or handling UI aspects of email integration.
    *   `ai.js`: Client-side logic for interacting with AI features (OpenAI, Gemini). It will primarily act as a bridge to make requests to the Cloudflare Worker, which then securely calls the AI APIs.
    *   **`assets/js/plugins/`**:
        *   **Purpose:** Directory for hook-based plugin modules that extend CMS functionality. Plugins are JavaScript files that can tap into predefined hooks in the core CMS lifecycle.
        *   `example-seo-enhancer.js`: A hypothetical plugin that might add advanced SEO features, like more granular schema.org markup or integration with an external SEO analytics service.
        *   `example-custom-form-validator.js`: A hypothetical plugin to add custom validation rules for forms created through the CMS.
*   **`assets/images/`**:
    *   **Purpose:** Stores general images used across themes, UI elements within the admin panel, or default placeholder images.
    *   `logo.png`: Example site logo.
*   **`assets/fonts/`**:
    *   **Purpose:** Contains local font files (e.g., WOFF2, TTF) if self-hosting fonts is preferred over CDN-hosted fonts. Includes only necessary subsets to optimize loading.
    *   `custom-font.woff2`: Example custom font file.
*   **`assets/icons/`**:
    *   **Purpose:** Stores favicons and other site icons.
    *   `favicon.ico`: Default favicon. Other formats like `favicon.png`, `apple-touch-icon.png` might also be included.

### Cloudflare Directory (`/cloudflare/`)

*   **`cloudflare/worker.js`**:
    *   **Purpose:** Contains the source code for the Cloudflare Worker. This serverless function acts as the primary backend logic for handling dynamic requests, proxying API calls (to OpenAI, Gemini, Stripe, DocuSign, Brevo), managing data in Cloudflare KV (e.g., form submissions, analytics), and potentially serving personalized content.

### Templates Directory (`/templates/`)

*   **Purpose:** Stores HTML templates used by the `builder.js` for visual editing and by `main.js` or the build process for generating static pages. These templates define the structure for different types of content and reusable sections.
*   `default-page.html`: Template for standard pages.
*   `article-layout.html`: Template for blog posts or articles.
*   `product-layout.html`: Template for product pages (if e-commerce features are included).
*   `header.html`: Reusable template for the site header.
*   `footer.html`: Reusable template for the site footer.
*   `section-hero.html`: Template for a hero section component.

### Configuration Directory (`/config/`)

*   **Purpose:** Contains global configuration files for the CMS. These are typically set up once and not frequently edited by the end-user through the admin panel (though some settings might be surfaced).
*   **`settings.json`**:
    *   **Purpose:** Stores essential site-wide settings.
    *   Contents include: site name, admin user credentials (e.g., username and a hashed password), chosen theme identifier, the URL of the deployed Cloudflare Worker (once known), and placeholders for API keys like Brevo (which the admin would fill in via the admin panel, not by editing this file directly).
    *   **Security Note:** Sensitive keys should ideally be managed as environment variables in the deployment environment (e.g., Cloudflare Worker settings) rather than being stored directly in a file in the repository, even if it's just a placeholder. This file might store references or indicate if a key is expected.
*   **`schemas.json`**:
    *   **Purpose:** Defines the structure and validation rules for different content types (e.g., "Article", "Product", "Page", "Testimonial").
    *   This JSON file will contain schemas (potentially using a format like JSON Schema) that the admin panel uses to:
        *   Dynamically generate input forms in the content editor.
        *   Validate content upon submission.
        *   Guide the `builder.js` and templating engine on how to render different content types.

This structure provides a solid foundation for building a modular and scalable CMS, separating concerns and making it easier to locate and manage different aspects of the application.
