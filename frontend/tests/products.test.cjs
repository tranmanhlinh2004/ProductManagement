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
    this.open = false;
    const classes = new Set();
    this.classList = {
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      contains: name => classes.has(name)
    };
  }
  append(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  async fire(name) {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    await this.listeners[name](event);
    return event;
  }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.(); }
  focus() {}
  reportValidity() { return true; }
}

const product = (overrides = {}) => ({
  id: 1, sku: 'SP001', name: 'Sữa tươi', category: 'Đồ uống',
  unit: 'Hộp', sale_price: '15000.50', product_serial: '00123456', type: 'QR-code',
  quantity: 25,
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
  const codeUrls = [];
  const revokedUrls = [];
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
    document, Intl, TypeError, AbortController,
    URL: {
      createObjectURL: blob => {
        const url = `blob:code-${codeUrls.length + 1}`;
        codeUrls.push({ url, blob });
        return url;
      },
      revokeObjectURL: url => revokedUrls.push(url)
    },
    fetch: async (path, options) => {
      calls.push({ path, options });
      return fetchImpl(new URL(path).pathname, options);
    }
  });
  document.getElementById('product-form').reset = () => {
    for (const id of ['prod-sku', 'prod-name', 'prod-category']) document.getElementById(id).value = '';
    document.getElementById('prod-quantity').value = '0';
  };
  start();
  await new Promise(resolve => setImmediate(resolve));
  return { get: id => document.getElementById(id), calls, codeUrls, revokedUrls };
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
  assert.equal(row.children.length, 6);
  assert.equal(row.children[3].textContent, '25');
  assert.equal(row.children[4].textContent, '00123456');
  assert.equal(page.get('prod-category').children[1].value, '2');
  assert.equal(page.get('prod-category').children[1].textContent, 'Đồ uống');
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
    assert.equal(rows[0].children[4].textContent, serial);
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

test('pagination caps pages at ten, disables boundary buttons and resets after searching', async () => {
  const products = Array.from({ length: 23 }, (_, i) => product({ sku: `SP${i}`, name: `Sản phẩm ${i}` }));
  const page = await openPage(path => jsonResponse(path === '/api/products' ? products : []));
  assert.equal(page.get('products-tbody').children.length, 10);
  assert.equal(page.get('product-page').textContent, 'Trang 1 / 3');
  assert.equal(page.get('btn-prev-page').disabled, true);
  await page.get('btn-next-page').fire('click');
  assert.equal(page.get('products-tbody').children.length, 10);
  assert.equal(page.get('products-tbody').children[0].children[0].textContent, 'SP10');
  await page.get('btn-next-page').fire('click');
  assert.equal(page.get('products-tbody').children.length, 3);
  assert.equal(page.get('product-range').textContent, 'Hiển thị 21–23 / 23 sản phẩm');
  assert.equal(page.get('btn-next-page').disabled, true);
  await page.get('btn-prev-page').fire('click');
  assert.equal(page.get('product-page').textContent, 'Trang 2 / 3');
  page.get('product-search').value = 'Sản phẩm 22';
  await page.get('product-search').fire('input');
  assert.equal(page.get('products-tbody').children.length, 1);
  assert.equal(page.get('product-page').textContent, 'Trang 1 / 1');
  page.get('product-search').value = 'missing';
  await page.get('product-search').fire('input');
  assert.equal(page.get('product-pagination').hidden, true);
});

test('refresh clamps the selected page if the database shrinks', async () => {
  let products = Array.from({ length: 20 }, (_, i) => product({ id: i }));
  const page = await openPage(path => jsonResponse(path === '/api/products' ? products : []));
  await page.get('btn-next-page').fire('click');
  assert.equal(page.get('product-page').textContent, 'Trang 2 / 2');
  products = [product({ quantity: 0 })];
  await page.get('btn-refresh').fire('click');
  assert.equal(page.get('product-page').textContent, 'Trang 1 / 1');
  assert.equal(page.get('products-tbody').children[0].children[3].textContent, '0');
});

test('dialog opens on add, cancels and resets a discarded form', async () => {
  const page = await openPage(path => jsonResponse(path === '/api/products' ? [] : [{ id: 2, name: 'Đồ uống' }]));
  assert.equal(page.get('product-dialog').open, false);
  assert.equal(page.get('btn-add-product').disabled, false);
  await page.get('btn-add-product').fire('click');
  assert.equal(page.get('product-dialog').open, true);
  page.get('prod-sku').value = 'DISCARDED';
  await page.get('btn-cancel-product').fire('click');
  assert.equal(page.get('product-dialog').open, false);
  await page.get('btn-add-product').fire('click');
  assert.equal(page.get('prod-sku').value, '');
  assert.equal(page.get('prod-quantity').value, '0');
  await page.get('btn-close-product').fire('click');
  assert.equal(page.get('product-dialog').open, false);
  assert.equal(page.calls.length, 2);
});

