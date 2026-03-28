/**
 * NADSOC — Core Application Logic & SPA Router
 */
const App = (() => {
    const ROUTES = {
        '/':             { page: 'dashboard', title: 'Dashboard', roles: ['admin','operator','auditor','superadmin'] },
        '/members':      { page: 'members',   title: 'Members',   roles: ['admin','operator','auditor','superadmin'] },
        '/loans':        { page: 'loans',     title: 'Loans',     roles: ['admin','operator','auditor','superadmin'] },
        '/deposits':     { page: 'deposits',  title: 'CD & Share', roles: ['admin','operator','auditor','superadmin'] },
        '/demand':       { page: 'demand',    title: 'Demand & Recovery', roles: ['admin','operator','auditor','superadmin'] },
        '/fd':           { page: 'fd',        title: 'Fixed Deposits', roles: ['admin','operator','auditor','superadmin'] },
        '/surety':       { page: 'surety',    title: 'Surety',    roles: ['admin','operator','auditor','superadmin'] },
        '/settlement':   { page: 'settlement', title: 'Settlement', roles: ['admin','superadmin'] },
        '/expenses':     { page: 'expenses',  title: 'Expenses',  roles: ['admin','operator','auditor','superadmin'] },
        '/forms':        { page: 'forms',     title: 'Forms Register', roles: ['admin','operator','auditor','superadmin'] },
        '/reports':      { page: 'reports',   title: 'Reports',   roles: ['admin','operator','auditor','superadmin'] },
        '/audit':        { page: 'audit',     title: 'Audit Log', roles: ['admin','auditor','superadmin'] },
        '/admin':        { page: 'admin',     title: 'Admin Panel', roles: ['admin','superadmin'] },
    };

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

    function init() {
        if (!Auth.isLoggedIn()) { window.location.href = '/index.html'; return; }
        renderLayout();
        window.addEventListener('popstate', () => navigate(window.location.pathname, false));
        navigate(window.location.pathname);
    }

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
                    <div class="flex justify-center items-center" style="height:200px"><div class="spinner spinner-lg"></div></div>
                </main>
                <footer class="app-footer">© 2026 NAD Employees Co-op. Credit Society Ltd., Karanja | v1.0.0</footer>
            </div>
        </div>`;
        renderSidebar();
    }

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

    function navigate(path, pushState = true) {
        const route = ROUTES[path] || ROUTES['/'];
        if (pushState) history.pushState({}, '', path);
        document.getElementById('page-title').textContent = route.title;
        document.title = `${route.title} — NADSOC`;
        // Update active nav
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.toggle('active', el.dataset.path === path);
        });
        // Close mobile sidebar
        document.getElementById('sidebar').classList.remove('open');
        // Load page content (placeholder until Phase 4)
        const content = document.getElementById('content-area');
        content.innerHTML = `<div class="fade-in"><div class="card"><h2 class="text-xl font-semibold mb-4">${route.title}</h2>
            <p class="text-muted">This module will be built in Phase 4. Database and backend APIs will be implemented in Phases 2-3.</p></div></div>`;
    }

    return { init, navigate };
})();
