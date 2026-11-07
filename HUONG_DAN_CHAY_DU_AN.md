# Hướng dẫn chạy backend ProductManagement

Áp dụng khi môi trường Python, thư viện, database và file `backend/.env` đã được chuẩn bị đầy đủ; dịch vụ SQL Server đang chạy. Các lệnh dưới đây dùng PowerShell và môi trường `backend/.venv`.

## 1. Khởi chạy backend

Mở terminal PowerShell trong VS Code và chạy:

```powershell
Set-Location -LiteralPath "E:\tranmanhlinh\Code\Manhlinh's project\ProductManagement\backend"
& .\.venv\Scripts\python.exe run.py
```

Nếu dự án nằm ở vị trí khác, thay đường dẫn đến thư mục `backend` tương ứng. Lệnh dùng trực tiếp Python trong môi trường nên không cần kích hoạt môi trường trước.

Khi khởi động thành công, terminal hiển thị:

```text
Running on http://127.0.0.1:8080
```

Giữ terminal này chạy để backend tiếp tục nhận yêu cầu.

## 2. Kiểm tra backend

Mở trình duyệt để kiểm tra các API:

| API | Địa chỉ | Kết quả mong đợi |
| --- | --- | --- |
| Danh sách sản phẩm | http://127.0.0.1:8080/api/products | HTTP 200 và mảng JSON sản phẩm. |
| Danh mục | http://127.0.0.1:8080/api/categories | HTTP 200 và mảng JSON danh mục. |

Nếu cần kiểm tra riêng kết nối database, mở terminal thứ hai tại thư mục `backend` và chạy:

```powershell
& .\.venv\Scripts\python.exe -m flask --app wsgi check-db
```

Kết quả mong đợi với database `QLSP`:

```text
Connection OK | database=QLSP | SELECT 1=1
```

## 3. Dừng và khởi động lại

- **Dừng:** nhấn `Ctrl+C` trong terminal đang chạy `run.py`.
- **Khởi động lại:** dừng backend, sau đó chạy lại lệnh dưới đây trong thư mục `backend`:

```powershell
& .\.venv\Scripts\python.exe run.py
```

Khởi động lại sau khi sửa code backend hoặc file `backend/.env` để áp dụng thay đổi. `run.py` không bật tự động tải lại.

## 4. Chạy bằng task VS Code

Có thể dùng task đã có sẵn thay cho chạy lệnh thủ công:

1. Mở thư mục `ProductManagement` trong VS Code. Nếu dùng workspace nhiều thư mục, chọn task thuộc `ProductManagement`.
2. Nhấn `Ctrl+Shift+P` → **Tasks: Run Task** → **ProductManagement: Start backend**.
3. Đợi terminal của task hiển thị `Running on http://127.0.0.1:8080`.

Để dừng, chọn **Tasks: Terminate Task**. Để khởi động lại, chọn **Tasks: Restart Running Task** và chọn task backend tương ứng.

Nếu task đã tự chạy khi mở VS Code, có thể kiểm tra API ngay. Chỉ chạy một backend trên cổng `8080`; nếu cổng đang được sử dụng, kiểm tra phiên backend hiện có và dừng phiên đó trước khi khởi chạy lại.
