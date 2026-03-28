/**
 * NADSOC — Shared Utilities
 */
const Utils = (() => {
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

    function statusBadge(status) {
        const map = { 'Active':'badge-success','Closed':'badge-neutral','NPA':'badge-danger','Settled':'badge-neutral',
            'Retired':'badge-info','POSTED':'badge-success','CANCELLED':'badge-danger','Draft':'badge-info',
            'Pending':'badge-warning','Approved':'badge-success','Paid':'badge-success','Unpaid':'badge-danger',
            'Partial':'badge-warning','active':'badge-success','disabled':'badge-danger' };
        return `<span class="badge ${map[status]||'badge-neutral'}">${status}</span>`;
    }
    function maskData(text, showLast=4) {
        if (!text || text.length<=showLast) return text||'';
        return '●'.repeat(text.length-showLast)+text.slice(-showLast);
    }
    function truncate(text, max=30) { return !text||text.length<=max ? text||'' : text.substring(0,max)+'...'; }

    return { formatDate, formatDateInput, getCurrentMonthYear, getFinancialYear, formatCurrency, formatNumber,
        showToast, cacheFormData, recoverFormData, clearFormCache, enableUnsavedWarning, markFormDirty, markFormClean,
        debounce, statusBadge, maskData, truncate };
})();
