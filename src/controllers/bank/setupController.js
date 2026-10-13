'use strict';

/**
 * GET /api/bank/admin/setup - the staff console's setup checklist.
 *
 * Every piece of the backend the bank depends on, each answered as done, to
 * do, or optional, with the exact fix in words an operator can follow without
 * opening the code. It reads the same signals as /api/health, but where that
 * is a diagnostic for whoever deploys the bank, this is a to-do list for
 * whoever runs it.
 *
 * Names of variables only, never values.
 */

const config = require('../../utils/config');
const system = require('../systemController');
const markets = require('../../bank/markets');
const { db } = require('../../bank/db');
const { asyncHandler } = require('../../bank/http');

const MIGRATIONS = [
  { file: '0001_init.sql', what: 'Website enquiries, applications, live chat and the /admin desk' },
  { file: '0002_email.sql', what: 'The inbound mailbox in /admin' },
  { file: '0003_bank.sql', what: 'Customers, accounts, the ledger, transfers, cards and everything else in the bank' },
  { file: '0004_bank_sms.sql', what: 'Text-message delivery status on alerts' },
  { file: '0005_bank_invest.sql', what: 'Investments: holdings, trades and stored prices' },
  { file: '0006_bank_backposting.sql', what: 'Staff booking, re-timing and reversing conversions' },
];

