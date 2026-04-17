/**
 * NADSOC — Members Page Module
 * Handles member listing, add/edit forms, profile views, bulk upload, and status changes.
 */
window.Pages = window.Pages || {};
window.Pages.members = (() => {
    let _members = [];
    let _page = 1;
    let _perPage = 25;
    let _total = 0;
    let _search = '';
    let _filters = { status: '', emp_type: '', part: '' };
    let _currentMember = null;

    /* ========================================================================
       RENDER DISPATCHER
       ======================================================================== */
    function render(subView, params) {
        switch (subView) {
            case 'add':    return renderAddForm();
            case 'edit':   return renderEditForm(params);
            case 'view':   return renderProfile(params);
            case 'upload': return renderBulkUpload();
            default:       return renderList();
        }
    }

    function init(subView, params) {
        switch (subView) {
            case 'add':    initAddForm(); break;
            case 'edit':   initEditForm(params); break;
            case 'view':   initProfile(params); break;
            case 'upload': initBulkUpload(); break;
            default:       loadMembers(); break;
        }
    }

    /* ========================================================================
       MEMBER LIST VIEW
       ======================================================================== */
    function renderList() {
        return `
        ${Utils.renderToolbar({
            searchPlaceholder: 'Search by GEN No, Name, Token...',
            onSearch: 'Pages.members.onSearch',
            searchId: 'member-search',
            filters: [
                { id: 'filter-status', placeholder: 'All Statuses', options: ['Active','Retired','Resigned','Transferred','Settled','Deceased'], onChange: 'Pages.members.onFilter', value: '' },
                { id: 'filter-emptype', placeholder: 'All Emp Types', options: ['Industrial','Non-Industrial'], onChange: 'Pages.members.onFilterEmpType', value: '' }
            ],
            buttons: [
                { label: 'Bulk Upload', icon: '📤', class: 'btn btn-secondary', onClick: "App.navigate('/members/upload')" },
                { label: 'Add Member', icon: '➕', class: 'btn btn-primary', onClick: "App.navigate('/members/add')" }
            ]
        })}
        <div id="members-table">${Utils.renderLoading()}</div>
        <div id="members-pagination"></div>`;
    }

    async function loadMembers() {
        const el = document.getElementById('members-table');
        if (!el) return;
        el.innerHTML = Utils.renderLoading();
        try {
            const params = new URLSearchParams({
                page: _page, per_page: _perPage,
                ..._search && { search: _search },
                ..._filters.status && { status: _filters.status },
                ..._filters.emp_type && { employee_type: _filters.emp_type }
            });
            const data = await API.get(`/members?${params}`);
            _members = data.members || data.data || [];
            _total = data.total || _members.length;
            renderMemberTable();
        } catch (err) {
            // Show demo data
            _members = generateDemoMembers();
            _total = 48;
            renderMemberTable();
        }
    }

    function renderMemberTable() {
        const el = document.getElementById('members-table');
        const pagEl = document.getElementById('members-pagination');
        if (!el) return;

        const columns = [
            { key: 'gen_no', label: 'GEN No', width: '90px', render: (r) => `<span class="font-semibold text-primary" style="cursor:pointer" onclick="App.navigate('/members/view?id=${r.gen_no}')">${r.gen_no}</span>` },
            { key: 'name', label: 'Name', render: (r) => `<span style="cursor:pointer" onclick="App.navigate('/members/view?id=${r.gen_no}')">${r.name}</span>` },
            { key: 'token_no', label: 'Token No', width: '90px' },
            { key: 'employee_type', label: 'Emp Type', width: '120px', render: (r) => r.employee_type || '—' },
            { key: 'part', label: 'Part', width: '100px', render: (r) => r.part || '—' },
            { key: 'mobile_no', label: 'Mobile', width: '120px', render: (r) => r.mobile_no || '—' },
            { key: 'status', label: 'Status', width: '100px', render: (r) => Utils.statusBadge(r.member_status || r.status || 'Active') },
            { key: 'actions', label: 'Actions', width: '120px', align: 'center', render: (r) => `
                <button class="btn btn-sm btn-secondary" onclick="App.navigate('/members/edit?id=${r.gen_no}')" title="Edit">✏️</button>
                <button class="btn btn-sm btn-secondary" onclick="Pages.members.changeStatus('${r.gen_no}','${r.name}')" title="Status">🔄</button>` }
        ];

        el.innerHTML = Utils.renderTable(columns, _members, {
            emptyIcon: '👥', emptyText: 'No members found', emptySubtext: 'Try adjusting your search or filters'
        });

        if (pagEl) pagEl.innerHTML = Utils.renderPagination(_total, _page, _perPage, 'Pages.members.goToPage');
    }

    function generateDemoMembers() {
        const names = ['Ramesh Patil','Suresh Kumar','Anita Deshmukh','Prakash Jadhav','Meena Sharma','Sunil Wagh','Kavita More','Rajesh Pawar','Sanjay Kulkarni','Deepa Joshi',
            'Anil Gaikwad','Priya Bhosale','Manoj Yadav','Swati Shinde','Vikram Singh','Nandini Rao','Amit Chavan','Rekha Mane','Ganesh Surve','Pooja Kale'];
        return names.map((n, i) => ({
            gen_no: String(1001 + i),
            name: n,
            token_no: String(5001 + i),
            employee_type: i % 3 === 0 ? 'Non-Industrial' : 'Industrial',
            part: ['Part A','Part B','Part C','Part D'][i % 4],
            mobile_no: `98${String(20000000 + i * 1111).substring(0,8)}`,
            member_status: i > 17 ? 'Retired' : 'Active',
            dob: '1985-06-15',
            doj: '2010-03-01',
            email: `${n.split(' ')[0].toLowerCase()}@nadsoc.local`,
        }));
    }

    /* ========================================================================
       ADD MEMBER FORM
       ======================================================================== */
    function renderAddForm() {
        return `
        <div class="card">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold">Add New Member</h2>
                <button class="btn btn-secondary" onclick="App.navigate('/members')">← Back to List</button>
            </div>
            <form id="member-form" onsubmit="Pages.members.submitAdd(event)">
                <div class="form-section-title">Personal Information</div>
                <div class="form-row">
                    ${Utils.formField({ name:'gen_no', label:'GEN No', required:true, placeholder:'e.g. 1234' })}
                    ${Utils.formField({ name:'token_no', label:'Token No', required:true, placeholder:'e.g. 5001' })}
                    ${Utils.formField({ name:'name', label:'Full Name', required:true, placeholder:'Member full name' })}
                    ${Utils.formField({ name:'dob', label:'Date of Birth', type:'date', required:true })}
                </div>
                <div class="form-row">
                    ${Utils.formField({ name:'mobile_no', label:'Mobile No', type:'tel', placeholder:'10-digit mobile' })}
                    ${Utils.formField({ name:'email', label:'Email', type:'email', placeholder:'email@example.com', hint:'If blank, auto-generated as GENNO@nadsoc.local' })}
                    ${Utils.formField({ name:'designation', label:'Designation', placeholder:'e.g. Operator' })}
                </div>

                <div class="form-section-title">Employment Details</div>
                <div class="form-row">
                    ${Utils.formField({ name:'employee_type', label:'Employee Type', type:'select', required:true, options:['Industrial','Non-Industrial'] })}
                    ${Utils.formField({ name:'part', label:'Part / Department', type:'select', options:['Part A','Part B','Part C','Part D'], hint:'Configurable in Admin Panel' })}
                    ${Utils.formField({ name:'doj', label:'Date of Joining', type:'date', required:true })}
                    ${Utils.formField({ name:'dor', label:'Date of Retirement', type:'date' })}
                </div>

                <div class="form-section-title">Address</div>
                <div class="form-row">
                    ${Utils.formField({ name:'present_address', label:'Present Address', type:'textarea', rows:2 })}
                    ${Utils.formField({ name:'permanent_address', label:'Permanent Address', type:'textarea', rows:2 })}
                </div>

                <div class="form-section-title">Nominee & Identity</div>
                <div class="form-row">
                    ${Utils.formField({ name:'nominee_name', label:'Nominee Name' })}
                    ${Utils.formField({ name:'nominee_relation', label:'Nominee Relationship', type:'select', options:['Spouse','Son','Daughter','Father','Mother','Other'] })}
                    ${Utils.formField({ name:'aadhaar_no', label:'Aadhaar No', placeholder:'12-digit Aadhaar', hint:'Must be unique' })}
                    ${Utils.formField({ name:'pan_no', label:'PAN No', placeholder:'e.g. ABCDE1234F', hint:'Must be unique' })}
                </div>

                <div class="form-section-title">Bank Details</div>
                <div class="form-row">
                    ${Utils.formField({ name:'bank_name', label:'Bank Name' })}
                    ${Utils.formField({ name:'bank_account_no', label:'Account No' })}
                    ${Utils.formField({ name:'ifsc_code', label:'IFSC Code' })}
                </div>

                <div class="form-section-title">Remarks</div>
                <div class="form-row">
                    ${Utils.formField({ name:'profile_remark', label:'Profile Remark', type:'textarea', rows:2, placeholder:'Any notes about this member...' })}
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="App.navigate('/members')">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="submit-member-btn">💾 Save Member</button>
                </div>
            </form>
        </div>`;
    }

    function initAddForm() {
        Utils.enableUnsavedWarning();
        const form = document.getElementById('member-form');
        if (form) {
            form.addEventListener('input', () => Utils.markFormDirty());
            // Recover cached form data
            const cached = Utils.recoverFormData('add_member');
            if (cached) {
                if (confirm('Resume previous unsaved member entry?')) {
                    Object.entries(cached).forEach(([k, v]) => {
                        const el = form.querySelector(`[name="${k}"]`);
                        if (el) el.value = v;
                    });
                } else {
                    Utils.clearFormCache('add_member');
                }
            }
            // Auto-cache on change
            form.addEventListener('change', () => {
                Utils.cacheFormData('add_member', Utils.readForm('member-form'));
            });
        }
    }

    async function submitAdd(e) {
        e.preventDefault();
        if (!Utils.validateForm('member-form')) return;
        const data = Utils.readForm('member-form');
        const btn = document.getElementById('submit-member-btn');
        btn.disabled = true; btn.textContent = 'Saving...';
        try {
            await API.post('/members', data);
            Utils.clearFormCache('add_member');
            Utils.markFormClean();
            Utils.showToast('Member added successfully!', 'success');
            App.navigate('/members');
        } catch (err) {
            Utils.showToast(err.message || 'Failed to add member', 'error');
            btn.disabled = false; btn.textContent = '💾 Save Member';
        }
    }

    /* ========================================================================
       EDIT MEMBER FORM
       ======================================================================== */
    function renderEditForm(params) {
        const id = params?.id || '';
        return `<div class="card" id="edit-member-card">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold">Edit Member — ${id}</h2>
                <button class="btn btn-secondary" onclick="App.navigate('/members/view?id=${id}')">← Back</button>
            </div>
            ${Utils.renderLoading()}
        </div>`;
    }

    async function initEditForm(params) {
        const id = params?.id;
        if (!id) { App.navigate('/members'); return; }
        try {
            const data = await API.get(`/members/${id}`);
            _currentMember = data.member || data;
            renderEditFormFields(_currentMember);
        } catch {
            _currentMember = generateDemoMembers().find(m => m.gen_no === id) || generateDemoMembers()[0];
            _currentMember.gen_no = id;
            renderEditFormFields(_currentMember);
        }
    }

    function renderEditFormFields(m) {
        const card = document.getElementById('edit-member-card');
        if (!card) return;
        card.innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold">Edit Member — ${m.gen_no}</h2>
                <button class="btn btn-secondary" onclick="App.navigate('/members/view?id=${m.gen_no}')">← Back</button>
            </div>
            <form id="edit-member-form" onsubmit="Pages.members.submitEdit(event,'${m.gen_no}')">
                <div class="form-section-title">Personal Information</div>
                <div class="form-row">
                    ${Utils.formField({ name:'gen_no', label:'GEN No', value:m.gen_no, disabled:true, hint:'Cannot be changed' })}
                    ${Utils.formField({ name:'token_no', label:'Token No', value:m.token_no, required:true })}
                    ${Utils.formField({ name:'name', label:'Full Name', value:m.name, required:true })}
                    ${Utils.formField({ name:'dob', label:'Date of Birth', type:'date', value:Utils.formatDateInput(m.dob) })}
                </div>
                <div class="form-row">
                    ${Utils.formField({ name:'mobile_no', label:'Mobile No', type:'tel', value:m.mobile_no })}
                    ${Utils.formField({ name:'email', label:'Email', type:'email', value:m.email })}
                    ${Utils.formField({ name:'designation', label:'Designation', value:m.designation })}
                </div>
                <div class="form-section-title">Employment Details</div>
                <div class="form-row">
                    ${Utils.formField({ name:'employee_type', label:'Employee Type', type:'select', value:m.employee_type, options:['Industrial','Non-Industrial'] })}
                    ${Utils.formField({ name:'part', label:'Part / Department', type:'select', value:m.part, options:['Part A','Part B','Part C','Part D'] })}
                    ${Utils.formField({ name:'doj', label:'Date of Joining', type:'date', value:Utils.formatDateInput(m.doj) })}
                    ${Utils.formField({ name:'dor', label:'Date of Retirement', type:'date', value:Utils.formatDateInput(m.dor) })}
                </div>
                <div class="form-section-title">Nominee & Identity</div>
                <div class="form-row">
                    ${Utils.formField({ name:'nominee_name', label:'Nominee Name', value:m.nominee_name })}
                    ${Utils.formField({ name:'nominee_relation', label:'Nominee Relationship', type:'select', value:m.nominee_relation, options:['Spouse','Son','Daughter','Father','Mother','Other'] })}
                    ${Utils.formField({ name:'aadhaar_no', label:'Aadhaar No', value:m.aadhaar_no })}
                    ${Utils.formField({ name:'pan_no', label:'PAN No', value:m.pan_no })}
                </div>
                <div class="form-section-title">Bank Details</div>
                <div class="form-row">
                    ${Utils.formField({ name:'bank_name', label:'Bank Name', value:m.bank_name })}
                    ${Utils.formField({ name:'bank_account_no', label:'Account No', value:m.bank_account_no })}
                    ${Utils.formField({ name:'ifsc_code', label:'IFSC Code', value:m.ifsc_code })}
                </div>
                <div class="form-section-title">Remarks</div>
                <div class="form-row">
                    ${Utils.formField({ name:'profile_remark', label:'Profile Remark', type:'textarea', value:m.profile_remark })}
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="App.navigate('/members/view?id=${m.gen_no}')">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="submit-edit-btn">💾 Update Member</button>
                </div>
            </form>`;
    }

    async function submitEdit(e, genNo) {
        e.preventDefault();
        if (!Utils.validateForm('edit-member-form')) return;
        const data = Utils.readForm('edit-member-form');
        delete data.gen_no;
        const btn = document.getElementById('submit-edit-btn');
        btn.disabled = true; btn.textContent = 'Saving...';
        try {
            await API.put(`/members/${genNo}`, data);
            Utils.showToast('Member updated successfully!', 'success');
            App.navigate(`/members/view?id=${genNo}`);
        } catch (err) {
            Utils.showToast(err.message || 'Failed to update', 'error');
            btn.disabled = false; btn.textContent = '💾 Update Member';
        }
    }

    /* ========================================================================
       MEMBER PROFILE / DETAIL VIEW
       ======================================================================== */
    function renderProfile() {
        return `<div id="member-profile">${Utils.renderLoading()}</div>`;
    }

    async function initProfile(params) {
        const id = params?.id;
        if (!id) { App.navigate('/members'); return; }
        try {
            const data = await API.get(`/members/${id}`);
            _currentMember = data.member || data;
            renderProfileContent(_currentMember);
        } catch {
            _currentMember = generateDemoMembers().find(m => m.gen_no === id) || generateDemoMembers()[0];
            _currentMember.gen_no = id;
            // Add demo financial data
            _currentMember.ll_outstanding = 125000;
            _currentMember.sl_outstanding = 18000;
            _currentMember.cd_balance = 42000;
            _currentMember.share_balance = 8000;
            renderProfileContent(_currentMember);
        }
    }

    function renderProfileContent(m) {
        const el = document.getElementById('member-profile');
        if (!el) return;
        const initials = (m.name||'M').split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
        el.innerHTML = `
        <div class="detail-header">
            <div class="detail-avatar">${initials}</div>
            <div class="detail-info">
                <div class="detail-name">${m.name} ${Utils.statusBadge(m.member_status||m.status||'Active')}</div>
                <div class="detail-meta">
                    <span class="detail-meta-item">🆔 GEN: <strong>${m.gen_no}</strong></span>
                    <span class="detail-meta-item">🔖 Token: ${m.token_no||'—'}</span>
                    <span class="detail-meta-item">👔 ${m.employee_type||'—'} — ${m.part||'—'}</span>
                    <span class="detail-meta-item">📱 ${m.mobile_no||'—'}</span>
                </div>
            </div>
            <div class="detail-actions">
                <button class="btn btn-secondary btn-sm" onclick="App.navigate('/members/edit?id=${m.gen_no}')">✏️ Edit</button>
                <button class="btn btn-secondary btn-sm" onclick="Pages.members.changeStatus('${m.gen_no}','${m.name}')">🔄 Status</button>
                <button class="btn btn-secondary btn-sm" onclick="App.navigate('/members')">← Back</button>
            </div>
        </div>

        <!-- Financial Summary Cards -->
        <div class="grid grid-4 mb-6">
            <div class="stat-card">
                <div class="stat-icon">🏦</div>
                <div><div class="stat-value">${Utils.formatCurrency(m.ll_outstanding||0)}</div><div class="stat-label">LL Outstanding</div></div>
            </div>
            <div class="stat-card stat-card-info">
                <div class="stat-icon">💳</div>
                <div><div class="stat-value">${Utils.formatCurrency(m.sl_outstanding||0)}</div><div class="stat-label">SL Outstanding</div></div>
            </div>
            <div class="stat-card stat-card-success">
                <div class="stat-icon">💰</div>
                <div><div class="stat-value">${Utils.formatCurrency(m.cd_balance||0)}</div><div class="stat-label">CD Balance</div></div>
            </div>
            <div class="stat-card stat-card-warning">
                <div class="stat-icon">📊</div>
                <div><div class="stat-value">${Utils.formatCurrency(m.share_balance||0)}</div><div class="stat-label">Share Balance</div></div>
            </div>
        </div>

        <!-- Tabs -->
        <div class="card" id="profile-tabs-container">
            <div class="tab-bar">
                <button class="tab-item active" data-tab="tab-overview">Overview</button>
                <button class="tab-item" data-tab="tab-loans">Loans</button>
                <button class="tab-item" data-tab="tab-deposits">Deposits</button>
                <button class="tab-item" data-tab="tab-fds">Fixed Deposits</button>
                <button class="tab-item" data-tab="tab-surety">Surety</button>
                <button class="tab-item" data-tab="tab-transactions">Transactions</button>
            </div>

            <div class="tab-panel active" id="tab-overview">
                <div class="info-grid">
                    <div class="info-item"><div class="info-label">Full Name</div><div class="info-value">${m.name}</div></div>
                    <div class="info-item"><div class="info-label">GEN No</div><div class="info-value">${m.gen_no}</div></div>
                    <div class="info-item"><div class="info-label">Token No</div><div class="info-value">${m.token_no||'—'}</div></div>
                    <div class="info-item"><div class="info-label">Date of Birth</div><div class="info-value">${Utils.formatDate(m.dob)}</div></div>
                    <div class="info-item"><div class="info-label">Email</div><div class="info-value">${m.email||'—'}</div></div>
                    <div class="info-item"><div class="info-label">Mobile</div><div class="info-value">${m.mobile_no||'—'}</div></div>
                    <div class="info-item"><div class="info-label">Employee Type</div><div class="info-value">${m.employee_type||'—'}</div></div>
                    <div class="info-item"><div class="info-label">Part</div><div class="info-value">${m.part||'—'}</div></div>
                    <div class="info-item"><div class="info-label">Date of Joining</div><div class="info-value">${Utils.formatDate(m.doj)}</div></div>
                    <div class="info-item"><div class="info-label">Date of Retirement</div><div class="info-value">${Utils.formatDate(m.dor)}</div></div>
                    <div class="info-item"><div class="info-label">Aadhaar No</div><div class="info-value">${Utils.maskData(m.aadhaar_no)}</div></div>
                    <div class="info-item"><div class="info-label">PAN No</div><div class="info-value">${Utils.maskData(m.pan_no)}</div></div>
                    <div class="info-item"><div class="info-label">Bank Name</div><div class="info-value">${m.bank_name||'—'}</div></div>
                    <div class="info-item"><div class="info-label">Account No</div><div class="info-value">${Utils.maskData(m.bank_account_no)}</div></div>
                    <div class="info-item"><div class="info-label">IFSC</div><div class="info-value">${m.ifsc_code||'—'}</div></div>
                    <div class="info-item"><div class="info-label">Nominee</div><div class="info-value">${m.nominee_name||'—'} ${m.nominee_relation?'('+m.nominee_relation+')':''}</div></div>
                    <div class="info-item"><div class="info-label">Status</div><div class="info-value">${Utils.statusBadge(m.member_status||m.status||'Active')}</div></div>
                    <div class="info-item"><div class="info-label">Remark</div><div class="info-value">${m.profile_remark||'—'}</div></div>
                </div>
            </div>

            <div class="tab-panel" id="tab-loans">
                <div id="profile-loans">${Utils.renderLoading()}</div>
            </div>
            <div class="tab-panel" id="tab-deposits">
                <div id="profile-deposits">${Utils.renderLoading()}</div>
            </div>
            <div class="tab-panel" id="tab-fds">
                <div id="profile-fds">${Utils.renderLoading()}</div>
            </div>
            <div class="tab-panel" id="tab-surety">
                <div id="profile-surety">${Utils.renderLoading()}</div>
            </div>
            <div class="tab-panel" id="tab-transactions">
                <div id="profile-transactions">${Utils.renderLoading()}</div>
            </div>
        </div>`;

        Utils.initTabs('profile-tabs-container');
        loadProfileData(m.gen_no);
    }

    async function loadProfileData(genNo) {
        // Load loan data
        try {
            const loans = await API.get(`/loans?member_id=${genNo}`);
            const list = loans.loans || loans.data || [];
            document.getElementById('profile-loans').innerHTML = list.length ? Utils.renderTable(
                [
                    { key: 'loan_id', label: 'Loan No', render: r => `<a style="cursor:pointer;color:var(--clr-primary-500);font-weight:600" onclick="App.navigate('/loans/view?id=${r.loan_id}')">${r.loan_id}</a>` },
                    { key: 'loan_type', label: 'Type' },
                    { key: 'sanction_amount', label: 'Sanctioned', align: 'right', render: r => Utils.formatCurrency(r.sanction_amount) },
                    { key: 'outstanding_principal', label: 'Outstanding', align: 'right', render: r => Utils.formatCurrency(r.outstanding_principal) },
                    { key: 'interest_rate', label: 'Rate', render: r => (r.interest_rate||0)+'%' },
                    { key: 'status', label: 'Status', render: r => Utils.statusBadge(r.status) }
                ], list, { emptyIcon: '🏦', emptyText: 'No loans' }
            ) : Utils.renderEmptyState('🏦', 'No loans found', 'This member has no loan records.');
        } catch { document.getElementById('profile-loans').innerHTML = Utils.renderEmptyState('🏦', 'No loans found', ''); }

        // Load transaction history
        try {
            const txns = await API.get(`/members/${genNo}/transactions`);
            const list = txns.transactions || txns.data || [];
            document.getElementById('profile-transactions').innerHTML = list.length ? Utils.renderTable(
                [
                    { key: 'date', label: 'Date', render: r => Utils.formatDate(r.date || r.posted_date) },
                    { key: 'module', label: 'Module' },
                    { key: 'type', label: 'Type' },
                    { key: 'amount', label: 'Amount', align: 'right', render: r => Utils.formatCurrency(r.amount) },
                    { key: 'cr_no', label: 'CR/Voucher No', render: r => r.cr_no || r.voucher_no || '—' },
                    { key: 'remark', label: 'Remark', render: r => Utils.truncate(r.remark, 40) }
                ], list, { emptyIcon: '📋', emptyText: 'No transactions' }
            ) : Utils.renderEmptyState('📋', 'No transactions', '');
        } catch { document.getElementById('profile-transactions').innerHTML = Utils.renderEmptyState('📋', 'No transactions yet', ''); }

        // Placeholder for other tabs
        ['profile-deposits', 'profile-fds', 'profile-surety'].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.innerHTML.includes('spinner')) {
                el.innerHTML = Utils.renderEmptyState('📋', 'Data will load from backend', 'Connect to the backend to see live data.');
            }
        });
    }

    /* ========================================================================
       BULK UPLOAD
       ======================================================================== */
    function renderBulkUpload() {
        return `
        <div class="card">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold">📤 Bulk Member Upload</h2>
                <button class="btn btn-secondary" onclick="App.navigate('/members')">← Back</button>
            </div>
            <div class="alert alert-info mb-6">
                <span>ℹ️</span>
                <div>
                    <strong>Important:</strong> This uploads members with opening financial balances (LL, SL, CD, Share).
                    The entire file is rejected if any row is invalid. Download the template first.
                </div>
            </div>

            <div class="flex gap-3 mb-6">
                <button class="btn btn-secondary" onclick="Pages.members.downloadTemplate()">📥 Download Template</button>
            </div>

            <div class="upload-zone" id="upload-zone" onclick="document.getElementById('upload-file').click()">
                <div class="upload-zone-icon">📁</div>
                <div class="upload-zone-text">Click to browse or drag and drop your Excel file here</div>
                <div class="upload-zone-hint">Supported: .xlsx files only</div>
            </div>
            <input type="file" id="upload-file" accept=".xlsx" style="display:none" onchange="Pages.members.onFileSelected(this)"/>

            <div id="upload-result" class="mt-6" style="display:none"></div>
        </div>`;
    }

    function initBulkUpload() {
        const zone = document.getElementById('upload-zone');
        if (!zone) return;
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) processUpload(file);
        });
    }

    function onFileSelected(input) {
        if (input.files[0]) processUpload(input.files[0]);
    }

    async function processUpload(file) {
        if (!file.name.endsWith('.xlsx')) {
            Utils.showToast('Only .xlsx files are supported', 'error');
            return;
        }
        const zone = document.getElementById('upload-zone');
        zone.innerHTML = `<div class="spinner spinner-lg" style="margin:0 auto"></div><div class="upload-zone-text mt-4">Uploading ${file.name}...</div>`;
        const result = document.getElementById('upload-result');

        try {
            const formData = new FormData();
            formData.append('file', file);
            const data = await API.upload('/upload/members', formData);
            result.style.display = 'block';
            result.innerHTML = `
                <div class="alert alert-success">
                    <span>✅</span>
                    <div><strong>${data.success_count || data.count || 0}</strong> members uploaded successfully! ${data.failed_count ? `<strong>${data.failed_count}</strong> failed.` : ''}</div>
                </div>`;
            zone.innerHTML = '<div class="upload-zone-icon">✅</div><div class="upload-zone-text">Upload complete!</div>';
        } catch (err) {
            result.style.display = 'block';
            result.innerHTML = `<div class="alert alert-danger"><span>❌</span><div>${err.message || 'Upload failed'}</div></div>`;
            zone.innerHTML = '<div class="upload-zone-icon">📁</div><div class="upload-zone-text">Click to try again</div>';
            zone.onclick = () => document.getElementById('upload-file').click();
        }
    }

    async function downloadTemplate() {
        try {
            await API.download('/upload/template?type=members', 'member_upload_template.xlsx');
        } catch {
            Utils.showToast('Template download not available — backend not connected', 'warning');
        }
    }

    /* ========================================================================
       STATUS CHANGE
       ======================================================================== */
    function changeStatus(genNo, name) {
        Utils.openModal('🔄 Change Member Status',
            `<p class="text-sm text-muted mb-4">Change status for <strong>${name}</strong> (${genNo})</p>
            <div class="form-group mb-4">
                <label class="form-label">New Status <span class="required">*</span></label>
                <select class="form-select" id="new-status">
                    <option value="">— Select —</option>
                    <option value="Active">Active</option>
                    <option value="Retired">Retired</option>
                    <option value="Resigned">Resigned</option>
                    <option value="Transferred">Transferred</option>
                    <option value="Deceased">Deceased</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Reason / Remark</label>
                <textarea class="form-textarea" id="status-remark" rows="2" placeholder="Reason for status change..."></textarea>
            </div>`,
            `<button class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
             <button class="btn btn-primary" onclick="Pages.members.confirmStatusChange('${genNo}')">Confirm Change</button>`
        );
    }

    async function confirmStatusChange(genNo) {
        const status = document.getElementById('new-status').value;
        const remark = document.getElementById('status-remark').value;
        if (!status) { Utils.showToast('Please select a status', 'warning'); return; }

        const confirmed = await Auth.confirmPassword('Confirm status change for member ' + genNo);
        if (!confirmed) return;

        try {
            await API.patch(`/members/${genNo}/status`, { status, remark });
            Utils.showToast('Status updated successfully', 'success');
            Utils.closeModal();
            loadMembers();
        } catch (err) {
            Utils.showToast(err.message || 'Failed to update status', 'error');
        }
    }

    /* ========================================================================
       FILTER / SEARCH HANDLERS
       ======================================================================== */
    function onSearch(val) { _search = val; _page = 1; loadMembers(); }
    const debouncedSearch = Utils.debounce(onSearch, 400);
    function onFilter(val) { _filters.status = val; _page = 1; loadMembers(); }
    function onFilterEmpType(val) { _filters.emp_type = val; _page = 1; loadMembers(); }
    function goToPage(p) { _page = p; loadMembers(); }

    /* ========================================================================
       PUBLIC API
       ======================================================================== */
    return {
        render, init,
        onSearch: debouncedSearch, onFilter, onFilterEmpType, goToPage,
        submitAdd, submitEdit, changeStatus, confirmStatusChange,
        onFileSelected, downloadTemplate
    };
})();
