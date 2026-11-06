"""Tests for OpenCV barcode and QR code scanner service and API endpoints."""

import base64
from io import BytesIO
import unittest
from unittest.mock import MagicMock, patch

from app import create_app
from app.services import barcode_service, scanner_service


class ScannerServiceTests(unittest.TestCase):
    def test_decode_qr_preserves_vietnamese_content(self):
        import qrcode

        code = "https://example.test/sản-phẩm?id=01&x=+"
        image = BytesIO()
        qrcode.make(code).save(image, format="PNG")
        decoded = scanner_service.decode_image(image.getvalue())
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded["code"], code)

    def test_decode_qr_image(self):
        """Verify OpenCV + pyzbar can decode a generated QR-code image."""
        serial = "59324987"
        png_data = barcode_service.generate_png(serial, "QR-code")
        decoded = scanner_service.decode_image(png_data)
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded["code"], serial)
        self.assertEqual(decoded["type"], "QR-code")

    def test_decode_barcode_image(self):
        """Verify OpenCV + pyzbar can decode a generated Code128 barcode image."""
        serial = "00123456"
        png_data = barcode_service.generate_png(serial, "barcode")
        decoded = scanner_service.decode_image(png_data)
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded["code"], serial)
        self.assertEqual(decoded["type"], "barcode")

    def test_decode_empty_or_corrupt_data_returns_none(self):
        self.assertIsNone(scanner_service.decode_image(b""))
        self.assertIsNone(scanner_service.decode_image(b"invalid image bytes"))
        self.assertIsNone(scanner_service.decode_image(None))

    def test_decode_base64_data_url(self):
        serial = "12345678"
        png_data = barcode_service.generate_png(serial, "QR-code")
        base64_str = "data:image/png;base64," + base64.b64encode(png_data).decode("ascii")
        decoded = scanner_service.decode_image(base64_str)
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded["code"], serial)


class ScannerApiTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app({"TESTING": True})
        self.client = self.app.test_client()

        self.connection = MagicMock()
        self.cursor = self.connection.cursor.return_value
        self.cursor.description = [
            (col,)
            for col in (
                "id",
                "sku",
                "name",
                "category_id",
                "category",
                "unit",
                "sale_price",
                "product_serial",
                "type",
                "is_active",
                "quantity",
            )
        ]
        self.mock_product = (
            50,
            "SP0050",
            "Thức ăn mèo hạt túi 1kg",
            1,
            "Chăm sóc thú cưng",
            "Túi",
            "105000.00",
            "59324987",
            "QR-code",
            True,
            55,
        )
        self.cursor.fetchone.return_value = self.mock_product

        db_patch = patch(
            "app.repositories.product_repository.get_db",
            return_value=self.connection,
        )
        self.get_db = db_patch.start()
        self.addCleanup(db_patch.stop)

    def test_scan_json_base64_matched_product(self):
        png_data = barcode_service.generate_png("59324987", "QR-code")
        b64_str = base64.b64encode(png_data).decode("ascii")

        response = self.client.post(
            "/api/scanner/scan",
            json={"image": f"data:image/png;base64,{b64_str}"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["found"])
        self.assertTrue(data["matched"])
        self.assertEqual(data["code"], "59324987")
        self.assertEqual(data["product"]["name"], "Thức ăn mèo hạt túi 1kg")
        self.assertEqual(data["product"]["quantity"], 55)

    def test_scan_multipart_file_matched_product(self):
        png_data = barcode_service.generate_png("59324987", "barcode")

        response = self.client.post(
            "/api/scanner/scan",
            data={"image": (BytesIO(png_data), "barcode.png")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["found"])
        self.assertTrue(data["matched"])
        self.assertEqual(data["code"], "59324987")

    def test_scan_unmatched_code_returns_404(self):
        # Database returns None for unknown code
        self.cursor.fetchone.return_value = None
        png_data = barcode_service.generate_png("99999999", "QR-code")

        response = self.client.post(
            "/api/scanner/scan",
            json={"image": base64.b64encode(png_data).decode("ascii")},
        )
        self.assertEqual(response.status_code, 404)
        data = response.get_json()
        self.assertTrue(data["found"])
        self.assertFalse(data["matched"])
        self.assertEqual(data["code"], "99999999")

    def test_lookup_product_success(self):
        response = self.client.post(
            "/api/scanner/lookup",
            json={"code": "59324987"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["found"])
        self.assertEqual(data["product"]["sku"], "SP0050")

    def test_lookup_product_not_found(self):
        self.cursor.fetchone.return_value = None
        response = self.client.post(
            "/api/scanner/lookup",
            json={"code": "NON_EXISTENT_CODE"},
        )
        self.assertEqual(response.status_code, 404)
        data = response.get_json()
        self.assertFalse(data["found"])

    def test_lookup_can_match_an_external_scanned_code(self):
        response = self.client.post("/api/scanner/lookup", json={"code": "8850092300500"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["code"], "8850092300500")
        self.assertIn("p.scanned_code = ?", self.cursor.execute.call_args.args[0])
        self.assertEqual(self.cursor.execute.call_args.args[1:], ("8850092300500",) * 3)

    def test_lookup_empty_code_returns_400(self):
        response = self.client.post(
            "/api/scanner/lookup",
            json={"code": ""},
        )
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()

