/**
 * js/app.js (Faz 4: LSB Steganaliz & Röntgen Görselleştirici)
 * Tüm Motorları ve Arayüzü Bağlayan Ana Dosya
 * - Deflate sıkıştırma (CompressionStream / DecompressionStream)
 * - 1-LSB ve 2-LSB Modları
 * - PRNG Dağınık Mod (O(1) Bellek Permütasyonu & Sıfır İmza)
 * - İnkâr Edilebilir Şifreleme: Çift Katman (Tuzak & Gerçek)
 * - LSB Röntgen Haritası & Chi-Square (χ²) Steganaliz Dedektörü
 */
import { CryptoEngine } from './CryptoEngine.js';
import { StegoEngine } from './StegoEngine.js';
import { ImageEngine } from './ImageEngine.js';
import { ZeroWidthEngine } from './ZeroWidthEngine.js';
import { CompressionEngine } from './CompressionEngine.js';
import { ScatterEngine } from './ScatterEngine.js';
import { SteganalysisEngine } from './SteganalysisEngine.js';
import { QREngine } from './QREngine.js';

// ---------- Durum Değişkenleri ----------
let currentHideCanvasData = null;
let currentRevealCanvasData = null;
let currentInspectImageData = null;
let generatedBlob = null;
let decryptedFileBlob = null;
let decryptedFileName = "";
let selectedSecretFile = null;
let copyTimeout = null;
let currentQrPayload = "";

// ---------- DOM Elemanları ----------
const btnTabHide = document.getElementById('btn-tab-hide');
const btnTabReveal = document.getElementById('btn-tab-reveal');
const btnTabInspect = document.getElementById('btn-tab-inspect');
const tabHide = document.getElementById('tab-hide');
const tabReveal = document.getElementById('tab-reveal');
const tabInspect = document.getElementById('tab-inspect');
const statusEl = document.getElementById('status-msg');

const typeTextRadio = document.getElementById('type-text');
const typeFileRadio = document.getElementById('type-file');
const typeInvisibleRadio = document.getElementById('type-invisible');

const density1lsbRadio = document.getElementById('density-1lsb');
const density2lsbRadio = document.getElementById('density-2lsb');
const containerDensityInput = document.getElementById('container-density-input');

const scatterModePrngRadio = document.getElementById('scatter-mode-prng');
const scatterModeSeqRadio = document.getElementById('scatter-mode-seq');
const containerScatterInput = document.getElementById('container-scatter-input');

const checkDeniable = document.getElementById('check-deniable');
const containerDeniableToggle = document.getElementById('container-deniable-toggle');
const containerDeniableFields = document.getElementById('container-deniable-fields');
const textDecoyInput = document.getElementById('text-decoy');
const passDecoyInput = document.getElementById('pass-decoy');
const labelPassHide = document.getElementById('label-pass-hide');

const revealTypeImageRadio = document.getElementById('reveal-type-image');
const revealTypeTextRadio = document.getElementById('reveal-type-text');

const containerImageInput = document.getElementById('container-image-input');
const containerTextInput = document.getElementById('container-text-input');
const containerFileInput = document.getElementById('container-file-input');
const containerCoverInput = document.getElementById('container-cover-input');
const containerInvisibleOutput = document.getElementById('container-invisible-output');

const containerRevealImage = document.getElementById('container-reveal-image');
const containerRevealText = document.getElementById('container-reveal-text');

const fileSecretInput = document.getElementById('file-secret-input');
const labelSecretFile = document.getElementById('label-secret-file');

const inputHideText = document.getElementById('text-hide');
const inputHidePass = document.getElementById('pass-hide');
const inputCoverText = document.getElementById('text-cover');
const textInvisibleOutput = document.getElementById('text-invisible-output');

const inputRevealPass = document.getElementById('pass-reveal');
const inputRevealText = document.getElementById('text-reveal');
const inputRevealTextInput = document.getElementById('text-reveal-input');

const btnEncrypt = document.getElementById('btn-encrypt');
const btnShare = document.getElementById('btn-share');
const btnDecrypt = document.getElementById('btn-decrypt');
const btnDownloadFile = document.getElementById('btn-download-file');
const btnCopy = document.getElementById('btn-copy');
const btnCopyInvisible = document.getElementById('btn-copy-invisible');
const btnClearOutput = document.getElementById('btn-clear-output');

const previewHide = document.getElementById('preview-hide');
const previewReveal = document.getElementById('preview-reveal');
const dropzoneHide = document.getElementById('dropzone-hide');
const dropzoneReveal = document.getElementById('dropzone-reveal');

// Steganaliz Elemanları
const dropzoneInspect = document.getElementById('dropzone-inspect');
const fileInspectInput = document.getElementById('file-inspect');
const inspectControls = document.getElementById('inspect-controls');
const canvasInspect = document.getElementById('canvas-inspect');
const inspectProbBadge = document.getElementById('inspect-prob-badge');
const inspectVerdict = document.getElementById('inspect-verdict');
const inspectDetails = document.getElementById('inspect-details');
const inspectStats = document.getElementById('inspect-stats');

