## Plugin System

The Plugin System allows for the extension and modification of the CMS's core functionalities without altering the core codebase. Plugins can introduce new features, change existing behaviors, or integrate with third-party services. They are designed to be modular and manageable through the admin interface.

---

### 1. Plugin Interface Definition

Plugins are JavaScript ES Modules that export a default object adhering to a defined interface. This interface specifies metadata about the plugin and a set of lifecycle hooks that the CMS will call at specific points.

```javascript
export default {
  // --- Metadata ---
  name: "my-plugin-name",      // (Required) string: Unique, kebab-case identifier for the plugin.
  version: "1.0.0",           // (Required) string: Semantic version number (e.g., "1.0.0").
  description: "A brief description of what the plugin does.", // (Optional) string: Human-readable description.
  author: "Plugin Author",    // (Optional) string: Name or handle of the plugin creator.

  // --- Lifecycle Hooks ---
  // Plugins can implement any subset of these optional hooks.

  /**
   * Called when the CMS core (admin panel or frontend site logic) initializes.
   * Useful for setting up global state, event listeners, or early modifications.
   * @param {object} context - Provides access to core CMS functionalities, config, utility functions.
   *                         (e.g., context.config.getSiteName(), context.utils.notify())
   */
  onInit(context) {
    // console.log(`Plugin "${this.name}" initialized.`);
  },

  /**
   * Called before a page is fully rendered to the DOM (frontend) or when a page preview
   * is rendered in the visual builder (admin).
   * Can modify pageData (e.g., add/change HTML, meta tags, structured data).
   * @param {object} pageData - Object containing page details (e.g., pageData.title, pageData.htmlContent, pageData.meta).
   * @param {object} context - Provides rendering context (e.g., context.renderLocation: 'frontend' | 'adminBuilder').
   * @returns {object | null | undefined} - The modified pageData object, or null/undefined if no changes were made.
   */
  onRenderPage(pageData, context) {
    // pageData.htmlContent += "<p>Injected by my-plugin-name</p>";
    // return pageData;
  },

  /**
   * Called when a form is submitted on the frontend, before data is sent to the Cloudflare Worker.
   * Can modify formData, perform custom client-side validation, or prevent submission.
   * @param {object} formData - The data collected from the form.
   * @param {string} formId - The ID of the form that was submitted.
   * @param {object} context - Provides access to notification systems or other utilities.
   * @returns {object | false | Promise<object | false>} - Modified formData, or `false` to halt submission.
   *                                                      Can be an async function returning a Promise.
   */
  onFormSubmit(formData, formId, context) {
    // if (formData.specialField && formData.specialField === "invalid") {
    //   context.utils.notify("Error: Special field is invalid!", "error");
    //   return false; // Prevent submission
    // }
    // formData.processedByPlugin = this.name;
    // return formData;
  },

  /**
   * Called when theme settings are updated in the Visual Theme Builder.
   * Useful for plugins that need to adapt their behavior or appearance based on theme changes.
   * @param {object} themeSettings - The new theme settings object.
   * @param {object} context - Provides context.
   */
  onThemeChange(themeSettings, context) {
    // console.log(`Theme changed. New primary color: ${themeSettings.colors.primary}`);
  },

  /**
   * Called when the admin dashboard fully loads and initializes.
   * Useful for adding custom UI elements, menu items, custom routes, or widgets to the admin panel.
   * @param {object} adminContext - Provides tools to interact with the admin UI
   *                              (e.g., adminContext.ui.addMenuItem(), adminContext.router.addRoute()).
   */
  onAdminLoad(adminContext) {
    // adminContext.ui.addMenuItem({ label: 'My Plugin Page', path: '/my-plugin-page', icon: 'puzzle-piece' });
    // adminContext.router.addRoute('/my-plugin-page', () => MyPluginAdminPageComponent);
  },

  /**
   * Called before the site's static files are generated during the "Publish" process.
   * Can modify site-wide data, add new files to the output, or remove/alter existing ones.
   * @param {object} siteData - An object representing all site content and configuration
   *                          (e.g., siteData.pages, siteData.posts, siteData.settings).
   * @param {object} context - Provides context for the publish process.
   * @returns {object | null | undefined} - The modified siteData object.
   */
  onPublish(siteData, context) {
    // siteData.newFile = { path: '/generated-by-plugin.txt', content: 'Hello from plugin!' };
    // return siteData;
  },

  /**
   * (Optional Advanced Feature)
   * Called during database initialization (`db.js`). Allows the plugin to register its own
   * tables/object stores within the main client-side database (Dexie.js/SQL.js).
   * @param {object} dbInstance - The instance of the database (e.g., Dexie).
   * @param {object} context - Provides context.
   */
  registerDataStore(dbInstance, context) {
    // dbInstance.version(1).stores({
    //   myPlugin_customData: '++id, someField'
    // });
  }
};
```

