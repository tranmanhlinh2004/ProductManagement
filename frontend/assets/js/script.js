const CODE128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112"
];

function generateCode128SVG(text) {
  let cleanText = (text || "").trim();
  if (!cleanText) cleanText = "SP000125";
  let values = [104];
  let checkSum = 104;
  for (let i = 0; i < cleanText.length; i++) {
    let code = cleanText.charCodeAt(i) - 32;
    if (code < 0 || code > 95) code = 0;
    values.push(code);
    checkSum += code * (i + 1);
  }
  values.push(checkSum % 103);
  values.push(106);

  let fullPattern = "";
  for (let v of values) {
    fullPattern += (CODE128_PATTERNS[v] || "212222");
  }

  let barWidth = 2;
  let height = 65;
  let x = 14;
  let rects = [];
  let isBar = true;

  for (let i = 0; i < fullPattern.length; i++) {
    let w = parseInt(fullPattern[i], 10) * barWidth;
    if (isBar) {
      rects.push(`<rect x="${x}" y="10" width="${w}" height="${height}" fill="#000"/>`);
    }
    x += w;
    isBar = !isBar;
  }

  let totalWidth = x + 14;
  return `<svg width="${totalWidth}" height="${height + 26}" viewBox="0 0 ${totalWidth} ${height + 26}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${totalWidth}" height="${height + 26}" fill="#fff"/>
    ${rects.join("")}
    <text x="${totalWidth / 2}" y="${height + 22}" font-size="12" font-family="monospace" font-weight="bold" text-anchor="middle" fill="#000">${cleanText}</text>
  </svg>`;
}

function generateSimpleQRSVG(text) {
  let cleanText = (text || "").trim();
  let size = 25;
  let matrix = Array(size).fill(0).map(() => Array(size).fill(0));

  function setFinder(r, c) {
    for (let i = -1; i <= 7; i++) {
      for (let j = -1; j <= 7; j++) {
        let nr = r + i, nc = c + j;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          matrix[nr][nc] = 0;
        }
      }
    }
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        if (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) {
          matrix[r + i][c + j] = 1;
        }
      }
    }
  }

  setFinder(0, 0);
  setFinder(0, size - 7);
  setFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0 ? 1 : 0;
    matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }

  let hash = 0;
  for (let i = 0; i < cleanText.length; i++) {
    hash = (hash << 5) - hash + cleanText.charCodeAt(i);
    hash |= 0;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if ((r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8)) continue;
      if (r === 6 || c === 6) continue;
      let bit = Math.abs(Math.sin((r * 31 + c * 17 + hash))) > 0.48 ? 1 : 0;
      matrix[r][c] = bit;
    }
  }

  let cellSize = 6;
  let pad = 12;
  let totalDim = size * cellSize + pad * 2;
  let rects = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === 1) {
        rects.push(`<rect x="${pad + c * cellSize}" y="${pad + r * cellSize}" width="${cellSize}" height="${cellSize}" fill="#000"/>`);
      }
    }
  }

  return `<svg width="${totalDim}" height="${totalDim}" viewBox="0 0 ${totalDim} ${totalDim}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${totalDim}" height="${totalDim}" fill="#fff"/>
    ${rects.join("")}
  </svg>`;
}

const AppState = {
  currentUser: {
    username: "admin",
    name: "Quản Trị Viên",
    role: "ADMIN"
  },
  categories: [
    { id: 1, name: "Bàn phím cơ", description: "Bàn phím cơ cơ học, custom, không dây", status: "active" },
    { id: 2, name: "Chuột Gaming & Văn phòng", description: "Chuột không dây, chuột công thái học", status: "active" },
    { id: 3, name: "Tai nghe & Âm thanh", description: "Tai nghe True Wireless, chụp tai gaming", status: "active" },
    { id: 4, name: "Màn hình hiển thị", description: "Màn hình Gaming 144Hz, đồ họa 4K", status: "active" },
    { id: 5, name: "Phụ kiện kho & Cáp kết nối", description: "Dây cáp, hub, giá đỡ", status: "active" }
  ],
  products: [
    {
      id: 1,
      sku: "SP000125",
      name: "Bàn phím cơ A",
      categoryId: 1,
      unit: "Chiếc",
      importPrice: 850000,
      salePrice: 1250000,
      stock: 30,
      minStock: 5,
      barcode: "SP000125",
      barcodeType: "CODE128",
      status: "active",
      desc: "Switch Blue, LED RGB đổi màu, kết nối Type-C rời"
    },
    {
      id: 2,
      sku: "SP000126",
      name: "Chuột không dây B",
      categoryId: 2,
      unit: "Con",
      importPrice: 320000,
      salePrice: 550000,
      stock: 12,
      minStock: 4,
      barcode: "SP000126",
      barcodeType: "CODE128",
      status: "active",
      desc: "Cảm biến 16000 DPI, pin sạc Type-C, trọng lượng siêu nhẹ"
    },
    {
      id: 3,
      sku: "SP000127",
      name: "Tai nghe C",
      categoryId: 3,
      unit: "Bộ",
      importPrice: 450000,
      salePrice: 790000,
      stock: 0,
      minStock: 3,
      barcode: "SP000127",
      barcodeType: "QR",
      status: "active",
      desc: "Âm vòm 7.1, mic lọc ồn thông minh"
    },
    {
      id: 4,
      sku: "SP000128",
      name: "Màn hình 24 inch 165Hz",
      categoryId: 4,
      unit: "Cái",
      importPrice: 2800000,
      salePrice: 3590000,
      stock: 4,
      minStock: 5,
      barcode: "SP000128",
      barcodeType: "CODE128",
      status: "active",
      desc: "Tấm nền IPS Full HD, thời gian phản hồi 1ms"
    }
  ],
  transactions: [
    {
      id: 1,
      code: "IN-20261020-001",
      kind: "IN",
      partner: "Tổng kho Phân Phối Hà Nội",
      status: "CONFIRMED",
      createdBy: "Quản Trị Viên",
      createdAt: "2026-10-20 09:30:00",
      note: "Nhập lô bàn phím & chuột theo đơn hợp đồng số 42",
      items: [
        { sku: "SP000125", name: "Bàn phím cơ A", qty: 30, price: 850000 },
        { sku: "SP000126", name: "Chuột không dây B", qty: 20, price: 320000 }
      ]
    },
    {
      id: 2,
      code: "OUT-20261021-001",
      kind: "OUT",
      partner: "Đại lý Máy Tính Miền Bắc",
      status: "CONFIRMED",
      createdBy: "kho_staff1",
      createdAt: "2026-10-21 14:15:00",
      note: "Xuất giao hàng cho chi nhánh",
      items: [
        { sku: "SP000126", name: "Chuột không dây B", qty: 8, price: 550000 }
      ]
    }
  ],
  stocktakes: [
    {
      id: 1,
      code: "ST-20261019-01",
      date: "2026-10-19 16:00:00",
      author: "Quản Trị Viên",
      status: "COMPLETED",
      itemsCount: 3,
      plusDiff: 0,
      minusDiff: 2,
      note: "Kiểm đếm định kỳ tuần 42"
    }
  ],
  users: [
    { id: 1, username: "admin", fullname: "Quản Trị Viên", role: "ADMIN", status: "active", createdAt: "2026-10-01" },
    { id: 2, username: "kho_staff1", fullname: "Nguyễn Văn An", role: "STAFF", status: "active", createdAt: "2026-10-05" },
    { id: 3, username: "kho_staff2", fullname: "Trần Thị Mai", role: "STAFF", status: "active", createdAt: "2026-10-10" }
  ],
  activityLogs: [
    {
      id: 1,
      timestamp: "2026-10-20 09:30:00",
      username: "admin",
      role: "ADMIN",
      action: "CONFIRM_STOCK_IN",
      object: "IN-20261020-001",
      diff: "Nhập tồn: SP000125 (+30), SP000126 (+20)",
      result: "Thành công"
    },
    {
      id: 2,
      timestamp: "2026-10-21 14:15:00",
      username: "kho_staff1",
      role: "STAFF",
      action: "CONFIRM_STOCK_OUT",
      object: "OUT-20261021-001",
      diff: "Xuất kho: SP000126 (-8)",
      result: "Thành công"
    }
  ],
  currentCart: [],
  cameraActive: false,
  camAnimFrame: null,
  activePage: "dashboard"
};

function formatCurrency(num) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num || 0);
}

function getFormattedNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div style="font-size:0.86rem; color:#fff; flex:1;">${message}</div>
    <button style="background:none; border:none; color:#94a3b8; cursor:pointer;" onclick="this.parentElement.remove()">&times;</button>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4200);
}

function addActivityLog(action, object, diff, result = "Thành công") {
  const newLog = {
    id: AppState.activityLogs.length + 1,
    timestamp: getFormattedNow(),
    username: AppState.currentUser.username,
    role: AppState.currentUser.role,
    action: action,
    object: object,
    diff: diff,
    result: result
  };
  AppState.activityLogs.unshift(newLog);
  renderActivityLogs();
}

const PAGE_ROUTES = {
  dashboard: "index.html",
  products: "products.html",
  categories: "categories.html",
  barcode: "barcode.html",
  scanner: "scanner.html",
  "stock-in": "stock-in.html",
  "stock-out": "stock-out.html",
  stocktake: "stocktake.html",
  reports: "reports.html",
  "activity-logs": "activity-logs.html",
  users: "users.html",
  alerts: "alerts.html"
};
const STATE_STORAGE_KEY = "tgmt_warehouse_state_v1";
const SAVED_STATE_FIELDS = ["currentUser", "categories", "products", "transactions", "stocktakes", "users", "activityLogs"];

function saveAppState() {
  try {
    const saved = Object.fromEntries(SAVED_STATE_FIELDS.map(key => [key, AppState[key]]));
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(saved));
  } catch (error) {
    // The UI also works when browser storage is unavailable.
  }
}

function restoreAppState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_STORAGE_KEY));
    if (!saved || typeof saved !== "object") return;
    for (const key of SAVED_STATE_FIELDS) {
      if (key === "currentUser") {
        const user = saved[key];
        if (user && typeof user.username === "string" && typeof user.name === "string" && ["ADMIN", "STAFF"].includes(user.role)) {
          AppState.currentUser = user;
        }
      } else if (Array.isArray(saved[key])) {
        AppState[key] = saved[key];
      }
    }
  } catch (error) {
    // Use the initial demo data if the saved state cannot be read.
  }
}