const setup = asyncHandler(async (req, res) => {
  const supabase = Boolean(config.supabaseUrl() && config.supabaseServiceKey());
  const items = [];
  const add = (group, id, title, status, detail, fix) => items.push({ group, id, title, status, detail, fix: fix || '' });

  /* ---- database ---- */
  add('Database', 'supabase', 'Supabase connected', supabase ? 'done' : 'todo',
    supabase ? 'Every record is stored in Supabase.' : 'The bank is running on temporary files. On Vercel they are lost between requests, so customers, balances and chats will not stay saved.',
    'Create a Supabase project, then in Vercel set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Project Settings, API) and redeploy. Connecting Supabase from Vercel\'s Storage tab sets them for you.');

  let probe = null;
  if (supabase) {
    try { probe = await system.probeSchema(); } catch (err) { probe = null; }
  }
  MIGRATIONS.forEach((m) => {
    if (!supabase) {
      add('Database', m.file, `Tables: ${m.file}`, 'blocked', m.what, 'Connect Supabase first.');
      return;
    }
    const mine = system.PROBES.filter((p) => (p.migration || '0001_init.sql') === m.file);
    const failing = mine.filter((p) => {
      const label = p.key || p.table;
      const answer = probe && probe.results ? probe.results[label] : 'not checked';
      return answer !== 'ok' && !String(answer).startsWith('optional');
    });
    add('Database', m.file, `Tables: ${m.file}`, failing.length ? 'todo' : 'done',
      failing.length ? `${m.what}. Missing or out of date: ${failing.map((p) => p.key || p.table).join(', ')}.` : m.what,
      'Open Supabase, SQL Editor, New query. Paste the whole of supabase/setup.sql from the repository and run it. It is safe to run again.');
  });

  add('Database', 'anon', 'Browser key for live chat and /admin', config.supabaseAnonKey() ? 'done' : (supabase ? 'todo' : 'blocked'),
    config.supabaseAnonKey() ? 'Visitors can chat, and staff can sign in to the /admin desk.' : 'Without it the chat widget falls back to the server and the /admin desk reports "not connected".',
    'In Vercel set SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY) to the anon/publishable key from Supabase, Project Settings, API. Also turn on Authentication, Providers, Anonymous in Supabase.');

  /* ---- security ---- */
  const key = process.env.BANK_ENCRYPTION_KEY || '';
  add('Security', 'encryption', 'Encryption key for personal data', key.length >= 32 ? 'done' : 'todo',
    key ? (key.length >= 32 ? 'SSNs, card and ID numbers are encrypted under your own key.' : 'The key is shorter than 32 characters.') : 'Running on the built-in development key. Never take real customers this way.',
    'Generate one with: openssl rand -hex 32. Set it in Vercel as BANK_ENCRYPTION_KEY before the first real customer, and never change it afterwards.');

  add('Security', 'admin', 'Staff console sign-in set by you', process.env.BANK_ADMIN_EMAIL && process.env.BANK_ADMIN_PASSWORD ? 'done' : 'todo',
    process.env.BANK_ADMIN_EMAIL ? 'The administrator comes from BANK_ADMIN_EMAIL.' : 'The administrator is still the built-in demonstration login.',
    'Set BANK_ADMIN_EMAIL and BANK_ADMIN_PASSWORD in Vercel and redeploy. The bank moves the administrator to them on the next start.');

  const devCodes = config.showDevCodes();
  add('Security', 'devcodes', 'Sign-in codes kept private', devCodes ? 'todo' : 'done',
    devCodes ? 'One-time codes are being shown on screen, and the sign-in page offers the demonstration logins. Anyone can sign in.' : 'Codes go only to the customer.',
    'Set RESEND_API_KEY so codes are emailed, and remove BANK_SHOW_DEV_CODES.');

  /* ---- email ---- */
  const resend = Boolean(config.resendApiKey());
  add('Email', 'resend', 'Email sending (Resend)', resend ? 'done' : 'todo',
    resend ? `Sending as ${config.formFrom()}.` : 'No email goes out: no sign-in codes, alerts or enquiry notifications.',
    'Create an API key at resend.com, verify standardmerchantfinance.com there (add its DNS records), then set RESEND_API_KEY, FORM_FROM and BANK_ALERT_FROM in Vercel.');
  add('Email', 'formto', 'Where enquiries and chats are announced', config.formTo() ? 'done' : 'todo',
    config.formTo() ? `Notifications go to ${config.formTo()}.` : 'New enquiries and chats are stored but nobody is told.',
    'Set FORM_TO in Vercel to an inbox you read.');
  const inbound = Boolean(config.resendWebhookSecret() && config.mailboxAddress());
  add('Email', 'inbound', 'Receiving mail in /admin', inbound ? 'done' : 'optional',
    inbound ? `Mail to ${config.mailboxAddress()} arrives in the desk.` : 'Optional. Lets the /admin desk show mail sent to your domain.',
    'In Resend turn on receiving for the domain and add a webhook to https://<your-domain>/api/inbound/resend. Set RESEND_WEBHOOK_SECRET (whsec_...) and MAILBOX_ADDRESS in Vercel.');

  /* ---- site ---- */
  const base = process.env.PUBLIC_BASE_URL || process.env.BANK_BASE_URL || process.env.APP_URL;
  add('Site', 'baseurl', 'Your web address in emails', base ? 'done' : 'todo',
    base ? `Links in emails point at ${config.baseUrl()}.` : `Links in emails point at ${config.baseUrl()}, which may be a temporary Vercel address.`,
    'Set PUBLIC_BASE_URL to https://www.standardmerchantfinance.com in Vercel (plain text, not Sensitive).');

  /* ---- prices ---- */
  let priced = [];
  try { priced = (await markets.list()).filter((a) => a.quote && !a.quote.stale); } catch (err) { priced = []; }
  const sources = Array.from(new Set(priced.map((a) => a.quote.source)));
  const fixture = /^(1|true|yes|on)$/i.test(String(process.env.MARKET_DATA_FIXTURE || ''));
  add('Investments', 'prices', 'Live market prices', fixture ? 'todo' : priced.length === markets.ASSETS.length ? 'done' : priced.length ? 'todo' : 'todo',
    fixture ? 'Showing fixed demonstration prices (MARKET_DATA_FIXTURE is set).'
      : priced.length ? `${priced.length} of ${markets.ASSETS.length} assets priced, from ${sources.join(', ')}.`
        : 'No live price could be fetched. The ticker is hidden and nobody can convert.',
    fixture ? 'Remove MARKET_DATA_FIXTURE from Vercel and redeploy.' : 'Get a free API key at finnhub.io and set FINNHUB_API_KEY in Vercel. It is the most dependable source from a cloud host.');
  add('Investments', 'finnhub', 'Real-time stock prices (Finnhub)', process.env.FINNHUB_API_KEY ? 'done' : 'optional',
    process.env.FINNHUB_API_KEY ? 'Stocks and ETFs are priced in real time.' : 'Optional but recommended. Without it, stock prices come from free sources that sometimes refuse cloud servers.',
    'Sign up free at finnhub.io, copy the API key, set FINNHUB_API_KEY in Vercel and redeploy.');

  /* ---- people ---- */
  let customers = 0;
  try { customers = (await db.users.find({ role: 'customer' })).length; } catch (err) { customers = 0; }
  const demo = await db.users.findOne({ email: (process.env.BANK_DEMO_EMAIL || 'demo@standardmerchantfinance.com').toLowerCase() }).catch(() => null);
  add('Going live', 'demo', 'Demonstration customer removed', demo ? 'optional' : 'done',
    demo ? `The seeded demonstration customer (${demo.email}) is still here with sample balances.` : 'No demonstration customer.',
    'Before taking real customers, close the demonstration customer from Customers, or keep it for training.');

  const counts = items.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {});
  res.set('Cache-Control', 'no-store');
  res.json({ items, counts, customers, storage: supabase ? 'supabase' : 'filesystem', checkedAt: new Date().toISOString() });
});

