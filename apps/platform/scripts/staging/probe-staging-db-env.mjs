#!/usr/bin/env node
const u = process.env.STAGING_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || '';
const host = u.match(/@([^:/]+)/)?.[1] || null;
const placeholder = /@base(\b|:|\/)/i.test(u);
console.log(
  JSON.stringify({
    hasDb: Boolean(u),
    host,
    placeholder,
    hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    supabaseProject: process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1] || null,
  }),
);
process.exit(u && !placeholder ? 0 : 2);