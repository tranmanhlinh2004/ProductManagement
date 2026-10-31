"""Create the Flask application and register database infrastructure."""

from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, redirect, url_for

from .config import load_config
from .db import init_app as init_database
from .errors import init_app as init_errors
from .routes.products import products_api


def create_app(test_config=None):
    """Load backend/.env; existing environment variables take precedence."""
    backend_directory = Path(__file__).resolve().parent.parent
    load_dotenv(backend_directory / ".env", override=False)

    app = Flask(
        __name__,
        static_folder=str(backend_directory.parent / "frontend"),
        static_url_path="",
    )
    app.config.from_mapping(load_config())
    if test_config is not None:
        app.config.from_mapping(test_config)
    init_database(app)
    init_errors(app)
    app.register_blueprint(products_api)

    @app.get("/")
    def index():
        return redirect(url_for("static", filename="sources/products.html"))

    return app