const inspectChanAll = document.getElementById('inspect-chan-all');
const inspectChanRed = document.getElementById('inspect-chan-red');
const inspectChanGreen = document.getElementById('inspect-chan-green');
const inspectChanBlue = document.getElementById('inspect-chan-blue');

// QR Kod ve Ekstra Elemanlar
const btnShowQr = document.getElementById('btn-show-qr');
const containerQrPreview = document.getElementById('container-qr-preview');
const canvasQr = document.getElementById('canvas-qr');
const btnDownloadQr = document.getElementById('btn-download-qr');
const btnCloseQr = document.getElementById('btn-close-qr');
const dropzoneSecretFile = document.getElementById('dropzone-secret-file');
const dropzoneQrScan = document.getElementById('dropzone-qr-scan');
const fileQrScan = document.getElementById('file-qr-scan');
const labelQrScan = document.getElementById('label-qr-scan');

// ---------- Yardımcı Fonksiyonlar ----------
function showStatus(msg, isError = false) {
    statusEl.className = `m3-status ${isError ? 'error' : 'success'}`;
    statusEl.innerText = msg;
    statusEl.style.display = 'block';
}

function hideStatus() {
    statusEl.style.display = 'none';
}

function switchTab(mode) {
    hideStatus();
    btnTabHide.classList.remove('active');
    btnTabReveal.classList.remove('active');
    if (btnTabInspect) btnTabInspect.classList.remove('active');
    tabHide.classList.remove('active');
    tabReveal.classList.remove('active');
    if (tabInspect) tabInspect.classList.remove('active');

    if (mode === 'hide') {
        btnTabHide.classList.add('active');
        tabHide.classList.add('active');
    } else if (mode === 'reveal') {
        btnTabReveal.classList.add('active');
        tabReveal.classList.add('active');
    } else if (mode === 'inspect') {
        if (btnTabInspect) btnTabInspect.classList.add('active');
        if (tabInspect) tabInspect.classList.add('active');
    }
}

function downloadBlob(blob, filename = 'stego_secret.png') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

function setPreviewImage(imgElement, file) {
    if (imgElement._objectUrl) {
        URL.revokeObjectURL(imgElement._objectUrl);
    }
    const url = URL.createObjectURL(file);
    imgElement.src = url;
    imgElement._objectUrl = url;
    imgElement.style.display = 'block';
}

function getLsbMode() {
    return density2lsbRadio && density2lsbRadio.checked ? 2 : 1;
}

function isScatteredMode() {
    return !scatterModeSeqRadio || !scatterModeSeqRadio.checked;
}

function isDeniableMode() {
    return checkDeniable && checkDeniable.checked && !typeInvisibleRadio.checked;
}

function updateCapacityUI() {
    const capEl = document.getElementById('capacity-text');
    if (!capEl) return;

    if (!currentHideCanvasData) {
        capEl.innerText = "Kapasite: Görsel bekleniyor";
        return;
    }

    const mode = getLsbMode();
    const rawBytes = mode === 2 ? currentHideCanvasData.maxCapacityBytes2LSB : currentHideCanvasData.maxCapacityBytes1LSB;
    const mb = (rawBytes / (1024 * 1024)).toFixed(2);
    const kb = Math.floor(rawBytes / 1024);
    const displaySize = rawBytes >= 1024 * 1024 ? `${mb} MB` : `${kb} KB`;
    const estimatedCompressible = mode === 2 ? '3 - 6 MB' : '1.5 - 3 MB';

    if (isDeniableMode()) {
        capEl.innerHTML = `İnkâr Edilebilir Mod: Her katman için ~<b>${Math.floor(kb / 2)} KB</b> <i>(Toplam: ~${displaySize})</i>`;
    } else {
        capEl.innerHTML = `Ham Kapasite (${mode}-LSB): <b>~${displaySize}</b> <span style="opacity:0.85;">(Sıkıştırma ile ~${estimatedCompressible} alabilir)</span>`;
    }
}

// ---------- Buton Durum Yönetimi ----------
function setButtonsDisabled(disabled) {
    btnEncrypt.disabled = disabled;
    btnDecrypt.disabled = disabled;
    btnShare.disabled = disabled;
    btnDownloadFile.disabled = disabled;
    btnCopy.disabled = disabled;
    btnCopyInvisible.disabled = disabled;
    if (btnClearOutput) btnClearOutput.disabled = disabled;
}

