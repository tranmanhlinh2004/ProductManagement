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
             "product_serial", "type", "is_active"],
            [(7, "SP007", "Sữa tươi", 2, "Đồ uống", "Hộp",
              Decimal("9999999999999999.99"), "00123456", "QR-code", 1)],
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
        query = self.cursor.execute.call_args.args[0]
        self.assertIn("JOIN dbo.categories", query)
        self.assertIn("p.is_active = 1", query)
        self.assertIn("p.product_serial", query)
        self.assertIn("p.[type]", query)
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
