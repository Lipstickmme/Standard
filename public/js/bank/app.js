'use strict';

/**
 * The pages a customer spends their time on: the dashboard, accounts,
 * transactions, statements, cards, alerts and secure messages.
 *
 * One script for all of them, with a small router at the bottom, because they
 * share the same rendering helpers and loading the same 20kB once is cheaper
 * than seven files that each redefine a transaction row.
 */

(function () {
  const RF = window.RF;
  const { api, qs, qsa, esc, money, signedMoney, date, datetime, ago, toast, badge } = RF;

  /* ------------------------------------------------------------- shared -- */

  /**
   * A small drawing for each spending category, on the same 24px grid as the
   * sidebar's icons, with the colour its round mark is tinted in. Anything
   * without one falls back to an arrow in or out.
   */
  const MARKS = {
    Groceries: ['#15803d', '<path d="M3 4h2.2l2.1 10.2h10.4l2-7.2H6.1"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>'],
    Dining: ['#c2410c', '<path d="M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3"/><path d="M17 21V3c-2.2 1.2-3.4 3.6-3.4 6.6V13H17"/>'],
    Transport: ['#0369a1', '<rect x="4.5" y="3.5" width="15" height="14" rx="2.5"/><path d="M4.5 11h15M8 17.5V20M16 17.5V20M8.3 14.3h.01M15.7 14.3h.01"/>'],
    Fuel: ['#b45309', '<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3.5 21h13M5 10h10"/><path d="M15 8h2.2a1.8 1.8 0 0 1 1.8 1.8v6.7a1.5 1.5 0 0 0 3 0V8.5L19 6"/>'],
    Travel: ['#7c3aed', '<rect x="3.5" y="7" width="17" height="12.5" rx="2"/><path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7M3.5 12.5h17"/>'],
    Utilities: ['#a16207', '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>'],
    'Rent & Mortgage': ['#1d4ed8', '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.8 9.5V20h12.4V9.5"/><path d="M10 20v-5.5h4V20"/>'],
    Insurance: ['#0f766e', '<path d="M12 2.7 4.6 5.4v6.2c0 4.5 3 7.8 7.4 9.7 4.4-1.9 7.4-5.2 7.4-9.7V5.4z"/>'],
    Healthcare: ['#be123c', '<path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z"/>'],
    Shopping: ['#be185d', '<path d="M5 8h14l-1 12.5H6z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>'],
    Entertainment: ['#9333ea', '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z"/>'],
    Subscriptions: ['#4f46e5', '<path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19"/><path d="m16 3 3 3-3 3"/><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5"/><path d="m8 21-3-3 3-3"/>'],
    Education: ['#0369a1', '<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.6V16c1.5 1.6 3.4 2.4 5.5 2.4s4-.8 5.5-2.4v-4.4M21.5 9.5v5"/>'],
    Transfers: ['#1f5fae', '<path d="M3.4 8.8h14.2"/><path d="M13.9 5.1 17.6 8.8l-3.7 3.7"/><path d="M20.6 15.2H6.4"/><path d="M10.1 11.5 6.4 15.2l3.7 3.7"/>'],
    Investments: ['#0d9488', '<path d="M3 17 9.5 10.5l4 4L21 7"/><path d="M15 7h6v6"/>'],
    Income: ['#15803d', '<path d="M17.6 6.4 6.4 17.6"/><path d="M6.4 8.8v8.8h8.8"/>'],
    'Fees & Interest': ['#64748b', '<path d="M18.5 5.5 5.5 18.5"/><circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="17" r="2.3"/>'],
    Taxes: ['#475569', '<path d="M5.8 3h12.4v18l-2.5-1.7-2.5 1.7-2.6-1.7-2.4 1.7-2.4-1.6z"/><path d="M8.6 7.6h6.8M8.6 11h6.8M8.6 14.4h3.9"/>'],
    'Cash & ATM': ['#047857', '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5h.01M18 14.5h.01"/>'],
    out: ['#475569', '<path d="M6.4 17.6 17.6 6.4"/><path d="M8.8 6.4h8.8v8.8"/>'],
    pending: ['#a16207', '<circle cx="12" cy="12" r="9"/><path d="M12 6.8V12l3.6 2.2"/>'],
    bill: ['#1f5fae', '<path d="M5.8 3h12.4v18l-2.5-1.7-2.5 1.7-2.6-1.7-2.4 1.7-2.4-1.6z"/><path d="M8.6 7.6h6.8M8.6 11h6.8M8.6 14.4h3.9"/>'],
    checking: ['#1f5fae', '<path d="M2.4 9.8 12 4.1l9.6 5.7"/><path d="M4.3 9.8v8.4M9.4 9.8v8.4M14.6 9.8v8.4M19.7 9.8v8.4M3.1 18.2h17.8M1.8 20.6h20.4"/>'],
    savings: ['#0d9488', '<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v5.5c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 11.5V17c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-5.5"/>'],
    credit: ['#b42318', '<rect x="2.4" y="4.8" width="19.2" height="14.4" rx="2"/><path d="M2.4 9.4h19.2M5.6 15h4"/>'],
  };

  /** A tinted round mark: a category, an account type, or one of the states above. */
  function mark(key, label = '') {
    const [color, art] = MARKS[key] || MARKS.out;
    return `<span class="hs-mark" style="--c:${color}" ${label ? `title="${esc(label)}"` : 'aria-hidden="true"'}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${art}</svg></span>`;
  }

  const txMark = (tx) => mark(MARKS[tx.category] ? tx.category : (tx.direction === 'credit' ? 'Income' : 'out'), tx.category);

  /** "Today", "Yesterday", "Oct 24", or "Jan 26, 2022" once it is another year, and the time. */
  function when(iso) {
    const d = new Date(iso);
    const now = new Date();
    const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    const day = days === 0 ? 'Today' : days === 1 ? 'Yesterday'
      : d.toLocaleDateString('en-US', d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
    return { day, time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) };
  }

  function whenCell(iso) {
    const { day, time } = when(iso);
    return `<td class="rf-nowrap hs-when" title="${esc(datetime(iso))}">${day}<span class="sub">${time}</span></td>`;
  }

  /** One row of the account screen's transaction table. */
  function txRow(tx, { showAccount = true, showBalance = true } = {}) {
    return `<tr class="clickable" data-tx="${esc(tx.id)}">
      ${whenCell(tx.date)}
      <td>
        <span class="hs-tx">${txMark(tx)}<span>
          <strong>${esc(tx.description)}</strong>
          <span class="sub">${esc(tx.category)}${tx.memo ? ` &middot; ${esc(tx.memo)}` : ''}</span>
        </span></span>
      </td>
      ${showAccount ? `<td class="rf-nowrap rf-small opt">${esc(tx.accountName || '')}<span class="sub">&bull;&bull;${esc(tx.accountLast4 || '')}</span></td>` : ''}
      <td>${tx.status === 'posted' ? '' : badge(tx.status)}</td>
      <td class="num rf-amt ${tx.direction}">${signedMoney(tx.amount, tx.direction)}</td>
      ${showBalance ? `<td class="num rf-muted opt">${tx.balanceAfter == null ? '&mdash;' : money(tx.balanceAfter)}</td>` : ''}
    </tr>`;
  }

  /** One row of the dashboard's activity table: everything a statement line carries. */
  function activityRow(tx) {
    const settled = tx.status === 'posted';
    return `<tr class="clickable" data-tx="${esc(tx.id)}">
      ${whenCell(tx.date)}
      <td>
        <span class="hs-tx">${txMark(tx)}<span>
          <strong>${esc(tx.description)}</strong>
          <span class="sub"><span class="hs-when-sm">${esc(`${when(tx.date).day}, ${when(tx.date).time}`)} &middot; </span>${settled ? '' : '<b class="hs-pend">Pending &middot; </b>'}${esc(tx.category)}${tx.memo ? ` &middot; ${esc(tx.memo)}` : ''}</span>
        </span></span>
      </td>
      <td class="rf-small rf-nowrap opt">${esc(tx.methodLabel || '')}</td>
      <td class="rf-nowrap rf-small opt">${esc(tx.accountName || '')}<span class="sub">&bull;&bull;${esc(tx.accountLast4 || '')}</span></td>
      <td class="opt-sm">${settled ? badge('posted', 'Completed') : badge(tx.status, tx.status.charAt(0).toUpperCase() + tx.status.slice(1))}</td>
      <td class="num rf-amt ${tx.direction}">${signedMoney(tx.amount, tx.direction)}</td>
      <td class="num rf-muted opt">${tx.balanceAfter == null ? '&mdash;' : money(tx.balanceAfter)}</td>
    </tr>`;
  }

  /** The detail sheet for one entry, opened from any transaction table. */
  async function openTransaction(id) {
    let data;
    try {
      data = await api.get(`/transactions/${id}`);
    } catch (err) {
      toast(err.message, 'bad');
      return;
    }
    const tx = data.transaction;
    const transfer = data.transfer;
    const rows = [
      ['Amount', `<span class="rf-amt ${tx.direction}">${signedMoney(tx.amount, tx.direction)}</span>`],
      ['Date', datetime(tx.date)],
      ['Posted', tx.postedAt ? datetime(tx.postedAt) : 'Not yet posted'],
      ['Status', badge(tx.status)],
      ['Method', esc(tx.methodLabel)],
      ['Category', esc(tx.category)],
      ['Account', `${esc(tx.accountName)} &bull;&bull;${esc(tx.accountLast4)}`],
      ['Balance after', tx.balanceAfter == null ? '&mdash;' : money(tx.balanceAfter)],
      ['Reference', `<span class="rf-mono">${esc(tx.reference)}</span>`],
    ];
    if (tx.traceNumber) rows.push(['ACH trace', `<span class="rf-mono">${esc(tx.traceNumber)}</span>`]);
    if (tx.checkNumber) rows.push(['Check number', esc(tx.checkNumber)]);
    if (tx.location) rows.push(['Where', esc(tx.location)]);
    if (tx.memo) rows.push(['Memo', esc(tx.memo)]);
    if (tx.counterparty && tx.counterparty.name) {
      rows.push(['Counterparty', esc(tx.counterparty.name)]);
      if (tx.counterparty.bank) rows.push(['Their bank', esc(tx.counterparty.bank)]);
      if (tx.counterparty.accountMasked || tx.counterparty.account_masked) {
        rows.push(['Their account', esc(tx.counterparty.accountMasked || tx.counterparty.account_masked)]);
      }
    }
    if (transfer) rows.push(['Confirmation', `<span class="rf-mono">${esc(transfer.confirmation)}</span>`]);

    const el = document.createElement('div');
    el.className = 'rf-modal-backdrop';
    el.innerHTML = `
      <div class="rf-modal">
        <div class="rf-modal-head">
          <h3>${esc(tx.description)}</h3>
          <button type="button" data-close-modal aria-label="Close">&times;</button>
        </div>
        <div class="rf-modal-body">
          <dl class="rf-dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
          ${data.dispute
    ? `<div class="rf-notice warn rf-mt"><div><strong>Claim ${esc(data.dispute.reference)}</strong>${esc(data.dispute.status.replace(/_/g, ' '))}</div></div>`
    : `<div class="rf-mt"><button class="rf-btn ghost sm" data-dispute>Something is wrong with this transaction</button></div>`}
        </div>
      </div>`;
    document.body.appendChild(el);
    RF.modal.wire(el);
    RF.modal.open(el);
    el.addEventListener('click', (event) => { if (event.target === el) el.remove(); });
    qsa('[data-close-modal]', el).forEach((b) => b.addEventListener('click', () => el.remove()));

    const disputeBtn = qs('[data-dispute]', el);
    if (disputeBtn) {
      disputeBtn.addEventListener('click', async () => {
        const detail = prompt('Tell us what is wrong with this transaction:');
        if (!detail) return;
        try {
          const res = await api.post('/disputes', { transactionId: tx.id, reason: 'unauthorized', detail });
          toast(`Claim ${res.dispute.reference} opened. We will write within 10 business days.`, 'ok');
          el.remove();
          document.body.style.overflow = '';
        } catch (err) {
          toast(err.message, 'bad');
        }
      });
    }
  }

  /** Every transaction table on the page gets click-to-open, once. */
  function wireTxTables(root) {
    qsa('[data-recent], [data-rows], [data-detail-transactions]', root || document).forEach((tbody) => {
      if (tbody.dataset.wired) return;
      tbody.dataset.wired = '1';
      tbody.addEventListener('click', (event) => {
        const row = event.target.closest('[data-tx]');
        if (row) openTransaction(row.getAttribute('data-tx'));
      });
    });
  }

  const accountTile = (account) => `
    <div class="rf-acct ${account.isCredit ? 'credit' : ''}">
      <a class="hs-acct-link" href="/accounts?id=${esc(account.id)}" aria-label="${esc(account.nickname || account.name)} details"></a>
      <div class="top">
        <strong>${esc(account.nickname || account.name)}</strong>
        ${account.status === 'active' ? `<span class="hs-acct-type">${esc(account.typeLabel || '')}</span>` : badge(account.status)}
      </div>
      <div class="no">${esc(account.accountMask)}</div>
      <div class="bal">${money(account.balance)}</div>
      <div class="meta">
        ${account.isCredit
    ? `<span>${money(account.availableBalance)} available to spend</span>`
    : `<span>${money(account.availableBalance)} available</span>`}
        ${account.holdAmount ? `<span>${money(account.holdAmount)} on hold</span>` : ''}
      </div>
      ${account.isCredit || account.status !== 'active' ? '' : `<div class="hs-acct-actions">
        <a href="/transfers?from=${esc(account.id)}">Transfer</a>
        <a href="/invest?from=${esc(account.id)}" class="is-primary">Convert</a>
      </div>`}
    </div>`;

  /** An account as one line of the dashboard's list. */
  const accountRow = (a) => {
    const kind = a.isCredit ? 'credit' : (a.type === 'checking' ? 'checking' : 'savings');
    return `<li class="hs-acct-row">
      <a href="/accounts?id=${esc(a.id)}">
        ${mark(kind)}
        <span class="t"><strong>${esc(a.nickname || a.name)}</strong><span>${esc(a.typeLabel || '')} &middot; <span class="rf-mono">${esc(a.accountMask)}</span>${a.status === 'active' ? '' : ` &middot; ${esc(a.status)}`}</span></span>
        <span class="v"${a.holdAmount ? ` title="${esc(money(a.holdAmount))} on hold"` : ''}><b class="bal${a.isCredit ? ' owed' : ''}" data-fit>${money(a.balance)}</b><span>${money(a.availableBalance)} ${a.isCredit ? 'to spend' : 'avail.'}</span></span>
      </a>
    </li>`;
  };

  /* ---------------------------------------------------------- dashboard -- */

  async function dashboard() {
    const data = await api.get('/overview');

    // Investments fill in on their own, so a slow price feed never holds up the balances.
    const cash = data.totals.deposits;
    const paintHero = (invested) => {
      const total = qs('[data-hero="total"]');
      if (!total) return;
      total.textContent = money(cash + (invested || 0));
      qs('[data-hero="cash"]').textContent = money(cash);
      qs('[data-hero="invested"]').textContent = invested == null ? '—' : money(invested);
    };
    paintHero(null);
    // What the invested figure is made of, beside it: each asset's mark, its
    // symbol and what it is worth now, largest first.
    const paintHeroAssets = (holdings) => {
      const box = qs('[data-hero="assets"]');
      if (!box) return;
      const held = holdings.filter((h) => h.value != null).sort((a, b) => b.value - a.value);
      if (!held.length) { box.hidden = true; return; }
      const L = window.HSAssets || { logo: () => '' };
      const MAX = 5;
      // Cents in; whole dollars once there are thousands, so the row stays short.
      const whole = (cents) => (Math.abs(cents) >= 100000
        ? `$${Math.round(cents / 100).toLocaleString('en-US')}`
        : money(cents));
      box.innerHTML = held.slice(0, MAX).map((h) => `<span class="hs-hero-asset" title="${esc(h.name)}: ${esc(h.units)} ${esc(h.symbol)}, ${money(h.value)}">
          ${L.logo(h.symbol, 22)}<span>${esc(h.symbol)}</span><b>${whole(h.value)}</b>
        </span>`).join('') + (held.length > MAX ? `<span class="hs-hero-asset more">+${held.length - MAX} more</span>` : '');
      box.setAttribute('aria-label', `Invested in ${held.map((h) => `${h.name} ${money(h.value)}`).join(', ')}. Open Invest.`);
      box.hidden = false;
    };
    if (!document.documentElement.classList.contains('rf-invest-on')) paintHero(0);
    else api.get('/invest').then((inv) => {
      paintHero(inv.totals.value);
      paintHeroAssets(inv.holdings);
      const box = qs('[data-dash-invest]');
      if (!box) return;
      if (!inv.holdings.length) {
        box.innerHTML = '<strong>$0.00</strong><small>Turn part of your balance into the S&amp;P 500, Bitcoin, gold or leading stocks, in one tap.</small>';
        return;
      }
      // The breakdown: how the portfolio is split, then every holding.
      const L = window.HSAssets || { logo: () => '', color: () => '#0b6b50' };
      const total = inv.totals.value || 1;
      const rows = inv.holdings.map((h) => ({ ...h, share: h.value == null ? 0 : (h.value / total) * 100 }));
      const pct = (n) => `${n >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`;
      box.innerHTML = `<strong>${money(inv.totals.value)}</strong>
        <small>${inv.holdings.length} asset${inv.holdings.length === 1 ? '' : 's'} &middot; cost ${money(inv.totals.cost)} &middot; <span class="rf-amt ${inv.totals.gain >= 0 ? 'credit' : 'debit'}">${inv.totals.gain >= 0 ? '+' : '-'}${money(Math.abs(inv.totals.gain))}${inv.totals.gainPct == null ? '' : ` (${pct(inv.totals.gainPct)})`}</span> all time</small>
        <div class="hs-alloc" role="img" aria-label="${esc(rows.map((h) => `${h.name} ${h.share.toFixed(0)}%`).join(', '))}">
          ${rows.map((h) => `<span style="width:${Math.max(h.share, 1.5).toFixed(2)}%;background:${L.color(h.symbol)}" title="${esc(h.name)} ${h.share.toFixed(1)}%"></span>`).join('')}
        </div>
        <ul class="hs-dash-holdings">${rows.map((h) => `<li>
          ${L.logo(h.symbol, 34, h.name)}
          <span class="n"><b>${esc(h.name)}</b><em>${esc(h.units)} ${esc(h.symbol)} &middot; ${h.share.toFixed(1)}% of portfolio</em></span>
          <span class="v">${h.value == null ? '&mdash;' : money(h.value)}<em class="${(h.gain || 0) >= 0 ? 'up' : 'down'}">${h.gain == null ? '' : `${h.gain >= 0 ? '+' : '-'}${money(Math.abs(h.gain))}${h.gainPct == null ? '' : ` (${pct(h.gainPct)})`}`}</em>${h.dayChangePct == null ? '' : `<em class="day ${h.dayChangePct >= 0 ? 'up' : 'down'}">${pct(h.dayChangePct)} today</em>`}</span>
        </li>`).join('')}</ul>`;
    }).catch(() => {});

    const heading = qs('.rf-top h1');
    if (heading && data.user) {
      const hour = new Date().getHours();
      const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
      heading.textContent = `${part}, ${data.user.preferredName || data.user.firstName || ''}`.trim();
    }

    const asof = qs('[data-hero="asof"]');
    if (asof) asof.textContent = `· as of ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

    // The headline figures.
    const months = data.months || [];
    const thisMonth = months[months.length - 1] || { in: 0, out: 0, label: '' };
    const lastMonth = months[months.length - 2];
    const setTotal = (key, value) => { const el = qs(`[data-total="${key}"]`); if (el) el.textContent = value; };
    const setSub = (key, value) => { const el = qs(`[data-total-sub="${key}"]`); if (el) el.textContent = value; };
    setTotal('deposits', money(data.totals.deposits));
    setTotal('available', money(data.totals.available));
    setTotal('owed', money(data.totals.owed));
    setTotal('creditAvailable', money(data.totals.creditAvailable));
    setTotal('monthIn', `+${money(thisMonth.in)}`);
    setTotal('monthOut', `−${money(thisMonth.out)}`);
    qsa('[data-month-label]').forEach((el) => { el.textContent = thisMonth.label ? `· ${thisMonth.label}` : 'this month'; });
    if (lastMonth) {
      setSub('monthIn', `${money(lastMonth.in)} in ${lastMonth.label}`);
      setSub('monthOut', `${money(lastMonth.out)} in ${lastMonth.label}`);
    }
    const deposits = data.accounts.filter((a) => !a.isCredit).length;
    setSub('deposits', `across ${deposits} ${deposits === 1 ? 'account' : 'accounts'}`);
    setSub('owed', data.totals.owed ? 'due on your card' : 'nothing owed');

    qs('[data-accounts]').innerHTML = data.accounts.map(accountRow).join('')
      || '<li class="rf-muted rf-small">No accounts yet.</li>';

    // Recent activity, with a quick filter over what is already on the page.
    const recentBody = qs('[data-recent]');
    const paintRecent = (filter) => {
      const rows = data.recent.filter((tx) => filter === 'all'
        || (filter === 'pending' ? tx.status === 'pending' : tx.direction === filter));
      recentBody.innerHTML = rows.length
        ? rows.map(activityRow).join('')
        : `<tr><td colspan="7" class="rf-center rf-muted">${data.recent.length ? 'Nothing like that in your recent activity.' : 'Nothing yet.'}</td></tr>`;
    };
    paintRecent('all');
    const seg = qs('[data-recent-filter]');
    if (seg) {
      seg.addEventListener('click', (event) => {
        const button = event.target.closest('[data-filter]');
        if (!button) return;
        qsa('[data-filter]', seg).forEach((b) => {
          b.classList.toggle('is-active', b === button);
          b.setAttribute('aria-pressed', String(b === button));
        });
        paintRecent(button.getAttribute('data-filter'));
      });
    }

    // Six months in and out, with the totals above the bars.
    const peak = Math.max(1, ...months.flatMap((m) => [m.in, m.out]));
    const sumIn = months.reduce((n, m) => n + m.in, 0);
    const sumOut = months.reduce((n, m) => n + m.out, 0);
    qs('[data-months-sum]').innerHTML = `
      <span><em>In</em><b class="rf-amt credit">+${money(sumIn)}</b></span>
      <span><em>Out</em><b class="rf-amt">−${money(sumOut)}</b></span>
      <span><em>Net</em><b class="rf-amt ${sumIn >= sumOut ? 'credit' : 'debit'}">${sumIn >= sumOut ? '+' : '−'}${money(Math.abs(sumIn - sumOut))}</b></span>`;
    qs('[data-months]').innerHTML = months.map((m) => `
      <div class="col">
        <div class="pair">
          <div class="bar in" style="height:${Math.max(3, (m.in / peak) * 100)}%" title="In ${money(m.in)}"></div>
          <div class="bar out" style="height:${Math.max(3, (m.out / peak) * 100)}%" title="Out ${money(m.out)}"></div>
        </div>
        <span class="lbl">${esc(m.label)}</span>
      </div>`).join('');

    // Spending by category.
    const spending = (data.spending || []).slice(0, 5);
    const spendHost = qs('[data-spending]');
    if (spending.length) {
      const coloured = spending.map((s, i) => ({ ...s, color: RF.CHART_COLORS[i % RF.CHART_COLORS.length] }));
      const total = (data.spending || []).reduce((sum, s) => sum + s.amount, 0);
      const totalEl = qs('[data-spending-total]');
      if (totalEl) totalEl.textContent = `${money(total)} · 30 days`;
      spendHost.innerHTML = `
        ${RF.donut(coloured.map((s) => ({ label: s.category, amount: s.amount, color: s.color })), { size: 104, thickness: 16 })}
        <ul class="rf-list legend">
          ${coloured.map((s) => `<li><span class="sw" style="background:${s.color}"></span><span>${esc(s.category)}</span><span class="amt">${money(s.amount)}</span></li>`).join('')}
        </ul>`;
    } else {
      spendHost.innerHTML = '<p class="rf-muted rf-small" style="margin:0">No card spending in the last 30 days.</p>';
    }

    // Pending entries, then the bills on autopay.
    const SHOWN = 3;
    const pending = qs('[data-pending]');
    pending.innerHTML = `<li class="hs-list-label">Pending${data.pending.length ? ` · ${data.pending.length}` : ''}</li>`
      + (data.pending.length
        ? data.pending.slice(0, SHOWN).map((tx) => `<li>
            ${mark('pending')}
            <span class="t"><strong>${esc(tx.description)}</strong><span>${date(tx.date, { month: 'short', day: 'numeric' })}, ${new Date(tx.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} &middot; ${esc(tx.accountName)}</span></span>
            <span class="rf-amt ${tx.direction}">${signedMoney(tx.amount, tx.direction)}</span>
          </li>`).join('') + (data.pending.length > SHOWN ? `<li class="rf-small"><a href="/transactions">${data.pending.length - SHOWN} more pending</a></li>` : '')
        : '<li class="rf-muted rf-small">Nothing pending.</li>');

    const upcoming = qs('[data-upcoming]');
    const daysTo = (iso) => Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 86400000));
    upcoming.innerHTML = `<li class="hs-list-label">Coming up</li>`
      + (data.upcoming.length
        ? data.upcoming.slice(0, SHOWN).map((bill) => {
          const n = daysTo(bill.dueDate);
          return `<li>
            ${mark('bill')}
            <span class="t"><strong>${esc(bill.name)}</strong><span>${date(bill.dueDate, { month: 'short', day: 'numeric' })} &middot; ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`} &middot; ${esc(bill.category)}</span></span>
            <span class="rf-amt">${money(bill.amount)}</span>
          </li>`;
        }).join('')
        : '<li class="rf-muted rf-small">No scheduled payments.</li>');

    wireTxTables();
  }

  /* ----------------------------------------------------------- accounts -- */

  async function accountsPage() {
    const { accounts } = await api.get('/accounts');
    qs('[data-accounts]').innerHTML = accounts.map(accountTile).join('')
      || '<div class="rf-card rf-empty"><strong>No accounts yet</strong>Call us and we will open one.</div>';

    const panel = qs('[data-account-detail]');
    const closeBtn = qs('[data-close-detail]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        panel.hidden = true;
        history.replaceState(null, '', '/accounts');
      });
    }

    async function show(id) {
      const data = await api.get(`/accounts/${id}`);
      const a = data.account;
      panel.hidden = false;
      qs('[data-detail-title]').textContent = `${a.nickname || a.name} ${a.accountMask}`;
      qs('[data-statements-link]').href = `/statements?account=${a.id}`;

      qs('[data-detail-dl]').innerHTML = [
        ['Type', esc(a.typeLabel)],
        ['Status', badge(a.status)],
        ['Balance', `<span class="rf-amt">${money(a.balance)}</span>`],
        ['Available', money(a.availableBalance)],
        a.holdAmount ? ['On hold', money(a.holdAmount)] : null,
        a.isCredit ? ['Credit limit', money(a.creditLimit)] : ['Overdraft cover', money(a.overdraftLimit)],
        a.apy ? ['APY', `${a.apy.toFixed(2)}%`] : null,
        a.apr ? ['APR', `${a.apr.toFixed(2)}%`] : null,
        ['Opened', date(a.openedAt)],
      ].filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

      qs('[data-detail-wire]').innerHTML = [
        ['Account number', `<span class="rf-mono">${esc(data.details.accountNumber)}</span>`],
        ['Routing (ABA)', `<span class="rf-mono">${esc(data.details.routingNumber)}</span>`],
        ['SWIFT', `<span class="rf-mono">${esc(data.details.swift)}</span>`],
        ['Bank', esc(data.details.bankName)],
        // The address is operator-supplied and blank until it is set. A wire
        // form with an empty "Bank address" beside it is worse than one
        // without the row: it looks like the detail is missing rather than
        // not published.
        data.details.bankAddress ? ['Bank address', esc(data.details.bankAddress)] : null,
      ].filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd class="mono">${v}</dd>`).join('');

      qs('[data-copy-details]').onclick = () => RF.copy(data.details.wireInstructions, 'Account details copied');

      qs('[data-detail-transactions]').innerHTML = data.recent.length
        ? data.recent.map((tx) => txRow(tx, { showAccount: false })).join('')
        : '<tr><td colspan="5" class="rf-center rf-muted">Nothing on this account yet.</td></tr>';

      qs('[data-rename]').onclick = async () => {
        const nickname = prompt('What should we call this account?', a.nickname || a.name);
        if (nickname == null) return;
        try {
          await api.patch(`/accounts/${a.id}`, { nickname });
          toast('Account renamed.', 'ok');
          location.reload();
        } catch (err) {
          toast(err.message, 'bad');
        }
      };

      wireTxTables(panel);
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const requested = new URLSearchParams(location.search).get('id');
    if (requested) show(requested).catch((err) => toast(err.message, 'bad'));
  }

  /* ------------------------------------------------------- transactions -- */

  async function transactionsPage() {
    const form = qs('[data-filters]');
    const tbody = qs('[data-rows]');
    let offset = 0;
    const limit = 50;

    const query = () => {
      const data = RF.formData(form);
      const params = new URLSearchParams();
      Object.entries(data).forEach(([k, v]) => { if (v) params.set(k, v); });
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      return params;
    };

    async function load() {
      tbody.innerHTML = '<tr><td colspan="7" class="rf-center rf-muted">Loading&hellip;</td></tr>';
      const params = query();
      const data = await api.get(`/transactions?${params.toString()}`);

      const accountSelect = qs('#f-account');
      if (accountSelect && accountSelect.options.length <= 1) {
        data.filters.accounts.forEach((a) => {
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = a.label;
          accountSelect.appendChild(opt);
        });
        const preset = new URLSearchParams(location.search).get('account');
        if (preset) accountSelect.value = preset;
      }

      tbody.innerHTML = data.transactions.length
        ? data.transactions.map((tx) => `<tr class="clickable" data-tx="${esc(tx.id)}">
            <td class="rf-nowrap">${date(tx.date, { month: 'short', day: 'numeric' })}<span class="sub">${new Date(tx.date).getFullYear()}</span></td>
            <td><strong>${esc(tx.description)}</strong>${tx.memo ? `<span class="sub">${esc(tx.memo)}</span>` : ''}</td>
            <td class="rf-small opt">${esc(tx.category)}</td>
            <td class="rf-small rf-nowrap opt">${esc(tx.accountName)}<span class="sub">&bull;&bull;${esc(tx.accountLast4)}</span></td>
            <td>${badge(tx.status)}</td>
            <td class="num rf-amt ${tx.direction}">${signedMoney(tx.amount, tx.direction)}</td>
            <td class="num rf-muted opt">${tx.balanceAfter == null ? '&mdash;' : money(tx.balanceAfter)}</td>
          </tr>`).join('')
        : '<tr><td colspan="7" class="rf-center rf-muted">Nothing matches those filters.</td></tr>';

      qs('[data-count]').textContent = `${data.total} entr${data.total === 1 ? 'y' : 'ies'}`;
      qs('[data-range]').textContent = data.total
        ? `Showing ${offset + 1} to ${Math.min(offset + limit, data.total)} of ${data.total}`
        : '';
      qs('[data-prev]').disabled = offset === 0;
      qs('[data-next]').disabled = offset + limit >= data.total;

      const exportLink = qs('[data-export]');
      const exportParams = query();
      exportParams.delete('limit');
      exportParams.delete('offset');
      exportLink.href = `/api/bank/transactions/export?${exportParams.toString()}`;
      wireTxTables();
    }

    form.addEventListener('submit', (event) => { event.preventDefault(); offset = 0; load(); });
    form.addEventListener('reset', () => { setTimeout(() => { offset = 0; load(); }, 0); });
    qs('[data-prev]').addEventListener('click', () => { offset = Math.max(0, offset - limit); load(); });
    qs('[data-next]').addEventListener('click', () => { offset += limit; load(); });

    const preset = new URLSearchParams(location.search).get('account');
    if (preset) qs('#f-account').value = preset;
    await load();
  }

  /* --------------------------------------------------------- statements -- */

  async function statementsPage() {
    const select = qs('#s-account');
    const tbody = qs('[data-rows]');
    const panel = qs('[data-statement]');
    const { accounts } = await api.get('/accounts');

    select.innerHTML = accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.nickname || a.name)} ${esc(a.accountMask)}</option>`).join('');
    const preset = new URLSearchParams(location.search).get('account');
    if (preset && accounts.some((a) => a.id === preset)) select.value = preset;

    async function load() {
      tbody.innerHTML = '<tr><td colspan="6" class="rf-center rf-muted">Loading&hellip;</td></tr>';
      const data = await api.get(`/accounts/${select.value}/statements`);
      tbody.innerHTML = data.statements.length
        ? data.statements.map((s) => `<tr>
            <td><strong>${esc(s.label)}</strong><span class="sub">${s.entries} entries</span></td>
            <td class="num opt">${money(s.opening)}</td>
            <td class="num rf-amt credit opt">${money(s.credits)}</td>
            <td class="num opt">${money(s.debits)}</td>
            <td class="num"><strong>${money(s.closing)}</strong></td>
            <td class="rf-right"><button class="rf-btn ghost sm" data-open="${esc(s.periodStart.slice(0, 7))}">Open</button></td>
          </tr>`).join('')
        : '<tr><td colspan="6" class="rf-center rf-muted">No statements yet.</td></tr>';
    }

    async function openStatement(period) {
      const data = await api.get(`/accounts/${select.value}/statements/${period}`);
      const s = data.statement;
      const a = data.account;
      panel.hidden = false;
      qs('[data-statement-title]').textContent = `Statement ${date(s.periodStart, { month: 'long', year: 'numeric' })}`;
      qs('[data-statement-body]').innerHTML = `
        <div class="rf-statement">
          <div class="rf-statement-head">
            <div>
              <h2>${esc(data.bank.name)}</h2>
              <div class="addr">${[data.bank.address, data.bank.phone].filter(Boolean).map(esc).join('<br />')}</div>
            </div>
            <div class="rf-right">
              <div class="addr"><strong>${esc(data.customer.name)}</strong><br />${data.customer.addressLines.map(esc).join('<br />')}</div>
            </div>
          </div>
          <div class="rf-spread rf-mb">
            <div>
              <div class="rf-small rf-muted">Account</div>
              <div class="rf-mono">${esc(a.name)} ${esc(a.accountMask)}</div>
            </div>
            <div class="rf-right">
              <div class="rf-small rf-muted">Statement period</div>
              <div>${date(s.periodStart)} to ${date(s.periodEnd)}</div>
            </div>
          </div>
          <div class="rf-statement-summary">
            <div class="box"><div class="k">Opening balance</div><div class="v">${money(s.opening)}</div></div>
            <div class="box"><div class="k">Deposits and credits</div><div class="v">${money(s.credits)}</div></div>
            <div class="box"><div class="k">Withdrawals and debits</div><div class="v">${money(s.debits)}</div></div>
            <div class="box"><div class="k">Closing balance</div><div class="v">${money(s.closing)}</div></div>
          </div>
          <table class="rf-table">
            <thead><tr><th>Date</th><th>Description</th><th class="num">Debits</th><th class="num">Credits</th><th class="num">Balance</th></tr></thead>
            <tbody>
              ${s.transactions.map((tx) => `<tr>
                <td class="rf-nowrap">${date(tx.date, { month: 'short', day: 'numeric' })}</td>
                <td>${esc(tx.description)}${tx.reference ? `<span class="sub rf-mono">${esc(tx.reference)}</span>` : ''}</td>
                <td class="num">${tx.direction === 'debit' ? money(tx.amount) : ''}</td>
                <td class="num">${tx.direction === 'credit' ? money(tx.amount) : ''}</td>
                <td class="num">${tx.balanceAfter == null ? '' : money(tx.balanceAfter)}</td>
              </tr>`).join('') || '<tr><td colspan="5" class="rf-center rf-muted">No activity in this period.</td></tr>'}
            </tbody>
          </table>
          <p class="rf-disclosure rf-mt">
            ${esc(data.bank.legalName)} &middot; Member FDIC &middot; Equal Housing Lender. In case of errors or questions about your electronic transfers,
            ${data.bank.phone ? `telephone ${esc(data.bank.phone)} or ` : ''}write to us${data.bank.address ? ' at the address above' : ''} as soon as you can. We must hear from you no later than 60 days after we sent you
            the first statement on which the problem appeared.
          </p>
        </div>`;
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    tbody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open]');
      if (button) openStatement(button.getAttribute('data-open')).catch((err) => toast(err.message, 'bad'));
    });
    qs('[data-close-statement]').addEventListener('click', () => { panel.hidden = true; });
    select.addEventListener('change', () => { panel.hidden = true; load(); });
    await load();
  }

  /* --------------------------------------------------------------- cards -- */

  async function cardsPage() {
    const host = qs('[data-cards]');

    async function load() {
      const { cards } = await api.get('/cards');
      host.innerHTML = cards.length ? cards.map((card) => `
        <section class="rf-card">
          <div class="rf-card-body">
            <div class="rf-plastic ${card.kind === 'credit' ? 'brass' : ''} ${card.status === 'active' ? '' : 'is-frozen'}">
              <div class="brandline"><span>SMB</span><span class="scheme">${esc(card.brand.toUpperCase())}</span></div>
              <div class="chip"></div>
              <div class="pan">${esc(card.masked)}</div>
              <div class="foot">
                <span><span class="k">Card holder</span>${esc(card.nameOnCard)}</span>
                <span><span class="k">Expires</span>${esc(card.expires)}</span>
              </div>
            </div>
            <div class="rf-spread rf-mt">
              <div>
                <strong>${esc(card.accountName || card.kind)}</strong>
                <div class="rf-small rf-muted">${esc(card.kind === 'credit' ? 'Credit card' : 'Debit card')} &middot; ${badge(card.status)}</div>
              </div>
              <div class="rf-inline">
                ${card.status === 'active'
    ? `<button class="rf-btn ghost sm" data-card="${esc(card.id)}" data-action="freeze">Freeze</button>`
    : card.status === 'frozen'
      ? `<button class="rf-btn sm" data-card="${esc(card.id)}" data-action="unfreeze">Unfreeze</button>`
      : ''}
                <button class="rf-btn ghost sm" data-card="${esc(card.id)}" data-action="limits">Limits</button>
                <button class="rf-btn ghost sm" data-card="${esc(card.id)}" data-action="report_lost">Report lost</button>
              </div>
            </div>
            <dl class="rf-dl rf-mt">
              <dt>Daily purchases</dt><dd>${money(card.dailyPurchaseLimit)}</dd>
              <dt>Daily ATM</dt><dd>${money(card.dailyAtmLimit)}</dd>
              <dt>Contactless</dt><dd>${card.contactless ? 'On' : 'Off'}</dd>
              <dt>International use</dt><dd>${card.internationalAllowed ? 'Allowed' : 'Blocked'}</dd>
            </dl>
          </div>
        </section>`).join('') : '<div class="rf-card rf-empty"><strong>No cards yet</strong>Call us and we will send one out.</div>';
    }

    host.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-card]');
      if (!button) return;
      const id = button.getAttribute('data-card');
      const action = button.getAttribute('data-action');
      try {
        if (action === 'limits') {
          const purchases = prompt('Daily purchase limit, in dollars:', '7500');
          if (purchases == null) return;
          const atm = prompt('Daily ATM limit, in dollars:', '1000');
          if (atm == null) return;
          await api.post(`/cards/${id}`, { action: 'limits', dailyPurchaseLimit: Number(purchases), dailyAtmLimit: Number(atm) });
          toast('Card limits updated.', 'ok');
        } else if (action === 'report_lost') {
          if (!confirm('Report this card lost? We will cancel it and post a replacement today.')) return;
          const res = await api.post(`/cards/${id}`, { action });
          toast(res.replacement ? `Card cancelled. A replacement ending ${res.replacement.last4} is on its way.` : 'Card cancelled.', 'ok');
        } else {
          await api.post(`/cards/${id}`, { action });
          toast(action === 'freeze' ? 'Card frozen.' : 'Card unfrozen.', 'ok');
        }
        await load();
      } catch (err) {
        toast(err.message, 'bad');
      }
    });

    await load();
  }

  /* -------------------------------------------------------------- alerts -- */

  async function alertsPage() {
    const list = qs('[data-rows]');

    async function load() {
      const data = await api.get('/alerts?limit=60');
      list.innerHTML = data.alerts.length ? data.alerts.map((alert) => `
        <li data-alert="${esc(alert.id)}" class="${alert.readAt ? '' : 'is-unread'}">
          <span class="t">
            <strong>${alert.readAt ? '' : '<span class="rf-badge dot info"></span> '}${esc(alert.subject)}</strong>
            <span>${esc(alert.preview || '')}</span>
          </span>
          <span class="rf-small rf-muted rf-nowrap">${ago(alert.createdAt)}</span>
          ${alert.status === 'sent' ? badge('sent', 'Emailed') : alert.status === 'failed' ? badge('failed', 'Email failed') : badge('info', 'In app only')}
        </li>`).join('') : '<li class="rf-muted rf-small">No notifications yet.</li>';
    }

    list.addEventListener('click', async (event) => {
      const row = event.target.closest('[data-alert]');
      if (!row) return;
      const id = row.getAttribute('data-alert');
      const res = await api.post(`/alerts/${id}/read`);
      const el = document.createElement('div');
      el.className = 'rf-modal-backdrop';
      el.innerHTML = `<div class="rf-modal">
        <div class="rf-modal-head"><h3>${esc(res.alert.subject)}</h3><button type="button" data-close aria-label="Close">&times;</button></div>
        <div class="rf-modal-body"><pre style="white-space:pre-wrap;font:inherit;margin:0">${esc(res.alert.body)}</pre></div>
      </div>`;
      document.body.appendChild(el);
      const close = () => { el.remove(); document.body.style.overflow = ''; load(); RF.paintUser(RF.state.session); };
      qs('[data-close]', el).addEventListener('click', close);
      el.addEventListener('click', (e) => { if (e.target === el) close(); });
      document.body.style.overflow = 'hidden';
    });

    qs('[data-read-all]').addEventListener('click', async () => {
      const res = await api.post('/alerts/read-all');
      toast(`${res.marked} notification(s) marked as read.`, 'ok');
      load();
    });

    // Preferences
    const prefsForm = qs('[data-prefs]');
    const prefs = await api.get('/me/alert-preferences');
    const groups = {};
    prefs.types.forEach((type) => {
      groups[type.group] = groups[type.group] || [];
      groups[type.group].push(type);
    });
    prefsForm.innerHTML = Object.entries(groups).map(([group, types]) => `
      <h4 class="rf-label rf-mt">${esc(group)}</h4>
      ${types.map((type) => `
        <div class="rf-switch">
          <span class="t">${esc(type.label)}${type.locked ? '<small>Always on. We are required to tell you.</small>' : ''}</span>
          <input type="checkbox" name="${esc(type.id)}" ${prefs.preferences[type.id] ? 'checked' : ''} ${type.locked ? 'disabled' : ''} />
        </div>`).join('')}`).join('');

    qs('#a-threshold').value = (prefs.alertThreshold / 100).toFixed(2);
    qs('#a-low').value = (prefs.lowBalanceThreshold / 100).toFixed(2);

    qs('[data-save-prefs]').addEventListener('click', async () => {
      const preferences = {};
      qsa('input[type="checkbox"]', prefsForm).forEach((input) => { preferences[input.name] = input.checked; });
      try {
        await api.put('/me/alert-preferences', { preferences });
        await api.patch('/me/security', {
          alertThreshold: Number(qs('#a-threshold').value || 0),
          lowBalanceThreshold: Number(qs('#a-low').value || 0),
        });
        toast('Alert preferences saved.', 'ok');
      } catch (err) {
        toast(err.message, 'bad');
      }
    });

    await load();
  }

  /* ------------------------------------------------------------ messages -- */

  async function messagesPage() {
    const list = qs('[data-threads]');
    const body = qs('[data-thread]');
    const subjectField = qs('[data-subject-field]');
    const form = qs('#rf-message-form');
    let current = null;

    async function load() {
      const data = await api.get('/messages');
      list.innerHTML = data.threads.length ? data.threads.map((thread) => `
        <li data-thread="${esc(thread.id)}" class="clickable">
          <span class="t">
            <strong>${esc(thread.subject)}</strong>
            <span>${esc((thread.messages[thread.messages.length - 1] || {}).body || '').slice(0, 70)}</span>
          </span>
          ${thread.unread ? `<span class="rf-badge info">${thread.unread}</span>` : ''}
          <span class="rf-small rf-muted rf-nowrap">${ago(thread.updatedAt)}</span>
        </li>`).join('') : '<li class="rf-muted rf-small">No conversations yet.</li>';
      return data.threads;
    }

    let threads = await load();

    function render(thread) {
      current = thread.id;
      subjectField.classList.add('rf-hide');
      qs('[data-thread-subject]').textContent = thread.subject;
      body.innerHTML = thread.messages.map((m) => `
        <div style="margin-bottom:16px;padding:12px 14px;border-radius:12px;background:${m.from === 'bank' ? 'var(--rf-surface-3)' : 'var(--rf-info-soft)'}">
          <div class="rf-spread rf-small rf-muted"><strong>${esc(m.authorName || (m.from === 'bank' ? 'SMB' : 'You'))}</strong><span>${datetime(m.createdAt)}</span></div>
          <div style="margin-top:6px;white-space:pre-wrap">${esc(m.body)}</div>
        </div>`).join('');
      api.post(`/messages/${thread.id}/read`).then(() => RF.paintUser(RF.state.session)).catch(() => {});
    }

    list.addEventListener('click', (event) => {
      const row = event.target.closest('[data-thread]');
      if (!row) return;
      const thread = threads.find((t) => t.id === row.getAttribute('data-thread'));
      if (thread) render(thread);
    });

    qs('[data-new]').addEventListener('click', () => {
      current = null;
      subjectField.classList.remove('rf-hide');
      qs('[data-thread-subject]').textContent = 'New secure message';
      body.innerHTML = '<p class="rf-muted rf-small">Write your message below. Anything you send here stays inside your banking session.</p>';
    });

    RF.onSubmit(form, async (data) => {
      const payload = { body: data.body, threadId: current || undefined, subject: data.subject };
      await api.post('/messages', payload);
      form.reset();
      toast('Message sent. We usually reply within one business day.', 'ok');
      threads = await load();
      if (current) {
        const thread = threads.find((t) => t.id === current);
        if (thread) render(thread);
      }
    });

    if (threads.length) render(threads[0]);
  }

  /* -------------------------------------------------------------- router -- */

  const ROUTES = {
    '/dashboard': dashboard,
    '/accounts': accountsPage,
    '/transactions': transactionsPage,
    '/statements': statementsPage,
    '/cards': cardsPage,
    '/alerts': alertsPage,
    '/messages': messagesPage,
  };

  RF.ready(async () => {
    const route = ROUTES[location.pathname.replace(/\/$/, '') || '/dashboard'];
    if (!route) return;
    try {
      await route();
    } catch (err) {
      console.error('[smb]', err);
      toast(err.message || 'This page could not load.', 'bad');
    }
  });
}());
