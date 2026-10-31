// Backend API; the frontend can be served independently by Live Server.
const API_BASE_URL = 'http://127.0.0.1:8080';
const money = (value) => new Intl.NumberFormat('vi-VN').format(value) + ' đ';

document.addEventListener('DOMContentLoaded', () => {
  const msg = document.getElementById('message');
  const tbody = document.getElementById('products-tbody');
  const empty = document.getElementById('products-empty');
  const count = document.getElementById('product-count');
  const search = document.getElementById('product-search');
  const catList = document.getElementById('category-list');
  const refresh = document.getElementById('btn-refresh');
  let products = [];
  let loaded = false;

  function showMessage(message, isError = false) {
    msg.textContent = message;
    msg.classList.toggle('error', isError);
  }

  async function fetchList(path) {
    const response = await fetch(API_BASE_URL + path, { cache: 'no-store' });
    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    if (!isJson) {
      throw new Error(`API trả về phản hồi không hợp lệ. Hãy kiểm tra backend tại ${API_BASE_URL}.`);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Lỗi API HTTP ${response.status}.`);
    if (!Array.isArray(data)) throw new Error('API trả về dữ liệu không hợp lệ.');
    return data;
  }

  function render(list) {
    tbody.replaceChildren();
    empty.hidden = list.length > 0;
    empty.textContent = products.length
      ? 'Không có sản phẩm phù hợp.'
      : 'Chưa có sản phẩm trong cơ sở dữ liệu.';
    count.textContent = list.length + ' sản phẩm';

    for (const product of list) {
      const row = document.createElement('tr');
      const barcode = product.product_serial
        ? `${product.product_serial} (${product.type})`
        : 'Chưa có mã';
      for (const value of [
        product.sku, product.name, product.category, product.unit,
        money(product.sale_price), barcode
      ]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      const actions = document.createElement('td');
      actions.className = 'row-actions';
      for (const label of ['Sửa', 'Xóa']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary';
        button.textContent = label;
        button.disabled = true;
        button.title = 'Chức năng sửa/xóa chưa được kết nối API.';
        actions.append(button);
      }
      row.append(actions);
      tbody.append(row);
    }
  }

  function filter() {
    if (!loaded) return;
    const query = search.value.toLowerCase().trim();
    render(products.filter(product =>
      [product.name, product.sku, product.product_serial].some(value =>
        String(value || '').toLowerCase().includes(query))));
  }

  async function loadProducts() {
    refresh.disabled = true;
    search.disabled = true;
    loaded = false;
    products = [];
    tbody.replaceChildren();
    catList.replaceChildren();
    count.textContent = '';
    empty.hidden = false;
    empty.textContent = 'Đang tải dữ liệu sản phẩm…';
    showMessage('Đang lấy dữ liệu từ cơ sở dữ liệu…');

    try {
      const [productData, categories] = await Promise.all([
        fetchList('/api/products'),
        fetchList('/api/categories')
      ]);
      products = productData;
      for (const category of categories) {
        const option = document.createElement('option');
        option.value = category.name;
        catList.append(option);
      }
      loaded = true;
      filter();
      showMessage(`Đã tải ${products.length} sản phẩm từ cơ sở dữ liệu.`);
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

  search.addEventListener('input', filter);
  refresh.addEventListener('click', loadProducts);
  document.getElementById('product-form').addEventListener('submit', event => {
    event.preventDefault();
    showMessage('Chức năng lưu/sửa sản phẩm chưa được kết nối API backend.', true);
  });

  loadProducts();
});
