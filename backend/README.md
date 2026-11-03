# Backend — ProductManagement

Backend dùng Python + Flask và SQL Server qua `pyodbc`. Flask phục vụ frontend từ `../frontend`, cung cấp API đọc sản phẩm, danh mục và thêm sản phẩm kèm tồn kho ban đầu.

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

Trả mảng sản phẩm có `products.is_active = 1`, sắp xếp `id` giảm dần. Tên danh mục lấy bằng JOIN với `categories`; sản phẩm vẫn hiển thị nếu danh mục đã ngừng hoạt động. `quantity` lấy từ `inventory`, mặc định 0 nếu chưa có bản ghi kho. Frontend phân trang danh sách này, tối đa 10 sản phẩm/trang.

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
    "is_active": true,
    "quantity": 25
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

### POST /api/products

Gửi JSON từ hộp thoại **Thêm sản phẩm mới**:

```json
{"sku": "SP002", "name": "Sản phẩm mới", "category_id": 2, "quantity": 7}
```

SKU gồm 1–50 ký tự ASCII không khoảng trắng; tên gồm 1–200 ký tự; `category_id` là ID danh mục đang hoạt động. `quantity` là số nguyên từ 0 đến 2147483647, mặc định 0 khi bỏ qua. SQL Server tự tạo serial 8 chữ số và dùng các giá trị mặc định hiện có cho đơn vị, giá và loại mã. Sản phẩm và tồn kho được lưu trong cùng một giao dịch; nếu có lỗi, cả hai được rollback.

Thành công trả `201` và đối tượng sản phẩm có cùng định dạng như một phần tử của `GET /api/products`. Dữ liệu không hợp lệ trả `400`; SKU đã tồn tại trả `409`. Backend tự thử lại tối đa 5 lần nếu serial ngẫu nhiên trùng mã đã có. CORS hỗ trợ `POST` và preflight với header `Content-Type` để dùng từ Live Server.

Hai API GET trả `200` với `[]` nếu không có dữ liệu. Lỗi kết nối, cấu hình hoặc truy vấn database trả `503` với thông báo JSON trong trường `error`, không lộ thông tin kết nối. Phản hồi dùng `Cache-Control: no-store`.

### GET /api/products/{id}/code

Sinh ảnh PNG từ `product_serial` hiện có của sản phẩm đang hoạt động. API lấy serial theo ID trực tiếp từ database, không nhận serial tùy ý từ frontend. Bỏ qua tham số `type` để dùng loại mã đang lưu trong sản phẩm, hoặc truyền `type=QR-code` / `type=barcode` để chọn QR hay Code128. Chọn loại mã xem trước không thay đổi serial hoặc loại mã lưu trong database.

```text
GET /api/products/1/code?type=QR-code
GET /api/products/1/code?type=barcode&download=1
```

Phản hồi thành công có `Content-Type: image/png`. `download=1` trả ảnh dưới dạng tệp đính kèm, tên `product-{id}-{serial}-qr.png` hoặc `product-{id}-{serial}-barcode.png`. Frontend dùng ảnh dưới dạng Blob để xem trước. Mở hộp thoại chỉ sinh ảnh xem trước; nút **Lưu PNG** gọi API POST bên dưới để ghi ảnh vào thư mục `img` của dự án.

API trả `404` khi sản phẩm không tồn tại/đã ngừng hoạt động, `400` khi loại mã hoặc serial không hợp lệ, `503` khi database lỗi. CORS cho phép xem và tải mã từ Live Server. Kiểm thử sinh mã quét lại PNG bằng ZBar để xác nhận nội dung, bao gồm serial có số 0 đầu chuỗi và serial bắt đầu bằng `99`.

Thư viện sinh ảnh: [python-qrcode](https://github.com/lincolnloop/python-qrcode) và [python-barcode ImageWriter](https://python-barcode.readthedocs.io/en/stable/writers.html), đã có trong `requirements.txt`.

### POST /api/products/{id}/code

Gửi JSON `{"type": "QR-code"}` hoặc `{"type": "barcode"}` từ nút **Lưu PNG**. Bỏ qua `type` để dùng loại mã trong database. Backend tự tạo thư mục nếu chưa có và lưu ảnh theo ID/serial của sản phẩm:

- QR: `ProductManagement/img/QR/product-{id}-{serial}-qr.png`.
- Mã vạch: `ProductManagement/img/Barcode/product-{id}-{serial}-barcode.png`.

Với đường dẫn dự án hiện tại, thư mục gốc lưu ảnh là `E:\tranmanhlinh\Code\Manhlinh's project\ProductManagement\img`. Đường dẫn được xác định từ vị trí dự án, không phụ thuộc thư mục chạy lệnh backend. Lưu lại cùng sản phẩm/loại mã thay thế cùng file qua một file tạm; ảnh cũ được giữ nguyên nếu thay thế thất bại.

Thành công trả `200` với JSON, ví dụ `{"message": "Đã lưu ảnh mã sản phẩm.", "filename": "product-1-00123456-qr.png", "path": "img/QR/product-1-00123456-qr.png"}`. Lỗi ghi file trả `500` với thông báo trong `error`; loại mã không hợp lệ trả `400`, sản phẩm không tồn tại trả `404`. Có thể dùng `PRODUCT_IMAGE_DIR` trong cấu hình Flask để đổi thư mục gốc khi kiểm thử.

Sửa/xóa sản phẩm và quét mã bằng webcam chưa được triển khai. Menu tạo mã riêng đã được bỏ; thao tác xem/lưu mã nằm tại từng dòng sản phẩm. Đường dẫn `barcode.html` cũ chuyển về danh sách sản phẩm.

## Tổ chức code

- `app/__init__.py`: tạo Flask app, phục vụ frontend, đăng ký API.
- `app/routes/products.py`: endpoint sản phẩm và danh mục.
- `app/routes/barcodes.py`: endpoint xem/tải ảnh mã theo ID sản phẩm.
- `app/services/barcode_service.py`: sinh QR và Code128 từ serial.
- `app/services/product_service.py`: chuyển kiểu dữ liệu database sang dữ liệu API.
- `app/repositories/product_repository.py`: truy vấn SQL Server.
- `app/db/connection.py`: kết nối theo request, đóng khi kết thúc, CLI `check-db`.
- `app/errors.py`: phản hồi lỗi database.
- `../frontend/assets/js/products.js`: gọi API và hiển thị danh sách.

## Kiểm thử

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Các bài kiểm thử dùng kết nối giả lập để kiểm tra cấu hình, vòng đời kết nối, truy vấn, dữ liệu API, tạo sản phẩm/tồn kho, rollback, lỗi database và phục vụ frontend. Kiểm thử giao diện chạy từ thư mục gốc bằng `node --test frontend/tests/*.test.cjs`.
