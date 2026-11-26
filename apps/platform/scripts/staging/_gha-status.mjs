// Prints recent GitHub Actions runs for the branch. Token is read from git credential helper and never printed.
import { execSync } from 'node:child_process';
const cred = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString();
const token = /password=(.*)/.exec(cred)?.[1]?.trim();
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'forgeniq' };
const r = await fetch('https://api.github.com/repos/imtiazking/Brieftick/actions/runs?branch=feature/ri-classification-triage&per_page=4', { headers });
const j = await r.json();
for (const run of j.workflow_runs ?? []) {
  console.log(run.run_number, run.head_sha.slice(0, 7), run.status, run.conclusion, run.name, run.html_url);
}
if (!j.workflow_runs) console.log(r.status, j.message);
