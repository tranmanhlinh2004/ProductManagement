-- Existing QLSP database only; run 001_rename_database.sql first.
-- Safe to rerun: valid serials and the original mapping are preserved.
USE QLSP;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET LOCK_TIMEOUT 5000;

IF DB_NAME() <> N'QLSP'
    THROW 51000, 'Run this migration in QLSP.', 1;
IF OBJECT_ID(N'dbo.products', N'U') IS NULL
    THROW 51000, 'dbo.products does not exist.', 1;

BEGIN TRY
    BEGIN TRANSACTION;

    -- Block concurrent writes until all serials and constraints are in place.
    DECLARE @ProductCount BIGINT;
    SELECT @ProductCount = COUNT_BIG(*) FROM dbo.products WITH (TABLOCKX, HOLDLOCK);
    IF @ProductCount >= 100000000
        THROW 51000, 'The eight-digit serial space is exhausted.', 1;

    -- The old filtered index prevents SQL Server from renaming barcode_value.
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.products') AND name = N'IX_products_barcode')
        DROP INDEX IX_products_barcode ON dbo.products;

    -- Replace identifier defaults/checks; keep price/stock checks untouched.
    DECLARE @DropConstraints NVARCHAR(MAX) = N'';
    SELECT @DropConstraints = @DropConstraints
        + N'ALTER TABLE dbo.products DROP CONSTRAINT ' + QUOTENAME(d.name) + N';'
    FROM sys.default_constraints AS d
    JOIN sys.columns AS c ON c.object_id = d.parent_object_id AND c.column_id = d.parent_column_id
    WHERE d.parent_object_id = OBJECT_ID(N'dbo.products')
      AND c.name IN (N'barcode_value', N'barcode_type', N'product_serial', N'type');

    SELECT @DropConstraints = @DropConstraints
        + N'ALTER TABLE dbo.products DROP CONSTRAINT ' + QUOTENAME(c.name) + N';'
    FROM sys.check_constraints AS c
    WHERE c.parent_object_id = OBJECT_ID(N'dbo.products')
      AND (c.name IN (N'CK_products_type', N'CK_products_product_serial')
           OR c.definition LIKE N'%barcode_type%'
           OR c.definition LIKE N'%barcode_value%'
           OR EXISTS (
               SELECT 1 FROM sys.sql_expression_dependencies AS d
               JOIN sys.columns AS col ON col.object_id = d.referenced_id
                   AND col.column_id = d.referenced_minor_id
               WHERE d.referencing_id = c.object_id
                 AND col.object_id = OBJECT_ID(N'dbo.products')
                 AND col.name IN (N'barcode_type', N'barcode_value', N'type', N'product_serial')
           ));
    EXEC sys.sp_executesql @DropConstraints;

    IF COL_LENGTH(N'dbo.products', N'barcode_value') IS NOT NULL
        EXEC sys.sp_rename N'dbo.products.barcode_value', N'product_serial', N'COLUMN';
    IF COL_LENGTH(N'dbo.products', N'barcode_type') IS NOT NULL
        EXEC sys.sp_rename N'dbo.products.barcode_type', N'type', N'COLUMN';

    IF COL_LENGTH(N'dbo.products', N'product_serial') IS NULL
       OR COL_LENGTH(N'dbo.products', N'type') IS NULL
        THROW 51000, 'Expected product identifier columns were not found.', 1;

    IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.products') AND name = N'IX_products_product_serial')
        DROP INDEX IX_products_product_serial ON dbo.products;

    -- Compile after sp_rename so that SQL Server resolves the new column names.
    EXEC sys.sp_executesql N'
        IF EXISTS (SELECT 1 FROM dbo.products WHERE [type] NOT IN
            (''QR'', ''QR-code'', ''barcode'', ''CODE128'', ''EAN13'', ''EAN8'', ''UPC_A'') OR [type] IS NULL)
            THROW 51000, ''An unsupported identifier type exists; migration was rolled back.'', 1;

        IF OBJECT_ID(N''dbo.product_identifier_migration'', N''U'') IS NULL
            CREATE TABLE dbo.product_identifier_migration (
                product_id INT NOT NULL PRIMARY KEY,
                previous_value VARCHAR(100) NULL,
                previous_type VARCHAR(10) NOT NULL,
                product_serial VARCHAR(8) NULL,
                migrated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
            );

        INSERT INTO dbo.product_identifier_migration (product_id, previous_value, previous_type)
        SELECT p.id, p.product_serial, p.[type] FROM dbo.products AS p
        WHERE NOT EXISTS (SELECT 1 FROM dbo.product_identifier_migration AS m WHERE m.product_id = p.id);

        UPDATE dbo.products
        SET [type] = CASE WHEN [type] IN (''QR'', ''QR-code'') THEN ''QR-code'' ELSE ''barcode'' END;

        DECLARE @Id INT, @Serial VARCHAR(8);
        DECLARE serials CURSOR LOCAL FAST_FORWARD FOR
            SELECT p.id FROM dbo.products AS p
            WHERE p.product_serial IS NULL OR DATALENGTH(p.product_serial) <> 8
               OR p.product_serial COLLATE Latin1_General_100_BIN2 LIKE ''%[^0-9]%''
               OR EXISTS (SELECT 1 FROM dbo.products AS earlier
                          WHERE earlier.product_serial = p.product_serial AND earlier.id < p.id)
            ORDER BY p.id;
        OPEN serials;
        FETCH NEXT FROM serials INTO @Id;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            SET @Serial = NULL;
            WHILE @Serial IS NULL
            BEGIN
                SET @Serial = RIGHT(''00000000'' + CONVERT(VARCHAR(8), CONVERT(BIGINT, CRYPT_GEN_RANDOM(4)) % 100000000), 8);
                IF EXISTS (SELECT 1 FROM dbo.products WHERE product_serial = @Serial)
                    SET @Serial = NULL;
            END;
            UPDATE dbo.products SET product_serial = @Serial WHERE id = @Id;
            FETCH NEXT FROM serials INTO @Id;
        END;
        CLOSE serials;
        DEALLOCATE serials;

        UPDATE m SET product_serial = p.product_serial
        FROM dbo.product_identifier_migration AS m JOIN dbo.products AS p ON p.id = m.product_id
        WHERE m.product_serial IS NULL;

        ALTER TABLE dbo.products ALTER COLUMN product_serial VARCHAR(8) NOT NULL;
        ALTER TABLE dbo.products ALTER COLUMN [type] VARCHAR(10) NOT NULL;
        ALTER TABLE dbo.products ADD CONSTRAINT DF_products_product_serial DEFAULT
            (RIGHT(''00000000'' + CONVERT(VARCHAR(8), CONVERT(BIGINT, CRYPT_GEN_RANDOM(4)) % 100000000), 8)) FOR product_serial;
        ALTER TABLE dbo.products ADD CONSTRAINT DF_products_type DEFAULT ''QR-code'' FOR [type];
        ALTER TABLE dbo.products WITH CHECK ADD CONSTRAINT CK_products_product_serial CHECK
            (DATALENGTH(product_serial) = 8 AND product_serial COLLATE Latin1_General_100_BIN2 NOT LIKE ''%[^0-9]%'');
        ALTER TABLE dbo.products WITH CHECK ADD CONSTRAINT CK_products_type CHECK
            (DATALENGTH([type]) = 7 AND [type] COLLATE Latin1_General_100_BIN2 IN (''barcode'', ''QR-code''));
        CREATE UNIQUE INDEX IX_products_product_serial ON dbo.products(product_serial);
    ';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