test('saving sends the modal fields and displays the created product on the first page', async () => {
  const created = product({ id: 99, sku: 'NEW', name: 'Hàng mới', quantity: 7 });
  const page = await openPage((path, options) => jsonResponse(options.method === 'POST'
    ? created : path === '/api/products' ? Array.from({ length: 11 }, () => product()) : [{ id: 2, name: 'Đồ uống' }],
    options.method === 'POST' ? 201 : 200));
  await page.get('btn-next-page').fire('click');
  await page.get('btn-add-product').fire('click');
  page.get('prod-sku').value = 'NEW';
  page.get('prod-name').value = 'Hàng mới';
  page.get('prod-category').value = '2';
  page.get('prod-quantity').value = '7';
  await page.get('product-form').fire('submit');
  assert.deepEqual(JSON.parse(page.calls[2].options.body), { sku: 'NEW', name: 'Hàng mới', category_id: 2, quantity: 7 });
  assert.equal(page.calls[2].options.method, 'POST');
  assert.equal(page.get('product-dialog').open, false);
  assert.equal(page.get('product-page').textContent, 'Trang 1 / 2');
  assert.equal(page.get('products-tbody').children.length, 10);
  assert.equal(page.get('products-tbody').children[0].children[0].textContent, 'NEW');
  assert.match(page.get('message').textContent, /00123456/);
});

test('failed save keeps the dialog and entered values for correction', async () => {
  const page = await openPage((path, options) => options.method === 'POST'
    ? jsonResponse({ error: 'SKU đã tồn tại.' }, 409)
    : jsonResponse(path === '/api/products' ? [] : [{ id: 2, name: 'Đồ uống' }]));
  await page.get('btn-add-product').fire('click');
  page.get('prod-sku').value = 'DUP';
  await page.get('product-form').fire('submit');
  assert.equal(page.get('product-dialog').open, true);
  assert.equal(page.get('prod-sku').value, 'DUP');
  assert.match(page.get('product-form-message').textContent, /SKU đã tồn tại/);
  assert.equal(page.get('product-form-message').classList.contains('error'), true);
  assert.equal(page.get('btn-submit-product').disabled, false);
  assert.equal(page.get('product-fields').disabled, false);
  assert.equal(page.get('products-tbody').children.length, 0);
});

test('pending save prevents duplicate submission and closing with Escape', async () => {
  let finish;
  const page = await openPage((path, options) => options.method === 'POST'
    ? new Promise(resolve => { finish = resolve; })
    : jsonResponse(path === '/api/products' ? [] : [{ id: 2, name: 'Đồ uống' }]));
  await page.get('btn-add-product').fire('click');
  const pending = page.get('product-form').fire('submit');
  assert.equal(page.get('btn-submit-product').disabled, true);
  await page.get('product-form').fire('submit');
  assert.equal(page.calls.length, 3);
  assert.equal((await page.get('product-dialog').fire('cancel')).defaultPrevented, true);
  finish(jsonResponse(product(), 201));
  await pending;
  assert.equal(page.get('btn-submit-product').disabled, false);
});

test('adding is unavailable when there are no active categories', async () => {
  const page = await openPage(() => jsonResponse([]));
  assert.equal(page.get('btn-add-product').disabled, true);
  assert.match(page.get('message').textContent, /Chưa có danh mục/);
});

const pngResponse = (label = 'image') => ({
  ok: true, status: 200,
  headers: { get: () => 'image/png' },
  blob: async () => ({ label })
});
const codeButton = (page, index = 0) => page.get('products-tbody').children[index].children[5].children[0].children[0];

test('row action previews the chosen product and saves its selected format in img', async () => {
  const page = await openPage((path, options) => path.endsWith('/code')
    ? options.method === 'POST' ? jsonResponse({ path: 'img/Barcode/product-2-98765432-barcode.png' }) : pngResponse()
    : jsonResponse(path === '/api/products' ? [product(), product({ id: 2, name: 'Bánh', product_serial: '98765432', type: 'barcode' })] : []));
  assert.equal(codeButton(page, 1).textContent, 'Xem / lưu mã');
  await codeButton(page, 1).fire('click');
  assert.equal(page.get('code-dialog').open, true);
  assert.equal(page.get('code-product-name').textContent, 'Bánh');
  assert.match(page.get('code-product-details').textContent, /98765432/);
  assert.equal(page.get('code-type').value, 'barcode');
  assert.equal(page.calls[2].path, 'http://127.0.0.1:8080/api/products/2/code?type=barcode');
  assert.equal(page.get('code-preview').hidden, false);
  assert.equal(page.get('btn-save-code').hidden, false);
  await page.get('btn-save-code').fire('click');
  assert.equal(page.calls[3].path, 'http://127.0.0.1:8080/api/products/2/code');
  assert.equal(page.calls[3].options.method, 'POST');
  assert.deepEqual(JSON.parse(page.calls[3].options.body), { type: 'barcode' });
  assert.match(page.get('code-message').textContent, /Đã lưu ảnh vào img\/Barcode\/product-2-98765432-barcode.png/);
  page.get('code-type').value = 'QR-code';
  await page.get('code-type').fire('change');
  assert.equal(page.calls[4].path, 'http://127.0.0.1:8080/api/products/2/code?type=QR-code');
  assert.deepEqual(page.revokedUrls, ['blob:code-1']);
  await page.get('btn-close-code').fire('click');
  assert.equal(page.get('code-dialog').open, false);
  assert.equal(page.get('btn-save-code').hidden, true);
  assert.deepEqual(page.revokedUrls, ['blob:code-1', 'blob:code-2']);
});

