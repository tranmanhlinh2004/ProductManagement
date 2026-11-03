# ProductManagement — Barcode / QR

Ứng dụng dùng Flask + SQL Server để hiển thị thông tin sản phẩm phục vụ tạo và tra cứu mã.

Trang sản phẩm lấy dữ liệu trực tiếp qua API, hiển thị SKU, tên sản phẩm, danh mục, số lượng trong kho và serial. Danh sách được phân trang tối đa 10 sản phẩm/trang. Nút **Thêm sản phẩm mới** mở hộp thoại để lưu sản phẩm và tồn kho ban đầu vào database; serial 8 chữ số được tạo tự động. Menu tạo Barcode/QR đã được bỏ; sửa/xóa sản phẩm và quét webcam chưa được triển khai.

## Chạy ứng dụng

Chạy từ thư mục gốc dự án:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Cấu hình `backend/.env` theo SQL Server đang dùng. Database mặc định là `QLSP`, với các bảng trong `database/SQLQuery1.sql`. Dữ liệu hiển thị phải có trong database; ứng dụng không tự tạo bảng hoặc nhập dữ liệu từ JSON.

Nếu đang dùng database `QLSP_Barcode`, chạy hai migration theo [hướng dẫn chuyển đổi database](database/README.md). Schema mới dùng `product_serial` gồm 8 chữ số ngẫu nhiên, duy nhất và `type` là `barcode` hoặc `QR-code`.

Kiểm tra kết nối và khởi động, vẫn trong thư mục `backend`:

```powershell
.\.venv\Scripts\python.exe -m flask --app wsgi check-db
.\.venv\Scripts\python.exe run.py
```

Giữ backend chạy tại **http://127.0.0.1:8080** để cung cấp API sản phẩm.

### Tự chạy backend khi mở VS Code

Dự án đã có task `ProductManagement: Start backend` trong `.vscode/tasks.json`. Task tự chạy `backend/run.py` bằng Python tại `backend/.venv/Scripts/python.exe` khi mở thư mục **ProductManagement** trong VS Code. Môi trường `.venv` và cấu hình `.env` cần được chuẩn bị theo hướng dẫn trên.

1. Dùng **File → Open Folder…** để mở thư mục `ProductManagement`. Nếu dùng workspace nhiều thư mục, thêm `ProductManagement` thành một thư mục gốc bằng **File → Add Folder to Workspace…**.
2. Nếu VS Code hiện **Restricted Mode**, chọn **Trust** cho dự án này. Khi được hỏi về task tự động, chọn **Allow**. Nếu đã tắt trước đó, mở `Ctrl+Shift+P` → **Tasks: Manage Automatic Tasks** → **Allow Automatic Tasks**.
3. Mở lại thư mục hoặc chạy **Developer: Reload Window** để VS Code nhận task mới. Đợi terminal `ProductManagement: Start backend` hiện `Running on http://127.0.0.1:8080`.
4. Mở giao diện bằng **Open with Live Server** như bên dưới.

Không cần chạy lệnh backend thủ công mỗi lần. Để khởi động lại sau khi sửa backend: `Ctrl+Shift+P` → **Tasks: Restart Running Task** → `ProductManagement: Start backend`. Để dừng: **Tasks: Terminate Task**. Nếu cổng `8080` đang được một backend chạy thủ công sử dụng, dừng tiến trình đó bằng `Ctrl+C` trong terminal của nó trước khi chạy task.

Trong VS Code, nhấp phải vào `frontend/sources/index.html` hoặc `frontend/sources/products.html` → **Open with Live Server**. Giao diện trên Live Server sẽ gọi API tại `http://127.0.0.1:8080`, không đọc file JSON. Đường dẫn trang tùy theo thư mục đang mở trong VS Code; hãy dùng đường dẫn do Live Server mở.

Backend cho phép giao diện từ `http://localhost`, `http://127.0.0.1` hoặc `http://[::1]` trên các cổng Live Server, gồm `5500`, `5501`, v.v. Nếu đổi địa chỉ backend, sửa `API_BASE_URL` ở đầu `frontend/assets/js/products.js`. Sau khi thay đổi code backend, hãy khởi động lại `run.py`.

Bạn cũng có thể mở **http://127.0.0.1:8080/** để xem giao diện qua Flask.

## Luồng hiển thị sản phẩm

```text
Live Server → GET http://127.0.0.1:8080/api/products → Flask → SQL Server
            → GET http://127.0.0.1:8080/api/categories → Flask → SQL Server
            → POST http://127.0.0.1:8080/api/products → Flask → SQL Server
```

- Sản phẩm đang hoạt động được lấy từ bảng `products`, nối `categories` để lấy tên danh mục và `inventory` để lấy số lượng trong kho, sắp xếp ID giảm dần. Sản phẩm chưa có bản ghi kho hiển thị số lượng 0.
- Danh mục đang hoạt động được lấy từ bảng `categories`.
- Tìm kiếm lọc danh sách đã tải theo tên, SKU hoặc serial và trở về trang đầu tiên; mỗi trang hiển thị tối đa 10 sản phẩm.
- **Thêm sản phẩm mới** mở hộp thoại nhập SKU, tên, danh mục và số lượng trong kho. Danh mục phải đang hoạt động. Khi lưu thành công, sản phẩm xuất hiện ở đầu danh sách cùng serial tự động tạo. Khi trùng SKU hoặc lưu thất bại, hộp thoại giữ nguyên dữ liệu để sửa.
- Cột **Thao tác** có nút **Xem / lưu mã** cho từng sản phẩm. Hộp thoại hiển thị tên, SKU, serial và cho phép chọn **Mã QR** hoặc **Mã vạch (Code128)**, xem trước và **Lưu PNG**. Backend lưu QR vào `img/QR`, mã vạch vào `img/Barcode` trong thư mục gốc `ProductManagement`; thông báo hiển thị đường dẫn sau khi lưu thành công. Tên ảnh là `product-{id}-{serial}-qr.png` hoặc `product-{id}-{serial}-barcode.png`; lưu lại cùng sản phẩm/loại mã cập nhật cùng file. Cả hai loại mã đều chứa đúng serial 8 chữ số của sản phẩm, giữ nguyên số 0 đầu chuỗi. Mã cũng có sẵn cho sản phẩm vừa thêm.
- “Tải lại” gửi yêu cầu API mới để lấy dữ liệu hiện tại từ database.
- Khi không kết nối được database, giao diện hiển thị lỗi và cho phép thử lại.

Chi tiết cấu hình và định dạng API: [backend/README.md](backend/README.md).

## Kiểm thử

Từ thư mục gốc:

```powershell
Push-Location backend
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
Pop-Location
node --test frontend/tests/*.test.cjs
```

Kiểm thử tự động dùng kết nối giả lập, không sửa dữ liệu SQL Server.
