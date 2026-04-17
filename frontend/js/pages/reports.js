/**
 * NADSOC — Reports Page Module
 * Categorized report menu with generators and export.
 */
window.Pages = window.Pages || {};
window.Pages.reports = (() => {

    const REPORT_CATEGORIES = [
        {
            title: '📅 Demand & Recovery', reports: [
                { id: 'demand_statement', icon: '📋', title: 'Demand / Recovery Statement', desc: 'Monthly demand & recovery statement by Employee Type / Part', endpoint: '/reports/demand-statement' },
                { id: 'recovery_slips', icon: '🧾', title: 'Recovery Slips', desc: 'Generate recovery slips (5 per A4 page) for printing', endpoint: '/reports/demand-statement' },
            ]
        },
        {
            title: '💰 Financial', reports: [
                { id: 'trial_balance', icon: '📊', title: 'Trial Balance', desc: 'Society-wide trial balance with all heads', endpoint: '/reports/trial-balance' },
                { id: 'cd_interest', icon: '📈', title: 'CD Interest Distribution', desc: 'Member-wise CD interest calculation report', endpoint: '/reports/cd-interest' },
                { id: 'share_dividend', icon: '💎', title: 'Share Dividend Statement', desc: 'Member-wise share dividend report', endpoint: '/reports/share-dividend' },
                { id: 'expenditure', icon: '💸', title: 'Expenditure Report', desc: 'Date-wise expenditure statement', endpoint: '/reports/expenditure' },
            ]
        },
        {
            title: '👥 Membership', reports: [
                { id: 'member_summary', icon: '👤', title: 'Member Financial Summary', desc: 'Member-wise loan & deposit position', endpoint: '/reports/member-summary' },
                { id: 'member_list', icon: '📋', title: 'All Members Report', desc: 'Complete membership list with details', endpoint: '/reports/member-list' },
                { id: 'new_members', icon: '🆕', title: 'New / Closed Members', desc: 'Members joined or exited in selected period', endpoint: '/reports/new-members' },
            ]
        },
        {
            title: '🏦 Loans', reports: [
                { id: 'loan_outstanding', icon: '📊', title: 'Loan Outstanding & NPA', desc: 'Member-wise LL & SL outstanding with NPA status', endpoint: '/reports/npa' },
                { id: 'defaulters', icon: '⚠️', title: 'Defaulters Report', desc: 'Members with overdue payments', endpoint: '/reports/defaulters' },
                { id: 'emi_status', icon: '📅', title: 'EMI Recovery Status', desc: 'Bird\'s-eye view of all installment statuses', endpoint: '/reports/emi-status' },
            ]
        },
        {
            title: '📋 Fixed Deposits', reports: [
                { id: 'fd_register', icon: '📋', title: 'FD Register', desc: 'All FDs — active and closed', endpoint: '/reports/fd-register' },
                { id: 'fd_maturity', icon: '📅', title: 'FD Maturity Report', desc: 'FDs maturing in selected period for payment planning', endpoint: '/reports/fd-maturity' },
            ]
        },
        {
            title: '📊 Dashboard Stats', reports: [
                { id: 'dashboard_report', icon: '📊', title: 'Dashboard Summary', desc: 'Overview statistics and summary data', endpoint: '/reports/dashboard' },
            ]
        }
    ];

    function render() {
        let html = '<div class="mb-6"><p class="text-sm text-muted">Select a report to generate. All reports support Excel export and print.</p></div>';

        REPORT_CATEGORIES.forEach(cat => {
            html += `<h3 class="text-base font-bold mb-3 mt-6">${cat.title}</h3>`;
            html += '<div class="grid grid-3" style="gap:var(--sp-4)">';
            cat.reports.forEach(r => {
                html += `<div class="report-card" onclick="Pages.reports.openReport('${r.id}')">
                    <div class="report-card-icon">${r.icon}</div>
                    <div class="report-card-title">${r.title}</div>
                    <div class="report-card-desc">${r.desc}</div>
                </div>`;
            });
            html += '</div>';
        });

        return html;
    }

    function init() {}

    function openReport(reportId) {
        const allReports = REPORT_CATEGORIES.flatMap(c => c.reports);
        const report = allReports.find(r => r.id === reportId);
        if (!report) return;

        let filterHtml = '';

        // Common filters based on report type
        if (['demand_statement', 'recovery_slips'].includes(reportId)) {
            filterHtml = `
                <div class="form-row">
                    ${Utils.formField({ name: 'rpt_month', label: 'Month', type: 'month', required: true, value: Utils.getCurrentMonthYear() })}
                    ${Utils.formField({ name: 'rpt_emptype', label: 'Employee Type', type: 'select', options: [{value:'',label:'All'},{value:'Industrial',label:'Industrial'},{value:'Non-Industrial',label:'Non-Industrial'}] })}
                </div>
                <div class="form-row">
                    ${Utils.formField({ name: 'rpt_part', label: 'Part', type: 'select', options: [{value:'',label:'All'},{value:'Part A',label:'Part A'},{value:'Part B',label:'Part B'},{value:'Part C',label:'Part C'},{value:'Part D',label:'Part D'}] })}
                </div>`;
        } else if (['expenditure', 'new_members'].includes(reportId)) {
            filterHtml = `
                <div class="form-row">
                    ${Utils.formField({ name: 'rpt_from', label: 'From Date', type: 'date', required: true })}
                    ${Utils.formField({ name: 'rpt_to', label: 'To Date', type: 'date', required: true })}
                </div>`;
        } else if (['cd_interest', 'share_dividend'].includes(reportId)) {
            filterHtml = `
                <div class="form-row">
                    ${Utils.formField({ name: 'rpt_fy', label: 'Financial Year', type: 'select', required: true, options: [Utils.getFinancialYear()].map(fy => ({value:fy,label:'FY '+fy})) })}
                </div>`;
        } else if (['fd_maturity'].includes(reportId)) {
            filterHtml = `
                <div class="form-row">
                    ${Utils.formField({ name: 'rpt_from', label: 'From Date', type: 'date', value: new Date().toISOString().split('T')[0] })}
                    ${Utils.formField({ name: 'rpt_to', label: 'To Date', type: 'date', value: new Date(Date.now()+90*86400000).toISOString().split('T')[0] })}
                </div>`;
        }

        Utils.openModal(`${report.icon} ${report.title}`,
            `<p class="text-sm text-muted mb-4">${report.desc}</p>
            ${filterHtml}
            <div id="report-result" class="mt-4"></div>`,
            `<button class="btn btn-secondary" onclick="Utils.closeModal()">Close</button>
             <button class="btn btn-secondary" onclick="Pages.reports.printReport()">🖨️ Print</button>
             <button class="btn btn-primary" onclick="Pages.reports.generateReport('${reportId}')">📥 Generate Excel</button>`,
            { maxWidth: '700px' }
        );
    }

    async function generateReport(reportId) {
        const allReports = REPORT_CATEGORIES.flatMap(c => c.reports);
        const report = allReports.find(r => r.id === reportId);
        if (!report) return;

        const result = document.getElementById('report-result');
        if (result) result.innerHTML = Utils.renderLoading();

        // Build query params from filter fields
        const params = new URLSearchParams();
        document.querySelectorAll('.modal [name^="rpt_"]').forEach(el => {
            if (el.value) params.set(el.name.replace('rpt_', ''), el.value);
        });

        try {
            const query = params.toString();
            const filename = `${report.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
            await API.download(`${report.endpoint}${query ? '?' + query : ''}`, filename);
            if (result) result.innerHTML = `<div class="alert alert-success"><span>✅</span><span>Report downloaded: <strong>${filename}</strong></span></div>`;
            Utils.showToast('Report downloaded!', 'success');
        } catch (err) {
            if (result) result.innerHTML = `<div class="alert alert-warning"><span>⚠️</span><span>${err.message || 'Report generation requires backend connection'}</span></div>`;
        }
    }

    function printReport() {
        window.print();
    }

    return { render, init, openReport, generateReport, printReport };
})();
