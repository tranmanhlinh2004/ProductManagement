from app.errors import InvalidProductError
from app.repositories import product_repository


def _serialize(product):
    # Preserve SQL Server DECIMAL(18, 2) without converting through float.
    product["sale_price"] = str(product["sale_price"])
    product["is_active"] = bool(product["is_active"])
    return product


def list_products():
    return [_serialize(product) for product in product_repository.list_products()]


def create_product(data):
    if not isinstance(data, dict):
        raise InvalidProductError("Thông tin sản phẩm phải là một đối tượng JSON.")
    if "sku" in data:
        raise InvalidProductError("SKU được hệ thống tạo tự động. Không gửi SKU khi thêm sản phẩm.")
    name = data.get("name")
    if not isinstance(name, str) or not 1 <= len(name.strip().encode("utf-16-le")) // 2 <= 200:
        raise InvalidProductError("Tên sản phẩm phải gồm 1–200 ký tự.")
    category_id = data.get("category_id")
    quantity = data.get("quantity", 0)
    if type(category_id) is not int or not 1 <= category_id <= 2147483647:
        raise InvalidProductError("Vui lòng chọn danh mục hợp lệ.")
    if type(quantity) is not int or not 0 <= quantity <= 2147483647:
        raise InvalidProductError("Số lượng trong kho phải là số nguyên từ 0 đến 2147483647.")
    scanned_code = data.get("scanned_code")
    if scanned_code is not None:
        if (not isinstance(scanned_code, str)
                or not 1 <= len(scanned_code.strip().encode("utf-16-le")) // 2 <= 450
                or "\x00" in scanned_code):
            raise InvalidProductError("Mã vừa quét phải gồm 1–450 ký tự.")
        scanned_code = scanned_code.strip()
    product_serial = None
    if scanned_code is not None and scanned_code.isascii() and scanned_code.isdigit():
        if len(scanned_code) > 100:
            raise InvalidProductError("Serial từ mã vạch phải gồm 1–100 chữ số.")
        product_serial = scanned_code
    return _serialize(product_repository.create_product(
        name.strip(), category_id, quantity, scanned_code=scanned_code,
        product_serial=product_serial
    ))


def list_categories():
    return product_repository.list_categories()


def find_by_code(code):
    if not isinstance(code, str) or not code.strip():
        return None
    product = product_repository.find_by_code(code.strip())
    if product is None:
        return None
    return _serialize(product)
