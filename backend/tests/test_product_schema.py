"""Opt-in SQL Server integration checks, isolated in disposable databases.

Run with RUN_SQL_SERVER_TESTS=1 using an account allowed to CREATE DATABASE.
Existing application databases are never changed by these tests.
"""

import os
from concurrent.futures import ThreadPoolExecutor
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
                # Flask closes pyodbc connections into its pool; evict those idle
                # sessions only from this test's disposable database before DROP.
                self.cursor.execute(f"ALTER DATABASE [{name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE")
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
        self.assert_application_tables()
        for table in ("categories", "inventory"):
            self.assertEqual(self.cursor.execute(f"SELECT COUNT(*) FROM dbo.{table}").fetchone()[0], 50)
        self.assertEqual(
            [row[0] for row in self.cursor.execute("SELECT sku FROM dbo.products ORDER BY id")],
            [f"SP{number:04d}" for number in range(1, 51)],
        )

        category = self.cursor.execute("SELECT TOP (1) id FROM dbo.categories").fetchone()[0]
        for number in range(100):
            self.cursor.execute(
                "INSERT INTO dbo.products (name, category_id, [type]) VALUES (N'Test', ?, ?)",
                category, "barcode" if number % 2 else "QR-code",
            )
        self.assert_serials(150)

        for value in ("", "1" * 101, "1234567 ", "ABCDEFGH", "1234-678", None):
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

    def assert_application_tables(self):
        self.assertEqual(
            {row[0] for row in self.cursor.execute("SELECT name FROM sys.tables WHERE is_ms_shipped=0")},
            {"categories", "products", "inventory"},
        )

    def test_product_api_generates_sku_and_stock_without_manual_sku(self):
        self.run_script("SQLQuery1.sql")
        category = self.cursor.execute(
            "INSERT INTO dbo.categories (name) OUTPUT INSERTED.id VALUES (N'Test category')"
        ).fetchone()[0]
        app = create_app({"TESTING": True, "DB_NAME": self.database})
        with app.test_client() as client:
            payload = {"name": "Sản phẩm mới", "category_id": category, "quantity": 7}
            response = client.post("/api/products", json=payload)
            self.assertEqual(response.status_code, 201, response.get_json())
            product = response.get_json()
            self.assertEqual(product["quantity"], 7)
            self.assertEqual(product["sku"], "SP0001")
            self.assertRegex(product["product_serial"], r"^[0-9]{8}$")
            self.assertEqual(product["name"], payload["name"])
            self.assertEqual(client.get("/api/products").get_json(), [product])
            second = client.post("/api/products", json=payload)
            self.assertEqual(second.status_code, 201)
            self.assertEqual(second.get_json()["sku"], "SP0002")
            self.assertEqual(client.post("/api/products", json={**payload, "sku": "MANUAL"}).status_code, 400)
            payload.update(category_id=category + 1)
            self.assertEqual(client.post("/api/products", json=payload).status_code, 400)
            self.assertEqual(len(client.get("/api/products").get_json()), 2)
        self.assertEqual(self.cursor.execute("SELECT COUNT(*) FROM dbo.inventory").fetchone()[0], 2)

        # Existing products with no inventory row must still appear with zero stock.
        self.cursor.execute(
            "INSERT INTO dbo.products (sku, name, category_id) VALUES ('NO-STOCK', N'Test', ?)", category
        )
        with app.test_client() as client:
            products = client.get("/api/products").get_json()
            self.assertEqual(products[0]["sku"], "NO-STOCK")
            self.assertEqual(products[0]["quantity"], 0)

    def test_scanned_code_migration_preserves_data_and_supports_create_then_scan(self):
        from io import BytesIO
        import qrcode

        self.run_script("SQLQuery1.sql")
        self.run_script("SQLQuery2.sql")
        # Recreate the preceding schema only in this disposable database.
        self.cursor.execute("DROP INDEX IX_products_scanned_code ON dbo.products")
        self.cursor.execute("ALTER TABLE dbo.products DROP COLUMN scanned_code")
        self.cursor.execute("DROP INDEX IX_products_product_serial ON dbo.products")
        self.cursor.execute("ALTER TABLE dbo.products DROP CONSTRAINT CK_products_product_serial")
        self.cursor.execute("ALTER TABLE dbo.products ALTER COLUMN product_serial VARCHAR(8) NOT NULL")
        self.cursor.execute("ALTER TABLE dbo.products ADD CONSTRAINT CK_products_product_serial CHECK "
                            "(DATALENGTH(product_serial) = 8 AND product_serial NOT LIKE '%[^0-9]%')")
        before = [tuple(row) for row in self.cursor.execute(
            "SELECT p.id, p.sku, p.product_serial, i.quantity FROM dbo.products p "
            "JOIN dbo.inventory i ON i.product_id=p.id ORDER BY p.id"
        )]
        self.run_script("migrations/004_product_scanned_code.sql")
        self.run_script("migrations/004_product_scanned_code.sql")
        self.run_script("migrations/005_scanned_barcode_serial.sql")
        self.run_script("migrations/005_scanned_barcode_serial.sql")
        self.assertEqual(self.cursor.execute("SELECT COL_LENGTH('dbo.products', 'product_serial')").fetchone()[0], 100)
        after = [tuple(row) for row in self.cursor.execute(
            "SELECT p.id, p.sku, p.product_serial, i.quantity FROM dbo.products p "
            "JOIN dbo.inventory i ON i.product_id=p.id ORDER BY p.id"
        )]
        self.assertEqual(before, after)
        category = self.cursor.execute("SELECT TOP (1) id FROM dbo.categories").fetchone()[0]
        app = create_app({"TESTING": True, "DB_NAME": self.database})
        with app.test_client() as client:
            for code in ("0000012345678", "8850092300500", "https://example.test/sản-phẩm?id=01&x=+"):
                with self.subTest(code=code):
                    payload = {"name": "Sản phẩm quét mới", "category_id": category,
                               "quantity": 3, "scanned_code": code}
                    response = client.post("/api/products", json=payload)
                    self.assertEqual(response.status_code, 201, response.get_json())
                    product = response.get_json()
                    self.assertEqual(product["scanned_code"], code)
                    if code.isascii() and code.isdigit():
                        self.assertEqual(product["product_serial"], code)
                        # Newly generated labels must contain the same scanned serial.
                        label = client.get(f"/api/products/{product['id']}/code?type=barcode")
                        self.assertEqual(label.status_code, 200, label.get_json())
                    else:
                        self.assertRegex(product["product_serial"], r"^[0-9]{8}$")
                    found = client.post("/api/scanner/lookup", json={"code": code})
                    self.assertEqual(found.get_json()["product"]["id"], product["id"])
                    image = BytesIO()
                    qrcode.make(code).save(image, format="PNG")
                    scanned = client.post("/api/scanner/scan", data={
                        "image": (BytesIO(image.getvalue()), "external.png")
                    })
                    self.assertEqual(scanned.status_code, 200, scanned.get_json())
                    self.assertEqual(scanned.get_json()["product"]["id"], product["id"])
                    self.assertEqual(client.post("/api/products", json=payload).status_code, 400)

    def test_concurrent_creates_receive_distinct_increasing_skus(self):
        self.run_script("SQLQuery1.sql")
        category = self.cursor.execute(
            "INSERT INTO dbo.categories (name) OUTPUT INSERTED.id VALUES (N'Concurrent category')"
        ).fetchone()[0]
        app = create_app({"TESTING": True, "DB_NAME": self.database})

        def create(number):
            with app.test_client() as client:
                response = client.post("/api/products", json={
                    "name": f"Concurrent {number}", "category_id": category, "quantity": number,
                })
                self.assertEqual(response.status_code, 201, response.get_json())
                return response.get_json()["sku"]

        with ThreadPoolExecutor(max_workers=4) as workers:
            skus = list(workers.map(create, range(8)))
        self.assertEqual(sorted(skus), [f"SP{number:04d}" for number in range(1, 9)])
        self.assertEqual(self.cursor.execute("SELECT COUNT(*) FROM dbo.inventory").fetchone()[0], 8)

    def legacy_unused_tables(self):
        # Representative old FK graph and rows, independent of old schema files.
        self.cursor.execute("""
            ALTER TABLE dbo.products DROP CONSTRAINT DF_products_sku;
            DROP SEQUENCE dbo.product_sku_sequence;
            CREATE TABLE dbo.users (id INT PRIMARY KEY);
            CREATE TABLE dbo.stock_transactions (
                id INT PRIMARY KEY, created_by INT REFERENCES dbo.users(id));
            CREATE TABLE dbo.transaction_details (
                transaction_id INT REFERENCES dbo.stock_transactions(id),
                product_id INT REFERENCES dbo.products(id));
            CREATE TABLE dbo.stocktakes (
                id INT PRIMARY KEY, created_by INT REFERENCES dbo.users(id));
            CREATE TABLE dbo.stocktake_details (
                stocktake_id INT REFERENCES dbo.stocktakes(id),
                product_id INT REFERENCES dbo.products(id));
            CREATE TABLE dbo.activity_logs (user_id INT REFERENCES dbo.users(id));
            CREATE TABLE dbo.product_identifier_migration (product_id INT PRIMARY KEY);
            INSERT INTO dbo.users VALUES (1);
            INSERT INTO dbo.stock_transactions VALUES (1,1);
            INSERT INTO dbo.stocktakes VALUES (1,1);
            INSERT INTO dbo.activity_logs VALUES (1);
            INSERT INTO dbo.transaction_details SELECT 1, MIN(id) FROM dbo.products;
            INSERT INTO dbo.stocktake_details SELECT 1, MIN(id) FROM dbo.products;
            INSERT INTO dbo.product_identifier_migration SELECT id FROM dbo.products;
        """)

    def application_snapshot(self):
        return {table: [tuple(row) for row in self.cursor.execute(f"SELECT * FROM dbo.{table} ORDER BY id")]
                for table in ("categories", "products", "inventory")}

    def test_cleanup_migration_preserves_data_and_never_reuses_deleted_skus(self):
        self.run_script("SQLQuery1.sql")
        self.run_script("SQLQuery2.sql")
        category = self.cursor.execute("SELECT MIN(id) FROM dbo.categories").fetchone()[0]
        self.cursor.execute(
            "INSERT INTO dbo.products (sku,name,category_id,is_active) VALUES ('SP0100',N'Inactive',?,0)",
            category,
        )
        self.cursor.execute(
            "INSERT INTO dbo.products (sku,name,category_id) VALUES ('CUSTOM',N'Custom',?)", category,
        )
        self.legacy_unused_tables()
        before = self.application_snapshot()
        self.run_script("migrations/003_simplify_schema_auto_sku.sql")
        self.assert_application_tables()
        self.assertEqual(self.application_snapshot(), before)
        self.run_script("migrations/003_simplify_schema_auto_sku.sql")
        self.assertEqual(self.application_snapshot(), before)
        row = self.cursor.execute(
            "INSERT INTO dbo.products (name,category_id) OUTPUT INSERTED.id,INSERTED.sku VALUES (N'New',?)",
            category,
        ).fetchone()
        self.assertEqual(row.sku, "SP0101")
        self.cursor.execute("DELETE FROM dbo.products WHERE id=?", row.id)
        self.run_script("migrations/003_simplify_schema_auto_sku.sql")
        next_sku = self.cursor.execute(
            "INSERT INTO dbo.products (name,category_id) OUTPUT INSERTED.sku VALUES (N'Next',?)", category,
        ).fetchone()[0]
        self.assertEqual(next_sku, "SP0102")

    def test_cleanup_migration_rolls_back_on_unexpected_foreign_key(self):
        self.run_script("SQLQuery1.sql")
        self.run_script("SQLQuery2.sql")
        self.legacy_unused_tables()
        self.cursor.execute("CREATE TABLE dbo.external_usage (user_id INT REFERENCES dbo.users(id))")
        before = self.application_snapshot()
        with self.assertRaises(pyodbc.Error):
            self.run_script("migrations/003_simplify_schema_auto_sku.sql")
        self.assertEqual(self.application_snapshot(), before)
        for table in ("users", "activity_logs", "transaction_details", "stock_transactions",
                      "stocktake_details", "stocktakes", "product_identifier_migration"):
            self.assertIsNotNone(self.cursor.execute("SELECT OBJECT_ID(?)", f"dbo.{table}").fetchone()[0])
        self.assertIsNone(self.cursor.execute("SELECT OBJECT_ID('dbo.product_sku_sequence')").fetchone()[0])

    def test_auto_sku_exceeds_four_digits_and_does_not_reuse_rollback_values(self):
        self.run_script("SQLQuery1.sql")
        category = self.cursor.execute(
            "INSERT INTO dbo.categories (name) OUTPUT INSERTED.id VALUES (N'Test category')"
        ).fetchone()[0]
        self.cursor.execute("ALTER SEQUENCE dbo.product_sku_sequence RESTART WITH 9999")
        insert = "INSERT INTO dbo.products (name,category_id) OUTPUT INSERTED.sku VALUES (N'Test',?)"
        self.assertEqual(self.cursor.execute(insert, category).fetchone()[0], "SP9999")
        self.assertEqual(self.cursor.execute(insert, category).fetchone()[0], "SP10000")
        self.cursor.execute("BEGIN TRANSACTION")
        self.assertEqual(self.cursor.execute(insert, category).fetchone()[0], "SP10001")
        self.cursor.execute("ROLLBACK TRANSACTION")
        self.assertEqual(self.cursor.execute(insert, category).fetchone()[0], "SP10002")

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
