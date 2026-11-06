"""Return database failures as JSON without exposing connection details."""

import pyodbc
from flask import current_app, jsonify

from app.config import ConfigurationError
from app.db.connection import DatabaseConnectionError


class InvalidProductError(ValueError):
    """Product input cannot be saved."""


class ProductNotFoundError(LookupError):
    """The requested active product does not exist."""


def database_unavailable(error):
    current_app.logger.error("Database request failed (%s).", type(error).__name__)
    return jsonify(
        error="Không thể truy cập dữ liệu từ SQL Server. "
        "Hãy kiểm tra kết nối database và cấu hình backend/.env."
    ), 503


def init_app(app):
    app.register_error_handler(InvalidProductError, lambda error: (jsonify(error=str(error)), 400))
    app.register_error_handler(ProductNotFoundError, lambda error: (jsonify(error=str(error)), 404))
    for error_type in (ConfigurationError, DatabaseConnectionError, pyodbc.Error):
        app.register_error_handler(error_type, database_unavailable)
