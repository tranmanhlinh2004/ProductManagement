"""Verify product-to-label mapping and decode the generated PNG images."""

from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import MagicMock, patch

from PIL import Image
import pyodbc

from app import create_app
from app.errors import InvalidProductError
from app.services.barcode_service import generate_png

try:
    from pyzbar.pyzbar import decode
except (ImportError, OSError):
    decode = None


class BarcodeGenerationTests(unittest.TestCase):
    @unittest.skipUnless(decode, 'ZBar decoder unavailable')
    def test_both_formats_decode_to_the_exact_serial(self):
        for serial in ('00123456', '00000000', '99999999', '99001234', '00991234',
                       '000001234567', '8850092300500', '0000012345678', '00123456789012'):
            for code_type, symbol_type in (('QR-code', 'QRCODE'), ('barcode', 'CODE128')):
                with self.subTest(serial=serial, code_type=code_type):
                    image = Image.open(BytesIO(generate_png(serial, code_type)))
                    self.assertEqual(image.format, 'PNG')
                    symbols = decode(image)
                    self.assertEqual([(symbol.type, symbol.data.decode('ascii')) for symbol in symbols],
                                     [(symbol_type, serial)])

    def test_invalid_serials_and_types_are_rejected(self):
        for serial in ('', '1' * 101, '1234567 ', 'abcdefgh', '１２３４５６７８', None, 12345678):
            for code_type in ('QR-code', 'barcode'):
                with self.subTest(serial=serial, code_type=code_type):
                    with self.assertRaises(InvalidProductError):
                        generate_png(serial, code_type)
        with self.assertRaises(InvalidProductError):
            generate_png('00123456', 'EAN8')


class ProductCodeApiTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app({'TESTING': True})
        output = TemporaryDirectory()
        self.addCleanup(output.cleanup)
        self.image_directory = Path(output.name) / 'img'
        self.app.config['PRODUCT_IMAGE_DIR'] = self.image_directory
        self.client = self.app.test_client()
        self.connection = MagicMock()
        self.cursor = self.connection.cursor.return_value
        self.cursor.description = [(column,) for column in ('id', 'sku', 'name', 'product_serial', 'type')]
        self.cursor.fetchone.return_value = (7, 'SP007', 'Sữa tươi', '00123456', 'barcode')
        database_patch = patch('app.repositories.product_repository.get_db', return_value=self.connection)
        self.get_db = database_patch.start()
        self.addCleanup(database_patch.stop)

    def test_default_code_uses_product_type_and_serial_from_database(self):
        with self.client.get('/api/products/7/code', headers={'Origin': 'http://127.0.0.1:5501'}) as response:
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.mimetype, 'image/png')
            self.assertTrue(response.data.startswith(b'\x89PNG\r\n\x1a\n'))
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'http://127.0.0.1:5501')
            self.assertIn('inline;', response.headers['Content-Disposition'])
            self.assertIn('product-7-00123456-barcode.png', response.headers['Content-Disposition'])
            if decode:
                symbols = decode(Image.open(BytesIO(response.data)))
                self.assertEqual([(symbol.type, symbol.data) for symbol in symbols], [('CODE128', b'00123456')])
        query, product_id = self.cursor.execute.call_args.args
        self.assertIn('WHERE id = ? AND is_active = 1', query)
        self.assertEqual(product_id, 7)
        self.connection.commit.assert_not_called()
        self.cursor.close.assert_called_once()

    def test_each_product_can_download_either_format_without_changing_type(self):
        for code_type, suffix, symbol_type in (('QR-code', 'qr', 'QRCODE'), ('barcode', 'barcode', 'CODE128')):
            with self.subTest(code_type=code_type):
                with self.client.get(f'/api/products/7/code?type={code_type}&download=1') as response:
                    self.assertEqual(response.status_code, 200)
                    self.assertIn('attachment;', response.headers['Content-Disposition'])
                    self.assertIn(f'product-7-00123456-{suffix}.png', response.headers['Content-Disposition'])
                    if decode:
                        symbols = decode(Image.open(BytesIO(response.data)))
                        self.assertEqual([(symbol.type, symbol.data) for symbol in symbols], [(symbol_type, b'00123456')])
        self.assertTrue(all('UPDATE' not in call.args[0] for call in self.cursor.execute.call_args_list))
        self.connection.commit.assert_not_called()

    def test_unknown_or_inactive_product_returns_json_not_an_image(self):
        self.cursor.fetchone.return_value = None
        response = self.client.get('/api/products/999/code')
        self.assertEqual(response.status_code, 404)
        self.assertIn('Không tìm thấy', response.get_json()['error'])

    def test_invalid_type_does_not_query_database(self):
        for code_type in ('', 'qr', 'EAN8', 'QR-code.png'):
            with self.subTest(code_type=code_type):
                response = self.client.get('/api/products/7/code', query_string={'type': code_type})
                self.assertEqual(response.status_code, 400)
                self.assertIn('Loại mã', response.get_json()['error'])
        self.get_db.assert_not_called()

    def test_invalid_database_serial_returns_useful_error(self):
        self.cursor.fetchone.return_value = (7, 'SP007', 'Sữa tươi', 'ABC', 'QR-code')
        response = self.client.get('/api/products/7/code')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Serial', response.get_json()['error'])

    def test_database_failure_has_safe_json_and_live_server_cors(self):
        self.get_db.side_effect = pyodbc.Error('42000', 'private-query-detail')
        with self.assertLogs(self.app.logger, level='ERROR'):
            response = self.client.get('/api/products/7/code', headers={'Origin': 'http://localhost:5500'})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'http://localhost:5500')
        self.assertIn('SQL Server', response.get_json()['error'])
        self.assertNotIn('private-', response.get_data(as_text=True))

    def test_save_writes_both_formats_in_their_img_subfolders(self):
        for code_type, folder, suffix, symbol_type in (
            ('QR-code', 'QR', 'qr', 'QRCODE'), ('barcode', 'Barcode', 'barcode', 'CODE128')
        ):
            with self.subTest(code_type=code_type):
                response = self.client.post('/api/products/7/code', json={'type': code_type},
                                            headers={'Origin': 'http://localhost:5500'})
                self.assertEqual(response.status_code, 200)
                filename = f'product-7-00123456-{suffix}.png'
                self.assertEqual(response.get_json()['filename'], filename)
                self.assertEqual(response.get_json()['path'], f'img/{folder}/{filename}')
                destination = self.image_directory / folder / filename
                self.assertTrue(destination.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'))
                if decode:
                    with Image.open(destination) as image:
                        symbols = decode(image)
                        self.assertEqual([(symbol.type, symbol.data) for symbol in symbols], [(symbol_type, b'00123456')])
                self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'http://localhost:5500')
                # Repeated saves update the same filename, without duplicate files.
                self.assertEqual(self.client.post('/api/products/7/code', json={'type': code_type}).status_code, 200)
                self.assertEqual([file.name for file in destination.parent.iterdir()], [filename])

    def test_save_defaults_to_database_type_and_rejects_invalid_input(self):
        for body in ('null', '[]', '{invalid'):
            self.assertEqual(self.client.post('/api/products/7/code', data=body,
                                             content_type='application/json').status_code, 400)
        self.assertEqual(self.client.post('/api/products/7/code', data='text').status_code, 400)
        self.assertEqual(self.client.post('/api/products/7/code', json={'type': '../QR'}).status_code, 400)
        self.assertFalse(self.image_directory.exists())
        self.get_db.assert_not_called()
        response = self.client.post('/api/products/7/code', json={})
        self.assertEqual(response.status_code, 200)
        self.assertTrue((self.image_directory / 'Barcode' / 'product-7-00123456-barcode.png').is_file())

    def test_saving_unknown_product_does_not_create_any_files(self):
        self.cursor.fetchone.return_value = None
        response = self.client.post('/api/products/999/code', json={'type': 'QR-code'})
        self.assertEqual(response.status_code, 404)
        self.assertFalse(self.image_directory.exists())

    def test_save_failure_preserves_previous_image_and_cleans_temporary_file(self):
        self.assertEqual(self.client.post('/api/products/7/code', json={}).status_code, 200)
        destination = self.image_directory / 'Barcode' / 'product-7-00123456-barcode.png'
        original = destination.read_bytes()
        with patch('app.services.barcode_service.Path.replace', side_effect=PermissionError('private-path')):
            with self.assertLogs(self.app.logger, level='ERROR'):
                response = self.client.post('/api/products/7/code', json={},
                                            headers={'Origin': 'http://localhost:5500'})
        self.assertEqual(response.status_code, 500)
        self.assertIn('Không thể lưu ảnh', response.get_json()['error'])
        self.assertNotIn('private-', response.get_data(as_text=True))
        self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'http://localhost:5500')
        self.assertEqual(destination.read_bytes(), original)
        self.assertEqual([file.name for file in destination.parent.iterdir()], [destination.name])


if __name__ == '__main__':
    unittest.main()
