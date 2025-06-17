// /assets/js/admin.js

// --- Preact (from global/CDN) ---
const { h, render, Component, createContext, Fragment } = preact;
const { useState, useEffect, useCallback, useMemo, useRef } = preactHooks;

// --- Navigo Router (from global/CDN) ---
// Assuming Navigo is available globally.

// --- Local Modules ---
import { db, getSetting, setSetting, THEME_CONFIG_KEY, CONTENT_TYPES } from './db.js';
import { generateTextWithOpenAI, generateTextWithGemini } from './ai.js';
import { sendEmail } from './email.js';

console.log("Admin JS Core Initialized: Preact, Navigo, and local modules imported.");
console.log("DB object:", db);
console.log("Navigo check:", typeof Navigo);

// --- Client-side Worker Sync Helper ---
async function syncAdminSettingsToWorker(settingsToSync, directConfig = null) {
    let workerUrlValue = directConfig?.cloudflareWorkerUrl;
    let adminTokenValue = directConfig?.adminSetupToken;
    if (!workerUrlValue) { try { workerUrlValue = await db.getSetting('cloudflareWorkerUrl'); } catch (e) { console.error(e); } }
    if (!adminTokenValue) { try { adminTokenValue = await db.getSetting('adminSetupToken'); } catch (e) { console.error(e); } }
    if (!workerUrlValue || !adminTokenValue) {
        console.error('Worker URL or Admin Setup Token not configured for sync.');
        return { success: false, error: 'Worker communication details missing in local CMS settings.' };
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
        const result = await response.json().catch(() => ({ success: false, error: `Worker returned non-JSON response (Status: ${response.status})`, details: response.statusText }));
        if (!response.ok || !result.success) {
            return { success: false, error: result.error || `Failed to sync settings to worker (Status: ${response.status}).`, details: result.details };
        }
        return { success: true, message: result.message || 'Settings synced to worker successfully.' };
    } catch (err) {
        console.error('Error syncing settings to worker:', err);
        return { success: false, error: 'Network error or other issue during worker sync.', details: err.message };
    }
}

// --- WebCrypto Helper & Utility Functions ---
async function generateSalt() { return crypto.getRandomValues(new Uint8Array(16)); }
function saltToHex(saltBuffer) { return Array.from(new Uint8Array(saltBuffer)).map(b => b.toString(16).padStart(2, '0')).join(''); }
function hexToSalt(saltHex) {
  if (!saltHex) return null;
  const bytes = new Uint8Array(saltHex.length / 2);
  for (let i = 0; i < saltHex.length; i += 2) { bytes[i / 2] = parseInt(saltHex.substring(i, i + 2), 16); }
  return bytes;
}
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]);
  const derivedBits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt, iterations: 150000, hash: "SHA-256" }, keyMaterial, 256);
  return saltToHex(new Uint8Array(derivedBits));
}
async function verifyPassword(enteredPassword, saltHex, storedHashHex) {
  const salt = hexToSalt(saltHex);
  if (!salt) return false;
  const hashOfEnteredPassword = await hashPassword(enteredPassword, salt);
  return hashOfEnteredPassword === storedHashHex;
}

// --- Helper function for active link class ---
function isActiveHelper(currentPath, targetPath, isExact = true) {
    const normalizedCurrentPath = currentPath === '' ? '/' : (currentPath.startsWith('/') ? currentPath : `/${currentPath}`);
    const normalizedTargetPath = targetPath === '' ? '/' : (targetPath.startsWith('/') ? targetPath : `/${targetPath}`);
    if (isExact) { return normalizedCurrentPath === normalizedTargetPath; }
    return normalizedCurrentPath.startsWith(normalizedTargetPath + (normalizedTargetPath === '/' ? '' : '/')) || normalizedCurrentPath === normalizedTargetPath;
}

