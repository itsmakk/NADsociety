/**
 * NADSOC — Audit Log Page Module
 * Filterable, searchable audit log viewer with export.
 */
window.Pages = window.Pages || {};
window.Pages.audit = (() => {
    let _logs = [];
    let _page = 1;
    let _perPage = 50;
    let _total = 0;
    let _filters = { module: '', action: '', user: '', from: '', to: '' };

    function render() {
        return `
        <div class="card mb-4">
            <h3 class="text-base font-bold mb-4">🔍 Filter Audit Logs</h3>
            <div class="form-row">
                ${Utils.formField({ name: 'aud_module', label: 'Module', type: 'select', options: [
                    {value:'',label:'All Modules'},
                    {value:'members',label:'Members'},{value:'loans',label:'Loans'},{value:'deposits',label:'Deposits'},
                    {value:'demand',label:'Demand'},{value:'recovery',label:'Recovery'},{value:'fd',label:'Fixed Deposits'},
                    {value:'surety',label:'Surety'},{value:'settlement',label:'Settlement'},{value:'expenses',label:'Expenses'},
                    {value:'forms',label:'Forms'},{value:'admin',label:'Admin'},{value:'auth',label:'Auth'},
                    {value:'upload',label:'Bulk Upload'}
                ] })}
                ${Utils.formField({ name: 'aud_action', label: 'Action Type', type: 'select', options: [
                    {value:'',label:'All Actions'},
                    {value:'CREATE',label:'Create'},{value:'UPDATE',label:'Update'},{value:'DELETE',label:'Delete'},
                    {value:'LOGIN',label:'Login'},{value:'APPROVE',label:'Approve'},{value:'GENERATE',label:'Generate'},
                    {value:'UPLOAD',label:'Upload'},{value:'ADJUSTMENT',label:'Adjustment'},{value:'REVERSAL',label:'Reversal'},
                    {value:'FORECLOSE',label:'Foreclose'},{value:'STATUS_CHANGE',label:'Status Change'}
                ] })}
                ${Utils.formField({ name: 'aud_user', label: 'Username', placeholder: 'Filter by user...' })}
            </div>
            <div class="form-row">
                ${Utils.formField({ name: 'aud_from', label: 'From Date', type: 'date' })}
                ${Utils.formField({ name: 'aud_to', label: 'To Date', type: 'date' })}
                ${Utils.formField({ name: 'aud_ref', label: 'Reference ID', placeholder: 'e.g. LL-25-001, 1001...' })}
            </div>
            <div class="flex gap-3 mt-4">
                <button class="btn btn-primary" onclick="Pages.audit.applyFilters()">🔍 Search</button>
                <button class="btn btn-secondary" onclick="Pages.audit.clearFilters()">🔄 Clear</button>
                <div class="toolbar-right">
                    <button class="btn btn-secondary" onclick="Pages.audit.exportLogs()">📥 Export</button>
                </div>
            </div>
        </div>
        <div id="audit-table">${Utils.renderLoading()}</div>
        <div id="audit-pagination"></div>`;
    }

    function init() { loadLogs(); }

    async function loadLogs() {
        const el = document.getElementById('audit-table');
        if (!el) return;
        el.innerHTML = Utils.renderLoading();

        try {
            const params = new URLSearchParams({ page: _page, per_page: _perPage });
            if (_filters.module) params.set('module', _filters.module);
            if (_filters.action) params.set('action_type', _filters.action);
            if (_filters.user) params.set('username', _filters.user);
            if (_filters.from) params.set('from_date', _filters.from);
            if (_filters.to) params.set('to_date', _filters.to);

            const data = await API.get(`/audit?${params}`);
            _logs = data.logs || data.data || [];
            _total = data.total || _logs.length;
        } catch {
            _logs = generateDemoLogs();
            _total = _logs.length;
        }
        renderTable();
    }

    function renderTable() {
        const el = document.getElementById('audit-table');
        const pagEl = document.getElementById('audit-pagination');
        if (!el) return;

        el.innerHTML = Utils.renderTable([
            { key: 'timestamp', label: 'Timestamp', width: '160px', render: r => {
                const d = new Date(r.timestamp || r.created_at);
                return `<span class="text-xs">${d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})} ${d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}</span>`;
            }},
            { key: 'username', label: 'User', width: '100px', render: r => `<span class="font-semibold">${r.username || '—'}</span>` },
            { key: 'module', label: 'Module', width: '100px', render: r => `<span class="badge badge-info">${r.module || '—'}</span>` },
            { key: 'action_type', label: 'Action', width: '110px', render: r => {
                const colors = { CREATE:'badge-success', UPDATE:'badge-info', DELETE:'badge-danger', LOGIN:'badge-neutral',
                    APPROVE:'badge-success', GENERATE:'badge-warning', UPLOAD:'badge-info', ADJUSTMENT:'badge-warning',
                    REVERSAL:'badge-danger', FORECLOSE:'badge-danger', STATUS_CHANGE:'badge-warning' };
                return `<span class="badge ${colors[r.action_type]||'badge-neutral'}">${r.action_type||'—'}</span>`;
            }},
            { key: 'reference_id', label: 'Reference', width: '110px', render: r => r.reference_id ? `<span class="text-primary font-semibold">${r.reference_id}</span>` : '—' },
            { key: 'details', label: 'Details', render: r => `<span class="text-sm">${Utils.truncate(r.details || '', 80)}</span>` }
        ], _logs, { emptyIcon: '🔍', emptyText: 'No audit logs found', emptySubtext: 'Try adjusting your filters' });

        if (pagEl) pagEl.innerHTML = Utils.renderPagination(_total, _page, _perPage, 'Pages.audit.goToPage');
    }

    function generateDemoLogs() {
        return [
            { timestamp: '2026-03-28T14:30:00', username: 'admin', module: 'members', action_type: 'CREATE', reference_id: '1001', details: 'Created member Ramesh Patil (GEN: 1001)' },
            { timestamp: '2026-03-28T14:35:00', username: 'admin', module: 'loans', action_type: 'CREATE', reference_id: 'LL-25-001', details: 'Issued Long Loan ₹3,00,000 to member 1001' },
            { timestamp: '2026-03-28T15:00:00', username: 'admin', module: 'demand', action_type: 'GENERATE', reference_id: '2026-03', details: 'Generated monthly demand for Mar 2026 — 480 members processed' },
            { timestamp: '2026-03-28T15:10:00', username: 'operator1', module: 'recovery', action_type: 'CREATE', reference_id: '2026-03', details: 'Posted full recovery for Part A — 120 members' },
            { timestamp: '2026-03-27T10:00:00', username: 'admin', module: 'settlement', action_type: 'APPROVE', reference_id: 'FS-25-001', details: 'Approved settlement for Vikram Singh (GEN: 1015)' },
            { timestamp: '2026-03-27T09:00:00', username: 'admin', module: 'fd', action_type: 'CREATE', reference_id: 'FD-25-002', details: 'Created FD ₹50,000 for member 1003' },
            { timestamp: '2026-03-26T16:00:00', username: 'admin', module: 'expenses', action_type: 'CREATE', reference_id: 'EX-25-004', details: 'Expense ₹3,500 — Admin Charges — Registration Office' },
            { timestamp: '2026-03-26T11:00:00', username: 'admin', module: 'members', action_type: 'STATUS_CHANGE', reference_id: '1015', details: 'Member 1015 status changed: Active → Retired' },
            { timestamp: '2026-03-25T14:00:00', username: 'admin', module: 'loans', action_type: 'FORECLOSE', reference_id: 'SL-25-008', details: 'Foreclosed SL for member 1008 — balance zero' },
            { timestamp: '2026-03-25T10:00:00', username: 'admin', module: 'upload', action_type: 'UPLOAD', reference_id: 'batch-001', details: 'Bulk uploaded 250 members with opening balances' },
            { timestamp: '2026-03-24T09:15:00', username: 'admin', module: 'auth', action_type: 'LOGIN', reference_id: '', details: 'Successful login from 192.168.1.100' },
            { timestamp: '2026-03-24T09:10:00', username: 'operator1', module: 'auth', action_type: 'LOGIN', reference_id: '', details: 'Successful login from 192.168.1.105' },
        ];
    }

    function applyFilters() {
        _filters.module = document.querySelector('[name="aud_module"]')?.value || '';
        _filters.action = document.querySelector('[name="aud_action"]')?.value || '';
        _filters.user = document.querySelector('[name="aud_user"]')?.value || '';
        _filters.from = document.querySelector('[name="aud_from"]')?.value || '';
        _filters.to = document.querySelector('[name="aud_to"]')?.value || '';
        _page = 1;
        loadLogs();
    }

    function clearFilters() {
        ['aud_module','aud_action','aud_user','aud_from','aud_to','aud_ref'].forEach(n => {
            const el = document.querySelector(`[name="${n}"]`);
            if (el) el.value = '';
        });
        _filters = { module: '', action: '', user: '', from: '', to: '' };
        _page = 1;
        loadLogs();
    }

    function goToPage(p) { _page = p; loadLogs(); }

    async function exportLogs() {
        try {
            await API.download('/audit?format=excel', `audit_logs_${new Date().toISOString().split('T')[0]}.xlsx`);
            Utils.showToast('Audit logs exported!', 'success');
        } catch {
            Utils.showToast('Export requires backend connection', 'warning');
        }
    }

    return { render, init, applyFilters, clearFilters, goToPage, exportLogs };
})();
