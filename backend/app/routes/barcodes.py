

from io import BytesIO

from flask import Blueprint, current_app, jsonify, request, send_file

from app.errors import InvalidProductError
from app.routes.products import configure_response_headers
from app.services import barcode_service


barcodes_api = Blueprint("barcodes_api", __name__, url_prefix="/api/products")
barcodes_api.after_request(configure_response_headers)


@barcodes_api.get("/<int:product_id>/code")
def get_product_code(product_id):
    image, filename = barcode_service.get_product_code(product_id, request.args.get("type"))
    return send_file(
        BytesIO(image), mimetype="image/png", download_name=filename,
        as_attachment=request.args.get("download") == "1", conditional=False,
    )


@barcodes_api.post("/<int:product_id>/code")
def save_product_code(product_id):
    data = request.get_json(silent=True)
    if not request.is_json or not isinstance(data, dict):
        raise InvalidProductError("Yêu cầu lưu mã phải là một đối tượng JSON.")
    try:
        saved_file = barcode_service.save_product_code(product_id, data.get("type"))
    except OSError as error:
        current_app.logger.error("Product code save failed (%s).", type(error).__name__)
        return jsonify(error="Không thể lưu ảnh vào thư mục img. Hãy kiểm tra quyền ghi và dung lượng ổ đĩa."), 500
    return jsonify(
        message="Đã lưu ảnh mã sản phẩm.",
        filename=saved_file.name,
        path=f"img/{saved_file.parent.name}/{saved_file.name}",
    )
