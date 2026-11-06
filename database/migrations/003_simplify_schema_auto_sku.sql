-- Existing QLSP only. Back up the database before running:
-- this migration permanently removes the seven unused legacy tables.
-- Existing products, SKUs, serials, categories and stock are preserved.
USE QLSP;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET LOCK_TIMEOUT 5000;

IF DB_NAME() <> N'QLSP'
    THROW 51000, 'Run this migration in QLSP.', 1;
IF OBJECT_ID(N'dbo.products', N'U') IS NULL
   OR OBJECT_ID(N'dbo.categories', N'U') IS NULL
   OR OBJECT_ID(N'dbo.inventory', N'U') IS NULL
    THROW 51000, 'Expected application tables were not found.', 1;
IF COL_LENGTH(N'dbo.products', N'product_serial') IS NULL
    THROW 51000, 'Run 002_product_serial.sql before this migration.', 1;

BEGIN TRY
    BEGIN TRANSACTION;

    -- Block concurrent application writes without killing sessions.
    DECLARE @ProductCount BIGINT;
    SELECT @ProductCount = COUNT_BIG(*) FROM dbo.products WITH (TABLOCKX, HOLDLOCK);

    -- Include inactive products and preserve all manually assigned SKUs.
    -- Prefix matching follows SKU collation, including lower-case "sp" where
    -- the unique constraint is case-insensitive. Ignore non-numeric suffixes.
    DECLARE @MaxSku BIGINT = 0;
    SELECT @MaxSku = COALESCE(MAX(TRY_CONVERT(BIGINT, SUBSTRING(RTRIM(sku), 3, 48))), 0)
    FROM dbo.products
    WHERE LEFT(sku, 2) = 'SP'
      AND LEN(sku) > 2
      AND SUBSTRING(RTRIM(sku), 3, 48) COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9]%';

    IF @MaxSku = 9223372036854775807
        THROW 51000, 'The SKU sequence space is exhausted.', 1;

    DECLARE @NextSku BIGINT = @MaxSku + 1;
    DECLARE @Sql NVARCHAR(MAX);
    IF OBJECT_ID(N'dbo.product_sku_sequence', N'SO') IS NULL
    BEGIN
        SET @Sql = N'CREATE SEQUENCE dbo.product_sku_sequence AS BIGINT START WITH '
            + CONVERT(NVARCHAR(20), @NextSku)
            + N' INCREMENT BY 1 MINVALUE 1 NO CYCLE NO CACHE;';
        EXEC sys.sp_executesql @Sql;
    END
    ELSE
    BEGIN
        IF EXISTS (
            SELECT 1 FROM sys.sequences
            WHERE object_id = OBJECT_ID(N'dbo.product_sku_sequence')
              AND (CONVERT(BIGINT, increment) <> 1 OR is_cycling = 1 OR is_exhausted = 1)
        )
            THROW 51000, 'The existing SKU sequence has an unsupported configuration.', 1;
        -- Never move backwards, even if a higher SKU was deleted.
        IF EXISTS (
            SELECT 1 FROM sys.sequences
            WHERE object_id = OBJECT_ID(N'dbo.product_sku_sequence')
              AND CONVERT(BIGINT, current_value) <= @MaxSku
        )
        BEGIN
            SET @Sql = N'ALTER SEQUENCE dbo.product_sku_sequence RESTART WITH '
                + CONVERT(NVARCHAR(20), @NextSku) + N';';
            EXEC sys.sp_executesql @Sql;
        END;
    END;

    DECLARE @DefaultName SYSNAME;
    SELECT @DefaultName = d.name
    FROM sys.default_constraints AS d
    JOIN sys.columns AS c ON c.object_id = d.parent_object_id AND c.column_id = d.parent_column_id
    WHERE c.object_id = OBJECT_ID(N'dbo.products') AND c.name = N'sku';
    IF @DefaultName IS NOT NULL
    BEGIN
        SET @Sql = N'ALTER TABLE dbo.products DROP CONSTRAINT ' + QUOTENAME(@DefaultName) + N';';
        EXEC sys.sp_executesql @Sql;
    END;
    -- Compile after CREATE SEQUENCE so the new object can be resolved.
    EXEC sys.sp_executesql N'ALTER TABLE dbo.products ADD CONSTRAINT DF_products_sku
        DEFAULT (''SP'' + FORMAT(NEXT VALUE FOR dbo.product_sku_sequence, ''0000'', ''en-US'')) FOR sku;';

    -- Drop children first. Unexpected external FK dependencies cause a rollback.
    DROP TABLE IF EXISTS dbo.activity_logs;
    DROP TABLE IF EXISTS dbo.transaction_details;
    DROP TABLE IF EXISTS dbo.stocktake_details;
    DROP TABLE IF EXISTS dbo.stock_transactions;
    DROP TABLE IF EXISTS dbo.stocktakes;
    DROP TABLE IF EXISTS dbo.users;
    DROP TABLE IF EXISTS dbo.product_identifier_migration;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
