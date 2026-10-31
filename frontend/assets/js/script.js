// Điều hướng dùng chung giữa các trang.
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('primary-nav');
  for (const [page, label] of [
    ['products', 'Sản phẩm'],
    ['barcode', 'Tạo Barcode / QR'],
    ['scanner', 'Quét mã bằng webcam']
  ]) {
    const link = document.createElement('a');
    link.href = `${page}.html`;
    link.textContent = label;
    if (document.body.dataset.page === page) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
  if (document.body.dataset.page !== 'products') {
    document.getElementById('message').textContent = 'Giao diện khung — chức năng chưa được triển khai.';
  }
});