test('preview errors hide saving and allow retrying the same product', async () => {
  let fail = true;
  const page = await openPage(path => path.endsWith('/code')
    ? fail ? jsonResponse({ error: 'Không tìm thấy sản phẩm.' }, 404) : pngResponse()
    : jsonResponse(path === '/api/products' ? [product()] : []));
  await codeButton(page).fire('click');
  assert.equal(page.get('btn-save-code').hidden, true);
  assert.equal(page.get('code-preview').hidden, true);
  assert.equal(page.get('btn-retry-code').hidden, false);
  assert.match(page.get('code-message').textContent, /Không tìm thấy/);
  fail = false;
  await page.get('btn-retry-code').fire('click');
  assert.equal(page.get('btn-save-code').hidden, false);
  assert.equal(page.get('btn-retry-code').hidden, true);
  assert.equal(page.get('code-message').classList.contains('error'), false);
});

test('a late response for a previous code type cannot replace the current PNG', async () => {
  let finish;
  let codeRequests = 0;
  const page = await openPage(path => path.endsWith('/code')
    ? ++codeRequests === 1 ? new Promise(resolve => { finish = resolve; }) : pngResponse('barcode')
    : jsonResponse(path === '/api/products' ? [product()] : []));
  const first = codeButton(page).fire('click');
  page.get('code-type').value = 'barcode';
  await page.get('code-type').fire('change');
  finish(pngResponse('old QR'));
  await first;
  assert.equal(page.codeUrls.length, 1);
  assert.equal(page.codeUrls[0].blob.label, 'barcode');
  assert.equal(page.get('btn-save-code').hidden, false);
  assert.equal(page.calls[2].options.signal.aborted, true);
});

test('closing a loading preview cancels the request and hides saving', async () => {
  let finish;
  const page = await openPage(path => path.endsWith('/code')
    ? new Promise(resolve => { finish = resolve; })
    : jsonResponse(path === '/api/products' ? [product()] : []));
  const pending = codeButton(page).fire('click');
  await page.get('btn-close-code').fire('click');
  finish(pngResponse());
  await pending;
  assert.equal(page.codeUrls.length, 0);
  assert.equal(page.get('btn-save-code').hidden, true);
  assert.equal(page.calls[2].options.signal.aborted, true);
});


test('saving errors keep the preview available and restore the save button', async () => {
  const page = await openPage((path, options) => path.endsWith('/code')
    ? options.method === 'POST' ? jsonResponse({ error: 'Không thể lưu ảnh vào thư mục img.' }, 500) : pngResponse()
    : jsonResponse(path === '/api/products' ? [product()] : []));
  await codeButton(page).fire('click');
  await page.get('btn-save-code').fire('click');
  assert.match(page.get('code-message').textContent, /Không thể lưu ảnh/);
  assert.equal(page.get('code-message').classList.contains('error'), true);
  assert.equal(page.get('code-preview').hidden, false);
  assert.equal(page.get('btn-save-code').disabled, false);
  assert.equal(page.get('code-type').disabled, false);
  assert.equal(page.get('btn-close-code').disabled, false);
});

test('saving prevents duplicate requests and changing or closing the selected product', async () => {
  let finish;
  const page = await openPage((path, options) => path.endsWith('/code')
    ? options.method === 'POST' ? new Promise(resolve => { finish = resolve; }) : pngResponse()
    : jsonResponse(path === '/api/products' ? [product()] : []));
  await codeButton(page).fire('click');
  const pending = page.get('btn-save-code').fire('click');
  assert.equal(page.get('btn-save-code').disabled, true);
  assert.equal(page.get('code-type').disabled, true);
  await page.get('btn-save-code').fire('click');
  assert.equal(page.calls.filter(call => call.options.method === 'POST').length, 1);
  await page.get('btn-close-code').fire('click');
  assert.equal(page.get('code-dialog').open, true);
  assert.equal((await page.get('code-dialog').fire('cancel')).defaultPrevented, true);
  finish(jsonResponse({ path: 'img/QR/product-1-00123456-qr.png' }));
  await pending;
  assert.equal(page.get('btn-save-code').disabled, false);
  assert.match(page.get('code-message').textContent, /img\/QR\/product-1-00123456-qr.png/);
});