// ---------- İnkâr Edilebilir Katman Aç/Kapa ----------
if (checkDeniable) {
    checkDeniable.addEventListener('change', () => {
        if (checkDeniable.checked) {
            containerDeniableFields.style.display = 'block';
            if (labelPassHide) labelPassHide.innerText = "🔒 2. Katman: Gerçek Parola (Asıl Gizli İçeriği Açacak)";
        } else {
            containerDeniableFields.style.display = 'none';
            if (labelPassHide) labelPassHide.innerText = "Şifreleme Parolası";
        }
        updateCapacityUI();
    });
}

// ---------- Sekme Değişimi ----------
btnTabHide.addEventListener('click', () => switchTab('hide'));
btnTabReveal.addEventListener('click', () => switchTab('reveal'));
if (btnTabInspect) btnTabInspect.addEventListener('click', () => switchTab('inspect'));

typeTextRadio.addEventListener('change', updateHideModeUI);
typeFileRadio.addEventListener('change', updateHideModeUI);
typeInvisibleRadio.addEventListener('change', updateHideModeUI);

if (density1lsbRadio) density1lsbRadio.addEventListener('change', updateCapacityUI);
if (density2lsbRadio) density2lsbRadio.addEventListener('change', updateCapacityUI);

function updateHideModeUI() {
    if (typeTextRadio.checked) {
        containerImageInput.style.display = 'block';
        if (containerDensityInput) containerDensityInput.style.display = 'block';
        if (containerScatterInput) containerScatterInput.style.display = 'block';
        if (containerDeniableToggle) containerDeniableToggle.style.display = 'block';
        if (containerDeniableFields) containerDeniableFields.style.display = checkDeniable?.checked ? 'block' : 'none';
        containerTextInput.style.display = 'block';
        containerFileInput.style.display = 'none';
        containerCoverInput.style.display = 'none';
        containerInvisibleOutput.style.display = 'none';
        btnShare.style.display = 'none';
    } else if (typeFileRadio.checked) {
        containerImageInput.style.display = 'block';
        if (containerDensityInput) containerDensityInput.style.display = 'block';
        if (containerScatterInput) containerScatterInput.style.display = 'block';
        if (containerDeniableToggle) containerDeniableToggle.style.display = 'block';
        if (containerDeniableFields) containerDeniableFields.style.display = checkDeniable?.checked ? 'block' : 'none';
        containerTextInput.style.display = 'none';
        containerFileInput.style.display = 'block';
        containerCoverInput.style.display = 'none';
        containerInvisibleOutput.style.display = 'none';
        btnShare.style.display = 'none';
    } else if (typeInvisibleRadio.checked) {
        containerImageInput.style.display = 'none';
        if (containerDensityInput) containerDensityInput.style.display = 'none';
        if (containerScatterInput) containerScatterInput.style.display = 'none';
        if (containerDeniableToggle) containerDeniableToggle.style.display = 'none';
        if (containerDeniableFields) containerDeniableFields.style.display = 'none';
        containerTextInput.style.display = 'block';
        containerFileInput.style.display = 'none';
        containerCoverInput.style.display = 'block';
        containerInvisibleOutput.style.display = 'none';
        btnShare.style.display = 'none';
    }
    if (btnShowQr) btnShowQr.style.display = 'none';
    if (containerQrPreview) containerQrPreview.style.display = 'none';
    updateCapacityUI();
}

revealTypeImageRadio.addEventListener('change', () => {
    containerRevealImage.style.display = 'block';
    containerRevealText.style.display = 'none';
});

revealTypeTextRadio.addEventListener('change', () => {
    containerRevealImage.style.display = 'none';
    containerRevealText.style.display = 'block';
});

// ---------- Dosya Seçimi ve Kapasite Kontrolü ----------
function handleSecretFileSelect(file) {
    if (!file) return;
    selectedSecretFile = file;

    const sizeKB = Math.floor(selectedSecretFile.size / 1024);
    const sizeMB = (selectedSecretFile.size / (1024 * 1024)).toFixed(2);
    const sizeDisplay = selectedSecretFile.size >= 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;

    labelSecretFile.innerText = `📄 Seçilen: ${selectedSecretFile.name} (${sizeDisplay})`;

    if (currentHideCanvasData) {
        const mode = getLsbMode();
        const maxRaw = mode === 2 ? currentHideCanvasData.maxCapacityBytes2LSB : currentHideCanvasData.maxCapacityBytes1LSB;
        if (selectedSecretFile.size > maxRaw * 3) {
            showStatus("⚠️ Dosya boyutu çok büyük; sıkıştırılsa bile görsel kapasitesini aşabilir!", true);
        } else {
            hideStatus();
        }
    }
}

fileSecretInput.addEventListener('change', (e) => {
    handleSecretFileSelect(e.target.files[0]);
});
if (dropzoneSecretFile) {
    setupDropzone(dropzoneSecretFile, handleSecretFileSelect);
}

// ---------- Sürükle-Bırak Yardımcısı ----------
function setupDropzone(dropzoneEl, fileHandler) {
    if (!dropzoneEl) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzoneEl.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzoneEl.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzoneEl.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzoneEl.classList.remove('dragover');
        });
    });

    dropzoneEl.addEventListener('drop', (e) => {
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            fileHandler(files[0]);
        }
    });
}

