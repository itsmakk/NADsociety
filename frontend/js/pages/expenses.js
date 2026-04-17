/**
 * NADSOC — Expenses Page Module
 */
window.Pages = window.Pages || {};
window.Pages.expenses = (() => {
    let _expenses = [];
    let _page = 1;
    let _perPage = 25;
    let _total = 0;

    function render() {
        return `
        ${Utils.renderToolbar({
            searchPlaceholder: 'Search by EX No, Paid To...',
            onSearch: 'Pages.expenses.onSearch', searchId: 'exp-search',
            filters: [
                { id: 'filter-cat', placeholder: 'All Categories', options: ['Office Expenses','Stationery','Maintenance','Admin Charges','Software/IT','Misc'], onChange: 'Pages.expenses.onFilterCat' },
                { id: 'filter-status', placeholder: 'All Statuses', options: ['POSTED','CANCELLED'], onChange: 'Pages.expenses.onFilterStatus' }
            ],
            buttons: [
                { label: 'Add Expense', icon: '➕', class: 'btn btn-primary', onClick: 'Pages.expenses.showAdd()' }
            ]
        })}
        <div id="expense-table">${Utils.renderLoading()}</div>
        <div id="expense-pagination"></div>`;
    }

    function init() { loadExpenses(); }

    async function loadExpenses() {
        const el = document.getElementById('expense-table');
        if (!el) return;
        el.innerHTML = Utils.renderLoading();
        try {
            const data = await API.get('/expenses');
            _expenses = data.expenses || data.data || [];
            _total = data.total || _expenses.length;
        } catch {
            _expenses = [
                { ex_no:'EX-25-001', expense_date:'2026-01-15', category:'Office Expenses', paid_to:'ABC Stationery', amount:2500, payment_mode:'Cash', voucher_no:'V-1001', status:'POSTED', remark:'Monthly stationery' },
                { ex_no:'EX-25-002', expense_date:'2026-02-03', category:'Maintenance', paid_to:'XYZ Services', amount:5000, payment_mode:'Bank', voucher_no:'V-1002', status:'POSTED', remark:'AC repair' },
                { ex_no:'EX-25-003', expense_date:'2026-02-20', category:'Software/IT', paid_to:'Cloud Corp', amount:1200, payment_mode:'Bank', voucher_no:'V-1003', status:'CANCELLED', remark:'Duplicate entry - cancelled' },
                { ex_no:'EX-25-004', expense_date:'2026-03-01', category:'Admin Charges', paid_to:'Registration Office', amount:3500, payment_mode:'Cash', voucher_no:'V-1004', status:'POSTED', remark:'Annual registration' },
            ];
            _total = _expenses.length;
        }
        renderTable();
    }

    function renderTable() {
        const el = document.getElementById('expense-table');
        const pagEl = document.getElementById('expense-pagination');
        if (!el) return;
        el.innerHTML = Utils.renderTable([
            { key: 'ex_no', label: 'EX No', render: r => `<span class="font-semibold">${r.ex_no}</span>` },
            { key: 'expense_date', label: 'Date', render: r => Utils.formatDate(r.expense_date) },
            { key: 'category', label: 'Category' },
            { key: 'paid_to', label: 'Paid To' },
            { key: 'amount', label: 'Amount', align: 'right', render: r => Utils.formatCurrency(r.amount) },
            { key: 'payment_mode', label: 'Mode', width: '80px' },
            { key: 'voucher_no', label: 'Voucher No' },
            { key: 'status', label: 'Status', render: r => Utils.statusBadge(r.status) },
            { key: 'actions', label: '', width: '80px', render: r =>
                r.status === 'POSTED' ?
                `<button class="btn btn-sm btn-secondary" onclick="Pages.expenses.showCancel('${r.ex_no}')" title="Cancel">🚫</button>` : '' }
        ], _expenses, { emptyIcon: '💸', emptyText: 'No expenses recorded' });
        if (pagEl) pagEl.innerHTML = Utils.renderPagination(_total, _page, _perPage, 'Pages.expenses.goToPage');
    }

    function showAdd() {
        Utils.openModal('➕ Add Expense', `
            <div class="form-row">
                ${Utils.formField({ name: 'exp_date', label: 'Expense Date', type: 'date', required: true, value: new Date().toISOString().split('T')[0] })}
                ${Utils.formField({ name: 'exp_category', label: 'Category', type: 'select', required: true, options: ['Office Expenses','Stationery','Maintenance','Admin Charges','Software/IT','Misc'] })}
            </div>
            <div class="form-row">
                ${Utils.formField({ name: 'exp_paid_to', label: 'Paid To', required: true, placeholder: 'Name of payee' })}
                ${Utils.formField({ name: 'exp_amount', label: 'Amount (₹)', type: 'number', required: true, min: 1 })}
            </div>
            <div class="form-row">
                ${Utils.formField({ name: 'exp_mode', label: 'Payment Mode', type: 'select', required: true, options: ['Cash','Bank','Other'] })}
                ${Utils.formField({ name: 'exp_voucher', label: 'Voucher No', required: true, placeholder: 'From physical book' })}
            </div>
            ${Utils.formField({ name: 'exp_remark', label: 'Remark', type: 'textarea', rows: 2 })}`,
            `<button class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
             <button class="btn btn-primary" onclick="Pages.expenses.submitAdd()">💾 Save Expense</button>`,
            { maxWidth: '600px' }
        );
    }

    async function submitAdd() {
        const confirmed = await Auth.confirmPassword('Record expense entry');
        if (!confirmed) return;
        try {
            await API.post('/expenses', {
                expense_date: document.querySelector('[name="exp_date"]')?.value,
                category: document.querySelector('[name="exp_category"]')?.value,
                paid_to: document.querySelector('[name="exp_paid_to"]')?.value,
                amount: parseFloat(document.querySelector('[name="exp_amount"]')?.value),
                payment_mode: document.querySelector('[name="exp_mode"]')?.value,
                voucher_no: document.querySelector('[name="exp_voucher"]')?.value,
                remark: document.querySelector('[name="exp_remark"]')?.value
            });
            Utils.showToast('Expense recorded!', 'success');
            Utils.closeModal();
            loadExpenses();
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    function showCancel(exNo) {
        Utils.openModal('🚫 Cancel Expense', `
            <p class="text-sm mb-4">Cancel expense <strong>${exNo}</strong>?</p>
            <div class="alert alert-warning mb-4"><span>⚠️</span><span>Cancelled expenses remain visible for audit purposes.</span></div>
            ${Utils.formField({ name: 'cancel_remark', label: 'Cancellation Reason', type: 'textarea', rows: 2, required: true })}`,
            `<button class="btn btn-secondary" onclick="Utils.closeModal()">Keep</button>
             <button class="btn btn-danger" onclick="Pages.expenses.doCancel('${exNo}')">Cancel Expense</button>`
        );
    }

    async function doCancel(exNo) {
        const confirmed = await Auth.confirmPassword('Cancel expense ' + exNo);
        if (!confirmed) return;
        try {
            await API.post(`/expenses/${exNo}/cancel`, {
                remark: document.querySelector('[name="cancel_remark"]')?.value
            });
            Utils.showToast('Expense cancelled', 'success');
            Utils.closeModal();
            loadExpenses();
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    function onSearch() {}
    function onFilterCat() {}
    function onFilterStatus() {}
    function goToPage(p) { _page = p; loadExpenses(); }

    return { render, init, onSearch, onFilterCat, onFilterStatus, goToPage, showAdd, submitAdd, showCancel, doCancel };
})();
