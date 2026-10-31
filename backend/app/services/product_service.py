"""Prepare database records for the product API."""

from app.repositories import product_repository


def list_products():
    products = product_repository.list_products()
    for product in products:
        # Preserve SQL Server DECIMAL(18, 2) without converting through float.
        product["sale_price"] = str(product["sale_price"])
        product["is_active"] = bool(product["is_active"])
    return products


def list_categories():
    return product_repository.list_categories()