// ---------- GİZLEME SEKMESİ: Görsel İşleme ----------
async function processHideFile(file) {
    if (!file) return;

    try {
        showStatus("Görsel işleniyor...");
        const img = await ImageEngine.loadImage(file, (msg) => showStatus(msg));
        currentHideCanvasData = ImageEngine.processToCanvas(img);

        setPreviewImage(previewHide, file);
        btnShare.style.display = 'none';

        updateCapacityUI();
        hideStatus();
    } catch (err) {
        showStatus(err.message, true);
    }
}

document.getElementById('file-hide').addEventListener('change', (e) => {
    processHideFile(e.target.files[0]);
});
setupDropzone(dropzoneHide, processHideFile);

// ---------- GİZLEME SEKMESİ: Şifrele & Göm ----------
btnEncrypt.addEventListener('click', async () => {
    if (btnEncrypt.disabled) return;
    setButtonsDisabled(true);

    const pass = inputHidePass.value;
    if (!pass) {
        showStatus("Lütfen şifreleme parolasını girin.", true);
        setButtonsDisabled(false);
        return;
    }

    const isFileMode = typeFileRadio.checked;
    const isInvisibleMode = typeInvisibleRadio.checked;
    const lsbMode = isInvisibleMode ? 1 : getLsbMode();
    const useScatter = !isInvisibleMode && isScatteredMode();
    const deniableActive = isDeniableMode();
    let rawBufferToEncrypt = null;

    try {
        if (deniableActive) {
            const passDecoy = passDecoyInput.value;
            const textDecoy = textDecoyInput.value.trim();
            if (!passDecoy || !textDecoy) {
                throw new Error("Lütfen tuzak katman için hem tuzak parolayı hem de tuzak mesajı girin.");
            }
            if (passDecoy === pass) {
                throw new Error("Tuzak parola ile gerçek parola aynı olamaz!");
            }
        }

        if (isFileMode) {
            if (!currentHideCanvasData) throw new Error("Lütfen taşıyıcı görsel seçin.");
            if (!selectedSecretFile) throw new Error("Lütfen gömülecek dosyayı seçin.");

            showStatus("Dosya sıkıştırılıyor (Deflate)...");
            const fileNameBytes = new TextEncoder().encode(selectedSecretFile.name);
            if (fileNameBytes.length > 255) {
                throw new Error("Dosya adı çok uzun (maksimum 255 bayt). Lütfen dosya adını kısaltın.");
            }
            const fileArrayBuffer = await selectedSecretFile.arrayBuffer();
            const compressedFileData = await CompressionEngine.compress(new Uint8Array(fileArrayBuffer));

            rawBufferToEncrypt = new Uint8Array(1 + 1 + fileNameBytes.length + compressedFileData.length);
            rawBufferToEncrypt[0] = 0x11; // 0x11 = Compressed File (Deflate)
            rawBufferToEncrypt[1] = fileNameBytes.length;
            rawBufferToEncrypt.set(fileNameBytes, 2);
            rawBufferToEncrypt.set(compressedFileData, 2 + fileNameBytes.length);
        } else {
            const text = inputHideText.value.trim();
            if (!text) throw new Error("Gizlenecek metni girin.");

            showStatus("Metin sıkıştırılıyor (Deflate)...");
            const textBytes = new TextEncoder().encode(text);
            const compressedText = await CompressionEngine.compress(textBytes);

            rawBufferToEncrypt = new Uint8Array(1 + compressedText.length);
            rawBufferToEncrypt[0] = 0x10; // 0x10 = Compressed Text (Deflate)
            rawBufferToEncrypt.set(compressedText, 1);
        }

        if (isInvisibleMode) {
            // Görünmez Metin Modu
            showStatus("Veri şifreleniyor (AES-256-GCM)...");
            const payload = await CryptoEngine.encryptBuffer(rawBufferToEncrypt, pass, 1);

            const coverText = inputCoverText.value || "Selam, nasılsın?";
            const zeroWidthData = ZeroWidthEngine.encode(payload);
            const finalInvisibleText = coverText + zeroWidthData;

            textInvisibleOutput.value = finalInvisibleText;
            containerInvisibleOutput.style.display = 'block';

            currentQrPayload = finalInvisibleText;
            if (btnShowQr) btnShowQr.style.display = 'flex';

            showStatus(`👻 ${payload.length} bayt şifreli veri (sıkıştırılmış) görünmez olarak gömüldü!`);
            payload.fill(0);

        } else if (deniableActive) {
            // İnkâr Edilebilir Çift Katmanlı Mod (Tuzak: Even, Gerçek: Odd)
            if (!currentHideCanvasData) throw new Error("Lütfen taşıyıcı görsel seçin.");

            const passDecoy = passDecoyInput.value;
            const textDecoy = textDecoyInput.value.trim();

            showStatus("1. Katman (Tuzak Mesaj) hazırlanıyor...");
            const compDecoy = await CompressionEngine.compress(new TextEncoder().encode(textDecoy));
            const rawDecoy = new Uint8Array(1 + compDecoy.length);
            rawDecoy[0] = 0x10; // Compressed text
            rawDecoy.set(compDecoy, 1);

            const { header: hDecoy, cipherBody: cbDecoy } = await CryptoEngine.encryptZeroSig(rawDecoy, passDecoy, lsbMode);
            await StegoEngine.embedScattered(currentHideCanvasData.imageData, hDecoy, cbDecoy, lsbMode, passDecoy, 'even');

            showStatus("2. Katman (Gerçek İçerik) hazırlanıyor...");
            const { header: hReal, cipherBody: cbReal } = await CryptoEngine.encryptZeroSig(rawBufferToEncrypt, pass, lsbMode);
            await StegoEngine.embedScattered(currentHideCanvasData.imageData, hReal, cbReal, lsbMode, pass, 'odd');

            currentHideCanvasData.ctx.putImageData(currentHideCanvasData.imageData, 0, 0);

            currentHideCanvasData.canvas.toBlob((blob) => {
                generatedBlob = blob;
                const sizeKB = Math.floor(blob.size / 1024);
                showStatus(`✅ İŞLEM BAŞARILI! İnkâr edilebilir çift katmanlı görsel hazır (${sizeKB} KB, Tuzak & Gerçek Katman).`);
                btnShare.style.display = 'flex';
            }, 'image/png');

            hDecoy.fill(0);
            cbDecoy.fill(0);
            hReal.fill(0);
            cbReal.fill(0);
            passDecoyInput.value = '';
            textDecoyInput.value = '';

        } else if (useScatter) {
            // Dağınık PRNG Tek Katman Modu (Sıfır İmza)
            if (!currentHideCanvasData) throw new Error("Lütfen taşıyıcı görsel seçin.");

            showStatus("Sıfır İmza paketi şifreleniyor (AES-256-GCM)...");
            const { header, cipherBody } = await CryptoEngine.encryptZeroSig(rawBufferToEncrypt, pass, lsbMode);

            showStatus(`Piksellere homojen dağıtılıyor (PRNG, ${lsbMode}-LSB)...`);
            await StegoEngine.embedScattered(currentHideCanvasData.imageData, header, cipherBody, lsbMode, pass, 'all');
            currentHideCanvasData.ctx.putImageData(currentHideCanvasData.imageData, 0, 0);

            currentHideCanvasData.canvas.toBlob((blob) => {
                generatedBlob = blob;
                const sizeKB = Math.floor(blob.size / 1024);
                showStatus(`✅ İŞLEM BAŞARILI! Şifreli görsel hazır (${sizeKB} KB, Dağınık ${lsbMode}-LSB, Sıfır İmza).`);
                btnShare.style.display = 'flex';
            }, 'image/png');

            header.fill(0);
            cipherBody.fill(0);
        } else {
            // Sıralı Mod (Klasik)
            if (!currentHideCanvasData) throw new Error("Lütfen taşıyıcı görsel seçin.");

            showStatus(`Sıralı piksellere gömülüyor (${lsbMode}-LSB)...`);
            const payload = await CryptoEngine.encryptBuffer(rawBufferToEncrypt, pass, lsbMode);
            StegoEngine.embedSequential(currentHideCanvasData.imageData, payload, lsbMode);
            currentHideCanvasData.ctx.putImageData(currentHideCanvasData.imageData, 0, 0);

            currentHideCanvasData.canvas.toBlob((blob) => {
                generatedBlob = blob;
                const sizeKB = Math.floor(blob.size / 1024);
                showStatus(`✅ İŞLEM BAŞARILI! Şifreli görsel hazır (${sizeKB} KB, Sıralı ${lsbMode}-LSB).`);
                btnShare.style.display = 'flex';
            }, 'image/png');

            payload.fill(0);
        }

        // Hassas verileri temizle
        rawBufferToEncrypt.fill(0);
        inputHidePass.value = '';
        inputHideText.value = '';

    } catch (err) {
        showStatus("Hata: " + err.message, true);
        console.error("Encrypt error:", err);
    } finally {
        setButtonsDisabled(false);
        btnEncrypt.disabled = false;
    }
});

