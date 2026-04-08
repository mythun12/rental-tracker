/* ══════════════════════════════════════════════════════════
   APP.JS — Data model, CRUD, rendering, event handlers
══════════════════════════════════════════════════════════ */

/* ─── State ──────────────────────────────────────────────── */
let appData          = emptyData();
let currentPage      = 'dashboard';
let detailPropertyId = null;   // property currently open in detail view
let selectedPropId   = null;   // filter selection in payments / issues

/* ══════════════════════════════════════════════════════════
   INITIALISATION
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  setupEventListeners();
  Drive.init(onSignedIn, onSignedOut);
});

async function onSignedIn(user) {
  showApp();
  updateUserUI(user);
  await syncLoad();
}

function onSignedOut() {
  showSignIn();
}

/* ══════════════════════════════════════════════════════════
   DATA SYNC
══════════════════════════════════════════════════════════ */
async function syncLoad() {
  setSyncStatus('loading');
  try {
    const data = await Drive.loadData();
    if (data) { appData = data; updateLastUpdatedUI(); }
    else       { appData = emptyData(); }
    renderCurrentPage();
    setSyncStatus('saved');
  } catch (err) {
    console.error('Load error:', err);
    setSyncStatus('error');
    showToast('Could not load data. Check your connection and tap Sync.');
  }
}

async function syncSave() {
  setSyncStatus('saving');
  try {
    appData = await Drive.saveData(appData);
    updateLastUpdatedUI();
    setSyncStatus('saved');
  } catch (err) {
    console.error('Save error:', err);
    setSyncStatus('error');
    showToast('Error saving. Please try again.');
    throw err;
  }

  // Auto-export to Google Sheet in the background (non-blocking)
  try {
    await Drive.exportToSheets(_buildSheetsData());
    showToast('Sheet export done!', 4000);
  } catch (err) {
    console.warn('Sheet export failed (data still saved):', err);
    showToast('Sheet export error: ' + err.message, 8000);
  }
}

function _buildSheetsData() {
  const properties = appData.properties || [];

  const payments = [['Property', 'Tenant', 'Due Date', 'Amount Due (Rs)', 'Amount Paid (Rs)', 'Status', 'Date Received', 'Notes']];
  const tenants  = [['Property', 'Tenant', 'Phone', 'Lease Start', 'Lease End', 'Monthly Rent (Rs)', 'Deposit (Rs)', 'Increment %/yr']];
  const issues   = [['Property', 'Date', 'Description', 'Status']];

  for (const prop of properties) {
    for (const tenancy of (prop.tenancies || [])) {
      tenants.push([
        prop.name,
        tenancy.tenantName,
        tenancy.phone || '',
        tenancy.leaseStart,
        tenancy.leaseEnd || 'Present',
        Number(tenancy.monthlyRent)  || 0,
        Number(tenancy.depositPaid)  || 0,
        tenancy.yearlyIncrementPct   || 0
      ]);
      for (const pmt of (tenancy.payments || [])) {
        payments.push([
          prop.name,
          tenancy.tenantName,
          pmt.dueDate,
          Number(pmt.amountDue)  || 0,
          Number(pmt.amountPaid) || 0,
          calcStatus(pmt),
          pmt.dateReceived || '',
          pmt.notes        || ''
        ]);
      }
    }
    for (const issue of (prop.issues || [])) {
      issues.push([prop.name, issue.date, issue.description, issue.status]);
    }
  }

  return { payments, tenants, issues };
}

