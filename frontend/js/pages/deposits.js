/**
 * NADSOC — Deposits (CD & Share) Page Module
 */
window.Pages = window.Pages || {};
window.Pages.deposits = (() => {
    let _activeTab = 'cd';

    function render() {
        return `
        <div class="card" id="deposits-container">
            <div class="tab-bar">
                <button class="tab-item active" data-tab="tab-cd">💰 CD Summary</button>
                <button class="tab-item" data-tab="tab-share">📊 Share Capital</button>
                <button class="tab-item" data-tab="tab-cd-interest">📈 CD Interest Posting</button>
                <button class="tab-item" data-tab="tab-dividend">💎 Share Dividend</button>
            </div>

            <div class="tab-panel active" id="tab-cd">
                ${Utils.renderToolbar({
                    searchPlaceholder: 'Search by GEN No or Name...',
                    onSearch: 'Pages.deposits.searchCD', searchId: 'cd-search',
                    buttons: [{ label: 'Export', icon: '📥', class: 'btn btn-secondary', onClick: 'Pages.deposits.exportCD' }]
                })}
                <div id="cd-table">${Utils.renderLoading()}</div>
            </div>

            <div class="tab-panel" id="tab-share">
                ${Utils.renderToolbar({
                    searchPlaceholder: 'Search by GEN No or Name...',
                    onSearch: 'Pages.deposits.searchShare', searchId: 'share-search'
                })}
                <div id="share-table">${Utils.renderLoading()}</div>
            </div>

            <div class="tab-panel" id="tab-cd-interest">
                <div class="alert alert-info mb-4"><span>ℹ️</span><span>Post CD interest for all eligible members for the selected financial year.</span></div>
                <div class="form-row mb-4">
                    ${Utils.formField({ name: 'cd_fy', label: 'Financial Year', type: 'select', options: [Utils.getFinancialYear()].map(fy => ({value:fy,label:'FY '+fy})) })}
                    ${Utils.formField({ name: 'cd_rate', label: 'CD Interest Rate (%)', type: 'number', value: '6', step: 0.5, min: 0.5 })}
                </div>
                <div id="cd-interest-preview" class="mb-4"></div>
                <div class="flex gap-3">
                    <button class="btn btn-secondary" onclick="Pages.deposits.previewCDInterest()">🔍 Preview Calculation</button>
                    <button class="btn btn-primary" onclick="Pages.deposits.postCDInterest()" id="post-cd-btn">📈 Post CD Interest</button>
                </div>
            </div>

            <div class="tab-panel" id="tab-dividend">
                <div class="alert alert-info mb-4"><span>ℹ️</span><span>Post share dividend for all eligible members for the selected financial year.</span></div>
                <div class="form-row mb-4">
                    ${Utils.formField({ name: 'div_fy', label: 'Financial Year', type: 'select', options: [Utils.getFinancialYear()].map(fy => ({value:fy,label:'FY '+fy})) })}
                    ${Utils.formField({ name: 'div_rate', label: 'Dividend Rate (%)', type: 'number', value: '5', step: 0.5, min: 0.5 })}
                </div>
                <div id="dividend-preview" class="mb-4"></div>
                <div class="flex gap-3">
                    <button class="btn btn-secondary" onclick="Pages.deposits.previewDividend()">🔍 Preview</button>
                    <button class="btn btn-primary" onclick="Pages.deposits.postDividend()" id="post-div-btn">💎 Post Dividend</button>
                </div>
            </div>
        </div>`;
    }

    function init() {
        Utils.initTabs('deposits-container');
        loadCDData();
        loadShareData();
    }

    async function loadCDData() {
        const el = document.getElementById('cd-table');
        if (!el) return;
        try {
            const data = await API.get('/deposits/cd-summary');
            const members = data.members || data.data || [];
            renderCDTable(members);
        } catch {
            renderCDTable(generateDemoDeposits('cd'));
        }
    }

    function renderCDTable(members) {
        const el = document.getElementById('cd-table');
        if (!el) return;
        el.innerHTML = Utils.renderTable([
            { key: 'gen_no', label: 'GEN No', render: r => `<a style="cursor:pointer;color:var(--clr-primary-500);font-weight:600" onclick="App.navigate('/members/view?id=${r.gen_no}')">${r.gen_no}</a>` },
            { key: 'name', label: 'Name' },
            { key: 'token_no', label: 'Token No' },
            { key: 'cd_balance', label: 'CD Balance', align: 'right', render: r => Utils.formatCurrency(r.cd_balance) },
            { key: 'monthly_cd', label: 'Monthly CD', align: 'right', render: r => Utils.formatCurrency(r.monthly_cd || 600) },
            { key: 'last_updated', label: 'Last Updated', render: r => Utils.formatDate(r.last_updated) }
        ], members, { emptyIcon: '💰', emptyText: 'No CD data' });
    }

    async function loadShareData() {
        const el = document.getElementById('share-table');
        if (!el) return;
        try {
            const data = await API.get('/deposits/cd-summary');
            const members = data.members || data.data || [];
            renderShareTable(members);
        } catch {
            renderShareTable(generateDemoDeposits('share'));
        }
    }

    function renderShareTable(members) {
        const el = document.getElementById('share-table');
        if (!el) return;
        el.innerHTML = Utils.renderTable([
            { key: 'gen_no', label: 'GEN No', render: r => `<a style="cursor:pointer;color:var(--clr-primary-500);font-weight:600" onclick="App.navigate('/members/view?id=${r.gen_no}')">${r.gen_no}</a>` },
            { key: 'name', label: 'Name' },
            { key: 'share_balance', label: 'Share Balance', align: 'right', render: r => Utils.formatCurrency(r.share_balance) },
            { key: 'share_target', label: 'Target', align: 'right', render: () => Utils.formatCurrency(8000) },
            { key: 'status', label: 'Status', render: r => (r.share_balance || 0) >= 8000 ? '<span class="badge badge-success">Complete</span>' : '<span class="badge badge-warning">Accumulating</span>' }
        ], members, { emptyIcon: '📊', emptyText: 'No share data' });
    }

    function generateDemoDeposits(type) {
        const names = ['Ramesh Patil','Suresh Kumar','Anita Deshmukh','Prakash Jadhav','Meena Sharma'];
        return names.map((n,i) => ({
            gen_no: String(1001+i), name: n, token_no: String(5001+i),
            cd_balance: 30000 + i * 5000, share_balance: 5000 + i * 1000,
            monthly_cd: 600, last_updated: '2026-03-01'
        }));
    }

    async function previewCDInterest() {
        const rate = parseFloat(document.querySelector('[name="cd_rate"]')?.value) || 6;
        const el = document.getElementById('cd-interest-preview');
        el.innerHTML = Utils.renderLoading();
        try {
            const data = await API.post('/deposits/cd-interest', { rate, preview: true });
            el.innerHTML = `<div class="alert alert-success"><span>✅</span><span>Calculated for <strong>${data.count||0}</strong> members. Total interest: <strong>${Utils.formatCurrency(data.total_interest||0)}</strong></span></div>`;
        } catch {
            el.innerHTML = `<div class="alert alert-info"><span>📊</span><span>Preview: Estimated interest at ${rate}% for eligible members. Connect backend for exact figures.</span></div>`;
        }
    }

    async function postCDInterest() {
        const confirmed = await Auth.confirmPassword('Post CD interest for all members');
        if (!confirmed) return;
        const btn = document.getElementById('post-cd-btn');
        btn.disabled = true; btn.textContent = 'Posting...';
        try {
            const rate = parseFloat(document.querySelector('[name="cd_rate"]')?.value) || 6;
            await API.post('/deposits/cd-interest', { rate });
            Utils.showToast('CD Interest posted successfully!', 'success');
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
        btn.disabled = false; btn.textContent = '📈 Post CD Interest';
    }

    async function previewDividend() {
        const rate = parseFloat(document.querySelector('[name="div_rate"]')?.value) || 5;
        const el = document.getElementById('dividend-preview');
        el.innerHTML = `<div class="alert alert-info"><span>📊</span><span>Preview: Dividend at ${rate}% for eligible members.</span></div>`;
    }

    async function postDividend() {
        const confirmed = await Auth.confirmPassword('Post share dividend for all members');
        if (!confirmed) return;
        const btn = document.getElementById('post-div-btn');
        btn.disabled = true; btn.textContent = 'Posting...';
        try {
            const rate = parseFloat(document.querySelector('[name="div_rate"]')?.value) || 5;
            await API.post('/deposits/share-dividend', { rate });
            Utils.showToast('Share dividend posted successfully!', 'success');
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
        btn.disabled = false; btn.textContent = '💎 Post Dividend';
    }

    function searchCD(val) { /* will filter client-side or re-fetch */ }
    function searchShare(val) { }
    function exportCD() { Utils.showToast('Export will be available with backend', 'info'); }

    return { render, init, searchCD, searchShare, exportCD, previewCDInterest, postCDInterest, previewDividend, postDividend };
})();