// ---------- Paylaş / İndir ----------
btnShare.addEventListener('click', async () => {
    if (!generatedBlob) return;

    if (navigator.share) {
        try {
            const file = new File([generatedBlob], 'stego_secret.png', { type: 'image/png' });
            await navigator.share({ files: [file], title: 'StegoCrypt Şifreli Görsel' });
        } catch {
            downloadBlob(generatedBlob);
        }
    } else {
        downloadBlob(generatedBlob);
    }
});

// ---------- ÇÖZME SEKMESİ: Görsel İşleme ----------
async function processRevealFile(file) {
    if (!file) return;

    try {
        showStatus("Görsel işleniyor...");
        const img = await ImageEngine.loadImage(file, (msg) => showStatus(msg));
        const maxDim = Math.max(img.width, img.height);
        currentRevealCanvasData = ImageEngine.processToCanvas(img, maxDim);

        setPreviewImage(previewReveal, file);

        if (file.type === 'image/jpeg' || (file.name && /\.(jpe?g)$/i.test(file.name))) {
            showStatus("⚠️ Uyarı: Seçilen görsel JPEG formatında. JPEG sıkıştırması görsel piksellerini bozduğu için LSB şifresi çözülemeyebilir. Lütfen şifreli orijinal PNG görselini seçtiğinizden emin olun.", true);
        } else {
            hideStatus();
        }
    } catch (err) {
        showStatus(err.message, true);
    }
}

