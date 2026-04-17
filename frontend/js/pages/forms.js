/**
 * NADSOC — Forms Register Page Module
 */
window.Pages = window.Pages || {};
window.Pages.forms = (() => {
    let _forms = [];

    function render() {
        return `
        ${Utils.renderToolbar({
            searchPlaceholder: 'Search by Form No, Member...',
            onSearch: 'Pages.forms.onSearch', searchId: 'forms-search',
            filters: [
                { id: 'filter-ftype', placeholder: 'All Form Types', options: ['LL Form','SL Form','Membership Form','FD Form','Settlement Form','Other'], onChange: 'Pages.forms.onFilterType' }
            ],
            buttons: [
                { label: 'Add Form Entry', icon: '➕', class: 'btn btn-primary', onClick: 'Pages.forms.showAdd()' }
            ]
        })}
        <div id="forms-table">${Utils.renderLoading()}</div>`;
    }

    function init() { loadForms(); }

    async function loadForms() {
        const el = document.getElementById('forms-table');
        if (!el) return;
        try {
            const data = await API.get('/forms');
            _forms = data.forms || data.data || [];
        } catch {
            _forms = [
                { form_id: 'F-25-001', form_date: '2026-01-10', member_gen_no: '1001', member_name: 'Ramesh Patil', token_no: '5001', form_type: 'LL Form', charges: 200, cr_no: 'CR-5001', posted_by: 'admin' },
                { form_id: 'F-25-002', form_date: '2026-01-15', member_gen_no: '1003', member_name: 'Anita Deshmukh', token_no: '5003', form_type: 'Membership Form', charges: 100, cr_no: 'CR-5002', posted_by: 'admin' },
                { form_id: 'F-25-003', form_date: '2026-02-05', member_gen_no: '1010', member_name: 'Deepa Joshi', token_no: '5010', form_type: 'SL Form', charges: 150, cr_no: 'CR-5003', posted_by: 'operator1' },
                { form_id: 'F-25-004', form_date: '2026-03-12', member_gen_no: '1005', member_name: 'Meena Sharma', token_no: '5005', form_type: 'FD Form', charges: 100, cr_no: 'CR-5004', posted_by: 'admin' },
            ];
        }
        el.innerHTML = Utils.renderTable([
            { key: 'form_id', label: 'Form No', render: r => `<span class="font-semibold">${r.form_id}</span>` },
            { key: 'form_date', label: 'Date', render: r => Utils.formatDate(r.form_date) },
            { key: 'member', label: 'Member', render: r => `<a style="cursor:pointer;color:var(--clr-primary-500)" onclick="App.navigate('/members/view?id=${r.member_gen_no}')">${r.member_name || r.member_gen_no}</a>` },
            { key: 'token_no', label: 'Token No' },
            { key: 'form_type', label: 'Form Type' },
            { key: 'charges', label: 'Charges', align: 'right', render: r => Utils.formatCurrency(r.charges) },
            { key: 'cr_no', label: 'CR No' },
            { key: 'posted_by', label: 'Posted By' }
        ], _forms, { emptyIcon: '📝', emptyText: 'No form entries' });
    }

    function showAdd() {
        Utils.openModal('📝 Add Form Entry', `
            <div class="form-row">
                ${Utils.formField({ name: 'frm_date', label: 'Form Date', type: 'date', required: true, value: new Date().toISOString().split('T')[0] })}
                ${Utils.formField({ name: 'frm_gen_no', label: 'Member GEN No', required: true })}
            </div>
            <div class="form-row">
                ${Utils.formField({ name: 'frm_type', label: 'Form Type', type: 'select', required: true, options: ['LL Form','SL Form','Membership Form','FD Form','Settlement Form','Other'] })}
                ${Utils.formField({ name: 'frm_charges', label: 'Charges / Fees (₹)', type: 'number', required: true, min: 0, value: '100' })}
            </div>
            ${Utils.formField({ name: 'frm_cr_no', label: 'CR No', required: true, placeholder: 'From receipt book' })}
            ${Utils.formField({ name: 'frm_remark', label: 'Remark', type: 'textarea', rows: 2 })}`,
            `<button class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
             <button class="btn btn-primary" onclick="Pages.forms.submitAdd()">💾 Save</button>`
        );
    }

    async function submitAdd() {
        try {
            await API.post('/forms', {
                form_date: document.querySelector('[name="frm_date"]')?.value,
                member_gen_no: document.querySelector('[name="frm_gen_no"]')?.value,
                form_type: document.querySelector('[name="frm_type"]')?.value,
                charges: parseFloat(document.querySelector('[name="frm_charges"]')?.value) || 0,
                cr_no: document.querySelector('[name="frm_cr_no"]')?.value,
                remark: document.querySelector('[name="frm_remark"]')?.value
            });
            Utils.showToast('Form entry added!', 'success');
            Utils.closeModal();
            loadForms();
        } catch (err) { Utils.showToast(err.message || 'Failed', 'error'); }
    }

    function onSearch() {}
    function onFilterType() {}

    return { render, init, onSearch, onFilterType, showAdd, submitAdd };
})();
