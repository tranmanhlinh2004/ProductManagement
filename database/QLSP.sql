/*
    CƠ SỞ DỮ LIỆU QUẢN LÝ SẢN PHẨM - QLSP
    Xuất cấu trúc trực tiếp từ database QLSP ngày 18/11/2026.
    SQL Server: mở file bằng SSMS hoặc sqlcmd để chạy các batch GO.

    Bao gồm toàn bộ 3 bảng, identity, khóa chính, khóa ngoại, UNIQUE,
    DEFAULT, CHECK, chỉ mục và sequence tạo SKU; không bao gồm dữ liệu.
    Giữ nguyên tên và định nghĩa các đối tượng trong database nguồn.

    Lưu ý: database thực tế đang dùng product_serial VARCHAR(8),
    CHECK đúng 8 chữ số; migration 005 mở rộng lên 100 chưa được áp dụng.
    Sequence được tạo theo START WITH 51 của database nguồn, không phải
    giá trị đang cấp phát tại thời điểm xuất.

    Script dùng để khởi tạo cấu trúc. Nếu các đối tượng đã tồn tại,
    script dừng và rollback phần tạo cấu trúc trong transaction.
*/

USE [master];
GO

IF DB_ID(N'QLSP') IS NULL
    EXEC(N'CREATE DATABASE [QLSP] COLLATE SQL_Latin1_General_CP1_CI_AS;');
GO

