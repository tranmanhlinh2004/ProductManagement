-- Run before 002_product_serial.sql. Existing connections must release the DB.
-- No connection is forcibly disconnected and no database is overwritten.
USE master;
SET LOCK_TIMEOUT 5000;

IF DB_ID(N'QLSP_Barcode') IS NOT NULL AND DB_ID(N'QLSP') IS NOT NULL
    THROW 51000, 'Both QLSP_Barcode and QLSP exist. Resolve the name conflict first.', 1;

IF DB_ID(N'QLSP_Barcode') IS NOT NULL
    ALTER DATABASE QLSP_Barcode MODIFY NAME = QLSP;

IF DB_ID(N'QLSP') IS NULL
    THROW 51000, 'Neither QLSP_Barcode nor QLSP exists.', 1;
