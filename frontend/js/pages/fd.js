/**
 * NADSOC — Fixed Deposits (FD) Page Module
 */
window.Pages = window.Pages || {};
window.Pages.fd = (() => {
    let _fds = [];
    let _tab = 'all';

    function render() {
        return `
        <div class="flex items-center justify-between mb-4">
            <div class="pill-tabs">
                <button class="pill-tab ${_tab==='all'?'active':''}" onclick="Pages.fd.setTab('all')">All</button>
                <button class="pill-tab ${_tab==='ACTIVE'?'active':''}" onclick="Pages.fd.setTab('ACTIVE')">Active</button>
                <button class="pill-tab ${_tab==='CLOSED'?'active':''}" onclick="Pages.fd.setTab('CLOSED')">Closed</button>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-secondary" onclick="Pages.fd.showMaturityReport()">📅 Maturity Report</button>
                <button class="btn btn-primary" onclick="Pages.fd.showCreateFD()">➕ Create FD</button>
            </div>
        </div>
        ${Utils.renderToolbar({ searchPlaceholder: 'Search by FD No, Member...', onSearch: 'Pages.fd.onSearch', searchId: 'fd-search' })}
        <div id="fd-table">${Utils.renderLoading()}</div>`;
    }

    function init() { loadFDs(); }

    async function loadFDs() {
        const el = document.getElementById('fd-table');
        if (!el) return;
        el.innerHTML = Utils.renderLoading();
        try {
            const data = await API.get(`/fd${_tab!=='all'?'?status='+_tab:''}`);
            _fds = data.fds || data.data || [];
        } catch {
            _fds = [
                { fd_no:'FD-25-001', member_gen_no:'1001', member_name:'Ramesh Patil', deposit_amount:100000, interest_rate:8.5, tenure_months:24, start_date:'2025-01-15', maturity_date:'2027-01-15', maturity_amount:117000, status:'ACTIVE' },
                { fd_no:'FD-25-002', member_gen_no:'1003', member_name:'Anita Deshmukh', deposit_amount:50000, interest_rate:9.5, tenure_months:36, start_date:'2025-03-01', maturity_date:'2028-03-01', maturity_amount:64250, status:'ACTIVE' },
                { fd_no:'FD-24-005', member_gen_no:'1008', member_name:'Rajesh Pawar', deposit_amount:200000, interest_rate:8.0, tenure_months:12, start_date:'2024-06-01', maturity_date:'2025-06-01', maturity_amount:216000, status:'CLOSED' },
            ];
        }
        renderFDTable();
    }

    function renderFDTable() {
        const el = document.getElementById('fd-table');
        if (!el) return;
        el.innerHTML = Utils.renderTable([
            { key: 'fd_no', label: 'FD No', render: r => `<span class="font-semibold text-primary">${r.fd_no}</span>` },
            { key: 'member', label: 'Member', render: r => `${r.member_name||''} <span class="text-xs text-muted">(${r.member_gen_no})</span>` },
            { key: 'deposit_amount', label: 'Amount', align: 'right', render: r => Utils.formatCurrency(r.deposit_amount) },
            { key: 'interest_rate', label: 'Rate', render: r => r.interest_rate+'%' },
            { key: 'tenure', label: 'Tenure', render: r => r.tenure_months+' mo' },
            { key: 'start_date', label: 'Start', render: r => Utils.formatDate(r.start_date) },
            { key: 'maturity_date', label: 'Maturity', render: r => Utils.formatDate(r.maturity_date) },
            { key: 'maturity_amount', label: 'Maturity Amt', align: 'right', render: r => Utils.formatCurrency(r.maturity_amount) },
            { key: 'status', label: 'Status', render: r => Utils.statusBadge(r.status) },
            { key: 'actions', label: '', width: '100px', render: r => r.status === 'ACTIVE' ? `
                <button class="btn btn-sm btn-secondary" onclick="Pages.fd.showCloseFD('${r.fd_no}')" title="Close">🔒</button>
                <button class="btn btn-sm btn-secondary" onclick="Pages.fd.showRenewFD('${r.fd_no}')" title="Renew">🔄</button>` : '' }
        ], _fds, { emptyIcon: '📋', emptyText: 'No fixed deposits found' });
    }

    function showCreateFD() {
        Utils.openModal('📋 Create Fixed Deposit', `
            <div class="form-row">
                ${Utils.formField({ name: 'fd_member', label: 'Member GEN No', required: true })}
                ${Utils.formField({ name: 'fd_amount', label: 'Deposit Amount (₹)', type: 'number', required: true, min: 1000 })}
            </div>
            <div class="form-row">
                ${Utils.formField({ name: 'fd_tenure', label: 'Tenure (Months)', type: 'select', required: true, options: [{value:0,label:'< 12 Months (4%)'},{value:12,label:'12 Months (8%)'},{value:24,label:'24 Months (8.5%)'},{value:36,label:'36 Months (9.5%)'}] })}
                ${Utils.formField({ name: 'fd_start', label: 'Start Date', type: 'date', required: true, value: new Date().toISOString().split('T')[0] })}
            </div>
            ${Utils.formField({ name: 'fd_cr_no', label: 'CR No', required: true, placeholder: 'From receipt book' })}
            <div id="fd-calc-preview" class="mt-4"></div>`,
            `<button class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
             <button class="btn btn-primary" onclick="Pages.fd.submitCreateFD()">Create FD</button>`,
            { maxWidth: '600px' }
        );
        // Auto-calc maturity
        setTimeout(() => {
            ['fd_amount','fd_tenure','fd_start'].forEach(n => {
                const el = document.querySelector(`[name="${n}"]`);
                if (el) el.addEventListener('change', calcFDPreview);
            });
        }, 100);
    }

    function calcFDPreview() {
        const amt = parseFloat(document.querySelector('[name="fd_amount"]')?.value) || 0;
        const tenure = parseInt(document.querySelector('[name="fd_tenure"]')?.value) || 12;
        const rates = { 0: 4, 12: 8, 24: 8.5, 36: 9.5 };
        const rate = rates[tenure] || 8;
        const maturity = Math.round(amt + (amt * rate * (tenure || 6) / 12 / 100));
        const el = document.getElementById('fd-calc-preview');
        if (el && amt > 0) {
            el.innerHTML = `<div class="alert alert-info"><span>📊</span><span>Interest Rate: <strong>${rate}%</strong> | Maturity Amount: <strong>${Utils.formatCurrency(maturity)}</strong> | Interest: <strong>${Utils.formatCurrency(maturity - amt)}</strong></span></div>`;
        }
    }

    async function submitCreateFD() {
        const confirmed = await Auth.confirmPassword('Create fixed deposit');
        if (!confirmed) return;
        try {
            const data = {
                member_gen_no: document.querySelector('[name="fd_member"]')?.value,
                deposit_amount: parseFloat(document.querySelector('[name="fd_amount"]')?.value),
                tenure_months: parseInt(document.querySelector('[name="fd_tenure"]')?.value),
                start_date: document.querySelector('[name="fd_start"]')?.value,
                cr_no: document.querySelector('[name="fd_cr_no"]')?.value
            };
            await API.post('/fd', data);
            Utils.showToast('FD created successfully!', 'success');
            Utils.closeModal();
            loadFDs();
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    function showCloseFD(fdNo) {
        Utils.openModal('🔒 Close Fixed Deposit', `
            <p class="text-sm mb-4">Close FD <strong>${fdNo}</strong></p>
            <div class="alert alert-warning mb-4"><span>⚠️</span><span>Premature closure may result in reduced interest payout.</span></div>
            ${Utils.formField({ name: 'close_date', label: 'Closure Date', type: 'date', required: true, value: new Date().toISOString().split('T')[0] })}
            ${Utils.formField({ name: 'close_remark', label: 'Remark', type: 'textarea', rows: 2, required: true })}`,
            `<button class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
             <button class="btn btn-danger" onclick="Pages.fd.doCloseFD('${fdNo}')">Close FD</button>`
        );
    }

    async function doCloseFD(fdNo) {
        const confirmed = await Auth.confirmPassword('Confirm FD closure');
        if (!confirmed) return;
        try {
            await API.post(`/fd/${fdNo}/close`, {
                close_date: document.querySelector('[name="close_date"]')?.value,
                remark: document.querySelector('[name="close_remark"]')?.value
            });
            Utils.showToast('FD closed', 'success');
            Utils.closeModal();
            loadFDs();
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    function showRenewFD(fdNo) {
        Utils.openModal('🔄 Renew Fixed Deposit', `
            <p class="text-sm mb-4">Renew FD <strong>${fdNo}</strong></p>
            ${Utils.formField({ name: 'renew_type', label: 'Renewal Type', type: 'select', required: true, options: [{value:'principal',label:'Principal Only'},{value:'principal_interest',label:'Principal + Interest'}] })}
            ${Utils.formField({ name: 'renew_tenure', label: 'New Tenure', type: 'select', required: true, options: [{value:12,label:'12 Months'},{value:24,label:'24 Months'},{value:36,label:'36 Months'}] })}`,
            `<button class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
             <button class="btn btn-primary" onclick="Pages.fd.doRenewFD('${fdNo}')">Renew FD</button>`
        );
    }

    async function doRenewFD(fdNo) {
        const confirmed = await Auth.confirmPassword('Confirm FD renewal');
        if (!confirmed) return;
        try {
            await API.post(`/fd/${fdNo}/renew`, {
                renewal_type: document.querySelector('[name="renew_type"]')?.value,
                tenure_months: parseInt(document.querySelector('[name="renew_tenure"]')?.value)
            });
            Utils.showToast('FD renewed — new FD number generated', 'success');
            Utils.closeModal();
            loadFDs();
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    function showMaturityReport() {
        Utils.openModal('📅 FD Maturity Report', `
            <div class="form-row mb-4">
                ${Utils.formField({ name: 'mat_from', label: 'From Date', type: 'date', value: new Date().toISOString().split('T')[0] })}
                ${Utils.formField({ name: 'mat_to', label: 'To Date', type: 'date', value: new Date(Date.now()+90*86400000).toISOString().split('T')[0] })}
            </div>
            <div id="maturity-results">${Utils.renderEmptyState('📅', 'Select dates', '')}</div>`,
            `<button class="btn btn-secondary" onclick="Utils.closeModal()">Close</button>
             <button class="btn btn-primary" onclick="Pages.fd.loadMaturity()">Search</button>`,
            { maxWidth: '700px' }
        );
    }

    async function loadMaturity() {
        const el = document.getElementById('maturity-results');
        if (!el) return;
        el.innerHTML = Utils.renderLoading();
        try {
            const data = await API.get('/fd/maturity');
            const fds = data.fds || [];
            el.innerHTML = fds.length ? Utils.renderTable([
                { key: 'fd_no', label: 'FD No' },
                { key: 'member_name', label: 'Member' },
                { key: 'maturity_date', label: 'Maturity', render: r => Utils.formatDate(r.maturity_date) },
                { key: 'maturity_amount', label: 'Amount', align: 'right', render: r => Utils.formatCurrency(r.maturity_amount) }
            ], fds) : Utils.renderEmptyState('📅', 'No FDs maturing in this period', '');
        } catch {
            el.innerHTML = Utils.renderEmptyState('📅', 'Connect backend for maturity data', '');
        }
    }

    function setTab(t) { _tab = t; App.navigate('/fd'); }
    function onSearch() { }

    return { render, init, setTab, onSearch, showCreateFD, submitCreateFD, showCloseFD, doCloseFD, showRenewFD, doRenewFD, showMaturityReport, loadMaturity };
})();
