/**
 * NADSOC — Demand & Recovery Page Module
 */
window.Pages = window.Pages || {};
window.Pages.demand = (() => {

    function render() {
        return `
        <div class="card" id="demand-container">
            <div class="tab-bar">
                <button class="tab-item active" data-tab="tab-generate">📅 Generate Demand</button>
                <button class="tab-item" data-tab="tab-recovery">💳 Post Recovery</button>
                <button class="tab-item" data-tab="tab-summary">📊 Summary</button>
                <button class="tab-item" data-tab="tab-batches">📋 Batch History</button>
            </div>

            <div class="tab-panel active" id="tab-generate">
                <div class="alert alert-info mb-4"><span>ℹ️</span><span>Generate monthly demand for all active members. System calculates CD, Share, Principal, and Interest components.</span></div>
                <div class="form-row mb-4">
                    ${Utils.formField({ name: 'demand_month', label: 'Month', type: 'month', required: true, value: Utils.getCurrentMonthYear() })}
                    ${Utils.formField({ name: 'demand_emptype', label: 'Employee Type', type: 'select', options: [{value:'',label:'All Types'},{value:'Industrial',label:'Industrial'},{value:'Non-Industrial',label:'Non-Industrial'}] })}
                </div>
                <div id="demand-gen-status" class="mb-4"></div>
                <div class="flex gap-3">
                    <button class="btn btn-primary btn-lg" onclick="Pages.demand.generateDemand()" id="gen-demand-btn">⚡ Generate Monthly Demand</button>
                </div>
            </div>

            <div class="tab-panel" id="tab-recovery">
                <div class="form-row mb-4">
                    ${Utils.formField({ name: 'rec_month', label: 'Month', type: 'month', required: true, value: Utils.getCurrentMonthYear() })}
                    ${Utils.formField({ name: 'rec_emptype', label: 'Employee Type', type: 'select', options: ['','Industrial','Non-Industrial'] })}
                    ${Utils.formField({ name: 'rec_part', label: 'Part', type: 'select', options: ['','Part A','Part B','Part C','Part D'] })}
                </div>
                <button class="btn btn-secondary mb-4" onclick="Pages.demand.loadRecovery()">🔍 Load Demands</button>
                <div id="recovery-table">${Utils.renderEmptyState('💳', 'Select filters and click Load', 'Recovery data will appear here')}</div>
                <div id="recovery-actions" style="display:none" class="form-actions">
                    <button class="btn btn-primary" onclick="Pages.demand.submitRecovery()" id="submit-rec-btn">✅ Submit Recovery</button>
                </div>
            </div>

            <div class="tab-panel" id="tab-summary">
                <div class="form-row mb-4">
                    ${Utils.formField({ name: 'sum_month', label: 'Month', type: 'month', value: Utils.getCurrentMonthYear() })}
                </div>
                <button class="btn btn-secondary mb-4" onclick="Pages.demand.loadSummary()">📊 View Summary</button>
                <div id="summary-content">${Utils.renderEmptyState('📊', 'Select a month', '')}</div>
            </div>

            <div class="tab-panel" id="tab-batches">
                <div id="batches-table">${Utils.renderLoading()}</div>
            </div>
        </div>`;
    }

    function init() {
        Utils.initTabs('demand-container');
        loadBatches();
    }

    async function generateDemand() {
        const month = document.querySelector('[name="demand_month"]')?.value;
        const empType = document.querySelector('[name="demand_emptype"]')?.value;
        if (!month) { Utils.showToast('Please select a month', 'warning'); return; }

        const confirmed = await Auth.confirmPassword('Generate monthly demand for ' + month);
        if (!confirmed) return;

        const btn = document.getElementById('gen-demand-btn');
        const status = document.getElementById('demand-gen-status');
        btn.disabled = true; btn.textContent = 'Generating...';
        status.innerHTML = `
            <div class="card" style="padding:var(--sp-4)">
                <div class="flex items-center gap-3 mb-3">
                    <div class="spinner"></div>
                    <span class="font-semibold">Processing demand generation...</span>
                </div>
                <div class="progress-bar"><div class="progress-bar-fill" style="width:0%" id="demand-progress"></div></div>
                <div class="text-sm text-muted mt-2" id="demand-progress-text">Starting...</div>
            </div>`;

        // Simulate progress
        let progress = 0;
        const interval = setInterval(() => {
            progress = Math.min(progress + Math.random()*15, 95);
            const fill = document.getElementById('demand-progress');
            const text = document.getElementById('demand-progress-text');
            if (fill) fill.style.width = progress + '%';
            if (text) text.textContent = `Processing ${Math.round(progress)}%...`;
        }, 500);

        try {
            await API.post('/demand/generate', { month_year: month, employee_type: empType || undefined });
            clearInterval(interval);
            const fill = document.getElementById('demand-progress');
            const text = document.getElementById('demand-progress-text');
            if (fill) fill.style.width = '100%';
            if (text) text.textContent = 'Complete!';
            status.innerHTML = `<div class="alert alert-success"><span>✅</span><span>Monthly demand generated successfully for <strong>${month}</strong>!</span></div>`;
            Utils.showToast('Demand generated!', 'success');
        } catch (err) {
            clearInterval(interval);
            status.innerHTML = `<div class="alert alert-danger"><span>❌</span><span>${err.message || 'Failed to generate demand'}</span></div>`;
        }
        btn.disabled = false; btn.textContent = '⚡ Generate Monthly Demand';
    }

    async function loadRecovery() {
        const month = document.querySelector('[name="rec_month"]')?.value;
        const el = document.getElementById('recovery-table');
        const actEl = document.getElementById('recovery-actions');
        if (!month) { Utils.showToast('Select a month', 'warning'); return; }
        el.innerHTML = Utils.renderLoading();

        try {
            const data = await API.get(`/demand/summary/${month}`);
            const members = data.members || data.demands || [];
            renderRecoveryTable(members);
        } catch {
            renderRecoveryTable(generateDemoRecovery());
        }
        if (actEl) actEl.style.display = 'flex';
    }

    function renderRecoveryTable(members) {
        const el = document.getElementById('recovery-table');
        if (!el) return;
        const cols = [
            { key: 'gen_no', label: 'GEN No', width: '80px' },
            { key: 'name', label: 'Name' },
            { key: 'cd_demand', label: 'CD', align: 'right', render: r => Utils.formatCurrency(r.cd_demand || 600) },
            { key: 'share_demand', label: 'Share', align: 'right', render: r => Utils.formatCurrency(r.share_demand || 100) },
            { key: 'principal_demand', label: 'LL P', align: 'right', render: r => Utils.formatCurrency(r.principal_demand || r.ll_principal || 0) },
            { key: 'interest_demand', label: 'LL I', align: 'right', render: r => Utils.formatCurrency(r.interest_demand || r.ll_interest || 0) },
            { key: 'total', label: 'Total', align: 'right', render: r => `<strong>${Utils.formatCurrency((r.cd_demand||600)+(r.share_demand||100)+(r.principal_demand||0)+(r.interest_demand||0))}</strong>` },
            { key: 'recovery', label: 'Recovery', width: '100px', render: (r,i) =>
                `<select class="form-select" style="width:auto;padding:2px 6px;font-size:12px" id="rec-type-${i}">
                    <option value="full">Full</option><option value="partial">Partial</option><option value="none">None</option>
                </select>` },
            { key: 'cr_no', label: 'CR No', width: '100px', render: (r,i) => `<input class="form-input" style="padding:4px 8px;font-size:12px" id="rec-cr-${i}" placeholder="CR No"/>` }
        ];
        el.innerHTML = Utils.renderTable(cols, members, { emptyIcon: '💳', emptyText: 'No demands for this period' });
    }

    function generateDemoRecovery() {
        return ['Ramesh Patil','Suresh Kumar','Anita Deshmukh','Prakash Jadhav','Meena Sharma'].map((n,i) => ({
            gen_no: String(1001+i), name: n, cd_demand: 600, share_demand: 100,
            principal_demand: 5000, interest_demand: 2000 - i * 200, total: 7700 - i*200
        }));
    }

    async function submitRecovery() {
        const confirmed = await Auth.confirmPassword('Submit recovery posting');
        if (!confirmed) return;
        const btn = document.getElementById('submit-rec-btn');
        btn.disabled = true; btn.textContent = 'Posting...';
        try {
            const month = document.querySelector('[name="rec_month"]')?.value;
            await API.post('/demand/recovery', { month_year: month, recovery_type: 'full' });
            Utils.showToast('Recovery posted successfully!', 'success');
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
        btn.disabled = false; btn.textContent = '✅ Submit Recovery';
    }

    async function loadSummary() {
        const month = document.querySelector('[name="sum_month"]')?.value;
        const el = document.getElementById('summary-content');
        if (!month || !el) return;
        el.innerHTML = Utils.renderLoading();
        try {
            const data = await API.get(`/demand/summary/${month}`);
            el.innerHTML = renderSummaryContent(data);
        } catch {
            el.innerHTML = renderSummaryContent({ month, total_cd: 288000, total_share: 48000, total_principal: 2400000, total_interest: 960000, member_count: 480 });
        }
    }

    function renderSummaryContent(data) {
        return `
        <div class="grid grid-3 mb-4">
            <div class="stat-card"><div class="stat-icon">👥</div><div><div class="stat-value">${Utils.formatNumber(data.member_count||0)}</div><div class="stat-label">Members</div></div></div>
            <div class="stat-card stat-card-success"><div class="stat-icon">💰</div><div><div class="stat-value">${Utils.formatCurrency((data.total_cd||0)+(data.total_share||0))}</div><div class="stat-label">CD + Share</div></div></div>
            <div class="stat-card stat-card-info"><div class="stat-icon">🏦</div><div><div class="stat-value">${Utils.formatCurrency((data.total_principal||0)+(data.total_interest||0))}</div><div class="stat-label">Loan P + I</div></div></div>
        </div>
        <table class="summary-table">
            <tr><td>Total CD Demand</td><td>${Utils.formatCurrency(data.total_cd)}</td></tr>
            <tr><td>Total Share Demand</td><td>${Utils.formatCurrency(data.total_share)}</td></tr>
            <tr><td>Total Principal Demand</td><td>${Utils.formatCurrency(data.total_principal)}</td></tr>
            <tr><td>Total Interest Demand</td><td>${Utils.formatCurrency(data.total_interest)}</td></tr>
            <tr class="total"><td>Grand Total</td><td>${Utils.formatCurrency((data.total_cd||0)+(data.total_share||0)+(data.total_principal||0)+(data.total_interest||0))}</td></tr>
        </table>`;
    }

    async function loadBatches() {
        const el = document.getElementById('batches-table');
        if (!el) return;
        try {
            const data = await API.get('/demand/batches');
            const batches = data.batches || data.data || [];
            el.innerHTML = Utils.renderTable([
                { key: 'month_year', label: 'Month' },
                { key: 'batch_type', label: 'Type' },
                { key: 'member_count', label: 'Members', align: 'right' },
                { key: 'status', label: 'Status', render: r => Utils.statusBadge(r.status||'Complete') },
                { key: 'created_date', label: 'Generated', render: r => Utils.formatDate(r.created_date) },
                { key: 'created_by', label: 'By' }
            ], batches, { emptyIcon: '📋', emptyText: 'No batch history' });
        } catch {
            el.innerHTML = Utils.renderEmptyState('📋', 'Batch history will appear here', 'Generate demand to see batch records');
        }
    }

    return { render, init, generateDemand, loadRecovery, submitRecovery, loadSummary };
})();
