const money = (v) => new Intl.NumberFormat('vi-VN').format(v) + ' đ';

document.addEventListener('DOMContentLoaded', async () => {
  const msg = document.getElementById('message');
  const tbody = document.getElementById('products-tbody');
  const empty = document.getElementById('products-empty');
  let products = [];
  let categories = [];
  try {
    const [pRes, cRes] = await Promise.all([
      fetch('data/products.json'),
      fetch('data/categories.json')
    ]);
    if (!pRes.ok || !cRes.ok) throw new Error('HTTP ' + (pRes.status || cRes.status));
    products = await pRes.json();
    categories = await cRes.json();
  } catch (error) {
    empty.hidden = false;
    empty.textContent = 'Không tải được dữ liệu sản phẩm: ' + error.message;
    msg.textContent = 'Lỗi tải dữ liệu. Hãy mở trang qua máy chủ HTTP (python -m http.server 5500 --directory frontend), không mở file trực tiếp.';
    msg.classList.add('error');
    return;
  }

  const count = document.getElementById('product-count');
  const search = document.getElementById('product-search');
  const catList = document.getElementById('category-list');
  const form = document.getElementById('product-form');

  // populate category datalist
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    catList.append(opt);
  });

  function render(list) {
    tbody.innerHTML = '';
    if (!list.length) {
      empty.hidden = false;
      empty.textContent = 'Không có sản phẩm phù hợp.';
      count.textContent = '0 sản phẩm';
      return;
    }
    empty.hidden = true;
    count.textContent = list.length + ' sản phẩm';
    list.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.sku}</td>
        <td>${p.name}</td>
        <td>${p.category}</td>
        <td>${p.unit}</td>
        <td>${money(p.sale_price)}</td>
        <td>${p.barcode_value} <span class="muted">(${p.barcode_type})</span></td>
        <td class="row-actions">
          <button type="button" class="secondary" data-edit="${p.id}">Sửa</button>
          <button type="button" class="secondary" data-del="${p.id}">Xóa</button>
        </td>`;
      tbody.append(tr);
    });
  }

  function filter() {
    const q = (search.value || '').toLowerCase().trim();
    if (!q) return render(products);
    render(products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode_value || '').toLowerCase().includes(q)));
  }

  search.addEventListener('input', filter);
  document.getElementById('btn-refresh').addEventListener('click', () => {
    msg.textContent = 'Đã tải lại dữ liệu từ file dữ liệu sản phẩm.';
    filter();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    msg.textContent = 'Chức năng lưu/sửa sản phẩm chưa được kết nối API backend.';
    msg.classList.add('error');
  });

  render(products);
  msg.textContent = 'Đã tải ' + products.length + ' sản phẩm từ cơ sở dữ liệu.';
});
