/**
 * Minimal supabase-js stand-in backed by embedded Postgres for local acceptance tests.
 * Supports from().select/eq/order/limit/single/maybeSingle, from().insert(...)[.select().single()] and rpc().
 * A user client runs every call in its own committed RLS session as `sub`; the admin client runs as the
 * database owner (service-role equivalent, no JWT).
 */
import pg from 'pg';
import { withRlsSessionCommit } from './harness.mjs';

const ident = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`unsafe identifier: ${name}`);
  return `"${name}"`;
};

function makeRunner(adminUrl, sub) {
  if (sub) return (sql, params) => withRlsSessionCommit(adminUrl, sub, (c) => c.query(sql, params));
  return async (sql, params) => {
    const c = new pg.Client({ connectionString: adminUrl });
    await c.connect();
    try {
      return await c.query(sql, params);
    } finally {
      await c.end();
    }
  };
}

function builder(run, table) {
  const state = { op: 'select', columns: '*', filters: [], order: null, limit: null, rows: null, returning: false, mode: 'many' };
  const exec = async () => {
    const params = [];
    const where = state.filters.map(([col, val]) => {
      params.push(val);
      return `${ident(col)} = $${params.length}`;
    });
    let sql;
    if (state.op === 'insert') {
      const rows = Array.isArray(state.rows) ? state.rows : [state.rows];
      const cols = Object.keys(rows[0]);
      const values = rows.map(
        (r) =>
          `(${cols
            .map((c) => {
              const v = r[c];
              params.push(v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v);
              return `$${params.length}`;
            })
            .join(', ')})`,
      );
      sql = `insert into public.${ident(table)} (${cols.map(ident).join(', ')}) values ${values.join(', ')}${state.returning ? ` returning ${state.columns === '*' ? '*' : state.columns.split(',').map((c) => ident(c.trim())).join(', ')}` : ''}`;
    } else {
      const cols = state.columns === '*' ? '*' : state.columns.split(',').map((c) => ident(c.trim())).join(', ');
      sql = `select ${cols} from public.${ident(table)}${where.length ? ` where ${where.join(' and ')}` : ''}`;
      if (state.order) sql += ` order by ${ident(state.order[0])} ${state.order[1] ? 'asc' : 'desc'}`;
      if (state.limit) sql += ` limit ${Number(state.limit)}`;
    }
    try {
      const res = await run(sql, params);
      if (state.mode === 'single') {
        if (res.rows.length !== 1) return { data: null, error: { message: 'single_row_expected', code: 'PGRST116' } };
        return { data: res.rows[0], error: null };
      }
      if (state.mode === 'maybeSingle') return { data: res.rows[0] ?? null, error: null };
      return { data: state.op === 'insert' && !state.returning ? null : res.rows, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message, code: e.code } };
    }
  };
  const api = {
    select(columns = '*') {
      if (state.op === 'insert') state.returning = true;
      state.columns = columns;
      return api;
    },
    insert(rows) {
      state.op = 'insert';
      state.rows = rows;
      return api;
    },
    eq(col, val) {
      state.filters.push([col, val]);
      return api;
    },
    order(col, opts = {}) {
      state.order = [col, opts.ascending !== false];
      return api;
    },
    limit(n) {
      state.limit = n;
      return api;
    },
    single() {
      state.mode = 'single';
      return exec();
    },
    maybeSingle() {
      state.mode = 'maybeSingle';
      return exec();
    },
    then(resolve, reject) {
      return exec().then(resolve, reject);
    },
  };
  return api;
}

export function createPgSupabaseClient(adminUrl, sub = null) {
  const run = makeRunner(adminUrl, sub);
  return {
    from: (table) => builder(run, table),
    async rpc(fn, args) {
      const names = Object.keys(args);
      const params = names.map((n) => {
        const v = args[n];
        return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
      });
      const sql = `select public.${ident(fn)}(${names.map((n, i) => `${ident(n)} => $${i + 1}`).join(', ')}) as r`;
      try {
        const res = await run(sql, params);
        return { data: res.rows[0].r, error: null };
      } catch (e) {
        return { data: null, error: { message: e.message, code: e.code } };
      }
    },
  };
}
