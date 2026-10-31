const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync(require('node:path').join(__dirname, '../assets/js/products.js'), 'utf8');

// Minimal DOM for checking the product page's requests and visible states.
class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    const classes = new Set();
    this.classList = {
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      contains: name => classes.has(name)
    };
  }
  append(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  async fire(name) { await this.listeners[name]({ preventDefault() {} }); }
}

const product = (overrides = {}) => ({
  id: 1, sku: 'SP001', name: 'Sữa tươi', category: 'Đồ uống',
  unit: 'Hộp', sale_price: '15000.50', product_serial: '00123456', type: 'QR-code',
  ...overrides
});

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => data
});

async function openPage(fetchImpl) {
  const elements = new Map();
  const calls = [];
  let start;
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
    createElement: () => new Element(),
    addEventListener: (name, callback) => { start = callback; }
  };
  vm.runInNewContext(source, {
    document, Intl, TypeError,
    fetch: async (path, options) => {
      calls.push({ path, options });
      return fetchImpl(new URL(path).pathname);
    }
  });
  start();
  await new Promise(resolve => setImmediate(resolve));
  return { get: id => document.getElementById(id), calls };
}

test('loads API data, renders literal database text and preserves serial zeros', async () => {
  const name = '<img src=x onerror=alert(1)>';
  const page = await openPage(path => jsonResponse(path === '/api/products'
    ? [product({ name })] : [{ id: 2, name: 'Đồ uống' }]));
  assert.deepEqual(page.calls.map(call => call.path), [
    'http://127.0.0.1:8080/api/products',
    'http://127.0.0.1:8080/api/categories'
  ]);
  assert.ok(page.calls.every(call => call.options.cache === 'no-store'));
  const row = page.get('products-tbody').children[0];
  assert.equal(row.children[1].textContent, name);
  assert.equal(row.children[1].children.length, 0);
  assert.equal(row.children[5].textContent, '00123456 (QR-code)');
  assert.equal(page.get('category-list').children[0].value, 'Đồ uống');
  assert.equal(page.get('product-count').textContent, '1 sản phẩm');
  assert.equal(page.get('products-empty').hidden, true);
});

test('search finds both identifier types by eight-digit serial', async () => {
  const page = await openPage(path => jsonResponse(path === '/api/products'
    ? [product(), product({ id: 2, product_serial: '98765432', type: 'barcode' })] : []));
  for (const serial of ['00123456', '98765432']) {
    page.get('product-search').value = serial;
    await page.get('product-search').fire('input');
    const rows = page.get('products-tbody').children;
    assert.equal(rows.length, 1);
    assert.ok(rows[0].children[5].textContent.startsWith(serial));
  }
});

test('refresh fetches current records again and preserves the search query', async () => {
  let current = product();
  const page = await openPage(path => jsonResponse(path === '/api/products' ? [current] : []));
  page.get('product-search').value = 'SP002';
  await page.get('product-search').fire('input');
  assert.equal(page.get('products-tbody').children.length, 0);
  current = product({ sku: 'SP002', name: 'Sản phẩm mới' });
  await page.get('btn-refresh').fire('click');
  assert.equal(page.calls.length, 4);
  assert.equal(page.get('products-tbody').children[0].children[1].textContent, 'Sản phẩm mới');
  assert.equal(page.get('product-search').value, 'SP002');
});

test('database errors clear stale rows and a later refresh recovers', async () => {
  let failed = false;
  const page = await openPage(path => failed
    ? jsonResponse({ error: 'Không thể đọc dữ liệu từ SQL Server.' }, 503)
    : jsonResponse(path === '/api/products' ? [product()] : []));
  failed = true;
  await page.get('btn-refresh').fire('click');
  assert.equal(page.get('products-tbody').children.length, 0);
  assert.match(page.get('message').textContent, /SQL Server/);
  assert.equal(page.get('message').classList.contains('error'), true);
  assert.equal(page.get('btn-refresh').disabled, false);
  await page.get('product-search').fire('input');
  assert.match(page.get('products-empty').textContent, /Không tải được/);
  failed = false;
  await page.get('btn-refresh').fire('click');
  assert.equal(page.get('products-tbody').children.length, 1);
  assert.equal(page.get('message').classList.contains('error'), false);
});

test('empty database shows the empty state', async () => {
  const page = await openPage(() => jsonResponse([]));
  assert.equal(page.get('products-empty').hidden, false);
  assert.match(page.get('products-empty').textContent, /Chưa có sản phẩm/);
  assert.equal(page.get('product-count').textContent, '0 sản phẩm');
});

test('an invalid backend response shows the API address', async () => {
  const page = await openPage(() => ({
    ok: false, status: 404, headers: { get: () => 'text/html' }
  }));
  assert.match(page.get('message').textContent, /127\.0\.0\.1:8080/);
  assert.equal(page.get('message').classList.contains('error'), true);
});

test('network failures leave refresh enabled for retry', async () => {
  const page = await openPage(() => { throw new TypeError('Failed to fetch'); });
  assert.match(page.get('message').textContent, /Không kết nối được API/);
  assert.match(page.get('message').textContent, /Live Server/);
  assert.equal(page.get('btn-refresh').disabled, false);
});