USE [QLSP];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.categories') IS NOT NULL
       OR OBJECT_ID(N'dbo.products') IS NOT NULL
       OR OBJECT_ID(N'dbo.inventory') IS NOT NULL
       OR OBJECT_ID(N'dbo.product_sku_sequence') IS NOT NULL
        THROW 51000, N'Các bảng hoặc sequence QLSP đã tồn tại. Script chỉ dùng để khởi tạo cấu trúc mới.', 1;

    -- 1. Sequence cấp SKU tự động: SP0051, SP0052, ...
    CREATE SEQUENCE [dbo].[product_sku_sequence]
        AS BIGINT
        START WITH 51
        INCREMENT BY 1
        MINVALUE 1
        MAXVALUE 9223372036854775807
        NO CYCLE
        NO CACHE;

    -- 2. Danh mục sản phẩm.
    CREATE TABLE [dbo].[categories] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [name] NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
        [description] NVARCHAR(500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
        [is_active] BIT NOT NULL
            CONSTRAINT [DF__categorie__is_ac__5165187F] DEFAULT ((1)),
        [created_at] DATETIME NULL
            CONSTRAINT [DF__categorie__creat__52593CB8] DEFAULT (GETDATE()),

        CONSTRAINT [PK__categori__3213E83F7E43ED80]
            PRIMARY KEY CLUSTERED ([id] ASC),
        CONSTRAINT [UQ__categori__72E12F1B670DD6C6]
            UNIQUE NONCLUSTERED ([name] ASC)
    ) ON [PRIMARY];

    -- 3. Sản phẩm và các mã định danh.
    CREATE TABLE [dbo].[products] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [sku] VARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL
            CONSTRAINT [DF_products_sku] DEFAULT
            ('SP' + FORMAT(NEXT VALUE FOR [dbo].[product_sku_sequence], '0000', 'en-US')),
        [name] NVARCHAR(200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
        [category_id] INT NOT NULL,
        [unit] NVARCHAR(30) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL
            CONSTRAINT [DF__products__unit__5629CD9C] DEFAULT (N'Cái'),
        [import_price] DECIMAL(18,2) NOT NULL
            CONSTRAINT [DF__products__import__571DF1D5] DEFAULT ((0)),
        [sale_price] DECIMAL(18,2) NOT NULL
            CONSTRAINT [DF__products__sale_p__5812160E] DEFAULT ((0)),
        [product_serial] VARCHAR(8) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL
            CONSTRAINT [DF_products_product_serial] DEFAULT
            (RIGHT('00000000' + CONVERT(VARCHAR(8), CONVERT(BIGINT, CRYPT_GEN_RANDOM(4)) % 100000000), 8)),
        [type] VARCHAR(10) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL
            CONSTRAINT [DF_products_type] DEFAULT ('QR-code'),
        [min_stock] INT NOT NULL
            CONSTRAINT [DF__products__min_st__59FA5E80] DEFAULT ((0)),
        [is_active] BIT NOT NULL
            CONSTRAINT [DF__products__is_act__5AEE82B9] DEFAULT ((1)),
        [created_at] DATETIME NULL
            CONSTRAINT [DF__products__create__5BE2A6F2] DEFAULT (GETDATE()),
        [updated_at] DATETIME NULL,
        [scanned_code] NVARCHAR(450) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,

        CONSTRAINT [PK__products__3213E83F8F11AB82]
            PRIMARY KEY CLUSTERED ([id] ASC),
        CONSTRAINT [UQ__products__DDDF4BE7C0920ABB]
            UNIQUE NONCLUSTERED ([sku] ASC),
        CONSTRAINT [FK__products__catego__5CD6CB2B]
            FOREIGN KEY ([category_id]) REFERENCES [dbo].[categories] ([id]),
        CONSTRAINT [CK__products__import__5DCAEF64]
            CHECK ([import_price] >= (0)),
        CONSTRAINT [CK__products__sale_p__5EBF139D]
            CHECK ([sale_price] >= (0)),
        CONSTRAINT [CK__products__min_st__5FB337D6]
            CHECK ([min_stock] >= (0)),
        CONSTRAINT [CK_products_product_serial]
            CHECK (DATALENGTH([product_serial]) = (8)
                AND NOT ([product_serial]) COLLATE Latin1_General_100_BIN2 LIKE '%[^0-9]%'),
        CONSTRAINT [CK_products_type]
            CHECK (DATALENGTH([type]) = (7)
                AND (([type]) COLLATE Latin1_General_100_BIN2 = 'QR-code'
                  OR ([type]) COLLATE Latin1_General_100_BIN2 = 'barcode'))
    ) ON [PRIMARY];

    -- 4. Tồn kho: mỗi sản phẩm có tối đa một dòng tồn kho.
    CREATE TABLE [dbo].[inventory] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [product_id] INT NOT NULL,
        [quantity] INT NOT NULL
            CONSTRAINT [DF__inventory__quant__6477ECF3] DEFAULT ((0)),
        [updated_at] DATETIME NULL
            CONSTRAINT [DF__inventory__updat__656C112C] DEFAULT (GETDATE()),

        CONSTRAINT [PK__inventor__3213E83F3EBAA52B]
            PRIMARY KEY CLUSTERED ([id] ASC),
        CONSTRAINT [UQ__inventor__47027DF408347318]
            UNIQUE NONCLUSTERED ([product_id] ASC),
        CONSTRAINT [FK__inventory__produ__66603565]
            FOREIGN KEY ([product_id]) REFERENCES [dbo].[products] ([id]),
        CONSTRAINT [CK__inventory__quant__6754599E]
            CHECK ([quantity] >= (0))
    ) ON [PRIMARY];

    -- 5. Các chỉ mục bổ sung ngoài chỉ mục của PRIMARY KEY và UNIQUE.
    CREATE NONCLUSTERED INDEX [IX_products_category]
        ON [dbo].[products] ([category_id] ASC)
        ON [PRIMARY];

    CREATE UNIQUE NONCLUSTERED INDEX [IX_products_product_serial]
        ON [dbo].[products] ([product_serial] ASC)
        ON [PRIMARY];

    CREATE UNIQUE NONCLUSTERED INDEX [IX_products_scanned_code]
        ON [dbo].[products] ([scanned_code] ASC)
        WHERE [scanned_code] IS NOT NULL
        ON [PRIMARY];

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
