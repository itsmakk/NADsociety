/**
 * NADSOC — Loans Page Module
 * Loan list, create wizard, detail view, foreclose, adjust, NPA.
 */
window.Pages = window.Pages || {};
window.Pages.loans = (() => {
    let _loans = [];
    let _page = 1;
    let _perPage = 25;
    let _total = 0;
    let _tab = 'all';
    let _search = '';
    let _wizardStep = 1;
    let _wizardData = {};

    function render(subView, params) {
        switch (subView) {
            case 'create': return renderCreateWizard();
            case 'view': return renderDetail(params);
            default: return renderList();
        }
    }

    function init(subView, params) {
        switch (subView) {
            case 'create': initCreateWizard(); break;
            case 'view': initDetail(params); break;
            default: loadLoans(); break;
        }
    }

    /* ========================================================================
       LOAN LIST
       ======================================================================== */
    function renderList() {
        return `
        <div class="flex items-center justify-between mb-4">
            <div class="pill-tabs">
                <button class="pill-tab ${_tab==='all'?'active':''}" onclick="Pages.loans.setTab('all')">All</button>
                <button class="pill-tab ${_tab==='Active'?'active':''}" onclick="Pages.loans.setTab('Active')">Active</button>
                <button class="pill-tab ${_tab==='Closed'?'active':''}" onclick="Pages.loans.setTab('Closed')">Closed</button>
                <button class="pill-tab ${_tab==='NPA'?'active':''}" onclick="Pages.loans.setTab('NPA')">NPA</button>
            </div>
            <button class="btn btn-primary" onclick="App.navigate('/loans/create')">➕ New Loan</button>
        </div>
        ${Utils.renderToolbar({
            searchPlaceholder: 'Search by Loan No, Member, GEN No...',
            onSearch: 'Pages.loans.onSearch',
            searchId: 'loan-search'
        })}
        <div id="loans-table">${Utils.renderLoading()}</div>
        <div id="loans-pagination"></div>`;
    }

    async function loadLoans() {
        const el = document.getElementById('loans-table');
        if (!el) return;
        el.innerHTML = Utils.renderLoading();
        try {
            const params = new URLSearchParams({ page: _page, per_page: _perPage, ..._search && { search: _search }, ..._tab!=='all' && { status: _tab } });
            const data = await API.get(`/loans?${params}`);
            _loans = data.loans || data.data || [];
            _total = data.total || _loans.length;
        } catch {
            _loans = generateDemoLoans();
            _total = _loans.length;
        }
        renderLoanTable();
    }

    function renderLoanTable() {
        const el = document.getElementById('loans-table');
        const pagEl = document.getElementById('loans-pagination');
        if (!el) return;
        const columns = [
            { key: 'loan_id', label: 'Loan No', render: r => `<a style="cursor:pointer;color:var(--clr-primary-500);font-weight:600" onclick="App.navigate('/loans/view?id=${r.loan_id}')">${r.loan_id}</a>` },
            { key: 'member_name', label: 'Member', render: r => `<span>${r.member_name||'—'} <span class="text-xs text-muted">(${r.member_gen_no||''})</span></span>` },
            { key: 'loan_type', label: 'Type', width: '70px' },
            { key: 'loan_mode', label: 'Mode', width: '80px', render: r => r.loan_mode||'New' },
            { key: 'sanction_amount', label: 'Sanctioned', align: 'right', render: r => Utils.formatCurrency(r.sanction_amount) },
            { key: 'outstanding', label: 'Outstanding', align: 'right', render: r => Utils.formatCurrency((r.outstanding_principal||0)+(r.outstanding_interest||0)) },
            { key: 'interest_rate', label: 'Rate', render: r => (r.interest_rate||0)+'%' },
            { key: 'status', label: 'Status', render: r => Utils.statusBadge(r.status) },
            { key: 'actions', label: '', width: '60px', render: r => `<button class="btn btn-sm btn-secondary" onclick="App.navigate('/loans/view?id=${r.loan_id}')">👁️</button>` }
        ];
        el.innerHTML = Utils.renderTable(columns, _loans, { emptyIcon: '🏦', emptyText: 'No loans found' });
        if (pagEl) pagEl.innerHTML = Utils.renderPagination(_total, _page, _perPage, 'Pages.loans.goToPage');
    }

    function generateDemoLoans() {
        return [
            { loan_id:'LL-25-001', member_gen_no:'1001', member_name:'Ramesh Patil', loan_type:'LL', loan_mode:'New', sanction_amount:300000, outstanding_principal:225000, outstanding_interest:4500, interest_rate:12, status:'Active', disbursed_amount:280000, tenure_months:60, fixed_principal:5000, created_date:'2025-04-15' },
            { loan_id:'SL-25-003', member_gen_no:'1003', member_name:'Anita Deshmukh', loan_type:'SL', loan_mode:'New', sanction_amount:40000, outstanding_principal:28000, outstanding_interest:800, interest_rate:12, status:'Active', disbursed_amount:40000, tenure_months:16, fixed_principal:2500, created_date:'2025-06-10' },
            { loan_id:'LL-24-012', member_gen_no:'1005', member_name:'Meena Sharma', loan_type:'LL', loan_mode:'Top-up', sanction_amount:400000, outstanding_principal:180000, outstanding_interest:12000, interest_rate:12, status:'NPA', disbursed_amount:350000, tenure_months:80, fixed_principal:5000, created_date:'2024-11-20' },
            { loan_id:'SL-25-008', member_gen_no:'1008', member_name:'Rajesh Pawar', loan_type:'SL', loan_mode:'New', sanction_amount:25000, outstanding_principal:0, outstanding_interest:0, interest_rate:12, status:'Closed', disbursed_amount:25000, tenure_months:10, fixed_principal:2500, created_date:'2025-01-05' },
            { loan_id:'LL-25-015', member_gen_no:'1010', member_name:'Deepa Joshi', loan_type:'LL', loan_mode:'New', sanction_amount:250000, outstanding_principal:210000, outstanding_interest:2100, interest_rate:12, status:'Active', disbursed_amount:230000, tenure_months:50, fixed_principal:5000, created_date:'2025-08-01' },
        ];
    }

    /* ========================================================================
       CREATE WIZARD
       ======================================================================== */
    function renderCreateWizard() {
        return `
        <div class="card">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold">🏦 New Loan Application</h2>
                <button class="btn btn-secondary" onclick="App.navigate('/loans')">← Back</button>
            </div>
            <div class="stepper" id="loan-stepper">
                <div class="stepper-step active"><div class="stepper-circle">1</div><span class="stepper-label">Member & Type</span></div>
                <div class="stepper-line"></div>
                <div class="stepper-step"><div class="stepper-circle">2</div><span class="stepper-label">Loan Details</span></div>
                <div class="stepper-line"></div>
                <div class="stepper-step"><div class="stepper-circle">3</div><span class="stepper-label">Review & Confirm</span></div>
            </div>
            <div id="wizard-content">${renderWizardStep1()}</div>
        </div>`;
    }

    function initCreateWizard() { _wizardStep = 1; _wizardData = {}; }

    function renderWizardStep1() {
        return `
        <div class="form-section-title">Select Member & Loan Type</div>
        <div class="form-row">
            ${Utils.formField({ name: 'member_gen_no', label: 'Member GEN No', required: true, placeholder: 'Enter GEN No' })}
            ${Utils.formField({ name: 'loan_type', label: 'Loan Type', type: 'select', required: true, options: [{value:'LL',label:'Long Loan (LL)'},{value:'SL',label:'Short Loan (SL)'}] })}
        </div>
        <div id="member-preview" class="mt-4"></div>
        <div class="form-actions">
            <button class="btn btn-primary" onclick="Pages.loans.wizardNext(1)">Next →</button>
        </div>`;
    }

    function renderWizardStep2() {
        const type = _wizardData.loan_type;
        const maxAmt = type === 'LL' ? '4,00,000' : '50,000';
        return `
        <div class="form-section-title">Loan Amount & Terms</div>
        <div class="form-row">
            ${Utils.formField({ name: 'sanction_amount', label: 'Loan Amount (₹)', type: 'number', required: true, placeholder: `Max ₹${maxAmt}`, min: 1000, step: 1000 })}
            ${Utils.formField({ name: 'interest_rate', label: 'Interest Rate (%)', type: 'number', required: true, value: '12', step: 0.5, min: 1 })}
            ${Utils.formField({ name: 'fixed_principal', label: 'Fixed Monthly Principal (₹)', type: 'number', required: true, placeholder: 'e.g. 5000', min: 100 })}
        </div>
        <div id="tenure-preview" class="alert alert-info mt-4" style="display:none"></div>
        <div class="form-actions">
            <button class="btn btn-secondary" onclick="Pages.loans.wizardBack(2)">← Back</button>
            <button class="btn btn-primary" onclick="Pages.loans.wizardNext(2)">Next →</button>
        </div>`;
    }

    function renderWizardStep3() {
        const d = _wizardData;
        const tenure = Math.ceil((d.sanction_amount || 0) / (d.fixed_principal || 1));
        const firstInterest = Math.round(((d.sanction_amount || 0) * (d.interest_rate || 12)) / 12 / 100);
        const emi = (d.fixed_principal || 0) + firstInterest;
        return `
        <div class="form-section-title">Disbursement Breakup</div>
        <div class="grid grid-2 mb-6">
            <div>
                <table class="summary-table">
                    <tr><td>Loan Type</td><td>${d.loan_type === 'LL' ? 'Long Loan' : 'Short Loan'}</td></tr>
                    <tr><td>Member</td><td>${d.member_gen_no}</td></tr>
                    <tr><td>Sanctioned Amount</td><td>${Utils.formatCurrency(d.sanction_amount)}</td></tr>
                    <tr><td>CD Funding (20%)</td><td>${Utils.formatCurrency(d.cd_funding || 0)}</td></tr>
                    <tr><td>Share Funding</td><td>${Utils.formatCurrency(d.share_funding || 0)}</td></tr>
                    <tr><td>Old LL Closure</td><td>${Utils.formatCurrency(d.old_ll || 0)}</td></tr>
                    <tr><td>Old SL Closure</td><td>${Utils.formatCurrency(d.old_sl || 0)}</td></tr>
                    <tr class="total"><td>Net Disbursed</td><td>${Utils.formatCurrency((d.sanction_amount||0)-(d.cd_funding||0)-(d.share_funding||0)-(d.old_ll||0)-(d.old_sl||0))}</td></tr>
                </table>
            </div>
            <div>
                <table class="summary-table">
                    <tr><td>Interest Rate</td><td>${d.interest_rate}% p.a.</td></tr>
                    <tr><td>Fixed Principal</td><td>${Utils.formatCurrency(d.fixed_principal)} /month</td></tr>
                    <tr><td>Derived Tenure</td><td>${tenure} months</td></tr>
                    <tr><td>First EMI (P+I)</td><td>${Utils.formatCurrency(emi)}</td></tr>
                </table>
            </div>
        </div>

        <div class="form-section-title">Amortization Preview (First 6 months)</div>
        ${renderAmortizationPreview(d, 6)}

        <div class="form-section-title">Voucher Details</div>
        <div class="form-row">
            ${Utils.formField({ name: 'voucher_no', label: 'Voucher No', required: true, placeholder: 'From physical payment book' })}
            ${Utils.formField({ name: 'remark', label: 'Remark', type: 'textarea', rows: 2 })}
        </div>

        <div class="form-actions">
            <button class="btn btn-secondary" onclick="Pages.loans.wizardBack(3)">← Back</button>
            <button class="btn btn-primary" id="submit-loan-btn" onclick="Pages.loans.submitLoan()">✅ Confirm & Issue Loan</button>
        </div>`;
    }

    function renderAmortizationPreview(d, months) {
        let balance = d.sanction_amount || 0;
        const rate = (d.interest_rate || 12) / 12 / 100;
        const fp = d.fixed_principal || 5000;
        const rows = [];
        for (let i = 1; i <= months; i++) {
            const interest = Math.round(balance * rate);
            const emi = fp + interest;
            balance -= fp;
            if (balance < 0) balance = 0;
            rows.push({ inst: i, opening: balance + fp, principal: fp, interest, emi, closing: balance, status: 'Upcoming' });
        }
        return Utils.renderTable([
            { key: 'inst', label: '#', width: '40px' },
            { key: 'opening', label: 'Opening Bal', align: 'right', render: r => Utils.formatCurrency(r.opening) },
            { key: 'principal', label: 'Principal', align: 'right', render: r => Utils.formatCurrency(r.principal) },
            { key: 'interest', label: 'Interest', align: 'right', render: r => Utils.formatCurrency(r.interest) },
            { key: 'emi', label: 'EMI', align: 'right', render: r => `<strong>${Utils.formatCurrency(r.emi)}</strong>` },
            { key: 'closing', label: 'Closing Bal', align: 'right', render: r => Utils.formatCurrency(r.closing) },
            { key: 'status', label: 'Status', render: r => `<span class="badge badge-info">${r.status}</span>` }
        ], rows, { emptyText: 'No data' });
    }

    function wizardNext(step) {
        const content = document.getElementById('wizard-content');
        if (step === 1) {
            const genNo = document.querySelector('[name="member_gen_no"]')?.value;
            const type = document.querySelector('[name="loan_type"]')?.value;
            if (!genNo || !type) { Utils.showToast('Please fill all required fields', 'warning'); return; }
            _wizardData.member_gen_no = genNo;
            _wizardData.loan_type = type;
            _wizardStep = 2;
            content.innerHTML = renderWizardStep2();
            updateStepper();
            // Auto-calculate tenure on input
            const amtInput = document.querySelector('[name="sanction_amount"]');
            const fpInput = document.querySelector('[name="fixed_principal"]');
            if (amtInput && fpInput) {
                const calc = () => {
                    const amt = parseFloat(amtInput.value) || 0;
                    const fp = parseFloat(fpInput.value) || 1;
                    const tenure = Math.ceil(amt / fp);
                    const preview = document.getElementById('tenure-preview');
                    if (preview && amt > 0 && fp > 0) {
                        preview.style.display = 'flex';
                        preview.innerHTML = `<span>📐</span><span>Derived Tenure: <strong>${tenure} months</strong> (${(tenure/12).toFixed(1)} years)</span>`;
                    }
                };
                amtInput.addEventListener('input', calc);
                fpInput.addEventListener('input', calc);
            }
        } else if (step === 2) {
            const amt = parseFloat(document.querySelector('[name="sanction_amount"]')?.value) || 0;
            const rate = parseFloat(document.querySelector('[name="interest_rate"]')?.value) || 12;
            const fp = parseFloat(document.querySelector('[name="fixed_principal"]')?.value) || 0;
            if (!amt || !fp) { Utils.showToast('Please fill all required fields', 'warning'); return; }
            _wizardData.sanction_amount = amt;
            _wizardData.interest_rate = rate;
            _wizardData.fixed_principal = fp;
            // Calculate CD/Share funding (simplified)
            const cdRequired = amt * 0.2;
            _wizardData.cd_funding = Math.max(0, cdRequired - 30000); // assume 30k existing CD
            _wizardData.share_funding = Math.max(0, 8000 - 6000); // assume 6k existing share
            _wizardStep = 3;
            content.innerHTML = renderWizardStep3();
            updateStepper();
        }
    }

    function wizardBack(step) {
        const content = document.getElementById('wizard-content');
        if (step === 2) { _wizardStep = 1; content.innerHTML = renderWizardStep1(); }
        else if (step === 3) { _wizardStep = 2; content.innerHTML = renderWizardStep2(); }
        updateStepper();
    }

    function updateStepper() {
        const steps = document.querySelectorAll('#loan-stepper .stepper-step');
        steps.forEach((s, i) => {
            s.classList.remove('active', 'completed');
            if (i + 1 < _wizardStep) s.classList.add('completed');
            else if (i + 1 === _wizardStep) s.classList.add('active');
        });
    }

    async function submitLoan() {
        const voucher = document.querySelector('[name="voucher_no"]')?.value;
        if (!voucher) { Utils.showToast('Voucher No is required', 'warning'); return; }
        const confirmed = await Auth.confirmPassword('Confirm loan disbursement');
        if (!confirmed) return;
        const btn = document.getElementById('submit-loan-btn');
        btn.disabled = true; btn.textContent = 'Processing...';
        try {
            _wizardData.voucher_no = voucher;
            _wizardData.remark = document.querySelector('[name="remark"]')?.value || '';
            await API.post('/loans', _wizardData);
            Utils.showToast('Loan issued successfully!', 'success');
            App.navigate('/loans');
        } catch (err) {
            Utils.showToast(err.message || 'Failed to issue loan', 'error');
            btn.disabled = false; btn.textContent = '✅ Confirm & Issue Loan';
        }
    }

    /* ========================================================================
       LOAN DETAIL VIEW
       ======================================================================== */
    function renderDetail() {
        return `<div id="loan-detail">${Utils.renderLoading()}</div>`;
    }

    async function initDetail(params) {
        const id = params?.id;
        if (!id) { App.navigate('/loans'); return; }
        let loan;
        try {
            const data = await API.get(`/loans/${id}`);
            loan = data.loan || data;
        } catch {
            loan = generateDemoLoans().find(l => l.loan_id === id) || generateDemoLoans()[0];
            loan.loan_id = id;
        }
        renderDetailContent(loan);
    }

    function renderDetailContent(loan) {
        const el = document.getElementById('loan-detail');
        if (!el) return;
        const outstanding = (loan.outstanding_principal||0) + (loan.outstanding_interest||0);
        const tenure = Math.ceil((loan.sanction_amount||0)/(loan.fixed_principal||1));
        el.innerHTML = `
        <div class="detail-header">
            <div class="detail-avatar" style="background:linear-gradient(135deg,${loan.loan_type==='LL'?'var(--clr-primary-400),var(--clr-primary-700)':'var(--clr-info),#60A5FA'})">${loan.loan_type}</div>
            <div class="detail-info">
                <div class="detail-name">${loan.loan_id} ${Utils.statusBadge(loan.status)}</div>
                <div class="detail-meta">
                    <span class="detail-meta-item">👤 ${loan.member_name||loan.member_gen_no}</span>
                    <span class="detail-meta-item">📅 Issued: ${Utils.formatDate(loan.created_date)}</span>
                    <span class="detail-meta-item">📊 ${loan.loan_mode||'New'} Loan</span>
                </div>
            </div>
            <div class="detail-actions">
                ${loan.status === 'Active' ? `
                    <button class="btn btn-secondary btn-sm" onclick="Pages.loans.showForeclose('${loan.loan_id}')">🔒 Foreclose</button>
                    <button class="btn btn-secondary btn-sm" onclick="Pages.loans.showAdjust('${loan.loan_id}')">⚡ Adjust</button>
                ` : ''}
                <button class="btn btn-secondary btn-sm" onclick="App.navigate('/loans')">← Back</button>
            </div>
        </div>

        <div class="grid grid-4 mb-6">
            <div class="stat-card"><div class="stat-icon">💵</div><div><div class="stat-value">${Utils.formatCurrency(loan.sanction_amount)}</div><div class="stat-label">Sanctioned</div></div></div>
            <div class="stat-card stat-card-warning"><div class="stat-icon">📊</div><div><div class="stat-value">${Utils.formatCurrency(outstanding)}</div><div class="stat-label">Outstanding</div></div></div>
            <div class="stat-card stat-card-info"><div class="stat-icon">📈</div><div><div class="stat-value">${loan.interest_rate}%</div><div class="stat-label">Interest Rate</div></div></div>
            <div class="stat-card stat-card-success"><div class="stat-icon">📅</div><div><div class="stat-value">${tenure} mo</div><div class="stat-label">Tenure</div></div></div>
        </div>

        <div class="card mb-6">
            <h3 class="text-base font-bold mb-4">Loan Details</h3>
            <div class="info-grid">
                <div class="info-item"><div class="info-label">Disbursed Amount</div><div class="info-value">${Utils.formatCurrency(loan.disbursed_amount)}</div></div>
                <div class="info-item"><div class="info-label">Fixed Principal</div><div class="info-value">${Utils.formatCurrency(loan.fixed_principal)} /month</div></div>
                <div class="info-item"><div class="info-label">Outstanding Principal</div><div class="info-value">${Utils.formatCurrency(loan.outstanding_principal)}</div></div>
                <div class="info-item"><div class="info-label">Outstanding Interest</div><div class="info-value">${Utils.formatCurrency(loan.outstanding_interest)}</div></div>
                <div class="info-item"><div class="info-label">CD Adjustment</div><div class="info-value">${Utils.formatCurrency(loan.cd_adjustment||0)}</div></div>
                <div class="info-item"><div class="info-label">Share Adjustment</div><div class="info-value">${Utils.formatCurrency(loan.share_adjustment||0)}</div></div>
            </div>
        </div>

        <div class="card">
            <h3 class="text-base font-bold mb-4">Amortization Schedule</h3>
            ${renderAmortizationPreview(loan, Math.min(tenure, 24))}
        </div>`;
    }

    function showForeclose(loanId) {
        Utils.openModal('🔒 Foreclose Loan', `
            <p class="text-sm mb-4">Are you sure you want to foreclose loan <strong>${loanId}</strong>?</p>
            <div class="alert alert-warning mb-4"><span>⚠️</span><span>This will close the loan and release any surety obligations.</span></div>
            ${Utils.formField({ name: 'foreclose_remark', label: 'Remark', type: 'textarea', rows: 2 })}`,
            `<button class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
             <button class="btn btn-danger" onclick="Pages.loans.doForeclose('${loanId}')">Confirm Foreclose</button>`
        );
    }

    async function doForeclose(loanId) {
        const confirmed = await Auth.confirmPassword('Confirm loan foreclosure');
        if (!confirmed) return;
        try {
            await API.post(`/loans/${loanId}/foreclose`, { remark: document.querySelector('[name="foreclose_remark"]')?.value || '' });
            Utils.showToast('Loan foreclosed successfully', 'success');
            Utils.closeModal();
            App.navigate('/loans');
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    function showAdjust(loanId) {
        Utils.openModal('⚡ Loan Adjustment', `
            <p class="text-sm text-muted mb-4">Post a manual adjustment or reversal entry for loan <strong>${loanId}</strong></p>
            <div class="form-row">
                ${Utils.formField({ name: 'adj_type', label: 'Type', type: 'select', required: true, options: ['Adjustment','Reversal'] })}
                ${Utils.formField({ name: 'adj_amount', label: 'Amount (₹)', type: 'number', required: true, min: 1 })}
            </div>
            ${Utils.formField({ name: 'adj_cr_no', label: 'CR No', required: true, placeholder: 'From receipt book' })}
            ${Utils.formField({ name: 'adj_remark', label: 'Remark', type: 'textarea', rows: 2, required: true })}`,
            `<button class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
             <button class="btn btn-primary" onclick="Pages.loans.doAdjust('${loanId}')">Submit Adjustment</button>`
        );
    }

    async function doAdjust(loanId) {
        const confirmed = await Auth.confirmPassword('Confirm loan adjustment');
        if (!confirmed) return;
        try {
            await API.post(`/loans/${loanId}/adjust`, {
                type: document.querySelector('[name="adj_type"]')?.value,
                amount: parseFloat(document.querySelector('[name="adj_amount"]')?.value) || 0,
                cr_no: document.querySelector('[name="adj_cr_no"]')?.value,
                remark: document.querySelector('[name="adj_remark"]')?.value
            });
            Utils.showToast('Adjustment posted', 'success');
            Utils.closeModal();
            initDetail({ id: loanId });
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    /* ========================================================================
       HANDLERS
       ======================================================================== */
    function setTab(t) { _tab = t; _page = 1; App.navigate('/loans'); }
    function onSearch(val) { _search = val; _page = 1; loadLoans(); }
    function goToPage(p) { _page = p; loadLoans(); }

    return {
        render, init, setTab, onSearch: Utils.debounce(onSearch, 400), goToPage,
        wizardNext, wizardBack, submitLoan,
        showForeclose, doForeclose, showAdjust, doAdjust
    };
})();
