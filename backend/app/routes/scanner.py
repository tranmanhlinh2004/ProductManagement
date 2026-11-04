"""Webcam and barcode/QR scanner endpoints."""

from flask import Blueprint, jsonify, request

from app.routes.products import configure_response_headers
from app.services import scanner_service


scanner_api = Blueprint("scanner_api", __name__, url_prefix="/api/scanner")
scanner_api.after_request(configure_response_headers)


@scanner_api.post("/scan")
def scan_frame():
    """Receive an image frame (multipart or JSON base64) and decode Barcode/QR."""
    image_data = None

    if request.files:
        # Check uploaded files (e.g. from FormData)
        for key in ("image", "frame", "file"):
            if key in request.files:
                image_data = request.files[key].read()
                break
        if image_data is None:
            # Pick the first uploaded file if any
            first_file = next(iter(request.files.values()), None)
            if first_file:
                image_data = first_file.read()

    if image_data is None and request.is_json:
        data = request.get_json(silent=True) or {}
        image_data = data.get("image") or data.get("frame")

    if not image_data:
        return jsonify(
            found=False,
            error="Không có dữ liệu hình ảnh được gửi lên.",
        ), 400

    result = scanner_service.scan_image(image_data)

    if result.get("found"):
        if result.get("matched"):
            return jsonify(result), 200
        return jsonify(result), 404

    return jsonify(result), 200


@scanner_api.post("/lookup")
def lookup_code():
    """Look up product by serial or SKU (for USB scanner or manual entry)."""
    if not request.is_json:
        return jsonify(found=False, error="Yêu cầu phải có định dạng JSON."), 400

    data = request.get_json(silent=True) or {}
    code = data.get("code")

    if not code or not isinstance(code, str) or not code.strip():
        return jsonify(found=False, error="Vui lòng cung cấp mã sản phẩm."), 400

    result = scanner_service.lookup_code(code.strip())
    if result.get("found"):
        return jsonify(result), 200

    return jsonify(result), 404

