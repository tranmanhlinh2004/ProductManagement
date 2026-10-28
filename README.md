# ProductManagement — Smart Warehouse

## Mục đích tài liệu

Giải thích cách để frontend hiện tại lấy dữ liệu từ database SQL Server. Backend đã có lớp kết nối SQL Server và lệnh kiểm tra `check-db`; xem cách cấu hình trong [README backend](backend/README.md#8-kết-nối-sql-server). Frontend vẫn dùng dữ liệu mẫu. Các endpoint nghiệp vụ và đoạn code tích hợp bên dưới là thiết kế cho bước triển khai sau, chưa hoạt động trong dự án.

## 1. Dự án hiện đang lấy dữ liệu ở đâu?

| Thành phần        | Vị trí                         | Vai trò hiện tại               |
| :---------------- | :----------------------------- | :----------------------------- |
| **Giao diện**     | `frontend/sources/`            | Các trang HTML                 |
| **JavaScript**    | `frontend/assets/js/script.js` | Dữ liệu mẫu và xử lý giao diện |
| **Backend**       | `backend/`                     | Flask, SQL Server và `check-db` |
| **Cấu trúc CSDL** | `database/SQLQuery1.sql`       | Tạo database, bảng và index    |
| **Dữ liệu mẫu**   | `database/SQLQuery2.sql`       | Thêm dữ liệu vào các bảng rỗng |

Các trang HTML gồm Dashboard, sản phẩm, danh mục, nhập/xuất kho… Backend đã kết nối được database `QLSP_Barcode` bằng `pyodbc`, nhưng chưa có API nghiệp vụ để frontend gọi. Các script database dùng SQL Server.

**Lưu tạm trên trình duyệt:** `saveAppState()` và `restoreAppState()` ghi/đọc `localStorage` với khóa `tgmt_warehouse_state_v1`. Dữ liệu mẫu ban đầu nằm trong `AppState`.

`frontend/sources/index.html` nạp `../assets/js/script.js`. Khi trang khởi động, JavaScript đọc trạng thái đã lưu; các hàm như `renderDashboard()` và `renderProducts()` lấy dữ liệu từ `AppState` để đưa lên HTML. Hiện chưa có lời gọi `fetch()` đến backend.

Vì vậy, thêm dữ liệu bằng SQL Server Management Studio (SSMS) sẽ chưa làm giao diện thay đổi. Ngược lại, thêm sản phẩm trên giao diện hiện tại cũng chưa ghi vào SQL Server. `localStorage` thuộc trình duyệt và origin đang mở, không phải database dùng chung giữa các máy.

## 2. Frontend sẽ lấy dữ liệu từ database như thế nào?

Luồng cần xây dựng:

```text
Frontend (HTML + JavaScript trong trình duyệt)
    │  HTTP request: GET /api/products
    ▼
Backend API (chạy trên server)
    │  Kiểm tra quyền, thực hiện truy vấn qua driver SQL Server
    ▼
SQL Server — database QLSP_Barcode
    │  Trả kết quả truy vấn
    ▼
Backend chuyển kết quả thành JSON
    │  HTTP response
    ▼
Frontend nhận JSON → cập nhật AppState → gọi hàm render → hiện dữ liệu
```

Trách nhiệm của từng phần:

- **Frontend:** gửi yêu cầu, nhận JSON và hiển thị trạng thái đang tải, dữ liệu rỗng hoặc lỗi.
- **Backend:** cung cấp API, xác thực người dùng, kiểm tra dữ liệu/quyền và đọc hoặc ghi database.
- **Database:** lưu dữ liệu lâu dài, áp dụng các ràng buộc và thực hiện truy vấn.

Với kiến trúc này, frontend gọi backend qua HTTP, không chứa tài khoản hay mật khẩu SQL Server. Thông tin kết nối database được cấu hình riêng ở backend bằng biến môi trường hoặc cấu hình bí mật, không đưa vào HTML/JavaScript hay commit thông tin thật lên Git.

Dự án dùng Python + Flask cho backend và `pyodbc` để kết nối SQL Server. Hợp đồng HTTP/JSON bên dưới là đề xuất cho các API nghiệp vụ sắp triển khai.

## 3. Những bước cần làm khi bắt đầu triển khai

### Bước 1: Chuẩn bị SQL Server

1. Có SQL Server đang chạy và xác định đúng server/instance, database và phương thức xác thực.
2. Trên môi trường phát triển, chạy script tạo cấu trúc `SQLQuery1.sql` trước; phần `CREATE DATABASE` cần được thực thi thành batch riêng, rồi mới `USE QLSP_Barcode` và tạo bảng. Có thể tách bằng `GO` khi chạy qua SSMS.
3. Nếu cần dữ liệu thử, chạy `SQLQuery2.sql` sau khi các bảng đã được tạo và còn rỗng. Script này sẽ từ chối chạy nếu đã có dữ liệu trong các bảng được kiểm tra.
4. Backend dùng tài khoản có quyền cần thiết để truy cập database. Backend cần một cấu hình kết nối gồm server/instance hoặc host/port, database, phương thức xác thực và tùy chọn mã hóa phù hợp môi trường.

`GO` là dấu phân cách batch của công cụ như SSMS; khi dùng driver để chạy SQL trong backend, không gửi nguyên script có `GO` như một câu truy vấn thông thường. Script tạo database không phải thao tác cần chạy mỗi lần frontend tải trang.

### Bước 2: Xây dựng backend API

Backend cần mở kết nối qua driver SQL Server, quản lý kết nối, xử lý truy vấn và trả JSON. Có thể chia thành route/controller nhận request, service xử lý nghiệp vụ và repository truy cập database.

Các API đọc dữ liệu có thể thiết kế như sau; đây là đề xuất, chưa phải endpoint đã tồn tại. Tất cả endpoint trong bảng dùng phương thức **`GET`**:

| Endpoint             | Dùng cho                      | Bảng dữ liệu chính                                                         |
| :------------------- | :---------------------------- | :------------------------------------------------------------------------- |
| `/api/categories`    | Danh mục, bộ lọc              | `categories`                                                               |
| `/api/products`      | Sản phẩm, tồn kho, tra cứu mã | `products`<br>`inventory`                                                  |
| `/api/transactions`  | Phiếu nhập/xuất và dòng hàng  | `stock_transactions`<br>`transaction_details`<br>`products`<br>`users`     |
| `/api/dashboard`     | Chỉ số tổng quan theo kỳ      | `products`<br>`inventory`<br>`stock_transactions`<br>`transaction_details` |
| `/api/stocktakes`    | Đợt kiểm kê và chi tiết       | `stocktakes`<br>`stocktake_details`                                        |
| `/api/activity-logs` | Lịch sử hoạt động             | `activity_logs`<br>`users`                                                 |

Ví dụ lọc Dashboard theo kỳ: `GET /api/dashboard?period=7days`.

Với API có tìm kiếm hoặc lọc, backend phải truyền giá trị bằng tham số truy vấn của driver, không ghép trực tiếp dữ liệu người dùng vào chuỗi SQL. Chỉ trả những trường frontend cần; API người dùng không được trả `password_hash`.

### Bước 3: Thống nhất dữ liệu JSON với frontend

Tên cột database hiện khác tên thuộc tính mà giao diện đang dùng. Với sản phẩm, các trường `id`, `sku`, `name`, `unit` trong bảng `products` giữ nguyên tên; `id` trả dạng số. Các trường cần ánh xạ được chia thành hai nhóm:

**Đổi tên trường**

| Cột trong `products` | Thuộc tính frontend | Kiểu dữ liệu JSON |
| :------------------- | :------------------ | :---------------- |
| `category_id`        | `categoryId`        | Số                |
| `import_price`       | `importPrice`       | Số                |
| `sale_price`         | `salePrice`         | Số                |
| `min_stock`          | `minStock`          | Số                |
| `barcode_value`      | `barcode`           | Chuỗi hoặc `null` |
| `barcode_type`       | `barcodeType`       | Chuỗi             |

**Chuyển giá trị hoặc ghép bảng**

| Nguồn trong database | Thuộc tính frontend | Cách chuyển                            |
| :------------------- | :------------------ | :------------------------------------- |
| `products.is_active` | `status`            | `1` → `"active"`<br>`0` → `"inactive"` |
| `inventory.quantity` | `stock`             | Lấy số lượng tồn từ bảng `inventory`   |

Để lấy `stock`, ghép hai bảng theo điều kiện `inventory.product_id = products.id`.

Hai khác biệt khác cần thống nhất trước khi làm chức năng ghi dữ liệu:

- Frontend có `product.desc`, nhưng bảng `products` chưa có cột mô tả. Tạm thời có thể trả chuỗi rỗng; nếu muốn lưu mô tả thì cần bổ sung thiết kế database sau.
- Frontend có `transaction.partner`, nhưng `stock_transactions` chưa có trường tương ứng. Cần quyết định cách lưu nhà cung cấp/đơn vị nhận trước khi triển khai nhập/xuất kho thật.

Danh mục cũng cần chuyển `is_active` sang `status`. Phiếu kho cần ghép các dòng từ `transaction_details` thành mảng `items`, với `quantity` → `qty`, `unit_price` → `price`; người tạo cần được tra từ `users`. Không thể gán nguyên dữ liệu của mọi bảng vào `AppState` và mong tất cả màn hình hoạt động ngay.

## 4. Ví dụ đầy đủ: lấy danh sách sản phẩm

### Backend truy vấn dữ liệu

Truy vấn minh họa dưới đây lấy sản phẩm cùng số lượng tồn và đặt tên trường gần với frontend:

```sql
SELECT
    p.id,
    p.sku,
    p.name,
    p.category_id AS categoryId,
    p.unit,
    p.import_price AS importPrice,
    p.sale_price AS salePrice,
    COALESCE(i.quantity, 0) AS stock,
    p.min_stock AS minStock,
    p.barcode_value AS barcode,
    p.barcode_type AS barcodeType,
    CASE WHEN p.is_active = 1 THEN 'active' ELSE 'inactive' END AS status
FROM dbo.products AS p
LEFT JOIN dbo.inventory AS i ON i.product_id = p.id
ORDER BY p.id;
```

`stock` lấy từ bảng `inventory`, không phải cột trong `products`. `LEFT JOIN` giúp vẫn lấy được sản phẩm chưa có dòng tồn kho; ví dụ này hiển thị số lượng thiếu là `0`.

Backend chạy câu SQL, chuyển kiểu dữ liệu phù hợp rồi trả response `200 OK`, `Content-Type: application/json`, ví dụ:

```json
{
  "data": [
    {
      "id": 1,
      "sku": "SP0001",
      "name": "Sản phẩm minh họa",
      "categoryId": 1,
      "unit": "Cái",
      "importPrice": 100000,
      "salePrice": 150000,
      "stock": 25,
      "minStock": 10,
      "barcode": "QLSP-0001",
      "barcodeType": "CODE128",
      "status": "active",
      "desc": ""
    }
  ]
}
```

Các giá trị trên chỉ minh họa định dạng. Nếu không có sản phẩm, trả `{ "data": [] }`. Khi thêm phân trang sau này, cần bổ sung thông tin trang/tổng số và điều chỉnh frontend; không dùng riêng một trang sản phẩm để tính tổng tồn toàn kho.

### Frontend gọi API và hiển thị

Ví dụ dưới đây minh họa cách tải dữ liệu cho **trang sản phẩm**, nơi đã có `renderProducts()`. Giả định API đã được triển khai, trả đúng hợp đồng trên, cho phép truy cập và frontend đã được phục vụ qua HTTP:

```js
// Chỉ là ví dụ trong README, chưa thêm vào script.js.
// Cổng 8080 là giả định; cần đổi theo cấu hình backend thực tế.
const API_BASE_URL = "http://localhost:8080/api";

async function loadProductsPage() {
  try {
    const responses = await Promise.all([
      fetch(`${API_BASE_URL}/categories`),
      fetch(`${API_BASE_URL}/products`)
    ]);

    for (const response of responses) {
      if (!response.ok) {
        throw new Error(`Không tải được dữ liệu (HTTP ${response.status})`);
      }
    }

    const [categoriesBody, productsBody] = await Promise.all(
      responses.map(response => response.json())
    );

    if (!Array.isArray(categoriesBody.data) || !Array.isArray(productsBody.data)) {
      throw new Error("Dữ liệu API trả về không đúng định dạng");
    }

    AppState.categories = categoriesBody.data;
    AppState.products = productsBody.data;
    renderProducts();
  } catch (error) {
    showToast(error.message, "error");
  }
}
```

Ví dụ giả định `GET /api/categories` cũng trả `{ "data": [...] }` với các trường danh mục mà frontend đang dùng. Tải cả danh mục giúp tên danh mục và bộ lọc khớp với sản phẩm từ database.

Khi tích hợp thật, cần đặt lời gọi `await loadProductsPage()` vào nhánh khởi tạo trang sản phẩm trong luồng `DOMContentLoaded`, đồng thời điều chỉnh thứ tự render hiện tại để chờ dữ liệu. Cần thêm trạng thái đang tải và thông báo lỗi rõ ràng, tránh hiển thị dữ liệu demo như thể đó là dữ liệu database.

Đối với `index.html`, `renderDashboard()` hiện đọc `AppState.products` **và** `AppState.transactions`. Nếu giữ cách tính này, phải tải đủ dữ liệu sản phẩm, phiếu kho và các dòng hàng trước khi render. Một hướng khác là dùng API `/api/dashboard` để backend tính tổng và sửa frontend hiển thị kết quả đó. Chỉ tạo endpoint dashboard sẽ chưa tự làm hàm render hiện tại đọc được kết quả mới.

## 5. Chạy frontend và backend để hai bên gọi được nhau

Ví dụ địa chỉ phát triển dự kiến:

```text
Frontend: http://localhost:5500/frontend/sources/index.html
Backend:  http://localhost:8080/api/products
Database: SQL Server, database QLSP_Barcode
```

Đường dẫn frontend trên giả định static server phục vụ từ thư mục gốc dự án. Nếu phục vụ từ thư mục `frontend`, đường dẫn sẽ là `/sources/index.html`. Nên phục vụ HTML bằng static server qua HTTP khi tích hợp API.

Frontend cổng `5500` và backend cổng `8080` là hai origin khác nhau. Backend cần cấu hình **CORS** cho đúng origin frontend, ví dụ `http://localhost:5500`; nếu dùng cookie đăng nhập thì phải thống nhất thêm cấu hình credentials ở hai bên. CORS cho phép trình duyệt đọc response, không thay thế việc xác thực hay phân quyền.

Nếu backend phục vụ luôn frontend trên cùng origin, có thể gọi đường dẫn tương đối như `fetch("/api/products")`. Khi đó không cần CORS cho lời gọi cùng origin. Cổng HTTP của API và cổng/instance SQL Server là hai cấu hình riêng.

## 6. Những phần của frontend cần điều chỉnh khi triển khai thật

- **Nguồn dữ liệu:** thay dữ liệu mẫu bằng kết quả API; `AppState` có thể tiếp tục giữ dữ liệu đã tải để render.
- **Khôi phục trạng thái:** sửa `restoreAppState()` và các chỗ gọi nó, gồm cả `pageshow`, để dữ liệu cũ từ `localStorage` không ghi đè kết quả mới từ server. Có thể tiếp tục lưu tùy chọn giao diện như trạng thái thu gọn sidebar.
- **Điều hướng nhiều trang:** mỗi trang HTML tải lại JavaScript, nên cần tải các dữ liệu trang đó dùng khi mở hoặc quay lại trang. Lấy dữ liệu một lần ở Dashboard không tự cung cấp dữ liệu cho mọi lần chuyển trang.
- **Tạo/sửa dữ liệu:** thay các thao tác chỉ cập nhật mảng trong bộ nhớ bằng lời gọi API `POST`/`PUT`/`PATCH` theo hợp đồng đã thống nhất; cập nhật giao diện sau khi backend xác nhận lưu thành công.
- **Nhập/xuất kho:** chuyển kiểm tra tồn và cập nhật tồn vào backend. Lưu phiếu, chi tiết và thay đổi tồn trong cùng transaction; xử lý truy cập đồng thời để không xuất âm, và không trừ tồn hai lần khi xác nhận lại cùng phiếu. Phiếu nháp không làm thay đổi tồn.
- **Đăng nhập và phân quyền:** nút đổi vai trò hiện chỉ phục vụ demo. Backend phải xác định người dùng từ phiên đăng nhập và kiểm tra quyền trên từng API; không tin `currentUser` hoặc vai trò do trình duyệt tự gửi.
- **Dashboard/báo cáo:** thống nhất kỳ thời gian, chỉ tính phiếu có trạng thái phù hợp và quyết định cách tính các phiếu điều chỉnh `ADJUST_IN`/`ADJUST_OUT`.

## 7. Cách kiểm tra khi đã triển khai kết nối

1. Backend kết nối được `QLSP_Barcode` và API sản phẩm trả JSON từ dữ liệu truy vấn thật.
2. Trong DevTools → Network, mở trang sản phẩm và thấy request `/api/products` thành công; kiểm tra response và dữ liệu hiện trên bảng khớp nhau.
3. Thay đổi một bản ghi thử trong database phát triển rồi tải lại trang; giao diện phản ánh giá trị mới, không bị trạng thái `localStorage` cũ ghi đè.
4. Kiểm tra trường hợp không có dữ liệu, backend ngừng chạy, lỗi quyền truy cập và sai CORS; giao diện cần báo đúng trạng thái.
5. Khi làm chức năng ghi, xác nhận dữ liệu vẫn còn sau khi tải lại hoặc mở trình duyệt khác và kiểm tra các tình huống xuất quá tồn/xác nhận phiếu lặp lại.

Lớp kết nối backend và kiểm thử riêng đã được triển khai, xem [README backend](backend/README.md#8-kết-nối-sql-server). Các bước kiểm tra API và tích hợp frontend trong mục này sẽ thực hiện khi có API nghiệp vụ.
