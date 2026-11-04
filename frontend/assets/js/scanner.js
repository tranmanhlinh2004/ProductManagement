// Backend API endpoint
const API_BASE_URL = window.location.port === '8080' ? '' : 'http://127.0.0.1:8080';

document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('camera-video');
  const placeholder = document.getElementById('camera-placeholder');
  const cameraUploadedPreview = document.getElementById('camera-uploaded-preview');
  const viewfinder = document.getElementById('viewfinder');
  const canvas = document.getElementById('camera-frame');
  const camStatus = document.getElementById('cam-status');
  const toggleBtn = document.getElementById('btn-toggle-cam');
  const uploadBtn = document.getElementById('btn-upload-scan');
  const fileInput = document.getElementById('input-file-scan');
  const lookupForm = document.getElementById('lookup-form');
  const lookupInput = document.getElementById('lookup-code');
  const lookupBtn = document.getElementById('btn-lookup');
  const message = document.getElementById('message');
  const scanStatus = document.getElementById('scan-status');
  const scanEmpty = document.getElementById('scan-empty');
  const scanResult = document.getElementById('scan-result');

  // Product fields
  const resName = document.getElementById('scan-res-name');
  const resSku = document.getElementById('scan-res-sku');
  const resCategory = document.getElementById('scan-res-category');
  const resUnit = document.getElementById('scan-res-unit');
  const resPrice = document.getElementById('scan-res-price');
  const resQuantity = document.getElementById('scan-res-quantity');
  const resSerial = document.getElementById('scan-res-serial');
  const resActive = document.getElementById('scan-res-active');

  let mediaStream = null;
  let scanInterval = null;
  let isSendingFrame = false;
  let lastScannedCode = null;
  let lastScannedTime = 0;
  let scannedFrameCount = 0;
  const SCAN_COOLDOWN_MS = 2500;

  function showMessage(msg, isError = false) {
    message.textContent = msg;
    message.classList.toggle('error', isError);
  }

  // Audio feedback on successful scan
  function playBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (_) {}
  }

  function formatCurrency(price) {
    const num = Number(price);
    if (isNaN(num)) return price || '0 đ';
    return num.toLocaleString('vi-VN') + ' đ';
  }

  function displayProduct(product, codeType = '') {
    scanEmpty.hidden = true;
    scanResult.hidden = false;

    resName.textContent = product.name || 'Không có tên';
    resSku.textContent = product.sku || '—';
    resCategory.textContent = product.category || 'Chưa phân loại';
    resUnit.textContent = product.unit || 'Cái';
    resPrice.textContent = formatCurrency(product.sale_price);
    if (resQuantity) resQuantity.textContent = (product.quantity ?? 0) + ' ' + (product.unit || 'cái');
    if (resSerial) resSerial.textContent = product.product_serial || '—';
    resActive.textContent = product.is_active ? 'Đang kinh doanh' : 'Ngừng kinh doanh';

    const typeLabel = codeType === 'barcode' ? 'Mã vạch (Code128)' : (codeType === 'QR-code' ? 'Mã QR' : codeType);
    scanStatus.textContent = `Nhận diện thành công ${typeLabel ? '[' + typeLabel + '] ' : ''}: Serial ${product.product_serial || product.sku}`;
    scanStatus.classList.remove('error');
  }

  function clearProduct(errorText = '') {
    scanResult.hidden = true;
    scanEmpty.hidden = false;
    if (errorText) {
      scanStatus.textContent = errorText;
      scanStatus.classList.add('error');
    } else {
      scanStatus.textContent = 'Chưa có dữ liệu quét.';
      scanStatus.classList.remove('error');
    }
  }

  async function processScannedData(data) {
    if (!data) return;

    if (data.found) {
      const now = Date.now();
      if (data.code === lastScannedCode && (now - lastScannedTime) < SCAN_COOLDOWN_MS) {
        return;
      }
      lastScannedCode = data.code;
      lastScannedTime = now;

      if (data.matched && data.product) {
        playBeep();
        displayProduct(data.product, data.code_type);
        showMessage(`Đã nhận diện: ${data.product.name} (Serial: ${data.code})`, false);
      } else {
        clearProduct(`Mã "${data.code}" không thuộc sản phẩm nào.`);
        showMessage(`Phát hiện mã ${data.code} nhưng không có trong cơ sở dữ liệu.`, true);
      }
    }
  }

  async function captureAndScanFrame() {
    if (!mediaStream || isSendingFrame || video.readyState < 2) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);

    const base64Data = canvas.toDataURL('image/jpeg', 0.88);
    isSendingFrame = true;
    scannedFrameCount += 1;

    try {
      const response = await fetch(`${API_BASE_URL}/api/scanner/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Data }),
      });

      const data = await response.json();
      await processScannedData(data);

      if (mediaStream) {
        camStatus.textContent = `● Camera đang quét (Đã xử lý ${scannedFrameCount} khung hình)…`;
      }
    } catch (err) {
      // Ignore background network jitter during frame loop
    } finally {
      isSendingFrame = false;
    }
  }

  async function startCamera() {
    showMessage('Đang mở webcam…', false);
    camStatus.textContent = 'Đang khởi động webcam…';

    // Hide uploaded preview image when starting live webcam
    if (cameraUploadedPreview) cameraUploadedPreview.hidden = true;
    video.hidden = false;

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 }
        }
      });
      video.srcObject = mediaStream;
      await video.play();

      placeholder.hidden = true;
      if (viewfinder) viewfinder.hidden = false;
      camStatus.textContent = '● Camera đang quét…';
      camStatus.style.color = '#4ade80';
      toggleBtn.textContent = 'Tắt webcam';
      toggleBtn.classList.add('secondary');
      scannedFrameCount = 0;
      showMessage('Webcam đã sẵn sàng. Hãy căn mã vào khung quét (khoảng cách 15–30cm).', false);

      scanInterval = setInterval(captureAndScanFrame, 220);
    } catch (error) {
      console.error('Lỗi webcam:', error);
      mediaStream = null;
      placeholder.hidden = false;
      if (viewfinder) viewfinder.hidden = true;
      placeholder.textContent = 'Không thể mở webcam. Vui lòng cấp quyền trong trình duyệt hoặc sử dụng ô nhập mã bên dưới.';
      camStatus.textContent = 'Camera đã tắt (Không thể truy cập)';
      camStatus.style.color = '#f87171';
      toggleBtn.textContent = 'Thử lại webcam';
      toggleBtn.classList.remove('secondary');
      showMessage('Không thể truy cập webcam. Hãy kiểm tra quyền thiết bị hoặc tải ảnh mã lên.', true);
    }
  }

  function stopCamera() {
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    video.srcObject = null;
    if (viewfinder) viewfinder.hidden = true;

    if (cameraUploadedPreview && !cameraUploadedPreview.hidden) {
      // Keep uploaded preview visible if an image was selected
      placeholder.hidden = true;
    } else {
      placeholder.hidden = false;
      placeholder.textContent = 'Khung xem trước webcam. Nhấn “Bật webcam” để bắt đầu.';
      camStatus.textContent = 'Camera đã tắt';
      camStatus.style.color = '#93c5fd';
    }

    toggleBtn.textContent = 'Bật webcam';
    toggleBtn.classList.remove('secondary');
    showMessage('Đã tắt webcam.', false);
  }

  toggleBtn.addEventListener('click', () => {
    if (mediaStream) {
      stopCamera();
    } else {
      startCamera();
    }
  });

  // Upload an image file directly with prominent preview on the left camera box
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      // Stop camera if running when an image is uploaded
      if (mediaStream) stopCamera();

      showMessage('Đang đọc và phân tích ảnh mã đã chọn…', false);
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target.result;

        // Show the uploaded image preview directly in the camera box on the left!
        if (cameraUploadedPreview) {
          cameraUploadedPreview.src = base64Data;
          cameraUploadedPreview.hidden = false;
          placeholder.hidden = true;
          video.hidden = true;
          camStatus.textContent = `Đang hiển thị ảnh mã đã chọn: ${file.name}`;
          camStatus.style.color = '#38bdf8';
        }

        try {
          const response = await fetch(`${API_BASE_URL}/api/scanner/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Data }),
          });
          const data = await response.json();

          if (data.found && data.matched && data.product) {
            playBeep();
            displayProduct(data.product, data.code_type);
            showMessage(`Đã nhận diện từ ảnh "${file.name}": ${data.product.name} (Serial: ${data.code})`, false);
          } else if (data.found) {
            clearProduct(`Mã "${data.code}" không có trong CSDL.`);
            showMessage(`Tìm thấy mã ${data.code} nhưng không thuộc sản phẩm nào trong CSDL.`, true);
          } else {
            clearProduct('Không phát hiện mã trong ảnh.');
            showMessage('Không tìm thấy mã Barcode hoặc QR trong ảnh đã tải lên.', true);
          }
        } catch (err) {
          console.error('Scan upload error:', err);
          showMessage('Lỗi kết nối tới server: ' + err.message, true);
        }
      };
      reader.readAsDataURL(file);
      fileInput.value = '';
    });
  }

  // Manual lookup & USB scanner form submission
  lookupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = lookupInput.value.trim();
    if (!code) return;

    lookupBtn.disabled = true;
    lookupBtn.textContent = 'Đang tìm…';
    showMessage('Đang tra cứu sản phẩm…', false);

    try {
      const response = await fetch(`${API_BASE_URL}/api/scanner/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await response.json();

      if (response.ok && data.found && data.product) {
        playBeep();
        displayProduct(data.product, 'Tra cứu');
        showMessage(`Tìm thấy: ${data.product.name} (Mã: ${code})`, false);
        lookupInput.select();
      } else {
        clearProduct(`Không tìm thấy mã "${code}"`);
        showMessage(data.error || `Không tìm thấy sản phẩm có mã "${code}".`, true);
      }
    } catch (err) {
      showMessage('Lỗi kết nối khi tra cứu sản phẩm. Hãy kiểm tra backend.', true);
    } finally {
      lookupBtn.disabled = false;
      lookupBtn.textContent = 'Tra cứu';
    }
  });

  window.addEventListener('beforeunload', () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
    }
  });
});