document.getElementById('file-reveal').addEventListener('change', (e) => {
    processRevealFile(e.target.files[0]);
});
setupDropzone(dropzoneReveal, processRevealFile);

// ---------- ÇÖZME SEKMESİ: İçeriği Çöz ----------
btnDecrypt.addEventListener('click', async () => {
    if (btnDecrypt.disabled) return;
    setButtonsDisabled(true);

    const pass = inputRevealPass.value;
    if (!pass) {
        showStatus("Parolayı girin.", true);
        setButtonsDisabled(false);
        return;
    }

    const isImageReveal = revealTypeImageRadio.checked;

    try {
        let decryptedBytes = null;

        if (isImageReveal) {
            if (!currentRevealCanvasData) throw new Error("Lütfen şifreli PNG seçin.");
            showStatus("Pikseller ve katmanlar taranıyor...");
            decryptedBytes = await StegoEngine.extractAuto(currentRevealCanvasData.imageData, pass);
        } else {
            const pastedText = inputRevealTextInput.value;
            if (!pastedText) throw new Error("Lütfen şifreli metni yapıştırın.");
            showStatus("Görünmez karakterler taranıyor...");
            const payload = ZeroWidthEngine.extractZeroWidth(pastedText);
            showStatus("Şifre çözülüyor (AES-256-GCM)...");
            decryptedBytes = await CryptoEngine.decryptBuffer(payload, pass);
            payload.fill(0);
        }

        const typeFlag = decryptedBytes[0];

        if (typeFlag === 0x10) {
            // Sıkıştırılmış Metin
            showStatus("Sıkıştırılmış metin açılıyor (Deflate)...");
            const decompressed = await CompressionEngine.decompress(decryptedBytes.subarray(1));
            const text = new TextDecoder().decode(decompressed);

            inputRevealText.value = text;
            inputRevealText.style.display = 'block';
            btnCopy.style.display = 'flex';
            btnDownloadFile.style.display = 'none';
            if (btnClearOutput) btnClearOutput.style.display = 'flex';
            showStatus("🎉 Gizli mesaj başarıyla çözüldü!");

        } else if (typeFlag === 0x00) {
            // Eski Sürüm / Düz Metin
            const text = new TextDecoder().decode(decryptedBytes.subarray(1));
            inputRevealText.value = text;
            inputRevealText.style.display = 'block';
            btnCopy.style.display = 'flex';
            btnDownloadFile.style.display = 'none';
            if (btnClearOutput) btnClearOutput.style.display = 'flex';
            showStatus("🎉 Gizli mesaj başarıyla çözüldü!");

        } else if (typeFlag === 0x11) {
            // Sıkıştırılmış Dosya
            const fileNameLen = decryptedBytes[1];
            if (decryptedBytes.length <= 2 + fileNameLen) {
                throw new Error("Bozuk veri paketi: dosya içeriği eksik veya hasarlı.");
            }
            let rawFileName = new TextDecoder().decode(decryptedBytes.subarray(2, 2 + fileNameLen));
            decryptedFileName = rawFileName.replace(/^.*[\\\/]/, '').trim() || 'gizli_dosya';
            showStatus(`"${decryptedFileName}" açılıyor (Deflate)...`);

            const compressedData = decryptedBytes.subarray(2 + fileNameLen);
            const decompressedData = await CompressionEngine.decompress(compressedData);
            decryptedFileBlob = new Blob([decompressedData]);

            inputRevealText.style.display = 'none';
            btnCopy.style.display = 'none';
            btnDownloadFile.style.display = 'flex';
            if (btnClearOutput) btnClearOutput.style.display = 'flex';

            const sizeDisplay = decryptedFileBlob.size >= 1024 * 1024 
                ? `${(decryptedFileBlob.size / (1024 * 1024)).toFixed(2)} MB`
                : `${Math.floor(decryptedFileBlob.size / 1024)} KB`;

            btnDownloadFile.innerText = `💾 "${decryptedFileName}" (${sizeDisplay}) İndir`;
            showStatus(`🎉 "${decryptedFileName}" isimli dosya (${sizeDisplay}) başarıyla çıkarıldı!`);

        } else if (typeFlag === 0x01) {
            // Eski Sürüm / Düz Dosya
            const fileNameLen = decryptedBytes[1];
            if (decryptedBytes.length <= 2 + fileNameLen) {
                throw new Error("Bozuk veri paketi: dosya içeriği eksik.");
            }
            let rawFileName = new TextDecoder().decode(decryptedBytes.subarray(2, 2 + fileNameLen));
            decryptedFileName = rawFileName.replace(/^.*[\\\/]/, '').trim() || 'gizli_dosya';
            const fileData = decryptedBytes.subarray(2 + fileNameLen);

            decryptedFileBlob = new Blob([fileData]);
            inputRevealText.style.display = 'none';
            btnCopy.style.display = 'none';
            btnDownloadFile.style.display = 'flex';
            if (btnClearOutput) btnClearOutput.style.display = 'flex';
            btnDownloadFile.innerText = `💾 "${decryptedFileName}" Dosyasını İndir`;
            showStatus(`🎉 "${decryptedFileName}" isimli gizli dosya başarıyla çıkarıldı!`);

        } else {
            throw new Error("Bilinmeyen veri türü veya bozuk veri paketi.");
        }

        inputRevealPass.value = '';
        decryptedBytes.fill(0);

    } catch (err) {
        showStatus("Çözülemedi: Parola yanlış veya metin/görselde şifreli veri yok.", true);
        console.error("Decrypt error:", err);
    } finally {
        setButtonsDisabled(false);
        btnDecrypt.disabled = false;
    }
});

