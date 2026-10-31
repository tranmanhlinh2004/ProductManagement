"""Read product data from the existing SQL Server schema."""

from contextlib import closing

from app.db import get_db


def _fetch_all(query):
    with closing(get_db().cursor()) as cursor:
        cursor.execute(query)
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


def list_products():
    """Keep products even if their category has been deactivated."""
    return _fetch_all(
        """
        SELECT p.id, p.sku, p.name, p.category_id, c.name AS category,
               p.unit, p.sale_price, p.product_serial, p.[type], p.is_active
        FROM dbo.products AS p
        INNER JOIN dbo.categories AS c ON c.id = p.category_id
        WHERE p.is_active = 1
        ORDER BY p.id DESC
        """
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