/**
 * POST /api/bank/admin/setup/test-email - send a real test email and report
 * exactly what Resend answered.
 *
 * The environment can say a key is set; only a send can say whether Resend
 * accepts it. This sends from each address the bank sends as (FORM_FROM and,
 * when different, BANK_ALERT_FROM) to the address given, lists the domains
 * on the Resend account with their sending and receiving state, and puts
 * Resend's own error, with what usually causes it, in front of the operator.
 */
const testEmail = asyncHandler(async (req, res) => {
  const notify = require('../../utils/notify');
  const to = String((req.body && req.body.to) || req.bankUser.email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return res.status(400).json({ error: 'bad_request', message: 'Give an address to send the test to.' });
  }
  if (!config.resendApiKey()) {
    return res.json({ ok: false, to, results: [], advice: ['RESEND_API_KEY is not set on this deployment, so nothing can be sent.'] });
  }

  const senders = Array.from(new Set([config.formFrom(), process.env.BANK_ALERT_FROM].filter(Boolean)));
  const explain = (error) => {
    const e = String(error || '');
    if (/resend_401|resend_403.*api key|invalid api key|api key is invalid/i.test(e)) return 'Resend rejected the API key. Create a new key with sending access and set it as RESEND_API_KEY, then redeploy.';
    if (/not verified|domain is not verified|verify a domain/i.test(e)) return 'The sending domain is not verified in Resend. Open Resend, Domains, finish the DNS records for it until it shows Verified.';
    if (/testing emails|own email address|only send testing/i.test(e)) return 'Resend is in test mode: until a domain is verified it only delivers to the account owner\'s own address. Verify the domain, or send this test to the address you signed up to Resend with.';
    if (/resend_422/i.test(e)) return 'Resend refused the message as invalid: usually the From address is malformed. Use the form Name <name@yourdomain.com>.';
    if (/resend_429/i.test(e)) return 'Resend is rate limiting this key. Wait a minute and try again.';
    if (/fetch failed|ENOTFOUND|ECONN/i.test(e)) return 'The server could not reach Resend at all.';
    return '';
  };

  const results = [];
  for (const from of senders) {
    const sent = await notify.send({
      to, from,
      subject: `Test email from ${from}`,
      text: `This is a test from the staff console.\n\nSent as: ${from}\nTo: ${to}\nAt: ${new Date().toISOString()}\n\nIf you are reading this, sending from this address works.`,
    });
    results.push({ from, ok: sent.ok, id: sent.id || null, error: sent.ok ? null : sent.error, advice: sent.ok ? '' : explain(sent.error) });
  }

  const listed = notify.domains ? await notify.domains() : { ok: false, error: 'unavailable' };
  return res.json({
    ok: results.every((r) => r.ok),
    to,
    results,
    domains: listed.ok ? listed.domains.map((d) => ({ name: d.name, status: d.status, sending: d.sending, receiving: d.receiving })) : null,
    domainsError: listed.ok ? null : listed.error,
    mailbox: config.mailboxAddress() || null,
    formTo: config.formTo() || null,
  });
});

module.exports = { setup, testEmail };
