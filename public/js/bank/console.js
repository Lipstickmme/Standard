'use strict';

/**
 * The staff console.
 *
 * Each tab loads when it is first opened and refreshes on demand rather than
 * on a timer: a console that re-renders under a cursor is how the wrong
 * transfer gets approved.
 */

(function () {
  const RF = window.RF;
  const { api, qs, qsa, esc, money, date, datetime, ago, toast, badge, onSubmit } = RF;
  // Whether investments are switched on (set from the session by core.js).
  const investOn = () => document.documentElement.classList.contains('rf-invest-on');

  const state = { settings: null, meta: null, customers: [], activityOffset: 0 };
  const loaded = new Set();

  /**
   * What the open modal is acting on.
   *
   * Deliberately not stored on the element: `dataset.customer` writes a
   * `data-customer` attribute, which is the selector the delegated
   * open-this-customer handler at the bottom of this file listens for. A Save
   * button inside such a modal would match it, and that handler calls
   * preventDefault() - so the form would never submit.
   */
  const acting = { accountId: null, customerId: null, transferId: null };

  /* ---------------------------------------------------------------- tabs -- */

  const TITLES = {
    overview: ['Today', 'What needs a decision, and how the bank stands.'],
    queue: ['Transfer queue', 'Outgoing transfers held for review.'],
    deposits: ['Check deposits', 'Mobile deposits waiting on a decision.'],
    messages: ['Messages', 'Secure messages from customers.'],
    disputes: ['Claims', 'Disputed transactions.'],
    customers: ['Customers', 'Search, open and act on any customer.'],
    register: ['Register a customer', 'Open a customer and their first accounts.'],
    entries: ['Post an entry', 'Book a deposit, a withdrawal or a correction against one account.'],
    cards: ['Cards', 'Every card the bank has issued.'],
    investments: ['Investments', 'What customers hold, valued at live prices.'],
    alerts: ['Email alerts', 'Everything the bank has sent, and to whom.'],
    activity: ['Activity log', 'Every action, by customers and staff.'],
    settings: ['Settings', 'Limits, fees, contact details and switches.'],
    setup: ['Setup checklist', 'What the backend needs, checked live.'],
  };

  function showTab(name) {
    qsa('[data-tab]').forEach((b) => {
      const on = b.getAttribute('data-tab') === name;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    qsa('[data-panel]').forEach((p) => { p.hidden = p.getAttribute('data-panel') !== name; });
    history.replaceState(null, '', `#${name}`);
    const [title, sub] = TITLES[name] || ['Staff console', ''];
    const h1 = qs('.rf-top h1');
    if (h1) h1.textContent = title;
    const subEl = qs('.rf-top-sub');
    if (subEl) subEl.textContent = sub;
    // On a phone the menu is a drawer: close it once a section is chosen.
    const scrim = qs('.rf-scrim');
    if (scrim) scrim.click();
    window.scrollTo(0, 0);
    if (!loaded.has(name) && TABS[name]) {
      loaded.add(name);
      Promise.resolve(TABS[name]()).catch((err) => {
        loaded.delete(name);
        toast(err.message || 'That tab could not load.', 'bad');
      });
    }
  }

  /* ------------------------------------------------------------ overview -- */

  async function overview() {
    const data = await api.get('/admin/overview');
    const s = data.stats;

    qs('[data-stats]').innerHTML = [
      ['Customers', String(s.customers), `${esc(String(s.newCustomers30d))} joined in 30 days`],
      ['On deposit', money(s.deposits), `${esc(String(s.accounts))} accounts`],
      ['Credit outstanding', money(s.creditOutstanding), `across card accounts &middot; ${s.suspended} suspended`],
    ].map(([k, v, d]) => `<div class="rf-card rf-stat"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="d">${d}</div></div>`).join('');

    // What needs a person, first and largest. Each tile opens its section.
    const attention = [
      ['queue', 'Transfers to review', s.pendingTransfers, s.pendingTransferValue ? `${money(s.pendingTransferValue)} held` : 'nothing held'],
      ['deposits', 'Check deposits', s.pendingDeposits, 'waiting on a decision'],
      ['customers?kyc=pending', 'Identity checks', s.pendingKyc, 'customers to verify'],
      ['messages', 'Unanswered messages', s.unansweredMessages, 'from customers'],
      ['disputes', 'Open claims', s.openDisputes, 'disputed transactions'],
    ];
    qs('[data-attention]').innerHTML = attention.map(([tab, label, n, d]) => `
      <a class="hs-attn-tile${n ? ' is-hot' : ''}" href="#${tab.split('?')[0]}" data-goto-tab="${tab}">
        <span class="n">${esc(String(n || 0))}</span>
        <span class="l"><strong>${esc(label)}</strong><small>${n ? esc(d) : 'All clear'}</small></span>
        <span class="go" aria-hidden="true">&rarr;</span>
      </a>`).join('');

    const pips = { queue: s.pendingTransfers, deposits: s.pendingDeposits, messages: s.unansweredMessages, disputes: s.openDisputes };
    Object.entries(pips).forEach(([key, n]) => {
      qsa(`[data-staff-pip="${key}"]`).forEach((pip) => {
        pip.textContent = String(n || '');
        pip.classList.toggle('rf-hide', !n);
      });
    });

    // Invested, and whether setup is finished, load beside the rest.
    if (investOn()) api.get('/admin/investments').then((inv) => {
      const host = qs('[data-stats]');
      if (!host || qs('[data-stat-invested]', host)) return;
      host.insertAdjacentHTML('beforeend', `<a class="rf-card rf-stat hs-stat-link" href="#investments" data-goto-tab="investments" data-stat-invested><div class="k">Invested by customers</div><div class="v">${money(inv.totals.value)}</div><div class="d">${inv.totals.investors} investor${inv.totals.investors === 1 ? '' : 's'} &middot; ${inv.totals.trades24h} trade${inv.totals.trades24h === 1 ? '' : 's'} today</div></a>`);
    }).catch(() => {});
    api.get('/admin/setup').then((setupData) => {
      const left = setupData.counts.todo || 0;
      qsa('[data-staff-pip="setup"]').forEach((pip) => { pip.textContent = String(left || ''); pip.classList.toggle('rf-hide', !left); });
      const banner = qs('[data-setup-banner]');
      if (banner && left) {
        banner.innerHTML = `<span><strong>${left} setup item${left === 1 ? '' : 's'} left</strong> before this bank is ready for real customers.</span><a class="rf-btn sm" href="#setup" data-goto-tab="setup">Open the checklist</a>`;
        banner.classList.remove('rf-hide');
      }
    }).catch(() => {});

    qs('[data-queue-preview]').innerHTML = data.queue.length ? data.queue.map((t) => `
      <tr>
        <td>${esc((t.customer && t.customer.fullName) || '')}</td>
        <td class="rf-small">${esc(t.typeLabel)}</td>
        <td class="rf-small">${esc((t.recipient && (t.recipient.nickname || t.recipient.name)) || '&mdash;')}</td>
        <td class="num rf-amt">${money(t.total)}</td>
        <td class="rf-small rf-muted">${ago(t.createdAt)}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="rf-center rf-muted">Nothing waiting. Good.</td></tr>';

    qs('[data-activity-preview]').innerHTML = data.activity.slice(0, 8).map((row) => `
      <li>
        <span class="t"><strong>${esc(row.detail || row.action)}</strong><span>${esc(row.actorEmail || 'system')} &middot; ${esc(row.ip || '')}</span></span>
        <span class="rf-small rf-muted rf-nowrap">${ago(row.createdAt)}</span>
      </li>`).join('') || '<li class="rf-muted rf-small">Nothing yet.</li>';

    qs('[data-new-customers]').innerHTML = data.recentCustomers.map((c) => `
      <li class="clickable" data-customer="${esc(c.id)}">
        <span class="rf-avatar sm">${esc(c.initials)}</span>
        <span class="t"><strong>${esc(c.fullName)}</strong><span>${esc(c.email)}</span></span>
        <span class="rf-small rf-muted">${date(c.createdAt)}</span>
      </li>`).join('') || '<li class="rf-muted rf-small">No customers yet.</li>';

    qs('[data-goto="queue"]').addEventListener('click', () => showTab('queue'));
  }

  /* ----------------------------------------------------------- customers -- */

  async function customers() {
    const form = qs('[data-customer-filters]');
    const tbody = qs('[data-customers]');

    async function load() {
      const params = new URLSearchParams(RF.formData(form));
      params.set('limit', '100');
      const data = await api.get(`/admin/customers?${params.toString()}`);
      state.customers = data.customers;
      qs('[data-customer-count]').textContent = `${data.total} record(s)`;
      tbody.innerHTML = data.customers.length ? data.customers.map((c) => `
        <tr class="clickable" data-customer="${esc(c.id)}">
          <td>
            <span class="rf-inline"><span class="rf-avatar sm">${c.photoUrl ? `<img src="${esc(c.photoUrl)}" alt="" />` : esc(c.initials)}</span>
            <span><strong>${esc(c.fullName)}</strong><span class="sub">${esc(c.email)}</span></span></span>
          </td>
          <td class="rf-mono rf-small">${esc(c.customerNumber)}</td>
          <td>${badge(c.status)}${c.role === 'admin' ? ' ' + badge('info', 'staff') : ''}</td>
          <td>${badge(c.kycStatus)}</td>
          <td class="num">${c.accountCount}</td>
          <td class="num rf-amt">${money(c.totalBalance)}</td>
          <td class="rf-small rf-muted">${date(c.createdAt)}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="rf-center rf-muted">Nobody matches that search.</td></tr>';
    }

    form.addEventListener('submit', (event) => { event.preventDefault(); load(); });
    await load();
  }

  /* --------------------------------------------------- the customer sheet -- */

  const customerModal = qs('[data-customer-modal]');
  RF.modal.wire(customerModal);

  const ENTRIES_PAGE = 25;

  /** The question asked before an entry is deleted, saying what happens to the money. */
  const deleteWarning = (tx) => {
    const effect = {
      posted: `The balance moves back by ${money(tx.amount)}.`,
      reversed: 'Its reversal is deleted with it, so the balance does not change.',
      pending: tx.direction === 'debit' ? `Its ${money(tx.amount)} hold is released.` : 'It never reached the balance, so nothing moves.',
      hold: `Its ${money(tx.amount)} hold is released.`,
    }[tx.status] || 'The balance does not change.';
    return `Delete this entry?\n\n${tx.description}\n${tx.direction === 'credit' ? '+' : '-'}${money(tx.amount)} - ${datetime(tx.date)} - ${tx.reference || ''}\n\n${effect} It disappears from the customer's activity and statements and cannot be undone. Reverse keeps a record of the correction instead.`;
  };

  const entryRow = (tx) => `<tr>
    <td class="rf-nowrap rf-small">${date(tx.date)}<span class="sub">${new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></td>
    <td>${esc(tx.description)}<span class="sub">${esc(tx.accountName)} &middot; ${esc(tx.methodLabel)}</span></td>
    <td>${badge(tx.status)}</td>
    <td class="num rf-amt ${tx.direction}">${RF.signedMoney(tx.amount, tx.direction)}</td>
    <td class="num rf-muted">${tx.balanceAfter == null ? '—' : money(tx.balanceAfter)}</td>
    <td class="rf-right rf-nowrap">
      ${tx.status === 'pending' ? `<button class="rf-btn ghost sm" data-settle="${esc(tx.id)}" data-settle-action="post">Post</button>` : ''}
      <button class="rf-btn link sm" data-edit-tx="${esc(tx.id)}">Edit</button>
      ${tx.status === 'posted' ? `<button class="rf-btn link sm" data-settle="${esc(tx.id)}" data-settle-action="reverse">Reverse</button>` : ''}
      ${tx.method === 'investment' ? '' : `<button class="rf-btn link sm hs-del" data-delete-tx="${esc(tx.id)}">Delete</button>`}
    </td>
  </tr>`;

  /** Paint one page of the sheet's entries; the Edit button reads acting.entries. */
  function showEntries(customerId, rows, total, offset) {
    const tbody = qs('[data-sheet-entries]', customerModal);
    if (!tbody) return;
    acting.entries = rows;
    acting.entriesTotal = total;
    acting.entriesOffset = offset;
    tbody.innerHTML = rows.map(entryRow).join('') || '<tr><td colspan="6" class="rf-muted rf-small">Nothing yet.</td></tr>';
    qs('[data-sheet-range]', customerModal).textContent = total
      ? `Showing ${offset + 1} to ${offset + rows.length} of ${total}`
      : '';
    const prev = qs('[data-sheet-prev]', customerModal);
    const next = qs('[data-sheet-next]', customerModal);
    prev.parentElement.classList.toggle('rf-hide', total <= ENTRIES_PAGE);
    prev.disabled = offset === 0;
    next.disabled = offset + rows.length >= total;

    qsa('[data-settle]', tbody).forEach((button) => button.addEventListener('click', async () => {
      const action = button.getAttribute('data-settle-action');
      const note = action === 'reverse' ? prompt('Why is this being reversed? The customer sees this.') : '';
      if (action === 'reverse' && note == null) return;
      try {
        await api.post(`/admin/transactions/${button.getAttribute('data-settle')}/settle`, { action, note });
        toast(action === 'post' ? 'Entry posted.' : 'Entry reversed.', 'ok');
        openCustomer(customerId);
      } catch (err) { toast(err.message, 'bad'); }
    }));

    qsa('[data-delete-tx]', tbody).forEach((button) => button.addEventListener('click', async () => {
      const tx = rows.find((t) => t.id === button.getAttribute('data-delete-tx'));
      if (!tx || !confirm(deleteWarning(tx))) return;
      try {
        await api.del(`/admin/transactions/${tx.id}`);
        toast('Entry deleted.', 'ok');
        openCustomer(customerId);
      } catch (err) { toast(err.message, 'bad'); }
    }));
  }

  async function loadEntries(customerId, offset) {
    const tbody = qs('[data-sheet-entries]', customerModal);
    qsa('[data-sheet-prev], [data-sheet-next]', customerModal).forEach((b) => { b.disabled = true; });
    try {
      const res = await api.get(`/admin/customers/${customerId}/transactions?limit=${ENTRIES_PAGE}&offset=${offset}`);
      // The sheet was closed or re-rendered while this page was on its way.
      if (!tbody || !tbody.isConnected) return;
      // A refresh can leave the old page past the end; land on the last one.
      if (!res.transactions.length && offset > 0 && res.total) {
        loadEntries(customerId, Math.floor((res.total - 1) / ENTRIES_PAGE) * ENTRIES_PAGE);
        return;
      }
      showEntries(customerId, res.transactions, res.total, offset);
    } catch (err) {
      toast(err.message, 'bad');
      if (tbody && tbody.isConnected) showEntries(customerId, acting.entries || [], acting.entriesTotal || 0, acting.entriesOffset || 0);
    }
  }

  async function openCustomer(id) {
    // Refreshing the open sheet after an edit stays on the same page of entries.
    const refreshing = id === acting.customerId && !customerModal.classList.contains('rf-hide');
    if (!refreshing) acting.entriesOffset = 0;
    acting.customerId = id;
    RF.modal.open(customerModal);
    qs('[data-modal-body]', customerModal).innerHTML = '<p class="rf-muted">Loading&hellip;</p>';
    const data = await api.get(`/admin/customers/${id}`);
    const c = data.customer;

    qs('[data-modal-name]', customerModal).innerHTML = `${esc(c.fullName)} <span class="rf-small rf-muted">${esc(c.customerNumber)}</span>`;
    const avatar = qs('[data-modal-avatar]', customerModal);
    avatar.innerHTML = c.photoUrl ? `<img src="${esc(c.photoUrl)}" alt="" />` : esc(c.initials);

    qs('[data-modal-body]', customerModal).innerHTML = `
      <div class="rf-inline rf-mb">
        ${badge(c.status)} ${badge(c.kycStatus, `KYC ${c.kycStatus}`)} <span class="rf-badge">${esc(c.tier)}</span>
        ${c.lockedUntil ? badge('bad', 'Locked out') : ''}
        ${c.mustChangePassword ? badge('pending', 'Must change password') : ''}
      </div>

      <div class="rf-grid cols-2">
        <div>
          <h4 class="rf-label">Identity</h4>
          <dl class="rf-dl">
            <dt>Email</dt><dd>${esc(c.email)}</dd>
            <dt>Phone</dt><dd>${esc(c.phone || '—')}</dd>
            <dt>Date of birth</dt><dd>${esc(c.dateOfBirth || '—')}</dd>
            <dt>SSN</dt><dd class="mono">${esc(c.ssnMasked || '—')} <button class="rf-copy" data-reveal-ssn="${esc(c.id)}">reveal</button></dd>
            <dt>Address</dt><dd>${esc([c.addressLine1, c.addressLine2, c.city, c.state, c.postalCode].filter(Boolean).join(', ') || '—')}</dd>
            <dt>ID document</dt><dd>${esc(c.idType || '—')} ${esc(c.idState || '')}</dd>
            <dt>Employment</dt><dd>${esc(c.employmentStatus || '—')}${c.employer ? ` at ${esc(c.employer)}` : ''}</dd>
            <dt>Annual income</dt><dd>${c.annualIncome ? money(c.annualIncome) : '—'}</dd>
            <dt>Joined</dt><dd>${date(c.createdAt)}</dd>
            <dt>Last signed in</dt><dd>${c.lastLoginAt ? datetime(c.lastLoginAt) : 'never'}</dd>
          </dl>
        </div>
        <div>
          <h4 class="rf-label">Accounts</h4>
          <table class="rf-table">
            <tbody>
              ${data.accounts.map((a) => `<tr>
                <td><strong>${esc(a.nickname || a.name)}</strong><span class="sub rf-mono">${esc(a.accountMask)} &middot; ${esc(a.typeLabel)}</span></td>
                <td class="num rf-amt">${money(a.balance)}<span class="sub">${money(a.availableBalance)} avail.</span></td>
                <td class="rf-right rf-nowrap">
                  <button class="rf-btn sm" data-adjust="${esc(a.id)}" data-account-label="${esc(`${a.nickname || a.name} ${a.accountMask}`)}">Adjust</button>
                  <button class="rf-btn ghost sm" data-account-status="${esc(a.id)}" data-current="${esc(a.status)}">${a.status === 'active' ? 'Freeze' : 'Activate'}</button>
                </td>
              </tr>`).join('') || '<tr><td class="rf-muted rf-small">No accounts.</td></tr>'}
            </tbody>
          </table>
          <button class="rf-btn ghost sm rf-mt" data-open-account="${esc(c.id)}">Open another account</button>

          <h4 class="rf-label rf-mt">Cards</h4>
          <ul class="rf-list">
            ${data.cards.map((card) => `<li>
              <span class="t"><strong>${esc(card.brand.toUpperCase())} &bull;&bull;&bull;&bull; ${esc(card.last4)}</strong><span>${esc(card.kind)} &middot; expires ${esc(card.expires)}</span></span>
              ${badge(card.status)}
            </li>`).join('') || '<li class="rf-muted rf-small">No cards.</li>'}
          </ul>
          <h4 class="rf-label rf-mt rf-invest-only">Investments</h4>
          <ul class="rf-list rf-invest-only" data-sheet-investments><li class="rf-muted rf-small">Loading&hellip;</li></ul>
        </div>
      </div>

      <h4 class="rf-label rf-mt">Transactions</h4>
      <div class="rf-table-wrap">
        <table class="rf-table">
          <thead><tr><th>Date</th><th>Description</th><th>Status</th><th class="num">Amount</th><th class="num">Balance</th><th></th></tr></thead>
          <tbody data-sheet-entries></tbody>
        </table>
      </div>
      <div class="rf-spread rf-mt" data-sheet-pager>
        <span class="rf-small rf-muted" data-sheet-range></span>
        <span class="rf-inline">
          <button class="rf-btn ghost sm" type="button" data-sheet-prev>Previous</button>
          <button class="rf-btn ghost sm" type="button" data-sheet-next>Next</button>
        </span>
      </div>

      <div class="rf-grid cols-2 rf-mt">
        <div>
          <h4 class="rf-label">Documents</h4>
          <ul class="rf-list">
            ${data.documents.map((doc) => `<li>
              <span class="t"><strong>${esc(doc.kindLabel)}</strong><span>${esc(doc.filename)} &middot; ${date(doc.createdAt)}</span></span>
              <a class="rf-btn ghost sm" href="${esc(doc.url)}" target="_blank" rel="noopener">View</a>
            </li>`).join('') || '<li class="rf-muted rf-small">Nothing on file.</li>'}
          </ul>
        </div>
        <div>
          <h4 class="rf-label">Recipients</h4>
          <ul class="rf-list">
            ${data.beneficiaries.map((b) => `<li>
              <span class="t"><strong>${esc(b.nickname || b.name)}</strong><span>${esc(b.bankName || '')} ${esc(b.accountMask)}</span></span>
              ${badge(b.status)}
              ${b.status !== 'verified' ? `<button class="rf-btn link sm" data-verify-beneficiary="${esc(b.id)}">Verify</button>` : ''}
            </li>`).join('') || '<li class="rf-muted rf-small">None saved.</li>'}
          </ul>
        </div>
      </div>

      <h4 class="rf-label rf-mt">Activity</h4>
      <ul class="rf-list">
        ${data.activity.slice(0, 10).map((row) => `<li>
          <span class="t"><strong>${esc(row.detail || row.action)}</strong><span>${esc(row.actorRole)} &middot; ${esc(row.ip || '')} &middot; ${esc(row.device || '')}</span></span>
          <span class="rf-small rf-muted rf-nowrap">${ago(row.createdAt)}</span>
        </li>`).join('') || '<li class="rf-muted rf-small">Nothing yet.</li>'}
      </ul>

      <hr class="rf-divider" />
      <h4 class="rf-label">Act on this customer</h4>
      <div class="rf-inline">
        <button class="rf-btn ghost sm" data-customer-action="password" data-id="${esc(c.id)}">Issue a temporary password</button>
        <button class="rf-btn ghost sm" data-customer-action="unlock" data-id="${esc(c.id)}">Clear the lockout</button>
        <button class="rf-btn ghost sm" data-customer-action="kyc" data-id="${esc(c.id)}">Set identity status</button>
        <button class="rf-btn ghost sm" data-customer-action="edit" data-id="${esc(c.id)}">Edit details</button>
        ${c.status === 'active'
    ? `<button class="rf-btn danger sm" data-customer-action="suspend" data-id="${esc(c.id)}">Suspend</button>`
    : `<button class="rf-btn sm" data-customer-action="activate" data-id="${esc(c.id)}">Reactivate</button>`}
      </div>`;

    const offset = acting.entriesOffset || 0;
    const total = data.transactionsTotal == null ? data.transactions.length : data.transactionsTotal;
    if (offset) loadEntries(id, offset);
    else showEntries(id, data.transactions.slice(0, ENTRIES_PAGE), total, 0);
    qs('[data-sheet-prev]', customerModal).addEventListener('click', () => loadEntries(id, Math.max(0, acting.entriesOffset - ENTRIES_PAGE)));
    qs('[data-sheet-next]', customerModal).addEventListener('click', () => loadEntries(id, acting.entriesOffset + ENTRIES_PAGE));

    const paintInvestments = () => (!investOn() ? Promise.resolve(null) : api.get(`/admin/customers/${id}/investments`)).then((inv) => {
      if (!inv) return;
      const list = qs('[data-sheet-investments]', customerModal);
      if (!list) return;
      const holdings = inv.holdings.length ? inv.holdings.map((h) => `<li>
        <span class="t"><strong>${esc(h.units)} ${esc(h.symbol)}</strong><span>${esc(h.name)} &middot; cost ${money(h.costBasis)}</span></span>
        <span class="rf-nowrap"><strong>${h.value == null ? '&mdash;' : money(h.value)}</strong></span>
      </li>`).join('') + `<li class="rf-small"><span class="t"><strong>Total</strong></span><strong>${money(inv.totals.value)}</strong></li>` : '<li class="rf-muted rf-small">No investments.</li>';
      const trades = inv.trades.slice(0, 8).map((t) => `<li class="${t.status === 'reversed' ? 'is-reversed' : ''}">
        <span class="t"><strong>${t.side === 'buy' ? 'Bought' : 'Sold'} ${esc(t.units)} ${esc(t.symbol)} @ ${money(t.price)}</strong><span>${datetime(t.createdAt)} &middot; ${money(t.amount)}${t.bookedByStaff ? ' &middot; booked by staff' : ''}${t.status === 'reversed' ? ' &middot; <b>reversed</b>' : ''}${t.note ? ` &middot; ${esc(t.note)}` : ''}</span></span>
        ${t.status === 'reversed' ? '' : `<span class="rf-nowrap"><button class="rf-btn link sm" data-trade-time="${esc(t.id)}" data-trade-at="${esc(t.createdAt)}">Change time</button> <button class="rf-btn link sm" data-trade-reverse="${esc(t.id)}" data-trade-label="${esc(`${t.side === 'buy' ? 'Bought' : 'Sold'} ${t.units} ${t.symbol} for ${money(t.amount)}`)}">Reverse</button></span>`}
      </li>`).join('');
      list.innerHTML = `${holdings}
        <li class="hs-sheet-actions"><button class="rf-btn sm" data-book-trade>Book a conversion</button><span class="rf-small rf-muted">For walk-ins, or instructions taken while the network was down.</span></li>
        ${trades ? `<li class="rf-label" style="border:0;padding-bottom:0">Conversions</li>${trades}` : ''}`;
    }).catch(() => {
      const list = qs('[data-sheet-investments]', customerModal);
      if (list) list.innerHTML = '<li class="rf-muted rf-small">Could not load investments.</li>';
    });
    paintInvestments();
    acting.paintInvestments = paintInvestments;
    acting.customerData = data;

    wireCustomerSheet(c, data);
  }

  function wireCustomerSheet(customer, data) {
    const root = customerModal;

    qsa('[data-adjust]', root).forEach((button) => button.addEventListener('click', () => {
      openAdjust(button.getAttribute('data-adjust'), button.getAttribute('data-account-label'), customer.id);
    }));

    qsa('[data-account-status]', root).forEach((button) => button.addEventListener('click', async () => {
      const id = button.getAttribute('data-account-status');
      const next = button.getAttribute('data-current') === 'active' ? 'frozen' : 'active';
      try {
        await api.patch(`/admin/accounts/${id}`, { status: next });
        toast(`Account ${next}.`, 'ok');
        openCustomer(customer.id);
      } catch (err) { toast(err.message, 'bad'); }
    }));

    const ssnButton = qs('[data-reveal-ssn]', root);
    if (ssnButton) {
      ssnButton.addEventListener('click', async () => {
        if (!confirm('Viewing a full Social Security number is recorded against your name. Continue?')) return;
        try {
          const res = await api.post(`/admin/customers/${customer.id}/ssn`);
          ssnButton.previousSibling.textContent = `${res.ssn} `;
          ssnButton.remove();
        } catch (err) { toast(err.message, 'bad'); }
      });
    }

    qsa('[data-verify-beneficiary]', root).forEach((button) => button.addEventListener('click', async () => {
      try {
        await api.post(`/admin/beneficiaries/${button.getAttribute('data-verify-beneficiary')}/review`, { status: 'verified' });
        toast('Recipient verified.', 'ok');
        openCustomer(customer.id);
      } catch (err) { toast(err.message, 'bad'); }
    }));

    const openAccountModal = qs('[data-account-modal]');
    qsa('[data-open-account]', root).forEach((button) => button.addEventListener('click', () => {
      acting.customerId = customer.id;
      RF.modal.open(openAccountModal);
    }));

    qsa('[data-customer-action]', root).forEach((button) => button.addEventListener('click', async () => {
      const action = button.getAttribute('data-customer-action');
      const id = button.getAttribute('data-id');
      try {
        if (action === 'password') {
          const res = await api.post(`/admin/customers/${id}/password`, {});
          prompt('Temporary password (also emailed to the customer):', res.temporaryPassword);
          toast('Temporary password issued and every session signed out.', 'ok');
        } else if (action === 'unlock') {
          await api.post(`/admin/customers/${id}/unlock`);
          toast('Lockout cleared.', 'ok');
        } else if (action === 'kyc') {
          const status = prompt('Identity status: pending, review, verified or rejected', customer.kycStatus);
          if (!status) return;
          await api.post(`/admin/customers/${id}/kyc`, { kycStatus: status, notes: prompt('Note (optional):') || '' });
          toast('Identity status updated.', 'ok');
        } else if (action === 'suspend') {
          const reason = prompt('Why is this account being suspended? The customer is told.');
          if (reason == null) return;
          await api.post(`/admin/customers/${id}/status`, { status: 'suspended', reason });
          toast('Account suspended and sessions ended.', 'ok');
        } else if (action === 'activate') {
          await api.post(`/admin/customers/${id}/status`, { status: 'active' });
          toast('Account reactivated.', 'ok');
        } else if (action === 'edit') {
          editCustomer(customer);
          return;
        }
        openCustomer(id);
      } catch (err) { toast(err.message, 'bad'); }
    }));
  }

  /** Edit the details a customer cannot change themselves. */
  function editCustomer(customer) {
    const fields = [
      ['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'],
      ['phone', 'Phone'], ['dateOfBirth', 'Date of birth (YYYY-MM-DD)'],
      ['addressLine1', 'Address line 1'], ['addressLine2', 'Address line 2'],
      ['city', 'City'], ['state', 'State'], ['postalCode', 'ZIP'],
      ['employer', 'Employer'], ['occupation', 'Occupation'], ['tier', 'Tier'],
      ['relationshipManager', 'Relationship manager'], ['notes', 'Internal notes'],
    ];
    const el = document.createElement('div');
    el.className = 'rf-modal-backdrop';
    el.innerHTML = `
      <div class="rf-modal">
        <div class="rf-modal-head"><h3>Edit ${esc(customer.fullName)}</h3><button type="button" data-close aria-label="Close">&times;</button></div>
        <form>
          <div class="rf-modal-body">
            <div class="rf-row">
              ${fields.map(([name, label]) => `<div class="rf-field"><label>${esc(label)}</label><input class="rf-input" name="${name}" value="${esc(customer[name] || '')}" /></div>`).join('')}
            </div>
            <div class="rf-field"><label>Social Security number (leave blank to keep)</label><input class="rf-input mono" name="ssn" placeholder="${esc(customer.ssnMasked || '')}" /></div>
            <div class="rf-notice bad rf-hide" data-form-error></div>
          </div>
          <div class="rf-modal-foot">
            <button class="rf-btn ghost" type="button" data-close>Cancel</button>
            <button class="rf-btn" type="submit" data-submit>Save changes</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    qsa('[data-close]', el).forEach((b) => b.addEventListener('click', close));
    onSubmit(qs('form', el), async (values) => {
      await api.patch(`/admin/customers/${customer.id}`, values);
      toast('Customer updated. They have been emailed a confirmation.', 'ok');
      close();
      openCustomer(customer.id);
    });
  }

  /* --------------------------------------------- back-posting and edits -- */

  /** A one-off modal on top of the customer sheet. */
  function staffSheet(title, body, submitLabel) {
    const el = document.createElement('div');
    el.className = 'rf-modal-backdrop hs-stacked';
    el.innerHTML = `<div class="rf-modal">
      <div class="rf-modal-head"><h3>${esc(title)}</h3><button type="button" data-close-sheet aria-label="Close">&times;</button></div>
      <form novalidate>
        <div class="rf-modal-body">${body}<div class="rf-notice bad rf-hide" data-form-error></div></div>
        <div class="rf-modal-foot"><button class="rf-btn ghost" type="button" data-close-sheet>Cancel</button><button class="rf-btn" type="submit" data-submit>${esc(submitLabel)}</button></div>
      </form>
    </div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    qsa('[data-close-sheet]', el).forEach((b) => b.addEventListener('click', close));
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    return { el, form: qs('form', el), close };
  }

  const localDate = (iso) => { const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const localTime = (iso) => { const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}`; };
  const whenFields = (iso, hint) => `<div class="rf-row">
      <div class="rf-field"><label>Date</label><input class="rf-input" type="date" name="date" value="${iso ? localDate(iso) : ''}" max="${localDate(new Date().toISOString())}" /></div>
      <div class="rf-field"><label>Time</label><input class="rf-input" type="time" name="time" value="${iso ? localTime(iso) : ''}" step="60" /></div>
    </div>${hint ? `<p class="rf-small rf-muted" style="margin-top:-6px">${hint}</p>` : ''}`;

  document.addEventListener('click', async (event) => {
    /* Edit an entry: when, how much, what it says. */
    const editBtn = event.target.closest('[data-edit-tx]');
    if (editBtn) {
      event.preventDefault();
      const tx = (acting.entries || []).find((t) => t.id === editBtn.getAttribute('data-edit-tx'));
      if (!tx) return;
      const isTrade = tx.method === 'investment';
      const { form, close } = staffSheet('Edit entry', `
        <p class="rf-small rf-muted">${esc(tx.reference || '')} &middot; ${esc(tx.accountName || '')} &middot; ${badge(tx.status)}</p>
        <div class="rf-field"><label>Description on the statement</label><input class="rf-input" name="description" value="${esc(tx.description)}" maxlength="140" /></div>
        ${whenFields(tx.date, 'Moving an entry restates the running balances after it. The account balance itself does not change.')}
        <div class="rf-row">
          <div class="rf-field"><label>Amount</label><input class="rf-input money" name="amount" value="${(tx.amount / 100).toFixed(2)}" inputmode="decimal" ${tx.status !== 'posted' || isTrade ? 'disabled' : ''} />
            <div class="hint">${isTrade ? 'A conversion is corrected by reversing it and booking it again.' : tx.status !== 'posted' ? 'Post it first to change the amount.' : 'The balance moves by the difference.'}</div></div>
          <div class="rf-field"><label>Category</label><input class="rf-input" name="category" value="${esc(tx.category || '')}" /></div>
        </div>
        <div class="rf-field"><label>Memo shown to the customer</label><input class="rf-input" name="memo" value="${esc(tx.memo || '')}" /></div>
        <div class="rf-field"><label>Internal note (why)</label><input class="rf-input" name="note" placeholder="Walk-in at branch 2; slip #4471" /></div>`, 'Save changes');
      onSubmit(form, async (values) => {
        const body = { description: values.description, category: values.category, memo: values.memo, note: values.note };
        const when = whenOf(values.date, values.time);
        if (when && when !== new Date(tx.date).toISOString() && localDate(when) + localTime(when) !== localDate(tx.date) + localTime(tx.date)) body.date = when;
        if (values.amount !== undefined && Math.round(Number(String(values.amount).replace(/[^0-9.]/g, '')) * 100) !== tx.amount) body.amount = values.amount;
        await api.patch(`/admin/transactions/${tx.id}`, body);
        close();
        toast('Entry updated.', 'ok');
        openCustomer(acting.customerId);
      });
      return;
    }

    /* Book a conversion or sale for the customer, at a price and time. */
    if (event.target.closest('[data-book-trade]')) {
      event.preventDefault();
      const data = acting.customerData;
      const accounts = data.accounts.filter((a) => !a.isCredit && a.status === 'active');
      if (!accounts.length) { toast('This customer has no active checking or savings account.', 'bad'); return; }
      let assets = [];
      try { assets = (await api.get('/markets')).assets; } catch (err) { assets = []; }
      const { el, form, close } = staffSheet('Book a conversion', `
        <div class="rf-segment rf-mb" data-side><button type="button" class="is-active" data-side-value="buy">Convert cash to an asset</button><button type="button" data-side-value="sell">Sell an asset to cash</button></div>
        <input type="hidden" name="side" value="buy" />
        <div class="rf-row">
          <div class="rf-field"><label>Account</label><select class="rf-select" name="accountId">${accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.nickname || a.name)} ${esc(a.accountMask)} - ${money(a.availableBalance)}</option>`).join('')}</select></div>
          <div class="rf-field"><label>Asset</label><select class="rf-select" name="symbol">${assets.map((a) => `<option value="${esc(a.symbol)}" data-price="${a.quote ? a.quote.price : ''}" data-decimals="${a.decimals}">${esc(a.name)} (${esc(a.symbol)})</option>`).join('')}</select></div>
        </div>
        <div class="rf-row">
          <div class="rf-field" data-buy-only><label>Cash amount</label><input class="rf-input money" name="amount" inputmode="decimal" placeholder="0.00" /></div>
          <div class="rf-field" data-sell-only hidden><label>Units to sell</label><input class="rf-input money" name="units" inputmode="decimal" placeholder="0" /></div>
          <div class="rf-field"><label>Price per unit</label><input class="rf-input money" name="price" inputmode="decimal" /><div class="hint" data-live-hint></div></div>
        </div>
        ${whenFields('', 'Leave blank for now. Set it to the time the customer gave the instruction.')}
        <div class="rf-field"><label>Note (why it was booked by staff)</label><input class="rf-input" name="note" placeholder="Walk-in at branch 2" /></div>
        <div class="hs-preview" data-book-preview></div>`, 'Book it');
      const sideInput = qs('[name="side"]', form);
      const symbol = qs('[name="symbol"]', form);
      const price = qs('[name="price"]', form);
      const fillPrice = () => {
        const live = symbol.selectedOptions[0] && symbol.selectedOptions[0].getAttribute('data-price');
        price.value = live || '';
        qs('[data-live-hint]', form).textContent = live ? `Live price $${Number(live).toFixed(2)}. Change it to the agreed price.` : 'No live price: enter the agreed price.';
        preview();
      };
      const preview = () => {
        const p = Number(String(price.value).replace(/[^0-9.]/g, ''));
        const out = qs('[data-book-preview]', form);
        if (sideInput.value === 'buy') {
          const amt = Number(String(qs('[name="amount"]', form).value).replace(/[^0-9.]/g, ''));
          const dp = Number(symbol.selectedOptions[0] && symbol.selectedOptions[0].getAttribute('data-decimals')) || 6;
          out.innerHTML = p > 0 && amt > 0 ? `<div><span>Units</span><strong>${(Math.floor((amt / p) * 10 ** dp) / 10 ** dp).toLocaleString('en-US', { maximumFractionDigits: dp })} ${esc(symbol.value)}</strong></div>` : '';
        } else {
          const u = Number(String(qs('[name="units"]', form).value).replace(/[^0-9.]/g, ''));
          out.innerHTML = p > 0 && u > 0 ? `<div><span>Proceeds</span><strong>${money(Math.floor(u * p * 100))}</strong></div>` : '';
        }
      };
      qsa('[data-side-value]', el).forEach((b) => b.addEventListener('click', () => {
        qsa('[data-side-value]', el).forEach((x) => x.classList.toggle('is-active', x === b));
        sideInput.value = b.getAttribute('data-side-value');
        qs('[data-buy-only]', form).hidden = sideInput.value !== 'buy';
        qs('[data-sell-only]', form).hidden = sideInput.value !== 'sell';
        preview();
      }));
      symbol.addEventListener('change', fillPrice);
      ['amount', 'units', 'price'].forEach((n) => qs(`[name="${n}"]`, form).addEventListener('input', preview));
      fillPrice();
      onSubmit(form, async (values) => {
        const body = { customerId: acting.customerId, side: values.side, accountId: values.accountId, symbol: values.symbol, price: values.price, note: values.note, date: whenOf(values.date, values.time) || undefined };
        if (values.side === 'sell') body.units = values.units; else body.amount = values.amount;
        const res = await api.post('/admin/trades', body);
        close();
        toast(`${res.trade.side === 'buy' ? 'Booked' : 'Sold'} ${res.trade.units} ${res.trade.symbol} at ${money(res.trade.price)}.`, 'ok');
        openCustomer(acting.customerId);
      });
      return;
    }

    /* Move a conversion to when it really happened. */
    const timeBtn = event.target.closest('[data-trade-time]');
    if (timeBtn) {
      event.preventDefault();
      const { form, close } = staffSheet('Change the time of this conversion', `
        ${whenFields(timeBtn.getAttribute('data-trade-at'), 'Its ledger entry moves with it, and the running balances are restated.')}
        <div class="rf-field"><label>Reason</label><input class="rf-input" name="note" placeholder="Instruction taken by phone during the outage" /></div>`, 'Save time');
      onSubmit(form, async (values) => {
        const when = whenOf(values.date, values.time);
        if (!when) throw new Error('Enter a date and time.');
        await api.patch(`/admin/trades/${timeBtn.getAttribute('data-trade-time')}`, { date: when, note: values.note });
        close();
        toast('Conversion re-timed.', 'ok');
        openCustomer(acting.customerId);
      });
      return;
    }

    /* Undo a conversion completely. */
    const revBtn = event.target.closest('[data-trade-reverse]');
    if (revBtn) {
      event.preventDefault();
      const note = prompt(`Reverse this conversion?\n\n${revBtn.getAttribute('data-trade-label')}\n\nThe units come off the holding and the cash goes back. Why? (the customer sees this)`);
      if (note == null) return;
      try {
        await api.post(`/admin/trades/${revBtn.getAttribute('data-trade-reverse')}/reverse`, { note });
        toast('Conversion reversed.', 'ok');
        openCustomer(acting.customerId);
      } catch (err) { toast(err.message, 'bad'); }
    }
  });

  /* ------------------------------------------------------------- entries -- */

  /**
   * The entry desk: one account in hand, one entry at a time.
   *
   * A balance adjustment is the console's most-used control and was its
   * slowest: a modal reached through the customer sheet, eleven fields, every
   * one of them typed. The work it stands for is repetitive - a counter
   * deposit, a correction keyed from a slip - so the cost of each keystroke is
   * paid many times over in a shift.
   *
   * So the fields that can be guessed are guessed (the category and the
   * wording follow the method), the figures a teller reaches for are buttons,
   * the value date is a row of chips, and the account stays in hand after a
   * post so the next entry starts at the amount. Nothing here is new ledger
   * behaviour: it is the same single POST per entry, with the same validation
   * behind it. Only the typing is gone.
   */

  /**
   * What each method is usually for, and how it is usually worded.
   *
   * Keyed on the method ids in src/bank/constants.js, so a method added there
   * simply arrives without a suggestion rather than with a wrong one. The
   * wordings are the standard narratives a statement carries; they are a
   * starting point for the description, not a substitute for it, and staff
   * overwrite them the moment they type.
   */
  const NARRATIVES = {
    ach: {
      category: 'Transfers',
      credit: ['ACH CREDIT - PAYROLL', 'ACH CREDIT - VENDOR PAYMENT', 'ACH CREDIT - TAX REFUND'],
      debit: ['ACH DEBIT - LOAN PAYMENT', 'ACH DEBIT - INSURANCE PREMIUM', 'ACH DEBIT - UTILITY BILL'],
    },
    direct_deposit: {
      category: 'Income',
      credit: ['DIRECT DEPOSIT - PAYROLL', 'DIRECT DEPOSIT - PENSION', 'DIRECT DEPOSIT - BENEFITS'],
      debit: ['DIRECT DEPOSIT REVERSAL'],
    },
    wire_domestic: {
      category: 'Transfers',
      credit: ['WIRE IN - CUSTOMER FUNDS', 'WIRE IN - SETTLEMENT PROCEEDS', 'WIRE IN - BUSINESS RECEIPT'],
      debit: ['WIRE OUT - BENEFICIARY PAYMENT', 'WIRE OUT - SUPPLIER SETTLEMENT'],
    },
    wire_international: {
      category: 'Transfers',
      credit: ['INTERNATIONAL WIRE IN - CUSTOMER FUNDS', 'INTERNATIONAL WIRE IN - SETTLEMENT'],
      debit: ['INTERNATIONAL WIRE OUT - BENEFICIARY PAYMENT'],
    },
    check: {
      category: 'Other',
      credit: ['CHECK DEPOSIT - COUNTER', 'CHECK DEPOSIT'],
      debit: ['CHECK PAID - COUNTER', 'CHECK PAID'],
    },
    mobile_deposit: {
      category: 'Other',
      credit: ['MOBILE CHECK DEPOSIT'],
      debit: ['MOBILE DEPOSIT RETURNED - UNPAID ITEM'],
    },
    atm: {
      category: 'Cash & ATM',
      credit: ['ATM DEPOSIT', 'CASH DEPOSIT - BRANCH COUNTER'],
      debit: ['ATM WITHDRAWAL', 'CASH WITHDRAWAL - BRANCH COUNTER'],
    },
    card: {
      category: 'Shopping',
      credit: ['CARD REFUND'],
      debit: ['CARD PURCHASE'],
    },
    bill_pay: {
      category: 'Utilities',
      credit: ['BILL PAYMENT RETURNED'],
      debit: ['BILL PAYMENT'],
    },
    internal: { category: 'Transfers', credit: ['TRANSFER IN - OWN ACCOUNT'], debit: ['TRANSFER OUT - OWN ACCOUNT'] },
    member: { category: 'Transfers', credit: ['SMB TRANSFER IN'], debit: ['SMB TRANSFER OUT'] },
    instant: { category: 'Transfers', credit: ['INSTANT SEND RECEIVED'], debit: ['INSTANT SEND'] },
    fee: {
      category: 'Fees & Interest',
      credit: ['FEE REFUNDED'],
      debit: ['MONTHLY MAINTENANCE FEE', 'OVERDRAFT FEE', 'WIRE TRANSFER FEE', 'RETURNED ITEM FEE'],
    },
    interest: { category: 'Fees & Interest', credit: ['INTEREST PAID'], debit: ['INTEREST CHARGED'] },
    refund: { category: 'Shopping', credit: ['REFUND RECEIVED'], debit: ['REFUND REVERSED'] },
    adjustment: {
      category: 'Other',
      credit: ['ADJUSTMENT - CREDIT APPLIED', 'ADJUSTMENT - FEE REFUNDED', 'ADJUSTMENT - ERROR CORRECTED'],
      debit: ['ADJUSTMENT - DEBIT APPLIED', 'ADJUSTMENT - ERROR CORRECTED'],
    },
  };

  async function entries() {
    const panel = qs('[data-panel="entries"]');
    const form = qs('#rf-entry-form', panel);
    const foot = qs('[data-entry-foot]', panel);
    const picker = qs('[data-entry-picker]', panel);
    const results = qs('[data-entry-results]', panel);
    const search = qs('#en-search', panel);
    const amount = qs('#en-amount', panel);
    const method = qs('#en-method', panel);
    const category = qs('#en-category', panel);
    const description = qs('#en-description', panel);
    const dirInput = qs('[data-entry-direction]', panel);
    const preview = qs('[data-entry-preview]', panel);
    const dateWrap = qs('[data-entry-datewrap]', panel);
    const dateInput = qs('#en-date', panel);
    const time = qs('#en-time', panel);
    const narratives = qs('[data-entry-narratives]', panel);

    // The account in hand, and what has been posted to it in this sitting.
    const desk = { customer: null, account: null, accounts: [], recent: [], posted: [] };
    // Once staff type their own wording, stop replacing it.
    let ownWording = false;

    /* -------------------------------------------------------- the account -- */

    async function find() {
      const q = search.value.trim();
      results.innerHTML = '<p class="rf-small rf-muted">Searching&hellip;</p>';
      const data = await api.get(`/admin/customers?q=${encodeURIComponent(q)}&limit=8`);
      if (!data.customers.length) {
        results.innerHTML = '<p class="rf-small rf-muted">Nobody matches that search.</p>';
        return;
      }
      results.innerHTML = data.customers.map((c) => `
        <button type="button" class="rf-entry-hit" data-entry-customer="${esc(c.id)}">
          <span class="rf-avatar sm">${c.photoUrl ? `<img src="${esc(c.photoUrl)}" alt="" />` : esc(c.initials)}</span>
          <span class="t"><strong>${esc(c.fullName)}</strong><span>${esc(c.email)} &middot; ${esc(c.customerNumber)}</span></span>
          <span class="rf-amt">${money(c.totalBalance)}</span>
        </button>`).join('');
    }

    async function pickCustomer(id) {
      const data = await api.get(`/admin/customers/${id}`);
      desk.customer = data.customer;
      desk.accounts = data.accounts;
      if (!desk.accounts.length) {
        results.innerHTML = '<p class="rf-small rf-muted">That customer has no accounts yet.</p>';
        return;
      }
      results.innerHTML = `
        <p class="rf-small rf-muted rf-mb">${esc(desk.customer.fullName)} &mdash; which account?</p>
        ${desk.accounts.map((a) => `
          <button type="button" class="rf-entry-hit" data-entry-account="${esc(a.id)}">
            <span class="t"><strong>${esc(a.nickname || a.name)}</strong><span>${esc(a.accountMask)} &middot; ${esc(a.typeLabel)}${a.status === 'active' ? '' : ` &middot; ${esc(a.status)}`}</span></span>
            <span class="rf-amt">${money(a.balance)}<span class="sub">${money(a.availableBalance)} avail.</span></span>
          </button>`).join('')}`;
    }

    function pickAccount(id) {
      const account = desk.accounts.find((a) => a.id === id);
      if (!account) return;
      desk.account = account;
      qs('[data-entry-target]', panel).innerHTML = `${esc(desk.customer.fullName)} &middot; ${esc(account.nickname || account.name)} ${esc(account.accountMask)} &middot; ${money(account.balance)}`;
      picker.classList.add('rf-hide');
      form.classList.remove('rf-hide');
      foot.classList.remove('rf-hide');
      genCard.classList.remove('rf-hide');
      applyMethod();
      drawPreview();
      renderRecent();
      amount.focus();
    }

    function reset() {
      if (gen.running) gen.cancel = true;
      desk.account = null;
      genCard.classList.add('rf-hide');
      form.classList.add('rf-hide');
      foot.classList.add('rf-hide');
      picker.classList.remove('rf-hide');
      qs('[data-entry-target]', panel).textContent = 'Pick an account to start';
      qs('[data-entry-recent]', panel).innerHTML = '<li class="rf-muted rf-small">Pick an account to see its entries.</li>';
      search.value = '';
      results.innerHTML = '';
      search.focus();
    }

    /* --------------------------------------------------------- the figures -- */

    /** The amount box as cents, however it has been typed. */
    function cents() {
      const n = Number(String(amount.value).replace(/[^0-9.]/g, ''));
      return Number.isFinite(n) ? Math.round(n * 100) : 0;
    }

    function setCents(value) {
      amount.value = value > 0 ? (value / 100).toFixed(2) : '';
      drawPreview();
    }

    const direction = () => dirInput.value;

    /**
     * What the balance will be, before anything is posted.
     *
     * The figure staff are checking against is the one on the slip in front of
     * them, so it is shown at the size of a balance rather than a hint, and a
     * debit that runs past the available funds says so here rather than in a
     * server error after the submit.
     */
    function drawPreview() {
      const value = cents();
      if (!desk.account || !value) { preview.hidden = true; return; }
      const sign = direction() === 'credit' ? 1 : -1;
      const after = Number(desk.account.balance) + sign * value;
      const over = direction() === 'debit' && value > Number(desk.account.availableBalance || 0);
      preview.hidden = false;
      preview.className = `rf-entry-preview ${direction()}`;
      preview.innerHTML = `
        <span class="k">Balance after</span>
        <span class="v">${money(after)}</span>
        <span class="d">${money(desk.account.balance)} ${direction() === 'credit' ? '+' : '&minus;'} ${money(value)}${over ? ' &middot; past the available funds' : ''}</span>`;
      preview.classList.toggle('warn', over);
    }

    /** The method decides the category and offers the standard wordings. */
    function applyMethod() {
      const spec = NARRATIVES[method.value];
      if (!spec) { narratives.innerHTML = ''; return; }
      const list = spec[direction()] || [];
      narratives.innerHTML = list.map((n) => `<option value="${esc(n)}"></option>`).join('');
      if (!ownWording) description.value = list[0] || '';
      if (Array.from(category.options).some((o) => o.value === spec.category)) category.value = spec.category;
    }

    /* ------------------------------------------------------ the value date -- */

    /** The chips and the calendar write to one field; empty means now. */
    function setDate(when) {
      dateInput.value = when
        ? `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`
        : '';
      if (!when) time.value = '';
      showBackdated();
    }

    /** The notice follows the field, however the date got there. */
    function showBackdated() {
      qs('[data-entry-backdated]', panel).classList.toggle('rf-hide', !dateInput.value);
    }

    qsa('[data-entry-when] [data-when]', panel).forEach((chip) => chip.addEventListener('click', () => {
      qsa('[data-entry-when] [data-when]', panel).forEach((c) => c.classList.toggle('is-on', c === chip));
      const choice = chip.getAttribute('data-when');
      // The calendar stays open from here on once it has been asked for: a
      // chip that lands near the date wanted is usually a click away from it.
      dateWrap.classList.toggle('rf-hide', choice === 'now');
      if (choice === 'now') { setDate(null); return; }
      if (choice === 'pick') {
        // Nothing is assumed: an empty field is still "now" until a date is
        // actually chosen, and the grid opens on this month either way.
        showBackdated();
        dateInput.focus();
        if (dateInput.showPicker) { try { dateInput.showPicker(); } catch (err) { /* needs a gesture it did not get */ } }
        return;
      }
      const when = new Date();
      when.setDate(when.getDate() - Number(choice));
      setDate(when);
      if (!time.value) time.value = '12:00';
    }));

    /* ---------------------------------------------------------- the entries -- */

    /** Every entry on this account, newest first, with its corrections to hand. */
    async function renderRecent() {
      const list = qs('[data-entry-recent]', panel);
      if (!desk.account) return;
      list.innerHTML = '<li class="rf-muted rf-small">Loading&hellip;</li>';
      const data = await api.get(`/admin/customers/${desk.customer.id}`);
      desk.accounts = data.accounts;
      desk.account = data.accounts.find((a) => a.id === desk.account.id) || desk.account;
      // A correction, reversal or delete moves the balance too; keep the line above the form current.
      qs('[data-entry-target]', panel).innerHTML = `${esc(desk.customer.fullName)} &middot; ${esc(desk.account.nickname || desk.account.name)} ${esc(desk.account.accountMask)} &middot; ${money(desk.account.balance)}`;
      desk.recent = data.transactions.filter((t) => t.accountId === desk.account.id).slice(0, 12);
      list.innerHTML = desk.recent.length ? desk.recent.map(entryRow).join('') : '<li class="rf-muted rf-small">No entries on this account yet.</li>';
      drawPreview();
    }

    function entryRow(t) {
      const settled = t.status === 'posted';
      return `<li>
        <span class="t">
          <strong>${esc(t.description)}</strong>
          <span>${datetime(t.date)} &middot; ${esc(t.methodLabel)} &middot; ${esc(t.reference)}${t.createdBy === 'admin' ? ' &middot; by staff' : ''}</span>
        </span>
        <span class="rf-entry-row-end">
          <span class="rf-amt ${t.direction}">${t.direction === 'credit' ? '+' : '&minus;'}${money(t.amount)}</span>
          ${t.status === 'posted' ? '' : badge(t.status)}
          <span class="rf-inline">
            <button class="rf-btn ghost sm" type="button" data-correct="${esc(t.id)}">Correct</button>
            ${settled || t.status === 'pending' ? `<button class="rf-btn ghost sm" type="button" data-reverse="${esc(t.id)}">Reverse</button>` : ''}
            ${t.method === 'investment' ? '' : `<button class="rf-btn ghost sm hs-del" type="button" data-delete="${esc(t.id)}">Delete</button>`}
          </span>
        </span>
      </li>`;
    }

    /**
     * What this sitting has posted, newest first.
     *
     * The recent list below it is in value date order, so a back-posted entry
     * sinks into the middle of it the moment it is written - and the entry
     * most likely to need a correction is the one just keyed. This card keeps
     * it to hand with both corrections on it.
     */
    function renderPosted() {
      const card = qs('[data-entry-session-card]', panel);
      const list = qs('[data-entry-session]', panel);
      card.classList.toggle('rf-hide', !desk.posted.length);
      list.innerHTML = desk.posted.map((t) => `<li>
        <span class="t"><strong>${esc(t.description)}</strong><span>${datetime(t.date)} &middot; ${esc(t.reference)}</span></span>
        <span class="rf-entry-row-end">
          <span class="rf-amt ${t.direction}">${t.direction === 'credit' ? '+' : '&minus;'}${money(t.amount)}</span>
          <span class="rf-inline">
            <button class="rf-btn ghost sm" type="button" data-correct="${esc(t.id)}">Correct</button>
            <button class="rf-btn ghost sm" type="button" data-reverse="${esc(t.id)}">Reverse</button>
            <button class="rf-btn ghost sm hs-del" type="button" data-delete="${esc(t.id)}">Delete</button>
          </span>
        </span>
      </li>`).join('');
    }

    /* ------------------------------------------------------------ the post -- */

    onSubmit(form, async (values) => {
      if (!desk.account) throw new Error('Pick an account first.');
      values.date = whenOf(values.date, values.time);
      delete values.time;
      const res = await api.post(`/admin/accounts/${desk.account.id}/adjust`, values);
      desk.account = res.account;
      desk.posted.unshift(res.transaction);
      renderPosted();
      toast(`${res.transaction.direction === 'credit' ? 'Credited' : 'Debited'} ${money(res.transaction.amount)}. New balance ${money(res.account.balance)}.`, 'ok');

      // The account stays in hand: a shift posts several entries to the same
      // one, so only what changes between them is cleared.
      amount.value = '';
      qs('#en-note', form).value = '';
      qs('#en-memo', form).value = '';
      qs('#en-check', form).value = '';
      ownWording = false;
      applyMethod();
      qs('[data-entry-target]', panel).innerHTML = `${esc(desk.customer.fullName)} &middot; ${esc(desk.account.nickname || desk.account.name)} ${esc(desk.account.accountMask)} &middot; ${money(desk.account.balance)}`;
      drawPreview();
      await renderRecent();
      amount.focus();
    });

    /* ---------------------------------------------------- auto-generating -- */

    const genCard = qs('[data-entry-gen-card]', panel);
    const genForm = qs('#rf-entry-gen', panel);
    const genSubmit = qs('[data-gen-submit]', panel);
    const genCancel = qs('[data-gen-cancel]', panel);
    const genError = qs('[data-gen-error]', panel);
    const genProgress = qs('[data-gen-progress]', panel);
    const genBar = qs('progress', genProgress);
    const genStatus = qs('[data-gen-status]', panel);
    const genEstimate = qs('[data-gen-estimate]', panel);
    const gen = { running: false, cancel: false };
    const GEN_LIMIT = 200;

    const MERCHANTS = {
      Groceries: ['WHOLE FOODS MARKET', 'TRADER JOES', 'KROGER', 'SAFEWAY', 'COSTCO WHSE'],
      Dining: ['STARBUCKS', 'CHIPOTLE', 'PANERA BREAD', 'SHAKE SHACK', 'DOORDASH'],
      Fuel: ['SHELL OIL', 'CHEVRON', 'EXXONMOBIL', 'BP'],
      Transport: ['UBER TRIP', 'LYFT RIDE', 'METRO TRANSIT'],
      Shopping: ['AMAZON.COM', 'TARGET', 'WALMART', 'BEST BUY', 'HOME DEPOT'],
      Entertainment: ['AMC THEATRES', 'TICKETMASTER', 'STEAM GAMES'],
      Subscriptions: ['NETFLIX.COM', 'SPOTIFY', 'APPLE.COM/BILL', 'ADOBE'],
      Healthcare: ['CVS PHARMACY', 'WALGREENS'],
    };
    const BILLERS = [
      ['CON EDISON', 'Utilities'], ['VERIZON WIRELESS', 'Utilities'], ['COMCAST XFINITY', 'Utilities'],
      ['STATE FARM INSURANCE', 'Insurance'], ['GEICO', 'Insurance'], ['PROPERTY MGMT RENT', 'Rent & Mortgage'],
    ];
    const CREDIT_MIX = [['direct_deposit', 3], ['ach', 2], ['mobile_deposit', 2], ['instant', 2], ['atm', 1], ['wire_domestic', 1], ['internal', 1]];
    const DEBIT_MIX = [['card', 7], ['atm', 2], ['bill_pay', 2], ['ach', 1], ['instant', 1], ['check', 1]];

    const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const weighted = (pairs) => {
      let roll = Math.random() * pairs.reduce((s, [, w]) => s + w, 0);
      for (const [value, w] of pairs) { roll -= w; if (roll < 0) return value; }
      return pairs[pairs.length - 1][0];
    };
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    function genParams() {
      const f = genForm.elements;
      const typed = Number(String(f.amount.value || '').replace(/[$,\s]/g, ''));
      return {
        start: f.start.value, end: f.end.value,
        cents: Number.isFinite(typed) && typed > 0 ? Math.round(typed * 100) : 0,
        noOverdraft: true,
      };
    }

    function genDays(p) {
      if (!p.start || !p.end) return [];
      const from = new Date(`${p.start}T00:00`);
      const to = new Date(`${p.end}T00:00`);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];
      const last = to > today ? today : to;
      const days = [];
      for (const d = new Date(from); d <= last && days.length < 3660; d.setDate(d.getDate() + 1)) days.push(new Date(d));
      return days;
    }

    function drawEstimate() {
      const p = genParams();
      const days = genDays(p);
      if (!days.length) { genEstimate.textContent = 'Pick a start date on or before the end date.'; return; }
      const raw = Math.round(days.length * 1.5);
      const est = Math.min(Math.max(2, raw), GEN_LIMIT);
      const total = p.cents ? ` adding up to ${money(p.cents)}` : ' \u00b7 enter a total amount';
      genEstimate.textContent = `${days.length} day${days.length === 1 ? '' : 's'} \u00b7 about ${est} entr${est === 1 ? 'y' : 'ies'}${total}${raw > GEN_LIMIT ? ` (max ${GEN_LIMIT} per run, spread across the range)` : ''}.`;
    }

    function genWording(dir) {
      const m = weighted(dir === 'credit' ? CREDIT_MIX : DEBIT_MIX);
      const spec = NARRATIVES[m] || { category: 'Other', credit: ['Deposit'], debit: ['Withdrawal'] };
      if (dir === 'debit' && m === 'card') {
        const cat = pick(Object.keys(MERCHANTS));
        const merchant = pick(MERCHANTS[cat]);
        return { method: m, category: cat, description: `CARD PURCHASE - ${merchant}`, counterpartyName: merchant };
      }
      if (dir === 'debit' && m === 'bill_pay') {
        const [payee, cat] = pick(BILLERS);
        return { method: m, category: cat, description: `BILL PAYMENT - ${payee}`, counterpartyName: payee };
      }
      return { method: m, category: dir === 'credit' && m === 'direct_deposit' ? 'Income' : spec.category, description: pick(spec[dir]) };
    }

    /** The whole run, planned up front so it can be counted and posted in order. */
    function genPlan(p) {
      return openingPlan(p.cents, p.start, p.end);
    }

    function genBusy(on) {
      gen.running = on;
      genSubmit.disabled = on;
      genCancel.classList.toggle('rf-hide', !on);
      genProgress.classList.toggle('rf-hide', !on && !genStatus.textContent);
      qsa('input, select', genForm).forEach((el) => { el.disabled = on; });
    }

    genForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (gen.running || !desk.account) return;
      genError.classList.add('rf-hide');
      const p = genParams();
      const fail = (message) => { genError.textContent = message; genError.classList.remove('rf-hide'); };
      if (!p.start || !p.end) return fail('Pick a start and an end date.');
      if (p.start > p.end) return fail('The start date must be on or before the end date.');
      if (p.start > ymd(new Date())) return fail('Entries cannot be dated in the future.');
      if (!p.cents) return fail('Enter the total amount the entries should add up to.');
      const plan = genPlan(p);
      if (!plan.length) return fail('No entries for that range. Try a wider range.');
      const account = desk.account;
      const label = `${account.nickname || account.name} ${account.accountMask}`;
      if (!window.confirm(`Post ${plan.length} generated entries to ${label} between ${p.start} and ${p.end}, adding up to ${money(p.cents)}?`)) return;

      const status = qs('#en-status', form).value === 'pending' ? 'pending' : 'posted';
      let balance = Number(account.availableBalance ?? account.balance) || 0;
      let posted = 0; let skipped = 0; let failed = 0; let lastError = '';
      gen.cancel = false;
      genStatus.textContent = '';
      genBar.max = plan.length;
      genBar.value = 0;
      genBusy(true);

      for (let i = 0; i < plan.length; i += 1) {
        if (gen.cancel) break;
        const item = plan[i];
        if (item.direction === 'debit' && p.noOverdraft && item.amount > balance) {
          if (balance >= 100) item.amount = randInt(100, balance);
          else { skipped += 1; genBar.value = i + 1; continue; }
        }
        const wording = genWording(item.direction);
        try {
          await api.post(`/admin/accounts/${account.id}/adjust`, {
            direction: item.direction,
            amount: (item.amount / 100).toFixed(2),
            method: wording.method,
            category: wording.category,
            description: wording.description,
            counterpartyName: wording.counterpartyName || '',
            status,
            date: item.when.toISOString(),
            note: `Auto-generated series ${p.start} to ${p.end}`,
            notify: false,
          });
          posted += 1;
          balance += item.direction === 'credit' ? item.amount : -item.amount;
        } catch (err) {
          failed += 1;
          lastError = err.message;
        }
        genBar.value = i + 1;
        genStatus.textContent = `Posted ${posted} of ${plan.length}${skipped ? ` \u00b7 ${skipped} skipped` : ''}${failed ? ` \u00b7 ${failed} failed` : ''}`;
      }

      const stopped = gen.cancel;
      genBusy(false);
      genStatus.textContent = `${stopped ? 'Stopped. ' : ''}Posted ${posted} of ${plan.length}${skipped ? ` \u00b7 ${skipped} skipped to avoid an overdraft` : ''}${failed ? ` \u00b7 ${failed} failed` : ''}.`;
      if (failed && lastError) fail(`Last error: ${lastError}`);
      toast(`Generated ${posted} entr${posted === 1 ? 'y' : 'ies'} on ${label}.`, failed ? 'bad' : 'ok');
      if (desk.account && desk.account.id === account.id) {
        await renderRecent().catch(() => {});
        qs('[data-entry-target]', panel).innerHTML = `${esc(desk.customer.fullName)} &middot; ${esc(desk.account.nickname || desk.account.name)} ${esc(desk.account.accountMask)} &middot; ${money(desk.account.balance)}`;
      }
    });

    genCancel.addEventListener('click', () => { gen.cancel = true; });
    genForm.addEventListener('input', drawEstimate);
    genForm.addEventListener('change', drawEstimate);
    (() => {
      const end = new Date();
      const start = new Date(); start.setDate(start.getDate() - 30);
      genForm.elements.start.value = ymd(start);
      genForm.elements.end.value = ymd(end);
      genForm.elements.start.max = ymd(end);
      genForm.elements.end.max = ymd(end);
      drawEstimate();
    })();

    /* ----------------------------------------------------------- the wiring -- */

    qs('[data-entry-find]', panel).addEventListener('click', () => find().catch((err) => toast(err.message, 'bad')));
    search.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      find().catch((err) => toast(err.message, 'bad'));
    });
    results.addEventListener('click', (event) => {
      const customer = event.target.closest('[data-entry-customer]');
      if (customer) { pickCustomer(customer.getAttribute('data-entry-customer')).catch((err) => toast(err.message, 'bad')); return; }
      const account = event.target.closest('[data-entry-account]');
      if (account) pickAccount(account.getAttribute('data-entry-account'));
    });
    qs('[data-entry-another]', panel).addEventListener('click', reset);
    qs('[data-entry-refresh]', panel).addEventListener('click', () => renderRecent().catch((err) => toast(err.message, 'bad')));

    qsa('[data-direction]', panel).forEach((button) => button.addEventListener('click', () => {
      qsa('[data-direction]', panel).forEach((b) => b.classList.toggle('is-on', b === button));
      dirInput.value = button.getAttribute('data-direction');
      applyMethod();
      drawPreview();
    }));

    qsa('[data-entry-steps] [data-step], [data-entry-steps] [data-round]', panel).forEach((chip) => chip.addEventListener('click', () => {
      const step = chip.getAttribute('data-step');
      const round = chip.getAttribute('data-round');
      if (step === 'clear') { setCents(0); amount.focus(); return; }
      if (round) {
        const to = Number(round);
        setCents(Math.ceil(cents() / to) * to);
      } else {
        setCents(cents() + Number(step));
      }
      amount.focus();
    }));

    amount.addEventListener('input', drawPreview);
    method.addEventListener('change', applyMethod);
    description.addEventListener('input', () => { ownWording = description.value.trim() !== ''; });
    // Typed or picked from the grid, the notice and the chips follow it: a
    // date chosen by hand is no longer "Now", whatever chip is lit.
    dateInput.addEventListener('change', () => {
      showBackdated();
      if (!dateInput.value) return;
      qsa('[data-entry-when] [data-when]', panel).forEach((c) => c.classList.toggle('is-on', c.getAttribute('data-when') === 'pick'));
      if (!time.value) time.value = '12:00';
    });

    // A long form with a submit button at the foot of a scrolling card: the
    // keyboard shortcut saves the reach back down to it.
    form.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });

    /* --------------------------------------------- correcting and reversing -- */

    panel.addEventListener('click', async (event) => {
      const correct = event.target.closest('[data-correct]');
      if (correct) {
        const id = correct.getAttribute('data-correct');
        const tx = desk.recent.find((t) => t.id === id) || desk.posted.find((t) => t.id === id);
        if (tx) openCorrect(tx, () => renderRecent().catch((err) => toast(err.message, 'bad')));
        return;
      }
      const del = event.target.closest('[data-delete]');
      if (del) {
        const id = del.getAttribute('data-delete');
        const tx = desk.recent.find((t) => t.id === id) || desk.posted.find((t) => t.id === id);
        if (!tx || !window.confirm(deleteWarning(tx))) return;
        try {
          const res = await api.del(`/admin/transactions/${id}`);
          toast('Entry deleted.', 'ok');
          desk.posted = desk.posted.filter((t) => !res.removed.includes(t.id));
          renderPosted();
          await renderRecent();
        } catch (err) { toast(err.message, 'bad'); }
        return;
      }
      const rev = event.target.closest('[data-reverse]');
      if (!rev) return;
      const note = window.prompt('Why is this entry being reversed? The customer reads this.');
      if (note === null) return;
      try {
        await api.post(`/admin/transactions/${rev.getAttribute('data-reverse')}/settle`, { action: 'reverse', note });
        toast('Entry reversed. The contra-entry is on the account.', 'ok');
        desk.posted = desk.posted.filter((t) => t.id !== rev.getAttribute('data-reverse'));
        renderPosted();
        await renderRecent();
      } catch (err) { toast(err.message, 'bad'); }
    });

    await Promise.resolve();
    search.focus();
  }

  /* -------------------------------------------------------- adjust modal -- */

  const adjustModal = qs('[data-adjust-modal]');
  RF.modal.wire(adjustModal);

  function openAdjust(accountId, label, customerId) {
    acting.accountId = accountId;
    acting.customerId = customerId || null;
    qs('[data-adjust-account]', adjustModal).textContent = `Posting to ${label}`;
    qs('#rf-adjust-form').reset();
    RF.modal.open(adjustModal);
    qs('#ad-amount').focus();
  }

  /** A value date and an optional time, read in the operator's own time zone. */
  function whenOf(dateValue, timeValue) {
    if (!dateValue) return '';
    const d = new Date(`${dateValue}T${timeValue || '12:00'}`);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }

  onSubmit(qs('#rf-adjust-form'), async (values) => {
    values.date = whenOf(values.date, values.time);
    delete values.time;
    const res = await api.post(`/admin/accounts/${acting.accountId}/adjust`, values);
    RF.modal.close(adjustModal);
    toast(`${res.transaction.direction === 'credit' ? 'Credited' : 'Debited'} ${money(res.transaction.amount)}. New balance ${money(res.account.balance)}.`, 'ok');
    if (acting.customerId) openCustomer(acting.customerId);
  });

  /* ------------------------------------------------------- correct modal -- */

  /**
   * Amend an entry that is already on the account.
   *
   * The wording, the category, the memo, the amount and the value date, each
   * going through the same PATCH the console has always used - which restates
   * the running balance behind it when the amount or the date moves. The
   * reverse button is here too, because deciding between a correction and a
   * reversal is one decision and it is made looking at the same entry.
   */

  const correctModal = qs('[data-correct-modal]');
  RF.modal.wire(correctModal);
  // What is being corrected, and what to run once it has been.
  const correcting = { id: null, after: null };

  function openCorrect(tx, after) {
    correcting.id = tx.id;
    correcting.after = after || null;
    qs('[data-correct-summary]', correctModal).innerHTML = `${esc(tx.description)} &middot; ${tx.direction === 'credit' ? 'credit' : 'debit'} of ${money(tx.amount)} &middot; ${esc(tx.reference)} &middot; valued ${datetime(tx.date)}`;
    const form = qs('#rf-correct-form');
    form.reset();
    qs('#co-description', form).value = tx.description || '';
    qs('#co-amount', form).value = (Number(tx.amount) / 100).toFixed(2);
    qs('#co-memo', form).value = tx.memo || '';

    // Only a posted entry's amount can move: a pending one has not reached the
    // balance yet, and a reversed one is already cancelled by its contra-entry,
    // so changing the figure would leave the pair not adding up. ledger.amend
    // refuses both; saying so here saves the round trip and explains the way out.
    const settled = tx.status === 'posted';
    const amountField = qs('#co-amount', form);
    amountField.disabled = !settled;
    qs('#co-amount', form).closest('.rf-field').querySelector('.hint').textContent = settled
      ? 'The balance moves by the difference.'
      : tx.status === 'pending'
        ? 'A pending entry has not reached the balance. Release or fail it first.'
        : 'This entry is reversed. Its contra-entry cancels it, so the figure cannot move.';

    // A reversed entry has nothing left to reverse.
    qs('[data-correct-reverse]', correctModal).hidden = tx.status === 'reversed';
    if (tx.category && Array.from(qs('#co-category', form).options).some((o) => o.value === tx.category)) {
      qs('#co-category', form).value = tx.category;
    }
    RF.modal.open(correctModal);
    qs('#co-description', form).focus();
  }

  onSubmit(qs('#rf-correct-form'), async (values) => {
    // An untouched date control sends nothing, which leaves the date as it is.
    values.date = whenOf(values.date, values.time);
    delete values.time;
    if (!values.date) delete values.date;
    await api.patch(`/admin/transactions/${correcting.id}`, values);
    RF.modal.close(correctModal);
    toast('Entry corrected.', 'ok');
    if (correcting.after) correcting.after();
  });

  qs('[data-correct-reverse]', correctModal).addEventListener('click', async () => {
    const note = window.prompt('Why is this entry being reversed? The customer reads this.');
    if (note === null) return;
    try {
      await api.post(`/admin/transactions/${correcting.id}/settle`, { action: 'reverse', note });
      RF.modal.close(correctModal);
      toast('Entry reversed. The contra-entry is on the account.', 'ok');
      if (correcting.after) correcting.after();
    } catch (err) { toast(err.message, 'bad'); }
  });

  /* -------------------------------------------------- open-account modal -- */

  const accountModal = qs('[data-account-modal]');
  RF.modal.wire(accountModal);
  onSubmit(qs('#rf-open-account-form'), async (values) => {
    const customerId = acting.customerId;
    const res = await api.post(`/admin/customers/${customerId}/accounts`, values);
    RF.modal.close(accountModal);
    toast(`${res.account.name} opened, ${res.account.accountMask}, with ${money(res.account.balance)}.`, 'ok');
    openCustomer(customerId);
  });

  /* ------------------------------------------------------------ register -- */

  function accountRow(index) {
    const products = (state.meta && state.meta.products) || [];
    return `
      <div class="rf-card rf-mb" data-account-row>
        <div class="rf-card-body tight">
          <div class="rf-row">
            <div class="rf-field">
              <label>Product</label>
              <select class="rf-select" data-field="productId">
                ${products.map((p) => `<option value="${esc(p.id)}"${index === 0 && p.id === 'everyday_checking' ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
              </select>
            </div>
            <div class="rf-field">
              <label>Opening balance</label>
              <input class="rf-input money" data-field="openingBalance" inputmode="decimal" placeholder="0.00" />
            </div>
          </div>
          <div class="rf-row">
            <div class="rf-field"><label>Nickname</label><input class="rf-input" data-field="nickname" /></div>
            <div class="rf-field"><label>Credit limit (cards)</label><input class="rf-input" data-field="creditLimit" inputmode="decimal" /></div>
          </div>
          <label class="rf-check"><input type="checkbox" data-field="autoGen" /><span>Auto-generate entries for the opening balance</span></label>
          <div class="rf-row rf-hide" data-autogen-dates>
            <div class="rf-field"><label>Start date</label><input class="rf-input" type="date" data-field="genStart" value="${openYmd(-30)}" max="${openYmd(0)}" /></div>
            <div class="rf-field"><label>End date</label><input class="rf-input" type="date" data-field="genEnd" value="${openYmd(0)}" max="${openYmd(0)}" /></div>
          </div>
          <p class="rf-small rf-muted rf-hide" data-autogen-hint>Random deposits and spending, up to ${OPEN_GEN_LIMIT} entries, spread between the dates and netting to the opening balance.</p>
          <label class="rf-check"><input type="checkbox" data-field="issueCard" checked /><span>Issue a card on this account</span></label>
          ${index > 0 ? '<button class="rf-btn link sm" type="button" data-remove-row>Remove this account</button>' : ''}
        </div>
      </div>`;
  }

  const OPEN_GEN_LIMIT = 200;

  function openYmd(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Splits `total` cents into `count` random positive parts. */
  function splitCents(total, count) {
    const n = Math.max(1, Math.min(count, total));
    const weights = Array.from({ length: n }, () => 0.2 + Math.random());
    const sum = weights.reduce((s, w) => s + w, 0);
    const parts = weights.map((w) => Math.max(1, Math.floor((w / sum) * total)));
    let diff = total - parts.reduce((s, p) => s + p, 0);
    for (let i = 0; diff !== 0; i = (i + 1) % n) {
      if (diff > 0) { parts[i] += 1; diff -= 1; } else if (parts[i] > 1) { parts[i] -= 1; diff += 1; }
    }
    return parts;
  }

  function openWording(direction) {
    const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
    const method = direction === 'credit'
      ? pickOne(['direct_deposit', 'direct_deposit', 'ach', 'mobile_deposit', 'instant', 'wire_domestic'])
      : pickOne(['card', 'card', 'card', 'atm', 'bill_pay', 'ach', 'instant']);
    const spec = NARRATIVES[method] || { category: 'Other', credit: ['Deposit'], debit: ['Withdrawal'] };
    const lines = spec[direction] || [direction === 'credit' ? 'Deposit' : 'Withdrawal'];
    return {
      method,
      category: direction === 'credit' && method === 'direct_deposit' ? 'Income' : spec.category,
      description: pickOne(lines),
    };
  }

  /**
   * A dated series of deposits and spending whose net is exactly `totalCents`,
   * ordered so the running balance never goes below zero.
   */
  function openingPlan(totalCents, start, end) {
    const now = new Date();
    const from = new Date(`${start}T00:00`);
    const to = new Date(`${end}T00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const last = to > today ? today : to;
    const days = [];
    for (const d = new Date(from); d <= last && days.length < 3660; d.setDate(d.getDate() + 1)) days.push(new Date(d));
    if (!days.length || totalCents <= 0) return [];

    const target = Math.min(OPEN_GEN_LIMIT, Math.max(2, Math.round(days.length * (1 + Math.random()))));
    const debitCount = Math.floor(target * (0.55 + Math.random() * 0.15));
    const debitTotal = Math.floor(totalCents * (0.2 + Math.random() * 0.3));
    const debits = debitCount && debitTotal ? splitCents(debitTotal, debitCount) : [];
    const credits = splitCents(totalCents + debits.reduce((s, p) => s + p, 0), Math.max(1, target - debits.length));
    const slots = credits.length + debits.length;

    const times = [];
    for (let i = 0; i < slots; i += 1) {
      const day = days[Math.floor(Math.random() * days.length)];
      const isToday = day.getTime() === today.getTime();
      const latest = isToday ? Math.max(7 * 60, now.getHours() * 60 + now.getMinutes() - 1) : 21 * 60;
      const minute = 7 * 60 + Math.floor(Math.random() * (latest - 7 * 60 + 1));
      const when = new Date(day);
      when.setHours(Math.floor(minute / 60), minute % 60, Math.floor(Math.random() * 60), 0);
      times.push(when > now ? new Date(now.getTime() - 60000) : when);
    }
    times.sort((a, b) => a - b);

    const debitShare = debits.length / slots;
    let balance = 0;
    return times.map((when) => {
      const canDebit = debits.length && balance >= debits[0];
      const useDebit = canDebit && (!credits.length || Math.random() < debitShare * 1.4);
      const direction = useDebit || !credits.length ? 'debit' : 'credit';
      const amount = direction === 'debit' ? debits.shift() : credits.shift();
      balance += direction === 'credit' ? amount : -amount;
      return { direction, amount, when };
    });
  }

  async function generateOpening(account, spec) {
    const plan = openingPlan(spec.cents, spec.start, spec.end);
    let net = 0; let failed = 0;
    for (let i = 0; i < plan.length; i += 1) {
      const item = plan[i];
      const wording = openWording(item.direction);
      try {
        await api.post(`/admin/accounts/${account.id}/adjust`, {
          direction: item.direction,
          amount: (item.amount / 100).toFixed(2),
          method: wording.method,
          category: wording.category,
          description: wording.description,
          status: 'posted',
          date: item.when.toISOString(),
          note: `Opening balance series ${spec.start} to ${spec.end}`,
          notify: false,
        });
        net += item.direction === 'credit' ? item.amount : -item.amount;
      } catch (err) {
        failed += 1;
      }
      if (i % 10 === 0) toast(`Generating ${account.name}: ${i + 1} of ${plan.length}`, 'ok');
    }
    return { count: plan.length - failed, failed, net };
  }

  async function register() {
    if (!state.meta) state.meta = await api.get('/admin/settings');
    const host = qs('[data-account-rows]');
    host.innerHTML = accountRow(0);

    host.addEventListener('change', (event) => {
      if (event.target.getAttribute('data-field') !== 'autoGen') return;
      const row = event.target.closest('[data-account-row]');
      qs('[data-autogen-dates]', row).classList.toggle('rf-hide', !event.target.checked);
      qs('[data-autogen-hint]', row).classList.toggle('rf-hide', !event.target.checked);
    });

    qs('[data-add-account]').addEventListener('click', () => {
      host.insertAdjacentHTML('beforeend', accountRow(host.children.length));
    });
    host.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-row]');
      if (button) button.closest('[data-account-row]').remove();
    });

    // Identity documents, read as data URLs before the form is sent.
    const documents = {};
    qsa('[data-doc]').forEach((input) => {
      input.addEventListener('change', async () => {
        const kind = input.getAttribute('data-doc');
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          documents[kind] = await RF.readFile(file, { maxDimension: kind === 'avatar' ? 512 : 1600 });
          qs(`[data-doc-preview="${kind}"]`).textContent = `${file.name} ready`;
        } catch (err) {
          toast(err.message, 'bad');
        }
      });
    });

    onSubmit(qs('#rf-register-form'), async (values) => {
      const generators = [];
      const accounts = qsa('[data-account-row]', host).map((row, index) => {
        const read = (field) => {
          const el = qs(`[data-field="${field}"]`, row);
          if (!el) return undefined;
          return el.type === 'checkbox' ? el.checked : el.value.trim();
        };
        let openingBalance = read('openingBalance');
        if (read('autoGen')) {
          const cents = Math.round(Number(String(openingBalance).replace(/[^0-9.]/g, '')) * 100);
          const start = read('genStart');
          const end = read('genEnd');
          if (!(cents > 0)) throw new Error('Enter an opening balance to auto-generate entries.');
          if (!start || !end) throw new Error('Pick a start and an end date for the generated entries.');
          if (start > end) throw new Error('The start date must be on or before the end date.');
          if (start > openYmd(0)) throw new Error('Generated entries cannot be dated in the future.');
          generators.push({ index, cents, start, end });
          openingBalance = '0';
        }
        return {
          productId: read('productId'),
          openingBalance,
          nickname: read('nickname'),
          creditLimit: read('creditLimit'),
          issueCard: read('issueCard'),
        };
      });

      const result = await api.post('/admin/customers', { ...values, ...documents, accounts });
      for (const spec of generators) {
        const account = result.accounts[spec.index];
        if (!account) continue;
        const outcome = await generateOpening(account, spec);
        account.balance = (Number(account.balance) || 0) + outcome.net;
        if (outcome.failed) toast(`${outcome.failed} generated entr${outcome.failed === 1 ? 'y' : 'ies'} failed on ${account.name}.`, 'bad');
      }
      showRegistration(result);
      toast('Customer registered and the welcome email sent.', 'ok');
      qs('#rf-register-form').reset();
      host.innerHTML = accountRow(0);
      loaded.delete('customers');
      showTab('customers');
    });
  }

  /**
   * What was just created, in something an operator can read out or copy: the
   * customer number, the username, the temporary password and every account
   * with its opening balance. A native alert() would block the page and could
   * not be copied from.
   */
  function showRegistration(result) {
    const el = document.createElement('div');
    el.className = 'rf-modal-backdrop';
    el.innerHTML = `
      <div class="rf-modal">
        <div class="rf-modal-head">
          <h3>${esc(result.customer.fullName)} is registered</h3>
          <button type="button" data-close aria-label="Close">&times;</button>
        </div>
        <div class="rf-modal-body">
          <p class="rf-small rf-muted">A welcome email has gone out with everything below. The temporary password is shown once, here.</p>
          <dl class="rf-dl">
            <dt>Customer number</dt><dd class="mono">${esc(result.customer.customerNumber)}</dd>
            <dt>Username</dt><dd>${esc(result.customer.email)}</dd>
            ${result.temporaryPassword ? `<dt>Temporary password</dt><dd class="mono">${esc(result.temporaryPassword)}</dd>` : ''}
            ${result.accounts.map((a) => `<dt>${esc(a.name)}</dt><dd class="mono">${esc(a.accountMask)} &middot; ${money(a.balance)}</dd>`).join('')}
          </dl>
        </div>
        <div class="rf-modal-foot">
          <button class="rf-btn ghost" type="button" data-copy>Copy the details</button>
          <button class="rf-btn" type="button" data-close>Done</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
    const close = () => { el.remove(); document.body.style.overflow = ''; };
    qsa('[data-close]', el).forEach((b) => b.addEventListener('click', close));
    el.addEventListener('click', (event) => { if (event.target === el) close(); });
    qs('[data-copy]', el).addEventListener('click', () => {
      RF.copy([
        `${result.customer.fullName} — ${result.customer.customerNumber}`,
        `Username: ${result.customer.email}`,
        result.temporaryPassword ? `Temporary password: ${result.temporaryPassword}` : '',
        ...result.accounts.map((a) => `${a.name} ${a.accountMask} — ${money(a.balance)}`),
      ].filter(Boolean).join('\n'), 'Registration details copied');
    });
  }

  /* --------------------------------------------------------------- queue -- */

  const rejectModal = qs('[data-reject-modal]');
  RF.modal.wire(rejectModal);

  async function queue() {
    const tbody = qs('[data-queue]');
    const statusSelect = qs('[data-queue-status]');

    async function load() {
      const status = statusSelect.value;
      const data = await api.get(`/admin/transfers${status ? `?status=${encodeURIComponent(status)}` : ''}`);
      tbody.innerHTML = data.transfers.length ? data.transfers.map((t) => `
        <tr>
          <td class="rf-nowrap rf-small">${date(t.createdAt)}<span class="sub">${new Date(t.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span></td>
          <td>${t.customer ? `<button class="rf-btn link sm" data-customer="${esc(t.customer.id)}">${esc(t.customer.fullName)}</button>` : '&mdash;'}</td>
          <td class="rf-small">${esc(t.typeLabel)}</td>
          <td class="rf-small">${esc((t.recipient && (t.recipient.nickname || t.recipient.name)) || '&mdash;')}<span class="sub rf-mono">${esc((t.recipient && t.recipient.accountMasked) || '')}</span></td>
          <td class="rf-mono rf-small">${esc(t.confirmation)}</td>
          <td>${badge(t.status, t.statusLabel)}${t.reasonNote ? `<span class="sub">${esc(t.reasonNote)}</span>` : ''}</td>
          <td class="num rf-amt">${money(t.total)}${t.fee ? `<span class="sub">incl. ${money(t.fee)} fee</span>` : ''}</td>
          <td class="rf-right rf-nowrap">
            ${['pending_review', 'pending_verification', 'processing', 'scheduled'].includes(t.status) ? `
              <button class="rf-btn sm" data-approve="${esc(t.id)}">Release</button>
              <button class="rf-btn ghost sm" data-reject="${esc(t.id)}" data-summary="${esc(`${money(t.total)} to ${(t.recipient && (t.recipient.nickname || t.recipient.name)) || 'recipient'}`)}">Return</button>` : ''}
          </td>
        </tr>`).join('') : '<tr><td colspan="8" class="rf-center rf-muted">Nothing here.</td></tr>';
    }

    tbody.addEventListener('click', async (event) => {
      const approve = event.target.closest('[data-approve]');
      const reject = event.target.closest('[data-reject]');
      if (approve) {
        if (!confirm('Release this transfer? The money leaves the customer’s account now.')) return;
        try {
          await api.post(`/admin/transfers/${approve.getAttribute('data-approve')}/approve`, { note: '' });
          toast('Transfer released and the customer emailed.', 'ok');
          load();
          loaded.delete('overview');
        } catch (err) { toast(err.message, 'bad'); }
      }
      if (reject) {
        acting.transferId = reject.getAttribute('data-reject');
        qs('[data-reject-summary]', rejectModal).textContent = reject.getAttribute('data-summary');
        qs('#rf-reject-form').reset();
        RF.modal.open(rejectModal);
      }
    });

    statusSelect.addEventListener('change', load);
    qs('[data-run-scheduled]').addEventListener('click', async () => {
      const res = await api.post('/admin/scheduled/run');
      toast(`${res.processed.length} scheduled transfer(s) processed.`, 'ok');
      load();
    });

    onSubmit(qs('#rf-reject-form'), async (values) => {
      await api.post(`/admin/transfers/${acting.transferId}/reject`, values);
      RF.modal.close(rejectModal);
      toast('Transfer returned, funds released and the customer told why.', 'ok');
      load();
      loaded.delete('overview');
    });

    await load();
  }

  /* ------------------------------------------------------------ deposits -- */

  async function deposits() {
    const tbody = qs('[data-deposits]');

    async function load() {
      const data = await api.get('/admin/deposits');
      tbody.innerHTML = data.deposits.length ? data.deposits.map((d) => `
        <tr>
          <td class="rf-nowrap rf-small">${datetime(d.createdAt)}</td>
          <td>${d.customer ? `<button class="rf-btn link sm" data-customer="${esc(d.customer.id)}">${esc(d.customer.fullName)}</button>` : '&mdash;'}</td>
          <td class="rf-mono rf-small">${esc(d.reference)}</td>
          <td class="rf-small">${esc(d.checkNumber || '&mdash;')}</td>
          <td class="num rf-amt">${money(d.amount)}</td>
          <td>${badge(d.status)}</td>
          <td><a class="rf-btn ghost sm" href="${esc(d.frontUrl)}" target="_blank" rel="noopener">Front</a> <a class="rf-btn ghost sm" href="${esc(d.backUrl)}" target="_blank" rel="noopener">Back</a></td>
          <td class="rf-right rf-nowrap">
            ${d.status === 'review' ? `
              <button class="rf-btn sm" data-deposit="${esc(d.id)}" data-action="accept">Accept</button>
              <button class="rf-btn ghost sm" data-deposit="${esc(d.id)}" data-action="reject">Return</button>` : ''}
          </td>
        </tr>`).join('') : '<tr><td colspan="8" class="rf-center rf-muted">No deposits.</td></tr>';
    }

    tbody.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-deposit]');
      if (!button) return;
      const action = button.getAttribute('data-action');
      const note = action === 'reject' ? prompt('Why is this check being returned? The customer sees this.') : '';
      if (action === 'reject' && note == null) return;
      try {
        await api.post(`/admin/deposits/${button.getAttribute('data-deposit')}/review`, { action, note });
        toast(action === 'accept' ? 'Deposit accepted and the funds released.' : 'Deposit returned.', 'ok');
        load();
      } catch (err) { toast(err.message, 'bad'); }
    });

    await load();
  }

  /* --------------------------------------------------------------- cards -- */

  async function cards() {
    const tbody = qs('[data-cards]');

    async function load() {
      const data = await api.get('/admin/cards');
      tbody.innerHTML = data.cards.length ? data.cards.map((card) => `
        <tr>
          <td class="rf-mono">${esc(card.masked)}<span class="sub">${esc(card.brand)}</span></td>
          <td>${card.customer ? `<button class="rf-btn link sm" data-customer="${esc(card.customer.id)}">${esc(card.customer.fullName)}</button>` : '&mdash;'}</td>
          <td class="rf-small">${esc(card.kind)}</td>
          <td class="rf-small">${esc(card.expires)}</td>
          <td class="num">${money(card.dailyPurchaseLimit)}</td>
          <td>${badge(card.status)}</td>
          <td class="rf-right rf-nowrap">
            <button class="rf-btn ghost sm" data-card="${esc(card.id)}" data-action="${card.status === 'active' ? 'frozen' : 'active'}">${card.status === 'active' ? 'Freeze' : 'Activate'}</button>
          </td>
        </tr>`).join('') : '<tr><td colspan="7" class="rf-center rf-muted">No cards issued.</td></tr>';
    }

    tbody.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-card]');
      if (!button) return;
      try {
        await api.patch(`/admin/cards/${button.getAttribute('data-card')}`, { status: button.getAttribute('data-action') });
        toast('Card updated.', 'ok');
        load();
      } catch (err) { toast(err.message, 'bad'); }
    });

    await load();
  }

  /* ------------------------------------------------------------ messages -- */

  async function messages() {
    const list = qs('[data-threads]');
    const body = qs('[data-thread]');
    let threads = [];
    let current = null;

    async function load() {
      const data = await api.get('/admin/messages');
      threads = data.threads;
      list.innerHTML = threads.length ? threads.map((thread) => `
        <li class="clickable" data-thread="${esc(thread.id)}">
          <span class="t">
            <strong>${esc(thread.subject)}</strong>
            <span>${esc((thread.customer && thread.customer.fullName) || '')} &middot; ${ago(thread.updatedAt)}</span>
          </span>
          ${thread.awaitingReply ? badge('pending', 'Needs a reply') : ''}
        </li>`).join('') : '<li class="rf-muted rf-small">No conversations.</li>';
    }

    function render(thread) {
      current = thread.id;
      qs('[data-thread-subject]').textContent = `${thread.subject} — ${(thread.customer && thread.customer.fullName) || ''}`;
      body.innerHTML = thread.messages.map((m) => `
        <div style="margin-bottom:14px;padding:12px 14px;border-radius:12px;background:${m.from === 'bank' ? 'var(--rf-surface-3)' : 'var(--rf-info-soft)'}">
          <div class="rf-spread rf-small rf-muted"><strong>${esc(m.authorName || m.from)}</strong><span>${datetime(m.createdAt)}</span></div>
          <div style="margin-top:6px;white-space:pre-wrap">${esc(m.body)}</div>
        </div>`).join('');
    }

    list.addEventListener('click', (event) => {
      const row = event.target.closest('[data-thread]');
      if (!row) return;
      const thread = threads.find((t) => t.id === row.getAttribute('data-thread'));
      if (thread) render(thread);
    });

    onSubmit(qs('#rf-console-reply'), async (values) => {
      if (!current) throw new Error('Choose a conversation first.');
      await api.post(`/admin/messages/${current}/reply`, values);
      qs('#rf-console-reply').reset();
      toast('Reply sent and the customer notified.', 'ok');
      await load();
      const thread = threads.find((t) => t.id === current);
      if (thread) render(thread);
    });

    await load();
    if (threads.length) render(threads[0]);
  }

  /* -------------------------------------------------------------- alerts -- */

  async function alerts() {
    const tbody = qs('[data-alerts]');
    const statusSelect = qs('[data-alert-status]');
    if (!state.meta) state.meta = await api.get('/admin/settings');

    const mailBox = qs('[data-mail-status]');
    if (!state.meta.emailConfigured) {
      mailBox.innerHTML = '<div><strong>No mail provider configured</strong>Alerts are stored and shown in the customer’s notification centre, but nothing leaves the server. Set RESEND_API_KEY to send them.</div>';
      mailBox.className = 'rf-notice warn';
      mailBox.classList.remove('rf-hide');
    }

    const customerSelect = qs('#al-customer');
    const list = await api.get('/admin/customers?limit=200&role=customer');
    customerSelect.innerHTML = list.customers.map((c) => `<option value="${esc(c.id)}">${esc(c.fullName)} — ${esc(c.email)}</option>`).join('');

    const audience = qs('#al-audience');
    const applyAudience = () => { qs('[data-one-field]').hidden = audience.value !== 'one'; };
    audience.addEventListener('change', applyAudience);
    applyAudience();

    async function load() {
      const status = statusSelect.value;
      const data = await api.get(`/admin/alerts?limit=100${status ? `&status=${encodeURIComponent(status)}` : ''}`);
      tbody.innerHTML = data.alerts.length ? data.alerts.map((a) => `
        <tr>
          <td class="rf-nowrap rf-small">${datetime(a.createdAt)}</td>
          <td>${a.customer ? `<button class="rf-btn link sm" data-customer="${esc(a.customer.id)}">${esc(a.customer.fullName)}</button>` : '&mdash;'}</td>
          <td>${esc(a.subject)}<span class="sub">${esc(a.preview || '')}</span></td>
          <td class="rf-small">${esc(a.type)}</td>
          <td>${badge(a.status)}${a.error ? `<span class="sub">${esc(a.error)}</span>` : ''}</td>
          <td class="rf-small rf-muted">${a.readAt ? ago(a.readAt) : 'unread'}</td>
        </tr>`).join('') : '<tr><td colspan="6" class="rf-center rf-muted">No alerts yet.</td></tr>';
    }

    statusSelect.addEventListener('change', load);

    onSubmit(qs('#rf-alert-form'), async (values) => {
      const res = await api.post('/admin/alerts', values);
      qs('#rf-alert-form').reset();
      applyAudience();
      toast(`Sent to ${res.sent} customer(s): ${res.delivered} delivered, ${res.queued} queued.`, 'ok');
      load();
    });

    await load();
  }

  /* ------------------------------------------------------------ disputes -- */

  async function disputes() {
    const tbody = qs('[data-disputes]');

    async function load() {
      const data = await api.get('/admin/disputes');
      tbody.innerHTML = data.disputes.length ? data.disputes.map((d) => `
        <tr>
          <td class="rf-nowrap rf-small">${date(d.createdAt)}</td>
          <td>${d.customer ? `<button class="rf-btn link sm" data-customer="${esc(d.customer.id)}">${esc(d.customer.fullName)}</button>` : '&mdash;'}</td>
          <td class="rf-mono rf-small">${esc(d.reference)}</td>
          <td class="rf-small">${esc(d.reason)}<span class="sub">${esc(d.detail || '')}</span></td>
          <td class="num rf-amt">${money(d.amount)}</td>
          <td>${badge(d.status)}</td>
          <td class="rf-right rf-nowrap">
            ${d.status === 'open' || d.status === 'provisional_credit' ? `
              <button class="rf-btn sm" data-dispute="${esc(d.id)}" data-outcome="upheld">Credit</button>
              <button class="rf-btn ghost sm" data-dispute="${esc(d.id)}" data-outcome="provisional">Provisional</button>
              <button class="rf-btn ghost sm" data-dispute="${esc(d.id)}" data-outcome="declined">Decline</button>` : ''}
          </td>
        </tr>`).join('') : '<tr><td colspan="7" class="rf-center rf-muted">No claims.</td></tr>';
    }

    tbody.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-dispute]');
      if (!button) return;
      const outcome = button.getAttribute('data-outcome');
      const note = prompt('What should the customer be told?');
      if (note == null) return;
      try {
        await api.post(`/admin/disputes/${button.getAttribute('data-dispute')}/resolve`, { outcome, note });
        toast('Claim updated and the customer emailed.', 'ok');
        load();
      } catch (err) { toast(err.message, 'bad'); }
    });

    await load();
  }

  /* ------------------------------------------------------------ activity -- */

  async function activity() {
    const form = qs('[data-activity-filters]');
    const tbody = qs('[data-activity]');
    const limit = 100;

    async function load() {
      const params = new URLSearchParams(RF.formData(form));
      params.set('limit', String(limit));
      params.set('offset', String(state.activityOffset));
      const data = await api.get(`/admin/activity?${params.toString()}`);
      tbody.innerHTML = data.activity.length ? data.activity.map((row) => `
        <tr>
          <td class="rf-nowrap rf-small">${datetime(row.createdAt)}</td>
          <td class="rf-mono rf-small">${esc(row.action)}</td>
          <td class="rf-small">${esc(row.actorEmail || 'system')}<span class="sub">${esc(row.actorRole)}</span></td>
          <td>${esc(row.detail || '')}</td>
          <td>${badge(row.severity === 'info' ? 'info' : row.severity)}</td>
          <td class="rf-mono rf-small">${esc(row.ip || '')}</td>
          <td class="rf-small">${esc(row.device || '')}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="rf-center rf-muted">Nothing matches.</td></tr>';

      qs('[data-activity-count]').textContent = `${data.total} entries`;
      qs('[data-activity-range]').textContent = data.total
        ? `Showing ${state.activityOffset + 1} to ${Math.min(state.activityOffset + limit, data.total)} of ${data.total}`
        : '';
      qs('[data-activity-prev]').disabled = state.activityOffset === 0;
      qs('[data-activity-next]').disabled = state.activityOffset + limit >= data.total;
    }

    form.addEventListener('submit', (event) => { event.preventDefault(); state.activityOffset = 0; load(); });
    qs('[data-activity-prev]').addEventListener('click', () => { state.activityOffset = Math.max(0, state.activityOffset - limit); load(); });
    qs('[data-activity-next]').addEventListener('click', () => { state.activityOffset += limit; load(); });
    await load();
  }

  /* ------------------------------------------------------------ settings -- */

  async function settings() {
    const data = await api.get('/admin/settings');
    state.meta = data;
    state.settings = data.settings;
    const s = data.settings;
    const form = qs('#rf-settings-form');

    const set = (name, value) => {
      const el = qs(`[name="${name}"]`, form);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = Boolean(value);
      else el.value = value == null ? '' : value;
    };

    set('bankName', s.bankName);
    set('routingNumber', s.routingNumber);
    set('supportEmail', s.supportEmail);
    set('supportPhone', s.supportPhone);
    set('fraudPhone', s.fraudPhone);
    set('internationalPhone', s.internationalPhone);
    set('supportHours', s.supportHours);
    set('mailingAddress', s.mailingAddress);
    set('announcement', s.announcement);
    set('announcementLevel', s.announcementLevel);
    set('sessionMinutes', s.sessionMinutes);
    set('requireOtpForTransfers', s.requireOtpForTransfers);
    set('requirePinForTransfers', s.requirePinForTransfers);
    set('holdTransfersForReview', s.holdTransfersForReview);
    set('maintenanceMode', s.maintenanceMode);
    set('investEnabled', s.investEnabled);
    const codeField = qs('[data-invest-code]', form);
    if (codeField) codeField.hidden = Boolean(s.investEnabled);
    set('holdThresholdCents', (s.holdThresholdCents / 100).toFixed(2));

    const LIMIT_LABELS = {
      internalDaily: 'Between own accounts', achDaily: 'ACH', wireDaily: 'Wires',
      instantDaily: 'Instant sends', memberDaily: 'To other SMB customers', billPayDaily: 'Bill pay', mobileDepositDaily: 'Mobile deposits',
      atmDaily: 'ATM', cardDaily: 'Card purchases', singleTransactionMax: 'Any single transfer',
    };
    qs('[data-limits]').innerHTML = Object.entries(s.limits).map(([key, value]) => `
      <div class="rf-field">
        <label for="lim-${key}">${esc(LIMIT_LABELS[key] || key)}</label>
        <input class="rf-input" id="lim-${key}" data-limit="${key}" inputmode="decimal" value="${(value / 100).toFixed(2)}" />
      </div>`).join('');

    const FEE_LABELS = {
      achOutgoing: 'Outgoing ACH', wireDomestic: 'Domestic wire', wireInternational: 'International wire',
      expeditedTransfer: 'Expedited transfer', overdraft: 'Overdraft item', returnedItem: 'Returned item',
      stopPayment: 'Stop payment', outOfNetworkAtm: 'Out-of-network ATM', foreignTransactionPct: 'Foreign transaction %',
      paperStatement: 'Paper statement', cardReplacement: 'Card replacement', expeditedCardReplacement: 'Expedited card',
    };
    qs('[data-fees]').innerHTML = Object.entries(s.fees).map(([key, value]) => `
      <div class="rf-field">
        <label for="fee-${key}">${esc(FEE_LABELS[key] || key)}</label>
        <input class="rf-input" id="fee-${key}" data-fee="${key}" inputmode="decimal" value="${key === 'foreignTransactionPct' ? value : (value / 100).toFixed(2)}" />
      </div>`).join('');

    qs('[data-mail-configured]').textContent = data.emailConfigured
      ? 'Email is configured: alerts are delivered.'
      : 'No mail provider configured: alerts show in online banking but are not emailed.';

    onSubmit(form, async (values) => {
      const limits = {};
      qsa('[data-limit]', form).forEach((el) => { limits[el.getAttribute('data-limit')] = Math.round(Number(el.value || 0) * 100); });
      const fees = {};
      qsa('[data-fee]', form).forEach((el) => {
        const key = el.getAttribute('data-fee');
        fees[key] = key === 'foreignTransactionPct' ? Number(el.value || 0) : Math.round(Number(el.value || 0) * 100);
      });
      await api.put('/admin/settings', {
        bankName: values.bankName,
        routingNumber: values.routingNumber,
        supportEmail: values.supportEmail,
        // Trimmed, and sent even when empty: clearing a field at the console
        // has to be able to take the detail back off the site.
        supportPhone: (values.supportPhone || '').trim(),
        fraudPhone: (values.fraudPhone || '').trim(),
        internationalPhone: (values.internationalPhone || '').trim(),
        supportHours: (values.supportHours || '').trim(),
        mailingAddress: (values.mailingAddress || '').trim(),
        announcement: values.announcement || '',
        announcementLevel: values.announcementLevel,
        sessionMinutes: Number(values.sessionMinutes) || 30,
        requireOtpForTransfers: Boolean(values.requireOtpForTransfers),
        requirePinForTransfers: Boolean(values.requirePinForTransfers),
        holdTransfersForReview: Boolean(values.holdTransfersForReview),
        maintenanceMode: Boolean(values.maintenanceMode),
        investEnabled: Boolean(values.investEnabled),
        investUnlockCode: (values.investUnlockCode || '').trim(),
        holdThresholdCents: Math.round(Number(values.holdThresholdCents || 0) * 100),
        limits,
        fees,
      });
      if (window.SMBName) window.SMBName.apply(values.bankName);
      const investOn = Boolean(values.investEnabled);
      document.documentElement.classList.toggle('rf-invest-on', investOn);
      const codeInput = qs('[name="investUnlockCode"]', form);
      if (codeInput) codeInput.value = '';
      const codeBox = qs('[data-invest-code]', form);
      if (codeBox) codeBox.hidden = investOn;
      toast('Settings saved. Every page shows them from the next one opened.', 'ok');
    });
  }

  /* --------------------------------------------------------- investments -- */

  async function investments() {
    const data = await api.get('/admin/investments');
    const t = data.totals;
    const gain = t.value - t.cost;
    qs('[data-inv-stats]').innerHTML = [
      ['Invested by customers', money(t.value), 'at live prices'],
      ['Paid in', money(t.cost), 'cost of the units held'],
      ['Unrealised gain / loss', `${gain >= 0 ? '+' : '-'}${money(Math.abs(gain))}`, t.cost ? `${Math.abs(gain / t.cost) < 0.00005 ? '0.00' : ((gain / t.cost) * 100).toFixed(2)}%` : '&nbsp;'],
      ['Investors', String(t.investors), `${t.trades24h} trade${t.trades24h === 1 ? '' : 's'} in 24 hours`],
    ].map(([k, v, d]) => `<div class="rf-card rf-stat"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="d">${d}</div></div>`).join('');

    qs('[data-inv-holdings]').innerHTML = data.holdings.length ? data.holdings.map((h) => `
      <tr class="clickable" data-customer="${esc(h.customer.id)}">
        <td><strong>${esc(h.customer.fullName)}</strong><span class="sub">${esc(h.customer.email)}</span></td>
        <td><strong>${esc(h.name)}</strong><span class="sub">${esc(h.symbol)}</span></td>
        <td class="num rf-mono">${esc(h.units)}</td>
        <td class="num opt">${money(h.cost)}</td>
        <td class="num"><strong>${h.value == null ? '&mdash;' : money(h.value)}</strong></td>
        <td class="num rf-amt ${h.gain >= 0 ? 'credit' : 'debit'}">${h.gain == null ? '&mdash;' : `${h.gain >= 0 ? '+' : '-'}${money(Math.abs(h.gain))}`}</td>
      </tr>`).join('') : '<tr><td colspan="6" class="rf-center rf-muted">No customer holds an asset yet.</td></tr>';

    qs('[data-inv-assets]').innerHTML = data.byAsset.length ? data.byAsset.map((a) => `<li>
      <span class="t"><strong>${esc(a.name)}</strong><span>${esc(a.symbol)} &middot; ${a.holders} holder${a.holders === 1 ? '' : 's'}</span></span>
      <strong>${money(a.value)}</strong>
    </li>`).join('') : '<li class="rf-muted rf-small">Nothing held yet.</li>';

    qs('[data-inv-trades]').innerHTML = data.trades.length ? data.trades.slice(0, 12).map((tr) => `<li class="clickable" data-customer="${esc(tr.customer.id)}">
      <span class="t"><strong>${tr.side === 'buy' ? 'Bought' : 'Sold'} ${esc(tr.units)} ${esc(tr.symbol)}</strong><span>${esc(tr.customer.fullName)} &middot; ${ago(tr.createdAt)} &middot; @ ${money(tr.price)}</span></span>
      <span class="rf-amt ${tr.side === 'buy' ? 'debit' : 'credit'}">${money(tr.amount)}</span>
    </li>`).join('') : '<li class="rf-muted rf-small">No conversions yet.</li>';
  }

  /* --------------------------------------------------------------- setup -- */

  async function setup() {
    const list = qs('[data-setup-list]');
    const data = await api.get('/admin/setup');
    const counted = data.items.filter((i) => i.status !== 'optional');
    const done = counted.filter((i) => i.status === 'done').length;
    const pct = counted.length ? Math.round((done / counted.length) * 100) : 0;
    qs('[data-setup-score]').textContent = `${done} of ${counted.length} done`;
    qs('[data-setup-sub]').textContent = done === counted.length ? 'The backend is fully set up.' : `${counted.length - done} to do before real customers.`;
    qs('[data-setup-bar]').style.width = `${pct}%`;
    const label = { done: 'Done', todo: 'To do', blocked: 'Waiting', optional: 'Optional' };
    const groups = Array.from(new Set(data.items.map((i) => i.group)));
    list.innerHTML = groups.map((g) => `
      <section class="rf-card rf-mb">
        <div class="rf-card-head"><h3>${esc(g)}</h3></div>
        <ul class="hs-setup-items">
          ${data.items.filter((i) => i.group === g).map((i) => `
          <li class="is-${esc(i.status)}">
            <span class="hs-setup-dot" aria-hidden="true">${i.status === 'done' ? '&#10003;' : i.status === 'optional' ? '&#8226;' : '!'}</span>
            <span class="hs-setup-text">
              <strong>${esc(i.title)}</strong>
              <span>${esc(i.detail)}</span>
              ${i.status !== 'done' && i.fix ? `<span class="hs-setup-fix"><b>How:</b> ${esc(i.fix)}</span>` : ''}
            </span>
            <span class="hs-setup-tag">${label[i.status] || esc(i.status)}</span>
          </li>`).join('')}
        </ul>
      </section>`).join('');
    qsa('[data-staff-pip="setup"]').forEach((pip) => { const left = data.counts.todo || 0; pip.textContent = String(left || ''); pip.classList.toggle('rf-hide', !left); });
    wireTestEmail();
  }

  /** Send a real email through Resend and show exactly what came back. */
  function wireTestEmail() {
    const form = qs('[data-test-email]');
    const out = qs('[data-test-email-result]');
    if (!form || form.dataset.wired) return;
    form.dataset.wired = '1';
    const me = RF.state && RF.state.user && RF.state.user.email;
    if (me && !form.to.value) form.to.value = me;
    const flag = (v) => (v === true || v === 'enabled' ? 'on' : v === false || v === 'disabled' ? 'off' : (v || '?'));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = qs('[data-submit]', form);
      button.disabled = true;
      out.innerHTML = '<p class="rf-small rf-muted">Sending&hellip;</p>';
      try {
        const r = await api.post('/admin/setup/test-email', { to: form.to.value.trim() });
        const rows = (r.results || []).map((x) => `
          <li><span class="t"><strong>${esc(x.from)}</strong><span>${x.ok ? `Accepted by Resend (id ${esc(x.id || '-')}). Check the inbox for ${esc(r.to)}, including spam.` : `Refused: ${esc(x.error || 'unknown')}`}${x.advice ? `<br><b>Likely cause:</b> ${esc(x.advice)}` : ''}</span></span>${badge(x.ok ? 'sent' : 'failed')}</li>`).join('');
        const domains = r.domains
          ? r.domains.map((d) => `<li><span class="t"><strong>${esc(d.name)}</strong><span>status ${esc(d.status)} &middot; sending ${esc(flag(d.sending))} &middot; receiving ${esc(flag(d.receiving))}</span></span></li>`).join('') || '<li class="rf-muted rf-small">No domains on this Resend account.</li>'
          : `<li class="rf-muted rf-small">Resend would not list domains: ${esc(r.domainsError || 'unknown')}. A key restricted to sending cannot list them; that is fine if the sends above worked.</li>`;
        out.innerHTML = `
          ${(r.advice || []).map((a) => `<p class="rf-notice warn">${esc(a)}</p>`).join('')}
          <h4 class="rf-label">Sends</h4><ul class="rf-list">${rows || '<li class="rf-muted rf-small">Nothing was sent.</li>'}</ul>
          <h4 class="rf-label rf-mt">Domains on your Resend account</h4><ul class="rf-list">${domains}</ul>
          <p class="rf-small rf-muted rf-mt">Receiving mail into /admin uses ${esc(r.mailbox || 'MAILBOX_ADDRESS (not set)')}; enquiries and chats are announced to ${esc(r.formTo || 'FORM_TO (not set)')}.</p>`;
      } catch (err) {
        out.innerHTML = `<p class="rf-notice bad">${esc(err.message)}</p>`;
      } finally {
        button.disabled = false;
      }
    });
  }

  /* -------------------------------------------------------------- search -- */

  function wireSearch() {
    const form = qs('[data-staff-search]');
    if (!form) return;
    const input = qs('input', form);
    const box = qs('[data-search-results]', form);
    let timer = null;
    let seq = 0;
    const close = () => { box.hidden = true; };
    const run = async () => {
      const q = input.value.trim();
      if (q.length < 2) { close(); return; }
      const mine = ++seq;
      try {
        const data = await api.get(`/admin/customers?q=${encodeURIComponent(q)}&limit=8`);
        if (mine !== seq) return;
        box.innerHTML = data.customers.length ? data.customers.map((c) => `
          <button type="button" data-customer="${esc(c.id)}">
            <span class="rf-avatar sm">${esc(c.initials)}</span>
            <span><strong>${esc(c.fullName)}</strong><small>${esc(c.email)} &middot; ${esc(c.customerNumber || '')}</small></span>
          </button>`).join('') : '<p class="rf-muted rf-small">No customer matches that.</p>';
        box.hidden = false;
      } catch (err) { close(); }
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 220); });
    input.addEventListener('focus', () => { if (box.innerHTML && input.value.trim().length >= 2) box.hidden = false; });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const first = qs('[data-customer]', box);
      if (first) first.click();
    });
    document.addEventListener('click', (e) => { if (!form.contains(e.target)) close(); });
    box.addEventListener('click', (e) => { if (e.target.closest('[data-customer]')) { close(); input.value = ''; } });
  }

  /* -------------------------------------------------------------- wiring -- */

  const TABS = { overview, customers, register, entries, queue, deposits, cards, messages, alerts, disputes, activity, settings, investments, setup };

  // Any [data-customer] in a table or list opens the customer sheet. Elements
  // inside a modal are excluded: a modal's own controls must keep their normal
  // behaviour, and preventDefault() here would cancel a form submission.
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-customer]');
    if (!button || button.closest('.rf-modal-backdrop')) return;
    event.preventDefault();
    openCustomer(button.getAttribute('data-customer')).catch((err) => toast(err.message, 'bad'));
  });

  // Any link or tile that names a section opens it in place.
  document.addEventListener('click', async (event) => {
    const link = event.target.closest('[data-tab], [data-goto-tab]');
    if (!link) return;
    event.preventDefault();
    // A tile can carry a filter: "customers?kyc=pending" opens the list already narrowed.
    const [name, query] = String(link.getAttribute('data-tab') || link.getAttribute('data-goto-tab')).split('?');
    const form = name === 'customers' && query ? qs('[data-customer-filters]') : null;
    // Set the filter first, so a first visit loads the narrowed list rather
    // than racing an unfiltered one; on a later visit, re-run the search.
    const wasLoaded = loaded.has(name);
    if (form) new URLSearchParams(query).forEach((value, key) => { if (form.elements[key]) form.elements[key].value = value; });
    showTab(name);
    if (form && wasLoaded) form.dispatchEvent(new Event('submit', { cancelable: true }));
  });
  window.addEventListener('hashchange', () => {
    const name = location.hash.slice(1);
    if (TABS[name]) showTab(name);
  });

  RF.ready(async () => {
    wireSearch();
    const refresh = qs('[data-setup-refresh]');
    if (refresh) refresh.addEventListener('click', () => setup().catch((err) => toast(err.message, 'bad')));
    const initial = (location.hash || '#overview').slice(1);
    showTab(TABS[initial] ? initial : 'overview');
  });
}());
