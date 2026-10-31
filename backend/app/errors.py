"""Return database failures as JSON without exposing connection details."""

import pyodbc
from flask import current_app, jsonify

from app.config import ConfigurationError
from app.db.connection import DatabaseConnectionError


def database_unavailable(error):
    current_app.logger.error("Database request failed (%s).", type(error).__name__)
    return jsonify(
        error="Không thể đọc dữ liệu từ SQL Server. "
        "Hãy kiểm tra kết nối database và cấu hình backend/.env."
    ), 503


def init_app(app):
    for error_type in (ConfigurationError, DatabaseConnectionError, pyodbc.Error):
        app.register_error_handler(error_type, database_unavailable)
