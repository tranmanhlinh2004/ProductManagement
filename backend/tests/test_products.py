"""Exercise the HTTP-to-repository flow without requiring a live SQL Server."""

from decimal import Decimal
import unittest
from unittest.mock import MagicMock, patch

import pyodbc

from app import create_app
from app.config import ConfigurationError
from app.db.connection import DatabaseConnectionError


class ProductApiTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app({"TESTING": True})
        self.client = self.app.test_client()
        self.connection = MagicMock()
        self.cursor = self.connection.cursor.return_value
        database_patch = patch(
            "app.repositories.product_repository.get_db",
            return_value=self.connection,
        )
        self.get_db = database_patch.start()
        self.addCleanup(database_patch.stop)

    def set_rows(self, columns, rows):
        self.cursor.description = [(name,) for name in columns]
        self.cursor.fetchall.return_value = rows

    def test_products_join_categories_and_serialize_database_types(self):
        self.set_rows(
            ["id", "sku", "name", "category_id", "category", "unit", "sale_price",
             "product_serial", "type", "is_active", "quantity"],
            [(7, "SP007", "Sữa tươi", 2, "Đồ uống", "Hộp",
              Decimal("9999999999999999.99"), "00123456", "QR-code", 1, 25)],
        )
        response = self.client.get("/api/products")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        product = response.get_json()[0]
        self.assertEqual(product["name"], "Sữa tươi")
        self.assertEqual(product["category"], "Đồ uống")
        self.assertEqual(product["sale_price"], "9999999999999999.99")
        self.assertIs(product["is_active"], True)
        self.assertEqual(product["product_serial"], "00123456")
        self.assertEqual(product["type"], "QR-code")
        self.assertEqual(product["quantity"], 25)
        query = self.cursor.execute.call_args.args[0]
        self.assertIn("JOIN dbo.categories", query)
        self.assertIn("p.is_active = 1", query)
        self.assertIn("p.product_serial", query)
        self.assertIn("p.[type]", query)
        self.assertIn("LEFT JOIN dbo.inventory", query)
        self.assertIn("COALESCE(i.quantity, 0)", query)
        self.cursor.close.assert_called_once()
        self.connection.commit.assert_not_called()

    def test_categories_come_from_database(self):
        self.set_rows(["id", "name"], [(2, "Đồ uống")])
        response = self.client.get("/api/categories")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), [{"id": 2, "name": "Đồ uống"}])
        query = self.cursor.execute.call_args.args[0]
        self.assertIn("FROM dbo.categories", query)
        self.assertIn("is_active = 1", query)
        self.cursor.close.assert_called_once()

    def test_empty_database_returns_empty_lists(self):
        self.set_rows(["id"], [])
        for path in ("/api/products", "/api/categories"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.get_json(), [])

    def test_refresh_reads_database_again(self):
        self.set_rows(["id", "name"], [])
        self.assertEqual(self.client.get("/api/categories").get_json(), [])
        self.cursor.fetchall.return_value = [(3, "Danh mục mới")]
        self.assertEqual(self.client.get("/api/categories").get_json(), [
            {"id": 3, "name": "Danh mục mới"}
        ])
        self.assertEqual(self.get_db.call_count, 2)

    def test_database_errors_return_safe_json(self):
        for error in (
            DatabaseConnectionError("private-connection-detail"),
            ConfigurationError("private-config-detail"),
            pyodbc.Error("42000", "private-query-detail"),
        ):
            for path in ("/api/products", "/api/categories"):
                with self.subTest(error=type(error).__name__, path=path):
                    self.get_db.side_effect = error
                    with self.assertLogs(self.app.logger, level="ERROR") as logs:
                        response = self.client.get(path)
                    self.assertEqual(response.status_code, 503)
                    self.assertIn("SQL Server", response.get_json()["error"])
                    self.assertNotIn("private-", response.get_data(as_text=True))
                    self.assertNotIn("private-", " ".join(logs.output))

    def test_query_failure_closes_cursor(self):
        self.cursor.execute.side_effect = pyodbc.Error("42000", "query failed")
        with self.assertLogs(self.app.logger, level="ERROR"):
            response = self.client.get("/api/products")
        self.assertEqual(response.status_code, 503)
        self.cursor.close.assert_called_once()

    def test_live_server_can_read_api_on_different_local_ports(self):
        self.set_rows(["id"], [])
        for origin in ("http://127.0.0.1:5500", "http://localhost:5500",
                       "http://127.0.0.1:5501", "http://localhost:5502",
                       "http://[::1]:5500"):
            for path in ("/api/products", "/api/categories"):
                with self.subTest(origin=origin, path=path):
                    response = self.client.get(path, headers={"Origin": origin})
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.headers["Access-Control-Allow-Origin"], origin)
                    self.assertIn("Origin", response.vary)

    def test_live_server_receives_database_error_as_json(self):
        self.get_db.side_effect = DatabaseConnectionError("Unavailable")
        with self.assertLogs(self.app.logger, level="ERROR"):
            response = self.client.get("/api/products", headers={
                "Origin": "http://127.0.0.1:5500"
            })
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.headers["Access-Control-Allow-Origin"],
                         "http://127.0.0.1:5500")
        self.assertIn("error", response.get_json())

    def test_live_server_preflight_does_not_query_database(self):
        response = self.client.options("/api/products", headers={
            "Origin": "http://localhost:5500",
            "Access-Control-Request-Method": "GET",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Access-Control-Allow-Origin"],
                         "http://localhost:5500")
        self.assertIn("GET", response.headers["Access-Control-Allow-Methods"])
        self.get_db.assert_not_called()

    def test_live_server_can_preflight_json_product_creation(self):
        response = self.client.options("/api/products", headers={
            "Origin": "http://127.0.0.1:5501",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn("POST", response.headers["Access-Control-Allow-Methods"])
        self.assertIn("Content-Type", response.headers["Access-Control-Allow-Headers"])
        self.get_db.assert_not_called()

    def created_row(self):
        self.cursor.description = [(column,) for column in (
            "id", "sku", "name", "category_id", "category", "unit", "sale_price",
            "product_serial", "type", "is_active", "quantity",
        )]
        return (99, "SP099", "Sản phẩm mới", 2, "Đồ uống", "Cái", Decimal("0.00"),
                "00123456", "QR-code", 1, 7)

    def post_product(self, **overrides):
        return self.client.post("/api/products", json={
            "sku": "SP099", "name": "Sản phẩm mới", "category_id": 2, "quantity": 7,
            **overrides,
        }, headers={"Origin": "http://localhost:5500"})

    def test_create_saves_product_and_inventory_in_one_transaction(self):
        self.cursor.fetchone.side_effect = [(99,), self.created_row()]
        response = self.post_product()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["quantity"], 7)
        self.assertEqual(response.get_json()["product_serial"], "00123456")
        self.assertEqual(response.get_json()["sale_price"], "0.00")
        calls = self.cursor.execute.call_args_list
        self.assertIn("INSERT INTO dbo.products", calls[0].args[0])
        self.assertIn("c.is_active = 1", calls[0].args[0])
        self.assertEqual(calls[0].args[1:], ("SP099", "Sản phẩm mới", 2))
        self.assertIn("INSERT INTO dbo.inventory", calls[1].args[0])
        self.assertEqual(calls[1].args[1:], (99, 7))
        self.connection.commit.assert_called_once()
        self.connection.rollback.assert_not_called()
        self.cursor.close.assert_called_once()
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], "http://localhost:5500")

    def test_invalid_product_input_never_opens_database(self):
        for overrides in (
            {"sku": ""}, {"sku": "có dấu"}, {"sku": "A B"}, {"sku": "A" * 51},
            {"sku": None}, {"name": "   "}, {"name": "A" * 201}, {"name": 123},
            {"category_id": None}, {"category_id": True}, {"category_id": 0},
            {"category_id": "2"}, {"category_id": 2147483648},
            {"quantity": -1}, {"quantity": 1.5}, {"quantity": True},
            {"quantity": "7"}, {"quantity": 2147483648},
        ):
            with self.subTest(overrides=overrides):
                response = self.post_product(**overrides)
                self.assertEqual(response.status_code, 400)
                self.assertIn("error", response.get_json())
                self.assertEqual(response.headers["Access-Control-Allow-Origin"], "http://localhost:5500")
        for body in ("null", "[]", '"text"', "{invalid"):
            with self.subTest(body=body):
                self.assertEqual(self.client.post("/api/products", data=body,
                    content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post("/api/products", data="text").status_code, 400)
        self.get_db.assert_not_called()

    def test_inactive_category_does_not_create_stock_or_commit(self):
        self.cursor.fetchone.return_value = None
        response = self.post_product()
        self.assertEqual(response.status_code, 400)
        self.assertIn("Danh mục", response.get_json()["error"])
        self.assertEqual(self.cursor.execute.call_count, 1)
        self.connection.commit.assert_not_called()
        self.connection.rollback.assert_called_once()

    def test_duplicate_sku_returns_conflict_without_private_details(self):
        self.cursor.execute.side_effect = [pyodbc.IntegrityError("23000", "private-query (2627)"), None]
        self.cursor.fetchone.return_value = (1,)
        response = self.post_product()
        self.assertEqual(response.status_code, 409)
        self.assertIn("SKU đã tồn tại", response.get_json()["error"])
        self.assertNotIn("private-", response.get_data(as_text=True))
        self.connection.commit.assert_not_called()
        self.connection.rollback.assert_called_once()

    def test_serial_collision_retries_with_new_database_default(self):
        self.cursor.execute.side_effect = [pyodbc.IntegrityError("23000", "serial (2601)"), None, None, None, None]
        self.cursor.fetchone.side_effect = [None, (99,), self.created_row()]
        response = self.post_product()
        self.assertEqual(response.status_code, 201)
        self.connection.rollback.assert_called_once()
        self.connection.commit.assert_called_once()
        inserts = [call for call in self.cursor.execute.call_args_list
                   if "INSERT INTO dbo.products" in call.args[0]]
        self.assertEqual(len(inserts), 2)

    def test_failed_inventory_insert_rolls_back_product(self):
        self.cursor.fetchone.return_value = (99,)
        self.cursor.execute.side_effect = [None, pyodbc.Error("42000", "private-inventory-error")]
        with self.assertLogs(self.app.logger, level="ERROR"):
            response = self.post_product()
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private-", response.get_data(as_text=True))
        self.connection.commit.assert_not_called()
        self.connection.rollback.assert_called_once()
        self.cursor.close.assert_called_once()

    def test_other_origins_do_not_receive_cors_permission(self):
        self.set_rows(["id"], [])
        for origin in (None, "null", "https://example.com", "http://localhost.evil:5500",
                       "http://127.0.0.1.evil:5500", "http://localhost:5500/path"):
            with self.subTest(origin=origin):
                response = self.client.get("/api/products", headers=(
                    {"Origin": origin} if origin else {}
                ))
                self.assertEqual(response.status_code, 200)
                self.assertNotIn("Access-Control-Allow-Origin", response.headers)

    def test_flask_serves_frontend_and_assets_without_database(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/sources/products.html")
        for path in ("/sources/index.html", "/sources/products.html",
                     "/sources/barcode.html", "/sources/scanner.html",
                     "/assets/js/products.js", "/assets/css/style.css"):
            with self.subTest(path=path):
                with self.client.get(path) as page:
                    self.assertEqual(page.status_code, 200)
        self.get_db.assert_not_called()


if __name__ == "__main__":
    unittest.main()
