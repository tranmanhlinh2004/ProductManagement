from io import BytesIO
from pathlib import Path
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
        # Tránh bước tối ưu của thư viện làm sai Serial bắt đầu bằng "99".
        return encoded


def generate_png(serial, code_type):
    """Tạo ảnh PNG chứa Serial dưới dạng QR-code hoặc barcode."""

    if code_type not in CODE_TYPES:
        raise InvalidProductError("Loại mã phải là QR-code hoặc barcode.")

    # Serial phải là chuỗi gồm đúng 8 chữ số từ 0 đến 9.
    valid_serial = (
        isinstance(serial, str)
        and len(serial) == 8
        and serial.isascii()
        and serial.isdigit()
    )
    if not valid_serial:
        raise InvalidProductError("Sản phẩm phải có Serial gồm đúng 8 chữ số để tạo mã.")

    output = BytesIO()

    if code_type == "QR-code":
        qr = qrcode.QRCode(
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=4,
        )
        qr.add_data(serial)
        qr.make(fit=True)

        image = qr.make_image(fill_color="black", back_color="white")
        image.save(output, format="PNG")
    else:
        writer = ImageWriter()
        barcode = _SerialCode128(serial, writer=writer)
        options = {
            "format": "PNG",
            "dpi": 300,
            "module_width": 0.3,
            "module_height": 18,
            "quiet_zone": 6.5,
            "font_size": 10,
            "text_distance": 3,
            "write_text": True,
        }
        barcode.write(output, options=options)

    return output.getvalue()


def get_product_code(product_id, code_type=None):
    """Lấy Serial của sản phẩm rồi trả về dữ liệu ảnh và tên file."""

    if code_type is not None and code_type not in CODE_TYPES:
        raise InvalidProductError("Loại mã phải là QR-code hoặc barcode.")

    product = product_repository.get_product_code_data(product_id)
    if product is None:
        raise ProductNotFoundError("Không tìm thấy sản phẩm đang hoạt động.")

    if code_type is None:
        code_type = product["type"]

    serial = product["product_serial"]
    image = generate_png(serial, code_type)

    if code_type == "QR-code":
        suffix = "qr"
    else:
        suffix = "barcode"

    filename = f"product-{product['id']}-{serial}-{suffix}.png"
    return image, filename


def save_product_code(product_id, code_type=None):
    """Lưu ảnh vào img/QR hoặc img/Barcode và trả về đường dẫn."""

    image, filename = get_product_code(product_id, code_type)

    if filename.endswith("-qr.png"):
        folder = "QR"
    else:
        folder = "Barcode"

    image_directory = Path(current_app.config["PRODUCT_IMAGE_DIR"])
    directory = image_directory / folder
    directory.mkdir(parents=True, exist_ok=True)

    destination = directory / filename
    temporary_path = None

    try:
        # Ghi vào file tạm để giữ nguyên ảnh cũ nếu việc lưu gặp lỗi.
        with NamedTemporaryFile(
            dir=directory,
            prefix=".product-code-",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(image)

        # Đóng file tạm trước khi thay thế ảnh đích để hoạt động trên Windows.
        temporary_path.replace(destination)
    finally:
        # Dọn file tạm còn lại kể cả khi ghi hoặc thay thế ảnh thất bại.
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)

    return destination
