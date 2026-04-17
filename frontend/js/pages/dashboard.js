/**
 * NADSOC — Dashboard Page Module
 * Displays stat cards, charts, quick actions, and alerts.
 */
window.Pages = window.Pages || {};
window.Pages.dashboard = (() => {
    let _stats = null;
    let _charts = {};

    function render() {
        return `
        <!-- Stat Cards -->
        <div class="grid grid-4 mb-6" id="dash-stats">
            ${renderStatCards(null)}
        </div>

        <!-- Charts Row -->
        <div class="grid grid-3 mb-6">
            <div class="chart-card">
                <div class="chart-card-title">Loan Distribution</div>
                <div class="chart-wrap"><canvas id="chart-loan-dist"></canvas></div>
            </div>
            <div class="chart-card">
                <div class="chart-card-title">Monthly Recovery Trend</div>
                <div class="chart-wrap"><canvas id="chart-recovery"></canvas></div>
            </div>
            <div class="chart-card">
                <div class="chart-card-title">Member Composition</div>
                <div class="chart-wrap"><canvas id="chart-members"></canvas></div>
            </div>
        </div>

        <!-- Quick Actions + Alerts -->
        <div class="grid grid-2">
            <div class="card">
                <h3 class="text-base font-bold mb-4">⚡ Quick Actions</h3>
                <div class="grid grid-2" style="gap:var(--sp-3)">
                    <div class="action-card" onclick="App.navigate('/demand')">
                        <div class="action-card-icon" style="background:var(--clr-info-bg);color:var(--clr-info);">📅</div>
                        <div class="action-card-label">Generate Demand</div>
                    </div>
                    <div class="action-card" onclick="App.navigate('/loans/create')">
                        <div class="action-card-icon" style="background:var(--clr-success-bg);color:var(--clr-success);">🏦</div>
                        <div class="action-card-label">New Loan</div>
                    </div>
                    <div class="action-card" onclick="App.navigate('/members/add')">
                        <div class="action-card-icon" style="background:var(--clr-warning-bg);color:var(--clr-warning);">👤</div>
                        <div class="action-card-label">Add Member</div>
                    </div>
                    <div class="action-card" onclick="App.navigate('/reports')">
                        <div class="action-card-icon" style="background:var(--clr-primary-50);color:var(--clr-primary-500);">📈</div>
                        <div class="action-card-label">View Reports</div>
                    </div>
                    <div class="action-card" onclick="App.navigate('/fd')">
                        <div class="action-card-icon" style="background:#FEF3C7;color:#D97706;">📋</div>
                        <div class="action-card-label">Fixed Deposits</div>
                    </div>
                    <div class="action-card" onclick="App.navigate('/settlement')">
                        <div class="action-card-icon" style="background:#FEE2E2;color:#DC2626;">📑</div>
                        <div class="action-card-label">Settlements</div>
                    </div>
                </div>
            </div>
            <div class="card">
                <h3 class="text-base font-bold mb-4">🔔 Alerts & Notifications</h3>
                <div id="dash-alerts">
                    <div class="alert-card alert-card-info"><span>ℹ️</span><span>Loading alerts...</span></div>
                </div>
            </div>
        </div>`;
    }

    function renderStatCards(s) {
        const stats = s || { total_members: '—', active_loans: '—', total_deposits: '—', monthly_recovery: '—', npa_count: '—', pending_settlements: '—' };
        return `
            <div class="stat-card">
                <div class="stat-icon">👥</div>
                <div><div class="stat-value">${typeof stats.total_members==='number'?Utils.formatNumber(stats.total_members):stats.total_members}</div><div class="stat-label">Total Members</div></div>
            </div>
            <div class="stat-card stat-card-success">
                <div class="stat-icon">🏦</div>
                <div><div class="stat-value">${typeof stats.active_loans==='number'?Utils.formatNumber(stats.active_loans):stats.active_loans}</div><div class="stat-label">Active Loans</div></div>
            </div>
            <div class="stat-card stat-card-info">
                <div class="stat-icon">💰</div>
                <div><div class="stat-value">${typeof stats.total_deposits==='number'?Utils.formatCurrency(stats.total_deposits):stats.total_deposits}</div><div class="stat-label">Total CD + Share</div></div>
            </div>
            <div class="stat-card stat-card-warning">
                <div class="stat-icon">📊</div>
                <div><div class="stat-value">${typeof stats.monthly_recovery==='number'?Utils.formatCurrency(stats.monthly_recovery):stats.monthly_recovery}</div><div class="stat-label">Monthly Recovery</div></div>
            </div>`;
    }

    async function init() {
        // Load dashboard data
        try {
            const data = await API.get('/reports/dashboard');
            _stats = data;
            document.getElementById('dash-stats').innerHTML = renderStatCards(data);
            renderAlerts(data);
            renderCharts(data);
        } catch (err) {
            // Show demo data if backend unavailable
            const demo = {
                total_members: 4823, active_loans: 1247, total_deposits: 15230000,
                monthly_recovery: 3420000, npa_count: 23, pending_settlements: 5,
                loan_ll_count: 890, loan_sl_count: 357,
                recovery_trend: [28,32,35,31,34,33,30,36,34,32,35,38].map(v=>v*100000),
                member_active: 4200, member_retired: 423, member_settled: 200
            };
            document.getElementById('dash-stats').innerHTML = renderStatCards(demo);
            renderAlerts(demo);
            renderCharts(demo);
        }
    }

    function renderAlerts(data) {
        const el = document.getElementById('dash-alerts');
        if (!el) return;
        let html = '';
        if (data.npa_count > 0) {
            html += `<div class="alert-card alert-card-danger"><span>⚠️</span><span><strong>${data.npa_count}</strong> loan(s) marked as NPA</span></div>`;
        }
        if (data.pending_settlements > 0) {
            html += `<div class="alert-card alert-card-warning"><span>📋</span><span><strong>${data.pending_settlements}</strong> settlement(s) pending approval</span></div>`;
        }
        const fd = data.fd_maturing_soon || 0;
        if (fd > 0) {
            html += `<div class="alert-card alert-card-info"><span>📅</span><span><strong>${fd}</strong> FD(s) maturing within 30 days</span></div>`;
        }
        const defaults = data.defaults_3plus || 0;
        if (defaults > 0) {
            html += `<div class="alert-card alert-card-danger"><span>🔴</span><span><strong>${defaults}</strong> member(s) with 3+ consecutive defaults — surety action required</span></div>`;
        }
        if (!html) {
            html = '<div class="alert-card alert-card-info"><span>✅</span><span>No critical alerts at this time</span></div>';
        }
        html += `<div class="alert-card alert-card-info mt-2"><span>📆</span><span>Financial Year ${Utils.getFinancialYear()} | ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})}</span></div>`;
        el.innerHTML = html;
    }

    function renderCharts(data) {
        if (typeof Chart === 'undefined') return;

        // Destroy existing charts
        Object.values(_charts).forEach(c => c.destroy && c.destroy());
        _charts = {};

        const primary = '#1A56DB';
        const success = '#059669';
        const warning = '#D97706';
        const danger = '#DC2626';
        const info = '#2563EB';
        const neutral = '#9CA3AF';

        // 1. Loan Distribution (Doughnut)
        const loanCtx = document.getElementById('chart-loan-dist');
        if (loanCtx) {
            _charts.loan = new Chart(loanCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Long Loans (LL)', 'Short Loans (SL)', 'NPA'],
                    datasets: [{
                        data: [data.loan_ll_count||890, data.loan_sl_count||357, data.npa_count||23],
                        backgroundColor: [primary, info, danger],
                        borderWidth: 0,
                        hoverOffset: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { family: 'Inter', size: 12 } } }
                    },
                    cutout: '65%'
                }
            });
        }

        // 2. Recovery Trend (Line)
        const recCtx = document.getElementById('chart-recovery');
        if (recCtx) {
            const months = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
            const trendData = data.recovery_trend || [28,32,35,31,34,33,30,36,34,32,35,38].map(v=>v*100000);
            _charts.recovery = new Chart(recCtx, {
                type: 'line',
                data: {
                    labels: months,
                    datasets: [{
                        label: 'Recovery (₹ Lakhs)',
                        data: trendData.map(v => Math.round(v/100000)),
                        borderColor: success,
                        backgroundColor: 'rgba(5,150,105,0.08)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: success,
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { family: 'Inter', size: 11 } } },
                        x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 } } }
                    }
                }
            });
        }

        // 3. Member Composition (Bar)
        const memCtx = document.getElementById('chart-members');
        if (memCtx) {
            _charts.members = new Chart(memCtx, {
                type: 'bar',
                data: {
                    labels: ['Active', 'Retired', 'Settled', 'Other'],
                    datasets: [{
                        label: 'Members',
                        data: [data.member_active||4200, data.member_retired||423, data.member_settled||200, (data.total_members||4823)-(data.member_active||4200)-(data.member_retired||423)-(data.member_settled||200)],
                        backgroundColor: [success, info, neutral, warning],
                        borderRadius: 6,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { family: 'Inter', size: 11 } } },
                        x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 } } }
                    }
                }
            });
        }
    }

    return { render, init };
})();
