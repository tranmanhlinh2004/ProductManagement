"""Opt-in SQL Server integration checks, isolated in disposable databases.

Run with RUN_SQL_SERVER_TESTS=1 using an account allowed to CREATE DATABASE.
Existing application databases are never changed by these tests.
"""

import os
from pathlib import Path
import re
import unittest
import uuid

import pyodbc

from app import create_app
from app.db.connection import build_connection_string


DATABASE_DIR = Path(__file__).resolve().parents[2] / "database"


@unittest.skipUnless(os.getenv("RUN_SQL_SERVER_TESTS") == "1", "opt-in live SQL Server tests")
class ProductSchemaTests(unittest.TestCase):
    def setUp(self):
        self.database = "QLSP_Test_" + uuid.uuid4().hex
        config = dict(create_app().config)
        config["DB_NAME"] = "master"
        self.connection = pyodbc.connect(build_connection_string(config), autocommit=True, timeout=5)
        self.connection.timeout = 15
        self.cursor = self.connection.cursor()
        self.addCleanup(self.cleanup_database)

    def cleanup_database(self):
        self.cursor.execute("IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION")
        self.cursor.execute("USE master")
        # Names come exclusively from the random per-test identifier above.
        for name in (self.database, self.database + "_Barcode"):
            if self.cursor.execute("SELECT DB_ID(?)", name).fetchone()[0] is not None:
                self.cursor.execute(f"DROP DATABASE [{name}]")
        self.cursor.close()
        self.connection.close()

    def run_script(self, name):
        sql = (DATABASE_DIR / name).read_text(encoding="utf-8").replace("QLSP", self.database)
        for batch in re.split(r"^\s*GO\s*$", sql, flags=re.MULTILINE | re.IGNORECASE):
            if batch.strip():
                self.cursor.execute(batch)
                while self.cursor.nextset():
                    pass

    def assert_serials(self, expected_count):
        rows = self.cursor.execute("SELECT product_serial, [type] FROM dbo.products").fetchall()
        self.assertEqual(len(rows), expected_count)
        self.assertEqual(len({row.product_serial for row in rows}), expected_count)
        for row in rows:
            self.assertRegex(row.product_serial, r"^[0-9]{8}$")
            self.assertIn(row.type, ("barcode", "QR-code"))

    def test_new_schema_seed_defaults_and_constraints(self):
        self.run_script("SQLQuery1.sql")
        self.run_script("SQLQuery2.sql")
        self.assert_serials(50)
        for table in ("categories", "inventory", "stock_transactions", "transaction_details",
                      "stocktakes", "stocktake_details", "activity_logs"):
            self.assertEqual(self.cursor.execute(f"SELECT COUNT(*) FROM dbo.{table}").fetchone()[0], 50)

        category = self.cursor.execute("SELECT TOP (1) id FROM dbo.categories").fetchone()[0]
        for number in range(100):
            self.cursor.execute(
                "INSERT INTO dbo.products (sku, name, category_id, [type]) VALUES (?, N'Test', ?, ?)",
                f"TEST-{number}", category, "barcode" if number % 2 else "QR-code",
            )
        self.assert_serials(150)

        for value in ("1234567", "1234567 ", "ABCDEFGH", "1234-678", None):
            with self.subTest(serial=value):
                with self.assertRaises(pyodbc.Error):
                    self.cursor.execute(
                        "INSERT INTO dbo.products (sku, name, category_id, product_serial) VALUES ('BAD', N'Test', ?, ?)",
                        category, value,
                    )
        for kind in ("QR", "CODE128", "BARCODE", "qr-code", "QR-code ", "", None):
            with self.subTest(kind=kind):
                with self.assertRaises(pyodbc.Error):
                    self.cursor.execute(
                        "INSERT INTO dbo.products (sku, name, category_id, [type]) VALUES ('BAD', N'Test', ?, ?)",
                        category, kind,
                    )
        serial = self.cursor.execute("SELECT TOP (1) product_serial FROM dbo.products").fetchone()[0]
        with self.assertRaises(pyodbc.IntegrityError):
            self.cursor.execute(
                "INSERT INTO dbo.products (sku, name, category_id, product_serial) VALUES ('DUP', N'Test', ?, ?)",
                category, serial,
            )

    def test_legacy_migration_keeps_relations_and_is_repeatable(self):
        self.cursor.execute(f"CREATE DATABASE [{self.database}_Barcode]")
        self.cursor.execute(f"USE [{self.database}_Barcode]")
        self.cursor.execute("""
            CREATE TABLE dbo.products (
                id INT IDENTITY PRIMARY KEY,
                barcode_value VARCHAR(100),
                barcode_type VARCHAR(10) NOT NULL DEFAULT 'QR',
                CHECK (barcode_type IN ('QR', 'CODE128', 'EAN8', 'EAN13', 'UPC_A'))
            );
            CREATE UNIQUE INDEX IX_products_barcode ON dbo.products(barcode_value) WHERE barcode_value IS NOT NULL;
            CREATE TABLE dbo.inventory (product_id INT REFERENCES dbo.products(id), quantity INT);
            INSERT INTO dbo.products (barcode_value, barcode_type) VALUES
                ('00123456', 'QR'), ('QLSP-0002', 'CODE128'), (NULL, 'EAN8'),
                ('8931234567890', 'EAN13'), ('1234567 ', 'UPC_A');
            INSERT INTO dbo.inventory VALUES (1, 17), (2, 42);
        """)
        self.cursor.execute("USE master")
        self.run_script("migrations/001_rename_database.sql")
        self.run_script("migrations/001_rename_database.sql")
        self.cursor.execute(f"USE [{self.database}]")
        self.cursor.execute("ALTER TABLE dbo.products NOCHECK CONSTRAINT ALL")
        self.cursor.execute("UPDATE dbo.products SET barcode_type='OTHER' WHERE id=2")
        with self.assertRaises(pyodbc.Error):
            self.run_script("migrations/002_product_serial.sql")
        # Failed data validation must restore even DDL and indexes.
        self.assertEqual(self.cursor.execute("SELECT COL_LENGTH('dbo.products', 'barcode_value')").fetchone()[0], 100)
        self.assertIsNone(self.cursor.execute("SELECT COL_LENGTH('dbo.products', 'product_serial')").fetchone()[0])
        self.assertEqual(self.cursor.execute("SELECT COUNT(*) FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.products') AND name='IX_products_barcode'").fetchone()[0], 1)
        self.assertIsNone(self.cursor.execute("SELECT OBJECT_ID('dbo.product_identifier_migration')").fetchone()[0])
        self.cursor.execute("UPDATE dbo.products SET barcode_type='CODE128' WHERE id=2")
        self.cursor.execute("ALTER TABLE dbo.products WITH CHECK CHECK CONSTRAINT ALL")
        self.run_script("migrations/002_product_serial.sql")
        self.assert_serials(5)
        self.assertEqual(self.cursor.execute("SELECT product_serial FROM dbo.products WHERE id=1").fetchone()[0], "00123456")
        self.assertEqual([tuple(row) for row in self.cursor.execute("SELECT * FROM dbo.inventory ORDER BY product_id")], [(1, 17), (2, 42)])
        before = [tuple(row) for row in self.cursor.execute("SELECT * FROM dbo.products ORDER BY id")]
        mapping = [tuple(row) for row in self.cursor.execute("SELECT * FROM dbo.product_identifier_migration ORDER BY product_id")]
        self.run_script("migrations/002_product_serial.sql")
        self.assertEqual([tuple(row) for row in self.cursor.execute("SELECT * FROM dbo.products ORDER BY id")], before)
        self.assertEqual([tuple(row) for row in self.cursor.execute("SELECT * FROM dbo.product_identifier_migration ORDER BY product_id")], mapping)
        self.cursor.execute("INSERT INTO dbo.products DEFAULT VALUES")
        self.assert_serials(6)


if __name__ == "__main__":
    unittest.main()