*   **Plugin Metadata:**
    *   `name`: A unique string in kebab-case (e.g., `my-awesome-plugin`). Used internally and for display. **Required.**
    *   `version`: Semantic version string (e.g., `1.0.0`, `1.0.1-beta`). **Required.**
    *   `description`: A brief explanation of the plugin's purpose. Displayed in the admin UI.
    *   `author`: The name of the plugin's creator. Displayed in the admin UI.
*   **Lifecycle Hooks:**
    *   Plugins can implement one or more hooks. If a hook is not defined, it's simply skipped for that plugin.
    *   Each hook receives a `context` object as its last parameter (or second to last if it modifies and returns a value), providing access to relevant CMS functionalities and data.
    *   Hooks that modify data (e.g., `onRenderPage`, `onFormSubmit`, `onPublish`) should return the modified data. If they return `null`, `undefined`, or nothing, it's assumed no changes were made by that specific plugin. `onFormSubmit` can return `false` to prevent the default action.

---

### 2. Plugin Storage and Discovery

*   **Storage:**
    *   Core plugins (if any shipped with the CMS) and user-added plugins reside as individual JavaScript ES Module files in the `/assets/js/plugins/` directory of the *published site*.
    *   When a user uploads a plugin via the admin UI, the JavaScript code of that plugin is stored in the client-side database (`db.js`). During the "Publish" process, these files are retrieved from the database and written into the `/assets/js/plugins/` directory of the static site output.
*   **Discovery (`plugin-loader.js`):**
    *   The `plugin-loader.js` module is responsible for managing plugins on the client-side (both in the admin panel and the live site, if applicable).
    *   **Scanning:** On initialization, it fetches a list of available plugin files (e.g., from a manifest generated during publish, or by listing files if the environment permits; for a pure client-side scenario, it might load plugins listed in `db.js` that are marked as active).
    *   **Dynamic Import:** It dynamically imports each valid `.js` file found using `import('/assets/js/plugins/plugin-name.js')`.
    *   **Validation:** After importing, it validates the plugin's exported structure:
        *   Checks for the presence and validity of `name` (string) and `version` (string).
        *   Verifies that implemented hook functions are indeed functions.
    *   **Registration:** Valid plugins and their hook functions are registered with a central dispatcher or event emitter system. This system maintains a list of plugins for each available hook.

---

### 3. Hook Execution Model

*   **Triggering Hooks:** Core CMS modules (e.g., `main.js` for frontend rendering, `admin.js` for admin panel operations, `builder.js` for theme editing) are instrumented to trigger the relevant hooks at specific points in their execution lifecycle.
*   **Sequential Execution & Data Chaining:**
    *   When a specific hook is triggered (e.g., `onRenderPage`), the central dispatcher iterates through all registered plugins that have implemented that hook, in the order they were loaded or based on a priority system (if implemented, though simple load order is default).
    *   For hooks that modify data (e.g., `pageData` in `onRenderPage`), the output of one plugin's hook function becomes the input for the next plugin's implementation of the same hook. This creates a processing pipeline.
    *   Example: `CMS Core -> PluginA.onRenderPage(data) -> PluginB.onRenderPage(modifiedDataByA) -> PluginC.onRenderPage(modifiedDataByB) -> FinalData`.
*   **Error Handling:**
    *   Errors originating from within a plugin's hook are caught by the dispatcher.
    *   The error is logged to the console, identifying the problematic plugin.
    *   The dispatcher may choose to:
        *   Skip the faulty plugin and continue the hook chain with the last valid data.
        *   Halt the execution of that specific hook chain for subsequent plugins to prevent cascading errors.
    *   A global error notification might be shown in the admin UI if an error occurs in the admin context.

