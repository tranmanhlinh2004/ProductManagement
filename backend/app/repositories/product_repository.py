from contextlib import closing

import pyodbc

from app.db import get_db
from app.errors import DuplicateProductError, InvalidProductError


PRODUCT_SELECT = """
    SELECT p.id, p.sku, p.name, p.category_id, c.name AS category,
           p.unit, p.sale_price, p.product_serial, p.[type], p.is_active,
           COALESCE(i.quantity, 0) AS quantity
    FROM dbo.products AS p
    INNER JOIN dbo.categories AS c ON c.id = p.category_id
    LEFT JOIN dbo.inventory AS i ON i.product_id = p.id
"""


def _fetch_all(query):
    with closing(get_db().cursor()) as cursor:
        cursor.execute(query)
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


def list_products():
    """Keep products even if their category has been deactivated."""
    return _fetch_all(
        PRODUCT_SELECT + " WHERE p.is_active = 1 ORDER BY p.id DESC"
    )


def list_categories():
    return _fetch_all(
        """
        SELECT id, name
        FROM dbo.categories
        WHERE is_active = 1
        ORDER BY name, id
        """
    )


def get_product_code_data(product_id):
    with closing(get_db().cursor()) as cursor:
        cursor.execute(
            """
            SELECT id, sku, name, product_serial, [type]
            FROM dbo.products
            WHERE id = ? AND is_active = 1
            """,
            product_id,
        )
        row = cursor.fetchone()
        if row is None:
            return None
        return dict(zip((column[0] for column in cursor.description), row))


def create_product(sku, name, category_id, quantity):
    """Save product and initial stock atomically, retrying random serial collisions."""
    connection = get_db()
    with closing(connection.cursor()) as cursor:
        for attempt in range(5):
            try:
                # An inactive or missing category cannot receive a new product.
                cursor.execute(
                    """
                    INSERT INTO dbo.products (sku, name, category_id)
                    OUTPUT INSERTED.id
                    SELECT ?, ?, c.id FROM dbo.categories AS c
                    WHERE c.id = ? AND c.is_active = 1
                    """,
                    sku, name, category_id,
                )
                row = cursor.fetchone()
                if row is None:
                    raise InvalidProductError("Danh mục không tồn tại hoặc đã ngừng hoạt động.")
                product_id = row[0]
                cursor.execute(
                    "INSERT INTO dbo.inventory (product_id, quantity) VALUES (?, ?)",
                    product_id, quantity,
                )
                cursor.execute(PRODUCT_SELECT + " WHERE p.id = ?", product_id)
                columns = [column[0] for column in cursor.description]
                product = dict(zip(columns, cursor.fetchone()))
                connection.commit()
                return product
            except pyodbc.IntegrityError as error:
                connection.rollback()
                if not any(code in str(error) for code in ("2601", "2627")):
                    raise
                cursor.execute("SELECT id FROM dbo.products WHERE sku = ?", sku)
                if cursor.fetchone() is not None:
                    raise DuplicateProductError("SKU đã tồn tại. Vui lòng nhập SKU khác.") from None
                if attempt == 4:
                    raise
            except Exception:
                connection.rollback()
                raise