function renderCurrentUser() {
  const user = AppState.currentUser;
  document.getElementById("current-user-avatar").textContent = user.role === "ADMIN" ? "AD" : "NV";
  document.getElementById("current-user-name").textContent = user.name;
  const roleBadge = document.getElementById("current-user-role-badge");
  roleBadge.textContent = user.role;
  roleBadge.className = `user-role-badge ${user.role === "ADMIN" ? "role-admin" : "role-staff"}`;
}

function navigateToPage(pageId, params = {}) {
  if (!Object.hasOwn(PAGE_ROUTES, pageId)) return;
  saveAppState();
  const url = new URL(PAGE_ROUTES[pageId], window.location.href);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, value);
  }
  window.location.assign(url.href);
}

function startTransaction(kind, sku) {
  const pageId = kind === "IN" ? "stock-in" : "stock-out";
  if (AppState.activePage !== pageId) {
    navigateToPage(pageId, { action: "create", sku });
    return;
  }
  openCreateTransactionModal(kind, sku);
}

function renderCurrentPage() {
  const renderers = {
    dashboard: renderDashboard,
    products: renderProducts,
    categories: renderCategories,
    barcode: () => {
      populateBarcodeProductSelect();
      document.getElementById("barcode-select-product").dispatchEvent(new Event("change"));
      updateBarcodePreview();
    },
    scanner: initCameraSim,
    "stock-in": renderStockInList,
    "stock-out": renderStockOutList,
    stocktake: renderStocktakePage,
    reports: renderReportView,
    "activity-logs": renderActivityLogs,
    users: renderUsers,
    alerts: renderAlerts
  };
  renderers[AppState.activePage]?.();
  updateAlertBadge();
}

function applyPageAction() {
  const params = new URLSearchParams(window.location.search);
  if (AppState.activePage === "scanner" && params.has("code")) {
    handleBarcodeScanned(params.get("code"));
  } else if (params.get("action") === "create") {
    if (AppState.activePage === "products") {
      document.getElementById("btn-open-create-product").click();
    } else if (["stock-in", "stock-out"].includes(AppState.activePage)) {
      openCreateTransactionModal(AppState.activePage === "stock-in" ? "IN" : "OUT", params.get("sku"));
    }
  }
  if (params.has("code") || params.has("action")) {
    params.delete("code");
    params.delete("action");
    params.delete("sku");
    const query = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
  }
}

