const Dexie = window.Dexie; // Assuming Dexie is loaded globally from CDN

const db = new Dexie('CMSGarden');

// Schema Definition
// Version 1
db.version(1).stores({
    settings: '&key', // Primary key is 'key' (must be unique string)
                      // Stores objects like: { key: 'adminSalt', value: '...' }
                      // Other examples: 'siteName', 'themeConfigJson', 'cloudflareWorkerUrl',
                      // 'lastBackupDate', 'backupIntervalDays', 'adminPasswordHash'
    content: '++id, type, slug, title, createdAt, updatedAt, *tags', // Auto-incrementing 'id'
                                                                  // Indexes on 'type', 'slug', 'tags' (multiEntry for array)
                                                                  // Example item: { type: 'page', slug: 'about-us', title: 'About Us', ... }
    plugins_data: '&name', // Primary key is 'name' (plugin's unique name)
                           // Stores objects like: { name: 'my-plugin', code: '...', enabled: true, settings: {...} }
});


// --- Settings CRUD Methods ---

/**
 * Retrieves a setting value by its key.
 * @param {string} key - The key of the setting to retrieve.
 * @returns {Promise<any|undefined>} The value of the setting, or undefined if not found.
 */
async function getSetting(key) {
    try {
        const setting = await db.settings.get(key);
        return setting ? setting.value : undefined;
    } catch (error) {
        console.error(`Error getting setting "${key}":`, error);
        return undefined;
    }
}

/**
 * Sets (adds or updates) a setting.
 * @param {string} key - The key of the setting.
 * @param {any} value - The value of the setting.
 * @returns {Promise<string|undefined>} The key of the saved item, or undefined on error.
 */
async function setSetting(key, value) {
    try {
        return await db.settings.put({ key, value });
    } catch (error) {
        console.error(`Error setting setting "${key}":`, error);
        return undefined;
    }
}

// --- Content CRUD Methods ---

/**
 * Adds a new content item (page, post, etc.).
 * @param {object} item - The content item to add. Must include 'type', 'slug', 'title'.
 *                        Should also include 'content', 'createdAt', 'updatedAt', 'meta'.
 * @returns {Promise<number|undefined>} The ID of the newly added item, or undefined on error.
 */
async function addContent(item) {
    if (!item.type || !item.slug || !item.title) {
        console.error("Content item must include type, slug, and title.");
        return undefined;
    }
    item.createdAt = item.createdAt || new Date().toISOString();
    item.updatedAt = item.updatedAt || new Date().toISOString();
    try {
        return await db.content.add(item);
    } catch (error) {
        console.error("Error adding content:", item, error);
        return undefined;
    }
}

/**
 * Retrieves a content item by its slug.
 * Note: Slugs should be unique per content type, ideally globally unique if not too complex.
 * This basic version assumes slugs are unique enough or type is also known.
 * @param {string} slug - The slug of the content item.
 * @returns {Promise<object|undefined>} The content item, or undefined if not found.
 */
async function getContentBySlug(slug) {
    try {
        return await db.content.where('slug').equals(slug).first();
    } catch (error) {
        console.error(`Error getting content by slug "${slug}":`, error);
        return undefined;
    }
}

/**
 * Retrieves a content item by its ID.
 * @param {number} id - The ID of the content item.
 * @returns {Promise<object|undefined>} The content item, or undefined if not found.
 */
async function getContentById(id) {
    try {
        return await db.content.get(id);
    } catch (error) {
        console.error(`Error getting content by ID "${id}":`, error);
        return undefined;
    }
}

/**
 * Updates an existing content item.
 * @param {number} id - The ID of the content item to update.
 * @param {object} updates - An object containing the fields to update.
 * @returns {Promise<number|undefined>} The number of updated items (0 or 1), or undefined on error.
 */
async function updateContent(id, updates) {
    updates.updatedAt = new Date().toISOString();
    try {
        return await db.content.update(id, updates);
    } catch (error) {
        console.error(`Error updating content ID "${id}":`, updates, error);
        return undefined;
    }
}

/**
 * Deletes a content item by its ID.
 * @param {number} id - The ID of the content item to delete.
 * @returns {Promise<void>}
 */
async function deleteContent(id) {
    try {
        return await db.content.delete(id);
    } catch (error) {
        console.error(`Error deleting content ID "${id}":`, error);
    }
}

/**
 * Retrieves all content items of a specific type.
 * @param {string} type - The type of content to retrieve (e.g., 'page', 'post').
 * @returns {Promise<Array<object>>} An array of content items.
 */
async function getAllContentByType(type) {
    try {
        return await db.content.where('type').equals(type).toArray();
    } catch (error) {
        console.error(`Error getting all content of type "${type}":`, error);
        return [];
    }
}

// --- Plugin Data CRUD Methods ---

/**
 * Retrieves data for a specific plugin.
 * @param {string} pluginName - The unique name of the plugin.
 * @returns {Promise<object|undefined>} Plugin data { name, code, enabled, settings }, or undefined.
 */
async function getPluginData(pluginName) {
    try {
        return await db.plugins_data.get(pluginName);
    } catch (error) {
        console.error(`Error getting plugin data for "${pluginName}":`, error);
        return undefined;
    }
}

/**
 * Sets (adds or updates) data for a specific plugin.
 * @param {string} pluginName - The unique name of the plugin.
 * @param {object} data - The data to store (e.g., { code: '...', enabled: true, settings: {...} }).
 * @returns {Promise<string|undefined>} The plugin name, or undefined on error.
 */
async function setPluginData(pluginName, data) {
    const item = { name: pluginName, ...data };
    try {
        return await db.plugins_data.put(item);
    } catch (error) {
        console.error(`Error setting plugin data for "${pluginName}":`, error);
        return undefined;
    }
}

/**
 * Retrieves all stored plugin data.
 * @returns {Promise<Array<object>>} An array of all plugin data objects.
 */
async function getAllPluginsData() {
    try {
        return await db.plugins_data.toArray();
    } catch (error) {
        console.error("Error getting all plugins data:", error);
        return [];
    }
}


// Open the database
db.open().then(() => {
    console.log("CMSGarden DB opened successfully.");
}).catch (function (err) {
    console.error("Failed to open CMSGarden DB: " + (err.stack || err));
});

// Export the db instance and methods
export {
    db, // Exporting the Dexie instance itself can be useful for advanced direct operations
    getSetting,
    setSetting,
    addContent,
    getContentBySlug,
    getContentById,
    updateContent,
    deleteContent,
    getAllContentByType,
    getPluginData,
    setPluginData,
    getAllPluginsData
};