// --- UI Components ---
const Header = ({ onLogout }) => (
  h('header', { class: 'admin-header' },
    h('div', { class: 'header-logo' }, 'CMS Admin'),
    h('button', { class: 'logout-button', onClick: onLogout }, 'Logout')
  )
);

const Sidebar = ({ currentPath, router }) => {
  const navItems = [
    { path: '/', label: 'Dashboard', icon: '🏠' }, { path: '/pages', label: 'Pages', icon: '📄' },
    { path: '/posts', label: 'Posts', icon: '✍️' }, { path: '/themes', label: 'Themes', icon: '🎨' },
    { path: '/plugins', label: 'Plugins', icon: '🔌' }, { path: '/analytics', label: 'Analytics', icon: '📊' },
    { path: '/backup', label: 'Backup', icon: '💾' }, { path: '/settings', label: 'Settings', icon: '⚙️' },
    { label: 'Tools', icon: '🛠️', pathBase: '/tools', subItems: [{ path: '/tools/email-test', label: 'Email Test', icon: '✉️' }] }
  ];
  const renderNavItem = (item) => {
    const activeClass = isActiveHelper(currentPath, item.path || item.pathBase, !item.subItems) ? 'active' : '';
    return h(Fragment, { key: item.label },
      h('a', {
        href: item.path ? router.generate(item.path.substring(1)) : '#', class: activeClass,
        onClick: (e) => { if (item.path) { e.preventDefault(); router.navigate(item.path); } else if (item.subItems) { e.preventDefault(); } }
      }, item.icon && h('span', { class: 'nav-icon' }, item.icon), item.label),
      item.subItems && h('ul', { class: `sidebar-submenu ${activeClass ? 'open' : ''}` }, item.subItems.map(renderNavItem))
    );
  };
  return h('aside', { class: 'admin-sidebar glassmorphic' }, h('nav', {}, navItems.map(renderNavItem)));
};

const ContentArea = ({ pageTitle, children }) => (
  h('main', { class: 'admin-content-area' },
    h('h1', { class: 'content-title' }, pageTitle),
    children || h('p', {}, `Content for ${pageTitle} will be rendered here.`)
  )
);

const Layout = ({ pageTitle, currentPath, onLogout, router, children }) => (
  h('div', { class: 'admin-layout' },
    h(Header, { onLogout }),
    h('div', { class: 'main-container' },
      h(Sidebar, { currentPath, router }),
      h(ContentArea, { pageTitle }, children)
    )
  )
);

const Login = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState(''); const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false); const [isFirstTimeSetup, setIsFirstTimeSetup] = useState(false);
  useEffect(() => { (async () => { try { setIsFirstTimeSetup(!await db.getSetting('adminPasswordHash')); } catch (e) { setError("Could not verify admin setup."); } })(); }, []);
  const handleSubmit = async (e) => {
    e.preventDefault(); setIsLoading(true); setError('');
    if (!password) { setError(isFirstTimeSetup ? 'Choose a password.' : 'Enter password.'); setIsLoading(false); return; }
    try {
      if (isFirstTimeSetup) {
        const salt = await generateSalt(); const saltHex = saltToHex(salt);
        const hashHex = await hashPassword(password, salt);
        await db.setSetting('adminSalt', saltHex); await db.setSetting('adminPasswordHash', hashHex);
        onLoginSuccess(true);
      } else {
        const saltHex = await db.getSetting('adminSalt'); const storedHashHex = await db.getSetting('adminPasswordHash');
        if (!saltHex || !storedHashHex) { setError('Admin password not set. Refresh for setup.'); setIsFirstTimeSetup(true); setIsLoading(false); return; }
        if (await verifyPassword(password, saltHex, storedHashHex)) { onLoginSuccess(false); } else { setError('Invalid password.'); }
      }
    } catch (err) { setError('An error occurred.'); } finally { setIsLoading(false); }
  };
  return h('div', { class: 'login-container' }, h('form', { class: 'login-form glassmorphic', onSubmit: handleSubmit },
    h('h1', { class: 'login-title' }, isFirstTimeSetup ? 'Set Admin Password' : 'Admin Login'),
    error && h('p', { class: 'login-error' }, error),
    h('input', { type: 'password', placeholder: 'Password', value: password, onInput: e => setPassword(e.target.value), class: 'login-input', disabled: isLoading }),
    h('button', { type: 'submit', class: 'login-button button-primary', disabled: isLoading }, isLoading ? 'Processing...' : (isFirstTimeSetup ? 'Save & Continue' : 'Login'))
  ));
};

