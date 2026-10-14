export function isNodeRuntime() {
  return typeof process !== 'undefined' && Boolean(process.versions?.node);
}

export async function loadFixtureManifestBrowser(basePath = './fixtures/regulatory/') {
  const res = await fetch(`${basePath}fixtures.json`);
  if (!res.ok) throw new Error('Fixture manifest not found');
  return res.json();
}

export async function loadFixtureHtmlBrowser(fixtureFile, basePath = './fixtures/regulatory/') {
  const res = await fetch(`${basePath}${fixtureFile}`);
  if (!res.ok) throw new Error(`Fixture file not found: ${fixtureFile}`);
  return res.text();
}
