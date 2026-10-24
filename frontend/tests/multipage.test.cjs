// Run from the project root: node frontend/tests/multipage.test.cjs
// Uses an isolated browser profile and only Node built-ins; no npm install required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const frontend = path.resolve(__dirname, '..');
const pages = ['index', 'products', 'categories', 'barcode', 'scanner', 'stock-in', 'stock-out', 'stocktake', 'reports', 'activity-logs', 'users', 'alerts'];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const browserPath = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(candidate => fs.existsSync(candidate));

async function until(check, description) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await pause(50);
  }
  throw new Error(`Timed out: ${description}`);
}

async function run() {
  assert(browserPath, 'Install Chrome/Edge or set CHROME_PATH.');
  assert.equal(typeof WebSocket, 'function', 'Use Node.js 22 or newer.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-browser-'));
  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
    const file = path.resolve(frontend, relative);
    if (!file.startsWith(frontend + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
    res.writeHead(200, { 'Content-Type': `${mime[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
    fs.createReadStream(file).pipe(res);
  });
  let browser;
  let socket;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', ...(process.env.WAREHOUSE_BROWSER_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    browser.on('error', error => { throw error; });
    const portFile = path.join(profile, 'DevToolsActivePort');
    await until(() => fs.existsSync(portFile), 'browser debugging port');
    const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
    const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(10000) }).then(r => r.json());
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await until(() => socket.readyState === WebSocket.OPEN, 'browser connection');
    let nextId = 0;
    const pending = new Map();
    const errors = [];
    const badResponses = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const callback = pending.get(message.id);
        if (!callback) return;
        pending.delete(message.id);
        clearTimeout(callback.timeout);
        message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result);
      } else if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        errors.push(details.exception?.description || details.text);
      } else if (message.method === 'Network.responseReceived') {
        const response = message.params.response;
        if (response.url.startsWith(origin) && response.status >= 400 && !response.url.endsWith('/favicon.ico')) badResponses.push(response.url);
      }
    });
    function cdp(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 10000);
        pending.set(id, { resolve, reject, timeout });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
    async function evaluate(expression) {
      const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    }
    async function ready(page) {
      await until(async () => {
        try {
          return await evaluate(`location.pathname.endsWith('/${page}.html') && document.readyState === 'complete' && typeof AppState !== 'undefined' && AppState.activePage === document.body.dataset.page`);
        } catch { return false; }
      }, `${page} ready`);
    }
    async function go(page, query = '') {
      await cdp('Page.navigate', { url: `${origin}/sources/${page}.html${query}` });
      await ready(page);
    }
    const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click(); true`);
    const set = (id, value) => evaluate(`document.getElementById(${JSON.stringify(id)}).value = ${JSON.stringify(value)}; true`);
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Network.enable');
    await cdp('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

    for (const page of pages) {
      await go(page);
      const state = await evaluate(`({
        sections: document.querySelectorAll('main > section').length,
        links: document.querySelectorAll('.sidebar-menu a[href]').length,
        current: document.querySelector('.sidebar-menu [aria-current="page"]').dataset.page,
        page: document.body.dataset.page,
        visible: getComputedStyle(document.querySelector('main > section')).display,
        styles: [...document.querySelectorAll('link[rel="stylesheet"]')].filter(link => link.href.startsWith(location.origin)).every(link => link.sheet),
        overflow: getComputedStyle(document.querySelector('.table-responsive') || document.body).overflowX,
        rows: document.querySelectorAll('main tbody tr').length,
        duplicateIds: [...document.querySelectorAll('[id]')].length !== new Set([...document.querySelectorAll('[id]')].map(el => el.id)).size
      })`);
      assert.equal(state.sections, 1, page);
      assert.equal(state.links, 12, page);
      assert.equal(state.current, state.page, page);
      assert.equal(state.visible, 'block', page);
      assert.equal(state.styles, true, `styles: ${page}`);
      assert.equal(state.duplicateIds, false, page);
      if (!['barcode', 'scanner'].includes(page)) {
        assert(state.rows > 0, `rendered rows: ${page}`);
        assert.equal(state.overflow, 'auto', `horizontal table scrolling: ${page}`);
      }
    }
    console.log('PASS: all 12 pages render with working styles, tables and sidebar links.');

    await go('index');
    await click('btn-dash-create-sku');
    await ready('products');
    assert(await evaluate('document.getElementById("modal-product").classList.contains("active")'));
    await set('prod-sku', 'TEST-SKU');
    await set('prod-name', 'Navigation test product');
    await set('prod-import-price', '100');
    await set('prod-sale-price', '200');
    await click('btn-submit-product');
    assert(await evaluate('AppState.products.some(p => p.sku === "TEST-SKU")'));
    assert.equal(await evaluate('document.getElementById("sidebar-alert-badge").textContent'), '3');
    await evaluate('document.querySelector(".nav-link[data-page=stocktake]").click(); true');
    await ready('stocktake');
    assert(await evaluate('document.getElementById("inventory-overview-tbody").textContent.includes("TEST-SKU")'));
    console.log('PASS: Dashboard opens product creation; new product persists across sidebar navigation.');

    await set('global-quick-search', 'TEST-SKU');
    await evaluate('document.getElementById("global-quick-search").dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", bubbles: true })); true');
    await ready('scanner');
    assert(await evaluate('document.getElementById("scan-res-name").textContent === "Navigation test product"'));
    await click('btn-scan-add-to-in');
    await ready('stock-in');
    assert(await evaluate('document.getElementById("modal-create-tx").classList.contains("active") && AppState.currentCart[0].sku === "TEST-SKU"'));
    await set('tx-partner', 'Test supplier');
    await click('btn-confirm-tx-save');
    assert.equal(await evaluate('AppState.products.find(p => p.sku === "TEST-SKU").stock'), 1);
    await go('scanner', '?code=TEST-SKU');
    await click('btn-scan-add-to-out');
    await ready('stock-out');
    await set('tx-partner', 'Test customer');
    await click('btn-confirm-tx-save');
    assert.equal(await evaluate('AppState.products.find(p => p.sku === "TEST-SKU").stock'), 0);
    console.log('PASS: global search, scanner handoff, stock import and stock export preserve SKU and stock.');

    await go('alerts');
    await evaluate('quickCreateImportForSKU("TEST-SKU"); true');
    await ready('stock-in');
    assert(await evaluate('AppState.currentCart[0].sku === "TEST-SKU"'));
    await click('btn-save-tx-draft');
    await go('stocktake');
    await click('btn-open-new-stocktake');
    await evaluate('const idx = AppState.products.filter(p => p.status === "active").findIndex(p => p.sku === "TEST-SKU"); document.getElementById(`st-count-${idx}`).value = "3"; recalcStocktakeDiff(idx); true');
    await click('btn-submit-stocktake-approve');
    await go('reports');
    assert(await evaluate('document.getElementById("report-tbody").textContent.includes("TEST-SKU") && AppState.products.find(p => p.sku === "TEST-SKU").stock === 3'));
    for (const type of ['valuation', 'ranking', 'summary']) {
      await set('report-type-select', type);
      await evaluate('document.getElementById("report-type-select").dispatchEvent(new Event("change")); true');
      assert(await evaluate('document.querySelectorAll("#report-tbody tr").length > 0'));
    }
    await go('activity-logs');
    assert(await evaluate('document.getElementById("activity-logs-tbody").textContent.includes("STOCKTAKE_APPROVE")'));
    console.log('PASS: alerts open a prefilled import; draft saving, stocktake, reports and activity log work across pages.');

    await go('barcode');
    await set('barcode-select-product', 'TEST-SKU');
    await evaluate('document.getElementById("barcode-select-product").dispatchEvent(new Event("change")); true');
    await set('barcode-input-payload', 'TEST-CODE');
    await click('btn-save-barcode');
    await go('scanner', '?code=TEST-CODE');
    assert(await evaluate('document.getElementById("scan-res-sku").textContent.includes("TEST-SKU")'));
    await go('categories');
    await click('btn-open-create-category');
    await set('cat-name', 'Test category');
    await click('btn-submit-category');
    await go('products');
    assert(await evaluate('document.getElementById("filter-prod-category").textContent.includes("Test category")'));
    await go('users');
    await click('btn-open-create-user');
    await set('user-username', 'test_user');
    await set('user-fullname', 'Test User');
    await set('user-password', 'local-test-only');
    await click('btn-submit-user');
    await click('btn-toggle-role');
    await go('products', '?action=create');
    assert.equal(await evaluate('document.getElementById("current-user-role-badge").textContent'), 'STAFF');
    assert.equal(await evaluate('document.getElementById("modal-product").classList.contains("active")'), false);
    await click('btn-toggle-role');
    await go('users');
    assert(await evaluate('document.getElementById("users-table-tbody").textContent.includes("test_user")'));
    const history = await cdp('Page.getNavigationHistory');
    const previousEntry = history.entries[history.currentIndex - 1];
    await cdp('Page.navigateToHistoryEntry', { entryId: previousEntry.id });
    await ready('products');
    assert.equal(await evaluate('document.getElementById("current-user-role-badge").textContent'), 'ADMIN');
    console.log('PASS: barcode mapping, categories, users and role selection survive page changes.');

    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const page of pages) {
      await go(page);
      assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `mobile overflow: ${page}`);
      await click('btn-topbar-sidebar-toggle');
      assert(await evaluate('document.body.classList.contains("sidebar-mobile-open")'), `mobile menu: ${page}`);
      await click('sidebar-overlay');
      assert.equal(await evaluate('document.body.classList.contains("sidebar-mobile-open")'), false, page);
    }
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await go('index');
    await evaluate('document.body.classList.remove("sidebar-collapsed"); renderDashboardChart(); true');
    await pause(300); // Wait for the page fade-in before capturing its appearance.
    const screenshot = await cdp('Page.captureScreenshot', { format: 'png' });
    const screenshotPath = path.join(os.tmpdir(), 'warehouse-dashboard-preview.png');
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    assert.deepEqual(errors, [], 'browser JavaScript errors');
    assert.deepEqual(badResponses, [], 'missing local assets');
    console.log('PASS: all 12 mobile layouts, sidebar controls, zero JavaScript errors and zero missing assets.');
    console.log(`Preview: ${screenshotPath}`);
  } finally {
    if (socket) socket.close();
    if (browser && browser.exitCode === null) {
      const exited = new Promise(resolve => browser.once('exit', resolve));
      browser.kill();
      await Promise.race([exited, pause(2000)]);
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    // Only remove the unique, temporary browser profile created by this test.
    if (path.dirname(profile) === os.tmpdir() && path.basename(profile).startsWith('warehouse-browser-')) {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