const SetupWizard = ({ onSetupComplete }) => {
  const [state, setState] = useState({ siteName: '', adminEmailForBrevo: '', cloudflareWorkerUrl: '', visitorDataKvId: '', analyticsKvId: '', adminSetupToken: '' });
  const [error, setError] = useState(''); const [isLoading, setIsLoading] = useState(false); const [syncStatus, setSyncStatus] = useState('');
  const handleInput = (e) => setState({ ...state, [e.target.name]: e.target.value });
  const handleSubmit = async (e) => {
    e.preventDefault(); setIsLoading(true); setError(''); setSyncStatus('');
    const { siteName, adminEmailForBrevo, cloudflareWorkerUrl, visitorDataKvId, analyticsKvId, adminSetupToken } = state;
    if (!siteName||!adminEmailForBrevo||!cloudflareWorkerUrl||!visitorDataKvId||!analyticsKvId||!adminSetupToken) { setError('All fields are required.'); setIsLoading(false); return; }
    if (!/^\S+@\S+\.\S+$/.test(adminEmailForBrevo)) { setError('Valid email required.'); setIsLoading(false); return; }
    try {
      await Promise.all([
        db.setSetting('siteName', siteName), db.setSetting('adminEmail', adminEmailForBrevo), db.setSetting('ADMIN_EMAIL_BREVO', adminEmailForBrevo),
        db.setSetting('cloudflareWorkerUrl', cloudflareWorkerUrl), db.setSetting('cloudflareKvVisitorDataId', visitorDataKvId),
        db.setSetting('cloudflareKvAnalyticsId', analyticsKvId), db.setSetting('adminSetupToken', adminSetupToken)
      ]);
      setSyncStatus('Attempting Worker sync...');
      const syncResult = await syncAdminSettingsToWorker({ siteName, adminEmailForBrevo }, { cloudflareWorkerUrl, adminSetupToken });
      if (syncResult.success) { setSyncStatus('Worker sync successful.'); await db.setSetting('initialSetupComplete', true); onSetupComplete(); }
      else { setError(`Local save OK, Worker sync failed: ${syncResult.error}. Retry in Settings.`); await db.setSetting('initialSetupComplete', true); onSetupComplete(); }
    } catch (err) { setError('Failed to save settings.'); } finally { setIsLoading(false); }
  };
  const FormInput = ({label, id, type='text', value, helpText=''}) => h('div',{class:'form-group'},h('label',{for:id},label+(helpText?' *':'')),h('input',{type,id,name:id,value,onInput:handleInput,required:true,placeholder:label}),helpText&&h('p',{class:'wizard-note'},helpText));
  return h('div',{class:'setup-wizard-container'},h('div',{class:'setup-wizard-card glassmorphic'},
    h('h1',{class:'wizard-title'},'CMS Initial Setup'),h('p',{class:'wizard-subtitle'},'Configure essential details.'),
    error&&h('p',{class:'login-error'},error),syncStatus&&h('p',{class:'info-message'},syncStatus),
    h('form',{onSubmit:handleSubmit},
      h(FormInput,{label:"Site Name",id:"siteName",value:state.siteName}),
      h(FormInput,{label:"Admin Email (Brevo Sender)",id:"adminEmailForBrevo",type:"email",value:state.adminEmailForBrevo}),
      h(FormInput,{label:"Cloudflare Worker URL",id:"cloudflareWorkerUrl",type:"url",value:state.cloudflareWorkerUrl,placeholder:"https://worker.user.workers.dev"}),
      h(FormInput,{label:"KV ID (Visitor Data)",id:"visitorDataKvId",value:state.visitorDataKvId}),
      h(FormInput,{label:"KV ID (Analytics)",id:"analyticsKvId",value:state.analyticsKvId}),
      h(FormInput,{label:"Worker Admin Token",id:"adminSetupToken",type:"password",value:state.adminSetupToken,helpText:"Secret for initial setup calls."}),
      h('p',{class:'wizard-note'},'Ensure Worker secrets (API keys, Admin Token) & KV bindings are set in Cloudflare.'),
      h('button',{type:'submit',class:'wizard-button button-primary',disabled:isLoading},isLoading?'Saving...':'Complete Setup')
  )));
};

