# ProductManagement — Quản lý sản phẩm bằng Barcode và QR Code

ProductManagement là ứng dụng web hỗ trợ quản lý thông tin sản phẩm, theo dõi số lượng tồn kho và tra cứu sản phẩm thông qua mã vạch hoặc mã QR. Hệ thống kết hợp giao diện web, API Flask và cơ sở dữ liệu SQL Server; OpenCV và pyzbar được sử dụng để xử lý ảnh và giải mã nhận diện sản phẩm.

## 1. Chức năng chính

- **Xem danh sách sản phẩm:** hiển thị SKU, tên sản phẩm, danh mục, số lượng tồn kho và serial; phân trang tối đa 10 sản phẩm mỗi trang.
- **Tìm kiếm sản phẩm:** lọc danh sách theo tên, SKU hoặc serial.
- **Thêm sản phẩm:** nhập tên, danh mục và tồn kho ban đầu; có thể chọn **Quét mã** ngay trong form. Mã số được giữ nguyên làm Serial, kể cả số 0 ở đầu; mã QR chứa chữ hoặc URL được lưu vào mã nhận diện bổ sung. SQL Server tự cấp SKU tăng dần (`SP0001`, `SP0002`, …) và serial 8 chữ số khi chưa có serial từ mã quét, rồi lưu sản phẩm cùng tồn kho trong một transaction.
- **Sửa sản phẩm:** chọn **Sửa** trong danh sách để cập nhật tên, danh mục và số lượng tồn kho. SKU, serial và mã đã quét được giữ nguyên; thông tin sản phẩm và tồn kho được lưu trong cùng một transaction.
- **Xóa sản phẩm:** chọn **Xóa** và xác nhận trong hộp thoại. Sản phẩm được ẩn khỏi danh sách, quét mã và tra cứu; dữ liệu cùng tồn kho vẫn được lưu trong database, mã nhận diện không được cấp lại cho sản phẩm khác.
- **Tạo mã nhận diện:** xem trước và lưu ảnh PNG dưới dạng QR Code hoặc mã vạch Code128. Cả hai loại mã đều chứa serial của sản phẩm, giữ nguyên các chữ số 0 ở đầu.
- **Quét mã:** nhận diện mã qua webcam hoặc ảnh tải lên, sau đó tra cứu thông tin sản phẩm và số lượng tồn kho.
- **Tra cứu trực tiếp:** nhập serial hoặc SKU bằng bàn phím, hoặc dùng máy quét USB nhập mã vào ô tra cứu.

## 2. Công nghệ sử dụng

| Thành phần             | Công nghệ                                  | Vai trò                                                               |
| ------------------------ | -------------------------------------------- | ---------------------------------------------------------------------- |
| Giao diện               | HTML5, CSS3, JavaScript thuần               | Xây dựng các trang sản phẩm, hộp thoại và giao diện quét mã |
| Giao tiếp với backend  | Fetch API, JSON                              | Gửi yêu cầu và nhận dữ liệu từ API                             |
| Truy cập webcam         | MediaDevices API, Canvas                     | Thu hình và trích xuất khung hình gửi đến backend              |
| Backend                  | Python, Flask                                | Cung cấp API và phục vụ các tệp giao diện                       |
| Cơ sở dữ liệu        | Microsoft SQL Server                         | Lưu sản phẩm, danh mục và tồn kho                                |
| Kết nối dữ liệu      | pyodbc, Microsoft ODBC Driver for SQL Server | Kết nối Python với SQL Server và thực thi truy vấn               |
| Cấu hình môi trường | python-dotenv                                | Đọc cấu hình kết nối từ tệp `.env`                           |
| Xử lý ảnh             | OpenCV, NumPy                                | Đọc ảnh, chuyển ảnh xám và xử lý ảnh phục vụ nhận diện   |
| Giải mã                | pyzbar, OpenCV QRCodeDetector                | Giải mã mã vạch và mã QR                                         |
| Tạo ảnh mã            | python-barcode, qrcode, Pillow               | Sinh ảnh Code128 và QR Code dưới dạng PNG                         |
| Kiểm thử               | Python unittest, Node.js test runner         | Kiểm tra backend và JavaScript phía giao diện                      |

Luồng hoạt động: giao diện gửi yêu cầu đến Flask; backend xử lý nghiệp vụ và truy vấn SQL Server, sau đó trả dữ liệu cho giao diện. Với chức năng quét mã, backend giải mã ảnh trước khi tìm sản phẩm theo serial hoặc SKU.

Cơ sở dữ liệu chỉ giữ 3 bảng được ứng dụng sử dụng: `categories`, `products`, `inventory`. Với database cũ, sao lưu rồi chạy [migration 003](database/migrations/003_simplify_schema_auto_sku.sql) để xóa các bảng không dùng và bật SKU tự tăng; xem [hướng dẫn database](database/README.md). Migration giữ nguyên SKU, serial và tồn kho hiện có.

## 3. Cấu trúc dự án

