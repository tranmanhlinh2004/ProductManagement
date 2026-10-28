"""Create the Flask application and register database infrastructure."""

from pathlib import Path

from dotenv import load_dotenv
from flask import Flask

from .config import load_config
from .db import init_app as init_database


def create_app(test_config=None):
    """Load backend/.env; existing environment variables take precedence."""
    backend_directory = Path(__file__).resolve().parent.parent
    load_dotenv(backend_directory / ".env", override=False)

    app = Flask(__name__)
    app.config.from_mapping(load_config())
    if test_config is not None:
        app.config.from_mapping(test_config)
    init_database(app)
    return app
