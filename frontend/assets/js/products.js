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
  const formTitle = document.getElementById('form-title');
  const formHint = document.getElementById('product-form-hint');
  const createHint = formHint.textContent;
  const nameInput = document.getElementById('prod-name');
  const quantityInput = document.getElementById('prod-quantity');
  const skuInput = document.getElementById('prod-sku');
  const serialInput = document.getElementById('prod-serial');
  const scanButton = document.getElementById('btn-scan-product');
  const scanDialog = document.getElementById('product-scan-dialog');
  const scanVideo = document.getElementById('product-scan-video');
  const scanCanvas = document.getElementById('product-scan-canvas');
  const scanPlaceholder = document.getElementById('product-scan-placeholder');
  const scanStatus = document.getElementById('product-scan-status');
  const scanClose = document.getElementById('btn-close-product-scan');
  const scanCancel = document.getElementById('btn-cancel-product-scan');
  const submit = document.getElementById('btn-submit-product');
  const cancel = document.getElementById('btn-cancel-product');
  const close = document.getElementById('btn-close-product');
  const deleteDialog = document.getElementById('delete-product-dialog');
  const deleteMessage = document.getElementById('delete-product-message');
  const deleteConfirm = document.getElementById('btn-confirm-delete-product');
  const deleteCancel = document.getElementById('btn-cancel-delete-product');
  const deleteClose = document.getElementById('btn-close-delete-product');
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
  let editingProduct = null;
  let formOpener = null;
  let deletingProduct = null;
  let deleteOpener = null;
  let deleting = false;
  let codeProduct = null;
  let codeOpener = null;
  let codeUrl = null;
  let codeController = null;
  let codeVersion = 0;
  let codeSaving = false;
  let scanStream = null;
  let scanInterval = null;
  let scanBusy = false;
  let scanOpener = null;
  let scanVersion = 0;

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

  function stopProductScan() {
    scanVersion += 1;
    if (scanInterval) clearInterval(scanInterval);
    scanInterval = null;
    scanBusy = false;
    if (scanStream) scanStream.getTracks().forEach(track => track.stop());
    scanStream = null;
    scanVideo.srcObject = null;
  }

  async function scanProductFrame() {
    if (!scanStream || scanBusy || !scanDialog.open || scanVideo.readyState < 2) return;
    const version = scanVersion;
    const width = scanVideo.videoWidth;
    const height = scanVideo.videoHeight;
    if (!width || !height) return;

    scanCanvas.width = width;
    scanCanvas.height = height;
    scanCanvas.getContext('2d').drawImage(scanVideo, 0, 0, width, height);
    scanBusy = true;
    try {
      const response = await fetch(`${API_BASE_URL}/api/scanner/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: scanCanvas.toDataURL('image/jpeg', 0.88) })
      });
      const data = await response.json();
      if (version !== scanVersion || !scanDialog.open) return;
      if (!response.ok && response.status !== 404) {
        throw new Error(data.error || 'Có lỗi khi quét mã. Hãy thử lại.');
      }
      if (!data.found || typeof data.code !== 'string') return;

      const code = data.code.trim();
      if (!code || code.length > 450 || code.includes('\0') || (/^[0-9]+$/.test(code) && code.length > 100)) {
        scanStatus.textContent = 'Mã vừa quét phải gồm 1–450 ký tự; mã số dùng làm Serial tối đa 100 chữ số.';
        scanStatus.classList.add('error');
        return;
      }
      stopProductScan();
      const target = setScannedCode(code);
      showMessage(`Đã quét ${data.code_type === 'QR-code' ? 'mã QR' : 'mã vạch'} và điền vào ${target}.`, false, formMessage);
      scanDialog.close();
    } catch (error) {
      if (version === scanVersion && scanDialog.open) {
        scanStatus.textContent = error instanceof TypeError
          ? 'Không kết nối được API quét. Hãy kiểm tra backend đang chạy.'
          : error.message || 'Có lỗi khi quét mã. Hãy thử lại.';
        scanStatus.classList.add('error');
      }
    } finally {
      if (version === scanVersion) scanBusy = false;
    }
  }

  async function startProductScan() {
    const version = ++scanVersion;
    scanStatus.textContent = 'Đang khởi động camera…';
    scanStatus.classList.remove('error');
    scanPlaceholder.hidden = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (version !== scanVersion || !scanDialog.open) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      scanStream = stream;
      scanVideo.srcObject = scanStream;
      await scanVideo.play();
      if (version !== scanVersion || !scanDialog.open) return;
      scanPlaceholder.hidden = true;
      scanStatus.textContent = 'Đưa mã vạch hoặc QR vào giữa khung hình.';
      scanInterval = setInterval(scanProductFrame, 350);
    } catch (error) {
      if (version !== scanVersion || !scanDialog.open) return;
      stopProductScan();
      scanStatus.textContent = error.message === 'camera'
        ? 'Trình duyệt không hỗ trợ camera. Hãy dùng webcam trên localhost hoặc HTTPS.'
        : 'Không thể mở camera. Hãy cấp quyền truy cập camera rồi thử lại.';
      scanStatus.classList.add('error');
    }
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
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'secondary';
      edit.textContent = 'Sửa';
      edit.setAttribute('aria-label', `Sửa sản phẩm ${product.name}`);
      edit.setAttribute('aria-haspopup', 'dialog');
      edit.setAttribute('aria-controls', 'product-dialog');
      edit.addEventListener('click', () => openEditProduct(product, edit));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'danger';
      remove.textContent = 'Xóa';
      remove.setAttribute('aria-label', `Xóa sản phẩm ${product.name}`);
      remove.setAttribute('aria-haspopup', 'dialog');
      remove.setAttribute('aria-controls', 'delete-product-dialog');
      remove.addEventListener('click', () => openDeleteProduct(product, remove));
      actionGroup.append(viewCode, edit, remove);
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
  function setScannedCode(scannedCode) {
    const scannedSerial = /^[0-9]+$/.test(scannedCode) ? scannedCode : '';
    serialInput.value = scannedSerial;
    scannedCodeInput.value = scannedCode;
    scannedCodeField.hidden = !scannedCode || !!scannedSerial;
    return scannedSerial ? 'Serial' : 'Mã vừa quét';
  }
  function openProductForm(scannedCode = '') {
    editingProduct = null;
    formOpener = add;
    form.reset();
    categorySelect.querySelector('[data-current-category]')?.remove();
    formTitle.textContent = 'Thêm sản phẩm mới';
    formHint.textContent = createHint;
    submit.textContent = 'Lưu sản phẩm';
    scanButton.hidden = false;
    setScannedCode(scannedCode);
    showMessage('', false, formMessage);
    dialog.showModal();
  }

  function openEditProduct(product, opener) {
    openProductForm();
    editingProduct = product;
    formOpener = opener;
    formTitle.textContent = 'Sửa sản phẩm';
    formHint.textContent = 'Cập nhật tên, danh mục và số lượng trong kho. SKU, serial và mã đã quét được giữ nguyên.';
    submit.textContent = 'Lưu thay đổi';
    nameInput.value = product.name;
    quantityInput.value = product.quantity ?? 0;
    skuInput.value = product.sku;
    serialInput.value = product.product_serial || '';
    scannedCodeInput.value = product.scanned_code || '';
    scannedCodeField.hidden = !product.scanned_code || product.scanned_code === product.product_serial;
    scanButton.hidden = true;
    if (!Array.from(categorySelect.options).some(option => option.value === String(product.category_id))) {
      const option = document.createElement('option');
      option.value = String(product.category_id);
      option.textContent = `${product.category} (ngừng hoạt động)`;
      option.dataset.currentCategory = 'true';
      categorySelect.append(option);
    }
    categorySelect.value = String(product.category_id);
    nameInput.focus();
  }

  function openDeleteProduct(product, opener) {
    deletingProduct = product;
    deleteOpener = opener;
    document.getElementById('delete-product-name').textContent = `${product.name} · SKU: ${product.sku}`;
    showMessage('', false, deleteMessage);
    deleteDialog.showModal();
  }

  for (const button of [deleteCancel, deleteClose]) {
    button.addEventListener('click', () => { if (!deleting) deleteDialog.close(); });
  }
  deleteDialog.addEventListener('cancel', event => { if (deleting) event.preventDefault(); });
  deleteDialog.addEventListener('close', () => {
    deletingProduct = null;
    if (deleteOpener?.isConnected) deleteOpener.focus();
    else search.focus();
  });
  deleteConfirm.addEventListener('click', async () => {
    if (deleting || !deletingProduct) return;
    const product = deletingProduct;
    deleting = true;
    deleteConfirm.disabled = deleteCancel.disabled = deleteClose.disabled = true;
    deleteConfirm.textContent = 'Đang xóa…';
    showMessage('Đang xóa sản phẩm…', false, deleteMessage);
    try {
      await requestJson(`/api/products/${product.id}`, { method: 'DELETE' });
      products = products.filter(item => item.id !== product.id);
      render();
      deleteDialog.close();
      showMessage(`Đã xóa sản phẩm ${product.name} (${product.sku}).`);
    } catch (error) {
      showMessage(error instanceof TypeError
        ? 'Mất kết nối khi xóa. Hãy tải lại danh sách để kiểm tra trước khi thử lại.'
        : error.message, true, deleteMessage);
    } finally {
      deleting = false;
      deleteConfirm.disabled = deleteCancel.disabled = deleteClose.disabled = false;
      deleteConfirm.textContent = 'Xóa sản phẩm';
    }
  });

  add.addEventListener('click', () => openProductForm());
  scanButton.addEventListener('click', () => {
    if (saving || editingProduct || !dialog.open) return;
    scanOpener = scanButton;
    scanDialog.showModal();
    startProductScan();
  });
  for (const button of [scanClose, scanCancel]) {
    button.addEventListener('click', () => scanDialog.close());
  }
  scanDialog.addEventListener('close', () => {
    stopProductScan();
    if (scanOpener?.isConnected) scanOpener.focus();
  });
  scanDialog.addEventListener('cancel', () => stopProductScan());
  for (const button of [close, cancel]) {
    button.addEventListener('click', () => { if (!saving) dialog.close(); });
  }
  dialog.addEventListener('close', () => {
    editingProduct = null;
    if (formOpener?.isConnected) formOpener.focus();
    else search.focus();
  });
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !form.reportValidity()) return;
    const existingProduct = editingProduct;
    const payload = {
      name: nameInput.value.trim(),
      category_id: Number(categorySelect.value),
      quantity: Number(quantityInput.value)
    };
    if (!existingProduct && scannedCodeInput.value) payload.scanned_code = scannedCodeInput.value;
    saving = true;
    fields.disabled = submit.disabled = cancel.disabled = close.disabled = true;
    submit.textContent = 'Đang lưu…';
    showMessage('Đang lưu sản phẩm…', false, formMessage);
    try {
      const product = await requestJson(existingProduct ? `/api/products/${existingProduct.id}` : '/api/products', {
        method: existingProduct ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (existingProduct) {
        products = products.map(item => item.id === product.id ? product : item);
      } else {
        products.unshift(product);
        search.value = '';
        page = 1;
      }
      render();
      dialog.close();
      showMessage(`Đã ${existingProduct ? 'cập nhật' : 'thêm'} sản phẩm ${product.name} (${product.sku}).`);
    } catch (error) {
      showMessage(error instanceof TypeError
        ? 'Mất kết nối khi lưu. Hãy tải lại danh sách để kiểm tra sản phẩm trước khi thử lại.'
        : error.message, true, formMessage);
    } finally {
      saving = false;
      fields.disabled = submit.disabled = cancel.disabled = close.disabled = false;
      submit.textContent = existingProduct ? 'Lưu thay đổi' : 'Lưu sản phẩm';
    }
  });

  loadProducts();
});
