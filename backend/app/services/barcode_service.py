from io import BytesIO
from pathlib import Path
import re
from tempfile import NamedTemporaryFile

from barcode import Code128
from barcode.writer import ImageWriter
from flask import current_app
import qrcode

from app.errors import InvalidProductError, ProductNotFoundError
from app.repositories import product_repository


CODE_TYPES = ("QR-code", "barcode")

class _SerialCode128(Code128):
    def _try_to_optimize(self, encoded):
        return encoded


def generate_png(serial, code_type):

    if code_type not in CODE_TYPES:
        raise InvalidProductError("Loại mã phải là QR-code hoặc barcode.")
    if not isinstance(serial, str) or not re.fullmatch(r"[0-9]{8}", serial):
        raise InvalidProductError("Sản phẩm phải có Serial gồm đúng 8 chữ số để tạo mã.")

    output = BytesIO()
    if code_type == "QR-code":
        qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=4)
        qr.add_data(serial)
        qr.make(fit=True)
        qr.make_image(fill_color="black", back_color="white").save(output, format="PNG")
    else:
        _SerialCode128(serial, writer=ImageWriter()).write(output, options={
            "format": "PNG", "dpi": 300, "module_width": 0.3,
            "module_height": 18, "quiet_zone": 6.5, "font_size": 10,
            "text_distance": 3, "write_text": True,
        })
    return output.getvalue()


def get_product_code(product_id, code_type=None):
    if code_type is not None and code_type not in CODE_TYPES:
        raise InvalidProductError("Loại mã phải là QR-code hoặc barcode.")
    product = product_repository.get_product_code_data(product_id)
    if product is None:
        raise ProductNotFoundError("Không tìm thấy sản phẩm đang hoạt động.")
    code_type = product["type"] if code_type is None else code_type
    image = generate_png(product["product_serial"], code_type)
    suffix = "qr" if code_type == "QR-code" else "barcode"
    filename = f"product-{product['id']}-{product['product_serial']}-{suffix}.png"
    return image, filename


def save_product_code(product_id, code_type=None):
    image, filename = get_product_code(product_id, code_type)
    folder = "QR" if filename.endswith("-qr.png") else "Barcode"
    directory = Path(current_app.config["PRODUCT_IMAGE_DIR"]) / folder
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / filename
    temporary_path = None
    try:
        # Close the temporary file before replacing the destination on Windows.
        with NamedTemporaryFile(dir=directory, prefix=".product-code-", suffix=".tmp", delete=False) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(image)
        temporary_path.replace(destination)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
    return destination
