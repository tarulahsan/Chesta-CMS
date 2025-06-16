// Ensure Preact and Navigo are loaded (from CDN in this case)
const { h, render, Component, createRef } = preact;
const { useEffect, useState, useCallback, useMemo } = preactHooks;
const Navigo = window.Navigo;
const Sortable = window.Sortable;

// Import DB functions
import { db, getSetting, setSetting, addContent, getContentById, updateContent, deleteContent, getAllContentByType } from './db.js';

// --- Constants ---
const SESSION_KEY = 'cms_auth_session';
const INITIAL_SETUP_COMPLETE_KEY = 'initialSetupComplete';
const THEME_CONFIG_KEY = 'themeConfig';

// --- WebCrypto Helper Functions ---
async function generateSalt() { return crypto.getRandomValues(new Uint8Array(16)); }
async function hashPassword(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]);
    const derivedBits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt, iterations: 150000, hash: "SHA-256" }, keyMaterial, 256);
    return Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function saltToHex(salt) { return Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''); }
function hexToSalt(hex) { if (!hex) return null; return Uint8Array.from(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))); }

// --- Helper function for active link class ---
function isActive(currentPath, targetPath, isExact = true) {
    const normalizedCurrentPath = currentPath === '' ? '/' : currentPath;
    if (isExact) { return normalizedCurrentPath === targetPath ? 'active' : ''; }
    return normalizedCurrentPath.startsWith(targetPath) ? 'active' : '';
}

// --- Login Component ---
class Login extends Component { /* ... (existing Login component code - unchanged) ... */
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
class SetupWizard extends Component { /* ... (existing SetupWizard component code - unchanged) ... */
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
class Header extends Component { /* ... (existing Header component code - unchanged) ... */
    render({ onLogout }) {
        return h('header', { class: 'admin-header' },
            h('div', { class: 'logo' }, 'CMS Admin'),
            h('button', { class: 'logout-button', onClick: onLogout }, 'Logout')
        );
    }
}

// --- Sidebar Component ---
class Sidebar extends Component { /* ... (existing Sidebar component code - unchanged) ... */
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
class ContentArea extends Component { /* ... (existing ContentArea component code - unchanged) ... */
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
function ContentListPage({ contentType, router }) { /* ... (existing ContentListPage component code - unchanged) ... */
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
function ContentEditorPage({ contentType, contentId, router }) { /* ... (existing ContentEditorPage component code - unchanged) ... */
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
        } else {
            setTitle(''); setSlug(''); setContent(''); setIsLoading(false); setError(null);
        }
    }, [contentId, isEditing, contentType]);

