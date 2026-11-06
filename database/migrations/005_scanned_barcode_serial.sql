-- Accept scanned numeric barcodes as serials, including EAN-13 and leading zeros.
-- Existing serial values and eight-digit generation defaults are preserved.
USE QLSP;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET LOCK_TIMEOUT 5000;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

IF COL_LENGTH(N'dbo.products', N'product_serial') IS NULL
    THROW 51000, 'Expected dbo.products.product_serial was not found.', 1;

BEGIN TRY
    BEGIN TRANSACTION;
    IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.products') AND name = N'IX_products_product_serial'
    )
        DROP INDEX IX_products_product_serial ON dbo.products;
    IF OBJECT_ID(N'dbo.CK_products_product_serial', N'C') IS NOT NULL
        ALTER TABLE dbo.products DROP CONSTRAINT CK_products_product_serial;

    ALTER TABLE dbo.products ALTER COLUMN product_serial VARCHAR(100) NOT NULL;
    ALTER TABLE dbo.products WITH CHECK ADD CONSTRAINT CK_products_product_serial CHECK
        (DATALENGTH(product_serial) BETWEEN 1 AND 100
         AND product_serial COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9]%');
    CREATE UNIQUE INDEX IX_products_product_serial ON dbo.products(product_serial);
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
