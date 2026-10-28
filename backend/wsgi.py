"""WSGI entry point for a server configured to load wsgi:app."""

from app import create_app

app = create_app()