    const handleTitleChange = (e) => {
        const newTitle = e.target.value; setTitle(newTitle);
        if (!isEditing || slug === generateSlug(title)) {
            setSlug(generateSlug(newTitle));
        }
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

// --- Section Preview Components ---
const HeroSectionPreview = ({ settings, globalStyles, currentViewport }) => {
    const responsiveSettings = settings.responsive || {};
    const viewportSettings = responsiveSettings[currentViewport] || {};
    if (viewportSettings.visible === false) return null;

    const style = {
        backgroundColor: settings.backgroundColor || 'var(--color-surface)',
        color: settings.textColor || globalStyles.palette?.textDark || 'inherit',
        padding: viewportSettings.padding || settings.defaultPadding || (settings.minHeight && settings.minHeight.includes('px') ? `${parseInt(settings.minHeight)/5}px 20px` : '60px 20px'),
        textAlign: settings.textAlignment || 'center',
        fontFamily: globalStyles.baseFontFamily || 'sans-serif',
        minHeight: settings.minHeight || '200px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        alignItems: settings.textAlignment === 'left' ? 'flex-start' : settings.textAlignment === 'right' ? 'flex-end' : 'center',
        backgroundImage: settings.backgroundImageUrl ? `url(${settings.backgroundImageUrl})` : 'none',
        backgroundSize: 'cover', backgroundPosition: 'center'
    };
    return h('div', { class: 'preview-section preview-hero', style },
        h('h1', { style: { margin: '0 0 10px 0', fontSize: '2em', color: settings.textColor || globalStyles.palette?.textLight || '#fff' } }, settings.title || 'Hero Title'),
        h('p', { style: { margin: '0 0 15px 0', fontSize: '1.1em', color: settings.textColor || globalStyles.palette?.textLight || '#fff' } }, settings.subtitle || 'Hero subtitle text.'),
        settings.buttonText && h('button', { class: 'button-primary', style: { backgroundColor: globalStyles.primaryColor, color: globalStyles.palette?.textOnPrimary || '#fff'} }, settings.buttonText)
    );
};
const TextBlockPreview = ({ settings, globalStyles, currentViewport }) => {
    const responsiveSettings = settings.responsive || {};
    const viewportSettings = responsiveSettings[currentViewport] || {};
    if (viewportSettings.visible === false) return null;

    const style = {
        backgroundColor: settings.backgroundColor || 'transparent',
        padding: viewportSettings.padding || settings.defaultPadding || '30px 20px',
        fontFamily: globalStyles.baseFontFamily || 'sans-serif',
        color: settings.textColor || globalStyles.palette?.textDark || 'inherit',
    };
    return h('div', { class: 'preview-section preview-text-block', style },
        settings.heading && h('h2', { style: { color: settings.headingColor || globalStyles.palette?.textDark || 'inherit' } }, settings.heading || 'Section Heading'),
        h('p', { style: { whiteSpace: 'pre-wrap'} }, settings.content || 'This is some default paragraph text. You can edit it.')
    );
};
const GalleryPreview = ({ settings, globalStyles, currentViewport }) => {
    const responsiveSettings = settings.responsive || {};
    const viewportSettings = responsiveSettings[currentViewport] || {};
    if (viewportSettings.visible === false) return null;

    const images = typeof settings.images === 'string' ? settings.images.split(',').map(s => s.trim()).filter(s => s) : (Array.isArray(settings.images) ? settings.images : []);
    const columns = viewportSettings.columns || settings.columns || 3; // Allow responsive columns
    const style = {
        display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: viewportSettings.gap || settings.gap || '10px', // Allow responsive gap
        padding: '20px', fontFamily: globalStyles.baseFontFamily || 'sans-serif'
    };
    return h('div', { class: 'preview-section preview-gallery', style },
        images.length > 0 ? images.map(imgUrl =>
            h('div', { class: 'gallery-image-container'},
                h('img', { src: imgUrl, alt: 'Gallery image', style: { width: '100%', height: 'auto', display: 'block', borderRadius: 'var(--border-radius-standard)' } })
            )
        ) : h('p', {}, 'No images added to gallery yet.')
    );
};

const sectionPreviewComponents = { hero: HeroSectionPreview, textBlock: TextBlockPreview, gallery: GalleryPreview };
const renderSectionPreview = (section, globalStyles, currentViewport) => {
    const PreviewComponent = sectionPreviewComponents[section.type];
    return PreviewComponent ? h(PreviewComponent, { settings: section, globalStyles, currentViewport }) : h('div', {}, `Unsupported section type: ${section.type}`);
};


// --- ThemeBuilderPage Component ---
function ThemeBuilderPage({ router }) {
    const [themeConfig, setThemeConfig] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [activePageLayout, setActivePageLayout] = useState('homepage');
    const [selectedSectionId, setSelectedSectionId] = useState(null);
    const [currentViewport, setCurrentViewport] = useState('desktop'); // desktop, tablet, mobile

    const paletteRef = createRef();
    const pageSectionsRef = createRef();
    const sortableInstances = useMemo(() => ({ palette: null, pageSections: null }), []);

    const defaultPalette = { /* ... (existing defaultPalette - unchanged) ... */
        brandPrimary: 'oklch(65% 0.25 330)',
        brandAccent: 'oklch(70% 0.22 250)',
        textDark: 'oklch(20% 0.02 270)',
        textLight: 'oklch(98% 0.005 270)',
        backgroundMain: 'oklch(98% 0.005 270)',
        surface: 'oklch(100% 0 0)',
    };
    const defaultThemeConfig = { /* ... (existing defaultThemeConfig - unchanged) ... */
        globalStyles: {
            primaryColor: defaultPalette.brandPrimary,
            baseFontFamily: "Roboto",
            headingFontFamily: "Nunito Sans",
            palette: { ...defaultPalette },
            fontSubsets: ["latin", "latin-ext"],
            customCss: ""
        },
        pages: {
            homepage: { name: "Homepage", sections: [] },
            defaultPost: { name: "Default Post", sections: [] }
        },
        predefinedSections: [
            { type: "hero", name: "Hero Section", description: "Large prominent section", defaultSettings: { title: "Welcome!", subtitle: "Amazing things await.", backgroundImageUrl: "", buttonText: "Learn More", buttonLink: "#", textColor: "#FFFFFF", textAlignment: "center", minHeight: "400px", backgroundColor: defaultPalette.brandAccent },
              fields: [{name: 'title', label: 'Title', type: 'text'}, {name: 'subtitle', label: 'Subtitle', type: 'textarea'}, {name: 'backgroundImageUrl', label: 'Background Image URL', type: 'text', inputType: 'url'}, {name: 'buttonText', label: 'Button Text', type: 'text'}, {name: 'buttonLink', label: 'Button Link', type: 'text', inputType: 'url'}, {name: 'textColor', label: 'Text Color', type: 'color'}, {name: 'backgroundColor', label: 'Background Color', type: 'color'}, {name: 'textAlignment', label: 'Text Alignment', type: 'select', options: ["left", "center", "right"]}, {name: 'minHeight', label: 'Min Height (e.g. 400px)', type: 'text'}]
            },
            { type: "textBlock", name: "Text Block", description: "Simple text block", defaultSettings: { heading: "About Us", content: "We are a dynamic team passionate about creating innovative solutions.", backgroundColor: "transparent", textColor: defaultPalette.textDark, headingColor: defaultPalette.textDark },
              fields: [{name: 'heading', label: 'Heading', type: 'text'}, {name: 'content', label: 'Content', type: 'textarea'}, {name: 'backgroundColor', label: 'Background Color', type: 'color'}, {name: 'textColor', label: 'Text Color', type: 'color'}, {name: 'headingColor', label: 'Heading Color', type: 'color'}]
            },
            { type: "gallery", name: "Image Gallery", description: "Grid of images", defaultSettings: { images: "https://picsum.photos/seed/cms1/300/200,https://picsum.photos/seed/cms2/300/200,https://picsum.photos/seed/cms3/300/200", columns: 3, gap: "10px" },
              fields: [{name: 'images', label: 'Images (URLs, comma-separated)', type: 'textarea'}, {name: 'columns', label: 'Columns (2-4)', type: 'select', options: [2,3,4]}, {name: 'gap', label: 'Gap (e.g. 10px)', type: 'text'}]
            }
        ]
    };
    const availableFonts = ["Roboto", "Open Sans", "Nunito Sans", "Lato", "Montserrat", "Georgia", "Times New Roman", "Arial"];
    const availableSubsets = ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "vietnamese"];

    useEffect(() => { /* ... (Load themeConfig - unchanged) ... */
        setIsLoading(true);
        getSetting(THEME_CONFIG_KEY).then(config => {
            const initialConfig = config ? {...defaultThemeConfig, ...config, globalStyles: {...defaultThemeConfig.globalStyles, ...(config.globalStyles || {}), palette: {...defaultThemeConfig.globalStyles.palette, ...(config.globalStyles?.palette || {})}}} : JSON.parse(JSON.stringify(defaultThemeConfig));
            if (!initialConfig.globalStyles.palette) initialConfig.globalStyles.palette = JSON.parse(JSON.stringify(defaultThemeConfig.globalStyles.palette));
            if (!initialConfig.globalStyles.fontSubsets) initialConfig.globalStyles.fontSubsets = [...defaultThemeConfig.globalStyles.fontSubsets];

            setThemeConfig(initialConfig);
            setIsLoading(false);
        }).catch(err => {
            console.error("Error loading theme config:", err);
            setThemeConfig(JSON.parse(JSON.stringify(defaultThemeConfig)));
            setIsLoading(false); setMessage('Error loading theme settings.');
        });
    }, []);
    useEffect(() => { /* ... (SortableJS init - unchanged) ... */
        if (isLoading || !themeConfig || !paletteRef.current || !pageSectionsRef.current) return;
        if (!sortableInstances.palette) {
            sortableInstances.palette = new Sortable(paletteRef.current, {
                group: { name: 'sectionsGroup', pull: 'clone', put: false }, sort: false, animation: 150,
                ghostClass: 'sortable-ghost-palette', chosenClass: 'sortable-chosen-palette',
            });
        }
        if (!sortableInstances.pageSections) {
            sortableInstances.pageSections = new Sortable(pageSectionsRef.current, {
                group: 'sectionsGroup', animation: 150, handle: '.drag-handle',
                ghostClass: 'sortable-ghost-section', chosenClass: 'sortable-chosen-section',
                onAdd: (evt) => {
                    const itemEl = evt.item;
                    const sectionType = itemEl.dataset.sectionType;
                    itemEl.parentNode.removeChild(itemEl);

                    const predefinedSection = themeConfig.predefinedSections.find(s => s.type === sectionType);
                    if (!predefinedSection) return;

                    const newSection = {
                        id: `sec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        type: predefinedSection.type,
                        settings: JSON.parse(JSON.stringify(predefinedSection.defaultSettings)),
                        responsive: { desktop: {visible:true}, tablet: {visible:true}, mobile: {visible:true} } // Default visibility
                    };

                    const currentPageKey = activePageLayout;
                    setThemeConfig(prev => {
                        const newPages = { ...prev.pages };
                        const currentSections = newPages[currentPageKey]?.sections || [];
                        const newSectionsArray = [...currentSections];
                        newSectionsArray.splice(evt.newDraggableIndex, 0, newSection);
                        newPages[currentPageKey] = { ...(newPages[currentPageKey] || {name: currentPageKey, sections:[]}), sections: newSectionsArray };
                        return { ...prev, pages: newPages };
                    });
                },
                onEnd: (evt) => {
                    if (evt.from === evt.to && evt.oldDraggableIndex !== evt.newDraggableIndex) {
                        const currentPageKey = activePageLayout;
                        setThemeConfig(prev => {
                            const newPages = { ...prev.pages };
                            const currentSections = newPages[currentPageKey]?.sections || [];
                            const newSectionsArray = [...currentSections];
                            const [movedItem] = newSectionsArray.splice(evt.oldDraggableIndex, 1);
                            newSectionsArray.splice(evt.newDraggableIndex, 0, movedItem);
                            newPages[currentPageKey] = { ...(newPages[currentPageKey] || {name: currentPageKey, sections:[]}), sections: newSectionsArray };
                            return { ...prev, pages: newPages };
                        });
                    }
                }
            });
        }
    }, [isLoading, themeConfig, activePageLayout, sortableInstances, paletteRef, pageSectionsRef]);

    const handleGlobalStyleChange = (key, value) => { /* ... (unchanged) ... */ setThemeConfig(prev => ({ ...prev, globalStyles: { ...prev.globalStyles, [key]: value } })); };
    const handlePaletteColorChange = (colorName, oklchValue) => { /* ... (unchanged) ... */ setThemeConfig(prev => { const newPalette = { ...prev.globalStyles.palette, [colorName]: oklchValue }; return { ...prev, globalStyles: { ...prev.globalStyles, palette: newPalette } }; }); };
    const handleFontSubsetChange = (subset, isChecked) => { /* ... (unchanged) ... */ setThemeConfig(prev => { const currentSubsets = prev.globalStyles.fontSubsets || []; let newSubsets; if (isChecked) { newSubsets = [...currentSubsets, subset]; } else { newSubsets = currentSubsets.filter(s => s !== subset); } return { ...prev, globalStyles: { ...prev.globalStyles, fontSubsets: newSubsets } }; }); };

    const handleSectionSettingChange = (fieldName, newValue) => { /* ... (unchanged) ... */
        if (!selectedSectionId) return;
        setThemeConfig(prev => {
            const newConfig = JSON.parse(JSON.stringify(prev));
            const pageKey = activePageLayout;
            const sectionIndex = newConfig.pages[pageKey].sections.findIndex(s => s.id === selectedSectionId);
            if (sectionIndex > -1) {
                newConfig.pages[pageKey].sections[sectionIndex].settings[fieldName] = newValue;
            }
            return newConfig;
        });
    };

    const handleResponsiveSettingChange = (viewport, settingName, newValue) => {
        if (!selectedSectionId) return;
        setThemeConfig(prev => {
            const newConfig = JSON.parse(JSON.stringify(prev)); // Deep clone for immutability
            const pageKey = activePageLayout;
            const sectionIndex = newConfig.pages[pageKey].sections.findIndex(s => s.id === selectedSectionId);

            if (sectionIndex > -1) {
                if (!newConfig.pages[pageKey].sections[sectionIndex].responsive) {
                    newConfig.pages[pageKey].sections[sectionIndex].responsive = {};
                }
                if (!newConfig.pages[pageKey].sections[sectionIndex].responsive[viewport]) {
                    newConfig.pages[pageKey].sections[sectionIndex].responsive[viewport] = {};
                }
                newConfig.pages[pageKey].sections[sectionIndex].responsive[viewport][settingName] = newValue;
            }
            return newConfig;
        });
    };

    const handleSaveTheme = async () => { /* ... (unchanged, but ensure dynamic style tag updates) ... */
        setIsLoading(true); setMessage('');
        try {
            await setSetting(THEME_CONFIG_KEY, themeConfig);
            setMessage('Theme settings saved successfully!');
            const dynamicStyleEl = document.getElementById('theme-builder-dynamic-styles');
            if (dynamicStyleEl) {
                dynamicStyleEl.innerHTML = generatePreviewGlobalStyles();
            }
        } catch (err) { console.error("Error saving theme config:", err); setMessage('Error saving theme settings.'); }
        setIsLoading(false);
        setTimeout(() => setMessage(''), 3000);
    };

    const generatePreviewGlobalStyles = () => { /* ... (unchanged) ... */
        if (!themeConfig || !themeConfig.globalStyles) return '';
        const gs = themeConfig.globalStyles;
        let paletteCssVars = '';
        if(gs.palette) {
            for (const [key, value] of Object.entries(gs.palette)) {
                paletteCssVars += `--preview-color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value};\n`;
            }
        }

        let googleFontUrl = '';
        const families = [];
        if (gs.baseFontFamily && !availableFonts.includes(gs.baseFontFamily)) families.push(gs.baseFontFamily);
        if (gs.headingFontFamily && gs.headingFontFamily !== gs.baseFontFamily && !availableFonts.includes(gs.headingFontFamily)) families.push(gs.headingFontFamily);

        if (families.length > 0) {
            googleFontUrl = `https://fonts.googleapis.com/css2?${families.map(f => `family=${f.replace(/\s/g, '+')}:wght@400;700`).join('&')}`;
            if (gs.fontSubsets && gs.fontSubsets.length > 0) {
                googleFontUrl += `&subset=${gs.fontSubsets.join(',')}`;
            }
            googleFontUrl += '&display=swap';
        }

        return `
        ${googleFontUrl ? `@import url('${googleFontUrl}');` : ''}
        .live-preview-area {
            ${paletteCssVars}
            font-family: '${gs.baseFontFamily || 'sans-serif'}', sans-serif;
            background-color: var(--preview-color-background-main, #fff);
            color: var(--preview-color-text-dark, #333);
        }
        .live-preview-area h1, .live-preview-area h2, .live-preview-area h3, .live-preview-area h4, .live-preview-area h5, .live-preview-area h6 {
            font-family: '${gs.headingFontFamily || gs.baseFontFamily || 'sans-serif'}', sans-serif;
            color: var(--preview-color-text-dark, #333);
        }
        .live-preview-area p { line-height: 1.7; margin-bottom: 1em; }
        .live-preview-area a { color: var(--preview-color-brand-primary, blue); }
        .live-preview-area .button-primary {
             background: var(--preview-color-brand-primary, blue);
             color: var(--preview-color-text-on-primary, white);
        }
        `;
    };

    if (isLoading || !themeConfig) return h('p', {class: 'centered-container'}, 'Loading Theme Builder...');

    const currentSections = themeConfig.pages[activePageLayout]?.sections || [];
    const selectedSectionData = selectedSectionId ? currentSections.find(s => s.id === selectedSectionId) : null;
    const selectedPredefinedSection = selectedSectionData ? themeConfig.predefinedSections.find(ps => ps.type === selectedSectionData.type) : null;

    const renderField = (field, section) => { /* ... (unchanged) ... */
        const value = section.settings[field.name] !== undefined ? section.settings[field.name] : (predefinedSection.defaultSettings && predefinedSection.defaultSettings[field.name] !== undefined ? predefinedSection.defaultSettings[field.name] : '');
        const inputId = `${field.name}-${section.id}`;
        const predefinedSection = themeConfig.predefinedSections.find(ps => ps.type === section.type);

        switch(field.type) {
            case 'text': return h('input', { type: field.inputType || 'text', id: inputId, value: value, onInput: (e) => handleSectionSettingChange(field.name, e.target.value), placeholder: field.placeholder || '' });
            case 'textarea': return h('textarea', { id: inputId, rows: 3, onInput: (e) => handleSectionSettingChange(field.name, e.target.value), placeholder: field.placeholder || '' }, value);
            case 'color': return h('input', { type: 'color', id: inputId, value: value, onInput: (e) => handleSectionSettingChange(field.name, e.target.value) });
            case 'select': return h('select', { id: inputId, value: value, onChange: (e) => handleSectionSettingChange(field.name, e.target.value) },
                (field.options || []).map(opt => h('option', { value: typeof opt === 'object' ? opt.value : opt }, typeof opt === 'object' ? opt.label : opt))
            );
            default: return h('input', { type: 'text', id: inputId, value: value, onInput: (e) => handleSectionSettingChange(field.name, e.target.value) });
        }
    };

    const gs = themeConfig.globalStyles;

    const viewportWidths = { desktop: '100%', tablet: '768px', mobile: '375px' };

    return h('div', { class: 'theme-builder-page' },
        h('div', {class: 'theme-builder-header'},
            h('h1', {}, 'Theme Builder'),
            h('div', {class: 'viewport-switcher'},
                ['desktop', 'tablet', 'mobile'].map(vp =>
                    h('button', {
                        class: `viewport-btn ${currentViewport === vp ? 'active' : ''}`,
                        onClick: () => setCurrentViewport(vp)
                    }, vp.charAt(0).toUpperCase() + vp.slice(1))
                )
            ),
            h('button', { class: 'button-primary', onClick: handleSaveTheme, disabled: isLoading }, isLoading ? 'Saving...' : 'Save Theme Settings')
        ),
        message && h('p', { class: `theme-builder-message ${message.startsWith('Error') ? 'login-error' : 'success-message'}` }, message),
        h('div', { class: 'theme-builder-layout' },
            h('aside', { class: 'theme-controls-panel glassmorphic' },
                // ... (Global Styles, Palette, Typography, Section Palette - existing JSX) ...
                h('div', {class: 'control-panel-segment'},
                    h('h2', {}, 'Global Styles'),
                    h('h3', {}, 'Color Palette (OKLCH)'),
                    Object.keys(gs.palette || defaultPalette).map(colorName =>
                        h('div', {class: 'form-group palette-editor-item'},
                            h('label', {for: `palette-${colorName}`}, colorName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())),
                            h('div', {class: 'palette-input-group'},
                                h('input', {type: 'text', id: `palette-${colorName}`, value: gs.palette[colorName], onInput: e => handlePaletteColorChange(colorName, e.target.value)}),
                                h('input', {type: 'color', value: oklchToHex(gs.palette[colorName]), onChange: e => handlePaletteColorChange(colorName, hexToOklch(e.target.value, gs.palette[colorName])) , title: "Visual helper, OKLCH is source of truth"}),
                                h('span', {class: 'color-swatch', style: { backgroundColor: gs.palette[colorName] }})
                            )
                        )
                    ),
                    h('hr'),
                    h('h3', {}, 'Typography'),
                    h('div', { class: 'form-group' }, h('label', { for: 'baseFontFamily' }, 'Base Font'), h('select', { id: 'baseFontFamily', value: gs.baseFontFamily, onChange: (e) => handleGlobalStyleChange('baseFontFamily', e.target.value) }, availableFonts.map(font => h('option', { value: font }, font)))),
                    h('div', { class: 'form-group' }, h('label', { for: 'headingFontFamily' }, 'Heading Font'), h('select', { id: 'headingFontFamily', value: gs.headingFontFamily, onChange: (e) => handleGlobalStyleChange('headingFontFamily', e.target.value) }, availableFonts.map(font => h('option', { value: font }, font)))),
                    h('div', { class: 'form-group' },
                        h('label', {}, 'Font Subsets (for Google Fonts)'),
                        h('div', {class: 'checkbox-group'}, availableSubsets.map(subset =>
                            h('label', {class: 'checkbox-label', key: subset},
                                h('input', {type: 'checkbox', value: subset, checked: (gs.fontSubsets || []).includes(subset), onChange: e => handleFontSubsetChange(subset, e.target.checked)}),
                                subset
                            )
                        ))
                    ),
                    h('div', { class: 'form-group' }, h('label', { for: 'customCss' }, 'Custom CSS'), h('textarea', { id: 'customCss', value: gs.customCss, rows:5, onInput: (e) => handleGlobalStyleChange('customCss', e.target.value) }))
                ),
                h('hr'),
                h('div', {class: 'control-panel-segment'},
                    h('h2', {}, 'Sections Palette'),
                    h('div', { id: 'section-palette', class: 'section-palette', ref: paletteRef },
                        themeConfig.predefinedSections.map(section => h('div', { class: 'palette-item card', 'data-section-type': section.type }, h('strong', {}, section.name), h('p', {class: 'palette-item-desc'}, section.description || '')))
                    )
                ),
                 h('hr'),
                h('div', {class: 'control-panel-segment section-settings-editor'},
                    h('h2', {}, 'Section Settings'),
                    selectedSectionData && selectedPredefinedSection ?
                        h('div', {},
                            h('h3', {}, selectedPredefinedSection.name),
                            selectedPredefinedSection.fields.map(field =>
                                h('div', { class: 'form-group', key: `${selectedSectionData.id}-${field.name}` },
                                    h('label', { for: `${field.name}-${selectedSectionData.id}` }, field.label),
                                    renderField(field, selectedSectionData)
                                )
                            ),
                            // Responsive Settings for Selected Section
                            h('h4', {style: {marginTop: '20px', paddingTop:'15px', borderTop:'1px solid var(--border-glass)'}}, 'Responsive Visibility'),
                            ['desktop', 'tablet', 'mobile'].map(vp =>
                                h('div', {class: 'checkbox-label', key: vp},
                                    h('input', {
                                        type: 'checkbox',
                                        id: `visibility-${vp}-${selectedSectionData.id}`,
                                        checked: selectedSectionData.responsive?.[vp]?.visible !== false, // Default to true if undefined
                                        onChange: e => handleResponsiveSettingChange(vp, 'visible', e.target.checked)
                                    }),
                                    `Visible on ${vp.charAt(0).toUpperCase() + vp.slice(1)}`
                                )
                            )
                        ) :
                        h('p', {class: 'wizard-note'}, 'Select a section from the page layout to edit its properties.')
                )
            ),
            h('main', { class: 'theme-preview-canvas', style: { width: viewportWidths[currentViewport], maxWidth: '100%' } },
                h('style', { id: 'theme-builder-dynamic-styles' }, generatePreviewGlobalStyles()),
                h('div', { class: 'live-preview-area'},
                    h('h2', {}, `Editing Layout: ${themeConfig.pages[activePageLayout]?.name || 'Selected Layout'} (${currentViewport})`),
                    h('div', { id: 'page-sections-list', class: 'page-sections-dropzone', ref: pageSectionsRef },
                        currentSections.length > 0 ? currentSections.map((section) =>
                            h('div', {
                                class: `page-section-item-wrapper ${selectedSectionId === section.id ? 'selected' : ''}`,
                                onClick: () => setSelectedSectionId(section.id)
                            },
                                h('div', {class:'drag-handle-wrapper'}, h('span', { class: 'drag-handle' }, '☰ ')),
                                renderSectionPreview(section, themeConfig.globalStyles, currentViewport) // Pass currentViewport
                            )
                        ) : h('p', {class: 'dropzone-placeholder'}, 'Drag sections from the palette here.')
                    )
                )
            )
        )
    );
}


// --- Layout Component ---
class Layout extends Component { /* ... (existing Layout component code - unchanged) ... */
    render(props) {
        return h('div', { class: 'admin-layout' },
            props.children
        );
    }
}

// --- Main App Component ---
class App extends Component { /* ... (existing App component code - unchanged routing, state) ... */
    constructor(props) {
        super(props);
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
            this.setState({ needsSetup: false, currentView: 'Dashboard' });
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
        if (this.sortableInstances && this.sortableInstances.palette) this.sortableInstances.palette.destroy();
        if (this.sortableInstances && this.sortableInstances.pageSections) this.sortableInstances.pageSections.destroy();
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

// --- Helper: OKLCH to HEX (simplified, for color input only, not for general conversion) ---
function oklchToHex(oklchString) { /* ... (unchanged) ... */
    if (!oklchString || !oklchString.startsWith('oklch(')) return '#000000';
    try {
        if (oklchString.includes('0.25 330')) return '#DE3163';
        if (oklchString.includes('0.28 290')) return '#8A2BE2';
        if (oklchString.includes('0.22 250')) return '#4169E1';
        return '#000000';
    } catch {
        return '#000000';
    }
}
function hexToOklch(hexString, fallbackOklch) { /* ... (unchanged) ... */
    console.warn("hexToOklch is a placeholder and doesn't perform real conversion. Returning fallback or original OKLCH string if available.");
    return fallbackOklch || 'oklch(0 0 0)';
}


// --- Render the App ---
const appRoot = document.getElementById('admin-app');
if (appRoot) {
    render(h(App), appRoot);
    console.log("Admin SPA Initialized with Preact, Navigo, Dexie (db.js). Theme Builder responsive controls added.");
} else {
    console.error("Admin app root element (#admin-app) not found.");
}
