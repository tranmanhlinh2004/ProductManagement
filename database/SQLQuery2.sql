-- DỮ LIỆU MẪU CHO QLSP: chỉ categories, products và inventory.
-- Chạy SQLQuery1.sql trước; chỉ dùng khi cả ba bảng đang rỗng.
USE QLSP;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;
    IF EXISTS (SELECT 1 FROM dbo.categories)
       OR EXISTS (SELECT 1 FROM dbo.products)
       OR EXISTS (SELECT 1 FROM dbo.inventory)
        THROW 51000, N'Script dữ liệu mẫu chỉ chạy trên các bảng đang rỗng.', 1;

    -- Bang tam chua 50 cap danh muc + san pham (khong can gia dinh ID = 1..50).
    CREATE TABLE #Seed (
        seq INT NOT NULL PRIMARY KEY,
        category_name NVARCHAR(100) NOT NULL,
        product_name NVARCHAR(200) NOT NULL,
        unit NVARCHAR(30) NOT NULL,
        import_price DECIMAL(18,2) NOT NULL,
        sale_price DECIMAL(18,2) NOT NULL,
        product_serial VARCHAR(8) NULL
    );
    INSERT INTO #Seed (seq, category_name, product_name, unit, import_price, sale_price)
    VALUES
    (1, N'Điện thoại', N'Điện thoại Samsung Galaxy A16', N'Cái', 3100000, 3790000),
    (2, N'Máy tính bảng', N'Máy tính bảng Lenovo Tab M11', N'Cái', 4200000, 4990000),
    (3, N'Laptop', N'Laptop Acer Aspire 3', N'Cái', 10500000, 12590000),
    (4, N'Phụ kiện điện thoại', N'Ốp lưng điện thoại trong suốt', N'Cái', 18000, 45000),
    (5, N'Bộ sạc', N'Củ sạc nhanh USB-C 20W', N'Cái', 75000, 159000),
    (6, N'Cáp kết nối', N'Cáp sạc USB-C dài 1 mét', N'Sợi', 25000, 69000),
    (7, N'Tai nghe', N'Tai nghe Bluetooth không dây', N'Cái', 190000, 349000),
    (8, N'Loa', N'Loa Bluetooth mini', N'Cái', 220000, 399000),
    (9, N'Chuột máy tính', N'Chuột không dây 2.4GHz', N'Cái', 85000, 159000),
    (10, N'Bàn phím', N'Bàn phím cơ LED RGB', N'Cái', 450000, 699000),
    (11, N'Màn hình', N'Màn hình máy tính 24 inch', N'Cái', 1750000, 2290000),
    (12, N'Thiết bị lưu trữ', N'Ổ cứng SSD 512GB', N'Cái', 670000, 890000),
    (13, N'Thiết bị mạng', N'Bộ phát Wi-Fi băng tần kép', N'Cái', 350000, 549000),
    (14, N'Camera giám sát', N'Camera IP trong nhà 2K', N'Cái', 460000, 690000),
    (15, N'Thiết bị điện', N'Ổ cắm điện 4 lỗ', N'Cái', 45000, 95000),
    (16, N'Đèn chiếu sáng', N'Bóng đèn LED 12W', N'Bóng', 26000, 55000),
    (17, N'Pin và ắc quy', N'Pin AA kiềm vỉ 4 viên', N'Vỉ', 19000, 39000),
    (18, N'Đồ gia dụng nhỏ', N'Ấm siêu tốc 1.8 lít', N'Cái', 155000, 249000),
    (19, N'Đồ gia dụng lớn', N'Nồi chiên không dầu 5 lít', N'Cái', 950000, 1390000),
    (20, N'Dụng cụ nhà bếp', N'Bộ dao nhà bếp inox 3 món', N'Bộ', 90000, 179000),
    (21, N'Đồ dùng phòng tắm', N'Kệ góc nhà tắm inox', N'Cái', 85000, 159000),
    (22, N'Đồ dùng vệ sinh', N'Chổi lau nhà xoay 360 độ', N'Bộ', 165000, 279000),
    (23, N'Nội thất', N'Ghế gấp văn phòng', N'Cái', 280000, 450000),
    (24, N'Trang trí nhà cửa', N'Đồng hồ treo tường tròn', N'Cái', 85000, 169000),
    (25, N'Văn phòng phẩm', N'Bút bi xanh hộp 20 cây', N'Hộp', 28000, 49000),
    (26, N'Giấy và sổ', N'Sổ tay bìa cứng A5', N'Quyển', 18000, 39000),
    (27, N'Sách', N'Sách kỹ năng quản lý thời gian', N'Quyển', 55000, 99000),
    (28, N'Đồ chơi', N'Bộ xếp hình 300 chi tiết', N'Bộ', 140000, 239000),
    (29, N'Đồ dùng học sinh', N'Hộp bút học sinh nhiều ngăn', N'Cái', 29000, 59000),
    (30, N'Thời trang nam', N'Áo thun nam cổ tròn', N'Cái', 65000, 129000),
    (31, N'Thời trang nữ', N'Áo sơ mi nữ dài tay', N'Cái', 110000, 219000),
    (32, N'Giày dép', N'Dép quai ngang unisex', N'Đôi', 45000, 99000),
    (33, N'Túi xách', N'Túi tote vải canvas', N'Cái', 39000, 89000),
    (34, N'Phụ kiện thời trang', N'Thắt lưng da tổng hợp', N'Cái', 55000, 119000),
    (35, N'Mỹ phẩm', N'Son dưỡng môi không màu', N'Thỏi', 30000, 69000),
    (36, N'Chăm sóc da', N'Sữa rửa mặt dịu nhẹ 150ml', N'Tuýp', 68000, 129000),
    (37, N'Chăm sóc tóc', N'Dầu gội dưỡng tóc 650ml', N'Chai', 72000, 139000),
    (38, N'Chăm sóc cá nhân', N'Bàn chải đánh răng lông mềm', N'Cái', 10000, 25000),
    (39, N'Đồ mẹ và bé', N'Bình sữa trẻ em 240ml', N'Bình', 75000, 149000),
    (40, N'Thực phẩm khô', N'Mì ăn liền thùng 30 gói', N'Thùng', 75000, 118000),
    (41, N'Đồ uống', N'Nước khoáng chai 500ml', N'Chai', 3000, 7000),
    (42, N'Gia vị', N'Nước mắm truyền thống 500ml', N'Chai', 29000, 49000),
    (43, N'Bánh kẹo', N'Bánh quy bơ hộp 300g', N'Hộp', 42000, 79000),
    (44, N'Ngũ cốc', N'Yến mạch cán dẹt túi 500g', N'Túi', 35000, 69000),
    (45, N'Đồ đông lạnh', N'Xúc xích đông lạnh gói 500g', N'Gói', 49000, 89000),
    (46, N'Dụng cụ thể thao', N'Thảm tập yoga dày 6mm', N'Cái', 75000, 149000),
    (47, N'Đồ dã ngoại', N'Bình giữ nhiệt inox 500ml', N'Bình', 85000, 169000),
    (48, N'Phụ kiện xe', N'Giá đỡ điện thoại xe máy', N'Cái', 65000, 129000),
    (49, N'Dụng cụ sửa chữa', N'Bộ tua vít đa năng 24 đầu', N'Bộ', 78000, 159000),
    (50, N'Chăm sóc thú cưng', N'Thức ăn mèo hạt túi 1kg', N'Túi', 58000, 105000);

    -- 2) 50 categories
    INSERT INTO dbo.categories (name, description, is_active, created_at)
    SELECT category_name,
           CONCAT(N'Danh mục sản phẩm: ', category_name),
           1, DATEADD(DAY, -90, GETDATE())
    FROM #Seed;

    -- Generate distinct eight-digit serials for both barcode and QR-code.
    DECLARE @Serial VARCHAR(8), @Seq INT;
    WHILE EXISTS (SELECT 1 FROM #Seed WHERE product_serial IS NULL)
    BEGIN
        SET @Seq = (SELECT MIN(seq) FROM #Seed WHERE product_serial IS NULL);
        SET @Serial = RIGHT('00000000' + CONVERT(VARCHAR(8), CONVERT(BIGINT, CRYPT_GEN_RANDOM(4)) % 100000000), 8);
        IF NOT EXISTS (SELECT 1 FROM #Seed WHERE product_serial = @Serial)
            UPDATE #Seed SET product_serial = @Serial WHERE seq = @Seq;
    END;

    -- SKU is generated by the same database default used by the API.
    INSERT INTO dbo.products
      (name, category_id, unit, import_price, sale_price,
       product_serial, [type], min_stock, is_active, created_at)
    SELECT s.product_name, c.id, s.unit, s.import_price, s.sale_price,
           s.product_serial,
           CASE WHEN s.seq % 5 = 0 THEN 'QR-code' ELSE 'barcode' END,
           10 + (s.seq % 8), 1, DATEADD(DAY, s.seq - 75, GETDATE())
    FROM #Seed AS s
    JOIN dbo.categories AS c ON c.name = s.category_name
    ORDER BY s.seq;

    INSERT INTO dbo.inventory (product_id, quantity, updated_at)
    SELECT p.id,
           CASE WHEN s.seq % 8 = 0 THEN 14 ELSE 50 + (s.seq % 45) END,
           DATEADD(DAY, s.seq - 54, GETDATE())
    FROM #Seed AS s
    JOIN dbo.products AS p ON p.product_serial = s.product_serial;

    DROP TABLE #Seed;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

SELECT 'categories' AS table_name, COUNT(*) AS total_rows FROM dbo.categories
UNION ALL SELECT 'products', COUNT(*) FROM dbo.products
UNION ALL SELECT 'inventory', COUNT(*) FROM dbo.inventory;
GO