// ---------- Çözülen Çıktıyı Temizle ----------
if (btnClearOutput) {
    btnClearOutput.addEventListener('click', () => {
        inputRevealText.value = '';
        inputRevealText.style.display = 'none';
        btnCopy.style.display = 'none';
        btnDownloadFile.style.display = 'none';
        btnClearOutput.style.display = 'none';
        decryptedFileBlob = null;
        decryptedFileName = '';
        clearClipboardTimeout();
        hideStatus();
    });
}

// ---------- Çözülen Dosyayı İndir ----------
btnDownloadFile.addEventListener('click', () => {
    if (!decryptedFileBlob) return;
    downloadBlob(decryptedFileBlob, decryptedFileName);
});

// ---------- Görünmez Metni Kopyala ----------
btnCopyInvisible.addEventListener('click', async () => {
    const text = textInvisibleOutput.value;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    showStatus("📋 Görünmez şifreli metin panoya kopyalandı! Doğrudan WhatsApp veya mesaja yapıştırabilirsiniz.");
});

// ---------- Panoya Kopyala ve Otomatik Temizle ----------
function clearClipboardTimeout() {
    if (copyTimeout) {
        clearTimeout(copyTimeout);
        copyTimeout = null;
    }
}

function startClipboardTimer() {
    clearClipboardTimeout();
    copyTimeout = setTimeout(async () => {
        try {
            await navigator.clipboard.writeText('');
            showStatus("🔒 Güvenlik uyarısı: Panodaki mesaj otomatik temizlendi.");
        } catch {
            // Pano erişim engeli
        }
        copyTimeout = null;
    }, 30000);
}

btnCopy.addEventListener('click', async () => {
    const text = inputRevealText.value;
    if (!text) return;

    await navigator.clipboard.writeText(text);
    showStatus("📋 Mesaj panoya kopyalandı. 30 saniye sonra panodan otomatik silinecektir.");

    startClipboardTimer();
});

// Sekme değişiminde panoyu temizleme
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        clearClipboardTimeout();
    } else {
        if (inputRevealText.value && inputRevealText.style.display !== 'none') {
            startClipboardTimer();
        }
    }
});

// Sayfa kapanırken panoyu ve URL'leri temizle
window.addEventListener('beforeunload', () => {
    clearClipboardTimeout();
    if (previewHide && previewHide._objectUrl) URL.revokeObjectURL(previewHide._objectUrl);
    if (previewReveal && previewReveal._objectUrl) URL.revokeObjectURL(previewReveal._objectUrl);
});

// ---------- STEGANALİZ & LSB RÖNTGENİ İŞLEMLERİ ----------
function getSelectedInspectChannel() {
    if (inspectChanRed && inspectChanRed.checked) return 'red';
    if (inspectChanGreen && inspectChanGreen.checked) return 'green';
    if (inspectChanBlue && inspectChanBlue.checked) return 'blue';
    return 'all';
}

