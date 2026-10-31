"""Read-only product and category endpoints."""

import re

from flask import Blueprint, jsonify, request

from app.services import product_service


products_api = Blueprint("products_api", __name__, url_prefix="/api")


@products_api.after_request
def configure_response_headers(response):
    response.headers["Cache-Control"] = "no-store"
    # Live Server may choose another port if its default port is occupied.
    origin = request.headers.get("Origin", "")
    if re.fullmatch(r"http://(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?", origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response.vary.add("Origin")
    return response


@products_api.get("/products")
def get_products():
    return jsonify(product_service.list_products())


@products_api.get("/categories")
def get_categories():
    return jsonify(product_service.list_categories())
