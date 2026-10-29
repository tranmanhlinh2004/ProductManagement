# ProductManagement — Khung demo Barcode / QR

**Trạng thái:** chỉ chuẩn bị cấu trúc file và giao diện khung. Chưa triển khai nghiệp vụ sản phẩm, sinh mã, lưu mã, nhận diện webcam hoặc tra cứu qua API.

Phạm vi dự kiến:

- Quản lý thông tin sản phẩm phục vụ nhận diện.
- Sinh Barcode/QR cho từng sản phẩm và lưu mã trong database.
- Quét Barcode/QR bằng webcam để xem thông tin sản phẩm.

Demo không cần xác thực hoặc phân quyền. Giữ nguyên schema và bảng `users` trong database.

## Cấu trúc

```text
ProductManagement/
├── backend/
│   ├── app/
│   │   ├── db/           # Hạ tầng kết nối SQL Server đã có
│   │   ├── repositories/ # File trống cho truy vấn sản phẩm
│   │   ├── routes/       # File trống cho API sản phẩm, tạo mã, quét mã
│   │   └── services/     # File trống cho xử lý sản phẩm, sinh mã, nhận diện
│   └── tests/            # Test kết nối đã có; test nghiệp vụ còn trống
├── frontend/
│   ├── sources/          # products, barcode, scanner; index chuyển tới products
│   ├── assets/           # CSS giao diện và JS điều hướng
│   └── tests/            # File khung, chưa có kiểm thử giao diện
├── database/             # SQL gốc giữ nguyên
└── docs/                 # Tài liệu nhóm
```

Frontend đã loại bỏ dashboard, trang danh mục riêng, nhập/xuất kho, kiểm kê, báo cáo, nhật ký, cảnh báo và quản lý người dùng. Ba trang còn lại chỉ là giao diện khung; các nút nghiệp vụ đang vô hiệu hóa, không gọi API và không mở webcam.

## Xem giao diện khung

Chạy tại thư mục gốc:

```powershell
python -m http.server 5500 --directory frontend
```

Mở **http://localhost:5500/sources/index.html**. Có thể chuyển giữa ba trang qua menu.

Hạ tầng Flask và kết nối SQL Server có sẵn được giữ lại. Cách cài đặt, kiểm tra kết nối và trách nhiệm dự kiến của từng file nằm trong [backend/README.md](backend/README.md).
