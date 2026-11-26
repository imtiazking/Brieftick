// Prints failing steps and the tail of the failing job log for a run. Token never printed.
import { execSync } from 'node:child_process';
const runId = process.argv[2];
const cred = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString();
const token = /password=(.*)/.exec(cred)?.[1]?.trim();
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'forgeniq' };
const jr = await (await fetch(`https://api.github.com/repos/imtiazking/Brieftick/actions/runs/${runId}/jobs`, { headers })).json();
for (const job of jr.jobs ?? []) {
  console.log('JOB', job.name, job.conclusion);
  for (const st of job.steps ?? []) if (st.conclusion === 'failure') console.log('  FAILED STEP', st.name);
  if (job.conclusion === 'failure') {
    const lr = await fetch(`https://api.github.com/repos/imtiazking/Brieftick/actions/jobs/${job.id}/logs`, { headers, redirect: 'follow' });
    const text = await lr.text();
    const lines = text.split('\n');
    const idx = lines.findIndex((l) => /FAIL|Error|error:/.test(l) && !/##\[group\]/.test(l));
    console.log(lines.slice(Math.max(0, lines.length - 60)).join('\n'));
    console.log('--- first error at line', idx);
    if (idx >= 0) console.log(lines.slice(Math.max(0, idx - 5), idx + 15).join('\n'));
  }
}
