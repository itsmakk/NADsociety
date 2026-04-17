/**
 * NADSOC — Admin Panel Page Module
 * Tabbed configuration panel for Users, Demand, Loan, FD, Member Structure, Surety, System Controls.
 */
window.Pages = window.Pages || {};
window.Pages.admin = (() => {
    let _users = [];
    let _config = {};

    function render() {
        return `
        <div class="card" id="admin-container">
            <div class="tab-bar">
                <button class="tab-item active" data-tab="tab-users">👤 Users</button>
                <button class="tab-item" data-tab="tab-demand-cfg">📅 Demand Config</button>
                <button class="tab-item" data-tab="tab-loan-cfg">🏦 Loan Config</button>
                <button class="tab-item" data-tab="tab-fd-cfg">📋 FD Schemes</button>
                <button class="tab-item" data-tab="tab-structure">🏢 Member Structure</button>
                <button class="tab-item" data-tab="tab-surety-cfg">🤝 Surety Config</button>
                <button class="tab-item" data-tab="tab-system">⚙️ System Controls</button>
            </div>

            <!-- Users Tab -->
            <div class="tab-panel active" id="tab-users">
                <div class="flex items-center justify-between mb-4">
                    <p class="text-sm text-muted">Manage system users and role assignments</p>
                    <button class="btn btn-primary" onclick="Pages.admin.showAddUser()">➕ Add User</button>
                </div>
                <div id="users-table">${Utils.renderLoading()}</div>
            </div>

            <!-- Demand Config -->
            <div class="tab-panel" id="tab-demand-cfg">
                <h3 class="form-section-title" style="margin-top:0">Monthly Demand Amounts</h3>
                <div class="form-row">
                    ${Utils.formField({ name: 'cfg_cd_amount', label: 'CD Amount (₹)', type: 'number', value: '600', min: 0 })}
                    ${Utils.formField({ name: 'cfg_share_amount', label: 'Share Amount (₹)', type: 'number', value: '100', min: 0 })}
                    ${Utils.formField({ name: 'cfg_max_share', label: 'Max Share Balance (₹)', type: 'number', value: '8000', min: 0 })}
                </div>
                <h3 class="form-section-title">Recovery Allocation Priority</h3>
                <div class="alert alert-info mb-4"><span>ℹ️</span><span>Set the order in which recovery amounts are allocated. Default: CD → Share → Interest → Principal.</span></div>
                <div class="form-row">
                    ${Utils.formField({ name: 'cfg_alloc_1', label: 'Priority 1', type: 'select', value: 'CD', options: ['CD','Share','Interest','Principal'] })}
                    ${Utils.formField({ name: 'cfg_alloc_2', label: 'Priority 2', type: 'select', value: 'Share', options: ['CD','Share','Interest','Principal'] })}
                    ${Utils.formField({ name: 'cfg_alloc_3', label: 'Priority 3', type: 'select', value: 'Interest', options: ['CD','Share','Interest','Principal'] })}
                    ${Utils.formField({ name: 'cfg_alloc_4', label: 'Priority 4', type: 'select', value: 'Principal', options: ['CD','Share','Interest','Principal'] })}
                </div>
                <div class="form-actions">
                    <button class="btn btn-primary" onclick="Pages.admin.saveDemandConfig()">💾 Save Demand Config</button>
                </div>
            </div>

            <!-- Loan Config -->
            <div class="tab-panel" id="tab-loan-cfg">
                <h3 class="form-section-title" style="margin-top:0">Long Loan (LL) Configuration</h3>
                <div class="form-row">
                    ${Utils.formField({ name: 'cfg_ll_max', label: 'Max Amount (₹)', type: 'number', value: '400000' })}
                    ${Utils.formField({ name: 'cfg_ll_rate', label: 'Interest Rate (%)', type: 'number', value: '12', step: 0.5 })}
                    ${Utils.formField({ name: 'cfg_ll_tenure', label: 'Max Tenure (months)', type: 'number', value: '100' })}
                </div>
                <h3 class="form-section-title">Short Loan (SL) Configuration</h3>
                <div class="form-row">
                    ${Utils.formField({ name: 'cfg_sl_max', label: 'Max Amount (₹)', type: 'number', value: '50000' })}
                    ${Utils.formField({ name: 'cfg_sl_rate', label: 'Interest Rate (%)', type: 'number', value: '12', step: 0.5 })}
                    ${Utils.formField({ name: 'cfg_sl_tenure', label: 'Max Tenure (months)', type: 'number', value: '30' })}
                </div>
                <h3 class="form-section-title">Deposit Requirements</h3>
                <div class="form-row">
                    ${Utils.formField({ name: 'cfg_cd_pct', label: 'CD Requirement (% of Loan)', type: 'number', value: '20', min: 0, max: 100 })}
                    ${Utils.formField({ name: 'cfg_share_req', label: 'Share Requirement (₹)', type: 'number', value: '8000' })}
                </div>
                <div class="form-actions">
                    <button class="btn btn-primary" onclick="Pages.admin.saveLoanConfig()">💾 Save Loan Config</button>
                </div>
            </div>

            <!-- FD Schemes -->
            <div class="tab-panel" id="tab-fd-cfg">
                <div class="flex items-center justify-between mb-4">
                    <p class="text-sm text-muted">Configure FD interest rates by tenure</p>
                    <button class="btn btn-secondary" onclick="Pages.admin.addFDScheme()">➕ Add Scheme</button>
                </div>
                <div id="fd-schemes-table"></div>
                <div class="form-actions">
                    <button class="btn btn-primary" onclick="Pages.admin.saveFDSchemes()">💾 Save FD Schemes</button>
                </div>
            </div>

            <!-- Member Structure -->
            <div class="tab-panel" id="tab-structure">
                <div class="grid grid-2">
                    <div>
                        <h3 class="form-section-title" style="margin-top:0">Employee Types</h3>
                        <div id="emp-types-list"></div>
                    </div>
                    <div>
                        <h3 class="form-section-title" style="margin-top:0">Parts / Departments</h3>
                        <div id="parts-list"></div>
                        <div class="flex gap-2 mt-4">
                            ${Utils.formField({ name: 'new_part', label: '', placeholder: 'New part name...' })}
                            <button class="btn btn-sm btn-primary" onclick="Pages.admin.addPart()" style="align-self:flex-end;margin-bottom:1.25rem">➕</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Surety Config -->
            <div class="tab-panel" id="tab-surety-cfg">
                <h3 class="form-section-title" style="margin-top:0">Surety Rules</h3>
                <div class="form-row">
                    ${Utils.formField({ name: 'cfg_max_sureties', label: 'Max Sureties per LL', type: 'number', value: '2', min: 1, max: 5 })}
                    ${Utils.formField({ name: 'cfg_max_exposure', label: 'Max Exposure Limit (₹)', type: 'number', value: '800000' })}
                    ${Utils.formField({ name: 'cfg_default_threshold', label: 'Default Threshold (cycles)', type: 'number', value: '3', min: 1 })}
                </div>
                <div class="form-row">
                    ${Utils.formField({ name: 'cfg_surety_trigger', label: 'Auto Surety Trigger', type: 'select', value: 'enabled', options: [{value:'enabled',label:'Enabled'},{value:'disabled',label:'Disabled'}] })}
                </div>
                <div class="form-actions">
                    <button class="btn btn-primary" onclick="Pages.admin.saveSuretyConfig()">💾 Save Surety Config</button>
                </div>
            </div>

            <!-- System Controls -->
            <div class="tab-panel" id="tab-system">
                <h3 class="form-section-title" style="margin-top:0">Month Management</h3>
                <div class="form-row">
                    ${Utils.formField({ name: 'cfg_current_month', label: 'Current Open Month', type: 'month', value: Utils.getCurrentMonthYear() })}
                    ${Utils.formField({ name: 'cfg_freeze_demand', label: 'Freeze Demand After Generation', type: 'select', value: 'yes', options: [{value:'yes',label:'Yes — Locked'},{value:'no',label:'No — Editable'}] })}
                </div>
                <div class="flex gap-3 mb-6">
                    <button class="btn btn-secondary" onclick="Pages.admin.lockMonth()">🔒 Lock Current Month</button>
                </div>

                <h3 class="form-section-title">Financial Controls</h3>
                <div class="form-row">
                    ${Utils.formField({ name: 'cfg_rounding', label: 'Rounding Rule', type: 'select', value: 'round', options: [{value:'round',label:'Round (Standard)'},{value:'floor',label:'Floor (Down)'},{value:'ceil',label:'Ceiling (Up)'}] })}
                    ${Utils.formField({ name: 'cfg_backdate', label: 'Allow Backdated Entries', type: 'select', value: 'no', options: [{value:'yes',label:'Yes'},{value:'no',label:'No'}] })}
                </div>

                <h3 class="form-section-title">Password & Session Policy</h3>
                <div class="form-row">
                    ${Utils.formField({ name: 'cfg_session_timeout', label: 'Session Timeout (minutes)', type: 'number', value: '30', min: 5 })}
                    ${Utils.formField({ name: 'cfg_max_attempts', label: 'Max Login Attempts', type: 'number', value: '5', min: 3 })}
                </div>

                <div class="form-actions">
                    <button class="btn btn-primary" onclick="Pages.admin.saveSystemConfig()">💾 Save System Config</button>
                </div>
            </div>
        </div>`;
    }

    function init() {
        Utils.initTabs('admin-container');
        loadUsers();
        loadConfig();
        renderFDSchemes();
        renderStructure();
    }

    /* ========================================================================
       USERS Management
       ======================================================================== */
    async function loadUsers() {
        const el = document.getElementById('users-table');
        if (!el) return;
        try {
            const data = await API.get('/admin/users');
            _users = data.users || data.data || [];
        } catch {
            _users = [
                { user_id: 1, username: 'admin', full_name: 'System Administrator', role: 'admin', status: 'active', created_date: '2026-01-01' },
                { user_id: 2, username: 'operator1', full_name: 'Operator One', role: 'operator', status: 'active', created_date: '2026-01-15' },
                { user_id: 3, username: 'auditor1', full_name: 'Audit User', role: 'auditor', status: 'active', created_date: '2026-02-01' },
            ];
        }
        el.innerHTML = Utils.renderTable([
            { key: 'username', label: 'Username', render: r => `<span class="font-semibold">${r.username}</span>` },
            { key: 'full_name', label: 'Full Name' },
            { key: 'role', label: 'Role', render: r => {
                const colors = { admin:'badge-primary badge-info', operator:'badge-warning', auditor:'badge-success', superadmin:'badge-danger' };
                return `<span class="badge ${colors[r.role]||'badge-neutral'}">${r.role}</span>`;
            }},
            { key: 'status', label: 'Status', render: r => Utils.statusBadge(r.status) },
            { key: 'created_date', label: 'Created', render: r => Utils.formatDate(r.created_date) },
            { key: 'actions', label: 'Actions', width: '140px', render: r => `
                <button class="btn btn-sm btn-secondary" onclick="Pages.admin.editUser(${r.user_id})" title="Edit">✏️</button>
                <button class="btn btn-sm btn-secondary" onclick="Pages.admin.resetPassword(${r.user_id},'${r.username}')" title="Reset Password">🔑</button>` }
        ], _users, { emptyIcon: '👤', emptyText: 'No users' });
    }

    function showAddUser() {
        Utils.openModal('👤 Add System User', `
            <div class="form-row">
                ${Utils.formField({ name: 'usr_username', label: 'Username', required: true })}
                ${Utils.formField({ name: 'usr_fullname', label: 'Full Name', required: true })}
            </div>
            <div class="form-row">
                ${Utils.formField({ name: 'usr_role', label: 'Role', type: 'select', required: true, options: [
                    {value:'admin',label:'Admin'},{value:'operator',label:'Operator'},{value:'auditor',label:'Auditor'}
                ] })}
                ${Utils.formField({ name: 'usr_password', label: 'Initial Password', type: 'password', required: true, placeholder: 'Set initial password' })}
            </div>`,
            `<button class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
             <button class="btn btn-primary" onclick="Pages.admin.submitAddUser()">Create User</button>`
        );
    }

    async function submitAddUser() {
        try {
            await API.post('/admin/users', {
                username: document.querySelector('[name="usr_username"]')?.value,
                full_name: document.querySelector('[name="usr_fullname"]')?.value,
                role: document.querySelector('[name="usr_role"]')?.value,
                password: document.querySelector('[name="usr_password"]')?.value
            });
            Utils.showToast('User created!', 'success');
            Utils.closeModal();
            loadUsers();
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    function editUser(userId) {
        const user = _users.find(u => u.user_id === userId);
        if (!user) return;
        Utils.openModal('✏️ Edit User — ' + user.username, `
            <div class="form-row">
                ${Utils.formField({ name: 'edit_fullname', label: 'Full Name', value: user.full_name, required: true })}
                ${Utils.formField({ name: 'edit_role', label: 'Role', type: 'select', value: user.role, required: true, options: [
                    {value:'admin',label:'Admin'},{value:'operator',label:'Operator'},{value:'auditor',label:'Auditor'}
                ] })}
            </div>
            ${Utils.formField({ name: 'edit_status', label: 'Status', type: 'select', value: user.status, options: [{value:'active',label:'Active'},{value:'disabled',label:'Disabled'}] })}`,
            `<button class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
             <button class="btn btn-primary" onclick="Pages.admin.submitEditUser(${userId})">Save</button>`
        );
    }

    async function submitEditUser(userId) {
        try {
            await API.put(`/admin/users/${userId}`, {
                full_name: document.querySelector('[name="edit_fullname"]')?.value,
                role: document.querySelector('[name="edit_role"]')?.value,
                status: document.querySelector('[name="edit_status"]')?.value
            });
            Utils.showToast('User updated!', 'success');
            Utils.closeModal();
            loadUsers();
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    async function resetPassword(userId, username) {
        const confirmed = await Auth.confirmPassword(`Reset password for ${username}`);
        if (!confirmed) return;
        try {
            await API.post(`/admin/users/${userId}/reset-password`);
            Utils.showToast(`Password reset for ${username}. Default: DOB (DDMMYYYY)`, 'success');
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    /* ========================================================================
       CONFIG Loading
       ======================================================================== */
    async function loadConfig() {
        try {
            const data = await API.get('/admin/config');
            _config = data.config || data || {};
            applyConfigToForm(_config);
        } catch {
            // Defaults already set in form values
        }
    }

    function applyConfigToForm(cfg) {
        const map = {
            cd_amount: 'cfg_cd_amount', share_amount: 'cfg_share_amount', max_share: 'cfg_max_share',
            ll_max_amount: 'cfg_ll_max', ll_interest_rate: 'cfg_ll_rate', ll_max_tenure: 'cfg_ll_tenure',
            sl_max_amount: 'cfg_sl_max', sl_interest_rate: 'cfg_sl_rate', sl_max_tenure: 'cfg_sl_tenure',
            cd_requirement_pct: 'cfg_cd_pct', share_requirement: 'cfg_share_req',
            max_sureties: 'cfg_max_sureties', max_exposure: 'cfg_max_exposure', default_threshold: 'cfg_default_threshold',
            session_timeout: 'cfg_session_timeout'
        };
        Object.entries(map).forEach(([key, name]) => {
            if (cfg[key] != null) {
                const el = document.querySelector(`[name="${name}"]`);
                if (el) el.value = cfg[key];
            }
        });
    }

    /* ========================================================================
       FD Schemes
       ======================================================================== */
    let _fdSchemes = [
        { tenure_days: 364, tenure_label: '1-364 Days', rate: 4.0 },
        { tenure_days: 365, tenure_label: '12 Months', rate: 8.0 },
        { tenure_days: 730, tenure_label: '24 Months', rate: 8.5 },
        { tenure_days: 1095, tenure_label: '36 Months', rate: 9.5 },
    ];

    function renderFDSchemes() {
        const el = document.getElementById('fd-schemes-table');
        if (!el) return;
        el.innerHTML = Utils.renderTable([
            { key: 'tenure_label', label: 'Tenure' },
            { key: 'rate', label: 'Interest Rate (%)', render: (r, i) =>
                `<input type="number" class="form-input" style="width:100px;padding:4px 8px" value="${r.rate}" step="0.5" min="0" id="fd-rate-${i}"/>` },
            { key: 'actions', label: '', width: '60px', render: (r, i) =>
                `<button class="btn btn-sm btn-secondary" onclick="Pages.admin.removeFDScheme(${i})" title="Remove">🗑️</button>` }
        ], _fdSchemes, { emptyText: 'No schemes' });
    }

    function addFDScheme() {
        Utils.openModal('➕ Add FD Scheme', `
            <div class="form-row">
                ${Utils.formField({ name: 'scheme_label', label: 'Tenure Label', required: true, placeholder: 'e.g. 48 Months' })}
                ${Utils.formField({ name: 'scheme_days', label: 'Tenure (Days)', type: 'number', required: true, min: 1 })}
                ${Utils.formField({ name: 'scheme_rate', label: 'Interest Rate (%)', type: 'number', required: true, step: 0.5, min: 0 })}
            </div>`,
            `<button class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
             <button class="btn btn-primary" onclick="Pages.admin.doAddFDScheme()">Add</button>`
        );
    }

    function doAddFDScheme() {
        _fdSchemes.push({
            tenure_label: document.querySelector('[name="scheme_label"]')?.value,
            tenure_days: parseInt(document.querySelector('[name="scheme_days"]')?.value) || 0,
            rate: parseFloat(document.querySelector('[name="scheme_rate"]')?.value) || 0
        });
        renderFDSchemes();
        Utils.closeModal();
    }

    function removeFDScheme(idx) {
        _fdSchemes.splice(idx, 1);
        renderFDSchemes();
    }

    /* ========================================================================
       Member Structure
       ======================================================================== */
    let _empTypes = ['Industrial', 'Non-Industrial'];
    let _parts = ['Part A', 'Part B', 'Part C', 'Part D'];

    function renderStructure() {
        const empEl = document.getElementById('emp-types-list');
        const partEl = document.getElementById('parts-list');
        if (empEl) {
            empEl.innerHTML = _empTypes.map(t =>
                `<div class="flex items-center justify-between p-2" style="border-bottom:1px solid var(--clr-neutral-100)">
                    <span class="text-sm font-medium">${t}</span>
                    <span class="badge badge-info">Default</span>
                </div>`
            ).join('');
        }
        if (partEl) {
            partEl.innerHTML = _parts.map((p, i) =>
                `<div class="flex items-center justify-between p-2" style="border-bottom:1px solid var(--clr-neutral-100)">
                    <span class="text-sm font-medium">${p}</span>
                    <button class="btn btn-sm btn-secondary" onclick="Pages.admin.removePart(${i})">✕</button>
                </div>`
            ).join('');
        }
    }

    function addPart() {
        const el = document.querySelector('[name="new_part"]');
        const val = el?.value?.trim();
        if (!val) return;
        _parts.push(val);
        el.value = '';
        renderStructure();
        Utils.showToast(`Part "${val}" added`, 'success');
    }

    function removePart(idx) {
        const removed = _parts.splice(idx, 1);
        renderStructure();
        Utils.showToast(`Part "${removed}" removed`, 'info');
    }

    /* ========================================================================
       SAVE Handlers
       ======================================================================== */
    async function saveDemandConfig() {
        try {
            await API.put('/admin/config', {
                cd_amount: parseFloat(document.querySelector('[name="cfg_cd_amount"]')?.value),
                share_amount: parseFloat(document.querySelector('[name="cfg_share_amount"]')?.value),
                max_share: parseFloat(document.querySelector('[name="cfg_max_share"]')?.value),
                allocation_priority: [1,2,3,4].map(i => document.querySelector(`[name="cfg_alloc_${i}"]`)?.value)
            });
            Utils.showToast('Demand config saved!', 'success');
        } catch (err) { Utils.showToast(err.message || 'Failed to save', 'error'); }
    }

    async function saveLoanConfig() {
        try {
            await API.put('/admin/config', {
                ll_max_amount: parseFloat(document.querySelector('[name="cfg_ll_max"]')?.value),
                ll_interest_rate: parseFloat(document.querySelector('[name="cfg_ll_rate"]')?.value),
                ll_max_tenure: parseInt(document.querySelector('[name="cfg_ll_tenure"]')?.value),
                sl_max_amount: parseFloat(document.querySelector('[name="cfg_sl_max"]')?.value),
                sl_interest_rate: parseFloat(document.querySelector('[name="cfg_sl_rate"]')?.value),
                sl_max_tenure: parseInt(document.querySelector('[name="cfg_sl_tenure"]')?.value),
                cd_requirement_pct: parseFloat(document.querySelector('[name="cfg_cd_pct"]')?.value),
                share_requirement: parseFloat(document.querySelector('[name="cfg_share_req"]')?.value)
            });
            Utils.showToast('Loan config saved!', 'success');
        } catch (err) { Utils.showToast(err.message || 'Failed to save', 'error'); }
    }

    async function saveFDSchemes() {
        // Read updated rates from inputs
        _fdSchemes.forEach((s, i) => {
            const el = document.getElementById(`fd-rate-${i}`);
            if (el) s.rate = parseFloat(el.value) || s.rate;
        });
        try {
            await API.put('/admin/config', { fd_schemes: _fdSchemes });
            Utils.showToast('FD schemes saved!', 'success');
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    async function saveSuretyConfig() {
        try {
            await API.put('/admin/config', {
                max_sureties: parseInt(document.querySelector('[name="cfg_max_sureties"]')?.value),
                max_exposure: parseFloat(document.querySelector('[name="cfg_max_exposure"]')?.value),
                default_threshold: parseInt(document.querySelector('[name="cfg_default_threshold"]')?.value),
                surety_trigger: document.querySelector('[name="cfg_surety_trigger"]')?.value
            });
            Utils.showToast('Surety config saved!', 'success');
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    async function saveSystemConfig() {
        try {
            await API.put('/admin/config', {
                current_month: document.querySelector('[name="cfg_current_month"]')?.value,
                freeze_demand: document.querySelector('[name="cfg_freeze_demand"]')?.value,
                rounding_rule: document.querySelector('[name="cfg_rounding"]')?.value,
                allow_backdate: document.querySelector('[name="cfg_backdate"]')?.value,
                session_timeout: parseInt(document.querySelector('[name="cfg_session_timeout"]')?.value),
                max_login_attempts: parseInt(document.querySelector('[name="cfg_max_attempts"]')?.value)
            });
            Utils.showToast('System config saved!', 'success');
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    async function lockMonth() {
        const month = document.querySelector('[name="cfg_current_month"]')?.value;
        const confirmed = await Auth.confirmPassword(`Lock month ${month}. No further edits will be allowed.`);
        if (!confirmed) return;
        try {
            await API.post('/admin/lock-month', { month });
            Utils.showToast(`Month ${month} locked!`, 'success');
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    return {
        render, init,
        showAddUser, submitAddUser, editUser, submitEditUser, resetPassword,
        saveDemandConfig, saveLoanConfig, saveFDSchemes, saveSuretyConfig, saveSystemConfig,
        addFDScheme, doAddFDScheme, removeFDScheme,
        addPart, removePart, lockMonth
    };
})();
