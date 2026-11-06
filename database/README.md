# Cơ sở dữ liệu QLSP

Ứng dụng chỉ sử dụng ba bảng:

| Bảng | Vai trò |
| --- | --- |
| `categories` | Danh mục sản phẩm |
| `products` | Sản phẩm, SKU, serial và loại mã |
| `inventory` | Số lượng tồn kho của từng sản phẩm |

`products.category_id` tham chiếu `categories.id`; `inventory.product_id` tham chiếu `products.id` và là duy nhất. SKU dùng sequence `dbo.product_sku_sequence`, không cần bảng bộ đếm.

## Database mới

Chạy `SQLQuery1.sql`, sau đó `SQLQuery2.sql` nếu cần 50 danh mục, 50 sản phẩm và tồn kho mẫu. Script dữ liệu mẫu dùng cùng cơ chế SKU tự động với API. Không chạy lại các script khởi tạo trên database đang có dữ liệu.

## Cập nhật database hiện có

Sao lưu database và dừng backend trước khi chạy migration bằng SSMS:

1. Nếu database vẫn có tên `QLSP_Barcode`, chạy `migrations/001_rename_database.sql`. Chuyển các cửa sổ query sang `master` trước; script không ngắt kết nối cưỡng chế.
2. Nếu chưa có cột `products.product_serial`, chạy `migrations/002_product_serial.sql`.
3. Chạy `migrations/003_simplify_schema_auto_sku.sql` trên `QLSP`.
4. Chạy `migrations/004_product_scanned_code.sql` để lưu mã QR/mã vạch quét từ bên ngoài. Migration chỉ thêm cột và chỉ mục, giữ nguyên dữ liệu hiện có; có thể chạy lại.
5. Chạy `migrations/005_scanned_barcode_serial.sql` để cột Serial nhận dãy số mã vạch dài hơn 8 chữ số. Migration mở rộng cột và cập nhật ràng buộc, giữ nguyên serial hiện có; có thể chạy lại.
6. Đặt `DB_NAME=QLSP` trong `backend/.env` và khởi động lại backend để nạp luồng thêm sản phẩm mới.

Migration 003:

- Giữ nguyên dữ liệu trong `categories`, `products`, `inventory`, gồm SKU/serial hiện có và toàn bộ số lượng tồn kho.
- Xóa bảy bảng không được mã ứng dụng gọi đến: `activity_logs`, `transaction_details`, `stocktake_details`, `stock_transactions`, `stocktakes`, `users`, `product_identifier_migration`.
- Khởi tạo sequence sau hậu tố số lớn nhất trong SKU dạng `SP` + chữ số, kể cả sản phẩm đã tắt. Các SKU dạng khác vẫn được giữ nguyên.
- Gắn DEFAULT tự cấp SKU cho `products.sku`; unique constraint tiếp tục ngăn mã trùng.
- Chạy trong một transaction, khóa ghi sản phẩm trong quá trình chuyển đổi và rollback nếu lỗi. Không cưỡng chế đóng các kết nối khác.
- Có thể chạy lại: không thay dữ liệu ba bảng đang dùng và không hạ sequence khi một SKU cao hơn đã bị xóa.

Dữ liệu trong bảy bảng bị xóa chỉ có thể khôi phục từ bản sao lưu. Bảng đối chiếu do migration 002 tạo ra cũng được loại bỏ ở bước 003; nếu cần tra lại mã tem cũ, lưu bản sao trước bước này. Không chạy lại migration cũ sau khi đã hoàn tất 003.

## SKU và serial

| Cột | Quy tắc |
| --- | --- |
| `sku` | `VARCHAR(50) NOT NULL UNIQUE`; tự cấp `SP0001`, `SP0002`, …, `SP9999`, `SP10000`, … |
| `product_serial` | `VARCHAR(100) NOT NULL`, 1–100 chữ số ASCII, duy nhất, giữ số 0 đầu; lấy từ mã vạch quét hoặc tự sinh 8 chữ số |
| `scanned_code` | `NVARCHAR(450) NULL`, mã bên ngoài được giữ khi thêm sản phẩm từ trang quét; duy nhất nếu có |
| `type` | `barcode` hoặc `QR-code` |

SKU được cấp bởi sequence `BIGINT`, tăng 1, không quay vòng. Sequence cấp giá trị riêng cho các INSERT đồng thời; rollback, thử lại hoặc xóa sản phẩm có thể để lại số bị khuyết. Không dùng `MAX(sku)+1` trong luồng thêm sản phẩm.

API `POST /api/products` nhận:

```json
{"name": "Sản phẩm mới", "category_id": 1, "quantity": 7}
```

Không gửi `sku` hoặc tự tính SKU trên frontend. SKU được trả về sau khi lưu thành công. Nếu không có mã quét dạng số, Serial được SQL Server sinh ngẫu nhiên gồm 8 chữ số. Repository thử lại tối đa 5 lần khi gặp trùng định danh tự sinh, và lưu sản phẩm/tồn kho trong cùng transaction.

Khi thêm từ trang quét, API nhận thêm `scanned_code` (1–450 ký tự UTF-16). Nếu mã chỉ gồm các chữ số ASCII, hệ thống dùng nguyên dãy số làm `product_serial` (tối đa 100 chữ số), đồng thời giữ trong `scanned_code`. QR chứa chữ hoặc URL vẫn được lưu trong `scanned_code` và có serial tự sinh. Serial hiển thị ở form, danh sách và ảnh mã luôn lấy từ giá trị đã lưu.

Cả QR và Code128 chứa serial đã lưu. Thay loại mã không cần cấp SKU/serial mới. Migration 002 giữ serial hợp lệ, thay mã thiếu/sai/trùng; các tem chứa mã đã được thay cần in lại.

## Kiểm thử

Từ thư mục `backend`, với tài khoản có quyền tạo database:

```powershell
$env:RUN_SQL_SERVER_TESTS = '1'
.\.venv\Scripts\python.exe -m unittest tests.test_product_schema -v
Remove-Item Env:\RUN_SQL_SERVER_TESTS
```

Các bài tích hợp tạo database tạm riêng rồi xóa sau khi chạy. Chúng kiểm tra schema/seed ba bảng, thêm không cần SKU, thêm đồng thời, vượt mốc 9999, rollback, bảo toàn dữ liệu khi migration và khả năng chạy lại. Không sửa database ứng dụng.