/* ══════════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════════ */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtMoney(n) {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (isNaN(num)) return '—';
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function emptyData() {
  return { schemaVersion: 1, lastUpdatedBy: null, lastUpdatedAt: null, properties: [] };
}

/* ──────────────────────────────────────────────────────────
   PAYMENT STATUS — auto-calculated, never stored
────────────────────────────────────────────────────────── */
function calcStatus(pmt) {
  const now     = new Date(); now.setHours(0,0,0,0);
  const due     = new Date(pmt.dueDate + 'T12:00:00');
  const amtDue  = Number(pmt.amountDue)  || 0;
  const amtPaid = Number(pmt.amountPaid) || 0;

  if (amtPaid === 0) return due <= now ? 'Outstanding' : 'Upcoming';
  if (amtPaid < amtDue) return 'Partial';
  // Paid in full — check if on time
  if (pmt.dateReceived) {
    const rcvd = new Date(pmt.dateReceived + 'T12:00:00');
    if (rcvd > due) return 'Late';
  }
  return 'Paid';
}

function statusBadge(status) {
  const map = {
    Paid:        ['badge-paid',        '✓ Paid'],
    Late:        ['badge-late',        '⚠ Late'],
    Partial:     ['badge-partial',     '⚡ Partial'],
    Outstanding: ['badge-outstanding', '✗ Outstanding'],
    Upcoming:    ['badge-upcoming',    '◷ Upcoming'],
  };
  const [cls, label] = map[status] || ['badge-upcoming', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

/* Amount comparison CSS class */
function amountClass(pmt) {
  const now     = new Date(); now.setHours(0,0,0,0);
  const due     = new Date(pmt.dueDate + 'T12:00:00');
  const amtDue  = Number(pmt.amountDue)  || 0;
  const amtPaid = Number(pmt.amountPaid) || 0;
  if (amtPaid === 0 && due > now) return 'amount-upcoming';
  if (amtDue > 0 && amtPaid >= amtDue) return 'amount-ok';
  return 'amount-short';
}

function getActiveTenancy(prop) {
  return (prop.tenancies || []).find(t => t.leaseEnd === null) || null;
}

/* ══════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════ */
function navigateTo(page) {
  currentPage = page;
  closePropertyDetail();

  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.page === page)
  );
  document.querySelectorAll('.page').forEach(p =>
    p.classList.toggle('active', p.id === `page-${page}`)
  );

  const titles = { dashboard: 'Dashboard', properties: 'Properties', payments: 'Payments', issues: 'Issues' };
  document.getElementById('header-title').textContent = titles[page] || '';
  renderCurrentPage();
}

function renderCurrentPage() {
  switch (currentPage) {
    case 'dashboard':   renderDashboard();   break;
    case 'properties':  renderProperties();  break;
    case 'payments':    renderPayments();    break;
    case 'issues':      renderIssues();      break;
  }
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════════ */
function renderDashboard() {
  const active = (appData.properties || []).filter(p => p.active !== false);

  let overdueCount = 0, openIssues = 0, totalRent = 0;
  active.forEach(prop => {
    const t = getActiveTenancy(prop);
    if (t) {
      totalRent += Number(t.monthlyRent) || 0;
      (t.payments || []).forEach(pmt => {
        const s = calcStatus(pmt);
        if (s === 'Outstanding' || s === 'Partial') overdueCount++;
      });
    }
    openIssues += (prop.issues || []).filter(i => i.status === 'Open').length;
  });

  document.getElementById('summary-cards').innerHTML = `
    <div class="summary-card${overdueCount > 0 ? ' summary-card--alert' : ''}">
      <div class="summary-value">${overdueCount}</div>
      <div class="summary-label">Overdue</div>
    </div>
    <div class="summary-card${openIssues > 0 ? ' summary-card--warn' : ''}">
      <div class="summary-value">${openIssues}</div>
      <div class="summary-label">Open Issues</div>
    </div>
    <div class="summary-card">
      <div class="summary-value">${active.length}</div>
      <div class="summary-label">Properties</div>
    </div>
    <div class="summary-card">
      <div class="summary-value" style="font-size:1.1rem">${fmtMoney(totalRent)}</div>
      <div class="summary-label">Monthly Rent</div>
    </div>`;

  const list = document.getElementById('dashboard-list');
  if (active.length === 0) {
    list.innerHTML = '<div class="empty-state">No properties yet.<br>Go to Properties to add your first one.</div>';
    return;
  }

  list.innerHTML = active.map(prop => {
    const t = getActiveTenancy(prop);
    if (!t) return `
      <div class="prop-card" onclick="openPropertyDetail('${prop.id}')">
        <div class="prop-card-name">${esc(prop.name)}</div>
        <div class="prop-card-meta text-muted">No active tenant — tap to add</div>
      </div>`;

    // Current month payments
    const now = new Date();
    const thisMonthPmts = (t.payments || []).filter(p => {
      const d = new Date(p.dueDate + 'T12:00:00');
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    let cardCls = '';
    let statusHtml = '<span class="text-muted" style="font-size:0.8rem">No payment this month</span>';
    if (thisMonthPmts.length > 0) {
      const pmt = thisMonthPmts[thisMonthPmts.length - 1];
      const s = calcStatus(pmt);
      statusHtml = statusBadge(s);
      if      (s === 'Outstanding') cardCls = 'prop-card--overdue';
      else if (s === 'Partial')     cardCls = 'prop-card--partial';
      else if (s === 'Paid' || s === 'Late') cardCls = 'prop-card--paid';
    }

    const openIss = (prop.issues || []).filter(i => i.status === 'Open').length;

    return `
      <div class="prop-card ${cardCls}" onclick="openPropertyDetail('${prop.id}')">
        <div class="prop-card-header">
          <div>
            <div class="prop-card-name">${esc(prop.name)}</div>
            <div class="prop-card-meta">
              <span>🧑 ${esc(t.tenantName)}</span>
              <span>${fmtMoney(t.monthlyRent)}/mo</span>
            </div>
          </div>
          ${statusHtml}
        </div>
        ${openIss > 0 ? `<div class="prop-card-issues">⚠ ${openIss} open issue${openIss > 1 ? 's' : ''}</div>` : ''}
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════
   PROPERTIES LIST
══════════════════════════════════════════════════════════ */
function renderProperties() {
  const props = appData.properties || [];
  const list  = document.getElementById('properties-list');

  if (props.length === 0) {
    list.innerHTML = '<div class="empty-state">No properties yet.<br>Tap + Add Property to get started.</div>';
    return;
  }

  list.innerHTML = props.map(prop => {
    const t       = getActiveTenancy(prop);
    const inactive = prop.active === false;
    return `
      <div class="prop-card${inactive ? ' prop-card--inactive' : ''}">
        <div class="prop-card-header" onclick="openPropertyDetail('${prop.id}')">
          <div style="flex:1;min-width:0">
            <div class="prop-card-name">
              ${esc(prop.name)}
              ${inactive ? '<span class="badge badge-inactive" style="margin-left:6px">Inactive</span>' : ''}
            </div>
            <div class="prop-card-meta text-muted">
              ${t ? `🧑 ${esc(t.tenantName)} · ${fmtMoney(t.monthlyRent)}/mo` : 'No active tenant'}
            </div>
          </div>
          <svg class="chevron-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </div>
        <div class="card-actions">
          <button class="btn-small btn-secondary" onclick="openEditProperty('${prop.id}')">Rename</button>
          ${!inactive
            ? `<button class="btn-small btn-danger-outline" onclick="confirmDeactivate('${prop.id}')">Deactivate</button>`
            : `<button class="btn-small btn-secondary" onclick="reactivateProperty('${prop.id}')">Reactivate</button>`}
        </div>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════
   PROPERTY DETAIL
══════════════════════════════════════════════════════════ */
function openPropertyDetail(propId) {
  detailPropertyId = propId;
  const detailPage = document.getElementById('page-property-detail');
  detailPage.classList.add('active');
  document.getElementById('btn-back').classList.remove('hidden');
  document.getElementById('header-title').textContent = 'Property Details';
  renderPropertyDetail();
}

function closePropertyDetail() {
  detailPropertyId = null;
  document.getElementById('page-property-detail').classList.remove('active');
  document.getElementById('btn-back').classList.add('hidden');
  const titles = { dashboard: 'Dashboard', properties: 'Properties', payments: 'Payments', issues: 'Issues' };
  document.getElementById('header-title').textContent = titles[currentPage] || '';
}

function renderPropertyDetail() {
  const prop = (appData.properties || []).find(p => p.id === detailPropertyId);
  if (!prop) return;

  const active  = getActiveTenancy(prop);
  const past    = (prop.tenancies || [])
    .filter(t => t.leaseEnd !== null)
    .sort((a, b) => new Date(b.leaseEnd) - new Date(a.leaseEnd));

  document.getElementById('page-property-detail').innerHTML = `
    <div class="page-content">

      <!-- Property name -->
      <div class="detail-section">
        <h2 class="detail-property-name">${esc(prop.name)}</h2>
        ${prop.active === false ? '<span class="badge badge-inactive">Inactive</span>' : ''}
      </div>

      <!-- Current Tenant -->
      <div class="detail-section">
        <div class="section-row">
          <h3 class="section-heading">Current Tenant</h3>
          ${active ? `<button class="btn-small btn-secondary" onclick="openEditTenancy('${prop.id}')">Edit</button>` : ''}
        </div>
        ${active ? tenancyCardHTML(active, false) : '<div class="empty-state" style="padding:12px 0">No active tenant.</div>'}
        <div style="margin-top:12px">
          ${active
            ? `<button class="btn-primary btn-full" onclick="openEndTenancy('${prop.id}')">End Tenancy &amp; Add New Tenant</button>`
            : `<button class="btn-primary btn-full" onclick="openNewTenancy('${prop.id}')">+ Add Tenant</button>`}
        </div>
      </div>

      <!-- Open Issues summary -->
      <div class="detail-section">
        <div class="section-row">
          <h3 class="section-heading">Open Issues</h3>
          <button class="btn-small btn-secondary" onclick="goToIssues('${prop.id}')">View All</button>
        </div>
        ${openIssuesSummaryHTML(prop)}
      </div>

      <!-- Tenancy History -->
      ${past.length > 0 ? `
      <div class="detail-section">
        <button class="collapsible-toggle" onclick="toggleCollapsible(this)">
          <span>Tenancy History (${past.length} past tenant${past.length !== 1 ? 's' : ''})</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        <div class="collapsible-content hidden">
          ${past.map(t => tenancyCardHTML(t, true)).join('')}
        </div>
      </div>` : ''}

    </div>`;
}

function tenancyCardHTML(t, readOnly) {
  const pmts  = t.payments || [];
  const total = pmts.reduce((s, p) => s + (Number(p.amountPaid) || 0), 0);
  return `
    <div class="tenancy-card ${readOnly ? 'tenancy-card--history' : 'tenancy-card--active'}">
      <div class="tenancy-name">${esc(t.tenantName)}</div>
      <div class="tenancy-dates">
        ${fmtDate(t.leaseStart)} — ${t.leaseEnd ? fmtDate(t.leaseEnd) : '<strong>Present</strong>'}
      </div>
      <div class="tenancy-details">
        <span>Rent: <strong>${fmtMoney(t.monthlyRent)}/mo</strong></span>
        <span>Deposit: <strong>${fmtMoney(t.depositPaid)}</strong></span>
        <span>Increment: <strong>${t.yearlyIncrementPct || 0}%/yr</strong></span>
      </div>
      <div class="tenancy-payments-summary">
        ${pmts.length} payment${pmts.length !== 1 ? 's' : ''} · ${fmtMoney(total)} received
      </div>
      ${readOnly ? '<div class="text-muted" style="font-size:0.72rem;margin-top:5px">Historical record — read only</div>' : ''}
    </div>`;
}

function openIssuesSummaryHTML(prop) {
  const open = (prop.issues || []).filter(i => i.status === 'Open');
  if (open.length === 0) return '<div class="text-muted">No open issues.</div>';
  const rows = open.slice(0, 3).map(i => `
    <div class="issue-row">
      <span class="issue-date">${fmtDate(i.date)}</span>
      <span class="issue-desc">${esc(i.description)}</span>
      <span class="badge badge-open">Open</span>
    </div>`).join('');
  const more = open.length > 3 ? `<div class="text-muted" style="font-size:0.78rem;margin-top:4px">+ ${open.length - 3} more</div>` : '';
  return rows + more;
}

function toggleCollapsible(btn) {
  const content = btn.nextElementSibling;
  content.classList.toggle('hidden');
  const svg = btn.querySelector('svg');
  svg.style.transform = content.classList.contains('hidden') ? '' : 'rotate(180deg)';
}

function goToIssues(propId) {
  selectedPropId = propId;
  closePropertyDetail();
  navigateTo('issues');
}

/* ══════════════════════════════════════════════════════════
   PAYMENTS PAGE
══════════════════════════════════════════════════════════ */
function renderPayments() {
  populateFilter('payment-property-filter', selectedPropId);
  const propId = document.getElementById('payment-property-filter').value;
  const prop   = (appData.properties || []).find(p => p.id === propId);
  const list   = document.getElementById('payments-list');

  if (!prop) {
    list.innerHTML = '<div class="empty-state">Select a property above to view payments.</div>';
    return;
  }

  let html = '';
  const active = getActiveTenancy(prop);

  if (active) {
    html += tenancyPaymentsHTML(active, propId, false);
  }

  const past = (prop.tenancies || [])
    .filter(t => t.leaseEnd !== null)
    .sort((a, b) => new Date(b.leaseEnd) - new Date(a.leaseEnd));

  if (past.length > 0) {
    html += `
      <div style="margin-top:16px">
        <button class="collapsible-toggle" onclick="toggleCollapsible(this)">
          <span>Payment History — Past Tenants (${past.length})</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        <div class="collapsible-content hidden">
          ${past.map(t => tenancyPaymentsHTML(t, propId, true)).join('')}
        </div>
      </div>`;
  }

  if (!active && past.length === 0) {
    html = '<div class="empty-state">No tenants found for this property.</div>';
  }

  list.innerHTML = html;
}

function tenancyPaymentsHTML(tenancy, propId, readOnly) {
  const pmts = (tenancy.payments || [])
    .slice()
    .sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));

  let rows = pmts.length === 0
    ? '<div class="text-muted" style="padding:8px 0;font-size:0.85rem">No payments recorded.</div>'
    : pmts.map(pmt => paymentRowHTML(pmt, propId, tenancy.id, readOnly)).join('');

  return `
    <div class="tenancy-payments-section">
      <div class="tenancy-payments-header">
        <strong>${esc(tenancy.tenantName)}</strong>
        <span class="text-muted" style="font-size:0.78rem">
          ${fmtDate(tenancy.leaseStart)} — ${tenancy.leaseEnd ? fmtDate(tenancy.leaseEnd) : 'Present'}
        </span>
        ${readOnly ? '<span class="badge badge-upcoming" style="font-size:0.68rem">Read only</span>' : ''}
      </div>
      ${rows}
    </div>`;
}

function paymentRowHTML(pmt, propId, tenancyId, readOnly) {
  const status = calcStatus(pmt);
  const cls    = amountClass(pmt);
  const amtDue  = Number(pmt.amountDue)  || 0;
  const amtPaid = Number(pmt.amountPaid) || 0;

  return `
    <div class="payment-row">
      <div class="payment-row-top">
        <div class="payment-due-date">
          <span class="label">Due</span>${fmtDate(pmt.dueDate)}
        </div>
        <div class="payment-amounts ${cls}">
          <span class="amount-paid-val">${fmtMoney(amtPaid)}</span>
          <span class="amount-sep"> / </span>
          <span class="amount-due-val">${fmtMoney(amtDue)}</span>
        </div>
        ${statusBadge(status)}
      </div>
      <div class="payment-row-bottom">
        ${pmt.dateReceived ? `<span class="text-muted">Received: ${fmtDate(pmt.dateReceived)}</span>` : ''}
        ${pmt.notes        ? `<span class="text-muted">${esc(pmt.notes)}</span>` : ''}
        ${!readOnly ? `
          <div class="row-actions">
            <button class="btn-tiny btn-secondary" onclick="openEditPayment('${propId}','${tenancyId}','${pmt.id}')">Edit</button>
            <button class="btn-tiny btn-danger-outline" onclick="confirmDeletePayment('${propId}','${tenancyId}','${pmt.id}')">Delete</button>
            ${['Outstanding','Partial','Late'].includes(status) ? `<button class="btn-tiny btn-whatsapp" onclick="sendWhatsAppReminder('${propId}','${tenancyId}','${pmt.id}')">WhatsApp</button>` : ''}
          </div>` : ''}
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   ISSUES PAGE
══════════════════════════════════════════════════════════ */
function renderIssues() {
  populateFilter('issue-property-filter', selectedPropId);
  const propId = document.getElementById('issue-property-filter').value;
  const prop   = (appData.properties || []).find(p => p.id === propId);
  const list   = document.getElementById('issues-list');

  if (!prop) {
    list.innerHTML = '<div class="empty-state">Select a property above to view issues.</div>';
    return;
  }

  const issues = (prop.issues || [])
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (issues.length === 0) {
    list.innerHTML = '<div class="empty-state">No issues logged for this property.</div>';
    return;
  }

  list.innerHTML = issues.map(issue => `
    <div class="issue-card">
      <div class="issue-card-top">
        <div style="flex:1;min-width:0">
          <div class="issue-card-desc">${esc(issue.description)}</div>
          <div class="issue-card-date">${fmtDate(issue.date)}</div>
        </div>
        <span class="badge badge-${issue.status.toLowerCase()}">${issue.status}</span>
      </div>
      <div class="card-actions">
        <button class="btn-small btn-secondary" onclick="openEditIssue('${propId}','${issue.id}')">Edit</button>
        <button class="btn-small ${issue.status === 'Open' ? 'btn-primary' : 'btn-secondary'}"
          onclick="toggleIssueStatus('${propId}','${issue.id}')">
          ${issue.status === 'Open' ? 'Mark Resolved' : 'Reopen'}
        </button>
      </div>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════════
   PROPERTY CRUD
══════════════════════════════════════════════════════════ */
function openAddProperty() {
  document.getElementById('prop-id').value = '';
  document.getElementById('prop-name').value = '';
  document.getElementById('modal-property-title').textContent = 'Add Property';
  openModal('modal-property');
}

function openEditProperty(propId) {
  const prop = (appData.properties || []).find(p => p.id === propId);
  if (!prop) return;
  document.getElementById('prop-id').value   = propId;
  document.getElementById('prop-name').value = prop.name;
  document.getElementById('modal-property-title').textContent = 'Rename Property';
  openModal('modal-property');
}

document.getElementById('form-property').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id   = document.getElementById('prop-id').value;
  const name = document.getElementById('prop-name').value.trim();
  if (!name) return;
  if (!appData.properties) appData.properties = [];

  if (id) {
    const prop = appData.properties.find(p => p.id === id);
    if (prop) prop.name = name;
  } else {
    appData.properties.push({ id: generateId(), name, active: true, tenancies: [], issues: [] });
  }
  closeModal('modal-property');
  await syncSave();
  renderCurrentPage();
  if (detailPropertyId) renderPropertyDetail();
});

function confirmDeactivate(propId) {
  const prop = (appData.properties || []).find(p => p.id === propId);
  if (!prop) return;
  openConfirm(
    `Deactivate "${prop.name}"? All data is preserved. You can reactivate it later.`,
    async () => {
      prop.active = false;
      await syncSave();
      renderCurrentPage();
    }
  );
}

async function reactivateProperty(propId) {
  const prop = (appData.properties || []).find(p => p.id === propId);
  if (!prop) return;
  prop.active = true;
  await syncSave();
  renderCurrentPage();
}

/* ══════════════════════════════════════════════════════════
   TENANCY CRUD
══════════════════════════════════════════════════════════ */
function openNewTenancy(propId) {
  document.getElementById('ten-prop-id').value      = propId;
  document.getElementById('ten-id').value           = '';
  document.getElementById('modal-tenancy-title').textContent = 'Add Tenant';
  document.getElementById('ten-name').value         = '';
  document.getElementById('ten-phone').value        = '';
  document.getElementById('ten-lease-start').value  = todayStr();
  document.getElementById('ten-rent').value         = '';
  document.getElementById('ten-deposit').value      = '';
  document.getElementById('ten-increment').value    = '0';
  document.getElementById('ten-end-note').classList.add('hidden');
  openModal('modal-tenancy');
}

function openEditTenancy(propId) {
  const prop = (appData.properties || []).find(p => p.id === propId);
  if (!prop) return;
  const t = getActiveTenancy(prop);
  if (!t) return;
  document.getElementById('ten-prop-id').value      = propId;
  document.getElementById('ten-id').value           = t.id;
  document.getElementById('modal-tenancy-title').textContent = 'Edit Current Tenant';
  document.getElementById('ten-name').value         = t.tenantName;
  document.getElementById('ten-phone').value        = t.phone || '';
  document.getElementById('ten-lease-start').value  = t.leaseStart;
  document.getElementById('ten-rent').value         = t.monthlyRent;
  document.getElementById('ten-deposit').value      = t.depositPaid;
  document.getElementById('ten-increment').value    = t.yearlyIncrementPct || 0;
  document.getElementById('ten-end-note').classList.remove('hidden');
  openModal('modal-tenancy');
}

document.getElementById('form-tenancy').addEventListener('submit', async (e) => {
  e.preventDefault();
  const propId = document.getElementById('ten-prop-id').value;
  const tenId  = document.getElementById('ten-id').value;
  const prop   = (appData.properties || []).find(p => p.id === propId);
  if (!prop) return;

  const data = {
    tenantName:        document.getElementById('ten-name').value.trim(),
    phone:             document.getElementById('ten-phone').value.trim(),
    leaseStart:        document.getElementById('ten-lease-start').value,
    monthlyRent:       parseFloat(document.getElementById('ten-rent').value)     || 0,
    depositPaid:       parseFloat(document.getElementById('ten-deposit').value)  || 0,
    yearlyIncrementPct:parseFloat(document.getElementById('ten-increment').value)|| 0,
  };

  if (tenId) {
    const t = prop.tenancies.find(t => t.id === tenId);
    if (t) Object.assign(t, data);
  } else {
    if (!prop.tenancies) prop.tenancies = [];
    prop.tenancies.push({ id: generateId(), ...data, leaseEnd: null, payments: [] });
  }

  closeModal('modal-tenancy');
  await syncSave();
  if (detailPropertyId === propId) renderPropertyDetail();
  else renderCurrentPage();
});

/* End current tenancy + start new */
function openEndTenancy(propId) {
  const prop = (appData.properties || []).find(p => p.id === propId);
  const t    = getActiveTenancy(prop);
  if (!t) return;

  document.getElementById('end-ten-prop-id').value  = propId;
  document.getElementById('end-ten-id').value       = t.id;
  document.getElementById('end-ten-name').textContent = t.tenantName;
  document.getElementById('end-ten-date').value     = todayStr();
  document.getElementById('new-ten-name').value     = '';
  document.getElementById('new-ten-phone').value    = '';
  document.getElementById('new-ten-lease-start').value = todayStr();
  document.getElementById('new-ten-rent').value     = '';
  document.getElementById('new-ten-deposit').value  = '';
  document.getElementById('new-ten-increment').value= '0';
  openModal('modal-end-tenancy');
}

document.getElementById('form-end-tenancy').addEventListener('submit', async (e) => {
  e.preventDefault();
  const propId = document.getElementById('end-ten-prop-id').value;
  const tenId  = document.getElementById('end-ten-id').value;
  const prop   = (appData.properties || []).find(p => p.id === propId);
  if (!prop) return;

  // Close current tenancy
  const current = prop.tenancies.find(t => t.id === tenId);
  if (current) current.leaseEnd = document.getElementById('end-ten-date').value;

  // Open new tenancy
  const newName = document.getElementById('new-ten-name').value.trim();
  if (newName) {
    prop.tenancies.push({
      id:                 generateId(),
      tenantName:         newName,
      phone:              document.getElementById('new-ten-phone').value.trim(),
      leaseStart:         document.getElementById('new-ten-lease-start').value,
      leaseEnd:           null,
      monthlyRent:        parseFloat(document.getElementById('new-ten-rent').value)     || 0,
      depositPaid:        parseFloat(document.getElementById('new-ten-deposit').value)  || 0,
      yearlyIncrementPct: parseFloat(document.getElementById('new-ten-increment').value)|| 0,
      payments:           []
    });
  }

  closeModal('modal-end-tenancy');
  await syncSave();
  if (detailPropertyId === propId) renderPropertyDetail();
  else renderCurrentPage();
});

/* ══════════════════════════════════════════════════════════
   PAYMENT CRUD
══════════════════════════════════════════════════════════ */
function openAddPayment() {
  const propId = document.getElementById('payment-property-filter').value;
  if (!propId) { showToast('Select a property first.'); return; }
  const prop = (appData.properties || []).find(p => p.id === propId);
  if (!prop) return;
  const t = getActiveTenancy(prop);
  if (!t) { showToast('No active tenant for this property.'); return; }

  document.getElementById('pay-id').value           = '';
  document.getElementById('pay-prop-id').value      = propId;
  document.getElementById('pay-tenancy-id').value   = t.id;
  document.getElementById('modal-payment-title').textContent = 'Log Payment';
  document.getElementById('pay-due-date').value     = '';
  document.getElementById('pay-amount-due').value   = t.monthlyRent;
  document.getElementById('pay-amount-paid').value  = '';
  document.getElementById('pay-date-received').value= todayStr();
  document.getElementById('pay-notes').value        = '';
  document.getElementById('pay-status-preview').innerHTML = '';
  openModal('modal-payment');
}

function openEditPayment(propId, tenancyId, payId) {
  const prop    = (appData.properties || []).find(p => p.id === propId);
  if (!prop) return;
  const tenancy = prop.tenancies.find(t => t.id === tenancyId);
  if (!tenancy) return;
  const pmt = tenancy.payments.find(p => p.id === payId);
  if (!pmt) return;

  document.getElementById('pay-id').value           = payId;
  document.getElementById('pay-prop-id').value      = propId;
  document.getElementById('pay-tenancy-id').value   = tenancyId;
  document.getElementById('modal-payment-title').textContent = 'Edit Payment';
  document.getElementById('pay-due-date').value     = pmt.dueDate;
  document.getElementById('pay-amount-due').value   = pmt.amountDue;
  document.getElementById('pay-amount-paid').value  = pmt.amountPaid || '';
  document.getElementById('pay-date-received').value= pmt.dateReceived || '';
  document.getElementById('pay-notes').value        = pmt.notes || '';
  updatePayStatusPreview();
  openModal('modal-payment');
}

function updatePayStatusPreview() {
  const dueDate  = document.getElementById('pay-due-date').value;
  const amtDue   = parseFloat(document.getElementById('pay-amount-due').value)  || 0;
  const amtPaid  = parseFloat(document.getElementById('pay-amount-paid').value) || 0;
  const rcvd     = document.getElementById('pay-date-received').value;
  const el       = document.getElementById('pay-status-preview');
  if (!dueDate) { el.innerHTML = ''; return; }
  const status = calcStatus({ dueDate, amountDue: amtDue, amountPaid: amtPaid, dateReceived: rcvd });
  el.innerHTML = 'Status: ' + statusBadge(status);
}

['pay-due-date', 'pay-amount-due', 'pay-amount-paid', 'pay-date-received'].forEach(id => {
  document.getElementById(id).addEventListener('input', updatePayStatusPreview);
});

document.getElementById('form-payment').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payId     = document.getElementById('pay-id').value;
  const propId    = document.getElementById('pay-prop-id').value;
  const tenancyId = document.getElementById('pay-tenancy-id').value;
  const prop      = (appData.properties || []).find(p => p.id === propId);
  if (!prop) return;
  const tenancy   = prop.tenancies.find(t => t.id === tenancyId);
  if (!tenancy) return;

  const data = {
    dueDate:      document.getElementById('pay-due-date').value,
    amountDue:    parseFloat(document.getElementById('pay-amount-due').value)  || 0,
    amountPaid:   parseFloat(document.getElementById('pay-amount-paid').value) || 0,
    dateReceived: document.getElementById('pay-date-received').value || null,
    notes:        document.getElementById('pay-notes').value.trim(),
  };

  if (payId) {
    const pmt = tenancy.payments.find(p => p.id === payId);
    if (pmt) Object.assign(pmt, data);
  } else {
    if (!tenancy.payments) tenancy.payments = [];
    tenancy.payments.push({ id: generateId(), ...data });
  }

  closeModal('modal-payment');
  await syncSave();
  renderPayments();
});

function confirmDeletePayment(propId, tenancyId, payId) {
  openConfirm('Delete this payment record permanently?', async () => {
    const prop    = (appData.properties || []).find(p => p.id === propId);
    if (!prop) return;
    const tenancy = prop.tenancies.find(t => t.id === tenancyId);
    if (!tenancy) return;
    tenancy.payments = tenancy.payments.filter(p => p.id !== payId);
    await syncSave();
    renderPayments();
  });
}

function sendWhatsAppReminder(propId, tenancyId, payId) {
  const prop    = (appData.properties || []).find(p => p.id === propId);
  if (!prop) return;
  const tenancy = prop.tenancies.find(t => t.id === tenancyId);
  if (!tenancy) return;
  const pmt     = tenancy.payments.find(p => p.id === payId);
  if (!pmt) return;

  const phone = (tenancy.phone || '').replace(/\s+/g, '');
  if (!phone) {
    showToast('No phone number saved for this tenant. Edit the tenant to add one.');
    return;
  }

  const amtDue  = Number(pmt.amountDue)  || 0;
  const amtPaid = Number(pmt.amountPaid) || 0;
  const status  = calcStatus(pmt);

  let msg = `Hi ${tenancy.tenantName}, this is a reminder regarding your rent for ${prop.name}.`;
  if (status === 'Outstanding') {
    msg += ` Your payment of ${fmtMoney(amtDue)} was due on ${fmtDate(pmt.dueDate)} and has not been received yet.`;
  } else if (status === 'Partial') {
    msg += ` Your payment of ${fmtMoney(amtDue)} was due on ${fmtDate(pmt.dueDate)}. I have received ${fmtMoney(amtPaid)}, with ${fmtMoney(amtDue - amtPaid)} still outstanding.`;
  } else if (status === 'Late') {
    msg += ` Your payment of ${fmtMoney(amtDue)} due on ${fmtDate(pmt.dueDate)} was received late on ${fmtDate(pmt.dateReceived)}.`;
  }
  msg += ' Please let me know if you have any questions. Thank you.';

  const cleanPhone = phone.replace(/[^\d+]/g, '');
  window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ══════════════════════════════════════════════════════════
   ISSUE CRUD
══════════════════════════════════════════════════════════ */
function openAddIssue() {
  const propId = document.getElementById('issue-property-filter').value;
  if (!propId) { showToast('Select a property first.'); return; }
  document.getElementById('issue-id').value         = '';
  document.getElementById('issue-prop-id').value    = propId;
  document.getElementById('modal-issue-title').textContent = 'Log Issue';
  document.getElementById('issue-date').value       = todayStr();
  document.getElementById('issue-desc').value       = '';
  document.getElementById('issue-status-sel').value = 'Open';
  openModal('modal-issue');
}

function openEditIssue(propId, issueId) {
  const prop  = (appData.properties || []).find(p => p.id === propId);
  if (!prop) return;
  const issue = (prop.issues || []).find(i => i.id === issueId);
  if (!issue) return;
  document.getElementById('issue-id').value         = issueId;
  document.getElementById('issue-prop-id').value    = propId;
  document.getElementById('modal-issue-title').textContent = 'Edit Issue';
  document.getElementById('issue-date').value       = issue.date;
  document.getElementById('issue-desc').value       = issue.description;
  document.getElementById('issue-status-sel').value = issue.status;
  openModal('modal-issue');
}

async function toggleIssueStatus(propId, issueId) {
  const prop  = (appData.properties || []).find(p => p.id === propId);
  if (!prop) return;
  const issue = (prop.issues || []).find(i => i.id === issueId);
  if (!issue) return;
  issue.status = issue.status === 'Open' ? 'Resolved' : 'Open';
  await syncSave();
  renderIssues();
}

document.getElementById('form-issue').addEventListener('submit', async (e) => {
  e.preventDefault();
  const issueId = document.getElementById('issue-id').value;
  const propId  = document.getElementById('issue-prop-id').value;
  const prop    = (appData.properties || []).find(p => p.id === propId);
  if (!prop) return;
  if (!prop.issues) prop.issues = [];

  const data = {
    date:        document.getElementById('issue-date').value,
    description: document.getElementById('issue-desc').value.trim(),
    status:      document.getElementById('issue-status-sel').value,
  };

  if (issueId) {
    const issue = prop.issues.find(i => i.id === issueId);
    if (issue) Object.assign(issue, data);
  } else {
    prop.issues.push({ id: generateId(), ...data });
  }

  closeModal('modal-issue');
  await syncSave();
  renderIssues();
  if (detailPropertyId === propId) renderPropertyDetail();
});

/* ══════════════════════════════════════════════════════════
   MODALS & CONFIRM
══════════════════════════════════════════════════════════ */
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
}

let confirmCallback = null;

function openConfirm(message, callback) {
  document.getElementById('confirm-message').textContent = message;
  confirmCallback = callback;
  openModal('modal-confirm');
}

/* ══════════════════════════════════════════════════════════
   FILTER HELPER
══════════════════════════════════════════════════════════ */
function populateFilter(selectId, selectValue) {
  const sel   = document.getElementById(selectId);
  const props = (appData.properties || []).filter(p => p.active !== false);
  const prev  = selectValue || sel.value;
  sel.innerHTML = '<option value="">— Select property —</option>' +
    props.map(p => `<option value="${p.id}" ${p.id === prev ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
}

/* ══════════════════════════════════════════════════════════
   UI HELPERS
══════════════════════════════════════════════════════════ */
function setSyncStatus(state) {
  const el = document.getElementById('sync-status');
  const map = {
    saved:   ['Saved ✓',   'sync-saved'],
    saving:  ['Saving…',   'sync-saving'],
    loading: ['Loading…',  'sync-saving'],
    error:   ['Sync error','sync-error'],
  };
  const [text, cls] = map[state] || map.saved;
  el.textContent   = text;
  el.className     = `sync-status ${cls}`;
}

function showToast(msg, ms = 3500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), ms);
}

function showApp() {
  document.getElementById('screen-signin').classList.remove('active');
  document.getElementById('screen-app').classList.add('active');
}

function showSignIn() {
  document.getElementById('screen-app').classList.remove('active');
  document.getElementById('screen-signin').classList.add('active');
}

function updateUserUI(user) {
  const btn = document.getElementById('btn-user-menu');
  btn.textContent = (user && user.name) ? user.name[0].toUpperCase() : '?';
  document.getElementById('user-info-name').textContent  = (user && user.name)  || '';
  document.getElementById('user-info-email').textContent = (user && user.email) || '';
}

function updateLastUpdatedUI() {
  if (!appData.lastUpdatedBy || !appData.lastUpdatedAt) return;
  const d = new Date(appData.lastUpdatedAt);
  document.getElementById('last-updated-info').textContent =
    `Last saved by ${appData.lastUpdatedBy} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${d.toLocaleDateString()}`;
}

/* ══════════════════════════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════════════════════════ */
function setupEventListeners() {
  // Sign in / out
  document.getElementById('btn-signin').addEventListener('click', () => Drive.signIn());
  document.getElementById('btn-signout').addEventListener('click', () => {
    document.getElementById('user-dropdown').classList.add('hidden');
    Drive.signOut();
  });

  // Bottom nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedPropId = null;
      navigateTo(btn.dataset.page);
    });
  });

  // Back button
  document.getElementById('btn-back').addEventListener('click', () => {
    closePropertyDetail();
    renderCurrentPage();
  });

  // Sync / refresh
  document.getElementById('btn-sync').addEventListener('click', syncLoad);

  // User menu toggle
  document.getElementById('btn-user-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('user-dropdown').classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    document.getElementById('user-dropdown').classList.add('hidden');
  });

  // Page action buttons
  document.getElementById('btn-add-property').addEventListener('click', openAddProperty);
  document.getElementById('btn-add-payment').addEventListener('click', openAddPayment);
  document.getElementById('btn-add-issue').addEventListener('click', openAddIssue);

  // Filter changes
  document.getElementById('payment-property-filter').addEventListener('change', (e) => {
    selectedPropId = e.target.value;
    renderPayments();
  });
  document.getElementById('issue-property-filter').addEventListener('change', (e) => {
    selectedPropId = e.target.value;
    renderIssues();
  });

  // Modal close buttons (data-modal attribute)
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay') || document.getElementById(btn.dataset.modal);
      if (modal) closeModal(modal.id);
    });
  });

  // Close modal on backdrop tap
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Confirm modal
  document.getElementById('confirm-cancel').addEventListener('click', () => closeModal('modal-confirm'));
  document.getElementById('confirm-ok').addEventListener('click', async () => {
    closeModal('modal-confirm');
    if (confirmCallback) {
      const cb = confirmCallback;
      confirmCallback = null;
      await cb();
    }
  });
}

/* ══════════════════════════════════════════════════════════
   SERVICE WORKER
══════════════════════════════════════════════════════════ */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  }
}
