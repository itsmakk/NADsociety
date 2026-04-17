/**
 * NADSOC — Core Application Logic & SPA Router
 * Handles layout rendering, sidebar navigation, and lazy page module loading.
 */
const App = (() => {
    /* ========================================================================
       ROUTE DEFINITIONS
       ======================================================================== */
    const ROUTES = {
        '/':             { page: 'dashboard',  title: 'Dashboard',          roles: ['admin','operator','auditor','superadmin'] },
        '/members':      { page: 'members',    title: 'Members',            roles: ['admin','operator','auditor','superadmin'] },
        '/members/add':  { page: 'members',    title: 'Add Member',         roles: ['admin','operator','superadmin'], sub: 'add' },
        '/members/view': { page: 'members',    title: 'Member Profile',     roles: ['admin','operator','auditor','superadmin'], sub: 'view' },
        '/members/edit': { page: 'members',    title: 'Edit Member',        roles: ['admin','operator','superadmin'], sub: 'edit' },
        '/members/upload': { page: 'members',  title: 'Bulk Upload',        roles: ['admin','superadmin'], sub: 'upload' },
        '/loans':        { page: 'loans',      title: 'Loans',              roles: ['admin','operator','auditor','superadmin'] },
        '/loans/create': { page: 'loans',      title: 'New Loan',           roles: ['admin','operator','superadmin'], sub: 'create' },
        '/loans/view':   { page: 'loans',      title: 'Loan Detail',        roles: ['admin','operator','auditor','superadmin'], sub: 'view' },
        '/deposits':     { page: 'deposits',   title: 'CD & Share',         roles: ['admin','operator','auditor','superadmin'] },
        '/demand':       { page: 'demand',     title: 'Demand & Recovery',  roles: ['admin','operator','auditor','superadmin'] },
        '/fd':           { page: 'fd',         title: 'Fixed Deposits',     roles: ['admin','operator','auditor','superadmin'] },
        '/surety':       { page: 'surety',     title: 'Surety',             roles: ['admin','operator','auditor','superadmin'] },
        '/settlement':   { page: 'settlement', title: 'Settlement',         roles: ['admin','superadmin'] },
        '/expenses':     { page: 'expenses',   title: 'Expenses',           roles: ['admin','operator','auditor','superadmin'] },
        '/forms':        { page: 'forms',      title: 'Forms Register',     roles: ['admin','operator','auditor','superadmin'] },
        '/reports':      { page: 'reports',    title: 'Reports',            roles: ['admin','operator','auditor','superadmin'] },
        '/audit':        { page: 'audit',      title: 'Audit Log',          roles: ['admin','auditor','superadmin'] },
        '/admin':        { page: 'admin',      title: 'Admin Panel',        roles: ['admin','superadmin'] },
    };

    /* ========================================================================
       SIDEBAR NAV CONFIG
       ======================================================================== */
    const NAV_SECTIONS = [
        { title: 'Main', items: [
            { path: '/', icon: '📊', label: 'Dashboard' },
        ]},
        { title: 'Members', items: [
            { path: '/members', icon: '👥', label: 'Members' },
        ]},
        { title: 'Finance', items: [
            { path: '/loans', icon: '🏦', label: 'Loans' },
            { path: '/deposits', icon: '💰', label: 'CD & Share' },
            { path: '/fd', icon: '📋', label: 'Fixed Deposits' },
            { path: '/demand', icon: '📅', label: 'Demand & Recovery' },
            { path: '/surety', icon: '🤝', label: 'Surety' },
            { path: '/settlement', icon: '📑', label: 'Settlement' },
        ]},
        { title: 'Operations', items: [
            { path: '/expenses', icon: '💸', label: 'Expenses' },
            { path: '/forms', icon: '📝', label: 'Forms Register' },
        ]},
        { title: 'Reporting', items: [
            { path: '/reports', icon: '📈', label: 'Reports' },
            { path: '/audit', icon: '🔍', label: 'Audit Log' },
        ]},
        { title: 'Settings', items: [
            { path: '/admin', icon: '⚙️', label: 'Admin Panel' },
        ]},
    ];

    /* ========================================================================
       STATE
       ======================================================================== */
    let _currentPath = '/';
    let _loadedScripts = {};
    let _params = {};

    function getParams() { return _params; }
    function getCurrentPath() { return _currentPath; }

    /* ========================================================================
       INITIALIZATION
       ======================================================================== */
    function init() {
        if (!Auth.isLoggedIn()) { window.location.href = '/index.html'; return; }
        renderLayout();
        window.addEventListener('popstate', () => navigate(location.pathname + location.search, false));
        navigate(location.pathname + location.search, false);
    }

    /* ========================================================================
       LAYOUT RENDERING
       ======================================================================== */
    function renderLayout() {
        const user = Auth.getUser();
        const initials = (user?.full_name || 'U').split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
        document.body.innerHTML = `
        <div class="app-layout">
            <aside class="sidebar" id="sidebar">
                <div class="sidebar-brand">
                    <img src="/assets/logo.png" alt="NADSOC" onerror="this.style.display='none'"/>
                    <span class="sidebar-brand-text">NADSOC</span>
                </div>
                <nav class="sidebar-nav" id="sidebar-nav"></nav>
                <div style="padding:var(--sp-4);border-top:1px solid rgba(255,255,255,0.1);">
                    <button class="btn btn-sm" style="width:100%;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);" onclick="Auth.logout()">🚪 Logout</button>
                </div>
            </aside>
            <div class="main-content">
                <header class="top-header">
                    <div class="header-left">
                        <button class="hamburger" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
                        <h1 class="page-title" id="page-title">Dashboard</h1>
                    </div>
                    <div class="header-right">
                        <div class="header-search" id="header-search">
                            <span class="search-icon">🔍</span>
                            <input type="text" placeholder="Search members..." id="global-search-input" autocomplete="off"/>
                            <div class="search-results" id="global-search-results"></div>
                        </div>
                        <div class="user-info">
                            <div class="user-details">
                                <div class="user-name">${user?.full_name || 'User'}</div>
                                <div class="user-role">${user?.role || ''}</div>
                            </div>
                            <div class="user-avatar">${initials}</div>
                        </div>
                    </div>
                </header>
                <main class="content-area fade-in" id="content-area">
                    ${Utils.renderLoading()}
                </main>
                <footer class="app-footer">© 2026 NAD Employees Co-op. Credit Society Ltd., Karanja | v1.0.0</footer>
            </div>
        </div>`;
        renderSidebar();
        initGlobalSearch();
    }

    /* ========================================================================
       SIDEBAR RENDERING
       ======================================================================== */
    function renderSidebar() {
        const role = Auth.getRole();
        const nav = document.getElementById('sidebar-nav');
        let html = '';
        NAV_SECTIONS.forEach(section => {
            const visibleItems = section.items.filter(item => {
                const route = ROUTES[item.path];
                return !route || route.roles.includes(role);
            });
            if (visibleItems.length === 0) return;
            html += `<div class="nav-section-title">${section.title}</div>`;
            visibleItems.forEach(item => {
                html += `<div class="nav-item" data-path="${item.path}" onclick="App.navigate('${item.path}')">
                    <span class="nav-item-icon">${item.icon}</span><span>${item.label}</span></div>`;
            });
        });
        nav.innerHTML = html;
    }

    /* ========================================================================
       GLOBAL MEMBER SEARCH
       ======================================================================== */
    function initGlobalSearch() {
        const input = document.getElementById('global-search-input');
        const results = document.getElementById('global-search-results');
        if (!input || !results) return;

        const doSearch = Utils.debounce(async (q) => {
            if (!q || q.length < 2) { results.classList.remove('show'); return; }
            try {
                const data = await API.get(`/members/search?q=${encodeURIComponent(q)}`);
                const members = data.members || data || [];
                if (members.length === 0) {
                    results.innerHTML = '<div class="search-result-item"><span class="text-muted">No results</span></div>';
                } else {
                    results.innerHTML = members.slice(0, 8).map(m =>
                        `<div class="search-result-item" onclick="App.navigate('/members/view?id=${m.gen_no}')">
                            <span class="result-gen">${m.gen_no}</span>
                            <span class="result-name">${m.name}</span>
                        </div>`
                    ).join('');
                }
                results.classList.add('show');
            } catch {
                results.classList.remove('show');
            }
        }, 350);

        input.addEventListener('input', e => doSearch(e.target.value.trim()));
        input.addEventListener('blur', () => setTimeout(() => results.classList.remove('show'), 200));
        input.addEventListener('focus', () => { if (input.value.trim().length >= 2) doSearch(input.value.trim()); });
    }

    /* ========================================================================
       NAVIGATION / ROUTING
       ======================================================================== */
    function navigate(fullPath, pushState = true) {
        // Parse path and query params
        const [path, queryStr] = fullPath.split('?');
        _params = {};
        if (queryStr) {
            queryStr.split('&').forEach(p => {
                const [k, v] = p.split('=');
                _params[decodeURIComponent(k)] = decodeURIComponent(v || '');
            });
        }

        // Find matching route — try exact, then base path
        let route = ROUTES[path];
        if (!route) {
            const basePath = '/' + (path.split('/')[1] || '');
            route = ROUTES[basePath] || ROUTES['/'];
        }

        _currentPath = path;
        if (pushState) history.pushState({}, '', fullPath);

        // Update page title
        document.getElementById('page-title').textContent = route.title;
        document.title = `${route.title} — NADSOC`;

        // Update active nav
        const basePath = '/' + (path.split('/').filter(Boolean)[0] || '');
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.toggle('active', el.dataset.path === basePath || (basePath === '/' && el.dataset.path === '/'));
        });

        // Close mobile sidebar
        document.getElementById('sidebar').classList.remove('open');

        // Load page module
        loadPage(route.page, route.sub);
    }

    /* ========================================================================
       PAGE MODULE LOADER
       ======================================================================== */
    function loadPage(pageName, subView) {
        const content = document.getElementById('content-area');
        content.innerHTML = Utils.renderLoading();

        const scriptPath = `/js/pages/${pageName}.js`;

        if (_loadedScripts[pageName]) {
            // Already loaded — just render
            renderPage(pageName, subView);
            return;
        }

        // Dynamically load page script
        const script = document.createElement('script');
        script.src = scriptPath;
        script.onload = () => {
            _loadedScripts[pageName] = true;
            renderPage(pageName, subView);
        };
        script.onerror = () => {
            content.innerHTML = `<div class="card fade-in">
                <h2 class="text-xl font-semibold mb-4">${pageName.charAt(0).toUpperCase() + pageName.slice(1)}</h2>
                <p class="text-muted">This module is being built. Please check back soon.</p>
            </div>`;
        };
        document.head.appendChild(script);
    }

    function renderPage(pageName, subView) {
        const content = document.getElementById('content-area');
        const pageModule = window.Pages?.[pageName];

        if (pageModule && typeof pageModule.render === 'function') {
            content.innerHTML = '<div class="fade-in">' + pageModule.render(subView, _params) + '</div>';
            // Call init if page has post-render logic
            if (typeof pageModule.init === 'function') {
                setTimeout(() => pageModule.init(subView, _params), 0);
            }
        } else {
            content.innerHTML = `<div class="card fade-in">
                <h2 class="text-xl font-semibold mb-4">${pageName.charAt(0).toUpperCase() + pageName.slice(1)}</h2>
                <p class="text-muted">Module loading error. Please refresh.</p>
            </div>`;
        }
    }

    return { init, navigate, getParams, getCurrentPath };
})();

// Global Pages namespace for page modules
window.Pages = window.Pages || {};
