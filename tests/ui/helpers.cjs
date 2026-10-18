const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

async function closeApp(app) {
  if (!app) return;
  const child = app.process();
  const exited = !child || child.exitCode !== null
    ? Promise.resolve()
    : new Promise(resolve => child.once('exit', resolve));
  let timer;
  const timedOut = await Promise.race([
    app.close().then(() => false).catch(() => false),
    new Promise(resolve => { timer = setTimeout(() => resolve(true), 5000); })
  ]);
  clearTimeout(timer);
  if (timedOut && child && !child.killed) child.kill();
  await Promise.race([
    exited,
    new Promise(resolve => setTimeout(resolve, 3000))
  ]);
}

async function launch(options = {}, attempt = 1) {
  const base = path.join(root, '.build/ui-profiles');
  fs.mkdirSync(base, { recursive: true });
  const ownProfile = !options.profile;
  const profile = options.profile || fs.mkdtempSync(path.join(base, 'case-'));
  const env = { ...process.env, ESTUDIAIA_TEST_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({
      executablePath: options.installed ? process.env.ESTUDIAIA_INSTALLED_EXE : require('electron'),
      args: options.installed ? [] : [root],
      env,
      timeout: 30000
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => window.Estudia?.ready === true && typeof document.getElementById('sel-materia-v')?.onchange === 'function', undefined, { timeout: 8000 });
    return {
      app,
      page,
      profile,
      async close() {
        try {
          await closeApp(app);
        } finally {
          if (ownProfile) fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        }
      }
    };
  } catch (error) {
    try {
      await closeApp(app);
    } finally {
      if (ownProfile) fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
    if (ownProfile && attempt === 1) return launch(options, 2);
    throw error;
  }
}

module.exports = { launch };
