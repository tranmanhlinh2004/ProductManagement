# Cấu trúc backend — ProductManagement

Bộ khung backend theo **Python + Flask**, kết nối **SQL Server** và xử lý mã/ảnh bằng **OpenCV**. Công nghệ này dựa trên tài liệu [Danh sách thành viên và phân chia công việc](<../docs/Danh sách thành viên và phân chia công việc.xlsx>) của dự án.

**Trạng thái hiện tại:** đã cài đủ thư viện, tạo Flask application factory và lớp kết nối SQL Server qua `pyodbc`. Đã kiểm tra kết nối thực tế tới `localhost`, database `QLSP_Barcode`, bằng Windows Authentication. Có lệnh `check-db`, cơ chế đóng kết nối theo context và kiểm thử lớp kết nối. Các module nghiệp vụ vẫn là bộ khung; frontend chưa gọi API.

Hướng dẫn cài thư viện nằm ở [mục 7](#7-cài-thư-viện-bằng-terminal-windows-powershell); hướng dẫn cấu hình và kiểm tra database nằm ở [mục 8](#8-kết-nối-sql-server). Chức năng nghiệp vụ trong các bảng bên dưới là trách nhiệm dự kiến, trừ các file hạ tầng kết nối đã được ghi rõ là hoàn thành.

## 1. Cây thư mục

```text
backend/
├── app/
│   ├── db/
│   │   ├── __init__.py
│   │   ├── connection.py
│   │   └── transaction.py
│   ├── repositories/
│   │   ├── __init__.py
│   │   ├── activity_log_repository.py
│   │   ├── category_repository.py
│   │   ├── inventory_repository.py
│   │   ├── product_repository.py
│   │   ├── report_repository.py
│   │   ├── stocktake_repository.py
│   │   ├── transaction_repository.py
│   │   └── user_repository.py
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── activity_logs.py
│   │   ├── alerts.py
│   │   ├── auth.py
│   │   ├── barcodes.py
│   │   ├── categories.py
│   │   ├── dashboard.py
│   │   ├── inventory.py
│   │   ├── products.py
│   │   ├── reports.py
│   │   ├── scanner.py
│   │   ├── stocktakes.py
│   │   ├── transactions.py
│   │   └── users.py
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── auth_schema.py
│   │   ├── barcode_schema.py
│   │   ├── category_schema.py
│   │   ├── product_schema.py
│   │   ├── query_schema.py
│   │   ├── scanner_schema.py
│   │   ├── stocktake_schema.py
│   │   ├── transaction_schema.py
│   │   └── user_schema.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── activity_log_service.py
│   │   ├── alert_service.py
│   │   ├── auth_service.py
│   │   ├── barcode_service.py
│   │   ├── category_service.py
│   │   ├── dashboard_service.py
│   │   ├── inventory_service.py
│   │   ├── product_service.py
│   │   ├── report_service.py
│   │   ├── scanner_service.py
│   │   ├── stocktake_service.py
│   │   ├── transaction_service.py
│   │   └── user_service.py
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── datetime_utils.py
│   │   ├── pagination.py
│   │   ├── responses.py
│   │   └── security.py
│   ├── __init__.py
│   ├── config.py
│   ├── constants.py
│   ├── decorators.py
│   ├── errors.py
│   └── mappers.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_auth.py
│   ├── test_database.py
│   ├── test_products.py
│   ├── test_reports.py
│   ├── test_scanner.py
│   ├── test_stocktakes.py
│   └── test_transactions.py
├── .env.example
├── .gitignore
├── nothing.txt
├── README.md
├── requirements.txt
├── run.py
└── wsgi.py
```

## 2. Luồng xử lý và cách chia trách nhiệm

```text
Frontend → routes → services → repositories → SQL Server
               │         │           │
            schemas   nghiệp vụ   db/connection.py
               │         └──────── db/transaction.py
               │
               └─ Kiểm tra dữ liệu request

Kết quả → mappers → responses → JSON trả về frontend
```

- **routes:** nhận HTTP request, áp dụng kiểm tra đăng nhập/quyền và gọi service. Trong cấu trúc này, route đảm nhiệm vai trò controller.
- **schemas:** kiểm tra định dạng/giới hạn dữ liệu đầu vào; không thực hiện truy vấn.
- **services:** quyết định nghiệp vụ và phạm vi transaction, phối hợp nhiều repository.
- **repositories:** chứa truy vấn SQL có tham số; không quyết định HTTP status hay tự commit một phần nghiệp vụ.
- **db:** cung cấp kết nối và commit/rollback dùng chung, để thay đổi nhiều bảng thành công hoặc thất bại cùng nhau.
- **mappers / utils:** chuyển dữ liệu sang định dạng JSON và cung cấp tiện ích dùng chung.

Ví dụ: xác nhận xuất kho đi qua `routes/transactions.py` → `services/transaction_service.py` → các repository phiếu kho, tồn kho và nhật ký trong cùng transaction. Frontend chỉ cập nhật hiển thị sau khi nhận kết quả thành công.

## 3. Chức năng của từng file

Mọi đường dẫn trong các bảng dưới đây đều tính từ thư mục `backend/`. Các file `__init__.py` dùng để tổ chức Python package; `app/__init__.py` và `app/db/__init__.py` đã có mã khởi tạo, các package nghiệp vụ vẫn để trống.

### 3.1. Điểm chạy và cấu hình dự án

Thư mục: `backend/ (gốc)`.

| File | Chức năng dự kiến |
| :--- | :--- |
| [run.py](run.py) | Đã tạo điểm chạy Flask phát triển tại `127.0.0.1:8080`, tắt debug mặc định. |
| [wsgi.py](wsgi.py) | Đã xuất ứng dụng Flask qua `wsgi:app` cho WSGI server. |
| [requirements.txt](requirements.txt) | Khai báo thư viện Python và phiên bản sau khi nhóm thống nhất, gồm Flask, driver SQL Server và thư viện xử lý mã/ảnh. |
| [.env.example](.env.example) | Đã có cấu hình mẫu SQL Server, Windows/SQL Authentication, mã hóa và timeout; không chứa mật khẩu thật. |
| [.gitignore](.gitignore) | Đã bỏ qua `.venv/`, cache Python và các file `.env`; vẫn cho phép theo dõi `.env.example`. |

### 3.2. Khởi tạo ứng dụng

Thư mục: `app`.

| File | Chức năng dự kiến |
| :--- | :--- |
| [__init__.py](app/__init__.py) | Đã có `create_app()`: nạp `.env`, cấu hình ứng dụng, đăng ký teardown kết nối và lệnh `check-db`; chưa đăng ký API nghiệp vụ. |
| [config.py](app/config.py) | Đã đọc và kiểm tra biến cấu hình SQL Server, kiểu boolean và timeout; chưa cấu hình đăng nhập/CORS cho API. |
| [constants.py](app/constants.py) | Khai báo vai trò ADMIN/STAFF, trạng thái phiếu/kiểm kê, loại giao dịch và loại mã được hỗ trợ. |
| [errors.py](app/errors.py) | Định nghĩa lỗi nghiệp vụ và chuyển lỗi thành HTTP response thống nhất; tránh trả chi tiết kết nối/SQL cho trình duyệt. |
| [decorators.py](app/decorators.py) | Các decorator dùng chung để yêu cầu đăng nhập, kiểm tra vai trò và kiểm tra dữ liệu request. |
| [mappers.py](app/mappers.py) | Chuyển dữ liệu truy vấn sang JSON frontend: category_id → categoryId, quantity → stock, is_active → status; ghép items và loại password_hash khỏi response. |

### 3.3. Kết nối và transaction database

Thư mục: `app/db`.

| File | Chức năng dự kiến |
| :--- | :--- |
| [__init__.py](app/db/__init__.py) | Đã xuất `get_db`, `close_db`, `init_app` cho các module khác sử dụng. |
| [connection.py](app/db/connection.py) | Đã mở kết nối theo nhu cầu, tái sử dụng trong cùng context, đóng khi teardown và cung cấp lệnh `check-db`. |
| [transaction.py](app/db/transaction.py) | Quản lý commit/rollback và phạm vi transaction; cho phép các repository dùng chung kết nối khi xác nhận phiếu hoặc chốt kiểm kê. |

### 3.4. API nhận request

Thư mục: `app/routes`.

| File | Chức năng dự kiến |
| :--- | :--- |
| [__init__.py](app/routes/__init__.py) | Tập hợp và đăng ký Flask Blueprint dưới tiền tố /api. |
| [auth.py](app/routes/auth.py) | API đăng nhập, đăng xuất và lấy tài khoản hiện tại; chuyển dữ liệu hợp lệ sang auth service. |
| [users.py](app/routes/users.py) | API quản lý tài khoản, vai trò và trạng thái hoạt động; áp dụng quyền quản trị. |
| [categories.py](app/routes/categories.py) | API danh sách, tìm kiếm, tạo, sửa và ngừng sử dụng danh mục. |
| [products.py](app/routes/products.py) | API danh sách, chi tiết, tìm kiếm theo SKU/mã, tạo, sửa và ngừng sử dụng sản phẩm. |
| [barcodes.py](app/routes/barcodes.py) | API sinh Barcode/QR và gắn giá trị mã cho sản phẩm. |
| [scanner.py](app/routes/scanner.py) | API nhận ảnh từ frontend để nhận diện mã và tra cứu sản phẩm; không mở camera trên máy server. |
| [inventory.py](app/routes/inventory.py) | API đọc tồn kho, lọc theo sản phẩm/danh mục; điều chỉnh tồn phải đi qua nghiệp vụ phiếu kho hoặc kiểm kê. |
| [transactions.py](app/routes/transactions.py) | API phiếu nhập/xuất, chi tiết, lưu nháp, xác nhận và hủy phiếu. |
| [stocktakes.py](app/routes/stocktakes.py) | API tạo đợt kiểm kê, nhập số đếm và chốt kiểm kê. |
| [dashboard.py](app/routes/dashboard.py) | API chỉ số tổng quan, biểu đồ và dữ liệu theo kỳ thời gian. |
| [reports.py](app/routes/reports.py) | API báo cáo nhập/xuất/tồn và giá trị tồn kho theo bộ lọc. |
| [activity_logs.py](app/routes/activity_logs.py) | API đọc, lọc lịch sử thao tác theo người dùng, hành động và thời gian. |
| [alerts.py](app/routes/alerts.py) | API danh sách và số lượng sản phẩm hết hàng hoặc dưới ngưỡng tồn. |

### 3.5. Xử lý nghiệp vụ

Thư mục: `app/services`.

| File | Chức năng dự kiến |
| :--- | :--- |
| [__init__.py](app/services/__init__.py) | Đánh dấu package nghiệp vụ và tập hợp các service cần dùng. |
| [auth_service.py](app/services/auth_service.py) | Kiểm tra tài khoản hoạt động, xác minh mật khẩu BCrypt và quản lý phiên đăng nhập/đăng xuất. |
| [user_service.py](app/services/user_service.py) | Xử lý quản lý tài khoản, băm mật khẩu, phân quyền và quy tắc thay đổi trạng thái tài khoản. |
| [category_service.py](app/services/category_service.py) | Kiểm tra tên danh mục và điều kiện thay đổi/ngừng sử dụng khi có sản phẩm liên quan. |
| [product_service.py](app/services/product_service.py) | Kiểm tra SKU, mã duy nhất, danh mục và giá; phối hợp tạo sản phẩm với dòng tồn ban đầu trong cùng transaction. |
| [barcode_service.py](app/services/barcode_service.py) | Sinh Barcode bằng python-barcode hoặc QR bằng qrcode, kiểm tra loại mã và phối hợp lưu mã vào sản phẩm. |
| [scanner_service.py](app/services/scanner_service.py) | Dùng OpenCV tiền xử lý ảnh và thư viện giải mã như pyzbar để đọc mã; tra cứu sản phẩm và xử lý ảnh không có mã/nhiều mã. |
| [inventory_service.py](app/services/inventory_service.py) | Cung cấp nghiệp vụ đọc tồn, kiểm tra số lượng và thao tác tồn nội bộ cho phiếu kho/kiểm kê; không cho sửa tồn tùy ý từ frontend. |
| [transaction_service.py](app/services/transaction_service.py) | Xử lý IN/OUT/ADJUST_IN/ADJUST_OUT, chỉ cập nhật tồn khi xác nhận; khóa/kiểm tra đồng thời, chống xác nhận lặp và lưu phiếu, dòng hàng, tồn, nhật ký trong cùng transaction. |
| [stocktake_service.py](app/services/stocktake_service.py) | Lưu số lượng hệ thống tại thời điểm kiểm kê, nhận số đếm và chốt; kiểm soát thay đổi tồn trong lúc kiểm kê, tạo phiếu điều chỉnh khi cần và tránh điều chỉnh lặp. |
| [dashboard_service.py](app/services/dashboard_service.py) | Tổng hợp KPI/biểu đồ, thống nhất kỳ thời gian và chỉ tính các phiếu có trạng thái phù hợp. |
| [report_service.py](app/services/report_service.py) | Xử lý bộ lọc báo cáo, quy tắc tính nhập/xuất/điều chỉnh và giá trị tồn kho. |
| [activity_log_service.py](app/services/activity_log_service.py) | Ghi nhật ký từ các nghiệp vụ và cung cấp tra cứu lịch sử; không cho người dùng tự tạo/sửa nhật ký qua API. |
| [alert_service.py](app/services/alert_service.py) | Xác định sản phẩm hoạt động có tồn bằng 0 hoặc tồn <= min_stock, trả danh sách và tổng số cảnh báo. |

### 3.6. Truy vấn SQL Server

Thư mục: `app/repositories`.

| File | Chức năng dự kiến |
| :--- | :--- |
| [__init__.py](app/repositories/__init__.py) | Đánh dấu package repository và tập hợp thành phần truy vấn. |
| [user_repository.py](app/repositories/user_repository.py) | Truy vấn bảng users; lấy hash cho xác thực nội bộ, đọc/ghi tài khoản và vai trò. |
| [category_repository.py](app/repositories/category_repository.py) | Truy vấn bảng categories, kiểm tra tên trùng và quan hệ với sản phẩm. |
| [product_repository.py](app/repositories/product_repository.py) | Truy vấn bảng products, ghép inventory khi cần; tìm theo id, SKU hoặc barcode_value. |
| [inventory_repository.py](app/repositories/inventory_repository.py) | Đọc/ghi bảng inventory và hỗ trợ cập nhật tồn có điều kiện/khóa phù hợp trong transaction dùng chung. |
| [transaction_repository.py](app/repositories/transaction_repository.py) | Truy vấn stock_transactions và transaction_details, lưu phiếu/dòng hàng và cập nhật trạng thái có điều kiện. |
| [stocktake_repository.py](app/repositories/stocktake_repository.py) | Truy vấn stocktakes và stocktake_details; đọc diff_qty do SQL Server tính, không ghi trực tiếp cột này. |
| [report_repository.py](app/repositories/report_repository.py) | Các truy vấn tổng hợp cho Dashboard và báo cáo theo sản phẩm, thời gian, trạng thái và loại giao dịch. |
| [activity_log_repository.py](app/repositories/activity_log_repository.py) | Ghi và đọc activity_logs; nhận kết nối transaction hiện có khi nhật ký đi kèm một thay đổi dữ liệu. |

### 3.7. Kiểm tra dữ liệu đầu vào

Thư mục: `app/schemas`.

| File | Chức năng dự kiến |
| :--- | :--- |
| [__init__.py](app/schemas/__init__.py) | Đánh dấu package chứa quy tắc kiểm tra request; không mặc định áp dụng một thư viện schema cụ thể. |
| [auth_schema.py](app/schemas/auth_schema.py) | Kiểm tra dữ liệu đăng nhập và các trường bắt buộc. |
| [user_schema.py](app/schemas/user_schema.py) | Kiểm tra username, mật khẩu, email, vai trò và trạng thái tài khoản. |
| [category_schema.py](app/schemas/category_schema.py) | Kiểm tra tên, mô tả và trạng thái danh mục. |
| [product_schema.py](app/schemas/product_schema.py) | Kiểm tra SKU, categoryId, đơn vị, giá không âm, minStock và loại mã. |
| [barcode_schema.py](app/schemas/barcode_schema.py) | Kiểm tra loại mã, giá trị mã và định dạng đầu ra được hỗ trợ. |
| [scanner_schema.py](app/schemas/scanner_schema.py) | Kiểm tra ảnh tải lên, giới hạn dung lượng, định dạng và khả năng giải mã ảnh trước khi xử lý. |
| [transaction_schema.py](app/schemas/transaction_schema.py) | Kiểm tra loại phiếu, trạng thái, các dòng sản phẩm, số lượng nguyên dương và đơn giá không âm. |
| [stocktake_schema.py](app/schemas/stocktake_schema.py) | Kiểm tra thông tin đợt kiểm kê và số đếm nguyên không âm; phân biệt chưa đếm với đã đếm bằng 0. |
| [query_schema.py](app/schemas/query_schema.py) | Kiểm tra tham số tìm kiếm, phân trang, khoảng ngày và kỳ báo cáo cho các API đọc dữ liệu. |

### 3.8. Tiện ích dùng chung

Thư mục: `app/utils`.

| File | Chức năng dự kiến |
| :--- | :--- |
| [__init__.py](app/utils/__init__.py) | Đánh dấu package tiện ích. |
| [responses.py](app/utils/responses.py) | Tạo JSON response nhất quán cho dữ liệu, lỗi và metadata; giữ cấu trúc data đã mô tả trong README gốc. |
| [security.py](app/utils/security.py) | Các hàm băm/xác minh BCrypt và tiện ích bảo mật dùng bởi auth/user service. |
| [pagination.py](app/utils/pagination.py) | Chuẩn hóa tham số trang, giới hạn số bản ghi và metadata phân trang. |
| [datetime_utils.py](app/utils/datetime_utils.py) | Chuẩn hóa thời gian lưu/đọc và biên khoảng ngày theo múi giờ ứng dụng. |

### 3.9. Các file dành cho kiểm thử sau này

Thư mục: `tests`.

| File | Chức năng dự kiến |
| :--- | :--- |
| [__init__.py](tests/__init__.py) | Đánh dấu package kiểm thử. |
| [conftest.py](tests/conftest.py) | Dự kiến đặt fixture Flask test client, cấu hình test và database test tách khỏi dữ liệu thật. |
| [test_database.py](tests/test_database.py) | Đã có 11 kiểm thử cấu hình, thông tin xác thực, vòng đời kết nối và CLI; dùng mock, không truy cập database thật. |
| [test_auth.py](tests/test_auth.py) | Dự kiến kiểm thử đăng nhập, đăng xuất, tài khoản bị khóa và truy cập thiếu quyền. |
| [test_products.py](tests/test_products.py) | Dự kiến kiểm thử tạo/đọc/sửa sản phẩm, trùng SKU/mã và ánh xạ JSON với tồn kho. |
| [test_transactions.py](tests/test_transactions.py) | Dự kiến kiểm thử phiếu nháp, xác nhận lặp, xuất quá tồn, truy cập đồng thời và rollback khi một bước thất bại. |
| [test_stocktakes.py](tests/test_stocktakes.py) | Dự kiến kiểm thử chưa đếm/đếm 0, chốt kiểm kê, phiếu điều chỉnh và thay đổi tồn trong lúc kiểm kê. |
| [test_scanner.py](tests/test_scanner.py) | Dự kiến kiểm thử ảnh hợp lệ, ảnh sai định dạng, ảnh không có mã và mã không thuộc sản phẩm. |
| [test_reports.py](tests/test_reports.py) | Dự kiến kiểm thử KPI, bộ lọc thời gian, trạng thái phiếu, điều chỉnh tồn và cảnh báo. |

### 3.10. Tài liệu và file có sẵn

| File | Vai trò |
| :--- | :--- |
| [README.md](README.md) | Giải thích cấu trúc, chức năng từng file, phạm vi triển khai và cách cài thư viện bằng terminal. |
| [nothing.txt](nothing.txt) | File giữ chỗ đã tồn tại trước khi tạo bộ khung; không được dùng làm điểm chạy backend. |

## 4. Đối chiếu với các màn hình hiện có

Tên file dưới đây nằm trong `app/routes/`; service tương ứng nằm trong `app/services/`.

| Chức năng | File API phụ trách |
| :--- | :--- |
| **F01 — Tài khoản, phân quyền** | `auth.py`, `users.py` |
| **F02 — Dashboard** | `dashboard.py` |
| **F03 — Danh mục** | `categories.py` |
| **F04 — Sản phẩm và SKU** | `products.py` |
| **F05 — Tạo Barcode/QR** | `barcodes.py` |
| **F06 — Quét mã, tra cứu** | `scanner.py`, `products.py` |
| **F07 — Nhập kho** | `transactions.py` |
| **F08 — Xuất kho** | `transactions.py` |
| **F09 — Tồn kho, kiểm kê** | `inventory.py`, `stocktakes.py` |
| **F10 — Báo cáo** | `reports.py` |
| **F11 — Lịch sử hoạt động** | `activity_logs.py` |
| **F12 — Cảnh báo tồn** | `alerts.py` |

Nhập kho và xuất kho dùng chung module giao dịch, phân biệt bằng `kind`. Dashboard/báo cáo dùng chung các truy vấn tổng hợp khi phù hợp. Cảnh báo được tính từ sản phẩm và tồn kho, không cần tạo thêm bảng cảnh báo cho phạm vi hiện tại.

## 5. Database và các quy tắc cần giữ khi viết code

Sử dụng các script có sẵn, không sao chép hay chạy chúng trong bước tạo bộ khung:

| File ngoài backend | Vai trò |
| :--- | :--- |
| [SQLQuery1.sql](../database/SQLQuery1.sql) | Tạo database `QLSP_Barcode`, bảng, khóa và index. |
| [SQLQuery2.sql](../database/SQLQuery2.sql) | Tạo dữ liệu mẫu cho các bảng rỗng. |

Các điểm cần thống nhất khi triển khai:

- `products` chưa có cột mô tả tương ứng `product.desc`; `stock_transactions` chưa có trường đối tác tương ứng `transaction.partner`. Cần quyết định thay đổi schema hoặc giới hạn chức năng trước khi ghi các trường này.
- Các giá trị `stock` phải lấy từ `inventory`; chuyển `is_active` sang `status` và các tên cột sang định dạng frontend tại `app/mappers.py`.
- Không trả `users.password_hash` ra frontend. Lấy danh tính và quyền từ phiên đăng nhập được backend kiểm tra, không tin vai trò lưu ở trình duyệt.
- Chỉ cập nhật tồn khi xác nhận phiếu; xử lý xuất quá tồn, xác nhận lặp và truy cập đồng thời trong transaction.
- `stocktake_details.diff_qty` là cột tính toán của SQL Server. Khi chốt kiểm kê, phải thống nhất cách xử lý giao dịch kho xảy ra trong thời gian kiểm đếm.
- Camera được frontend truy cập trên máy người dùng; backend scanner nhận ảnh để xử lý. Thư viện sinh/giải mã đã cài, phần mã xử lý scanner sẽ được viết ở bước triển khai.
- `.gitignore` đã bỏ qua môi trường ảo và file `.env`. Khi triển khai lưu ảnh hoặc file phát sinh, cần bổ sung các đường dẫn đó vào quy tắc bỏ qua.

## 6. Thứ tự triển khai sau khi có bộ khung

1. Hạ tầng cấu hình/application factory/kết nối SQL Server đã có; tiếp tục triển khai xử lý lỗi HTTP và các API nghiệp vụ.
2. Làm xác thực/phân quyền và các API đọc danh mục, sản phẩm, tồn kho; thống nhất JSON với frontend.
3. Làm tạo/sửa dữ liệu, nghiệp vụ phiếu kho và kiểm kê có transaction.
4. Làm Barcode/QR, scanner, Dashboard, báo cáo, nhật ký và cảnh báo.
5. Điền các kiểm thử nghiệp vụ rồi tích hợp frontend theo từng chức năng.

`tests/test_database.py` đã có kiểm thử lớp kết nối; các file kiểm thử nghiệp vụ khác vẫn để trống. Hướng dẫn luồng frontend → API → database nằm trong [README gốc](../README.md); trạng thái backend hiện tại được ghi trong tài liệu này.

## 7. Cài thư viện bằng terminal Windows PowerShell

### 7.1. Mở đúng thư mục backend

Trong VS Code, mở **Terminal → New Terminal** và chạy:

```powershell
Set-Location -LiteralPath "E:\tranmanhlinh\Code\Manhlinh's project\ProductManagement\backend"
python --version
```

Đường dẫn được đặt trong dấu ngoặc kép vì có khoảng trắng và dấu nháy đơn. Nếu dự án ở vị trí khác, thay đường dẫn tương ứng. Máy đang dùng Python `3.14.8` khi chuẩn bị môi trường này.

### 7.2. Tạo môi trường ảo và cài các thư viện

Chạy lần lượt các lệnh sau khi thiết lập dự án lần đầu:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Nếu `.venv` đã được tạo, bỏ qua lệnh đầu. Lệnh cuối cài toàn bộ thư viện trong `requirements.txt` cùng các gói phụ thuộc vào `backend/.venv`. Việc nâng cấp pip là bước chuẩn bị tùy chọn; không cần chạy lại mỗi lần mở terminal.

Các lệnh dùng trực tiếp Python trong `.venv`, vì vậy **không cần kích hoạt môi trường ảo**. Cách này cũng không cần thay đổi Execution Policy của PowerShell.

Nếu muốn kích hoạt để dùng lệnh `python` ngắn gọn, có thể chạy:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Nếu PowerShell chặn `Activate.ps1`, tiếp tục dùng đường dẫn `.\.venv\Scripts\python.exe` như phía trên. Khi đã kích hoạt, dùng `deactivate` để thoát môi trường ảo.

### 7.3. Danh sách thư viện trong requirements.txt

| Thư viện | Mục đích trong hệ thống |
| :--- | :--- |
| `Flask` | Xây dựng backend API. |
| `Flask-CORS` | Hỗ trợ frontend gọi API từ origin khác. |
| `python-dotenv` | Đọc cấu hình môi trường từ `.env`. |
| `pyodbc` | Kết nối và truy vấn SQL Server qua ODBC. |
| `bcrypt` | Băm và xác minh mật khẩu BCrypt. |
| `opencv-python` | Xử lý ảnh bằng OpenCV; tên module import là `cv2`. |
| `numpy` | Xử lý mảng dữ liệu ảnh. |
| `pyzbar` | Giải mã Barcode/QR trong ảnh. |
| `python-barcode` | Sinh mã vạch; tên module import là `barcode`. |
| `qrcode` | Sinh mã QR. |
| `pillow` | Đọc và xuất ảnh; tên module import là `PIL`. |

Danh sách hiện chưa khóa phiên bản. Khi cài trên máy khác hoặc ở thời điểm khác, pip có thể chọn phiên bản khác; cần kiểm tra lại các bước dưới đây sau khi cài. Giữ một biến thể OpenCV trong môi trường, theo đúng `opencv-python` đã khai báo.

### 7.4. Kiểm tra môi trường sau khi cài

```powershell
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m pip list
.\.venv\Scripts\python.exe -c "import flask, flask_cors, dotenv, pyodbc, bcrypt, cv2, numpy, barcode, qrcode, PIL; from pyzbar.pyzbar import decode; print('Import OK')"
```

`pip check` cần báo `No broken requirements found.` và lệnh import cần in `Import OK`. Các lệnh này kiểm tra gói đã cài và khả năng nạp thư viện, chưa xác nhận API hay kết nối SQL Server hoạt động.

Để VS Code sử dụng đúng môi trường: mở **Ctrl + Shift + P → Python: Select Interpreter** rồi chọn `backend/.venv/Scripts/python.exe`.

### 7.5. Thành phần cài riêng ngoài pip

`pyodbc` sử dụng ODBC driver trên máy chạy backend. Khi cấu hình kết nối, kiểm tra danh sách driver có sẵn:

```powershell
.\.venv\Scripts\python.exe -c "import pyodbc; print(pyodbc.drivers())"
```

Nếu cấu hình dùng `ODBC Driver 18 for SQL Server`, máy phải có đúng driver đó. Bộ cài nằm trên [trang tải Microsoft ODBC Driver for SQL Server](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server); driver này không được cài bởi `pip install -r requirements.txt`.

Với `pyzbar`, wheel Windows có kèm thư viện ZBar. Nếu nạp `from pyzbar.pyzbar import decode` báo lỗi thiếu DLL, xem hướng dẫn phụ thuộc Windows trên [trang chính thức của pyzbar](https://pypi.org/project/pyzbar/). Cần kiểm tra lệnh import thực tế thay vì chỉ dựa vào thông báo cài pip thành công.

Môi trường ảo `.venv` được tạo riêng trên từng máy và đã được Git bỏ qua. Các thành viên lấy mã nguồn rồi tạo `.venv` và cài bằng `requirements.txt`, không sao chép thư mục môi trường ảo sang máy khác.

### 7.6. Kết quả kiểm tra trên máy hiện tại

Đã cài và kiểm tra vào ngày **28/10/2026**, bằng Python **3.14.8** trong `backend/.venv`:

- Đủ 11 thư viện khai báo trong `requirements.txt` và các gói phụ thuộc; giữ nguyên danh sách thư viện của dự án.
- `pip check`: `No broken requirements found.`
- Import toàn bộ thư viện, bao gồm `from pyzbar.pyzbar import decode`: thành công.
- Sinh ảnh QR và CODE128 rồi giải mã qua OpenCV/pyzbar trong bộ nhớ: thành công.
- Băm và xác minh mật khẩu bằng BCrypt: thành công.
- Máy đã có `ODBC Driver 17 for SQL Server` và `ODBC Driver 18 for SQL Server`; không cần cài thêm driver trong bước này.

Các kiểm tra ngày 28/10/2026 ở trên chỉ xác nhận môi trường thư viện. Kết quả kiểm tra kết nối database ngày 29/10/2026 nằm ở mục 8.7.

## 8. Kết nối SQL Server

### 8.1. Cấu hình đang dùng trên máy phát triển

| Thành phần | Giá trị |
| :--- | :--- |
| Server | `localhost` — instance mặc định `MSSQLSERVER` |
| Database | `QLSP_Barcode` |
| Driver | `ODBC Driver 18 for SQL Server` |
| Xác thực | Windows Authentication — tài khoản Windows chạy Python |
| File cấu hình máy cá nhân | `backend/.env` — đã được Git bỏ qua |
| File cấu hình mẫu cho nhóm | `backend/.env.example` |

Đã tạo `.env` cho máy hiện tại. Thành viên khác thiết lập lần đầu bằng lệnh sau, sau khi chuyển terminal đến thư mục `backend`:

```powershell
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
```

Lệnh chỉ sao chép khi `.env` chưa tồn tại. Mở `.env` để chỉnh theo SQL Server trên máy của mình. Ứng dụng nạp file này theo đường dẫn của backend; biến môi trường đã tồn tại trên hệ điều hành/terminal được ưu tiên hơn `.env`.

### 8.2. Ý nghĩa các biến cấu hình

| Biến | Ví dụ | Chức năng |
| :--- | :--- | :--- |
| `DB_DRIVER` | `ODBC Driver 18 for SQL Server` | Tên driver đã cài trên máy. |
| `DB_SERVER` | `localhost` | Server/instance; có thể dùng `localhost\SQLEXPRESS` hoặc `tcp:hostname,1433`. |
| `DB_NAME` | `QLSP_Barcode` | Database đã tồn tại trên SQL Server. |
| `DB_TRUSTED_CONNECTION` | `yes` | `yes`: Windows Authentication; `no`: SQL Server Authentication. |
| `DB_USER` | Để trống khi dùng Windows | Tên SQL login khi dùng SQL Server Authentication. |
| `DB_PASSWORD` | Để trống khi dùng Windows | Mật khẩu SQL login. |
| `DB_ENCRYPT` | `yes` | Bật mã hóa kết nối. |
| `DB_TRUST_SERVER_CERTIFICATE` | `yes` trên máy phát triển | Cho phép chứng chỉ tự ký của server phát triển. |
| `DB_CONNECT_TIMEOUT` | `5` | Số giây chờ đăng nhập/kết nối, phải lớn hơn 0. |
| `DB_QUERY_TIMEOUT` | `15` | Số giây giới hạn truy vấn, phải lớn hơn 0. |

Các biến boolean nhận `yes/no`, `true/false`, `1/0` hoặc `on/off`. Giá trị không hợp lệ bị từ chối trước khi kết nối.

`.env.example` bật `DB_TRUST_SERVER_CERTIFICATE=yes` cho SQL Server phát triển dùng chứng chỉ tự ký. Khi triển khai, dùng chứng chỉ đáng tin cậy và đặt biến này thành `no`. Nếu không khai báo biến này, giá trị mặc định trong mã là `no`; `DB_ENCRYPT` mặc định là `yes`.

Nếu chuyển sang SQL Server Authentication, sửa `.env`:

```dotenv
DB_TRUSTED_CONNECTION=no
DB_USER=your_sql_login
DB_PASSWORD='your_sql_password'
```

Đây là tài khoản đăng nhập SQL Server được cấp quyền vào database, không phải tài khoản `admin`/`staff` trong bảng `users`. Cấu hình phải đi kèm việc SQL Server cho phép phương thức xác thực tương ứng. Nếu mật khẩu có ký tự đặc biệt, đặt giá trị trong dấu nháy phù hợp cú pháp `.env`; không commit file `.env`.

### 8.3. Kiểm tra kết nối bằng terminal

Từ thư mục `backend`, chạy:

```powershell
.\.venv\Scripts\python.exe -m flask --app app:create_app check-db
```

Kết quả thành công trên máy hiện tại:

```text
Connection OK | database=QLSP_Barcode | SELECT 1=1
```

Lệnh chỉ chạy `SELECT DB_NAME(), 1` để xác nhận có thể truy vấn đúng database. Không cần bật HTTP server trước; lệnh không tạo database, bảng hoặc dữ liệu. Nếu thất bại, CLI trả mã thoát khác 0 và thông báo kiểm tra cấu hình, không in chuỗi kết nối/mật khẩu.

Để chạy Flask server phát triển sau khi kiểm tra kết nối:

```powershell
.\.venv\Scripts\python.exe run.py
```

Server lắng nghe tại `http://127.0.0.1:8080`, debug tắt mặc định. Chưa đăng ký route nghiệp vụ, nên truy cập `/` hoặc `/api/products` hiện trả `404`. Khởi động server thành công không tự kiểm tra database vì kết nối chỉ được mở khi gọi `get_db()`.

### 8.4. Sử dụng kết nối trong mã backend

Ví dụ truy vấn chỉ đọc trong application context:

```python
from contextlib import closing

from app import create_app
from app.db import get_db

app = create_app()

with app.app_context():
    connection = get_db()
    with closing(connection.cursor()) as cursor:
        row = cursor.execute(
            "SELECT id, sku, name FROM dbo.products WHERE sku = ?",
            "SP0001",
        ).fetchone()
        if row is not None:
            print(row.id, row.sku, row.name)
```

Trong route Flask, request đã có application context nên có thể gọi `get_db()` trực tiếp. Các lời gọi trong cùng context nhận cùng một kết nối; context khác có kết nối riêng. Luôn đóng cursor khi dùng xong, còn kết nối được ứng dụng đóng khi teardown context. Mô hình này dựa trên [vòng đời kết nối của Flask](https://flask.palletsprojects.com/en/stable/tutorial/database/), với driver SQL Server thay cho SQLite trong ví dụ tài liệu.

Kết nối dùng `autocommit=False`: nghiệp vụ ghi sau này phải chủ động `commit()` khi toàn bộ thao tác thành công hoặc `rollback()` khi thất bại. Không tự commit khi kết thúc request; thay đổi chưa commit bị rollback khi đóng kết nối. File `app/db/transaction.py` vẫn là chỗ dành sẵn, chưa có helper transaction. Xem [tài liệu connection của pyodbc](https://github.com/mkleehammer/pyodbc/wiki/Connection).

### 8.5. Xử lý khi không kết nối được

| Hiện tượng | Cách kiểm tra |
| :--- | :--- |
| Driver chưa được cài | Chạy lệnh liệt kê `pyodbc.drivers()` ở mục 7.5, đối chiếu `DB_DRIVER`. |
| Server không truy cập được | Kiểm tra dịch vụ SQL Server, `DB_SERVER` và cấu hình mạng/cổng của instance. |
| Không có quyền đăng nhập hoặc mở database | Đối chiếu phương thức xác thực và cấp quyền cho đúng Windows account/SQL login trên SQL Server. |
| Database chưa tồn tại | Kiểm tra trong SSMS; chỉ dùng script tạo cấu trúc cho database mới khi cần, không chạy lại seed lên dữ liệu hiện có. |
| Lỗi chứng chỉ trên máy phát triển | Đối chiếu `DB_ENCRYPT` và `DB_TRUST_SERVER_CERTIFICATE` với cấu hình môi trường. |
| Thay `.env` nhưng vẫn dùng cấu hình cũ | Khởi động lại tiến trình Python; kiểm tra biến môi trường terminal có ghi đè `.env` hay không. |

Trong phiên kiểm tra bằng công cụ, sandbox hạn chế Windows Authentication và báo lỗi SSL/credentials; chạy cùng lệnh ngoài sandbox đã kết nối thành công. Nếu gặp trường hợp tương tự trong công cụ bị hạn chế, kiểm tra lại bằng terminal PowerShell thông thường trên máy.

### 8.6. Chạy kiểm thử lớp kết nối

```powershell
.\.venv\Scripts\python.exe -m unittest tests.test_database -v
```

Kiểm thử dùng thư viện `unittest` có sẵn trong Python và mock kết nối, không yêu cầu SQL Server đang chạy. Phạm vi gồm kiểm tra cấu hình, xác thực Windows/SQL, escape giá trị chuỗi kết nối, vòng đời kết nối, lỗi không lộ thông tin driver và kết quả CLI.

### 8.7. Kết quả kiểm tra ngày 29/10/2026

- Lệnh `check-db` kết nối thành công vào `QLSP_Barcode` bằng Windows Authentication trên `localhost`.
- Truy vấn metadata chỉ đọc xác nhận 9 bảng: `users`, `categories`, `products`, `inventory`, `stock_transactions`, `transaction_details`, `stocktakes`, `stocktake_details`, `activity_logs`.
- Cả 11 kiểm thử lớp kết nối đều thành công.
- Không chạy script tạo bảng, seed hoặc thay đổi dữ liệu trong database. Các API nghiệp vụ và tích hợp frontend chưa được triển khai.