function renderDashboard() {
  if (!document.getElementById("dashboard")) {
    updateAlertBadge();
    return;
  }
  const activeProducts = AppState.products.filter(p => p.status === 'active');
  const totalSku = activeProducts.length;
  const totalStock = activeProducts.reduce((sum, p) => sum + p.stock, 0);

  let stockInQty = 0;
  let stockOutQty = 0;

  AppState.transactions.forEach(t => {
    if (t.status === "CONFIRMED") {
      let q = t.items.reduce((acc, it) => acc + it.qty, 0);
      if (t.kind === "IN") stockInQty += q;
      if (t.kind === "OUT") stockOutQty += q;
    }
  });

  const lowStockProds = activeProducts.filter(p => p.stock <= p.minStock);

  document.getElementById("kpi-total-sku").textContent = totalSku;
  document.getElementById("kpi-total-inventory").textContent = totalStock;
  document.getElementById("kpi-stock-in-qty").textContent = stockInQty;
  document.getElementById("kpi-stock-out-qty").textContent = stockOutQty;
  document.getElementById("kpi-low-stock-count").textContent = lowStockProds.length;

  renderDashboardChart();

  const lowTbody = document.getElementById("dash-lowstock-tbody");
  lowTbody.innerHTML = "";
  if (lowStockProds.length === 0) {
    lowTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Không có mặt hàng nào bị cảnh báo tồn</td></tr>`;
  } else {
    lowStockProds.slice(0, 5).forEach(p => {
      let isOut = p.stock === 0;
      let badgeClass = isOut ? "badge-danger" : "badge-warning";
      let badgeText = isOut ? "HẾT HÀNG (0)" : `TỒN THẤP (${p.stock}/${p.minStock})`;

      let tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong style="color:#60a5fa;">${p.sku}</strong></td>
        <td>${p.name}</td>
        <td><span class="badge ${badgeClass}">${badgeText}</span></td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="quickCreateImportForSKU('${p.sku}')">Lập Phiếu Nhập</button>
        </td>
      `;
      lowTbody.appendChild(tr);
    });
  }

  const txTbody = document.getElementById("dash-recent-tx-tbody");
  txTbody.innerHTML = "";
  const recent = AppState.transactions.slice(0, 5);
  if (recent.length === 0) {
    txTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#94a3b8;">Chưa có giao dịch chứng từ nào</td></tr>`;
  } else {
    recent.forEach(tx => {
      let isConfirmed = tx.status === "CONFIRMED";
      let kindBadge = tx.kind === "IN" ? `<span class="badge badge-info">NHẬP KHO</span>` : `<span class="badge badge-warning">XUẤT KHO</span>`;
      let statusBadge = isConfirmed ? `<span class="badge badge-success">ĐÃ XÁC NHẬN</span>` : `<span class="badge badge-secondary">BẢN NHÁP</span>`;
      let totalQ = tx.items.reduce((s, it) => s + it.qty, 0);

      let tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${tx.code}</strong></td>
        <td>${kindBadge}</td>
        <td>${tx.createdAt}</td>
        <td>${tx.createdBy}</td>
        <td><strong>${totalQ}</strong></td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="viewTransactionDetails('${tx.code}')">Xem</button>
        </td>
      `;
      txTbody.appendChild(tr);
    });
  }

  updateAlertBadge();
}

function renderDashboardChart() {
  const svg = document.getElementById("dash-chart-svg");
  if (!svg) return;
  svg.innerHTML = "";

  const days = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const inData = [25, 40, 15, 60, 30, 80, 55];
  const outData = [10, 20, 35, 25, 45, 30, 20];

  const w = svg.clientWidth || 550;
  const h = 220;
  const padL = 40;
  const padB = 30;
  const padT = 20;
  const padR = 20;

  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const maxVal = 100;

  let gridLines = "";
  for (let i = 0; i <= 4; i++) {
    let yVal = padT + (chartH / 4) * i;
    let labelVal = Math.round(maxVal - (maxVal / 4) * i);
    gridLines += `
      <line x1="${padL}" y1="${yVal}" x2="${w - padR}" y2="${yVal}" stroke="#334155" stroke-dasharray="3,3" />
      <text x="${padL - 8}" y="${yVal + 4}" fill="#64748b" font-size="10" text-anchor="end">${labelVal}</text>
    `;
  }

  const stepX = chartW / days.length;
  let bars = "";
  let xLabels = "";

  days.forEach((day, idx) => {
    let cx = padL + idx * stepX + stepX / 2;
    let bW = 14;

    let inH = (inData[idx] / maxVal) * chartH;
    let inY = padT + chartH - inH;

    let outH = (outData[idx] / maxVal) * chartH;
    let outY = padT + chartH - outH;

    bars += `
      <rect x="${cx - bW - 2}" y="${inY}" width="${bW}" height="${inH}" rx="3" fill="#06b6d4" />
      <rect x="${cx + 2}" y="${outY}" width="${bW}" height="${outH}" rx="3" fill="#f59e0b" />
    `;

    xLabels += `<text x="${cx}" y="${h - 8}" fill="#94a3b8" font-size="11" text-anchor="middle">${day}</text>`;
  });

  svg.innerHTML = `
    ${gridLines}
    ${bars}
    ${xLabels}
  `;
}

function updateAlertBadge() {
  const lowCount = AppState.products.filter(p => p.status === 'active' && p.stock <= p.minStock).length;
  const sideBadge = document.getElementById("sidebar-alert-badge");
  const notifBadge = document.getElementById("notif-count-badge");
  const headerDot = document.getElementById("header-alert-dot");

  if (sideBadge) sideBadge.textContent = lowCount;
  if (notifBadge) notifBadge.textContent = `${lowCount} cảnh báo`;
  if (headerDot) {
    headerDot.style.display = lowCount > 0 ? "block" : "none";
  }

  const dropdownList = document.getElementById("notif-dropdown-list");
  if (dropdownList) {
    dropdownList.innerHTML = "";
    if (lowCount === 0) {
      dropdownList.innerHTML = `<div style="padding:16px; text-align:center; color:#94a3b8; font-size:0.82rem;">Không có cảnh báo kho nào</div>`;
    } else {
      AppState.products.filter(p => p.status === 'active' && p.stock <= p.minStock).forEach(p => {
        let isOut = p.stock === 0;
        let item = document.createElement("div");
        item.className = "notif-item";
        item.onclick = () => {
          document.getElementById("notification-dropdown").classList.remove("active");
          startTransaction("IN", p.sku);
        };
        item.innerHTML = `
          <div class="notif-dot ${isOut ? 'red' : 'yellow'}"></div>
          <div class="notif-content">
            <h4>${isOut ? 'Hết hàng tồn kho' : 'Sắp hết hàng'} - ${p.sku}</h4>
            <p>${p.name} hiện chỉ còn ${p.stock} (ngưỡng ${p.minStock}). Bấm để lập phiếu nhập.</p>
            <div class="notif-time">Mức độ ưu tiên cao</div>
          </div>
        `;
        dropdownList.appendChild(item);
      });
    }
  }
}

function renderProducts() {
  if (!document.getElementById("products")) return;
  const tbody = document.getElementById("products-table-tbody");
  tbody.innerHTML = "";

  const search = (document.getElementById("filter-prod-search").value || "").toLowerCase().trim();
  const catFilter = document.getElementById("filter-prod-category").value;
  const statusFilter = document.getElementById("filter-prod-status").value;

  const catSelect = document.getElementById("filter-prod-category");
  catSelect.innerHTML = `<option value="">Tất cả danh mục</option>`;
  AppState.categories.forEach(c => {
    let opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    if (String(catFilter) === String(c.id)) opt.selected = true;
    catSelect.appendChild(opt);
  });

  const filtered = AppState.products.filter(p => {
    let matchSearch = p.sku.toLowerCase().includes(search) || p.name.toLowerCase().includes(search) || p.barcode.toLowerCase().includes(search);
    let matchCat = !catFilter || String(p.categoryId) === String(catFilter);
    let matchStatus = true;
    if (statusFilter === "active") matchStatus = p.status === "active";
    if (statusFilter === "inactive") matchStatus = p.status === "inactive";
    if (statusFilter === "low") matchStatus = p.stock > 0 && p.stock <= p.minStock;
    if (statusFilter === "out") matchStatus = p.stock === 0;
    return matchSearch && matchCat && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; color:#94a3b8; padding:30px;">Không tìm thấy sản phẩm nào</td></tr>`;
    return;
  }

  filtered.forEach(p => {
    let cat = AppState.categories.find(c => c.id === p.categoryId) || { name: "Chưa phân loại" };
    let isOut = p.stock === 0;
    let isLow = p.stock > 0 && p.stock <= p.minStock;

    let badgeClass = "badge-success";
    let badgeText = "Đủ hàng";
    if (p.status === "inactive") {
      badgeClass = "badge-secondary";
      badgeText = "Ngừng dùng";
    } else if (isOut) {
      badgeClass = "badge-danger";
      badgeText = "Hết hàng (0)";
    } else if (isLow) {
      badgeClass = "badge-warning";
      badgeText = "Tồn thấp";
    }

    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align:center;">
        <div class="product-thumb">${p.name.substring(0, 2).toUpperCase()}</div>
      </td>
      <td><strong style="color:#60a5fa; white-space:nowrap;">${p.sku}</strong></td>
      <td class="col-prod-name">
        <div class="prod-title">${p.name}</div>
        <div class="prod-subdesc">${p.desc || ''}</div>
      </td>
      <td style="white-space:nowrap;">${cat.name}</td>
      <td style="white-space:nowrap;">
        <span class="barcode-badge">${p.barcode}</span>
        <button class="btn btn-secondary btn-sm" style="padding:2px 6px; margin-left:4px;" onclick="quickPrintBarcode('${p.sku}')" title="In tem mã vạch">In</button>
      </td>
      <td style="text-align:center; white-space:nowrap;">${p.unit}</td>
      <td style="text-align:right; white-space:nowrap;">${formatCurrency(p.importPrice)}</td>
      <td style="text-align:right; white-space:nowrap;">${formatCurrency(p.salePrice)}</td>
      <td style="text-align:center; white-space:nowrap;">
        <strong style="font-size:1rem; color:${isOut ? '#ef4444' : (isLow ? '#f59e0b' : '#34d399')};">${p.stock}</strong>
      </td>
      <td style="text-align:center; white-space:nowrap;">${p.minStock}</td>
      <td style="text-align:center; white-space:nowrap;"><span class="badge ${badgeClass}">${badgeText}</span></td>
      <td style="white-space:nowrap; text-align:center;">
        <div style="display:flex; gap:6px; justify-content:center;">
          <button class="btn btn-secondary btn-sm" onclick="editProduct(${p.id})">Sửa</button>
          <button class="btn ${p.status === 'active' ? 'btn-danger' : 'btn-success'} btn-sm" onclick="toggleProductActive(${p.id})">
            ${p.status === 'active' ? 'Ngừng' : 'Mở lại'}
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderCategories() {
  if (!document.getElementById("categories")) return;
  const tbody = document.getElementById("categories-table-tbody");
  tbody.innerHTML = "";

  const search = (document.getElementById("filter-cat-search").value || "").toLowerCase().trim();
  const statusFilter = document.getElementById("filter-cat-status").value;

  const filtered = AppState.categories.filter(c => {
    let matchSearch = c.name.toLowerCase().includes(search) || (c.description || "").toLowerCase().includes(search);
    let matchStatus = !statusFilter || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:30px;">Không có danh mục nào</td></tr>`;
    return;
  }

  filtered.forEach(c => {
    let skuCount = AppState.products.filter(p => p.categoryId === c.id).length;
    let isAct = c.status === "active";
    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${c.id}</td>
      <td><strong style="color:#fff;">${c.name}</strong></td>
      <td>${c.description || 'Không có mô tả'}</td>
      <td><span class="badge badge-info">${skuCount} SKU</span></td>
      <td><span class="badge ${isAct ? 'badge-success' : 'badge-secondary'}">${isAct ? 'Đang dùng' : 'Ngừng dùng'}</span></td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="editCategory(${c.id})">Sửa</button>
          <button class="btn ${isAct ? 'btn-danger' : 'btn-success'} btn-sm" onclick="toggleCategoryActive(${c.id})">
            ${isAct ? 'Ngừng dùng' : 'Kích hoạt'}
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function populateBarcodeProductSelect() {
  const select = document.getElementById("barcode-select-product");
  select.innerHTML = "";
  AppState.products.forEach(p => {
    let opt = document.createElement("option");
    opt.value = p.sku;
    opt.textContent = `[${p.sku}] ${p.name} (Mã hiện tại: ${p.barcode})`;
    select.appendChild(opt);
  });
}

function updateBarcodePreview() {
  const select = document.getElementById("barcode-select-product");
  const sku = select.value;
  const prod = AppState.products.find(p => p.sku === sku);
  if (!prod) return;

  const type = document.getElementById("barcode-type-select").value;
  const payloadInput = document.getElementById("barcode-input-payload");
  let payload = payloadInput.value.trim() || prod.barcode || prod.sku;
  payloadInput.value = payload;

  document.getElementById("preview-box-prod-name").textContent = prod.name;
  document.getElementById("preview-box-sku-val").textContent = `${prod.sku} • ${payload}`;

  const wrapper = document.getElementById("barcode-svg-wrapper");
  if (type === "CODE128") {
    wrapper.innerHTML = generateCode128SVG(payload);
  } else {
    wrapper.innerHTML = generateSimpleQRSVG(payload);
  }
}

function quickPrintBarcode(sku) {
  const prod = AppState.products.find(p => p.sku === sku);
  if (!prod) return;

  const printArea = document.getElementById("print-container");
  let codeSvg = prod.barcodeType === "QR" ? generateSimpleQRSVG(prod.barcode) : generateCode128SVG(prod.barcode);

  printArea.innerHTML = `
    <div style="text-align:center; padding:20px; font-family:sans-serif;">
      <h3 style="margin-bottom:6px;">${prod.name}</h3>
      <div style="margin:10px 0;">${codeSvg}</div>
      <p style="font-size:14px; font-weight:bold; letter-spacing:1px;">SKU: ${prod.sku} • Mã: ${prod.barcode}</p>
      <p style="font-size:12px; color:#555;">Smart Warehouse Management System</p>
    </div>
  `;
  window.print();
}

function initCameraSim() {
  const canvas = document.getElementById("cam-sim-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = 480;
  canvas.height = 360;

  let frame = 0;
  function drawSim() {
    if (!AppState.cameraActive) {
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#64748b";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Camera đang tắt. Nhấn 'Bật Camera' để khởi động.", canvas.width / 2, canvas.height / 2);
      return;
    }

    frame++;
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    let boxW = 200;
    let boxH = 120;
    let boxX = (canvas.width - boxW) / 2 + Math.sin(frame * 0.03) * 15;
    let boxY = (canvas.height - boxH) / 2 + Math.cos(frame * 0.02) * 10;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.fillStyle = "#000000";
    for (let i = 15; i < boxW - 15; i += 7) {
      let bWidth = (i % 3 === 0) ? 4 : 2;
      ctx.fillRect(boxX + i, boxY + 20, bWidth, 60);
    }
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("SP000125 (OpenCV Detect)", boxX + boxW / 2, boxY + boxH - 12);

    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2;
    let cornerLen = 14;
    ctx.beginPath();
    ctx.moveTo(boxX - 6, boxY - 6 + cornerLen);
    ctx.lineTo(boxX - 6, boxY - 6);
    ctx.lineTo(boxX - 6 + cornerLen, boxY - 6);

    ctx.moveTo(boxX + boxW + 6 - cornerLen, boxY - 6);
    ctx.lineTo(boxX + boxW + 6, boxY - 6);
    ctx.lineTo(boxX + boxW + 6, boxY - 6 + cornerLen);

    ctx.moveTo(boxX - 6, boxY + boxH + 6 - cornerLen);
    ctx.lineTo(boxX - 6, boxY + boxH + 6);
    ctx.lineTo(boxX - 6 + cornerLen, boxY + boxH + 6);

    ctx.moveTo(boxX + boxW + 6 - cornerLen, boxY + boxH + 6);
    ctx.lineTo(boxX + boxW + 6, boxY + boxH + 6);
    ctx.lineTo(boxX + boxW + 6, boxY + boxH + 6 - cornerLen);
    ctx.stroke();

    AppState.camAnimFrame = requestAnimationFrame(drawSim);
  }

  if (AppState.camAnimFrame) cancelAnimationFrame(AppState.camAnimFrame);
  drawSim();
}

function handleBarcodeScanned(code) {
  let cleanCode = (code || "").trim();
  if (!cleanCode) return;

  const prod = AppState.products.find(p => p.barcode === cleanCode || p.sku === cleanCode);
  const emptyBox = document.getElementById("scan-result-empty");
  const foundBox = document.getElementById("scan-result-found");

  if (!prod) {
    emptyBox.style.display = "block";
    foundBox.style.display = "none";
    emptyBox.innerHTML = `
      <div style="color:#ef4444; font-size:1rem; font-weight:700; margin-bottom:8px;">
        Không tìm thấy sản phẩm! (Mã: ${cleanCode})
      </div>
      <p style="font-size:0.84rem; color:#94a3b8;">
        Chuỗi mã này chưa được ánh xạ tới bất kỳ SKU nào trong hệ thống. Theo quy tắc BR-06, không tự ý tạo SKU mới hoặc thay đổi tồn kho.
      </p>
    `;
    showToast(`Không tìm thấy mã vạch: ${cleanCode}`, "error");
    return;
  }

  emptyBox.style.display = "none";
  foundBox.style.display = "block";

  document.getElementById("scan-res-thumb").textContent = prod.name.substring(0, 2).toUpperCase();
  document.getElementById("scan-res-name").textContent = prod.name;
  document.getElementById("scan-res-sku").textContent = `SKU: ${prod.sku}`;
  document.getElementById("scan-res-code").textContent = `MÃ: ${prod.barcode}`;
  document.getElementById("scan-res-stock").textContent = prod.stock;
  document.getElementById("scan-res-min").textContent = prod.minStock;
  document.getElementById("scan-res-cost").textContent = formatCurrency(prod.importPrice);
  document.getElementById("scan-res-price").textContent = formatCurrency(prod.salePrice);

  document.getElementById("btn-scan-add-to-in").onclick = () => {
    startTransaction("IN", prod.sku);
  };

  document.getElementById("btn-scan-add-to-out").onclick = () => {
    startTransaction("OUT", prod.sku);
  };

  document.getElementById("btn-scan-reprint-label").onclick = () => {
    quickPrintBarcode(prod.sku);
  };

  showToast(`Đã nhận diện SKU: ${prod.sku} (${prod.name})`, "success");
}

function renderStockInList() {
  if (!document.getElementById("stock-in")) return;
  const tbody = document.getElementById("stock-in-table-tbody");
  tbody.innerHTML = "";

  const search = (document.getElementById("filter-in-search").value || "").toLowerCase().trim();
  const statusFilter = document.getElementById("filter-in-status").value;

  const inTx = AppState.transactions.filter(t => t.kind === "IN");
  const filtered = inTx.filter(t => {
    let matchSearch = t.code.toLowerCase().includes(search) || (t.createdBy || "").toLowerCase().includes(search) || (t.partner || "").toLowerCase().includes(search);
    let matchStatus = !statusFilter || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#94a3b8; padding:30px;">Không có phiếu nhập kho nào</td></tr>`;
    return;
  }

  filtered.forEach(t => {
    let totalQty = t.items.reduce((s, it) => s + it.qty, 0);
    let totalAmount = t.items.reduce((s, it) => s + (it.qty * it.price), 0);
    let isConf = t.status === "CONFIRMED";

    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong style="color:#60a5fa;">${t.code}</strong></td>
      <td>${t.createdAt}</td>
      <td>${t.partner || '---'}</td>
      <td>${t.createdBy}</td>
      <td>${t.items.length} mặt hàng</td>
      <td><strong>${totalQty}</strong></td>
      <td>${formatCurrency(totalAmount)}</td>
      <td><span class="badge ${isConf ? 'badge-success' : 'badge-secondary'}">${isConf ? 'ĐÃ XÁC NHẬN' : 'BẢN NHÁP'}</span></td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="viewTransactionDetails('${t.code}')">Xem / In</button>
          ${!isConf ? `<button class="btn btn-success btn-sm" onclick="confirmDraftTransaction('${t.code}')">Duyệt Nhập</button>` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderStockOutList() {
  if (!document.getElementById("stock-out")) return;
  const tbody = document.getElementById("stock-out-table-tbody");
  tbody.innerHTML = "";

  const search = (document.getElementById("filter-out-search").value || "").toLowerCase().trim();
  const statusFilter = document.getElementById("filter-out-status").value;

  const outTx = AppState.transactions.filter(t => t.kind === "OUT");
  const filtered = outTx.filter(t => {
    let matchSearch = t.code.toLowerCase().includes(search) || (t.createdBy || "").toLowerCase().includes(search) || (t.partner || "").toLowerCase().includes(search);
    let matchStatus = !statusFilter || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding:30px;">Không có phiếu xuất kho nào</td></tr>`;
    return;
  }

  filtered.forEach(t => {
    let totalQty = t.items.reduce((s, it) => s + it.qty, 0);
    let isConf = t.status === "CONFIRMED";

    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong style="color:#fbbf24;">${t.code}</strong></td>
      <td>${t.createdAt}</td>
      <td>${t.partner || 'Khách lẻ/Nội bộ'}</td>
      <td>${t.createdBy}</td>
      <td>${t.items.length} mặt hàng</td>
      <td><strong>${totalQty}</strong></td>
      <td><span class="badge ${isConf ? 'badge-success' : 'badge-secondary'}">${isConf ? 'ĐÃ XÁC NHẬN' : 'BẢN NHÁP'}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="viewTransactionDetails('${t.code}')">Xem / In</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openCreateTransactionModal(kind = "IN", defaultSku = null) {
  document.getElementById("tx-kind").value = kind;
  const isImport = kind === "IN";
  document.getElementById("modal-tx-title").textContent = isImport ? "Lập Phiếu Nhập Kho Mới (F07)" : "Lập Phiếu Xuất Kho Mới (F08)";
  document.getElementById("tx-partner-label").textContent = isImport ? "Nhà Cung Cấp / Nguồn Nhập" : "Đơn Vị Nhận / Khách Hàng";

  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const prefix = isImport ? "IN" : "OUT";
  const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const count = AppState.transactions.filter(t => t.kind === kind).length + 1;
  document.getElementById("tx-code").value = `${prefix}-${dateStr}-${String(count).padStart(3, '0')}`;
  document.getElementById("tx-partner").value = "";
  document.getElementById("tx-note").value = "";

  const sel = document.getElementById("tx-add-prod-select");
  sel.innerHTML = "";
  AppState.products.filter(p => p.status === 'active').forEach(p => {
    let opt = document.createElement("option");
    opt.value = p.sku;
    opt.textContent = `[${p.sku}] ${p.name} (Tồn hiện có: ${p.stock})`;
    if (defaultSku && p.sku === defaultSku) opt.selected = true;
    sel.appendChild(opt);
  });

  AppState.currentCart = [];
  if (defaultSku) {
    let target = AppState.products.find(p => p.sku === defaultSku);
    if (target) {
      AppState.currentCart.push({
        sku: target.sku,
        name: target.name,
        currentStock: target.stock,
        qty: 1,
        price: isImport ? target.importPrice : target.salePrice
      });
    }
  }

  renderCartTable();
  document.getElementById("modal-create-tx").classList.add("active");
}

function renderCartTable() {
  const tbody = document.getElementById("tx-cart-tbody");
  tbody.innerHTML = "";

  let totalQ = 0;
  let totalAmt = 0;

  if (AppState.currentCart.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#94a3b8;">Chưa có sản phẩm nào trong phiếu. Hãy chọn sản phẩm và bấm '+ Thêm Dòng'.</td></tr>`;
  } else {
    AppState.currentCart.forEach((item, index) => {
      let lineTotal = item.qty * item.price;
      totalQ += item.qty;
      totalAmt += lineTotal;

      let tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${item.sku}</strong></td>
        <td>${item.name}</td>
        <td><strong style="color:#38bdf8;">${item.currentStock}</strong></td>
        <td style="width:120px;">
          <input type="number" min="1" class="form-control" value="${item.qty}" style="padding:4px 8px;" onchange="updateCartQty(${index}, this.value)">
        </td>
        <td style="width:140px;">
          <input type="number" min="0" class="form-control" value="${item.price}" style="padding:4px 8px;" onchange="updateCartPrice(${index}, this.value)">
        </td>
        <td><strong>${formatCurrency(lineTotal)}</strong></td>
        <td>
          <button class="btn btn-danger btn-sm" style="padding:2px 8px;" onclick="removeCartItem(${index})">&times;</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById("tx-cart-total-qty").textContent = totalQ;
  document.getElementById("tx-cart-total-amount").textContent = formatCurrency(totalAmt);
}

function updateCartQty(index, newQty) {
  let val = parseInt(newQty, 10);
  if (isNaN(val) || val <= 0) val = 1;
  AppState.currentCart[index].qty = val;
  renderCartTable();
}

function updateCartPrice(index, newPrice) {
  let val = parseFloat(newPrice);
  if (isNaN(val) || val < 0) val = 0;
  AppState.currentCart[index].price = val;
  renderCartTable();
}

function removeCartItem(index) {
  AppState.currentCart.splice(index, 1);
  renderCartTable();
}

function saveTransaction(isConfirmed = true) {
  const kind = document.getElementById("tx-kind").value;
  const code = document.getElementById("tx-code").value;
  const partner = document.getElementById("tx-partner").value.trim();
  const note = document.getElementById("tx-note").value.trim();

  if (AppState.currentCart.length === 0) {
    showToast("Phiếu không có mặt hàng nào. Vui lòng thêm ít nhất một dòng!", "error");
    return;
  }

  for (let it of AppState.currentCart) {
    if (it.qty <= 0) {
      showToast(`Số lượng của SKU ${it.sku} phải là số nguyên dương!`, "error");
      return;
    }
    if (kind === "OUT" && isConfirmed) {
      let prod = AppState.products.find(p => p.sku === it.sku);
      if (!prod || prod.stock < it.qty) {
        showToast(`LỖI BR-02: SKU ${it.sku} chỉ còn tồn ${prod ? prod.stock : 0}, không thể xuất ${it.qty}! Giao dịch bị từ chối hoàn toàn.`, "error");
        return;
      }
    }
  }

  const newTx = {
    id: AppState.transactions.length + 1,
    code: code,
    kind: kind,
    partner: partner,
    status: isConfirmed ? "CONFIRMED" : "DRAFT",
    createdBy: AppState.currentUser.name,
    createdAt: getFormattedNow(),
    note: note,
    items: JSON.parse(JSON.stringify(AppState.currentCart))
  };

  if (isConfirmed) {
    let diffLogArr = [];
    AppState.currentCart.forEach(item => {
      let prod = AppState.products.find(p => p.sku === item.sku);
      if (prod) {
        let oldStock = prod.stock;
        if (kind === "IN") {
          prod.stock += item.qty;
        } else if (kind === "OUT") {
          prod.stock -= item.qty;
        }
        diffLogArr.push(`${item.sku} (${oldStock} -> ${prod.stock})`);
      }
    });

    addActivityLog(
      kind === "IN" ? "CONFIRM_STOCK_IN" : "CONFIRM_STOCK_OUT",
      code,
      `Cập nhật tồn: ${diffLogArr.join(", ")}`
    );
  } else {
    addActivityLog("SAVE_DRAFT_TX", code, `Lưu nháp chứng từ ${code}`);
  }

  AppState.transactions.unshift(newTx);
  document.getElementById("modal-create-tx").classList.remove("active");

  showToast(
    isConfirmed ? `Xác nhận phiếu ${code} thành công! Tồn kho đã cập nhật.` : `Đã lưu bản nháp phiếu ${code}. Tồn kho không đổi.`,
    "success"
  );

  if (kind === "IN") renderStockInList();
  if (kind === "OUT") renderStockOutList();
  renderDashboard();
}

function viewTransactionDetails(code) {
  const tx = AppState.transactions.find(t => t.code === code);
  if (!tx) return;

  const isImport = tx.kind === "IN";
  document.getElementById("view-tx-title").textContent = isImport ? "PHIẾU NHẬP KHO (IN)" : "PHIẾU XUẤT KHO (OUT)";
  document.getElementById("view-tx-code").textContent = tx.code;
  document.getElementById("view-tx-date").textContent = tx.createdAt;
  document.getElementById("view-tx-author").textContent = tx.createdBy;
  document.getElementById("view-tx-partner").textContent = tx.partner || "---";
  document.getElementById("view-tx-status").textContent = tx.status === "CONFIRMED" ? "ĐÃ XÁC NHẬN" : "BẢN NHÁP";

  const tbody = document.getElementById("view-tx-tbody");
  tbody.innerHTML = "";
  let totalAmount = 0;

  tx.items.forEach((it, idx) => {
    let lineTot = it.qty * it.price;
    totalAmount += lineTot;
    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${it.sku}</strong></td>
      <td>${it.name}</td>
      <td><strong>${it.qty}</strong></td>
      <td>${formatCurrency(it.price)}</td>
      <td><strong>${formatCurrency(lineTot)}</strong></td>
    `;
    tbody.appendChild(tr);
  });

  let trTotal = document.createElement("tr");
  trTotal.innerHTML = `
    <td colspan="5" style="text-align:right; font-weight:bold; font-size:1rem;">TỔNG GIÁ TRỊ:</td>
    <td style="font-weight:bold; font-size:1.05rem; color:#34d399;">${formatCurrency(totalAmount)}</td>
  `;
  tbody.appendChild(trTotal);

  document.getElementById("modal-view-tx").classList.add("active");
}

function confirmDraftTransaction(code) {
  const tx = AppState.transactions.find(t => t.code === code);
  if (!tx || tx.status === "CONFIRMED") return;

  let diffLogArr = [];
  for (let it of tx.items) {
    let prod = AppState.products.find(p => p.sku === it.sku);
    if (tx.kind === "OUT" && (!prod || prod.stock < it.qty)) {
      showToast(`Không đủ tồn kho để duyệt xuất mã ${it.sku}`, "error");
      return;
    }
  }

  tx.items.forEach(it => {
    let prod = AppState.products.find(p => p.sku === it.sku);
    if (prod) {
      let oldS = prod.stock;
      if (tx.kind === "IN") prod.stock += it.qty;
      if (tx.kind === "OUT") prod.stock -= it.qty;
      diffLogArr.push(`${it.sku} (${oldS} -> ${prod.stock})`);
    }
  });

  tx.status = "CONFIRMED";
  addActivityLog("APPROVE_DRAFT_TX", tx.code, `Duyệt phiếu: ${diffLogArr.join(", ")}`);
  showToast(`Phiếu ${code} đã được xác nhận thành công!`, "success");
  renderStockInList();
  renderDashboard();
}

function renderStocktakePage() {
  if (!document.getElementById("stocktake")) return;
  const listTbody = document.getElementById("stocktake-list-tbody");
  listTbody.innerHTML = "";

  if (AppState.stocktakes.length === 0) {
    listTbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#94a3b8;">Chưa có đợt kiểm kê nào</td></tr>`;
  } else {
    AppState.stocktakes.forEach(st => {
      let tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong style="color:#60a5fa;">${st.code}</strong></td>
        <td>${st.date}</td>
        <td>${st.author}</td>
        <td>${st.itemsCount} SKU</td>
        <td><span style="color:#34d399; font-weight:bold;">+${st.plusDiff}</span></td>
        <td><span style="color:#ef4444; font-weight:bold;">-${st.minusDiff}</span></td>
        <td><span class="badge badge-success">${st.status === 'COMPLETED' ? 'ĐÃ HOÀN TẤT' : 'ĐANG ĐẾM'}</span></td>
        <td>
          <span style="font-size:0.8rem; color:#94a3b8;">${st.note}</span>
        </td>
      `;
      listTbody.appendChild(tr);
    });
  }

  const overviewTbody = document.getElementById("inventory-overview-tbody");
  overviewTbody.innerHTML = "";

  AppState.products.forEach(p => {
    let cat = AppState.categories.find(c => c.id === p.categoryId) || { name: '---' };
    let totalVal = p.stock * p.importPrice;

    let evalBadge = `<span class="badge badge-success">Bình thường</span>`;
    if (p.stock === 0) {
      evalBadge = `<span class="badge badge-danger">Hết hàng</span>`;
    } else if (p.stock <= p.minStock) {
      evalBadge = `<span class="badge badge-warning">Tồn thấp (${p.stock}/${p.minStock})</span>`;
    }

    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${p.sku}</strong></td>
      <td>${p.name}</td>
      <td>${cat.name}</td>
      <td><strong style="font-size:1.05rem; color:#60a5fa;">${p.stock}</strong> ${p.unit}</td>
      <td>${p.minStock}</td>
      <td>${evalBadge}</td>
      <td>${formatCurrency(p.importPrice)}</td>
      <td><strong style="color:#34d399;">${formatCurrency(totalVal)}</strong></td>
    `;
    overviewTbody.appendChild(tr);
  });
}

function openStocktakeWizard() {
  if (AppState.currentUser.role !== "ADMIN") {
    showToast("Chỉ Quản trị viên (Admin) mới có quyền mở đợt và duyệt kiểm kê!", "warning");
    return;
  }

  const tbody = document.getElementById("stocktake-wizard-tbody");
  tbody.innerHTML = "";

  AppState.products.filter(p => p.status === 'active').forEach((p, idx) => {
    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${p.sku}</strong></td>
      <td>${p.name}</td>
      <td><strong id="st-sys-${idx}">${p.stock}</strong></td>
      <td style="width:130px;">
        <input type="number" min="0" class="form-control" id="st-count-${idx}" value="${p.stock}" style="padding:4px 8px;" oninput="recalcStocktakeDiff(${idx})">
      </td>
      <td><span id="st-diff-${idx}" style="font-weight:bold; color:#94a3b8;">0</span></td>
      <td>
        <input type="text" class="form-control" id="st-note-${idx}" placeholder="Lý do chênh lệch nếu có..." style="padding:4px 8px;">
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("modal-stocktake-wizard").classList.add("active");
}

function recalcStocktakeDiff(idx) {
  const sysVal = parseInt(document.getElementById(`st-sys-${idx}`).textContent, 10);
  const countInput = document.getElementById(`st-count-${idx}`);
  let countVal = parseInt(countInput.value, 10);
  if (isNaN(countVal) || countVal < 0) countVal = 0;

  const diff = countVal - sysVal;
  const diffEl = document.getElementById(`st-diff-${idx}`);

  if (diff > 0) {
    diffEl.textContent = `+${diff}`;
    diffEl.style.color = "#34d399";
  } else if (diff < 0) {
    diffEl.textContent = `${diff}`;
    diffEl.style.color = "#ef4444";
  } else {
    diffEl.textContent = "0";
    diffEl.style.color = "#94a3b8";
  }
}

function submitStocktakeApprove() {
  if (AppState.currentUser.role !== "ADMIN") {
    showToast("Từ chối: Bạn không có quyền duyệt kiểm kê!", "error");
    return;
  }

  const activeProds = AppState.products.filter(p => p.status === 'active');
  let plusTotal = 0;
  let minusTotal = 0;
  let changes = [];

  activeProds.forEach((p, idx) => {
    const sysVal = p.stock;
    const countVal = parseInt(document.getElementById(`st-count-${idx}`).value, 10) || 0;
    const reason = (document.getElementById(`st-note-${idx}`).value || "").trim();
    const diff = countVal - sysVal;

    if (diff !== 0) {
      if (diff > 0) plusTotal += diff;
      if (diff < 0) minusTotal += Math.abs(diff);

      p.stock = countVal;
      changes.push(`${p.sku} (${sysVal} -> ${countVal}) [${diff > 0 ? '+' : ''}${diff}]`);

      AppState.transactions.push({
        id: AppState.transactions.length + 1,
        code: `${diff > 0 ? 'ADJ-IN' : 'ADJ-OUT'}-${Date.now().toString().slice(-6)}`,
        kind: diff > 0 ? "IN" : "OUT",
        partner: "Điều chỉnh Kiểm Kê Kho",
        status: "CONFIRMED",
        createdBy: AppState.currentUser.name,
        createdAt: getFormattedNow(),
        note: reason || `Cân bằng kiểm kê: chênh lệch ${diff}`,
        items: [{ sku: p.sku, name: p.name, qty: Math.abs(diff), price: p.importPrice }]
      });
    }
  });

  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const stCode = `ST-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(AppState.stocktakes.length + 1)}`;

  AppState.stocktakes.unshift({
    id: AppState.stocktakes.length + 1,
    code: stCode,
    date: getFormattedNow(),
    author: AppState.currentUser.name,
    status: "COMPLETED",
    itemsCount: activeProds.length,
    plusDiff: plusTotal,
    minusDiff: minusTotal,
    note: changes.length ? `Đã điều chỉnh: ${changes.join(", ")}` : "Khớp 100% không lệch"
  });

  addActivityLog("STOCKTAKE_APPROVE", stCode, `Duyệt kiểm kê: +${plusTotal}, -${minusTotal}. ${changes.join("; ")}`);

  document.getElementById("modal-stocktake-wizard").classList.remove("active");
  showToast(`Duyệt kiểm kê ${stCode} thành công! Số lượng tồn đã cập nhật chuẩn xác.`, "success");
  renderStocktakePage();
  renderDashboard();
}

function renderReportView() {
  if (!document.getElementById("reports")) return;
  const type = document.getElementById("report-type-select").value;
  const thead = document.getElementById("report-thead");
  const tbody = document.getElementById("report-tbody");
  thead.innerHTML = "";
  tbody.innerHTML = "";

  if (type === "summary") {
    thead.innerHTML = `
      <tr>
        <th>Mã SKU</th>
        <th>Tên Sản Phẩm</th>
        <th>Danh Mục</th>
        <th>Tồn Hiện Tại</th>
        <th>Tổng Đã Nhập</th>
        <th>Tổng Đã Xuất</th>
        <th>Giá Trị Tồn Kho (VND)</th>
      </tr>
    `;

    AppState.products.forEach(p => {
      let cat = AppState.categories.find(c => c.id === p.categoryId) || { name: '---' };
      let totIn = 0;
      let totOut = 0;

      AppState.transactions.filter(t => t.status === "CONFIRMED").forEach(t => {
        t.items.forEach(it => {
          if (it.sku === p.sku) {
            if (t.kind === "IN") totIn += it.qty;
            if (t.kind === "OUT") totOut += it.qty;
          }
        });
      });

      let tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${p.sku}</strong></td>
        <td>${p.name}</td>
        <td>${cat.name}</td>
        <td><strong style="color:#60a5fa;">${p.stock}</strong></td>
        <td><span style="color:#34d399;">+${totIn}</span></td>
        <td><span style="color:#f59e0b;">-${totOut}</span></td>
        <td>${formatCurrency(p.stock * p.importPrice)}</td>
      `;
      tbody.appendChild(tr);
    });
  } else if (type === "valuation") {
    thead.innerHTML = `
      <tr>
        <th>Mã SKU</th>
        <th>Tên Hàng Hóa</th>
        <th>Số Lượng Tồn</th>
        <th>Đơn Giá Nhập Hiện Tại</th>
        <th>Tổng Giá Vốn Tồn (VND)</th>
        <th>Tỷ Trọng Giá Trị Kho</th>
      </tr>
    `;

    let totalWarehouseVal = AppState.products.reduce((acc, p) => acc + (p.stock * p.importPrice), 0);

    AppState.products.forEach(p => {
      let lineVal = p.stock * p.importPrice;
      let percent = totalWarehouseVal > 0 ? ((lineVal / totalWarehouseVal) * 100).toFixed(1) : 0;
      let tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${p.sku}</strong></td>
        <td>${p.name}</td>
        <td>${p.stock} ${p.unit}</td>
        <td>${formatCurrency(p.importPrice)}</td>
        <td><strong style="color:#34d399;">${formatCurrency(lineVal)}</strong></td>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="flex:1; height:6px; background:#334155; border-radius:3px; overflow:hidden;">
              <div style="width:${percent}%; height:100%; background:#2563eb;"></div>
            </div>
            <span style="font-size:0.8rem;">${percent}%</span>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } else if (type === "ranking") {
    thead.innerHTML = `
      <tr>
        <th>Thứ Hạng</th>
        <th>Mã SKU</th>
        <th>Tên Sản Phẩm</th>
        <th>Số Lượng Đã Xuất</th>
        <th>Doanh Thu Ước Tính (VND)</th>
        <th>Tốc Độ Luân Chuyển</th>
      </tr>
    `;

    let stats = AppState.products.map(p => {
      let outQty = 0;
      let outVal = 0;
      AppState.transactions.filter(t => t.status === "CONFIRMED" && t.kind === "OUT").forEach(t => {
        t.items.forEach(it => {
          if (it.sku === p.sku) {
            outQty += it.qty;
            outVal += it.qty * it.price;
          }
        });
      });
      return { sku: p.sku, name: p.name, outQty, outVal };
    });

    stats.sort((a, b) => b.outQty - a.outQty);

    stats.forEach((st, idx) => {
      let tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>#${idx + 1}</strong></td>
        <td><strong>${st.sku}</strong></td>
        <td>${st.name}</td>
        <td><strong style="color:#fbbf24;">${st.outQty}</strong></td>
        <td>${formatCurrency(st.outVal)}</td>
        <td><span class="badge ${st.outQty > 0 ? 'badge-success' : 'badge-secondary'}">${st.outQty > 0 ? 'Chạy tốt' : 'Chậm luân chuyển'}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }
}

function exportReportCSV() {
  const table = document.getElementById("report-result-table");
  let csv = [];
  for (let row of table.rows) {
    let rowData = [];
    for (let cell of row.cells) {
      rowData.push('"' + cell.innerText.replace(/"/g, '""').trim() + '"');
    }
    csv.push(rowData.join(","));
  }

  const csvString = "\uFEFF" + csv.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Bao_Cao_Kho_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast("Đã tải xuống file CSV báo cáo!", "success");
}

function renderActivityLogs() {
  if (!document.getElementById("activity-logs")) return;
  const tbody = document.getElementById("activity-logs-tbody");
  tbody.innerHTML = "";

  const search = (document.getElementById("filter-log-search").value || "").toLowerCase().trim();
  const actionFilter = document.getElementById("filter-log-action").value;

  const filtered = AppState.activityLogs.filter(log => {
    let matchSearch = log.username.toLowerCase().includes(search) || log.object.toLowerCase().includes(search) || log.diff.toLowerCase().includes(search);
    let matchAction = !actionFilter || log.action === actionFilter;
    return matchSearch && matchAction;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:30px;">Không có nhật ký nào phù hợp</td></tr>`;
    return;
  }

  filtered.forEach(log => {
    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${log.timestamp}</td>
      <td><strong>${log.username}</strong></td>
      <td><span class="badge ${log.role === 'ADMIN' ? 'badge-info' : 'badge-secondary'}">${log.role}</span></td>
      <td><span class="badge badge-warning">${log.action}</span></td>
      <td><strong>${log.object}</strong></td>
      <td>${log.diff}</td>
      <td><span class="badge badge-success">${log.result}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderUsers() {
  if (!document.getElementById("users")) return;
  const tbody = document.getElementById("users-table-tbody");
  tbody.innerHTML = "";

  AppState.users.forEach(u => {
    let isAdm = u.role === "ADMIN";
    let isAct = u.status === "active";
    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${u.id}</td>
      <td><strong>${u.username}</strong></td>
      <td>${u.fullname}</td>
      <td><span class="user-role-badge ${isAdm ? 'role-admin' : 'role-staff'}">${u.role}</span></td>
      <td><span class="badge ${isAct ? 'badge-success' : 'badge-danger'}">${isAct ? 'Hoạt động' : 'Bị khóa'}</span></td>
      <td>${u.createdAt}</td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="toggleUserStatus(${u.id})">
            ${isAct ? 'Khóa' : 'Mở khóa'}
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAlerts() {
  if (!document.getElementById("alerts")) return;
  const tbody = document.getElementById("alerts-table-tbody");
  tbody.innerHTML = "";

  const alerts = AppState.products.filter(p => p.status === 'active' && p.stock <= p.minStock);

  if (alerts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#34d399; padding:30px;">Tất cả sản phẩm đều đảm bảo ngưỡng an toàn kho!</td></tr>`;
    return;
  }

  alerts.forEach(p => {
    let cat = AppState.categories.find(c => c.id === p.categoryId) || { name: '---' };
    let isOut = p.stock === 0;

    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong style="color:#f87171;">${p.sku}</strong></td>
      <td>${p.name}</td>
      <td>${cat.name}</td>
      <td><span class="barcode-badge">${p.barcode}</span></td>
      <td><strong style="color:${isOut ? '#ef4444' : '#f59e0b'}; font-size:1.1rem;">${p.stock}</strong></td>
      <td>${p.minStock}</td>
      <td><span class="badge ${isOut ? 'badge-danger' : 'badge-warning'}">${isOut ? 'HẾT HÀNG' : 'SẮP HẾT HÀNG'}</span></td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="quickCreateImportForSKU('${p.sku}')">Lập Phiếu Nhập Hàng</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function quickCreateImportForSKU(sku) {
  startTransaction("IN", sku);
}

function toggleProductActive(prodId) {
  const prod = AppState.products.find(p => p.id === prodId);
  if (!prod) return;
  prod.status = prod.status === "active" ? "inactive" : "active";
  addActivityLog("UPDATE_PRODUCT_STATUS", prod.sku, `Đổi trạng thái: ${prod.status}`);
  showToast(`Đã cập nhật trạng thái sản phẩm ${prod.sku}`, "info");
  renderProducts();
  renderDashboard();
}

function toggleCategoryActive(catId) {
  const cat = AppState.categories.find(c => c.id === catId);
  if (!cat) return;
  cat.status = cat.status === "active" ? "inactive" : "active";
  addActivityLog("UPDATE_CATEGORY_STATUS", cat.name, `Đổi trạng thái: ${cat.status}`);
  showToast(`Đã đổi trạng thái danh mục: ${cat.name}`, "info");
  renderCategories();
}

function toggleUserStatus(userId) {
  if (AppState.currentUser.role !== "ADMIN") {
    showToast("Chỉ Admin mới có quyền khóa/mở tài khoản!", "error");
    return;
  }
  const u = AppState.users.find(usr => usr.id === userId);
  if (!u) return;
  if (u.username === "admin") {
    showToast("Không thể khóa tài khoản quản trị tối cao (admin)!", "error");
    return;
  }
  u.status = u.status === "active" ? "blocked" : "active";
  addActivityLog("UPDATE_USER_STATUS", u.username, `Đổi trạng thái tài khoản thành ${u.status}`);
  showToast(`Đã thay đổi trạng thái user ${u.username}`, "info");
  renderUsers();
}

function editProduct(prodId) {
  const prod = AppState.products.find(p => p.id === prodId);
  if (!prod) return;

  document.getElementById("modal-product-title").textContent = "Cập Nhật Thông Tin Sản Phẩm";
  document.getElementById("prod-form-id").value = prod.id;
  document.getElementById("prod-sku").value = prod.sku;
  document.getElementById("prod-sku").disabled = true;
  document.getElementById("prod-name").value = prod.name;
  document.getElementById("prod-unit").value = prod.unit;
  document.getElementById("prod-import-price").value = prod.importPrice;
  document.getElementById("prod-sale-price").value = prod.salePrice;
  document.getElementById("prod-min-stock").value = prod.minStock;
  document.getElementById("prod-barcode-val").value = prod.barcode;
  document.getElementById("prod-desc").value = prod.desc || "";

  const catSelect = document.getElementById("prod-category");
  catSelect.innerHTML = "";
  AppState.categories.filter(c => c.status === 'active').forEach(c => {
    let opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    if (c.id === prod.categoryId) opt.selected = true;
    catSelect.appendChild(opt);
  });

  document.getElementById("modal-product").classList.add("active");
}

function editCategory(catId) {
  const cat = AppState.categories.find(c => c.id === catId);
  if (!cat) return;

  document.getElementById("modal-category-title").textContent = "Cập Nhật Danh Mục";
  document.getElementById("cat-form-id").value = cat.id;
  document.getElementById("cat-name").value = cat.name;
  document.getElementById("cat-desc").value = cat.description || "";
  document.getElementById("modal-category").classList.add("active");
}

document.addEventListener("DOMContentLoaded", () => {
  restoreAppState();
  AppState.activePage = document.body.dataset.page || "dashboard";
  renderCurrentUser();
  window.addEventListener("pagehide", saveAppState);
  window.addEventListener("pageshow", event => {
    if (event.persisted) {
      restoreAppState();
      renderCurrentUser();
      renderCurrentPage();
    }
  });
  document.querySelectorAll(".sidebar-menu .nav-link").forEach(link => {
    link.addEventListener("click", saveAppState);
  });

  document.getElementById("btn-toggle-role")?.addEventListener("click", () => {
    if (AppState.currentUser.role === "ADMIN") {
      AppState.currentUser = {
        username: "kho_staff1",
        name: "Nguyễn Văn An",
        role: "STAFF"
      };
      document.getElementById("current-user-avatar").textContent = "NV";
      document.getElementById("current-user-name").textContent = "Nguyễn Văn An";
      const b = document.getElementById("current-user-role-badge");
      b.textContent = "STAFF";
      b.className = "user-role-badge role-staff";
      showToast("Đã đổi vai trò sang NHÂN VIÊN KHO (STAFF). Các quyền quản trị danh mục/duyệt kiểm kê bị giới hạn.", "warning");
    } else {
      AppState.currentUser = {
        username: "admin",
        name: "Quản Trị Viên",
        role: "ADMIN"
      };
      document.getElementById("current-user-avatar").textContent = "AD";
      document.getElementById("current-user-name").textContent = "Quản Trị Viên";
      const b = document.getElementById("current-user-role-badge");
      b.textContent = "ADMIN";
      b.className = "user-role-badge role-admin";
      showToast("Đã đổi vai trò sang QUẢN TRỊ VIÊN (ADMIN). Toàn quyền thao tác hệ thống.", "success");
    }
    addActivityLog("SWITCH_ROLE", AppState.currentUser.username, `Chuyển quyền thử nghiệm sang ${AppState.currentUser.role}`);
  });

  document.getElementById("btn-topbar-bell")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("notification-dropdown").classList.toggle("active");
  });

  document.addEventListener("click", (e) => {
    const drop = document.getElementById("notification-dropdown");
    if (drop && !drop.contains(e.target)) {
      drop.classList.remove("active");
    }
  });

  document.getElementById("btn-view-all-alerts")?.addEventListener("click", () => {
    document.getElementById("notification-dropdown").classList.remove("active");
    navigateToPage("alerts");
  });

  document.getElementById("btn-quick-scan-action")?.addEventListener("click", () => {
    navigateToPage("scanner");
  });

  document.getElementById("btn-dash-create-sku")?.addEventListener("click", () => {
    navigateToPage("products", { action: "create" });
  });

  document.getElementById("btn-goto-alerts")?.addEventListener("click", () => {
    navigateToPage("alerts");
  });

  document.getElementById("dash-date-filter")?.addEventListener("change", () => {
    renderDashboard();
    showToast("Đã lọc lại dữ liệu thời gian theo chỉ định", "info");
  });

  document.getElementById("global-quick-search")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const q = e.target.value.trim();
      if (!q) return;
      if (AppState.activePage === "scanner") {
        handleBarcodeScanned(q);
      } else {
        navigateToPage("scanner", { code: q });
      }
      e.target.value = "";
    }
  });

  document.getElementById("btn-open-create-product")?.addEventListener("click", () => {
    if (AppState.currentUser.role !== "ADMIN") {
      showToast("Nhân viên kho chỉ có quyền xem, không được thêm sản phẩm!", "warning");
      return;
    }
    document.getElementById("modal-product-title").textContent = "Thêm Sản Phẩm Mới (F04)";
    document.getElementById("prod-form-id").value = "";
    document.getElementById("prod-sku").disabled = false;
    document.getElementById("prod-sku").value = `SP000${125 + AppState.products.length}`;
    document.getElementById("prod-name").value = "";
    document.getElementById("prod-unit").value = "Cái";
    document.getElementById("prod-import-price").value = "";
    document.getElementById("prod-sale-price").value = "";
    document.getElementById("prod-min-stock").value = "5";
    document.getElementById("prod-barcode-val").value = "";
    document.getElementById("prod-desc").value = "";

    const catSelect = document.getElementById("prod-category");
    catSelect.innerHTML = "";
    AppState.categories.filter(c => c.status === 'active').forEach(c => {
      let opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      catSelect.appendChild(opt);
    });

    document.getElementById("modal-product").classList.add("active");
  });

  document.getElementById("btn-submit-product")?.addEventListener("click", () => {
    const editId = document.getElementById("prod-form-id").value;
    const sku = document.getElementById("prod-sku").value.trim();
    const name = document.getElementById("prod-name").value.trim();
    const categoryId = parseInt(document.getElementById("prod-category").value, 10);
    const unit = document.getElementById("prod-unit").value.trim();
    const importPrice = parseFloat(document.getElementById("prod-import-price").value);
    const salePrice = parseFloat(document.getElementById("prod-sale-price").value);
    const minStock = parseInt(document.getElementById("prod-min-stock").value, 10);
    const barcode = document.getElementById("prod-barcode-val").value.trim() || sku;
    const desc = document.getElementById("prod-desc").value.trim();

    if (!sku || !name || isNaN(importPrice) || isNaN(salePrice) || isNaN(minStock)) {
      showToast("Vui lòng điền đầy đủ các thông tin bắt buộc!", "error");
      return;
    }

    if (importPrice < 0 || salePrice < 0 || minStock < 0) {
      showToast("Giá và ngưỡng tồn không được âm!", "error");
      return;
    }

    if (!editId) {
      if (AppState.products.some(p => p.sku === sku)) {
        showToast("Mã SKU này đã tồn tại! Vui lòng chọn SKU khác.", "error");
        return;
      }
      if (AppState.products.some(p => p.barcode === barcode)) {
        showToast("Mã vạch (Barcode) này đã được gán cho sản phẩm khác!", "error");
        return;
      }

      const newProd = {
        id: AppState.products.length + 1,
        sku: sku,
        name: name,
        categoryId: categoryId,
        unit: unit,
        importPrice: importPrice,
        salePrice: salePrice,
        stock: 0,
        minStock: minStock,
        barcode: barcode,
        barcodeType: "CODE128",
        status: "active",
        desc: desc
      };
      AppState.products.unshift(newProd);
      addActivityLog("CREATE_PRODUCT", sku, `Tạo mới SKU ${sku} (Tồn ban đầu = 0)`);
      showToast(`Đã thêm sản phẩm ${sku} thành công! Tồn ban đầu bằng 0.`, "success");
    } else {
      const prod = AppState.products.find(p => p.id === parseInt(editId, 10));
      if (prod) {
        prod.name = name;
        prod.categoryId = categoryId;
        prod.unit = unit;
        prod.importPrice = importPrice;
        prod.salePrice = salePrice;
        prod.minStock = minStock;
        prod.barcode = barcode;
        prod.desc = desc;
        addActivityLog("UPDATE_PRODUCT", sku, `Cập nhật thông số kỹ thuật và giá SKU ${sku}`);
        showToast(`Đã cập nhật thông tin sản phẩm ${sku}!`, "success");
      }
    }

    document.getElementById("modal-product").classList.remove("active");
    renderProducts();
    renderDashboard();
  });

  document.getElementById("filter-prod-search")?.addEventListener("input", renderProducts);
  document.getElementById("filter-prod-category")?.addEventListener("change", renderProducts);
  document.getElementById("filter-prod-status")?.addEventListener("change", renderProducts);

  document.getElementById("btn-open-create-category")?.addEventListener("click", () => {
    if (AppState.currentUser.role !== "ADMIN") {
      showToast("Chỉ Quản trị viên mới có quyền thêm danh mục!", "warning");
      return;
    }
    document.getElementById("modal-category-title").textContent = "Thêm Danh Mục Mới (F03)";
    document.getElementById("cat-form-id").value = "";
    document.getElementById("cat-name").value = "";
    document.getElementById("cat-desc").value = "";
    document.getElementById("modal-category").classList.add("active");
  });

  document.getElementById("btn-submit-category")?.addEventListener("click", () => {
    const editId = document.getElementById("cat-form-id").value;
    const name = document.getElementById("cat-name").value.trim();
    const desc = document.getElementById("cat-desc").value.trim();

    if (!name) {
      showToast("Tên danh mục không được để trống!", "error");
      return;
    }

    if (!editId) {
      if (AppState.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        showToast("Tên danh mục này đã tồn tại!", "error");
        return;
      }
      AppState.categories.push({
        id: AppState.categories.length + 1,
        name: name,
        description: desc,
        status: "active"
      });
      addActivityLog("CREATE_CATEGORY", name, "Tạo danh mục mới");
      showToast("Đã thêm danh mục thành công!", "success");
    } else {
      const cat = AppState.categories.find(c => c.id === parseInt(editId, 10));
      if (cat) {
        cat.name = name;
        cat.description = desc;
        addActivityLog("UPDATE_CATEGORY", name, "Cập nhật danh mục");
        showToast("Đã cập nhật danh mục!", "success");
      }
    }

    document.getElementById("modal-category").classList.remove("active");
    renderCategories();
  });

  document.getElementById("filter-cat-search")?.addEventListener("input", renderCategories);
  document.getElementById("filter-cat-status")?.addEventListener("change", renderCategories);

  document.getElementById("barcode-select-product")?.addEventListener("change", (e) => {
    const sku = e.target.value;
    const prod = AppState.products.find(p => p.sku === sku);
    if (prod) {
      document.getElementById("barcode-input-payload").value = prod.barcode;
      document.getElementById("barcode-type-select").value = prod.barcodeType || "CODE128";
      updateBarcodePreview();
    }
  });

  document.getElementById("barcode-type-select")?.addEventListener("change", updateBarcodePreview);
  document.getElementById("barcode-input-payload")?.addEventListener("input", updateBarcodePreview);

  document.getElementById("btn-auto-gen-barcode")?.addEventListener("click", () => {
    const select = document.getElementById("barcode-select-product");
    const sku = select.value;
    if (sku) {
      document.getElementById("barcode-input-payload").value = sku;
      updateBarcodePreview();
      showToast("Đã thiết lập mã vạch tự động theo SKU!", "info");
    }
  });

  document.getElementById("btn-save-barcode")?.addEventListener("click", () => {
    const sku = document.getElementById("barcode-select-product").value;
    const prod = AppState.products.find(p => p.sku === sku);
    const newCode = document.getElementById("barcode-input-payload").value.trim();
    const type = document.getElementById("barcode-type-select").value;

    if (!prod || !newCode) return;

    if (AppState.products.some(p => p.sku !== sku && p.barcode === newCode)) {
      showToast("Mã vạch này đã được sử dụng bởi một SKU khác (Quy tắc BR-01)!", "error");
      return;
    }

    prod.barcode = newCode;
    prod.barcodeType = type;
    addActivityLog("ASSIGN_BARCODE", sku, `Gán mã vạch ${newCode} (${type}) cho ${sku}`);
    showToast(`Đã lưu mã vạch ${newCode} cho sản phẩm ${sku}`, "success");
    renderProducts();
  });

  document.getElementById("btn-print-barcode-direct")?.addEventListener("click", () => {
    const sku = document.getElementById("barcode-select-product").value;
    quickPrintBarcode(sku);
  });

  document.getElementById("btn-download-barcode-svg")?.addEventListener("click", () => {
    const wrapper = document.getElementById("barcode-svg-wrapper");
    const svgContent = wrapper.innerHTML;
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Barcode_${document.getElementById('barcode-select-product').value}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("Đã tải xuống file SVG của mã vạch!", "success");
  });

  document.getElementById("btn-toggle-cam")?.addEventListener("click", () => {
    AppState.cameraActive = !AppState.cameraActive;
    const badge = document.getElementById("cam-status-badge");
    if (AppState.cameraActive) {
      badge.textContent = "Camera đang nhận diện (OpenCV Live)";
      badge.className = "badge badge-success";
      showToast("Camera nhận diện đã bật! Đưa mã vào tâm khung quét.", "info");
    } else {
      badge.textContent = "Camera đã tắt";
      badge.className = "badge badge-secondary";
    }
    initCameraSim();
  });

  document.getElementById("btn-sim-scan-good")?.addEventListener("click", () => {
    handleBarcodeScanned("SP000125");
  });

  document.getElementById("btn-sim-scan-unknown")?.addEventListener("click", () => {
    handleBarcodeScanned("UNKNOWN_BARCODE_888");
  });

  document.getElementById("usb-scanner-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const code = e.target.value.trim();
      handleBarcodeScanned(code);
      e.target.value = "";
    }
  });

  document.getElementById("btn-usb-search")?.addEventListener("click", () => {
    const inp = document.getElementById("usb-scanner-input");
    handleBarcodeScanned(inp.value.trim());
    inp.value = "";
  });

  document.getElementById("btn-open-create-stock-in")?.addEventListener("click", () => {
    openCreateTransactionModal("IN");
  });

  document.getElementById("btn-open-create-stock-out")?.addEventListener("click", () => {
    openCreateTransactionModal("OUT");
  });

  document.getElementById("btn-add-line-to-tx")?.addEventListener("click", () => {
    const sel = document.getElementById("tx-add-prod-select");
    const sku = sel.value;
    const qty = parseInt(document.getElementById("tx-add-qty").value, 10) || 1;
    const isImport = document.getElementById("tx-kind").value === "IN";

    if (!sku) return;
    const prod = AppState.products.find(p => p.sku === sku);
    if (!prod) return;

    let existing = AppState.currentCart.find(it => it.sku === sku);
    if (existing) {
      existing.qty += qty;
    } else {
      AppState.currentCart.push({
        sku: prod.sku,
        name: prod.name,
        currentStock: prod.stock,
        qty: qty,
        price: isImport ? prod.importPrice : prod.salePrice
      });
    }

    renderCartTable();
  });

  document.getElementById("btn-save-tx-draft")?.addEventListener("click", () => {
    saveTransaction(false);
  });

  document.getElementById("btn-confirm-tx-save")?.addEventListener("click", () => {
    saveTransaction(true);
  });

  document.getElementById("filter-in-search")?.addEventListener("input", renderStockInList);
  document.getElementById("filter-in-status")?.addEventListener("change", renderStockInList);

  document.getElementById("filter-out-search")?.addEventListener("input", renderStockOutList);
  document.getElementById("filter-out-status")?.addEventListener("change", renderStockOutList);

  document.getElementById("btn-print-viewed-tx")?.addEventListener("click", () => {
    const content = document.getElementById("printable-tx-content").innerHTML;
    const printArea = document.getElementById("print-container");
    printArea.innerHTML = `<div style="font-family:sans-serif; padding:30px;">${content}</div>`;
    window.print();
  });

  document.getElementById("btn-open-new-stocktake")?.addEventListener("click", openStocktakeWizard);
  document.getElementById("btn-submit-stocktake-approve")?.addEventListener("click", submitStocktakeApprove);

  document.getElementById("report-type-select")?.addEventListener("change", renderReportView);
  document.getElementById("report-period-select")?.addEventListener("change", renderReportView);
  document.getElementById("btn-export-report-csv")?.addEventListener("click", exportReportCSV);

  document.getElementById("filter-log-search")?.addEventListener("input", renderActivityLogs);
  document.getElementById("filter-log-action")?.addEventListener("change", renderActivityLogs);

  document.getElementById("btn-open-create-user")?.addEventListener("click", () => {
    if (AppState.currentUser.role !== "ADMIN") {
      showToast("Chỉ Admin mới có quyền tạo người dùng!", "error");
      return;
    }
    document.getElementById("user-username").value = "";
    document.getElementById("user-fullname").value = "";
    document.getElementById("user-password").value = "";
    document.getElementById("modal-user").classList.add("active");
  });

  document.getElementById("btn-submit-user")?.addEventListener("click", () => {
    const username = document.getElementById("user-username").value.trim();
    const fullname = document.getElementById("user-fullname").value.trim();
    const password = document.getElementById("user-password").value;
    const role = document.getElementById("user-role").value;

    if (!username || !fullname || !password) {
      showToast("Vui lòng nhập đầy đủ thông tin tài khoản!", "error");
      return;
    }

    if (AppState.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      showToast("Tên đăng nhập này đã tồn tại!", "error");
      return;
    }

    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    AppState.users.push({
      id: AppState.users.length + 1,
      username: username,
      fullname: fullname,
      role: role,
      status: "active",
      createdAt: dateStr
    });

    addActivityLog("CREATE_USER", username, `Tạo tài khoản mới vai trò ${role}`);
    showToast(`Đã tạo tài khoản ${username} thành công!`, "success");
    document.getElementById("modal-user").classList.remove("active");
    renderUsers();
  });

  document.querySelectorAll("[data-close-modal]").forEach(btn => {
    btn.addEventListener("click", () => {
      const modalId = btn.getAttribute("data-close-modal");
      const m = document.getElementById(modalId);
      if (m) m.classList.remove("active");
    });
  });

  document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove("active");
      }
    });
  });

  // ===== TÍNH NĂNG THU GỌN / MỞ RỘNG SIDEBAR (COLLAPSE / EXPAND) =====
  function toggleSidebarCollapse() {
    if (window.innerWidth <= 850) {
      document.body.classList.toggle("sidebar-mobile-open");
    } else {
      document.body.classList.toggle("sidebar-collapsed");
      const isCollapsed = document.body.classList.contains("sidebar-collapsed");
      try {
        localStorage.setItem("tgmt_sidebar_collapsed", isCollapsed ? "true" : "false");
      } catch (e) {}
    }
  }

  const btnSidebarCollapse = document.getElementById("btn-sidebar-collapse");
  if (btnSidebarCollapse) {
    btnSidebarCollapse.addEventListener("click", toggleSidebarCollapse);
  }

  const btnTopbarSidebarToggle = document.getElementById("btn-topbar-sidebar-toggle");
  if (btnTopbarSidebarToggle) {
    btnTopbarSidebarToggle.addEventListener("click", toggleSidebarCollapse);
  }

  const sidebarOverlay = document.getElementById("sidebar-overlay");
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", () => {
      document.body.classList.remove("sidebar-mobile-open");
    });
  }

  // Phím tắt Alt + S để bật/tắt nhanh Sidebar
  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      toggleSidebarCollapse();
    }
  });

  // Tự động tối ưu theo độ phân giải màn hình khi khởi chạy
  try {
    const savedCollapsed = localStorage.getItem("tgmt_sidebar_collapsed");
    if (savedCollapsed === "true") {
      document.body.classList.add("sidebar-collapsed");
    } else if (savedCollapsed === "false") {
      document.body.classList.remove("sidebar-collapsed");
    } else if (window.innerWidth <= 1200) {
      // Màn hình nhỏ (<= 1200px) tự động thu gọn sidebar để bảng dữ liệu rộng rãi
      document.body.classList.add("sidebar-collapsed");
    }
  } catch (e) {
    if (window.innerWidth <= 1200) {
      document.body.classList.add("sidebar-collapsed");
    }
  }

  // Lắng nghe khi thay đổi kích thước cửa sổ
  window.addEventListener("resize", () => {
    if (window.innerWidth > 850) {
      document.body.classList.remove("sidebar-mobile-open");
    }
  });

  renderCurrentPage();
  applyPageAction();
});
