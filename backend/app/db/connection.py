"""Lazy SQL Server connections scoped to the current Flask application context."""

from contextlib import closing

import click
import pyodbc
from flask import current_app, g
from flask.cli import with_appcontext

from app.config import ConfigurationError


class DatabaseConnectionError(RuntimeError):
    """A database connection failed; its message does not contain credentials."""


def _odbc_value(value):
    """Quote ODBC values, including passwords with semicolons or braces."""
    return "{" + str(value).replace("}", "}}") + "}"


def build_connection_string(config):
    """Build a connection string; callers must never log the returned value."""
    for name in ("DB_DRIVER", "DB_SERVER", "DB_NAME"):
        if not str(config.get(name, "")).strip():
            raise ConfigurationError(f"{name} must not be empty.")

    fields = [
        ("DRIVER", config["DB_DRIVER"]),
        ("SERVER", config["DB_SERVER"]),
        ("DATABASE", config["DB_NAME"]),
    ]
    if config["DB_TRUSTED_CONNECTION"]:
        fields.append(("Trusted_Connection", "yes"))
    else:
        if not config.get("DB_USER") or not config.get("DB_PASSWORD"):
            raise ConfigurationError(
                "DB_USER and DB_PASSWORD are required for SQL Server Authentication."
            )
        fields.extend((("UID", config["DB_USER"]), ("PWD", config["DB_PASSWORD"])))

    fields.extend(
        (
            ("Encrypt", "yes" if config["DB_ENCRYPT"] else "no"),
            (
                "TrustServerCertificate",
                "yes" if config["DB_TRUST_SERVER_CERTIFICATE"] else "no",
            ),
        )
    )
    return ";".join(f"{key}={_odbc_value(value)}" for key, value in fields) + ";"


def get_db():
    """Reuse one connection per context; uncommitted changes are never auto-saved."""
    if "db" not in g:
        config = current_app.config
        connection_string = build_connection_string(config)
        if config["DB_DRIVER"] not in pyodbc.drivers():
            raise ConfigurationError("The configured DB_DRIVER is not installed.")

        connection = None
        try:
            connection = pyodbc.connect(
                connection_string,
                timeout=config["DB_CONNECT_TIMEOUT"],
                autocommit=False,
            )
            connection.timeout = config["DB_QUERY_TIMEOUT"]
        except pyodbc.Error as error:
            if connection is not None:
                connection.close()
            # Driver messages can contain connection details. Do not expose them.
            raise DatabaseConnectionError(
                "Cannot connect to SQL Server. Check backend/.env, the SQL Server "
                "service, authentication permissions and certificate settings."
            ) from error
        g.db = connection
    return g.db


def close_db(error=None):
    """Close at context teardown; pyodbc rolls back any uncommitted changes."""
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


@click.command("check-db")
@with_appcontext
def check_db_command():
    """Run a read-only query to verify access to the configured database."""
    try:
        with closing(get_db().cursor()) as cursor:
            row = cursor.execute(
                "SELECT DB_NAME() AS database_name, 1 AS connection_ok"
            ).fetchone()
        if row is None or row.connection_ok != 1:
            raise click.ClickException("Database connection check returned no result.")
    except (ConfigurationError, DatabaseConnectionError) as error:
        raise click.ClickException(str(error)) from None
    except pyodbc.Error:
        raise click.ClickException(
            "Database check query failed. Check database access permissions."
        ) from None
    click.echo(f"Connection OK | database={row.database_name} | SELECT 1=1")


def init_app(app):
    """Register cleanup and CLI without opening a database connection at startup."""
    app.teardown_appcontext(close_db)
    app.cli.add_command(check_db_command)
