const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = readFileSync(path.join(__dirname, '../assets/js/scanner.js'), 'utf8');
const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300, status, json: async () => data
});
const unknown = (code = '8850092300500', code_type = 'barcode') => ({
  found: true, matched: false, code, code_type, product: null
});

class Element {
  constructor() {
    this.listeners = {};
    this.textContent = this.value = '';
    this.hidden = this.open = this.disabled = false;
    this.style = {};
    const classes = new Set();
    this.classList = {
      add: name => classes.add(name), remove: name => classes.delete(name),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      contains: name => classes.has(name)
    };
  }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  async fire(name) { await this.listeners[name]?.({ preventDefault() {} }); }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.(); }
  focus() { this.focused = true; }
  select() {}
  async play() {}
  getContext() { return { drawImage() {} }; }
  toDataURL() { return 'data:image/jpeg;base64,frame'; }
}

function openPage(fetchImpl) {
  const elements = new Map();
  const calls = [];
  const navigations = [];
  let initialize, scanFrame, fileReadPromise, now = 10000, stopped = false;
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  Object.assign(get('camera-video'), { readyState: 2, videoWidth: 1280, videoHeight: 720 });
  get('camera-uploaded-preview').hidden = true;
  vm.runInNewContext(source, {
    document: { getElementById: get, addEventListener: (_, callback) => { initialize = callback; } },
    window: {
      location: {
        port: '8080', href: 'http://127.0.0.1:8080/sources/scanner.html',
        assign: url => navigations.push(url)
      },
      addEventListener() {}
    },
    navigator: {
      mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped = true; } }] }) }
    },
    URL, console, Date: { now: () => now },
    setInterval: callback => { scanFrame = callback; return 1; }, clearInterval() {},
    FileReader: class {
      readAsDataURL() { fileReadPromise = this.onload({ target: { result: 'data:image/png;base64,upload' } }); }
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return fetchImpl(url, options);
    }
  });
  initialize();
  return {
    get, calls, navigations,
    async startCamera() {
      await get('btn-toggle-cam').fire('click');
      await new Promise(resolve => setImmediate(resolve));
    },
    frame: () => scanFrame(),
    advanceTime: () => { now += 3000; },
    stopped: () => stopped,
    async upload() {
      get('input-file-scan').files = [{ name: 'code.png' }];
      await get('input-file-scan').fire('change');
      await fileReadPromise;
    },
    async lookup(code) {
      get('lookup-code').value = code;
      await get('lookup-form').fire('submit');
    }
  };
}

for (const type of ['QR-code', 'barcode']) {
  test(`unknown ${type} opens one dialog, pauses camera requests and respects Exit`, async () => {
    let result = unknown('8850092300500', type);
    const page = openPage(() => jsonResponse(result, result.found ? 404 : 200));
    await page.startCamera();
    await page.frame();
    assert.equal(page.get('unknown-product-dialog').open, true);
    assert.equal(page.get('lookup-code').value, '8850092300500');
    assert.match(page.get('unknown-product-code').textContent, /8850092300500/);
    assert.match(page.get('cam-status').textContent, /tạm dừng/);
    await page.frame();
    assert.equal(page.calls.length, 1);
    await page.get('btn-exit-unknown-product').fire('click');
    assert.equal(page.get('unknown-product-dialog').open, false);
    assert.equal(page.get('lookup-code').focused, true);
    page.advanceTime();
    await page.frame();
    assert.equal(page.get('unknown-product-dialog').open, false);
    result = { found: false };
    await page.frame();
    result = unknown('8850092300500', type);
    await page.frame();
    assert.equal(page.get('unknown-product-dialog').open, true);
  });
}

test('uploaded unknown code is displayed literally and carried intact to the product form', async () => {
  const code = '0000123/<img src=x onerror=alert(1)>?a=1&b=+ # tiếng Việt';
  const page = openPage(() => jsonResponse(unknown(code, 'QR-code'), 404));
  await page.upload();
  assert.equal(page.get('unknown-product-dialog').open, true);
  assert.equal(page.get('unknown-product-code').textContent, `Mã vừa quét: ${code}`);
  await page.get('btn-add-unknown-product').fire('click');
  const destination = new URL(page.navigations[0]);
  assert.equal(destination.pathname, '/sources/products.html');
  assert.equal(destination.searchParams.get('scanned_code'), code);
});

test('adding a product from the live camera stops the webcam before navigating', async () => {
  const page = openPage(() => jsonResponse(unknown(), 404));
  await page.startCamera();
  await page.frame();
  await page.get('btn-add-unknown-product').fire('click');
  assert.equal(page.stopped(), true);
  assert.equal(page.navigations.length, 1);
});

test('manual and USB lookups can reopen a dismissed code while preserving leading zeros', async () => {
  const code = '0000012345678';
  const page = openPage(() => jsonResponse({ found: false, code }, 404));
  await page.lookup(code);
  assert.equal(page.get('unknown-product-dialog').open, true);
  await page.get('btn-exit-unknown-product').fire('click');
  await page.lookup(code);
  assert.equal(page.get('unknown-product-dialog').open, true);
  assert.equal(page.get('lookup-code').value, code);
  assert.equal(page.get('btn-lookup').disabled, false);
});

test('database failures and invalid 404 responses do not offer product creation', async () => {
  for (const status of [404, 503]) {
    const page = openPage(() => jsonResponse({ error: 'Không thể truy cập SQL Server.' }, status));
    await page.lookup('1234');
    assert.equal(page.get('unknown-product-dialog').open, false);
    assert.match(page.get('message').textContent, /SQL Server/);
    await page.upload();
    assert.equal(page.get('unknown-product-dialog').open, false);
    await page.startCamera();
    await page.frame();
    assert.equal(page.get('unknown-product-dialog').open, false);
  }
});

test('known products are still displayed without opening the unknown-code dialog', async () => {
  const product = { name: 'Sữa', sku: 'SP0001', product_serial: '00123456', is_active: true };
  const page = openPage(() => jsonResponse({ found: true, matched: true, code: '00123456', product }));
  await page.upload();
  assert.equal(page.get('scan-result').hidden, false);
  assert.equal(page.get('scan-res-name').textContent, 'Sữa');
  assert.equal(page.get('unknown-product-dialog').open, false);
});