// --- ContentListPage Component ---
const ContentListPage = ({ contentType, router }) => {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const listPageTitle = `Manage ${contentType.charAt(0).toUpperCase() + contentType.slice(1)}s`;

  const fetchItems = useCallback(async () => {
    setIsLoading(true); setError('');
    try { setItems(await db.getAllContentByType(contentType) || []); }
    catch (err) { setError(`Failed to load ${contentType}s.`); console.error(err); }
    finally { setIsLoading(false); }
  }, [contentType]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (itemId) => {
    if (window.confirm(`Delete this ${contentType}?`)) {
      try { await db.deleteContent(itemId); fetchItems(); }
      catch (err) { setError(`Failed to delete ${contentType}.`); console.error(err); }
    }
  };

  return h('div', { class: 'content-list-page' },
    h('div', { class: 'content-list-header' },
      h('h2', {}, listPageTitle),
      h('button', { class: 'button-primary', onClick: () => router.navigate(`/${contentType}s/new`) }, `Create New ${contentType}`)
    ),
    error && h('p', { class: 'login-error list-error' }, error),
    isLoading && h('p', { class: 'centered-container' }, 'Loading content...'),
    !isLoading && !error && !items.length && h('p', { class: 'no-content-message glassmorphic' }, `No ${contentType}s found. Create one!`),
    !isLoading && !error && items.length > 0 && h('ul', { class: 'content-item-list' },
      items.map(item => h('li', { key: item.id, class: 'content-item card' },
        h('div', { class: 'content-item-main' },
          h('span', { class: 'content-item-title' }, item.title || `Untitled ${contentType}`),
          h('div', { class: 'content-item-meta' },
            item.slug && h('span', { class: 'content-item-slug' }, `/${item.slug}`),
            (item.updatedAt || item.createdAt) && h('span', { class: 'content-item-date' }, `Updated: ${new Date(item.updatedAt || item.createdAt).toLocaleDateString()}`)
          )
        ),
        h('div', { class: 'content-item-actions' },
          h('button', { class: 'button-edit', onClick: () => router.navigate(`/${contentType}s/edit/${item.id}`) }, 'Edit'),
          h('button', { class: 'button-delete', onClick: () => handleDelete(item.id) }, 'Delete')
        )
      )))
  );
};

// --- ContentEditorPage Component ---
const ContentEditorPage = ({ contentType, contentId: contentIdProp, router }) => {
  const contentId = contentIdProp ? Number(contentIdProp) : null;
  const isNew = !contentId;
  const [title, setTitle] = useState(''); const [slug, setSlug] = useState('');
  const [htmlContent, setHtmlContent] = useState(''); const [isLoading, setIsLoading] = useState(!isNew);
  const [error, setError] = useState('');
  const editorPageTitle = `${isNew ? 'Create New' : 'Edit'} ${contentType.charAt(0).toUpperCase() + contentType.slice(1)}`;

  useEffect(() => {
    if (!isNew && contentId) {
      setIsLoading(true);
      db.getContentById(contentId)
        .then(item => {
          if (item) { setTitle(item.title||''); setSlug(item.slug||''); setHtmlContent(item.content||''); }
          else { setError(`${contentType} not found.`); }
        })
        .catch(err => setError(`Failed to load ${contentType}.`))
        .finally(() => setIsLoading(false));
    } else { setTitle(''); setSlug(''); setHtmlContent(''); setIsLoading(false); }
  }, [contentType, contentId, isNew]);

  const generateSlugUtility = (str) => str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-');
  const handleTitleChange = (e) => { const newTitle=e.target.value; setTitle(newTitle); if(isNew||!slug||slug===generateSlugUtility(title)) setSlug(generateSlugUtility(newTitle)); };
  const handleSlugChange = (e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, ''));

  const handleSubmit = async (e) => {
    e.preventDefault(); setIsLoading(true); setError('');
    if (!title.trim() || !slug.trim()) { setError('Title and Slug are required.'); setIsLoading(false); return; }
    const now = new Date().toISOString();
    const contentData = { type: contentType, title: title.trim(), slug: slug.trim(), content: htmlContent, updatedAt: now };
    try {
      if (isNew) { contentData.createdAt = now; await db.addContent(contentData); }
      else { await db.updateContent(contentId, contentData); }
      router.navigate(`/${contentType}s`);
    } catch (err) { setError(`Failed to save ${contentType}.`); setIsLoading(false); console.error(err); }
  };

  if (isLoading&&!isNew) return h('p',{class:'centered-container'},`Loading ${contentType} editor...`);
  if (error&&!isNew&&!title&&!isLoading) return h('p',{class:'login-error centered-container'},error);

  return h('div', { class: 'content-editor-page' },
    h('h2', {class: 'editor-title'}, editorPageTitle),
    error && !isLoading && h('p', { class: 'login-error editor-error-banner' }, error),
    h('form', { onSubmit: handleSubmit, class: 'editor-form card' },
      h('div',{class:'form-group'}, h('label',{for:'title'},'Title'), h('input',{type:'text',id:'title',value:title,onInput:handleTitleChange,required:true,disabled:isLoading})),
      h('div',{class:'form-group'}, h('label',{for:'slug'},'Slug'), h('input',{type:'text',id:'slug',value:slug,onInput:handleSlugChange,required:true,disabled:isLoading})),
      h('div',{class:'form-group'}, h('label',{for:'htmlContent'},'Content'),
        h('textarea',{id:'htmlContent',value:htmlContent,onInput:e=>setHtmlContent(e.target.value),rows:15,disabled:isLoading,placeholder:'Enter content (textarea for now)'})
      ),
      h('button',{type:'submit',class:'button-primary',disabled:isLoading},isLoading?'Saving...':`Save ${contentType}`)
  ));
};

