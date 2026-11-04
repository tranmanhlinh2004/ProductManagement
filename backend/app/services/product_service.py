import re

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
    sku = data.get("sku")
    name = data.get("name")
    if not isinstance(sku, str) or not re.fullmatch(r"[!-~]{1,50}", sku.strip()):
        raise InvalidProductError("SKU phải gồm 1–50 ký tự ASCII, không dấu và không khoảng trắng.")
    if not isinstance(name, str) or not 1 <= len(name.strip().encode("utf-16-le")) // 2 <= 200:
        raise InvalidProductError("Tên sản phẩm phải gồm 1–200 ký tự.")
    category_id = data.get("category_id")
    quantity = data.get("quantity", 0)
    if type(category_id) is not int or not 1 <= category_id <= 2147483647:
        raise InvalidProductError("Vui lòng chọn danh mục hợp lệ.")
    if type(quantity) is not int or not 0 <= quantity <= 2147483647:
        raise InvalidProductError("Số lượng trong kho phải là số nguyên từ 0 đến 2147483647.")
    return _serialize(product_repository.create_product(
        sku.strip(), name.strip(), category_id, quantity
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