---

### 4. Plugin Management in Admin UI

The admin panel provides an interface for managing plugins:

*   **Viewing Installed Plugins:**
    *   A dedicated "Plugins" section in the admin UI lists all plugins discovered and validated by `plugin-loader.js` (from plugins stored in `db.js` that would be published).
    *   Displays plugin metadata: `name`, `version`, `description`, `author`.
*   **Enabling/Disabling Plugins:**
    *   Each plugin has a toggle switch or button to enable or disable it.
    *   This status is saved to `db.js` (e.g., in a settings object like `{ 'plugin-name': { enabled: true } }`).
    *   `plugin-loader.js` respects this status:
        *   Disabled plugins are not imported, or if imported, their hooks are not registered with the dispatcher.
        *   Enabling/disabling typically requires a page reload or a re-initialization of the plugin system to take effect.
*   **Adding New Plugins ("Upload"):**
    *   An "Add New" or "Upload Plugin" button allows administrators to upload a `.js` file for a new plugin.
    *   The admin interface reads the content of the selected JavaScript file.
    *   This file content is then saved into the client-side database, associated with its filename or derived plugin name.
    *   Upon saving, `plugin-loader.js` can attempt to load this new plugin.
    *   **Publishing Process:** When the site is published, all plugin files stored in the database that are marked as "active" or intended for publishing are retrieved and written as static `.js` files into the `/assets/js/plugins/` directory of the output site. This ensures they are available for the live site and for subsequent admin sessions without direct file system access.

---

### 5. Context Object (`context` / `adminContext`)

The `context` object passed to hook functions provides plugins with controlled access to CMS functionalities and data. Its content varies depending on the hook.

*   **Common Context Properties:**
    *   `config`: Access to site configuration (read-only). E.g., `context.config.getSiteName()`, `context.config.getThemeSettings()`.
    *   `db`: Simplified and scoped access to client-side database functions (primarily read-only for most hooks). For `registerDataStore`, it would be the actual DB instance. For others, it might be `context.db.get('collection', 'id')`.
    *   `utils`: Utility functions. E.g., `context.utils.notify(message, type)` (for admin UI), `context.utils.slugify(string)`, `context.utils.fetchWrapper()`.
    *   `logger`: A logging utility, e.g., `context.logger.info('Plugin action')`, `context.logger.error('Plugin error')`.
*   **`onRenderPage` Specific Context:**
    *   `renderLocation`: String, e.g., `'frontend'`, `'adminBuilderPreview'`, `'emailTemplate'`.
*   **`onAdminLoad` Specific Context (`adminContext`):**
    *   `ui`: Functions to interact with the admin UI, e.g., `adminContext.ui.addMenuItem({label, path, icon})`, `adminContext.ui.showModal(component)`, `adminContext.ui.createWidget(area, component)`.
    *   `router`: Functions to interact with the admin panel's client-side router, e.g., `adminContext.router.addRoute(path, component)`.
    *   `components`: Access to predefined UI components for building plugin interfaces within the admin panel.
*   **`onPublish` Specific Context:**
    *   `fileSystem`: Virtual methods to interact with the list of files to be published, e.g., `context.fileSystem.addFile(path, content)`, `context.fileSystem.readFile(path)`.

The exact structure of the context object will be refined during development to provide necessary capabilities securely.

---

### 6. Security Considerations

*   **Trusted Sources:** Plugins execute with full client-side privileges within the browser. Administrators should only install and enable plugins from trusted sources. A malicious plugin could compromise the admin session, manipulate site data, or attempt to exploit users visiting the site.
*   **No Server-Side Execution:** As this CMS is frontend-first, plugins primarily operate on the client-side. Any interaction with server-like capabilities (e.g., sending emails, accessing external APIs with sensitive keys) must be proxied through the Cloudflare Worker, which itself should enforce its own security and authentication for any actions initiated by plugins.
*   **Review and Moderation (Future):** For a potential future scenario where plugins might be shared or distributed through a central repository, a review or moderation process would be essential.

This plugin system aims to offer flexibility and extensibility while maintaining the CMS's core principles of client-side operation and static site generation.
