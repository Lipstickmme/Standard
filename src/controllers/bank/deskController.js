'use strict';

/**
 * The /admin desk, for staff signed in to the bank.
 *
 * The desk was built to read Supabase directly under a Supabase Auth login
 * that appears on the `admins` table - a second account, separate from the
 * staff login that opens /console. This lets the console login open the desk
 * too: the same reads and writes, made by the server with the service role,
 * for a member of staff whose bank session the router has already checked.
 *
 * Only the desk's own tables, and only what the desk does to each of them.
 */

const { getSupabase } = require('../../utils/supabase');
const { asyncHandler } = require('../../bank/http');

const READ = new Set(['enquiries', 'applications', 'chat_sessions', 'chat_messages', 'email_threads', 'email_messages', 'site_settings']);
const WRITE = new Set(['enquiries', 'applications', 'chat_sessions', 'email_threads', 'site_settings']);
const INSERT = new Set(['chat_messages']);

/** One row by id: the only filter the desk ever writes through. */
const ID_FILTER = /^id=eq\.[A-Za-z0-9_-]{1,64}$/;

function store(res) {
  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({ error: 'not_configured', message: 'The database is not connected, so the desk has nothing to show.' });
    return null;
  }
  return supabase;
}

const select = asyncHandler(async (req, res) => {
  const table = req.params.table;
  if (!READ.has(table)) return res.status(404).json({ error: 'not_found', message: 'No such desk table.' });
  const supabase = store(res);
  if (!supabase) return undefined;
  const query = typeof req.query.q === 'string' ? req.query.q : '';
  return res.json(await supabase.select(table, query));
});

const update = asyncHandler(async (req, res) => {
  const table = req.params.table;
  const { filter, patch } = req.body || {};
  if (!WRITE.has(table)) return res.status(404).json({ error: 'not_found', message: 'No such desk table.' });
  if (!ID_FILTER.test(String(filter || '')) || !patch || typeof patch !== 'object') {
    return res.status(400).json({ error: 'bad_request', message: 'The desk updates one row by id.' });
  }
  const supabase = store(res);
  if (!supabase) return undefined;
  return res.json(await supabase.update(table, filter, patch));
});

const insert = asyncHandler(async (req, res) => {
  const table = req.params.table;
  const { rows } = req.body || {};
  if (!INSERT.has(table)) return res.status(404).json({ error: 'not_found', message: 'No such desk table.' });
  if (!rows || typeof rows !== 'object') return res.status(400).json({ error: 'bad_request', message: 'Nothing to add.' });
  const supabase = store(res);
  if (!supabase) return undefined;
  return res.json(await supabase.insertReturning(table, rows));
});

module.exports = { select, update, insert };
