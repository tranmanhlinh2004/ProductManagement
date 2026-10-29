# Khung backend — ProductManagement

Backend dự kiến dùng Python + Flask, SQL Server và OpenCV/pyzbar. Phạm vi chỉ gồm thông tin sản phẩm, sinh Barcode/QR và nhận diện mã qua webcam để tra cứu sản phẩm.

**Đã có từ trước:** application factory Flask, cấu hình môi trường, kết nối SQL Server qua `pyodbc`, lệnh `check-db` và kiểm thử kết nối.

**Chưa triển khai:** API sản phẩm, truy vấn nghiệp vụ, sinh/lưu mã, xử lý ảnh webcam và tra cứu sản phẩm. Các file nghiệp vụ bên dưới là **file trống** để triển khai sau. Frontend chưa gọi backend.

Không có module đăng nhập hoặc phân quyền. Bảng `users` và các script database được giữ nguyên.

## Cây thư mục

```text
backend/
├── app/
│   ├── __init__.py                 # Application factory đã có
│   ├── config.py                   # Cấu hình SQL Server đã có
│   ├── errors.py                   # Trống: dự kiến xử lý lỗi API
│   ├── db/
│   │   ├── __init__.py
│   │   └── connection.py           # Kết nối + CLI check-db đã có
│   ├── repositories/
│   │   ├── __init__.py
│   │   └── product_repository.py   # Trống: truy vấn sản phẩm và lưu nội dung mã
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── products.py             # Trống: API thông tin sản phẩm
│   │   ├── barcodes.py             # Trống: API sinh/lưu mã
│   │   └── scanner.py              # Trống: API nhận ảnh và tra cứu mã
│   └── services/
│       ├── __init__.py
│       ├── product_service.py      # Trống: xử lý dữ liệu sản phẩm
│       ├── barcode_service.py      # Trống: sinh Barcode/QR
│       └── scanner_service.py      # Trống: nhận diện mã từ ảnh webcam
├── tests/
│   ├── __init__.py
│   ├── test_database.py            # Kiểm thử kết nối đã có
│   ├── test_products.py            # Trống
│   └── test_scanner.py             # Trống
├── .env.example
├── .gitignore
├── README.md
├── requirements.txt
├── run.py
└── wsgi.py
```

Luồng dự kiến khi bắt đầu triển khai: `frontend → routes → services → repositories → SQL Server`. Hiện chưa đăng ký route nghiệp vụ và chưa có endpoint API. Không cần các module kho, báo cáo, người dùng hay các lớp schema/mapper rỗng riêng cho demo này.

## Chuẩn bị môi trường

Chạy trong thư mục `backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env # Chỉ chạy khi chưa có .env
```

Thư viện trong `requirements.txt` được chuẩn bị cho việc triển khai sau; chưa có code sinh mã hoặc nhận diện sử dụng chúng.

Sửa `.env` theo SQL Server của máy:

| Biến | Ý nghĩa |
| --- | --- |
| `DB_DRIVER` | Driver đã cài, mặc định `ODBC Driver 18 for SQL Server` |
| `DB_SERVER` | Server/instance, ví dụ `localhost` hoặc `localhost\SQLEXPRESS` |
| `DB_NAME` | Database, mặc định `QLSP_Barcode` |
| `DB_TRUSTED_CONNECTION` | `yes`: Windows Authentication; `no`: SQL Server Authentication |
| `DB_USER`, `DB_PASSWORD` | Chỉ cần khi dùng SQL Server Authentication |
| `DB_ENCRYPT` | Mã hóa kết nối SQL Server |
| `DB_TRUST_SERVER_CERTIFICATE` | `.env.example` dùng `yes` cho SQL Server local có chứng chỉ tự ký |
| `DB_CONNECT_TIMEOUT`, `DB_QUERY_TIMEOUT` | Thời gian chờ tính bằng giây |

Đây là xác thực kết nối SQL Server, không phải xác thực người dùng của ứng dụng.

## Kiểm tra hạ tầng đã có

```powershell
.\.venv\Scripts\python.exe -m flask --app wsgi check-db
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe run.py
```

`run.py` chỉ khởi động khung Flask tại `127.0.0.1:8080`; truy cập `/` sẽ trả `404` vì chưa có route. Xem giao diện khung bằng server tĩnh theo hướng dẫn trong README gốc.

Database dùng schema có sẵn trong `../database/SQLQuery1.sql`. Không thay đổi, tạo lại hoặc xóa bảng trong bước tinh gọn cấu trúc này.
