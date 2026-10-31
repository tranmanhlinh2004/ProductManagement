"""Connection lifecycle and configuration tests; no live database is required."""

import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pyodbc

from app import create_app
from app.config import ConfigurationError, load_config
from app.db import get_db
from app.db.connection import DatabaseConnectionError, build_connection_string


def default_config():
    with patch.dict(os.environ, {}, clear=True):
        return load_config()


class ConfigurationTests(unittest.TestCase):
    def test_default_database_name(self):
        self.assertEqual(default_config()["DB_NAME"], "QLSP")

    def test_certificate_verification_is_enabled_by_default(self):
        config = default_config()
        self.assertTrue(config["DB_ENCRYPT"])
        self.assertFalse(config["DB_TRUST_SERVER_CERTIFICATE"])

    def test_invalid_boolean_and_timeouts_are_rejected(self):
        for key, value in (
            ("DB_ENCRYPT", "maybe"),
            ("DB_TRUSTED_CONNECTION", "maybe"),
            ("DB_CONNECT_TIMEOUT", "0"),
            ("DB_QUERY_TIMEOUT", "-1"),
            ("DB_QUERY_TIMEOUT", "invalid"),
        ):
            with self.subTest(key=key, value=value):
                with patch.dict(os.environ, {key: value}, clear=True):
                    with self.assertRaisesRegex(ConfigurationError, key):
                        load_config()

    def test_windows_authentication_does_not_send_sql_credentials(self):
        config = default_config()
        config.update(DB_USER="unused-user", DB_PASSWORD="unused-secret")
        connection_string = build_connection_string(config)
        self.assertIn("Trusted_Connection={yes}", connection_string)
        self.assertNotIn("UID=", connection_string)
        self.assertNotIn("PWD=", connection_string)
        self.assertNotIn("unused-secret", connection_string)

    def test_sql_authentication_quotes_password_and_connection_values(self):
        config = default_config()
        config.update(
            DB_TRUSTED_CONNECTION=False,
            DB_USER="warehouse-user",
            DB_PASSWORD="pass};Encrypt=no;{word",
            DB_NAME="warehouse;development",
        )
        connection_string = build_connection_string(config)
        self.assertIn("PWD={pass}};Encrypt=no;{word};", connection_string)
        self.assertIn("DATABASE={warehouse;development};", connection_string)
        self.assertNotIn("Trusted_Connection=", connection_string)

    def test_missing_sql_password_is_rejected_without_exposing_username(self):
        config = default_config()
        config.update(DB_TRUSTED_CONNECTION=False, DB_USER="private-login")
        with self.assertRaises(ConfigurationError) as caught:
            build_connection_string(config)
        self.assertNotIn("private-login", str(caught.exception))


class ConnectionTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app({**default_config(), "TESTING": True})
        self.driver_patch = patch(
            "app.db.connection.pyodbc.drivers",
            return_value=[self.app.config["DB_DRIVER"]],
        )
        self.driver_patch.start()
        self.addCleanup(self.driver_patch.stop)

    def test_lazy_connection_is_reused_and_closed_between_contexts(self):
        first, second = MagicMock(), MagicMock()
        with patch("app.db.connection.pyodbc.connect", side_effect=[first, second]) as connect:
            self.app.test_client().get("/")
            connect.assert_not_called()
            with self.app.app_context():
                self.assertIs(get_db(), first)
                self.assertIs(get_db(), first)
                first.close.assert_not_called()
            first.close.assert_called_once()
            with self.app.app_context():
                self.assertIs(get_db(), second)
            second.close.assert_called_once()
        self.assertEqual(connect.call_count, 2)
        self.assertFalse(connect.call_args.kwargs["autocommit"])
        self.assertEqual(first.timeout, self.app.config["DB_QUERY_TIMEOUT"])

    def test_exception_closes_connection_without_committing(self):
        connection = MagicMock()
        with patch("app.db.connection.pyodbc.connect", return_value=connection):
            with self.assertRaisesRegex(RuntimeError, "business failure"):
                with self.app.app_context():
                    get_db()
                    raise RuntimeError("business failure")
        connection.close.assert_called_once()
        connection.commit.assert_not_called()

    def test_missing_driver_fails_before_attempting_a_connection(self):
        with patch("app.db.connection.pyodbc.drivers", return_value=[]):
            with patch("app.db.connection.pyodbc.connect") as connect:
                with self.app.app_context():
                    with self.assertRaisesRegex(ConfigurationError, "DB_DRIVER"):
                        get_db()
                connect.assert_not_called()

    def test_connection_error_does_not_expose_driver_details(self):
        with patch(
            "app.db.connection.pyodbc.connect",
            side_effect=pyodbc.Error("08001", "PWD=private-secret"),
        ):
            with self.app.app_context():
                with self.assertRaises(DatabaseConnectionError) as caught:
                    get_db()
            self.assertNotIn("private-secret", str(caught.exception))

    def test_check_db_success_closes_cursor_and_connection(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.execute.return_value.fetchone.return_value = SimpleNamespace(
            database_name="warehouse-test", connection_ok=1
        )
        with patch("app.db.connection.pyodbc.connect", return_value=connection):
            result = self.app.test_cli_runner().invoke(args=["check-db"])
        self.assertEqual(result.exit_code, 0, result.output)
        self.assertIn("database=warehouse-test", result.output)
        cursor.close.assert_called_once()
        connection.close.assert_called_once()
        connection.commit.assert_not_called()

    def test_check_db_failure_has_nonzero_exit_and_no_driver_secrets(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.execute.side_effect = pyodbc.Error("42000", "private-query-detail")
        with patch("app.db.connection.pyodbc.connect", return_value=connection):
            result = self.app.test_cli_runner().invoke(args=["check-db"])
        self.assertNotEqual(result.exit_code, 0)
        self.assertNotIn("private-query-detail", result.output)
        cursor.close.assert_called_once()
        connection.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
