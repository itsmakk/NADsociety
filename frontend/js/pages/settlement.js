/**
 * NADSOC — Settlement Page Module
 */
window.Pages = window.Pages || {};
window.Pages.settlement = (() => {
    let _settlements = [];

    function render() {
        return `
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold">📑 Final Settlements</h2>
            <button class="btn btn-primary" onclick="Pages.settlement.showCreate()">➕ New Settlement</button>
        </div>
        ${Utils.renderToolbar({ searchPlaceholder: 'Search by FS No, Member...', onSearch: 'Pages.settlement.onSearch', searchId: 'settlement-search' })}
        <div id="settlement-table">${Utils.renderLoading()}</div>`;
    }

    function init() { loadSettlements(); }

    async function loadSettlements() {
        const el = document.getElementById('settlement-table');
        if (!el) return;
        try {
            const data = await API.get('/settlement');
            _settlements = data.settlements || data.data || [];
        } catch {
            _settlements = [
                { fs_no:'FS-25-001', member_gen_no:'1015', member_name:'Vikram Singh', settlement_type:'Retired', total_earnings:68000, total_deductions:45000, final_payable:23000, status:'Approved', settlement_date:'2026-02-15' },
                { fs_no:'FS-25-002', member_gen_no:'1018', member_name:'Rekha Mane', settlement_type:'Resigned', total_earnings:35000, total_deductions:12000, final_payable:23000, status:'Pending', settlement_date:'2026-03-10' },
            ];
        }
        el.innerHTML = Utils.renderTable([
            { key: 'fs_no', label: 'FS No', render: r => `<span class="font-semibold text-primary">${r.fs_no}</span>` },
            { key: 'member', label: 'Member', render: r => `${r.member_name||''} (${r.member_gen_no})` },
            { key: 'settlement_type', label: 'Type' },
            { key: 'total_earnings', label: 'Earnings', align: 'right', render: r => Utils.formatCurrency(r.total_earnings) },
            { key: 'total_deductions', label: 'Deductions', align: 'right', render: r => Utils.formatCurrency(r.total_deductions) },
            { key: 'final_payable', label: 'Payable', align: 'right', render: r => `<strong class="${r.final_payable>=0?'text-success':'text-danger'}">${Utils.formatCurrency(r.final_payable)}</strong>` },
            { key: 'status', label: 'Status', render: r => Utils.statusBadge(r.status) },
            { key: 'date', label: 'Date', render: r => Utils.formatDate(r.settlement_date) },
            { key: 'actions', label: '', width: '120px', render: r =>
                r.status === 'Pending' ? `<button class="btn btn-sm btn-primary" onclick="Pages.settlement.approve('${r.fs_no}')">✅ Approve</button>` :
                `<button class="btn btn-sm btn-secondary" onclick="Pages.settlement.viewDetail('${r.fs_no}')">👁️</button>` }
        ], _settlements, { emptyIcon: '📑', emptyText: 'No settlements' });
    }

    function showCreate() {
        Utils.openModal('📑 Create Settlement', `
            <div class="form-row">
                ${Utils.formField({ name: 'set_gen_no', label: 'Member GEN No', required: true })}
                ${Utils.formField({ name: 'set_type', label: 'Settlement Type', type: 'select', required: true, options: ['Retired','Resigned','Transferred','Deceased'] })}
            </div>
            <div class="form-section-title">Additional Amounts</div>
            <div class="form-row">
                ${Utils.formField({ name: 'set_dcrb', label: 'DCRB Amount (₹)', type: 'number', value: '0', min: 0 })}
                ${Utils.formField({ name: 'set_other_recv', label: 'Other Receivable (₹)', type: 'number', value: '0', min: 0 })}
                ${Utils.formField({ name: 'set_other_ded', label: 'Other Deductions (₹)', type: 'number', value: '0', min: 0 })}
            </div>
            ${Utils.formField({ name: 'set_voucher', label: 'Voucher No', required: true })}
            ${Utils.formField({ name: 'set_remark', label: 'Remark', type: 'textarea', rows: 2 })}
            <div id="settlement-preview" class="mt-4"></div>`,
            `<button class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
             <button class="btn btn-secondary" onclick="Pages.settlement.preview()">🔍 Preview</button>
             <button class="btn btn-primary" onclick="Pages.settlement.submitCreate()">Create Settlement</button>`,
            { maxWidth: '650px' }
        );
    }

    async function preview() {
        const genNo = document.querySelector('[name="set_gen_no"]')?.value;
        const el = document.getElementById('settlement-preview');
        if (!genNo || !el) { Utils.showToast('Enter GEN No', 'warning'); return; }
        el.innerHTML = Utils.renderLoading();
        try {
            const data = await API.get(`/settlement/calculate/${genNo}`);
            el.innerHTML = `<table class="summary-table">
                <tr><td>CD Balance</td><td>${Utils.formatCurrency(data.cd_amount)}</td></tr>
                <tr><td>Share Balance</td><td>${Utils.formatCurrency(data.share_amount)}</td></tr>
                <tr><td><strong>Total Earnings</strong></td><td><strong>${Utils.formatCurrency(data.total_earnings)}</strong></td></tr>
                <tr><td>LL Outstanding</td><td>${Utils.formatCurrency(data.ll_outstanding)}</td></tr>
                <tr><td>SL Outstanding</td><td>${Utils.formatCurrency(data.sl_outstanding)}</td></tr>
                <tr><td>Interest Due</td><td>${Utils.formatCurrency(data.interest_due)}</td></tr>
                <tr><td><strong>Total Deductions</strong></td><td><strong>${Utils.formatCurrency(data.total_deductions)}</strong></td></tr>
                <tr class="total"><td>Final Payable</td><td class="${data.final_payable>=0?'text-success':'text-danger'}">${Utils.formatCurrency(data.final_payable)}</td></tr>
            </table>`;
        } catch {
            el.innerHTML = `<div class="alert alert-info"><span>ℹ️</span><span>Connect backend for live calculation preview</span></div>`;
        }
    }

    async function submitCreate() {
        const confirmed = await Auth.confirmPassword('Create final settlement');
        if (!confirmed) return;
        try {
            await API.post('/settlement', {
                member_gen_no: document.querySelector('[name="set_gen_no"]')?.value,
                settlement_type: document.querySelector('[name="set_type"]')?.value,
                dcrb: parseFloat(document.querySelector('[name="set_dcrb"]')?.value) || 0,
                other_receivable: parseFloat(document.querySelector('[name="set_other_recv"]')?.value) || 0,
                other_deductions: parseFloat(document.querySelector('[name="set_other_ded"]')?.value) || 0,
                voucher_no: document.querySelector('[name="set_voucher"]')?.value,
                remark: document.querySelector('[name="set_remark"]')?.value
            });
            Utils.showToast('Settlement created!', 'success');
            Utils.closeModal();
            loadSettlements();
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    async function approve(fsNo) {
        const confirmed = await Auth.confirmPassword(`Approve settlement ${fsNo}`);
        if (!confirmed) return;
        try {
            await API.post(`/settlement/${fsNo}/approve`);
            Utils.showToast('Settlement approved & executed!', 'success');
            loadSettlements();
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    function viewDetail(fsNo) {
        const s = _settlements.find(x => x.fs_no === fsNo);
        if (!s) return;
        Utils.openModal(`📑 Settlement ${fsNo}`, `
            <div class="info-grid">
                <div class="info-item"><div class="info-label">Member</div><div class="info-value">${s.member_name} (${s.member_gen_no})</div></div>
                <div class="info-item"><div class="info-label">Type</div><div class="info-value">${s.settlement_type}</div></div>
                <div class="info-item"><div class="info-label">Status</div><div class="info-value">${Utils.statusBadge(s.status)}</div></div>
                <div class="info-item"><div class="info-label">Date</div><div class="info-value">${Utils.formatDate(s.settlement_date)}</div></div>
                <div class="info-item"><div class="info-label">Earnings</div><div class="info-value">${Utils.formatCurrency(s.total_earnings)}</div></div>
                <div class="info-item"><div class="info-label">Deductions</div><div class="info-value">${Utils.formatCurrency(s.total_deductions)}</div></div>
                <div class="info-item"><div class="info-label">Final Payable</div><div class="info-value font-bold ${s.final_payable>=0?'text-success':'text-danger'}">${Utils.formatCurrency(s.final_payable)}</div></div>
            </div>`,
            `<button class="btn btn-secondary" onclick="Utils.closeModal()">Close</button>`
        );
    }

    function onSearch() {}

    return { render, init, onSearch, showCreate, preview, submitCreate, approve, viewDetail };
})();
