/**
 * NADSOC — Shared Utilities & Reusable UI Components
 */
const Utils = (() => {
    /* ========================================================================
       FORMATTING
       ======================================================================== */
    function formatDate(dateStr) {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    function formatDateInput(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toISOString().split('T')[0];
    }
    function getCurrentMonthYear() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    function getFinancialYear(date) {
        const d = date ? new Date(date) : new Date();
        const m = d.getMonth(), y = d.getFullYear();
        return m >= 3 ? `${y}-${(y+1)%100}` : `${y-1}-${y%100}`;
    }
    function formatCurrency(amt) {
        if (amt == null) return '₹0';
        return '₹' + Number(amt).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
    function formatNumber(n) { return n == null ? '0' : Number(n).toLocaleString('en-IN'); }

    /* ========================================================================
       TOAST NOTIFICATIONS
       ======================================================================== */
    let toastContainer = null;
    function showToast(message, type = 'info', duration = 4000) {
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span style="flex:1">${message}</span>
            <button onclick="this.parentElement.remove()" style="background:none;border:none;font-size:16px;cursor:pointer;color:var(--clr-neutral-400);">✕</button>`;
        toastContainer.appendChild(toast);
        setTimeout(() => { toast.style.opacity='0'; setTimeout(()=>toast.remove(),300); }, duration);
    }

    /* ========================================================================
       FORM CACHE / RECOVERY
       ======================================================================== */
    function cacheFormData(formId, data) {
        localStorage.setItem(`nadsoc_form_${formId}`, JSON.stringify({ data, timestamp: Date.now() }));
    }
    function recoverFormData(formId) {
        const c = localStorage.getItem(`nadsoc_form_${formId}`);
        if (c) { try { const { data, timestamp } = JSON.parse(c); if (Date.now()-timestamp < 86400000) return data; } catch {} localStorage.removeItem(`nadsoc_form_${formId}`); }
        return null;
    }
    function clearFormCache(formId) { localStorage.removeItem(`nadsoc_form_${formId}`); }
    function enableUnsavedWarning() {
        window._formDirty = false;
        window.addEventListener('beforeunload', e => { if (window._formDirty) { e.preventDefault(); e.returnValue=''; } });
    }
    function markFormDirty() { window._formDirty = true; }
    function markFormClean() { window._formDirty = false; }
    function debounce(func, wait=300) { let t; return function(...a) { clearTimeout(t); t=setTimeout(()=>func.apply(this,a),wait); }; }

    /* ========================================================================
       STATUS BADGES & TEXT HELPERS
       ======================================================================== */
    function statusBadge(status) {
        const map = { 'Active':'badge-success','Closed':'badge-neutral','NPA':'badge-danger','Settled':'badge-neutral',
            'Retired':'badge-info','POSTED':'badge-success','CANCELLED':'badge-danger','Draft':'badge-info',
            'Pending':'badge-warning','Approved':'badge-success','Paid':'badge-success','Unpaid':'badge-danger',
            'Partial':'badge-warning','active':'badge-success','disabled':'badge-danger',
            'Top-up Closed':'badge-neutral','ACTIVE':'badge-success','CLOSED':'badge-neutral' };
        return `<span class="badge ${map[status]||'badge-neutral'}">${status}</span>`;
    }
    function maskData(text, showLast=4) {
        if (!text || text.length<=showLast) return text||'';
        return '●'.repeat(text.length-showLast)+text.slice(-showLast);
    }
    function truncate(text, max=30) { return !text||text.length<=max ? text||'' : text.substring(0,max)+'...'; }

    /* ========================================================================
       REUSABLE TABLE BUILDER
       ======================================================================== */
    /**
     * Render a data table.
     * @param {Array<{key:string, label:string, render?:function, align?:string, width?:string}>} columns
     * @param {Array<Object>} rows
     * @param {Object} options - { id?, emptyText?, onRowClick?, className? }
     */
    function renderTable(columns, rows, options = {}) {
        if (!rows || rows.length === 0) {
            return renderEmptyState(options.emptyIcon || '📋', options.emptyText || 'No records found', options.emptySubtext || '');
        }
        const id = options.id ? ` id="${options.id}"` : '';
        const cls = options.className || '';
        let html = `<div class="table-container"><table class="data-table ${cls}"${id}>`;
        html += '<thead><tr>';
        columns.forEach(col => {
            const style = col.width ? ` style="width:${col.width}"` : '';
            html += `<th${style}>${col.label}</th>`;
        });
        html += '</tr></thead><tbody>';
        rows.forEach((row, idx) => {
            const click = options.onRowClick ? ` onclick="${options.onRowClick}(${idx})" style="cursor:pointer"` : '';
            html += `<tr${click}>`;
            columns.forEach(col => {
                const val = col.render ? col.render(row, idx) : (row[col.key] ?? '—');
                const align = col.align === 'right' ? ' style="text-align:right"' : col.align === 'center' ? ' style="text-align:center"' : '';
                html += `<td${align}>${val}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        return html;
    }

    /* ========================================================================
       PAGINATION
       ======================================================================== */
    /**
     * Render pagination controls.
     * @param {number} total - total items
     * @param {number} page - current page (1-based)
     * @param {number} perPage - items per page
     * @param {string} onChangeFn - global function name to call, receives page number
     */
    function renderPagination(total, page, perPage, onChangeFn) {
        const totalPages = Math.ceil(total / perPage);
        if (totalPages <= 1) return '';
        let html = '<div class="flex items-center justify-between mt-4"><div class="text-sm text-muted">';
        const start = (page-1)*perPage+1;
        const end = Math.min(page*perPage, total);
        html += `Showing ${start}–${end} of ${formatNumber(total)}</div><div class="pagination">`;
        html += `<button class="pagination-btn" ${page<=1?'disabled':''} onclick="${onChangeFn}(${page-1})">‹</button>`;
        // Show max 7 page buttons
        const maxBtns = 7;
        let startPage = Math.max(1, page - Math.floor(maxBtns/2));
        let endPage = Math.min(totalPages, startPage + maxBtns - 1);
        if (endPage - startPage < maxBtns - 1) startPage = Math.max(1, endPage - maxBtns + 1);
        if (startPage > 1) { html += `<button class="pagination-btn" onclick="${onChangeFn}(1)">1</button>`; if (startPage > 2) html += '<span class="text-muted px-1">…</span>'; }
        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="pagination-btn ${i===page?'active':''}" onclick="${onChangeFn}(${i})">${i}</button>`;
        }
        if (endPage < totalPages) { if (endPage < totalPages-1) html += '<span class="text-muted px-1">…</span>'; html += `<button class="pagination-btn" onclick="${onChangeFn}(${totalPages})">${totalPages}</button>`; }
        html += `<button class="pagination-btn" ${page>=totalPages?'disabled':''} onclick="${onChangeFn}(${page+1})">›</button>`;
        html += '</div></div>';
        return html;
    }

    /* ========================================================================
       EMPTY STATE
       ======================================================================== */
    function renderEmptyState(icon, title, subtitle) {
        return `<div class="empty-state fade-in">
            <div class="empty-state-icon">${icon}</div>
            <div class="empty-state-title">${title}</div>
            ${subtitle ? `<div class="empty-state-subtitle">${subtitle}</div>` : ''}
        </div>`;
    }

    /* ========================================================================
       LOADING STATE
       ======================================================================== */
    function renderLoading() {
        return '<div class="flex justify-center items-center" style="height:200px"><div class="spinner spinner-lg"></div></div>';
    }

    function renderSkeletonRows(count = 5) {
        let html = '';
        for (let i = 0; i < count; i++) {
            html += `<div class="card mb-4" style="padding:var(--sp-4)">
                <div class="skeleton" style="height:16px;width:${60+Math.random()*30}%;margin-bottom:8px"></div>
                <div class="skeleton" style="height:12px;width:${40+Math.random()*40}%"></div>
            </div>`;
        }
        return html;
    }

    /* ========================================================================
       MODAL SYSTEM
       ======================================================================== */
    function openModal(title, bodyHtml, footerHtml, options = {}) {
        closeModal();
        const maxWidth = options.maxWidth || '500px';
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'nadsoc-modal-overlay';
        overlay.innerHTML = `
            <div class="modal" style="max-width:${maxWidth}">
                <div class="modal-header">
                    <h3 style="font-size:var(--fs-lg);font-weight:700;">${title}</h3>
                    <button class="btn-icon" onclick="Utils.closeModal()" style="font-size:18px;background:none;border:none;cursor:pointer">✕</button>
                </div>
                <div class="modal-body">${bodyHtml}</div>
                ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('active'));
        // Close on backdrop click
        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    }

    function closeModal() {
        const overlay = document.getElementById('nadsoc-modal-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        }
    }

    /* ========================================================================
       TAB HELPERS
       ======================================================================== */
    function initTabs(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const tabs = container.querySelectorAll('.tab-item');
        const panels = container.querySelectorAll('.tab-panel');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                panels.forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const panel = container.querySelector(`#${tab.dataset.tab}`);
                if (panel) panel.classList.add('active');
            });
        });
    }

    /* ========================================================================
       FORM HELPERS
       ======================================================================== */
    /**
     * Build a form field HTML string.
     * @param {Object} field - { name, label, type, value?, required?, options?, placeholder?, hint?, disabled? }
     */
    function formField(f) {
        const req = f.required ? '<span class="required">*</span>' : '';
        const id = `field-${f.name}`;
        let input;
        if (f.type === 'select') {
            const opts = (f.options||[]).map(o => {
                const val = typeof o === 'object' ? o.value : o;
                const lbl = typeof o === 'object' ? o.label : o;
                const sel = f.value == val ? ' selected' : '';
                return `<option value="${val}"${sel}>${lbl}</option>`;
            }).join('');
            input = `<select class="form-select" id="${id}" name="${f.name}" ${f.required?'required':''} ${f.disabled?'disabled':''}>
                <option value="">— Select —</option>${opts}</select>`;
        } else if (f.type === 'textarea') {
            input = `<textarea class="form-textarea" id="${id}" name="${f.name}" rows="${f.rows||3}"
                placeholder="${f.placeholder||''}" ${f.required?'required':''} ${f.disabled?'disabled':''}>${f.value||''}</textarea>`;
        } else {
            input = `<input type="${f.type||'text'}" class="form-input" id="${id}" name="${f.name}"
                value="${f.value||''}" placeholder="${f.placeholder||''}"
                ${f.required?'required':''} ${f.disabled?'disabled':''} ${f.min!=null?`min="${f.min}"`:''}
                ${f.max!=null?`max="${f.max}"`:''}  ${f.step?`step="${f.step}"`:''}/>`;
        }
        return `<div class="form-group">
            <label class="form-label" for="${id}">${f.label} ${req}</label>
            ${input}
            ${f.hint ? `<span class="form-hint">${f.hint}</span>` : ''}
            <span class="form-error" id="${id}-error"></span>
        </div>`;
    }

    /**
     * Read all form fields from a container.
     * @param {string} containerId
     * @returns {Object} name→value map
     */
    function readForm(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return {};
        const data = {};
        container.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.name) {
                if (el.type === 'checkbox') data[el.name] = el.checked;
                else data[el.name] = el.value;
            }
        });
        return data;
    }

    /**
     * Validate required fields in a form container.
     * @param {string} containerId
     * @returns {boolean} true if valid
     */
    function validateForm(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return false;
        let valid = true;
        container.querySelectorAll('[required]').forEach(el => {
            const errEl = document.getElementById(`${el.id}-error`);
            if (!el.value || el.value.trim() === '') {
                el.classList.add('error');
                if (errEl) errEl.textContent = 'This field is required';
                valid = false;
            } else {
                el.classList.remove('error');
                if (errEl) errEl.textContent = '';
            }
        });
        return valid;
    }

    /* ========================================================================
       TOOLBAR BUILDER
       ======================================================================== */
    function renderToolbar(options = {}) {
        let html = '<div class="toolbar">';
        if (options.search !== false) {
            const ph = options.searchPlaceholder || 'Search...';
            const fn = options.onSearch || '';
            html += `<div class="toolbar-search">
                <span class="search-icon">🔍</span>
                <input type="text" placeholder="${ph}" ${fn ? `oninput="${fn}(this.value)"` : ''} id="${options.searchId || 'toolbar-search'}"/>
            </div>`;
        }
        // Filters
        if (options.filters) {
            options.filters.forEach(f => {
                const opts = (f.options||[]).map(o => `<option value="${typeof o==='object'?o.value:o}" ${f.value===(typeof o==='object'?o.value:o)?'selected':''}>${typeof o==='object'?o.label:o}</option>`).join('');
                html += `<select class="form-select" style="width:auto;min-width:130px" id="${f.id||''}" onchange="${f.onChange||''}(this.value)">
                    <option value="">${f.placeholder||'All'}</option>${opts}</select>`;
            });
        }
        html += '<div class="toolbar-right">';
        if (options.buttons) {
            options.buttons.forEach(b => {
                html += `<button class="btn ${b.class || 'btn-primary'}" onclick="${b.onClick || ''}">${b.icon ? b.icon+' ' : ''}${b.label}</button>`;
            });
        }
        html += '</div></div>';
        return html;
    }

    return {
        // Formatting
        formatDate, formatDateInput, getCurrentMonthYear, getFinancialYear,
        formatCurrency, formatNumber,
        // Toasts
        showToast,
        // Form cache
        cacheFormData, recoverFormData, clearFormCache,
        enableUnsavedWarning, markFormDirty, markFormClean,
        // Helpers
        debounce, statusBadge, maskData, truncate,
        // Components
        renderTable, renderPagination, renderEmptyState, renderLoading, renderSkeletonRows,
        openModal, closeModal, initTabs,
        formField, readForm, validateForm, renderToolbar
    };
})();
