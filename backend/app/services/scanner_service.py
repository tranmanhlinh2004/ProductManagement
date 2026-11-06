"""Computer Vision barcode and QR code detection and decoding service."""

import base64
import re
from typing import Any, Dict, Optional

import cv2
import numpy as np
from pyzbar.pyzbar import decode as pyzbar_decode

from app.services import product_service


def _extract_image_bytes(data: Any) -> Optional[bytes]:
    """Extract raw image bytes from bytes, base64 string, or data URL."""
    if isinstance(data, (bytes, bytearray)):
        return bytes(data)
    if isinstance(data, str):
        # Support data URL e.g. "data:image/jpeg;base64,..."
        match = re.match(r"^data:image/[a-zA-Z0-9.+]+;base64,(.*)$", data)
        base64_str = match.group(1) if match else data
        try:
            return base64.b64decode(base64_str)
        except Exception:
            return None
    return None


def decode_image(image_data: Any) -> Optional[Dict[str, Any]]:
    """Detect and decode Barcode (1D) or QR-Code (2D) using a robust multi-stage Computer Vision pipeline."""
    raw_bytes = _extract_image_bytes(image_data)
    if not raw_bytes:
        return None

    try:
        np_arr = np.frombuffer(raw_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    except Exception:
        return None

    if img is None or img.size == 0:
        return None

    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Multi-stage image variants for challenging webcam captures
    candidates = [
        # Stage 1: Standard grayscale
        gray,
        # Stage 2: Original color
        img,
    ]

    # Stage 3: Center crop zoomed in (user holds code in center of viewfinder)
    ch, cw = int(h * 0.7), int(w * 0.7)
    cy, cx = (h - ch) // 2, (w - cw) // 2
    crop = gray[cy:cy + ch, cx:cx + cw]
    crop_zoomed = cv2.resize(crop, (0, 0), fx=1.75, fy=1.75, interpolation=cv2.INTER_CUBIC)
    candidates.append(crop_zoomed)

    # Stage 4: Horizontal flip (supports mirrored webcam feeds)
    candidates.append(cv2.flip(gray, 1))

    # Stage 5: 90-degree rotation (supports vertical barcode orientation)
    candidates.append(cv2.rotate(gray, cv2.ROTATE_90_CLOCKWISE))

    # Stage 6: CLAHE (Contrast Limited Adaptive Histogram Equalization)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    candidates.append(enhanced)

    # Stage 7: High-pass sharpening for blurry frames
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    sharpened = cv2.filter2D(gray, -1, kernel)
    candidates.append(sharpened)

    # Stage 8: Otsu thresholding for low-contrast/glare lighting
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    candidates.append(otsu)

    # Stage 9: Inverted (dark-mode phone screens)
    candidates.append(cv2.bitwise_not(gray))

    # Try pyzbar decoding across all candidate representations
    for cand in candidates:
        results = pyzbar_decode(cand)
        if results:
            first = results[0]
            try:
                code_str = first.data.decode("utf-8").strip()
            except UnicodeDecodeError:
                code_str = first.data.decode("latin1", errors="ignore").strip()

            if not code_str:
                continue

            raw_type = str(first.type)
            code_type = "QR-code" if raw_type == "QRCODE" else "barcode"
            if raw_type == "QRCODE" and not code_str.isascii():
                # ZBar can guess Shift-JIS for UTF-8 QR content. Prefer OpenCV's
                # UTF-8 result when available so Vietnamese codes stay intact.
                try:
                    qr_value, _, _ = cv2.QRCodeDetector().detectAndDecode(cand)
                    if qr_value and qr_value.strip():
                        code_str = qr_value.strip()
                except (cv2.error, UnicodeDecodeError):
                    pass

            rect = first.rect
            bbox = {
                "x": int(rect.left),
                "y": int(rect.top),
                "width": int(rect.width),
                "height": int(rect.height),
            }
            polygon = [
                {"x": int(pt.x), "y": int(pt.y)} for pt in first.polygon
            ]

            return {
                "code": code_str,
                "type": code_type,
                "raw_type": raw_type,
                "bbox": bbox,
                "polygon": polygon,
            }

    # Fallback: OpenCV QRCodeDetector specifically for QR codes
    detector = cv2.QRCodeDetector()
    for cand in (gray, enhanced, otsu):
        val, points, _ = detector.detectAndDecode(cand)
        if val and val.strip():
            coords = points.tolist() if points is not None else None
            return {
                "code": val.strip(),
                "type": "QR-code",
                "raw_type": "QRCODE",
                "points": coords,
                "bbox": None,
            }

    return None


def scan_image(image_data: Any) -> Dict[str, Any]:
    """Decode barcode/QR from image, then look up the product in database."""
    decoded = decode_image(image_data)
    if not decoded:
        return {
            "found": False,
            "message": "Không tìm thấy mã Barcode hoặc QR trong khung hình.",
        }

    code = decoded["code"]
    product = product_service.find_by_code(code)

    return {
        "found": True,
        "code": code,
        "code_type": decoded["type"],
        "raw_type": decoded["raw_type"],
        "bbox": decoded.get("bbox"),
        "polygon": decoded.get("polygon"),
        "matched": product is not None,
        "product": product,
        "message": (
            f"Đã nhận diện mã {code} ({decoded['type']})."
            if product is not None
            else f"Mã '{code}' không thuộc sản phẩm nào trong hệ thống."
        ),
    }


def lookup_code(code: str) -> Dict[str, Any]:
    """Direct code or SKU lookup for USB scanners or manual typing."""
    if not isinstance(code, str) or not code.strip():
        return {
            "found": False,
            "error": "Vui lòng nhập mã sản phẩm để tra cứu.",
        }

    clean_code = code.strip()
    product = product_service.find_by_code(clean_code)

    if product is None:
        return {
            "found": False,
            "code": clean_code,
            "error": f"Không tìm thấy sản phẩm có mã '{clean_code}' trong hệ thống.",
        }

    return {
        "found": True,
        "code": clean_code,
        "product": product,
        "message": f"Tìm thấy sản phẩm: {product['name']}.",
    }
