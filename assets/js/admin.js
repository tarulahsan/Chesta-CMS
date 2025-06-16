// Ensure Preact and Navigo are loaded (from CDN in this case)
const { h, render, Component, createContext } = preact;
const { useEffect, useState, useCallback } = preactHooks;
const Navigo = window.Navigo;

// Import DB functions
import { db, getSetting, setSetting, addContent, getContentById, updateContent, deleteContent, getAllContentByType } from './db.js';

// --- Constants ---
const SESSION_KEY = 'cms_auth_session';
const INITIAL_SETUP_COMPLETE_KEY = 'initialSetupComplete';
const THEME_CONFIG_KEY = 'themeConfig'; // For storing theme settings

// --- WebCrypto Helper Functions ---
async function generateSalt() {
    return crypto.getRandomValues(new Uint8Array(16));
}

async function hashPassword(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
    );
    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 150000,
            hash: "SHA-256",
        },
        keyMaterial,
        256
    );
    return Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function saltToHex(salt) {
    return Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToSalt(hex) {
    if (!hex) return null;
    return Uint8Array.from(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

// --- Helper function for active link class ---
function isActive(currentPath, targetPath, isExact = true) {
    const normalizedCurrentPath = currentPath === '' ? '/' : currentPath;
    if (isExact) {
        return normalizedCurrentPath === targetPath ? 'active' : '';
    }
    return normalizedCurrentPath.startsWith(targetPath) ? 'active' : '';
}

// --- Login Component ---
class Login extends Component {
    constructor(props) {
        super(props);
        this.state = { password: '', error: null, isLoading: false, isFirstTime: false };
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handleInput = this.handleInput.bind(this);
    }

    async componentDidMount() {
        const storedHash = await getSetting('adminPasswordHash');
        if (!storedHash) {
            this.setState({ isFirstTime: true });
        }
    }

    handleInput(e) {
        this.setState({ password: e.target.value, error: null });
    }

    async handleSubmit(e) {
        e.preventDefault();
        this.setState({ isLoading: true, error: null });
        const enteredPassword = this.state.password;

        try {
            let storedHash = await getSetting('adminPasswordHash');
            let saltHex = await getSetting('adminSalt');
            let salt = hexToSalt(saltHex);

            if (!storedHash || !salt) {
                this.setState({ isFirstTime: true });
                salt = await generateSalt();
                const newHash = await hashPassword(enteredPassword, salt);

                await setSetting('adminSalt', saltToHex(salt));
                await setSetting('adminPasswordHash', newHash);
                this.props.onLoginSuccess(true);
            } else {
                const enteredHash = await hashPassword(enteredPassword, salt);
                if (enteredHash === storedHash) {
                    this.props.onLoginSuccess(false);
                } else {
                    this.setState({ error: 'Invalid password.', isLoading: false });
                }
            }
        } catch (err) {
            console.error("Error during login:", err);
            this.setState({ error: 'An error occurred. Please try again.', isLoading: false });
        }
    }

    render(_, { password, error, isLoading, isFirstTime }) {
        return h('div', { class: 'login-container' },
            h('form', { class: 'login-form glassmorphic', onSubmit: this.handleSubmit },
                h('h1', { class: 'login-title' }, isFirstTime ? 'Set Admin Password' : 'CMS Login'),
                error && h('p', { class: 'login-error' }, error),
                h('input', {
                    type: 'password',
                    placeholder: isFirstTime ? 'Choose a strong password' : 'Enter Password',
                    value: password,
                    onInput: this.handleInput,
                    class: 'login-input',
                    disabled: isLoading,
                    autocomplete: isFirstTime ? "new-password" : "current-password"
                }),
                h('button', { type: 'submit', class: 'login-button button-primary', disabled: isLoading },
                    isLoading ? 'Processing...' : (isFirstTime ? 'Save Password & Continue' : 'Login')
                )
            )
        );
    }
}

// --- SetupWizard Component ---
class SetupWizard extends Component {
    constructor(props) {
        super(props);
        this.state = {
            siteName: '', adminEmail: '', cloudflareWorkerUrl: '',
            cfAccountId: '', cfKvVisitorDataId: '', cfKvAnalyticsId: '',
            error: null, isLoading: false,
        };
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handleInput = this.handleInput.bind(this);
    }

    handleInput(e) { this.setState({ [e.target.name]: e.target.value, error: null }); }

    async handleSubmit(e) {
        e.preventDefault();
        this.setState({ isLoading: true, error: null });
        const { siteName, adminEmail, cloudflareWorkerUrl, cfKvVisitorDataId, cfKvAnalyticsId, cfAccountId } = this.state;

        if (!siteName || !adminEmail || !cloudflareWorkerUrl || !cfKvVisitorDataId || !cfKvAnalyticsId) {
            this.setState({ error: 'Please fill in all required fields (*).', isLoading: false });
            return;
        }
        if (!/^\S+@\S+\.\S+$/.test(adminEmail)) {
             this.setState({ error: 'Please enter a valid email address.', isLoading: false });
            return;
        }
        try {
            await setSetting('siteName', siteName);
            await setSetting('adminEmail', adminEmail);
            await setSetting('cloudflareWorkerUrl', cloudflareWorkerUrl);
            if (cfAccountId) await setSetting('cloudflareAccountId', cfAccountId);
            await setSetting('cloudflareKvVisitorDataId', cfKvVisitorDataId);
            await setSetting('cloudflareKvAnalyticsId', cfKvAnalyticsId);

            await setSetting(INITIAL_SETUP_COMPLETE_KEY, true);
            this.props.onSetupComplete();
        } catch (err) {
            console.error("Error saving setup settings:", err);
            this.setState({ error: 'Failed to save settings. Please try again.', isLoading: false });
        }
    }

    render(_, { siteName, adminEmail, cloudflareWorkerUrl, cfAccountId, cfKvVisitorDataId, cfKvAnalyticsId, error, isLoading }) {
        return h('div', { class: 'setup-wizard-container' },
            h('div', { class: 'setup-wizard-card glassmorphic' },
                h('h1', { class: 'wizard-title' }, 'Initial CMS Setup'),
                h('p', { class: 'wizard-subtitle'}, 'Welcome! Configure your CMS with essential details.'),
                error && h('p', { class: 'wizard-error login-error' }, error),
                h('form', { onSubmit: this.handleSubmit },
                    h('div', { class: 'form-group' }, h('label', { for: 'siteName' }, 'Site Name *'), h('input', { type: 'text', name: 'siteName', id: 'siteName', value: siteName, onInput: this.handleInput, required: true })),
                    h('div', { class: 'form-group' }, h('label', { for: 'adminEmail' }, 'Admin Email (for notifications) *'), h('input', { type: 'email', name: 'adminEmail', id: 'adminEmail', value: adminEmail, onInput: this.handleInput, required: true })),
                    h('div', { class: 'form-group' }, h('label', { for: 'cloudflareWorkerUrl' }, 'Cloudflare Worker URL *'), h('input', { type: 'url', name: 'cloudflareWorkerUrl', id: 'cloudflareWorkerUrl', placeholder: 'https://your-worker.username.workers.dev', value: cloudflareWorkerUrl, onInput: this.handleInput, required: true })),
                    h('div', { class: 'form-group' }, h('label', { for: 'cfKvVisitorDataId' }, 'Cloudflare KV Namespace ID (Visitor Data) *'), h('input', { type: 'text', name: 'cfKvVisitorDataId', id: 'cfKvVisitorDataId', value: cfKvVisitorDataId, onInput: this.handleInput, required: true })),
                    h('div', { class: 'form-group' }, h('label', { for: 'cfKvAnalyticsId' }, 'Cloudflare KV Namespace ID (Analytics) *'), h('input', { type: 'text', name: 'cfKvAnalyticsId', id: 'cfKvAnalyticsId', value: cfKvAnalyticsId, onInput: this.handleInput, required: true })),
                    h('div', { class: 'form-group' }, h('label', { for: 'cfAccountId' }, 'Cloudflare Account ID (Optional)'), h('input', { type: 'text', name: 'cfAccountId', id: 'cfAccountId', value: cfAccountId, onInput: this.handleInput })),
                    h('p', {class: 'wizard-note'}, 'Deploy your Cloudflare Worker & configure its secrets/KV bindings in Cloudflare dashboard.'),
                    h('button', { type: 'submit', class: 'wizard-button button-primary', disabled: isLoading }, isLoading ? 'Saving...' : 'Complete Setup')
                )
            )
        );
    }
}

// --- Header Component ---
class Header extends Component {
    render({ onLogout }) {
        return h('header', { class: 'admin-header' },
            h('div', { class: 'logo' }, 'CMS Admin'),
            h('button', { class: 'logout-button', onClick: onLogout }, 'Logout')
        );
    }
}

// --- Sidebar Component ---
class Sidebar extends Component {
    render({ router, currentPath }) {
        const navItems = [
            { name: 'Dashboard', path: '/' },
            { name: 'Pages', path: '/pages' },
            { name: 'Posts', path: '/posts' },
            { name: 'Themes', path: '/themes' },
            { name: 'Plugins', path: '/plugins' },
            { name: 'Analytics', path: '/analytics' },
            { name: 'Backup', path: '/backup' },
            { name: 'Settings', path: '/settings' },
        ];

        const navigoCurrentPath = currentPath === '' ? '/' : currentPath;

        return h('aside', { class: 'admin-sidebar glassmorphic' },
            h('nav', {},
                navItems.map(item =>
                    h('a', {
                        href: router.generate(item.path),
                        class: isActive(navigoCurrentPath, item.path, item.path === '/'),
                        onClick: (e) => {
                            e.preventDefault();
                            router.navigate(item.path);
                        }
                    }, item.name)
                )
            )
        );
    }
}

// --- ContentArea Component ---
class ContentArea extends Component {
    render({ currentView, params, router }) {
        let viewComponent;
        switch (currentView) {
            case 'Pages': viewComponent = h(ContentListPage, { contentType: 'page', router }); break;
            case 'Posts': viewComponent = h(ContentListPage, { contentType: 'post', router }); break;
            case 'NewPage': viewComponent = h(ContentEditorPage, { contentType: 'page', router }); break;
            case 'EditPage': viewComponent = h(ContentEditorPage, { contentType: 'page', contentId: params.id, router }); break;
            case 'NewPost': viewComponent = h(ContentEditorPage, { contentType: 'post', router }); break;
            case 'EditPost': viewComponent = h(ContentEditorPage, { contentType: 'post', contentId: params.id, router }); break;
            case 'Themes': viewComponent = h(ThemeBuilderPage, { router }); break;
            case 'Plugins':
            case 'Settings':
            case 'Analytics':
            case 'Backup':
            case 'Not Found':
                viewComponent = h('h1', {}, `${currentView} Page`); break;
            default: viewComponent = h('h1', {}, 'Dashboard Page');
        }
        return h('main', { class: 'admin-content-area' }, viewComponent);
    }
}

// --- ContentListPage Component ---
function ContentListPage({ contentType, router }) {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchItems = useCallback(async () => {
        setIsLoading(true);
        const contentItems = await getAllContentByType(contentType);
        setItems(contentItems || []);
        setIsLoading(false);
    }, [contentType]);

    useEffect(() => { fetchItems(); }, [fetchItems]);

    const handleDelete = async (id) => {
        if (confirm(`Are you sure you want to delete this ${contentType}?`)) {
            await deleteContent(id);
            fetchItems();
        }
    };
    const title = contentType.charAt(0).toUpperCase() + contentType.slice(1) + 's';

    return h('div', { class: 'content-list-page' },
        h('div', { class: 'content-list-header' },
            h('h1', {}, title),
            h('button', { class: 'button-primary', onClick: () => router.navigate(`/${contentType}s/new`) }, `Create New ${contentType}`)
        ),
        isLoading ? h('p', {}, 'Loading content...') :
        items.length === 0 ? h('p', { class: 'no-content-message glassmorphic' }, `No ${contentType}s found. Create one!`) :
            h('ul', { class: 'content-item-list' },
                items.map(item =>
                    h('li', { key: item.id, class: 'content-item card' },
                        h('span', {class: 'content-item-title'}, item.title),
                        h('div', { class: 'content-item-actions' },
                            h('button', { class: 'button-edit', onClick: () => router.navigate(`/${contentType}s/edit/${item.id}`) }, 'Edit'),
                            h('button', { class: 'button-delete', onClick: () => handleDelete(item.id) }, 'Delete')
                        )
                    )
                )
            )
    );
}

// --- ContentEditorPage Component ---
function ContentEditorPage({ contentType, contentId, router }) {
    const [title, setTitle] = useState('');
    const [slug, setSlug] = useState('');
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const isEditing = contentId != null;

    const generateSlug = (titleStr) => titleStr.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');

    useEffect(() => {
        if (isEditing) {
            setIsLoading(true);
            getContentById(Number(contentId)).then(item => {
                if (item) {
                    setTitle(item.title); setSlug(item.slug); setContent(item.content);
                } else { setError(`Content item with ID ${contentId} not found.`); }
                setIsLoading(false);
            });
        }
    }, [contentId, isEditing]);

    const handleTitleChange = (e) => {
        const newTitle = e.target.value; setTitle(newTitle);
        if (!isEditing || slug === generateSlug(title)) { setSlug(generateSlug(newTitle));}
    };
    const handleSlugChange = (e) => setSlug(e.target.value);
    const handleContentChange = (e) => setContent(e.target.value);

    const handleSubmit = async (e) => {
        e.preventDefault(); setIsLoading(true); setError(null);
        if (!title || !slug || !content) {
            setError('Title, Slug, and Content are required.'); setIsLoading(false); return;
        }
        const itemData = { type: contentType, title, slug, content };
        try {
            if (isEditing) { await updateContent(Number(contentId), itemData); }
            else { await addContent(itemData); }
            router.navigate(`/${contentType}s`);
        } catch (err) {
            console.error('Error saving content:', err); setError('Failed to save content.'); setIsLoading(false);
        }
    };

    if (isLoading && isEditing) return h('p', {}, 'Loading editor...');
    if (error && isEditing && !title) return h('p', {class: 'login-error'}, error);

    return h('div', { class: 'content-editor-page' },
        h('h1', {}, isEditing ? `Edit ${contentType}` : `Create New ${contentType}`),
        error && h('p', { class: 'login-error' }, error),
        h('form', { onSubmit: handleSubmit, class: 'editor-form' },
            h('div', { class: 'form-group' }, h('label', { for: 'title' }, 'Title'), h('input', { type: 'text', id: 'title', value: title, onInput: handleTitleChange, required: true })),
            h('div', { class: 'form-group' }, h('label', { for: 'slug' }, 'Slug'), h('input', { type: 'text', id: 'slug', value: slug, onInput: handleSlugChange, required: true })),
            h('div', { class: 'form-group' }, h('label', { for: 'content' }, 'Content (Markdown or HTML)'), h('textarea', { id: 'content', value: content, onInput: handleContentChange, rows: 15, required: true })),
            h('button', { type: 'submit', class: 'button-primary', disabled: isLoading }, isLoading ? 'Saving...' : 'Save')
        )
    );
}

// --- ThemeBuilderPage Component ---
function ThemeBuilderPage({ router }) {
    const [primaryColor, setPrimaryColor] = useState('#8A2BE2'); // Default: BlueViolet
    const [baseFont, setBaseFont] = useState('Roboto');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');

    const availableFonts = ["Roboto", "Open Sans", "Nunito Sans", "Georgia", "Times New Roman", "Arial"];

    // Load settings on mount
    useEffect(() => {
        setIsLoading(true);
        getSetting(THEME_CONFIG_KEY).then(config => {
            if (config) {
                setPrimaryColor(config.primaryColor || '#8A2BE2');
                setBaseFont(config.baseFont || 'Roboto');
            }
            setIsLoading(false);
        }).catch(err => {
            console.error("Error loading theme config:", err);
            setIsLoading(false);
            setMessage('Error loading theme settings.');
        });
    }, []);

    const handleSaveTheme = async () => {
        setIsLoading(true);
        setMessage('');
        const newConfig = { primaryColor, baseFont };
        try {
            await setSetting(THEME_CONFIG_KEY, newConfig);
            setMessage('Theme settings saved successfully!');
            // Optionally, apply styles dynamically to the admin panel itself or preview
            document.documentElement.style.setProperty('--color-primary-gradient-start', primaryColor); // Example update
        } catch (err) {
            console.error("Error saving theme config:", err);
            setMessage('Error saving theme settings.');
        }
        setIsLoading(false);
        setTimeout(() => setMessage(''), 3000); // Clear message after 3s
    };

    return h('div', { class: 'theme-builder-page' },
        h('h1', {}, 'Theme Builder'),
        message && h('p', { class: `theme-builder-message ${message.startsWith('Error') ? 'login-error' : 'success-message'}` }, message),
        h('div', { class: 'theme-builder-layout' },
            h('div', { class: 'theme-controls-panel glassmorphic' },
                h('h2', {}, 'Customize Theme'),
                h('div', { class: 'form-group' },
                    h('label', { for: 'primaryColor' }, 'Primary Accent Color'),
                    h('input', { type: 'color', id: 'primaryColor', name: 'primaryColor', value: primaryColor, onInput: (e) => setPrimaryColor(e.target.value) })
                ),
                h('div', { class: 'form-group' },
                    h('label', { for: 'baseFont' }, 'Base Font Family'),
                    h('select', { id: 'baseFont', name: 'baseFont', value: baseFont, onChange: (e) => setBaseFont(e.target.value) },
                        availableFonts.map(font => h('option', { value: font }, font))
                    )
                ),
                h('div', { class: 'theme-control-preview' },
                    h('p', {}, 'Live Preview:'),
                    h('div', { style: `color: ${primaryColor}; font-family: '${baseFont}', sans-serif; border: 1px solid ${primaryColor}; padding: 10px; margin-top: 5px; border-radius: 5px;` },
                        'Sample text with selected styles.'
                    )
                ),
                h('button', { class: 'button-primary', onClick: handleSaveTheme, disabled: isLoading, style: {marginTop: '20px'} },
                    isLoading ? 'Saving...' : 'Save Theme Settings'
                )
            ),
            h('div', { class: 'theme-preview-area glassmorphic' },
                h('h3', {}, 'Site Preview Area'),
                h('p', {}, '(Live preview of the actual site will be rendered here in a future update)')
                // Example usage of theme variables (conceptual)
                // h('div', { style: `background: var(--color-primary-gradient); color: var(--color-text-on-primary); padding: 20px;`},
                //     `This box uses the primary gradient defined by ${primaryColor}`
                // )
            )
        )
    );
}


// --- Layout Component ---
class Layout extends Component {
    render(props) {
        return h('div', { class: 'admin-layout' },
            props.children
        );
    }
}

// --- Main App Component ---
class App extends Component {
    constructor() {
        super();
        const base = '/admin';
        this.router = new Navigo(base, { hash: true });

        this.state = {
            isAuthenticated: false,
            needsSetup: false,
            currentPath: this.router.getCurrentLocation()?.url || '/',
            currentView: 'Dashboard',
            routeParams: {},
            dbReady: false
        };

        this.updateRouteView = this.updateRouteView.bind(this);
        this.handleLoginSuccess = this.handleLoginSuccess.bind(this);
        this.handleLogout = this.handleLogout.bind(this);
        this.checkInitialAppState = this.checkInitialAppState.bind(this);
        this.handleSetupComplete = this.handleSetupComplete.bind(this);
    }

    async checkInitialAppState() {
        const sessionActive = localStorage.getItem(SESSION_KEY) === 'true';
        const adminPassHashSet = await getSetting('adminPasswordHash');
        const setupComplete = await getSetting(INITIAL_SETUP_COMPLETE_KEY) === true;

        if (sessionActive && adminPassHashSet) {
            this.setState({ isAuthenticated: true });
            if (!setupComplete) {
                this.setState({ needsSetup: true, currentView: 'SetupWizard' });
            } else {
                this.setState({ needsSetup: false });
            }
        } else {
            localStorage.removeItem(SESSION_KEY);
            this.setState({ isAuthenticated: false, needsSetup: false });
        }
        this.setState({ dbReady: true });

        this.router.resolve();
    }

    async handleLoginSuccess(isFirstTimePasswordSet) {
        localStorage.setItem(SESSION_KEY, 'true');
        this.setState({ isAuthenticated: true });

        const setupComplete = await getSetting(INITIAL_SETUP_COMPLETE_KEY) === true;
        if (!setupComplete) {
            this.setState({ needsSetup: true, currentView: 'SetupWizard' });
        } else {
            this.setState({ needsSetup: false, currentView: 'Dashboard' }); // Ensure view is set
            this.router.navigate('/');
        }
    }

    handleSetupComplete() {
        this.setState({ needsSetup: false, currentView: 'Dashboard' });
        this.router.navigate('/');
    }

    handleLogout() {
        localStorage.removeItem(SESSION_KEY);
        this.setState({ isAuthenticated: false, needsSetup: false, currentView: 'Login' });
        this.router.navigate('/');
    }

    updateRouteView(viewName, params = {}) {
        this.setState({
            currentPath: this.router.getCurrentLocation().url || '/',
            currentView: viewName,
            routeParams: params
        });
    }

    componentDidMount() {
        db.open().then(async () => {
            console.log("DB opened in App, proceeding with initial app state check.");
            await this.checkInitialAppState();

            this.router
                .on({
                    '/': () => this.updateRouteView('Dashboard'),
                    '/pages': () => this.updateRouteView('Pages'),
                    '/pages/new': () => this.updateRouteView('NewPage'),
                    '/pages/edit/:id': (params) => this.updateRouteView('EditPage', params.data),
                    '/posts': () => this.updateRouteView('Posts'),
                    '/posts/new': () => this.updateRouteView('NewPost'),
                    '/posts/edit/:id': (params) => this.updateRouteView('EditPost', params.data),
                    '/themes': () => this.updateRouteView('Themes'),
                    '/plugins': () => this.updateRouteView('Plugins'),
                    '/settings': () => this.updateRouteView('Settings'),
                    '/analytics': () => this.updateRouteView('Analytics'),
                    '/backup': () => this.updateRouteView('Backup'),
                })
                .hooks({
                    after: (match) => {
                         this.setState({ currentPath: match.url || '/' });
                    }
                })
                .notFound(() => this.updateRouteView('Not Found'))
                .resolve();
        }).catch(err => {
            console.error("Failed to open DB in App:", err);
            this.setState({ dbReady: true, isAuthenticated: false, needsSetup: false, currentView: 'Login' });
        });
    }

    componentWillUnmount() {
        this.router.destroy();
    }

    render(_, { isAuthenticated, currentView, routeParams, currentPath, dbReady, needsSetup }) {
        if (!dbReady) {
            return h('div', { class: 'loading-container centered-container' }, h('p', {}, 'Initializing Database...'));
        }

        if (!isAuthenticated) {
            return h(Login, { onLoginSuccess: this.handleLoginSuccess });
        }

        if (needsSetup) {
            return h(SetupWizard, { onSetupComplete: this.handleSetupComplete });
        }

        return h(Layout, {},
            h(Header, { onLogout: this.handleLogout }),
            h('div', { class: 'main-container' },
                h(Sidebar, { router: this.router, currentPath: currentPath }),
                h(ContentArea, { currentView: currentView, params: routeParams, router: this.router })
            )
        );
    }
}

// --- Render the App ---
const appRoot = document.getElementById('admin-app');
if (appRoot) {
    render(h(App), appRoot);
    console.log("Admin SPA Initialized with Preact, Navigo, Dexie (db.js). Theme Builder placeholder added.");
} else {
    console.error("Admin app root element (#admin-app) not found.");
}
