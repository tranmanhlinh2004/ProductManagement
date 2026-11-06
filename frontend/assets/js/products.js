// Backend API; the frontend can be served independently by Live Server.
const API_BASE_URL = 'http://127.0.0.1:8080';
const PAGE_SIZE = 10;

document.addEventListener('DOMContentLoaded', () => {
  const msg = document.getElementById('message');
  const tbody = document.getElementById('products-tbody');
  const empty = document.getElementById('products-empty');
  const count = document.getElementById('product-count');
  const search = document.getElementById('product-search');
  const categorySelect = document.getElementById('prod-category');
  const refresh = document.getElementById('btn-refresh');
  const pagination = document.getElementById('product-pagination');
  const previous = document.getElementById('btn-prev-page');
  const next = document.getElementById('btn-next-page');
  const add = document.getElementById('btn-add-product');
  const dialog = document.getElementById('product-dialog');
  const form = document.getElementById('product-form');
  const fields = document.getElementById('product-fields');
  const formMessage = document.getElementById('product-form-message');
  const submit = document.getElementById('btn-submit-product');
  const cancel = document.getElementById('btn-cancel-product');
  const close = document.getElementById('btn-close-product');
  const codeDialog = document.getElementById('code-dialog');
  const codeType = document.getElementById('code-type');
  const codeImage = document.getElementById('code-image');
  const codePreview = document.getElementById('code-preview');
  const codeMessage = document.getElementById('code-message');
  const codeSave = document.getElementById('btn-save-code');
  const codeClose = document.getElementById('btn-close-code');
  const codeRetry = document.getElementById('btn-retry-code');
  const scannedCodeField = document.getElementById('prod-scanned-code-field');
  const scannedCodeInput = document.getElementById('prod-scanned-code');
  const initialUrl = new URL(window.location.href);
  let pendingScannedCode = initialUrl.searchParams.get('scanned_code');
  let products = [];
  let loaded = false;
  let page = 1;
  let saving = false;
  let codeProduct = null;
  let codeOpener = null;
  let codeUrl = null;
  let codeController = null;
  let codeVersion = 0;
  let codeSaving = false;

  function showMessage(message, isError = false, target = msg) {
    target.textContent = message;
    target.classList.toggle('error', isError);
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(API_BASE_URL + path, { cache: 'no-store', ...options });
    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    if (!isJson) {
      throw new Error(`API trả về phản hồi không hợp lệ. Hãy kiểm tra backend tại ${API_BASE_URL}.`);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Lỗi API HTTP ${response.status}.`);
    return data;
  }

  async function fetchList(path) {
    const data = await requestJson(path);
    if (!Array.isArray(data)) throw new Error('API trả về dữ liệu không hợp lệ.');
    return data;
  }

  function clearCodeImage() {
    codePreview.hidden = codeSave.hidden = true;
    codeImage.removeAttribute('src');
    if (codeUrl) URL.revokeObjectURL(codeUrl);
    codeUrl = null;
  }

  async function loadProductCode() {
    if (!codeProduct || !codeDialog.open) return;
    const version = ++codeVersion;
    codeController?.abort();
    codeController = new AbortController();
    const product = codeProduct;
    const type = codeType.value;
    clearCodeImage();
    codeRetry.hidden = true;
    showMessage('Đang tạo mã sản phẩm…', false, codeMessage);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/products/${product.id}/code?type=${encodeURIComponent(type)}`,
        { cache: 'no-store', signal: codeController.signal }
      );
      if (!response.ok) {
        const data = (response.headers.get('content-type') || '').includes('application/json')
          ? await response.json() : {};
        throw new Error(data.error || 'Không tải được mã sản phẩm. Hãy kiểm tra và khởi động lại backend.');
      }
      if (!(response.headers.get('content-type') || '').includes('image/png')) {
        throw new Error('API trả về ảnh mã không hợp lệ.');
      }
      const blob = await response.blob();
      // A late response must never replace another product's label or a newer type.
      if (version !== codeVersion || !codeDialog.open) return;
      codeUrl = URL.createObjectURL(blob);
      codeImage.src = codeUrl;
      codeImage.alt = `${type === 'QR-code' ? 'Mã QR' : 'Mã vạch'} của ${product.name}, Serial ${product.product_serial}`;
      codePreview.hidden = codeSave.hidden = false;
      showMessage('', false, codeMessage);
    } catch (error) {
      if (version !== codeVersion || !codeDialog.open || error.name === 'AbortError') return;
      showMessage(error instanceof TypeError
        ? 'Không kết nối được API để tạo mã. Hãy kiểm tra backend và thử lại.'
        : error.message, true, codeMessage);
      codeRetry.hidden = false;
    }
  }

  function openProductCode(product, opener) {
    codeProduct = product;
    codeOpener = opener;
    codeType.value = product.type === 'barcode' ? 'barcode' : 'QR-code';
    document.getElementById('code-product-name').textContent = product.name;
    document.getElementById('code-product-details').textContent = `SKU: ${product.sku} · Serial: ${product.product_serial}`;
    codeDialog.showModal();
    return loadProductCode();
  }

  async function saveProductCode() {
    if (codeSaving || !codeProduct || codeSave.hidden || !codeDialog.open) return;
    const version = codeVersion;
    const product = codeProduct;
    const type = codeType.value;
    codeSaving = true;
    codeSave.disabled = codeType.disabled = codeClose.disabled = true;
    codeSave.textContent = 'Đang lưu…';
    showMessage('Đang lưu ảnh mã sản phẩm…', false, codeMessage);
    try {
      const result = await requestJson(`/api/products/${product.id}/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
      if (version === codeVersion && codeDialog.open) {
        showMessage(`Đã lưu ảnh vào ${result.path}.`, false, codeMessage);
      }
    } catch (error) {
      if (version === codeVersion && codeDialog.open) {
        showMessage(error instanceof TypeError
          ? 'Mất kết nối khi lưu ảnh. Hãy kiểm tra thư mục img trước khi thử lại.'
          : error.message, true, codeMessage);
      }
    } finally {
      codeSaving = false;
      codeSave.disabled = codeType.disabled = codeClose.disabled = false;
      codeSave.textContent = 'Lưu PNG';
    }
  }

  function render() {
    if (!loaded) return;
    const query = search.value.toLowerCase().trim();
    const list = products.filter(product =>
      [product.name, product.sku, product.product_serial, product.scanned_code].some(value =>
        String(value ?? '').toLowerCase().includes(query)));
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    page = Math.min(Math.max(1, page), pages);
    const start = (page - 1) * PAGE_SIZE;
    tbody.replaceChildren();
    empty.hidden = list.length > 0;
    empty.textContent = products.length
      ? 'Không có sản phẩm phù hợp.'
      : 'Chưa có sản phẩm trong cơ sở dữ liệu.';
    count.textContent = list.length + ' sản phẩm';

    for (const product of list.slice(start, start + PAGE_SIZE)) {
      const row = document.createElement('tr');
      for (const value of [
        product.sku, product.name, product.category,
        product.quantity ?? 0, product.product_serial || 'Chưa có serial'
      ]) {
        const cell = document.createElement('td');
        cell.textContent = String(value ?? '');
        row.append(cell);
      }
      const actions = document.createElement('td');
      const actionGroup = document.createElement('div');
      actionGroup.className = 'row-actions';
      const viewCode = document.createElement('button');
      viewCode.type = 'button';
      viewCode.className = 'secondary';
      viewCode.textContent = 'Xem / lưu mã';
      viewCode.setAttribute('aria-label', `Xem và lưu mã của ${product.name}`);
      viewCode.setAttribute('aria-haspopup', 'dialog');
      viewCode.setAttribute('aria-controls', 'code-dialog');
      viewCode.addEventListener('click', () => openProductCode(product, viewCode));
      actionGroup.append(viewCode);
      actions.append(actionGroup);
      row.append(actions);
      tbody.append(row);
    }
    pagination.hidden = list.length === 0;
    previous.disabled = page === 1;
    next.disabled = page === pages;
    document.getElementById('product-page').textContent = `Trang ${page} / ${pages}`;
    document.getElementById('product-range').textContent = list.length
      ? `Hiển thị ${start + 1}–${Math.min(start + PAGE_SIZE, list.length)} / ${list.length} sản phẩm`
      : '';
  }

  async function loadProducts() {
    refresh.disabled = true;
    search.disabled = true;
    add.disabled = true;
    loaded = false;
    products = [];
    tbody.replaceChildren();
    categorySelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Chọn danh mục';
    categorySelect.append(placeholder);
    pagination.hidden = true;
    count.textContent = '';
    empty.hidden = false;
    empty.textContent = 'Đang tải dữ liệu sản phẩm…';


    try {
      const [productData, categories] = await Promise.all([
        fetchList('/api/products'),
        fetchList('/api/categories')
      ]);
      products = productData;
      for (const category of categories) {
        const option = document.createElement('option');
        option.value = String(category.id);
        option.textContent = category.name;
        categorySelect.append(option);
      }
      loaded = true;
      add.disabled = categories.length === 0;
      render();
      showMessage(categories.length ? '' : 'Chưa có danh mục đang hoạt động để thêm sản phẩm.');
      if (pendingScannedCode !== null && categories.length) {
        openProductForm(pendingScannedCode);
        pendingScannedCode = null;
        initialUrl.searchParams.delete('scanned_code');
        window.history.replaceState(null, '', initialUrl.href);
      }
    } catch (error) {
      empty.hidden = false;
      empty.textContent = 'Không tải được dữ liệu. Nhấn “Tải lại” để thử lại.';
      showMessage(error instanceof TypeError
        ? `Không kết nối được API. Hãy chạy backend/run.py tại ${API_BASE_URL}, sau đó tải lại trang Live Server.`
        : error.message, true);
    } finally {
      refresh.disabled = false;
      search.disabled = false;
    }
  }

  search.addEventListener('input', () => { page = 1; render(); });
  codeType.addEventListener('change', loadProductCode);
  codeRetry.addEventListener('click', loadProductCode);
  codeSave.addEventListener('click', saveProductCode);
  codeClose.addEventListener('click', () => { if (!codeSaving) codeDialog.close(); });
  codeDialog.addEventListener('cancel', event => { if (codeSaving) event.preventDefault(); });
  codeDialog.addEventListener('close', () => {
    codeVersion += 1;
    codeController?.abort();
    codeProduct = null;
    clearCodeImage();
    if (codeOpener?.isConnected) codeOpener.focus();
    else search.focus();
  });
  refresh.addEventListener('click', loadProducts);
  previous.addEventListener('click', () => { page -= 1; render(); });
  next.addEventListener('click', () => { page += 1; render(); });
  function openProductForm(scannedCode = '') {
    form.reset();
    const scannedSerial = /^[0-9]+$/.test(scannedCode) ? scannedCode : '';
    document.getElementById('prod-serial').value = scannedSerial;
    scannedCodeInput.value = scannedCode;
    scannedCodeField.hidden = !scannedCode || !!scannedSerial;
    showMessage('', false, formMessage);
    dialog.showModal();
  }
  add.addEventListener('click', () => openProductForm());
  for (const button of [close, cancel]) {
    button.addEventListener('click', () => { if (!saving) dialog.close(); });
  }
  dialog.addEventListener('close', () => add.focus());
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !form.reportValidity()) return;
    const payload = {
      name: document.getElementById('prod-name').value.trim(),
      category_id: Number(categorySelect.value),
      quantity: Number(document.getElementById('prod-quantity').value)
    };
    if (scannedCodeInput.value) payload.scanned_code = scannedCodeInput.value;
    saving = true;
    fields.disabled = submit.disabled = cancel.disabled = close.disabled = true;
    submit.textContent = 'Đang lưu…';
    showMessage('Đang lưu sản phẩm…', false, formMessage);
    try {
      const product = await requestJson('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      products.unshift(product);
      search.value = '';
      page = 1;
      render();
      dialog.close();

    } catch (error) {
      showMessage(error instanceof TypeError
        ? 'Mất kết nối khi lưu. Hãy tải lại danh sách để kiểm tra sản phẩm trước khi thử lại.'
        : error.message, true, formMessage);
    } finally {
      saving = false;
      fields.disabled = submit.disabled = cancel.disabled = close.disabled = false;
      submit.textContent = 'Lưu sản phẩm';
    }
  });

  loadProducts();
});
