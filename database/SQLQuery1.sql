CREATE DATABASE QLSP;
GO

USE QLSP;
GO

-- Atomic allocation across concurrent inserts. Rollbacks/retries can leave gaps.
CREATE SEQUENCE dbo.product_sku_sequence AS BIGINT
    START WITH 1 INCREMENT BY 1 MINVALUE 1 NO CYCLE NO CACHE;
GO

CREATE TABLE dbo.categories (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL UNIQUE,
    description NVARCHAR(500),
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE()
);
GO

CREATE TABLE dbo.products (
    id INT IDENTITY(1,1) PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE
        CONSTRAINT DF_products_sku DEFAULT
        ('SP' + FORMAT(NEXT VALUE FOR dbo.product_sku_sequence, '0000', 'en-US')),
    name NVARCHAR(200) NOT NULL,
    category_id INT NOT NULL,
    unit NVARCHAR(30) NOT NULL DEFAULT N'Cái',
    import_price DECIMAL(18,2) NOT NULL DEFAULT 0,
    sale_price DECIMAL(18,2) NOT NULL DEFAULT 0,
    product_serial VARCHAR(100) NOT NULL
        CONSTRAINT DF_products_product_serial DEFAULT
        (RIGHT('00000000' + CONVERT(VARCHAR(8), CONVERT(BIGINT, CRYPT_GEN_RANDOM(4)) % 100000000), 8)),
    [type] VARCHAR(10) NOT NULL CONSTRAINT DF_products_type DEFAULT 'QR-code',
    scanned_code NVARCHAR(450) NULL,
    min_stock INT NOT NULL DEFAULT 0,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME,

    FOREIGN KEY (category_id) REFERENCES dbo.categories(id),
    CHECK (import_price >= 0),
    CHECK (sale_price >= 0),
    CHECK (min_stock >= 0),
    CONSTRAINT CK_products_type CHECK (DATALENGTH([type]) = 7 AND [type] COLLATE Latin1_General_100_BIN2 IN ('barcode', 'QR-code')),
    CONSTRAINT CK_products_product_serial CHECK
        (DATALENGTH(product_serial) BETWEEN 1 AND 100 AND product_serial COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9]%')
);
GO

CREATE TABLE dbo.inventory (
    id INT IDENTITY(1,1) PRIMARY KEY,
    product_id INT NOT NULL UNIQUE,
    quantity INT NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (product_id) REFERENCES dbo.products(id),
    CHECK (quantity >= 0)
);
GO

CREATE UNIQUE INDEX IX_products_product_serial ON dbo.products(product_serial);
CREATE UNIQUE INDEX IX_products_scanned_code ON dbo.products(scanned_code) WHERE scanned_code IS NOT NULL;
CREATE INDEX IX_products_category ON dbo.products(category_id);
GO
