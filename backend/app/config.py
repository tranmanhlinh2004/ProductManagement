"""Read backend configuration without embedding database credentials in code."""

import os


class ConfigurationError(ValueError):
    """An application setting is missing or invalid."""


def _boolean(name, default):
    value = os.getenv(name, default).strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    raise ConfigurationError(f"{name} must be yes/no or true/false.")


def _positive_integer(name, default):
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        raise ConfigurationError(f"{name} must be a positive integer.") from None
    if value < 1:
        raise ConfigurationError(f"{name} must be a positive integer.")
    return value


def load_config():
    """Read settings after the application factory loads backend/.env."""
    return {
        "DB_DRIVER": os.getenv("DB_DRIVER", "ODBC Driver 18 for SQL Server"),
        "DB_SERVER": os.getenv("DB_SERVER", "localhost"),
        "DB_NAME": os.getenv("DB_NAME", "QLSP_Barcode"),
        "DB_TRUSTED_CONNECTION": _boolean("DB_TRUSTED_CONNECTION", "yes"),
        "DB_USER": os.getenv("DB_USER", ""),
        "DB_PASSWORD": os.getenv("DB_PASSWORD", ""),
        "DB_ENCRYPT": _boolean("DB_ENCRYPT", "yes"),
        "DB_TRUST_SERVER_CERTIFICATE": _boolean(
            "DB_TRUST_SERVER_CERTIFICATE", "no"
        ),
        "DB_CONNECT_TIMEOUT": _positive_integer("DB_CONNECT_TIMEOUT", 5),
        "DB_QUERY_TIMEOUT": _positive_integer("DB_QUERY_TIMEOUT", 15),
    }
