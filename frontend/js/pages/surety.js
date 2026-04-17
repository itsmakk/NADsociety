/**
 * NADSOC — Surety Page Module
 */
window.Pages = window.Pages || {};
window.Pages.surety = (() => {
    function render() {
        return `
        <div class="card" id="surety-container">
            <div class="tab-bar">
                <button class="tab-item active" data-tab="tab-exposure">🤝 Surety Exposure</button>
                <button class="tab-item" data-tab="tab-defaults">⚠️ 3+ Defaults</button>
                <button class="tab-item" data-tab="tab-recovery">💳 Surety Recovery</button>
            </div>

            <div class="tab-panel active" id="tab-exposure">
                ${Utils.renderToolbar({ searchPlaceholder: 'Search by GEN No...', onSearch: 'Pages.surety.searchExposure', searchId: 'surety-search' })}
                <div id="exposure-table">${Utils.renderLoading()}</div>
            </div>

            <div class="tab-panel" id="tab-defaults">
                <div class="alert alert-danger mb-4"><span>⚠️</span><span>Members with 3 or more consecutive defaults. Surety recovery action may be required.</span></div>
                <div id="defaults-table">${Utils.renderLoading()}</div>
            </div>

            <div class="tab-panel" id="tab-recovery">
                <div class="alert alert-info mb-4"><span>ℹ️</span><span>Post recovery from surety member and apply it to the borrower's outstanding loan.</span></div>
                <div class="form-row mb-4">
                    ${Utils.formField({ name: 'surety_gen_no', label: 'Surety GEN No', required: true })}
                    ${Utils.formField({ name: 'borrower_gen_no', label: 'Borrower GEN No', required: true })}
                    ${Utils.formField({ name: 'surety_amount', label: 'Recovery Amount (₹)', type: 'number', required: true, min: 1 })}
                </div>
                <div class="form-row mb-4">
                    ${Utils.formField({ name: 'surety_cr_no', label: 'CR No', required: true })}
                    ${Utils.formField({ name: 'surety_remark', label: 'Remark', type: 'textarea', rows: 2 })}
                </div>
                <button class="btn btn-primary" onclick="Pages.surety.submitRecovery()" id="surety-rec-btn">💳 Post Surety Recovery</button>
            </div>
        </div>`;
    }

    function init() {
        Utils.initTabs('surety-container');
        loadExposure();
        loadDefaults();
    }

    async function loadExposure() {
        const el = document.getElementById('exposure-table');
        if (!el) return;
        try {
            const data = await API.get('/surety/defaults');
            const list = data.exposures || data.data || [];
            renderExposureTable(list);
        } catch {
            renderExposureTable([
                { surety_gen_no:'1001', surety_name:'Ramesh Patil', borrower_gen_no:'1003', borrower_name:'Anita Deshmukh', loan_id:'LL-25-001', loan_amount:300000, outstanding:225000, status:'Active' },
                { surety_gen_no:'1002', surety_name:'Suresh Kumar', borrower_gen_no:'1003', borrower_name:'Anita Deshmukh', loan_id:'LL-25-001', loan_amount:300000, outstanding:225000, status:'Active' },
                { surety_gen_no:'1005', surety_name:'Meena Sharma', borrower_gen_no:'1010', borrower_name:'Deepa Joshi', loan_id:'LL-25-015', loan_amount:250000, outstanding:210000, status:'Active' },
            ]);
        }
    }

    function renderExposureTable(list) {
        const el = document.getElementById('exposure-table');
        if (!el) return;
        el.innerHTML = Utils.renderTable([
            { key: 'surety_gen_no', label: 'Surety GEN', render: r => `<a style="cursor:pointer;color:var(--clr-primary-500)" onclick="App.navigate('/members/view?id=${r.surety_gen_no}')">${r.surety_gen_no}</a>` },
            { key: 'surety_name', label: 'Surety Name' },
            { key: 'borrower_gen_no', label: 'Borrower' },
            { key: 'borrower_name', label: 'Borrower Name' },
            { key: 'loan_id', label: 'Loan No', render: r => `<a style="cursor:pointer;color:var(--clr-primary-500)" onclick="App.navigate('/loans/view?id=${r.loan_id}')">${r.loan_id}</a>` },
            { key: 'outstanding', label: 'Liability', align: 'right', render: r => Utils.formatCurrency(r.outstanding) },
            { key: 'status', label: 'Status', render: r => Utils.statusBadge(r.status) }
        ], list, { emptyIcon: '🤝', emptyText: 'No surety records' });
    }

    async function loadDefaults() {
        const el = document.getElementById('defaults-table');
        if (!el) return;
        try {
            const data = await API.get('/surety/defaults');
            const list = data.defaults || [];
            el.innerHTML = Utils.renderTable([
                { key: 'gen_no', label: 'GEN No' },
                { key: 'name', label: 'Member' },
                { key: 'consecutive_defaults', label: 'Defaults', align: 'center', render: r => `<span class="badge badge-danger">${r.consecutive_defaults}</span>` },
                { key: 'loan_id', label: 'Loan' },
                { key: 'outstanding', label: 'Outstanding', align: 'right', render: r => Utils.formatCurrency(r.outstanding) },
                { key: 'action', label: 'Action', render: r => `<button class="btn btn-sm btn-danger" onclick="Pages.surety.initRecovery('${r.gen_no}')">⚡ Recover</button>` }
            ], list, { emptyIcon: '✅', emptyText: 'No members with 3+ consecutive defaults' });
        } catch {
            el.innerHTML = Utils.renderEmptyState('✅', 'No defaults data', 'Connect backend to load default records');
        }
    }

    function initRecovery(genNo) {
        const el = document.querySelector('[name="surety_gen_no"]');
        if (el) el.value = genNo;
        document.querySelector('[data-tab="tab-recovery"]')?.click();
    }

    async function submitRecovery() {
        const confirmed = await Auth.confirmPassword('Post surety recovery');
        if (!confirmed) return;
        const btn = document.getElementById('surety-rec-btn');
        btn.disabled = true; btn.textContent = 'Posting...';
        try {
            await API.post('/surety/recover', {
                surety_gen_no: document.querySelector('[name="surety_gen_no"]')?.value,
                borrower_gen_no: document.querySelector('[name="borrower_gen_no"]')?.value,
                amount: parseFloat(document.querySelector('[name="surety_amount"]')?.value),
                cr_no: document.querySelector('[name="surety_cr_no"]')?.value,
                remark: document.querySelector('[name="surety_remark"]')?.value
            });
            Utils.showToast('Surety recovery posted!', 'success');
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
        btn.disabled = false; btn.textContent = '💳 Post Surety Recovery';
    }

    function searchExposure() {}

    return { render, init, searchExposure, initRecovery, submitRecovery };
})();
