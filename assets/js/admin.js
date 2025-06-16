// Ensure Preact and Navigo are loaded (from CDN in this case)
const { h, render, Component, createRef, Fragment } = preact;
const { useEffect, useState, useCallback, useMemo, useRef } = preactHooks;
const Navigo = window.Navigo;
const Sortable = window.Sortable;

// TipTap global objects (assuming loaded from CDN)
const TiptapCore = window.Tiptap.Core;
const TiptapStarterKit = window.TiptapStarterKit.StarterKit;
const TiptapLink = window.TiptapLink.Link;
const TiptapPlaceholder = window.TiptapPlaceholder.Placeholder;

// Import DB functions
import { db, getSetting, setSetting, addContent, getContentById, updateContent, deleteContent, getAllContentByType } from './db.js';
// Import Email sending function
import { sendEmail } from './email.js';
// Import AI text generation function
import { generateTextWithOpenAI } from './ai.js';


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

// --- Client-side Worker Sync Helper ---
async function syncAdminSettingsToWorker(settingsToSync, directConfig = null) {
    let workerUrlValue = directConfig?.cloudflareWorkerUrl;
    let adminTokenValue = directConfig?.adminSetupToken;

    if (!workerUrlValue) workerUrlValue = await getSetting('cloudflareWorkerUrl');
    if (!adminTokenValue) adminTokenValue = await getSetting('adminSetupToken');

    if (!workerUrlValue || !adminTokenValue) {
        console.error('Worker URL or Admin Setup Token not configured.');
        return { success: false, error: 'Worker communication details missing.' };
    }

    const workerUrl = workerUrlValue.replace(/\/$/, '');
    const token = adminTokenValue;
    const endpoint = `${workerUrl}/setup-config`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(settingsToSync)
        });
        const result = await response.json().catch(() => ({ success: false, error: 'Invalid JSON response from worker' }));
        if (!response.ok || !result.success) {
            return { success: false, error: result.error || `Failed to sync settings to worker (Status: ${response.status}).`, details: result.details };
        }
        return { success: true, message: result.message || 'Settings synced to worker successfully.' };
    } catch (err) {
        console.error('Error syncing settings to worker:', err);
        return { success: false, error: 'Network error or invalid response during worker sync.' };
    }
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
            cfAccountId: '', cfKvVisitorDataId: '', cfKvAnalyticsId: '', adminSetupToken: '',
            error: null, isLoading: false,
        };
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handleInput = this.handleInput.bind(this);
    }

    handleInput(e) { this.setState({ [e.target.name]: e.target.value, error: null }); }

    async handleSubmit(e) {
        e.preventDefault();
        this.setState({ isLoading: true, error: null });
        const { siteName, adminEmail, cloudflareWorkerUrl, cfKvVisitorDataId, cfKvAnalyticsId, cfAccountId, adminSetupToken } = this.state;

        if (!siteName || !adminEmail || !cloudflareWorkerUrl || !cfKvVisitorDataId || !cfKvAnalyticsId || !adminSetupToken) {
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
            await setSetting('adminSetupToken', adminSetupToken);

            await setSetting('ADMIN_EMAIL_BREVO', adminEmail);
            const syncResult = await syncAdminSettingsToWorker(
                { adminEmailForBrevo: adminEmail, siteName: siteName },
                { cloudflareWorkerUrl, adminSetupToken }
            );
            if (!syncResult.success) {
                this.setState({ error: `Core settings saved locally, but failed to sync Admin Email to Worker: ${syncResult.error}. You can retry in Settings.`, isLoading: false });
            }

            await setSetting(INITIAL_SETUP_COMPLETE_KEY, true);
            this.props.onSetupComplete();

        } catch (err) {
            console.error("Error saving setup settings:", err);
            this.setState({ error: 'Failed to save settings. Please try again.', isLoading: false });
        }
    }

    render(_, { siteName, adminEmail, cloudflareWorkerUrl, cfAccountId, cfKvVisitorDataId, cfKvAnalyticsId, adminSetupToken, error, isLoading }) {
        return h('div', { class: 'setup-wizard-container' },
            h('div', { class: 'setup-wizard-card glassmorphic' },
                h('h1', { class: 'wizard-title' }, 'Initial CMS Setup'),
                h('p', { class: 'wizard-subtitle'}, 'Welcome! Configure your CMS with essential details.'),
                error && h('p', { class: 'wizard-error login-error' }, error),
                h('form', { onSubmit: this.handleSubmit },
                    h('div', { class: 'form-group' }, h('label', { for: 'siteName' }, 'Site Name *'), h('input', { type: 'text', name: 'siteName', id: 'siteName', value: siteName, onInput: this.handleInput, required: true })),
                    h('div', { class: 'form-group' }, h('label', { for: 'adminEmail' }, 'Default Admin Email (for notifications, Brevo sender)*'), h('input', { type: 'email', name: 'adminEmail', id: 'adminEmail', value: adminEmail, onInput: this.handleInput, required: true })),
                    h('div', { class: 'form-group' }, h('label', { for: 'cloudflareWorkerUrl' }, 'Cloudflare Worker URL *'), h('input', { type: 'url', name: 'cloudflareWorkerUrl', id: 'cloudflareWorkerUrl', placeholder: 'https://your-worker.username.workers.dev', value: cloudflareWorkerUrl, onInput: this.handleInput, required: true })),
                    h('div', { class: 'form-group' }, h('label', { for: 'cfKvVisitorDataId' }, 'Cloudflare KV Namespace ID (Visitor Data) *'), h('input', { type: 'text', name: 'cfKvVisitorDataId', id: 'cfKvVisitorDataId', value: cfKvVisitorDataId, onInput: this.handleInput, required: true })),
                    h('div', { class: 'form-group' }, h('label', { for: 'cfKvAnalyticsId' }, 'Cloudflare KV Namespace ID (Analytics) *'), h('input', { type: 'text', name: 'cfKvAnalyticsId', id: 'cfKvAnalyticsId', value: cfKvAnalyticsId, onInput: this.handleInput, required: true })),
                    h('div', { class: 'form-group' }, h('label', { for: 'adminSetupToken' }, 'Cloudflare Worker Admin Setup Token *'), h('input', { type: 'password', name: 'adminSetupToken', id: 'adminSetupToken', value: adminSetupToken, onInput: this.handleInput, required: true, autocomplete: "new-password" })),
                    h('div', { class: 'form-group' }, h('label', { for: 'cfAccountId' }, 'Cloudflare Account ID (Optional)'), h('input', { type: 'text', name: 'cfAccountId', id: 'cfAccountId', value: cfAccountId, onInput: this.handleInput })),
                    h('p', {class: 'wizard-note'}, 'Deploy your Cloudflare Worker & configure its secrets (API keys, ADMIN_SETUP_TOKEN) and KV bindings in Cloudflare dashboard.'),
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
            { name: 'Tools', path: '/tools', subItems: [
                { name: 'Email Test', path: '/tools/email-test'}
            ]}
        ];

        const navigoCurrentPath = currentPath === '' ? '/' : currentPath;

        return h('aside', { class: 'admin-sidebar glassmorphic' },
            h('nav', {},
                navItems.map(item =>
                    h(Fragment, {},
                        h('a', {
                            href: router.generate(item.path),
                            class: isActive(navigoCurrentPath, item.path, !item.subItems),
                            onClick: (e) => {
                                e.preventDefault();
                                router.navigate(item.path);
                            }
                        }, item.name),
                        item.subItems && h('ul', {class: 'sidebar-submenu'},
                            item.subItems.map(subItem =>
                                h('li', {},
                                    h('a', {
                                        href: router.generate(subItem.path),
                                        class: isActive(navigoCurrentPath, subItem.path, true),
                                        onClick: (e) => {
                                            e.preventDefault();
                                            router.navigate(subItem.path);
                                        }
                                    }, subItem.name)
                                )
                            )
                        )
                    )
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
            case 'EmailTest': viewComponent = h(EmailTestPage, {}); break;
            case 'Settings': viewComponent = h(SettingsPage, {}); break;
            case 'Plugins':
            case 'Analytics':
            case 'Backup':
            case 'Tools':
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

// --- RichTextEditor Component ---
const RichTextEditor = ({ content, onChange, placeholder }) => {
    const editorRef = useRef(null);
    const tiptapInstance = useRef(null);
    const [isToolbarActive, setIsToolbarActive] = useState({});
    const [isAiLoading, setIsAiLoading] = useState(false); // AI Loading state

    const handleAiGenerate = async () => {
        const editor = tiptapInstance.current;
        if (!editor) return;
        setIsAiLoading(true);

        const selection = editor.state.selection;
        const selectedText = editor.state.doc.textBetween(selection.from, selection.to, '\n\n');

        let userInstructions;
        if (selectedText.trim()) {
          userInstructions = window.prompt(
            `Selected text will be used as context. Enter your instructions for the AI (e.g., "Summarize this", "Expand on this", "Rewrite this in a more formal tone"):`,
            `Summarize this: "${selectedText.substring(0, 100)}${selectedText.length > 100 ? '...' : ''}"`
          );
        } else {
          userInstructions = window.prompt(
            "Enter your prompt for AI text generation:",
            "Write a short paragraph about the future of AI."
          );
        }

        if (userInstructions === null) {
          setIsAiLoading(false);
          return;
        }

        const fullPrompt = selectedText.trim()
          ? `Context: "${selectedText}"\n\nInstruction: "${userInstructions}"`
          : userInstructions;

        const result = await generateTextWithOpenAI({ prompt: fullPrompt });

        if (result.success && result.generatedText) {
          let transaction = editor.chain().focus();
          if (selection.from !== selection.to) {
              transaction = transaction.deleteRange(selection);
          }
          transaction.insertContent(result.generatedText).run();
        } else {
          alert(`AI Error: ${result.error || 'Failed to generate text.'}`);
        }
        setIsAiLoading(false);
    };

    useEffect(() => {
        if (!TiptapCore || !TiptapStarterKit || !TiptapLink || !TiptapPlaceholder) {
            console.error("TipTap libraries not loaded!");
            return;
        }

        tiptapInstance.current = new TiptapCore.Editor({
            element: editorRef.current,
            extensions: [
                TiptapStarterKit.configure({ heading: { levels: [1, 2, 3] } }),
                TiptapLink.configure({ openOnClick: false, autolink: true }),
                TiptapPlaceholder.configure({ placeholder: placeholder || 'Start writing...' }),
            ],
            content: content || '',
            onUpdate: ({ editor }) => { onChange(editor.getHTML()); },
            onSelectionUpdate: ({ editor }) => {
                setIsToolbarActive({
                    bold: editor.isActive('bold'), italic: editor.isActive('italic'),
                    h1: editor.isActive('heading', { level: 1 }), h2: editor.isActive('heading', { level: 2 }),
                    h3: editor.isActive('heading', { level: 3 }), bulletList: editor.isActive('bulletList'),
                    orderedList: editor.isActive('orderedList'), link: editor.isActive('link'),
                });
            },
        });
        return () => { tiptapInstance.current?.destroy(); };
    }, [content, placeholder]);

    const toggleHeading = (level) => tiptapInstance.current?.chain().focus().toggleHeading({ level }).run();
    const toggleBold = () => tiptapInstance.current?.chain().focus().toggleBold().run();
    const toggleItalic = () => tiptapInstance.current?.chain().focus().toggleItalic().run();
    const toggleBulletList = () => tiptapInstance.current?.chain().focus().toggleBulletList().run();
    const toggleOrderedList = () => tiptapInstance.current?.chain().focus().toggleOrderedList().run();

    const setLink = useCallback(() => {
        const editor = tiptapInstance.current; if (!editor) return;
        const previousUrl = editor.getAttributes('link').href;
        const url = window.prompt('URL', previousUrl); if (url === null) return;
        if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }, [tiptapInstance.current]);

    return h(Fragment, {},
        h('div', { class: 'rte-toolbar' },
            h('button', { type: 'button', class: `rte-button ${isToolbarActive.h1 ? 'active' : ''}`, onClick: () => toggleHeading(1) }, 'H1'),
            h('button', { type: 'button', class: `rte-button ${isToolbarActive.h2 ? 'active' : ''}`, onClick: () => toggleHeading(2) }, 'H2'),
            h('button', { type: 'button', class: `rte-button ${isToolbarActive.h3 ? 'active' : ''}`, onClick: () => toggleHeading(3) }, 'H3'),
            h('button', { type: 'button', class: `rte-button ${isToolbarActive.bold ? 'active' : ''}`, onClick: toggleBold }, 'B'),
            h('button', { type: 'button', class: `rte-button ${isToolbarActive.italic ? 'active' : ''}`, onClick: toggleItalic }, 'I'),
            h('button', { type: 'button', class: `rte-button ${isToolbarActive.link ? 'active' : ''}`, onClick: setLink }, 'Link'),
            h('button', { type: 'button', class: `rte-button ${isToolbarActive.bulletList ? 'active' : ''}`, onClick: toggleBulletList }, 'UL'),
            h('button', { type: 'button', class: `rte-button ${isToolbarActive.orderedList ? 'active' : ''}`, onClick: toggleOrderedList }, 'OL'),
            h('button', { type: 'button', class: `rte-button ai-generate ${isAiLoading ? 'loading' : ''}`, onClick: handleAiGenerate, disabled: isAiLoading }, isAiLoading ? '...' : 'AI Gen')
        ),
        h('div', { class: 'rte-content', ref: editorRef })
    );
};


// --- ContentEditorPage Component ---
function ContentEditorPage({ contentType, contentId, router }) { /* ... (existing ContentEditorPage component code - unchanged) ... */
    const [title, setTitle] = useState('');
    const [slug, setSlug] = useState('');
    const [htmlContent, setHtmlContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const isEditing = contentId != null;

    const generateSlug = (titleStr) => titleStr.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');

    useEffect(() => {
        if (isEditing) {
            setIsLoading(true);
            getContentById(Number(contentId)).then(item => {
                if (item) {
                    setTitle(item.title); setSlug(item.slug); setHtmlContent(item.content);
                } else { setError(`Content item with ID ${contentId} not found.`); }
                setIsLoading(false);
            });
        } else {
            setTitle(''); setSlug(''); setHtmlContent(''); setIsLoading(false); setError(null);
        }
    }, [contentId, isEditing, contentType]);

    const handleTitleChange = (e) => {
        const newTitle = e.target.value; setTitle(newTitle);
        if (!isEditing || slug === generateSlug(title)) {
            setSlug(generateSlug(newTitle));
        }
    };
    const handleSlugChange = (e) => setSlug(e.target.value);
    const handleContentChange = (newHtmlContent) => {
        setHtmlContent(newHtmlContent);
    };

    const handleSubmit = async (e) => {
        e.preventDefault(); setIsLoading(true); setError(null);
        if (!title || !slug ) {
            setError('Title and Slug are required.'); setIsLoading(false); return;
        }
        const itemData = { type: contentType, title, slug, content: htmlContent };
        try {
            if (isEditing) { await updateContent(Number(contentId), itemData); }
            else { await addContent(itemData); }
            router.navigate(`/${contentType}s`);
        } catch (err) {
            console.error('Error saving content:', err); setError('Failed to save content.'); setIsLoading(false);
        }
    };

    if (isLoading && isEditing && !title) return h('p', {}, 'Loading editor...');
    if (error && isEditing && !title) return h('p', {class: 'login-error'}, error);

    return h('div', { class: 'content-editor-page' },
        h('h1', {}, isEditing ? `Edit ${contentType}` : `Create New ${contentType}`),
        error && h('p', { class: 'login-error' }, error),
        h('form', { onSubmit: handleSubmit, class: 'editor-form' },
            h('div', { class: 'form-group' }, h('label', { for: 'title' }, 'Title'), h('input', { type: 'text', id: 'title', value: title, onInput: handleTitleChange, required: true })),
            h('div', { class: 'form-group' }, h('label', { for: 'slug' }, 'Slug'), h('input', { type: 'text', id: 'slug', value: slug, onInput: handleSlugChange, required: true })),
            h('div', { class: 'form-group' },
                h('label', { for: 'content-editor' }, 'Content'),
                h(RichTextEditor, { content: htmlContent, onChange: handleContentChange, placeholder: "Start writing your amazing content..." })
            ),
            h('button', { type: 'submit', class: 'button-primary', disabled: isLoading }, isLoading ? 'Saving...' : 'Save')
        )
    );
}


// --- ThemeBuilderPage Component ---
function ThemeBuilderPage({ router }) { /* ... (existing ThemeBuilderPage component code - unchanged) ... */
    const [themeConfig, setThemeConfig] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [activePageLayout, setActivePageLayout] = useState('homepage');
    const [selectedSectionId, setSelectedSectionId] = useState(null);
    const [currentViewport, setCurrentViewport] = useState('desktop');

    const paletteRef = createRef();
    const pageSectionsRef = createRef();
    const sortableInstances = useMemo(() => ({ palette: null, pageSections: null }), []);

    const defaultPalette = {
        brandPrimary: 'oklch(65% 0.25 330)', brandAccent: 'oklch(70% 0.22 250)',
        textDark: 'oklch(20% 0.02 270)', textLight: 'oklch(98% 0.005 270)',
        backgroundMain: 'oklch(98% 0.005 270)', surface: 'oklch(100% 0 0)',
        textOnPrimary: 'oklch(100% 0 0)'
    };
    const defaultThemeConfig = {
        globalStyles: {
            primaryColor: defaultPalette.brandPrimary,
            baseFontFamily: "Roboto", headingFontFamily: "Nunito Sans",
            palette: { ...defaultPalette },
            fontSubsets: ["latin", "latin-ext"], customCss: ""
        },
        pages: {
            homepage: { name: "Homepage", sections: [] },
            defaultPost: { name: "Default Post", sections: [] }
        },
        predefinedSections: [
            { type: "hero", name: "Hero Section", description: "Large prominent section",
              defaultSettings: { title: "Welcome!", subtitle: "<p>Amazing things <strong>await</strong>.</p>", backgroundImageUrl: "", buttonText: "Learn More", buttonLink: "#", textColor: "#FFFFFF", textAlignment: "center", minHeight: "400px", backgroundColor: defaultPalette.brandAccent },
              fields: [
                {name: 'title', label: 'Title', type: 'text'},
                {name: 'subtitle', label: 'Subtitle', type: 'richtext', placeholder: 'Enter subtitle...'},
                {name: 'backgroundImageUrl', label: 'Background Image URL', type: 'text', inputType: 'url'},
                {name: 'buttonText', label: 'Button Text', type: 'text'},
                {name: 'buttonLink', label: 'Button Link', type: 'text', inputType: 'url'},
                {name: 'textColor', label: 'Text Color', type: 'color'},
                {name: 'backgroundColor', label: 'Background Color', type: 'color'},
                {name: 'textAlignment', label: 'Text Alignment', type: 'select', options: ["left", "center", "right"]},
                {name: 'minHeight', label: 'Min Height (e.g. 400px)', type: 'text'}
              ]
            },
            { type: "textBlock", name: "Text Block", description: "Simple text block",
              defaultSettings: { heading: "About Us", content: "<p>We are a <em>dynamic</em> team passionate about creating innovative solutions.</p>", backgroundColor: "transparent", textColor: defaultPalette.textDark, headingColor: defaultPalette.textDark },
              fields: [
                {name: 'heading', label: 'Heading', type: 'text'},
                {name: 'content', label: 'Content', type: 'richtext', placeholder: 'Enter your text here...'},
                {name: 'backgroundColor', label: 'Background Color', type: 'color'},
                {name: 'textColor', label: 'Text Color', type: 'color'},
                {name: 'headingColor', label: 'Heading Color', type: 'color'}
              ]
            },
            { type: "gallery", name: "Image Gallery", description: "Grid of images",
              defaultSettings: { images: "https://picsum.photos/seed/cms1/300/200,https://picsum.photos/seed/cms2/300/200,https://picsum.photos/seed/cms3/300/200", columns: 3, gap: "10px" },
              fields: [
                {name: 'images', label: 'Images (URLs, comma-separated)', type: 'textarea'},
                {name: 'columns', label: 'Columns (2-4)', type: 'select', options: [2,3,4]},
                {name: 'gap', label: 'Gap (e.g. 10px)', type: 'text'}
              ]
            }
        ]
    };
    const availableFonts = ["Roboto", "Open Sans", "Nunito Sans", "Lato", "Montserrat", "Georgia", "Times New Roman", "Arial"];
    const availableSubsets = ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "vietnamese"];

    useEffect(() => {
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
    useEffect(() => {
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
                        responsive: { desktop: {visible:true}, tablet: {visible:true}, mobile: {visible:true} }
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

    const handleGlobalStyleChange = (key, value) => { setThemeConfig(prev => ({ ...prev, globalStyles: { ...prev.globalStyles, [key]: value } })); };
    const handlePaletteColorChange = (colorName, oklchValue) => { setThemeConfig(prev => { const newPalette = { ...prev.globalStyles.palette, [colorName]: oklchValue }; return { ...prev, globalStyles: { ...prev.globalStyles, palette: newPalette } }; }); };
    const handleFontSubsetChange = (subset, isChecked) => { setThemeConfig(prev => { const currentSubsets = prev.globalStyles.fontSubsets || []; let newSubsets; if (isChecked) { newSubsets = [...currentSubsets, subset]; } else { newSubsets = currentSubsets.filter(s => s !== subset); } return { ...prev, globalStyles: { ...prev.globalStyles, fontSubsets: newSubsets } }; }); };

    const handleSectionSettingChange = (fieldName, newValue) => {
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
            const newConfig = JSON.parse(JSON.stringify(prev));
            const pageKey = activePageLayout;
            const sectionIndex = newConfig.pages[pageKey].sections.findIndex(s => s.id === selectedSectionId);
            if (sectionIndex > -1) {
                if (!newConfig.pages[pageKey].sections[sectionIndex].responsive) newConfig.pages[pageKey].sections[sectionIndex].responsive = {};
                if (!newConfig.pages[pageKey].sections[sectionIndex].responsive[viewport]) newConfig.pages[pageKey].sections[sectionIndex].responsive[viewport] = {};
                newConfig.pages[pageKey].sections[sectionIndex].responsive[viewport][settingName] = newValue;
            }
            return newConfig;
        });
    };

    const handleSaveTheme = async () => {
        setIsLoading(true); setMessage('');
        try {
            await setSetting(THEME_CONFIG_KEY, themeConfig);
            setMessage('Theme settings saved successfully!');
            const dynamicStyleEl = document.getElementById('theme-builder-dynamic-styles');
            if (dynamicStyleEl) dynamicStyleEl.innerHTML = generatePreviewGlobalStyles();
        } catch (err) { console.error("Error saving theme config:", err); setMessage('Error saving theme settings.'); }
        setIsLoading(false);
        setTimeout(() => setMessage(''), 3000);
    };

    const generatePreviewGlobalStyles = () => {
        if (!themeConfig || !themeConfig.globalStyles) return '';
        const gs = themeConfig.globalStyles; let paletteCssVars = '';
        if(gs.palette) { for (const [key, value] of Object.entries(gs.palette)) { paletteCssVars += `--preview-color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value};\n`; } }
        let googleFontUrl = ''; const families = [];
        if (gs.baseFontFamily && !availableFonts.includes(gs.baseFontFamily)) families.push(gs.baseFontFamily);
        if (gs.headingFontFamily && gs.headingFontFamily !== gs.baseFontFamily && !availableFonts.includes(gs.headingFontFamily)) families.push(gs.headingFontFamily);
        if (families.length > 0) { googleFontUrl = `https://fonts.googleapis.com/css2?${families.map(f => `family=${f.replace(/\s/g, '+')}:wght@400;700`).join('&')}`; if (gs.fontSubsets && gs.fontSubsets.length > 0) { googleFontUrl += `&subset=${gs.fontSubsets.join(',')}`; } googleFontUrl += '&display=swap'; }
        return `${googleFontUrl ? `@import url('${googleFontUrl}');` : ''}
        .live-preview-area { ${paletteCssVars} font-family: '${gs.baseFontFamily || 'sans-serif'}', sans-serif; background-color: var(--preview-color-background-main, #fff); color: var(--preview-color-text-dark, #333); }
        .live-preview-area h1, .live-preview-area h2, .live-preview-area h3, .live-preview-area h4, .live-preview-area h5, .live-preview-area h6 { font-family: '${gs.headingFontFamily || gs.baseFontFamily || 'sans-serif'}', sans-serif; color: var(--preview-color-text-dark, #333); }
        .live-preview-area p { line-height: 1.7; margin-bottom: 1em; } .live-preview-area a { color: var(--preview-color-brand-primary, blue); }
        .live-preview-area .button-primary { background: var(--preview-color-brand-primary, blue); color: var(--preview-color-text-on-primary, white); }`;
    };

    if (isLoading || !themeConfig) return h('p', {class: 'centered-container'}, 'Loading Theme Builder...');

    const currentSections = themeConfig.pages[activePageLayout]?.sections || [];
    const selectedSectionData = selectedSectionId ? currentSections.find(s => s.id === selectedSectionId) : null;
    const selectedPredefinedSection = selectedSectionData ? themeConfig.predefinedSections.find(ps => ps.type === selectedSectionData.type) : null;

    const renderField = (field, section) => {
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
            case 'richtext': return h(RichTextEditor, {
                content: value,
                onChange: (newHtml) => handleSectionSettingChange(field.name, newHtml),
                placeholder: field.placeholder || 'Enter content...'
            });
            default: return h('input', { type: 'text', id: inputId, value: value, onInput: (e) => handleSectionSettingChange(field.name, e.target.value) });
        }
    };

    const gs = themeConfig.globalStyles;
    const viewportWidths = { desktop: '100%', tablet: '768px', mobile: '375px' };

    return h('div', { class: 'theme-builder-page' },
        h('div', {class: 'theme-builder-header'},
            h('h1', {}, 'Theme Builder'),
            h('div', {class: 'viewport-switcher'}, ['desktop', 'tablet', 'mobile'].map(vp => h('button', { class: `viewport-btn ${currentViewport === vp ? 'active' : ''}`, onClick: () => setCurrentViewport(vp) }, vp.charAt(0).toUpperCase() + vp.slice(1)))),
            h('button', { class: 'button-primary', onClick: handleSaveTheme, disabled: isLoading }, isLoading ? 'Saving...' : 'Save Theme Settings')
        ),
        message && h('p', { class: `theme-builder-message ${message.startsWith('Error') ? 'login-error' : 'success-message'}` }, message),
        h('div', { class: 'theme-builder-layout' },
            h('aside', { class: 'theme-controls-panel glassmorphic' },
                h('div', {class: 'control-panel-segment'},
                    h('h2', {}, 'Global Styles'), h('h3', {}, 'Color Palette (OKLCH)'),
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
                    h('hr'), h('h3', {}, 'Typography'),
                    h('div', { class: 'form-group' }, h('label', { for: 'baseFontFamily' }, 'Base Font'), h('select', { id: 'baseFontFamily', value: gs.baseFontFamily, onChange: (e) => handleGlobalStyleChange('baseFontFamily', e.target.value) }, availableFonts.map(font => h('option', { value: font }, font)))),
                    h('div', { class: 'form-group' }, h('label', { for: 'headingFontFamily' }, 'Heading Font'), h('select', { id: 'headingFontFamily', value: gs.headingFontFamily, onChange: (e) => handleGlobalStyleChange('headingFontFamily', e.target.value) }, availableFonts.map(font => h('option', { value: font }, font)))),
                    h('div', { class: 'form-group' }, h('label', {}, 'Font Subsets (for Google Fonts)'), h('div', {class: 'checkbox-group'}, availableSubsets.map(subset => h('label', {class: 'checkbox-label', key: subset}, h('input', {type: 'checkbox', value: subset, checked: (gs.fontSubsets || []).includes(subset), onChange: e => handleFontSubsetChange(subset, e.target.checked)}), subset)))),
                    h('div', { class: 'form-group' }, h('label', { for: 'customCss' }, 'Custom CSS'), h('textarea', { id: 'customCss', value: gs.customCss, rows:5, onInput: (e) => handleGlobalStyleChange('customCss', e.target.value), placeholder: "/* For advanced users */" }))
                ),
                h('hr'),
                h('div', {class: 'control-panel-segment'}, h('h2', {}, 'Sections Palette'), h('div', { id: 'section-palette', class: 'section-palette', ref: paletteRef }, themeConfig.predefinedSections.map(section => h('div', { class: 'palette-item card', 'data-section-type': section.type }, h('strong', {}, section.name), h('p', {class: 'palette-item-desc'}, section.description || ''))))),
                h('hr'),
                h('div', {class: 'control-panel-segment section-settings-editor'},
                    h('h2', {}, 'Section Settings'),
                    selectedSectionData && selectedPredefinedSection ?
                        h('div', {}, h('h3', {}, selectedPredefinedSection.name),
                            selectedPredefinedSection.fields.map(field => h('div', { class: 'form-group', key: `${selectedSectionData.id}-${field.name}` }, h('label', { for: `${field.name}-${selectedSectionData.id}` }, field.label), renderField(field, selectedSectionData))),
                            h('h4', {}, 'Responsive Visibility'),
                            ['desktop', 'tablet', 'mobile'].map(vp => h('div', {class: 'checkbox-label responsive-visibility-checkbox', key: vp}, h('input', {type: 'checkbox', id: `visibility-${vp}-${selectedSectionData.id}`, checked: selectedSectionData.responsive?.[vp]?.visible !== false, onChange: e => handleResponsiveSettingChange(vp, 'visible', e.target.checked)}), `Visible on ${vp.charAt(0).toUpperCase() + vp.slice(1)}`))
                        ) :
                        h('p', {class: 'wizard-note'}, 'Select a section from the page layout to edit its properties.')
                )
            ),
            h('main', { class: 'theme-preview-canvas', style: { width: viewportWidths[currentViewport], maxWidth: '100%' } },
                h('style', { id: 'theme-builder-dynamic-styles' }, generatePreviewGlobalStyles()),
                h('div', { class: 'live-preview-area'},
                    h('h2', {}, `Layout: ${themeConfig.pages[activePageLayout]?.name || 'N/A'} (${currentViewport})`),
                    h('div', { id: 'page-sections-list', class: 'page-sections-dropzone', ref: pageSectionsRef },
                        currentSections.length > 0 ? currentSections.map((section) =>
                            h('div', { class: `page-section-item-wrapper ${selectedSectionId === section.id ? 'selected' : ''}`, onClick: () => setSelectedSectionId(section.id)},
                                h('div', {class:'drag-handle-wrapper'}, h('span', { class: 'drag-handle' }, '☰ ')),
                                renderSectionPreview(section, themeConfig.globalStyles, currentViewport)
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
class App extends Component { /* ... (existing App component code - unchanged) ... */
    constructor(props) {
        super(props);
        this.router = new Navigo('/admin', { hash: true });
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
                    '/tools/email-test': () => this.updateRouteView('EmailTest'),
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

// --- EmailTestPage Component ---
const EmailTestPage = () => { /* ... (existing EmailTestPage component code - unchanged) ... */
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [htmlContent, setHtmlContent] = useState('<p>This is a <b>test email</b> from the CMS!</p>');
  const [status, setStatus] = useState({type: '', message: ''});
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!to || !subject || !htmlContent) {
      setStatus({ type: 'error', message: 'Please fill in all fields.' });
      return;
    }
    setIsSending(true);
    setStatus({ type: 'info', message: 'Sending test email...' });

    const result = await sendEmail({ to, subject, htmlContent });

    setIsSending(false);
    if (result.success) {
      setStatus({ type: 'success', message: 'Email sent successfully! Check the recipient inbox (and spam folder).' });
    } else {
      setStatus({ type: 'error', message: `Error: ${result.error || 'Unknown error.'} ${result.details ? JSON.stringify(result.details) : ''}` });
    }
  };

  return h('div', { class: 'email-test-page card' },
    h('h2', { class: 'page-section-title' }, 'Email Sending Test'),
    h('p', { class: 'page-subtitle' }, 'Use this form to send a test email via the configured Brevo integration.'),
    h('form', { onSubmit: handleSubmit, class: 'editor-form' },
      h('div', { class: 'form-group' },
        h('label', { for: 'toEmail' }, 'Recipient Email:'),
        h('input', { type: 'email', id: 'toEmail', value: to, onInput:(e) => setTo(e.target.value), required: true, disabled: isSending })
      ),
      h('div', { class: 'form-group' },
        h('label', { for: 'subject' }, 'Subject:'),
        h('input', { type: 'text', id: 'subject', value: subject, onInput:(e) => setSubject(e.target.value), required: true, disabled: isSending })
      ),
      h('div', { class: 'form-group' },
        h('label', { for: 'htmlContent' }, 'Message (HTML):'),
        h(RichTextEditor, {
            content: htmlContent,
            onChange: setHtmlContent,
            placeholder: "Type your test message here...",
        })
      ),
      h('button', { type: 'submit', class: 'button-primary', disabled: isSending },
        isSending ? 'Sending...' : 'Send Test Email'
      ),
      status.message && h('div', {
        class: `status-message ${status.type === 'success' ? 'success-message' : status.type === 'error' ? 'login-error' : 'info-message'}`,
        style: {marginTop: '20px'}
      }, status.message)
    )
  );
};

// --- SettingsPage Component (New/Refined) ---
const SettingsPage = () => { /* ... (existing SettingsPage component code - unchanged) ... */
    const [isLoading, setIsLoading] = useState(true);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [siteName, setSiteName] = useState('');
    const [adminEmailForBrevo, setAdminEmailForBrevo] = useState('');
    const [cloudflareWorkerUrl, setCloudflareWorkerUrl] = useState('');
    const [adminSetupToken, setAdminSetupToken] = useState('');
    const [initialAdminEmailForBrevo, setInitialAdminEmailForBrevo] = useState('');
    const [openAIDefaultModel, setOpenAIDefaultModel] = useState('');


    const loadAllSettings = async () => {
        setIsLoading(true);
        try {
            const sName = await getSetting('siteName') || '';
            const cfUrl = await getSetting('cloudflareWorkerUrl') || '';
            const cfToken = await getSetting('adminSetupToken') || '';
            const brevoEmail = await getSetting('ADMIN_EMAIL_BREVO') || await getSetting('adminEmail') || '';
            const openAIModel = await getSetting('OPENAI_DEFAULT_MODEL') || '';

            setSiteName(sName);
            setCloudflareWorkerUrl(cfUrl);
            setAdminSetupToken(cfToken);
            setAdminEmailForBrevo(brevoEmail);
            setInitialAdminEmailForBrevo(brevoEmail);
            setOpenAIDefaultModel(openAIModel);

        } catch (err) {
            console.error("Error loading settings:", err);
            setStatus({ type: 'error', message: 'Could not load settings.' });
        }
        setIsLoading(false);
    };

    useEffect(() => {
        loadAllSettings();
    }, []);

    const handleSaveSettings = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setStatus({ type: 'info', message: 'Saving settings...' });

        try {
            await setSetting('siteName', siteName);
            await setSetting('cloudflareWorkerUrl', cloudflareWorkerUrl);
            await setSetting('adminSetupToken', adminSetupToken);
            await setSetting('ADMIN_EMAIL_BREVO', adminEmailForBrevo);
            await setSetting('OPENAI_DEFAULT_MODEL', openAIDefaultModel);

            let message = 'Local settings saved successfully!';
            let messageType = 'success';

            if (adminEmailForBrevo !== initialAdminEmailForBrevo) {
                // setStatus({ type: 'info', message: 'Local settings saved. Syncing Admin Email for Brevo to worker...' }); // Message updated below
                const syncResult = await syncAdminSettingsToWorker({ adminEmailForBrevo });
                if (syncResult.success) {
                    message = 'All settings saved and Admin Email synced to worker!';
                    setInitialAdminEmailForBrevo(adminEmailForBrevo);
                } else {
                    message = `Local settings saved, but failed to sync Admin Email to worker: ${syncResult.error}`;
                    messageType = 'error';
                }
            }
            setStatus({ type: messageType, message: message });

        } catch (err) {
            console.error("Error saving settings:", err);
            setStatus({ type: 'error', message: 'Failed to save settings.' });
        }
        setIsLoading(false);
        setTimeout(() => setStatus({type:'', message:''}), 4000);
    };

    if (isLoading) return h('p', {class: 'centered-container'}, 'Loading settings...');

    return h('div', {class: 'settings-page card'},
        h('h2', {class: 'page-section-title'}, 'CMS Settings'),
        h('form', { onSubmit: handleSaveSettings, class: 'editor-form' },
            h('h3', {}, 'General Settings'),
            h('div', {class: 'form-group'},
                h('label', {for: 'siteName'}, 'Site Name'),
                h('input', {type: 'text', id: 'siteName', value: siteName, onInput: e => setSiteName(e.target.value)})
            ),

            h('hr'),
            h('h3', {}, 'Cloudflare Configuration'),
            h('div', {class: 'form-group'},
                h('label', {for: 'cloudflareWorkerUrl'}, 'Cloudflare Worker URL'),
                h('input', {type: 'url', id: 'cloudflareWorkerUrl', value: cloudflareWorkerUrl, onInput: e => setCloudflareWorkerUrl(e.target.value), placeholder: 'https://your-worker.username.workers.dev'})
            ),
            h('div', {class: 'form-group'},
                h('label', {for: 'adminSetupToken'}, 'Cloudflare Worker Admin Setup Token'),
                h('input', {type: 'password', id: 'adminSetupToken', value: adminSetupToken, onInput: e => setAdminSetupToken(e.target.value), autocomplete: "new-password"})
            ),

            h('hr'),
            h('h3', {}, 'Email (Brevo) Configuration'),
            h('div', {class: 'form-group settings-instruction-block'},
                h('label', {}, 'Brevo API Key (v3)'),
                h('p', {}, 'Your Brevo API Key must be set as a secret named `BREVO_API_KEY` in your Cloudflare Worker\'s settings via the Cloudflare dashboard. This key is not stored in the CMS itself for security reasons.'),
                h('a', {href: 'https://developers.cloudflare.com/workers/configuration/secrets/', target: '_blank', rel: 'noopener noreferrer'}, 'Cloudflare Secrets Documentation')
            ),
            h('div', {class: 'form-group'},
                h('label', {for: 'adminEmailForBrevo'}, 'Admin Email for Brevo (Sender Email)'),
                h('input', {type: 'email', id: 'adminEmailForBrevo', value: adminEmailForBrevo, onInput: e => setAdminEmailForBrevo(e.target.value)})
            ),

            h('hr'),
            h('h3', {}, 'OpenAI Configuration'),
            h('div', {class: 'form-group settings-instruction-block'},
                h('label', {}, 'OpenAI API Key'),
                h('p', {}, 'Your OpenAI API Key must be set as a secret named `OPENAI_API_KEY` in your Cloudflare Worker\'s settings via the Cloudflare dashboard. This key is not stored in the CMS itself for security reasons.'),
                h('a', {href: 'https://platform.openai.com/docs/quickstart/account-setup', target: '_blank', rel: 'noopener noreferrer'}, 'OpenAI API Key Documentation'),
                h('span', {style: {margin: '0 5px'}}, ' | '),
                h('a', {href: 'https://developers.cloudflare.com/workers/configuration/secrets/', target: '_blank', rel: 'noopener noreferrer'}, 'Cloudflare Secrets Documentation')
            ),
            h('div', {class: 'form-group'},
                h('label', {for: 'openAIDefaultModel'}, 'Default OpenAI Model (Optional)'),
                h('input', {type: 'text', id: 'openAIDefaultModel', value: openAIDefaultModel, placeholder: 'e.g., gpt-3.5-turbo, gpt-4-turbo-preview', onInput: e => setOpenAIDefaultModel(e.target.value)}),
                h('p', {class: 'wizard-note', style: {fontSize: '0.85em', marginTop: '8px', marginBottom: '0px', padding: '10px 12px'}}, 'This model (e.g., gpt-3.5-turbo) will be used by default for AI text generation if no specific model is chosen in the editor. The Cloudflare Worker also has a default if this is left blank.')
            ),

            h('button', {type: 'submit', class: 'button-primary', disabled: isLoading, style:{marginTop: '20px'}}, isLoading ? 'Saving...' : 'Save All Settings'),
            status.message && h('div', {
                class: `status-message ${status.type === 'success' ? 'success-message' : status.type === 'error' ? 'login-error' : 'info-message'}`,
                style: {marginTop: '20px'}
              }, status.message)
        )
    );
};


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
    console.log("Admin SPA Initialized with Preact, Navigo, Dexie (db.js). Settings page refined for Brevo.");
} else {
    console.error("Admin app root element (#admin-app) not found.");
}
