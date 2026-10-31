# Cơ sở dữ liệu QLSP

Với database mới, chạy `SQLQuery1.sql`, rồi chạy `SQLQuery2.sql` nếu cần 50 sản phẩm mẫu. Không chạy lại hai file này trên database đã có dữ liệu.

Với database `QLSP_Barcode` hiện có, dừng backend và chuyển các cửa sổ query SSMS đang dùng database này sang `master`. Chạy lần lượt:

1. `migrations/001_rename_database.sql`: đổi tên thành `QLSP`. Script không ngắt kết nối cưỡng chế hoặc ghi đè database cùng tên.
2. `migrations/002_product_serial.sql`: đổi cột, chuyển dữ liệu và thêm ràng buộc trong một transaction. Nếu lỗi, bước này rollback. Có thể chạy lại mà không thay các serial hợp lệ.

Sau đó đặt `DB_NAME=QLSP` trong `backend/.env` và khởi động lại backend.

| Cột | Quy tắc |
| --- | --- |
| `product_serial` (trước đây `barcode_value`) | `VARCHAR(8) NOT NULL`, đúng 8 chữ số ASCII, duy nhất trong tất cả sản phẩm, giữ số 0 ở đầu |
| `type` (trước đây `barcode_type`) | `barcode` cho mã vạch; `QR-code` cho QR |

Migration giữ các serial 8 chữ số hợp lệ, cấp serial ngẫu nhiên cho mã thiếu/sai định dạng hoặc trùng. `QR` chuyển thành `QR-code`; `CODE128`, `EAN13`, `EAN8`, `UPC_A` chuyển thành `barcode`. Bảng `dbo.product_identifier_migration` lưu giá trị cũ, loại cũ và serial mới để đối chiếu. ID sản phẩm và các tham chiếu tồn kho/giao dịch được giữ nguyên. Các tem chứa mã cũ đã được thay serial cần được tạo/in lại.

Sản phẩm mới được tự sinh serial nếu INSERT bỏ qua cột `product_serial`. Unique index từ chối mã trùng; bên ghi dữ liệu cần thử lại khi xảy ra xung đột serial. Dùng serial đã lưu làm nội dung cho cả barcode (Code128) và QR; khi quét, nội dung trả về chính là 8 chữ số này. Chuyển loại mã không cần cấp serial mới. Phần tạo ảnh và quét webcam hiện chưa được triển khai trong ứng dụng.

Kiểm thử trực tiếp SQL Server (chạy từ `backend`, cần quyền tạo database):

```powershell
$env:RUN_SQL_SERVER_TESTS = '1'
.\.venv\Scripts\python.exe -m unittest tests.test_product_schema -v
Remove-Item Env:\RUN_SQL_SERVER_TESTS
```

Kiểm thử tạo database tạm có tên ngẫu nhiên, kiểm tra schema mới, dữ liệu mẫu, migration, rollback và chạy lại, rồi xóa database tạm. Không sửa database ứng dụng.