```text
ProductManagement/
├── backend/
│   ├── app/
│   │   ├── db/                  # Kết nối SQL Server và lệnh kiểm tra kết nối
│   │   ├── repositories/        # Truy vấn và lưu dữ liệu
│   │   ├── routes/              # Các API sản phẩm, tạo mã và quét mã
│   │   ├── services/            # Xử lý nghiệp vụ, sinh mã và nhận diện ảnh
│   │   ├── config.py           # Đọc cấu hình môi trường
│   │   └── __init__.py         # Khởi tạo ứng dụng Flask
│   ├── tests/                  # Kiểm thử backend
│   ├── .env.example            # Mẫu cấu hình kết nối cơ sở dữ liệu
│   ├── requirements.txt        # Danh sách thư viện Python
│   ├── run.py                  # Chạy ứng dụng tại cổng 8080
│   └── wsgi.py                 # Điểm khởi tạo ứng dụng cho Flask CLI
├── frontend/
│   ├── assets/                 # CSS và JavaScript
│   ├── sources/                # Các trang HTML
│   └── tests/                  # Kiểm thử JavaScript
├── database/
│   ├── QLSP.sql           # Tạo database, bảng và chỉ mục
│   ├── SQLQuery2.sql           # Tạo dữ liệu mẫu
│   └── README.md               # Hướng dẫn về schema và migration
├── docs/                       # Tài liệu báo cáo của dự án
├── img/                        # Thư mục được tạo khi lưu ảnh QR/Barcode
└── README.md
```

## 4. Cài đặt và chạy ứng dụng

Các bước dưới đây sử dụng **Windows và PowerShell**. Mở terminal tại thư mục gốc `ProductManagement` trước khi bắt đầu.

### Bước 1: Chuẩn bị môi trường

Cài đặt các thành phần sau:

- [Python 3](https://www.python.org/downloads/windows/) cùng `pip` và `venv`; bảo đảm terminal gọi được lệnh `python`.
- [Microsoft SQL Server](https://www.microsoft.com/en-us/sql-server/sql-server-downloads) và khởi động dịch vụ SQL Server.
- [SQL Server Management Studio (SSMS)](https://learn.microsoft.com/en-us/ssms/install/install) để chạy các script cơ sở dữ liệu.
- [Microsoft ODBC Driver 18 for SQL Server](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server) để backend kết nối đến SQL Server theo cấu hình mẫu.
- Trình duyệt có hỗ trợ webcam và webcam nếu muốn thử chức năng quét trực tiếp. Có thể dùng ảnh tải lên hoặc nhập mã để tra cứu.

Kiểm tra Python và pip:

```powershell
python --version
python -m pip --version
```

### Bước 2: Tạo cơ sở dữ liệu

1. Mở SSMS và kết nối đến SQL Server sẽ dùng cho ứng dụng.
2. Mở [database/QLSP.sql], chọn **Execute** hoặc nhấn `F5` để tạo database `QLSP`, các bảng và chỉ mục.
3. Nếu cần dữ liệu để chạy thử, mở và chạy [database/SQLQuery2.sql](database/SQLQuery2.sql). Script tạo 50 sản phẩm mẫu cùng danh mục, tồn kho và dữ liệu liên quan.

Hai script này dành cho database mới; script dữ liệu mẫu yêu cầu các bảng đang rỗng. Ứng dụng cần có danh mục đang hoạt động trong bảng `categories` để thêm sản phẩm qua giao diện. Có thể tạo danh mục bằng SQL nếu không dùng dữ liệu mẫu.

### Bước 3: Cài đặt thư viện backend

Từ thư mục gốc dự án, chạy:

```powershell
1. cd backend
2. python -m venv .venv
3. .\.venv\Scripts\python.exe -m pip install -r requirements.txt
4. if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Các lệnh sử dụng trực tiếp Python trong `.venv`, vì vậy không cần kích hoạt môi trường ảo. Danh sách thư viện được khai báo trong [backend/requirements.txt](backend/requirements.txt).

### Bước 4: Cấu hình kết nối SQL Server

Mở `backend/.env.example` và đổi tên thành `.env` và cấu hình SQL tương ứng trên máy

### Bước 5: Kiểm tra kết nối và khởi động

Vẫn trong thư mục `backend`, chạy lệnh kiểm tra kết nối:

```powershell
.\.venv\Scripts\python.exe -m flask --app wsgi check-db
```

Khi kết nối thành công, terminal hiển thị:

```text
Connection OK | database=QLSP | SELECT 1=1
```

Sau đó khởi động ứng dụng:

```powershell
.\.venv\Scripts\python.exe run.py
```

Giữ terminal này chạy và mở [http://127.0.0.1:8080/](http://127.0.0.1:8080/) trong trình duyệt. Flask phục vụ cả giao diện và API; trang mặc định chuyển đến danh sách sản phẩm. Truy cập trang quét mã qua thanh điều hướng hoặc [http://127.0.0.1:8080/sources/scanner.html](http://127.0.0.1:8080/sources/scanner.html).

Ứng dụng sử dụng dữ liệu trong SQL Server. Việc chạy `run.py` không tự tạo database, tạo bảng hoặc thêm dữ liệu mẫu. Sau khi sửa cấu hình `.env` hoặc mã backend, dừng bằng `Ctrl+C` và chạy lại.

### Tùy chọn: Dùng Live Server trong VS Code

Sau khi backend đã chạy, mở `frontend/sources/products.html` bằng **Open with Live Server**. Giao diện gọi API tại `http://127.0.0.1:8080`; backend cho phép các địa chỉ HTTP cục bộ `localhost`, `127.0.0.1` và `[::1]` trên các cổng Live Server.

Nếu đổi địa chỉ hoặc cổng backend, cập nhật cấu hình gọi API trong cả [products.js](frontend/assets/js/products.js) và [scanner.js](frontend/assets/js/scanner.js) cho phù hợp.

Dự án cũng có task `ProductManagement: Start backend` trong [.vscode/tasks.json](.vscode/tasks.json). Sau khi đã tạo `.venv` và `.env`, mở thư mục `ProductManagement` bằng VS Code và cho phép **Automatic Tasks** để backend tự khởi động khi mở dự án. Nếu task đã chạy, sử dụng backend đó; có thể dừng hoặc khởi động lại qua **Tasks: Terminate Task** và **Tasks: Restart Running Task** trong Command Palette.