// --- Main App Component ---
const App = () => {
  const [dbReady, setDbReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(true);
  const [pageTitle, setPageTitle] = useState('Loading...');
  const [currentPath, setCurrentPath] = useState(window.location.hash.substring(1) || '/');
  const [activeComponent, setActiveComponent] = useState(null);
  const [activeComponentProps, setActiveComponentProps] = useState({});

  const router = useMemo(() => new Navigo('/', { hash: true }), []);

  const checkInitialAuth = async () => {
    const sessionActive = localStorage.getItem('cms_auth_session') === 'true';
    const adminPassStored = await db.getSetting('adminPasswordHash');
    if (sessionActive && adminPassStored) { setIsAuthenticated(true); await checkSetupStatus(); }
    else { setIsAuthenticated(false); if (!adminPassStored) setNeedsSetup(true); }
  };

  const checkSetupStatus = async () => {
    try { setNeedsSetup(!(await db.getSetting('initialSetupComplete') === true)); }
    catch (e) { console.error("Error checking setup status:", e); setNeedsSetup(true); }
  };

  useEffect(() => {
    const initDb = async () => {
      try { await db.open(); setDbReady(true); console.log("DB opened."); await checkInitialAuth(); }
      catch (e) { console.error("Failed to open DB:", e); setPageTitle("Error: DB failed!"); }
    };
    initDb();

    const commonRouteActions = (title, component = null, componentProps = {}) => {
        setPageTitle(title); setActiveComponent(() => component); setActiveComponentProps(componentProps);
    };

    const routeHandlers = {
      '/': () => commonRouteActions('Dashboard'),
      '/pages': () => commonRouteActions('Pages', ContentListPage, { contentType: 'page' }),
      '/pages/new': () => commonRouteActions('New Page', ContentEditorPage, { contentType: 'page' }),
      '/pages/edit/:id': (match) => commonRouteActions('Edit Page', ContentEditorPage, { contentType: 'page', contentId: match.data.id }),
      '/posts': () => commonRouteActions('Posts', ContentListPage, { contentType: 'post' }),
      '/posts/new': () => commonRouteActions('New Post', ContentEditorPage, { contentType: 'post' }),
      '/posts/edit/:id': (match) => commonRouteActions('Edit Post', ContentEditorPage, { contentType: 'post', contentId: match.data.id }),
      '/themes': () => commonRouteActions('Themes'),
      '/plugins': () => commonRouteActions('Plugins'),
      '/analytics': () => commonRouteActions('Analytics'),
      '/backup': () => commonRouteActions('Backup'),
      '/settings': () => commonRouteActions('Settings'),
      '/tools/email-test': () => commonRouteActions('Email Test'),
    };

    router.on(routeHandlers).notFound(() => commonRouteActions('404 - Not Found')).hooks({
      after: (match) => setCurrentPath(match && match.url ? `/${match.url}` : (window.location.hash.substring(1) || '/'))
    });

    const initialPath = window.location.hash.substring(1) || '/';
    router.resolve(initialPath);
    if (!router.lastResolvedMatch && initialPath === '/') commonRouteActions('Dashboard');

    const handleHashChange = () => router.resolve(window.location.hash.substring(1) || '/');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [router]);

  const handleLoginSuccess = async (isFirstTime) => {
    localStorage.setItem('cms_auth_session', 'true'); setIsAuthenticated(true);
    if (isFirstTime) { setNeedsSetup(true); router.navigate('/'); }
    else { await checkSetupStatus(); router.navigate(currentPath || '/');}
  };

  const handleLogout = () => {
    localStorage.removeItem('cms_auth_session'); setIsAuthenticated(false);
    setPageTitle('Login'); setCurrentPath('/'); router.navigate('/');
  };

  const handleSetupComplete = async () => {
    await db.setSetting('initialSetupComplete', true); setNeedsSetup(false);
    router.navigate('/');
  };

  if (!dbReady) return h('div', { class: 'centered-container' }, 'Initializing Database...');
  if (!isAuthenticated) return h(Login, { onLoginSuccess: handleLoginSuccess });
  if (needsSetup) return h(SetupWizard, { onSetupComplete: handleSetupComplete });

  let dynamicContent = null;
  const ActiveCmp = activeComponent;
  if (ActiveCmp) { dynamicContent = h(ActiveCmp, { ...activeComponentProps, router: router }); }
  else if (pageTitle === 'Dashboard') { dynamicContent = h('div',{class:'dashboard-placeholder card'},h('h2',{},'Dashboard'),h('p',{},'Welcome! Content management is now active.')); }
  else { dynamicContent = h('p',{},`Placeholder for ${pageTitle}.`); }

  return h(Layout, { pageTitle, currentPath, onLogout, router }, dynamicContent);
};

// Render the App
const appRoot = document.getElementById('admin-app');
if (appRoot) { render(h(App), appRoot); }
else { console.error("Admin app root (#admin-app) not found."); }