function updateInspectBitPlane() {
    if (!currentInspectImageData || !canvasInspect) return;
    const channel = getSelectedInspectChannel();
    const bitPlane = SteganalysisEngine.renderBitPlane(currentInspectImageData, channel, 1);
    canvasInspect.width = bitPlane.width;
    canvasInspect.height = bitPlane.height;
    const ctx = canvasInspect.getContext('2d');
    ctx.putImageData(bitPlane, 0, 0);
}

async function processInspectFile(file) {
    if (!file) return;
    try {
        showStatus("Görsel taranıyor ve steganaliz yapılıyor...");
        const img = await ImageEngine.loadImage(file, (msg) => showStatus(msg));
        const { imageData } = ImageEngine.processToCanvas(img, 1920);
        currentInspectImageData = imageData;

        // 1. Bit Düzlemi çiz
        updateInspectBitPlane();

        // 2. Chi-Square testi
        const result = SteganalysisEngine.analyzeChiSquare(currentInspectImageData);
        inspectProbBadge.innerText = `%${result.probability}`;
        if (result.probability >= 75) {
            inspectProbBadge.style.color = 'var(--md-error)';
            inspectProbBadge.style.backgroundColor = 'var(--md-error-container)';
        } else if (result.probability >= 40) {
            inspectProbBadge.style.color = '#ffd180';
            inspectProbBadge.style.backgroundColor = '#4e342e';
        } else {
            inspectProbBadge.style.color = 'var(--md-on-primary-container)';
            inspectProbBadge.style.backgroundColor = 'var(--md-primary-container)';
        }

        inspectVerdict.innerText = result.verdict;
        inspectDetails.innerText = result.details;
        inspectStats.innerText = `χ²: ${result.chiSquare} | Serbestlik Derecesi: ${result.dof}`;

        inspectControls.style.display = 'block';
        hideStatus();
    } catch (err) {
        showStatus("Steganaliz hatası: " + err.message, true);
    }
}

if (fileInspectInput) fileInspectInput.addEventListener('change', (e) => processInspectFile(e.target.files[0]));
if (dropzoneInspect) setupDropzone(dropzoneInspect, processInspectFile);

[inspectChanAll, inspectChanRed, inspectChanGreen, inspectChanBlue].forEach(r => {
    if (r) r.addEventListener('change', updateInspectBitPlane);
});

// ---------- QR KOD ÜRETİCİ & TARAYICI İŞLEMLERİ ----------
if (btnShowQr) {
    btnShowQr.addEventListener('click', () => {
        if (!currentQrPayload) {
            showStatus("Gösterilebilecek QR kod verisi bulunamadı.", true);
            return;
        }
        try {
            showStatus("QR kod oluşturuluyor...");
            QREngine.renderToCanvas(canvasQr, currentQrPayload);
            containerQrPreview.style.display = 'block';
            containerQrPreview.scrollIntoView({ behavior: 'smooth' });
            hideStatus();
        } catch (err) {
            showStatus("QR Kod üretilemedi: " + err.message, true);
        }
    });
}

if (btnCloseQr) {
    btnCloseQr.addEventListener('click', () => {
        containerQrPreview.style.display = 'none';
    });
}

if (btnDownloadQr) {
    btnDownloadQr.addEventListener('click', () => {
        if (!canvasQr) return;
        canvasQr.toBlob((blob) => {
            if (blob) downloadBlob(blob, 'stego_qr.png');
        }, 'image/png');
    });
}

async function handleQrScanFile(file) {
    if (!file) return;
    try {
        showStatus("Görsel taranıyor ve QR kod okunuyor...");
        const scannedText = await QREngine.scanFromFile(file);
        if (!scannedText) {
            throw new Error("Görselde herhangi bir QR kod tespit edilemedi.");
        }
        inputRevealTextInput.value = scannedText;
        if (labelQrScan) labelQrScan.innerText = `✅ QR Kod Okundu: ${file.name}`;
        showStatus("🎉 QR Kod başarıyla okundu! Metin aktarıldı. Lütfen parolanızı girip 'İçeriği Çöz' butonuna basın.");
        inputRevealPass.focus();
    } catch (err) {
        showStatus("QR Tarama Hatası: " + err.message, true);
    }
}

if (fileQrScan) fileQrScan.addEventListener('change', (e) => handleQrScanFile(e.target.files[0]));
if (dropzoneQrScan) setupDropzone(dropzoneQrScan, handleQrScanFile);

// ---------- Service Worker Kaydı ----------
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.error('ServiceWorker kayıt hatası: ', err);
        });
    });
}

// ---------- Başlangıç & Bütünlük Kontrolleri ----------
const canvasCheck = ImageEngine.verifyCanvasIntegrity();
if (canvasCheck.farblingDetected) {
    const bannerCanvasWarning = document.getElementById('banner-canvas-warning');
    if (bannerCanvasWarning) bannerCanvasWarning.style.display = 'flex';
    console.warn("StegoCrypt Canvas Uyarısı:", canvasCheck.reason);
}

updateHideModeUI();