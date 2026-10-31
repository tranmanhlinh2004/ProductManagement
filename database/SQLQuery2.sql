-- DU LIEU MAU CHO QLSP - Microsoft SQL Server
-- Chay sau khi da tao tat ca bang, foreign key va index.
-- Script duoc thiet ke cho CSDL moi, cac bang chua co du lieu.
-- Tai khoan demo (chi dung de kiem thu):
--   admin / Admin@12345  (ADMIN)
--   staff / Staff@12345  (STAFF)
-- Password hashes dung BCrypt ($2b$, cost = 12). Ung dung phai xac thuc bang BCrypt.
USE QLSP;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    -- Khong chen trung neu script da duoc chay.
    IF EXISTS (SELECT 1 FROM dbo.users)
       OR EXISTS (SELECT 1 FROM dbo.categories)
       OR EXISTS (SELECT 1 FROM dbo.products)
       OR EXISTS (SELECT 1 FROM dbo.inventory)
       OR EXISTS (SELECT 1 FROM dbo.stock_transactions)
       OR EXISTS (SELECT 1 FROM dbo.transaction_details)
       OR EXISTS (SELECT 1 FROM dbo.stocktakes)
       OR EXISTS (SELECT 1 FROM dbo.stocktake_details)
       OR EXISTS (SELECT 1 FROM dbo.activity_logs)
    BEGIN
        ;THROW 51000, N'Script du lieu mau chi chay tren cac bang dang rong.', 1;
    END;

    -- 1) 2 users: 1 ADMIN + 1 STAFF
    INSERT INTO dbo.users (username, password_hash, full_name, email, role, is_active)
    VALUES
    ('admin', '$2b$12$tUC7/L5tcDwyiMsKxmlDP.dLJ4NgtQdOrS/D7jNO8Tn9trMEd53k6', N'Quản trị hệ thống', 'admin@example.com', 'ADMIN', 1),
    ('staff', '$2b$12$F7GGjEGc0oDVulDSzShHNu28xkndkGhmgjMWTJRImAjc2m8qVyX.e', N'Nhân viên kho', 'staff@example.com', 'STAFF', 1);

    DECLARE @AdminId INT = (SELECT id FROM dbo.users WHERE username = 'admin');
    DECLARE @StaffId INT = (SELECT id FROM dbo.users WHERE username = 'staff');

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

    -- 3) 50 products, SKU va serial khong trung
    INSERT INTO dbo.products
      (sku, name, category_id, unit, import_price, sale_price,
       product_serial, [type], min_stock, is_active, created_at)
    SELECT CONCAT('SP', RIGHT('0000' + CAST(s.seq AS VARCHAR(4)), 4)),
           s.product_name, c.id, s.unit, s.import_price, s.sale_price,
           s.product_serial,
           CASE WHEN s.seq % 5 = 0 THEN 'QR-code' ELSE 'barcode' END,
           10 + (s.seq % 8), 1, DATEADD(DAY, s.seq - 75, GETDATE())
    FROM #Seed AS s
    JOIN dbo.categories AS c ON c.name = s.category_name;

    -- 50 giao dich, trang thai va so luong phu thuoc vao seq
    SELECT s.seq,
           CASE s.seq % 4
               WHEN 1 THEN 'IN'
               WHEN 2 THEN 'OUT'
               WHEN 3 THEN 'ADJUST_IN'
               ELSE 'ADJUST_OUT'
           END AS kind,
           CASE
               WHEN s.seq % 10 = 0 THEN 'CANCELLED'
               WHEN s.seq % 7 = 0 THEN 'DRAFT'
               ELSE 'CONFIRMED'
           END AS status,
           1 + (s.seq % 9) AS quantity
    INTO #TxnSeed
    FROM #Seed AS s;

    -- 4) 50 inventory; chi cong/tru giao dich CONFIRMED
    INSERT INTO dbo.inventory (product_id, quantity, updated_at)
    SELECT p.id,
           CASE WHEN s.seq % 8 = 0 THEN 14 ELSE 50 + (s.seq % 45) END
           + CASE WHEN t.status <> 'CONFIRMED' THEN 0
                  WHEN t.kind IN ('IN', 'ADJUST_IN') THEN t.quantity
                  ELSE -t.quantity END,
           DATEADD(DAY, s.seq - 54, GETDATE())
    FROM #Seed AS s
    JOIN dbo.products AS p
         ON p.sku = CONCAT('SP', RIGHT('0000' + CAST(s.seq AS VARCHAR(4)), 4))
    JOIN #TxnSeed AS t ON t.seq = s.seq;

    -- 5) 50 stock_transactions
    INSERT INTO dbo.stock_transactions
      (code, kind, status, created_by, confirmed_by, created_at, confirmed_at, note)
    SELECT CONCAT('GD', RIGHT('0000' + CAST(t.seq AS VARCHAR(4)), 4)),
           t.kind, t.status,
           CASE WHEN t.seq % 2 = 0 THEN @AdminId ELSE @StaffId END,
           CASE WHEN t.status = 'CONFIRMED' THEN @AdminId ELSE NULL END,
           DATEADD(DAY, t.seq - 55, GETDATE()),
           CASE WHEN t.status = 'CONFIRMED'
                THEN DATEADD(HOUR, 2, DATEADD(DAY, t.seq - 55, GETDATE()))
                ELSE NULL END,
           CONCAT(N'Giao dịch mẫu số ', t.seq)
    FROM #TxnSeed AS t;

    -- 6) 50 transaction_details: moi giao dich co 1 dong san pham
    INSERT INTO dbo.transaction_details (transaction_id, product_id, quantity, unit_price)
    SELECT tr.id, p.id, t.quantity,
           CASE WHEN t.kind IN ('IN', 'ADJUST_IN') THEN s.import_price
                ELSE s.sale_price END
    FROM #Seed AS s
    JOIN #TxnSeed AS t ON t.seq = s.seq
    JOIN dbo.products AS p
         ON p.sku = CONCAT('SP', RIGHT('0000' + CAST(s.seq AS VARCHAR(4)), 4))
    JOIN dbo.stock_transactions AS tr
         ON tr.code = CONCAT('GD', RIGHT('0000' + CAST(s.seq AS VARCHAR(4)), 4));

    -- 50 dot kiem ke (COMPLETED / COUNTING / DRAFT)
    SELECT s.seq,
           CASE WHEN s.seq % 6 = 0 THEN 'DRAFT'
                WHEN s.seq % 5 = 0 THEN 'COUNTING'
                ELSE 'COMPLETED' END AS status
    INTO #TakeSeed
    FROM #Seed AS s;

    -- 7) 50 stocktakes
    INSERT INTO dbo.stocktakes (code, status, created_by, started_at, closed_at)
    SELECT CONCAT('KK', RIGHT('0000' + CAST(t.seq AS VARCHAR(4)), 4)),
           t.status,
           CASE WHEN t.seq % 2 = 0 THEN @AdminId ELSE @StaffId END,
           DATEADD(DAY, t.seq - 53, GETDATE()),
           CASE WHEN t.status = 'COMPLETED'
                THEN DATEADD(HOUR, 4, DATEADD(DAY, t.seq - 53, GETDATE()))
                ELSE NULL END
    FROM #TakeSeed AS t;

    -- 8) 50 stocktake_details: system_qty khop ton kho;
    -- DRAFT chua dem, COUNTING co the chua dem, COMPLETED da dem.
    -- diff_qty la computed column, SQL Server tu tinh.
    INSERT INTO dbo.stocktake_details
      (stocktake_id, product_id, system_qty, counted_qty)
    SELECT st.id, p.id, inv.quantity,
           CASE WHEN t.status = 'DRAFT'
                     OR (t.status = 'COUNTING' AND s.seq % 2 = 0)
                THEN NULL
                ELSE inv.quantity
                     + CASE WHEN s.seq % 9 = 0 THEN 2
                            WHEN s.seq % 8 = 0 THEN -1
                            ELSE 0 END
           END
    FROM #Seed AS s
    JOIN #TakeSeed AS t ON t.seq = s.seq
    JOIN dbo.stocktakes AS st
         ON st.code = CONCAT('KK', RIGHT('0000' + CAST(s.seq AS VARCHAR(4)), 4))
    JOIN dbo.products AS p
         ON p.sku = CONCAT('SP', RIGHT('0000' + CAST(s.seq AS VARCHAR(4)), 4))
    JOIN dbo.inventory AS inv ON inv.product_id = p.id;

    -- 9) 50 activity_logs, tham chieu toi object co that
    INSERT INTO dbo.activity_logs
      (user_id, action, object_type, object_id, result, created_at, meta)
    SELECT CASE WHEN s.seq % 2 = 0 THEN @AdminId ELSE @StaffId END,
           CASE s.seq % 4
               WHEN 0 THEN 'CREATE_PRODUCT'
               WHEN 1 THEN 'CREATE_TRANSACTION'
               WHEN 2 THEN 'CREATE_STOCKTAKE'
               ELSE 'UPDATE_INVENTORY' END,
           CASE s.seq % 4
               WHEN 0 THEN 'PRODUCT'
               WHEN 1 THEN 'STOCK_TRANSACTION'
               WHEN 2 THEN 'STOCKTAKE'
               ELSE 'INVENTORY' END,
           CASE s.seq % 4
               WHEN 0 THEN p.id
               WHEN 1 THEN tr.id
               WHEN 2 THEN st.id
               ELSE inv.id END,
           CASE WHEN s.seq % 13 = 0 THEN 'FAILED' ELSE 'SUCCESS' END,
           DATEADD(DAY, s.seq - 52, GETDATE()),
           CONCAT(N'{"source":"sample","seq":', s.seq, N'}')
    FROM #Seed AS s
    JOIN dbo.products AS p
         ON p.sku = CONCAT('SP', RIGHT('0000' + CAST(s.seq AS VARCHAR(4)), 4))
    JOIN dbo.inventory AS inv ON inv.product_id = p.id
    JOIN dbo.stock_transactions AS tr
         ON tr.code = CONCAT('GD', RIGHT('0000' + CAST(s.seq AS VARCHAR(4)), 4))
    JOIN dbo.stocktakes AS st
         ON st.code = CONCAT('KK', RIGHT('0000' + CAST(s.seq AS VARCHAR(4)), 4));

    DROP TABLE #TakeSeed;
    DROP TABLE #TxnSeed;
    DROP TABLE #Seed;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

-- Kiem tra tong so dong trong moi bang
SELECT 'users' AS table_name, COUNT(*) AS total_rows FROM dbo.users
UNION ALL SELECT 'categories', COUNT(*) FROM dbo.categories
UNION ALL SELECT 'products', COUNT(*) FROM dbo.products
UNION ALL SELECT 'inventory', COUNT(*) FROM dbo.inventory
UNION ALL SELECT 'stock_transactions', COUNT(*) FROM dbo.stock_transactions
UNION ALL SELECT 'transaction_details', COUNT(*) FROM dbo.transaction_details
UNION ALL SELECT 'stocktakes', COUNT(*) FROM dbo.stocktakes
UNION ALL SELECT 'stocktake_details', COUNT(*) FROM dbo.stocktake_details
UNION ALL SELECT 'activity_logs', COUNT(*) FROM dbo.activity_logs;
GO
