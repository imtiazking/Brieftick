/** Playwright launch options safe on GitHub Actions Linux (no sandbox). */
export function playwrightLaunchOptions(extra = {}) {
  const opts = { headless: true, ...extra };
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    const args = new Set([...(opts.args || []), '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']);
    opts.args = [...args];
  }
  return opts;
}