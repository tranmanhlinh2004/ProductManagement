CREATE DATABASE QLSP;
GO

USE QLSP;
GO


CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name NVARCHAR(100),
    email VARCHAR(100),
    role VARCHAR(10) NOT NULL
        CHECK (role IN ('ADMIN', 'STAFF')),
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE()
);
GO

CREATE TABLE categories (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL UNIQUE,
    description NVARCHAR(500),
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE()
);
GO

CREATE TABLE products (
    id INT IDENTITY(1,1) PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    name NVARCHAR(200) NOT NULL,
    category_id INT NOT NULL,
    unit NVARCHAR(30) NOT NULL DEFAULT N'Cái',
    import_price DECIMAL(18,2) NOT NULL DEFAULT 0,
    sale_price DECIMAL(18,2) NOT NULL DEFAULT 0,
    product_serial VARCHAR(8) NOT NULL
        CONSTRAINT DF_products_product_serial DEFAULT
        (RIGHT('00000000' + CONVERT(VARCHAR(8), CONVERT(BIGINT, CRYPT_GEN_RANDOM(4)) % 100000000), 8)),
    [type] VARCHAR(10) NOT NULL CONSTRAINT DF_products_type DEFAULT 'QR-code',
    min_stock INT NOT NULL DEFAULT 0,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME,

    FOREIGN KEY (category_id) REFERENCES categories(id),

    CHECK (import_price >= 0),
    CHECK (sale_price >= 0),
    CHECK (min_stock >= 0),
    CONSTRAINT CK_products_type CHECK (DATALENGTH([type]) = 7 AND [type] COLLATE Latin1_General_100_BIN2 IN ('barcode', 'QR-code')),
    CONSTRAINT CK_products_product_serial CHECK
        (DATALENGTH(product_serial) = 8 AND product_serial COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9]%')
);
GO

CREATE TABLE inventory (
    id INT IDENTITY(1,1) PRIMARY KEY,
    product_id INT NOT NULL UNIQUE,
    quantity INT NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT GETDATE(),

    FOREIGN KEY (product_id) REFERENCES products(id),

    CHECK (quantity >= 0)
);
GO

CREATE TABLE stock_transactions (
    id INT IDENTITY(1,1) PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    kind VARCHAR(12) NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    created_by INT NOT NULL,
    confirmed_by INT,
    created_at DATETIME DEFAULT GETDATE(),
    confirmed_at DATETIME,
    note NVARCHAR(500),

    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (confirmed_by) REFERENCES users(id),

    CHECK (kind IN ('IN', 'OUT', 'ADJUST_IN', 'ADJUST_OUT')),
    CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED'))
);
GO

CREATE TABLE transaction_details (
    id INT IDENTITY(1,1) PRIMARY KEY,
    transaction_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,

    FOREIGN KEY (transaction_id) REFERENCES stock_transactions(id),
    FOREIGN KEY (product_id) REFERENCES products(id),

    UNIQUE (transaction_id, product_id),

    CHECK (quantity > 0),
    CHECK (unit_price >= 0)
);
GO

CREATE TABLE stocktakes (
    id INT IDENTITY(1,1) PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    status VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    created_by INT NOT NULL,
    started_at DATETIME DEFAULT GETDATE(),
    closed_at DATETIME,

    FOREIGN KEY (created_by) REFERENCES users(id),

    CHECK (status IN ('DRAFT', 'COUNTING', 'COMPLETED'))
);
GO

CREATE TABLE stocktake_details (
    id INT IDENTITY(1,1) PRIMARY KEY,
    stocktake_id INT NOT NULL,
    product_id INT NOT NULL,
    system_qty INT NOT NULL DEFAULT 0,
    counted_qty INT,
    diff_qty AS (counted_qty - system_qty),

    FOREIGN KEY (stocktake_id) REFERENCES stocktakes(id),
    FOREIGN KEY (product_id) REFERENCES products(id),

    UNIQUE (stocktake_id, product_id),

    CHECK (system_qty >= 0),
    CHECK (counted_qty >= 0)
);
GO

CREATE TABLE activity_logs (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    user_id INT,
    action VARCHAR(50) NOT NULL,
    object_type VARCHAR(50) NOT NULL,
    object_id INT,
    result VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
    created_at DATETIME DEFAULT GETDATE(),
    meta NVARCHAR(MAX),

    FOREIGN KEY (user_id) REFERENCES users(id),

    CHECK (result IN ('SUCCESS', 'FAILED'))
);
GO

CREATE UNIQUE INDEX IX_products_product_serial
ON products(product_serial);
GO

CREATE INDEX IX_products_category
ON products(category_id);
GO

CREATE INDEX IX_transactions_status
ON stock_transactions(status);
GO

CREATE INDEX IX_transaction_details_product
ON transaction_details(product_id);
GO

CREATE INDEX IX_stocktake_details_product
ON stocktake_details(product_id);
GO

CREATE INDEX IX_activity_logs_date
ON activity_logs(created_at);
GO


