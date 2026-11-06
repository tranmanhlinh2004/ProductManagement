-- Add an optional external QR/barcode without changing existing SKUs or serials.
-- Safe to rerun; no existing product or stock data is changed.
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

IF OBJECT_ID(N'dbo.products', N'U') IS NULL
    THROW 51000, 'Expected dbo.products was not found.', 1;

BEGIN TRY
    BEGIN TRANSACTION;
    IF COL_LENGTH(N'dbo.products', N'scanned_code') IS NULL
        ALTER TABLE dbo.products ADD scanned_code NVARCHAR(450) NULL;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.products') AND name = N'IX_products_scanned_code'
    )
        EXEC sys.sp_executesql N'CREATE UNIQUE INDEX IX_products_scanned_code
            ON dbo.products(scanned_code) WHERE scanned_code IS NOT NULL;';
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
