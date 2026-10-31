# Backend — ProductManagement

Backend dùng Python + Flask và SQL Server qua `pyodbc`. Flask phục vụ frontend từ `../frontend` và cung cấp API đọc sản phẩm, danh mục.

## Chuẩn bị

Chạy trong thư mục `backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Sửa `.env` theo SQL Server trên máy:

| Biến | Ý nghĩa |
| --- | --- |
| `DB_DRIVER` | Driver đã cài, mặc định `ODBC Driver 18 for SQL Server` |
| `DB_SERVER` | Server/instance, ví dụ `localhost` hoặc `localhost\SQLEXPRESS` |
| `DB_NAME` | Database, mặc định `QLSP` |
| `DB_TRUSTED_CONNECTION` | `yes`: Windows Authentication; `no`: SQL Server Authentication |
| `DB_USER`, `DB_PASSWORD` | Chỉ cần khi dùng SQL Server Authentication |
| `DB_ENCRYPT` | Mã hóa kết nối SQL Server |
| `DB_TRUST_SERVER_CERTIFICATE` | File mẫu dùng `yes` cho SQL Server local có chứng chỉ tự ký; dùng `no` với chứng chỉ hợp lệ |
| `DB_CONNECT_TIMEOUT`, `DB_QUERY_TIMEOUT` | Thời gian chờ tính bằng giây, mặc định 5 và 15 |

Database dùng schema hiện có trong `../database/SQLQuery1.sql`. Backend không tự tạo bảng hay nhập JSON. Không cần xác thực người dùng ứng dụng; bảng `users` được giữ nguyên.

```powershell
.\.venv\Scripts\python.exe -m flask --app wsgi check-db
.\.venv\Scripts\python.exe run.py
```

Backend cung cấp API tại **http://127.0.0.1:8080**. Giữ backend chạy, sau đó nhấp phải `frontend/sources/index.html` trong VS Code → **Open with Live Server** để mở giao diện. `frontend/assets/js/products.js` dùng `API_BASE_URL = 'http://127.0.0.1:8080'` để gọi backend từ Live Server.

Đã cấu hình tự chạy backend khi mở thư mục `ProductManagement` trong VS Code bằng task `ProductManagement: Start backend` tại `../.vscode/tasks.json`. Task dùng trực tiếp Python trong `.venv`, không cần kích hoạt môi trường trong terminal. Lần đầu hãy cho phép automatic tasks nếu VS Code yêu cầu; xem [hướng dẫn VS Code trong README gốc](../README.md#tự-chạy-backend-khi-mở-vs-code). Khi dùng task này, không cần chạy thêm `run.py` thủ công.

API hỗ trợ CORS cho các origin HTTP local: `localhost`, `127.0.0.1`, `[::1]` trên mọi cổng Live Server (ví dụ `5500`, `5501`). CORS áp dụng cả với phản hồi lỗi để giao diện hiển thị được thông báo database. Không cần cài thêm thư viện. Khởi động lại backend sau khi thay đổi code.

Flask vẫn phục vụ giao diện tại **http://127.0.0.1:8080/**; trang gốc chuyển đến `/sources/products.html`.

## API

### GET /api/products

Trả mảng sản phẩm có `products.is_active = 1`, sắp xếp `id` giảm dần. Tên danh mục lấy bằng JOIN với `categories`; sản phẩm vẫn hiển thị nếu danh mục đã ngừng hoạt động.

```json
[
  {
    "id": 1,
    "sku": "SP001",
    "name": "Sữa tươi",
    "category_id": 2,
    "category": "Đồ uống",
    "unit": "Hộp",
    "sale_price": "15000.00",
    "product_serial": "00123456",
    "type": "QR-code",
    "is_active": true
  }
]
```

`sale_price` là chuỗi thập phân để giữ nguyên độ chính xác của SQL Server `DECIMAL(18,2)`. `product_serial` là chuỗi đúng 8 chữ số, duy nhất và bắt buộc; giữ nguyên số 0 đầu chuỗi. `type` chỉ nhận `barcode` hoặc `QR-code`. Giá trị cần mã hóa trong cả hai loại mã chính là `product_serial`, không thêm tiền tố, URL hoặc JSON. Barcode nên dùng Code128 để giữ nguyên cả 8 chữ số, không thêm chữ số kiểm tra như EAN8.

Khi INSERT sản phẩm và bỏ qua `product_serial`, SQL Server tự sinh serial ngẫu nhiên bằng `CRYPT_GEN_RANDOM`. Unique index ngăn trùng mã; nếu INSERT gặp xung đột serial (2601/2627), cần thử lại với serial mới. Không đổi serial khi đổi loại mã.

### GET /api/categories

Trả mảng danh mục đang hoạt động, sắp xếp tên rồi ID:

```json
[{"id": 2, "name": "Đồ uống"}]
```

Hai API trả `200` với `[]` nếu không có dữ liệu. Lỗi kết nối, cấu hình hoặc truy vấn database trả `503` với thông báo JSON trong trường `error`, không lộ thông tin kết nối. Phản hồi dùng `Cache-Control: no-store`.

Các API hiện chỉ đọc dữ liệu. Thêm/sửa/xóa sản phẩm, sinh Barcode/QR và quét mã chưa được triển khai.

## Tổ chức code

- `app/__init__.py`: tạo Flask app, phục vụ frontend, đăng ký API.
- `app/routes/products.py`: endpoint sản phẩm và danh mục.
- `app/services/product_service.py`: chuyển kiểu dữ liệu database sang dữ liệu API.
- `app/repositories/product_repository.py`: truy vấn SQL Server.
- `app/db/connection.py`: kết nối theo request, đóng khi kết thúc, CLI `check-db`.
- `app/errors.py`: phản hồi lỗi database.
- `../frontend/assets/js/products.js`: gọi API và hiển thị danh sách.

## Kiểm thử

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Các bài kiểm thử dùng kết nối giả lập để kiểm tra cấu hình, vòng đời kết nối, truy vấn, dữ liệu API, lỗi database và phục vụ frontend. Kiểm thử giao diện chạy từ thư mục gốc bằng `node --test frontend/tests/products.test.cjs`.
