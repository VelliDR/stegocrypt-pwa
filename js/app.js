/**
 * js/app.js - Tüm Motorları ve Arayüzü Bağlayan Ana Dosya
 */
import { CryptoEngine } from './CryptoEngine.js';
import { StegoEngine } from './StegoEngine.js';
import { ImageEngine } from './ImageEngine.js';
import { ZeroWidthEngine } from './ZeroWidthEngine.js';

// Durum Değişkenleri
let currentHideCanvasData = null;
let currentRevealCanvasData = null;
let generatedBlob = null;
let decryptedFileBlob = null;
let decryptedFileName = "";
let selectedSecretFile = null;
let copyTimeout = null;

// DOM Elemanları
const btnTabHide = document.getElementById('btn-tab-hide');
const btnTabReveal = document.getElementById('btn-tab-reveal');
const tabHide = document.getElementById('tab-hide');
const tabReveal = document.getElementById('tab-reveal');
const statusEl = document.getElementById('status-msg');

const typeTextRadio = document.getElementById('type-text');
const typeFileRadio = document.getElementById('type-file');
const typeInvisibleRadio = document.getElementById('type-invisible');

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

// Yardımcı Fonksiyonlar
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
    if (mode === 'hide') {
        btnTabHide.classList.add('active');
        btnTabReveal.classList.remove('active');
        tabHide.classList.add('active');
        tabReveal.classList.remove('active');
    } else {
        btnTabReveal.classList.add('active');
        btnTabHide.classList.remove('active');
        tabReveal.classList.add('active');
        tabHide.classList.remove('active');
    }
}

function downloadBlob(blob, filename = 'stego_secret.png') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

// Olay Dinleyicileri (Gizleme Türü Değişimi)
btnTabHide.addEventListener('click', () => switchTab('hide'));
btnTabReveal.addEventListener('click', () => switchTab('reveal'));

typeTextRadio.addEventListener('change', updateHideModeUI);
typeFileRadio.addEventListener('change', updateHideModeUI);
typeInvisibleRadio.addEventListener('change', updateHideModeUI);

function updateHideModeUI() {
    if (typeTextRadio.checked) {
        containerImageInput.style.display = 'block';
        containerTextInput.style.display = 'block';
        containerFileInput.style.display = 'none';
        containerCoverInput.style.display = 'none';
        containerInvisibleOutput.style.display = 'none';
        btnShare.style.display = 'none';
    } else if (typeFileRadio.checked) {
        containerImageInput.style.display = 'block';
        containerTextInput.style.display = 'none';
        containerFileInput.style.display = 'block';
        containerCoverInput.style.display = 'none';
        containerInvisibleOutput.style.display = 'none';
        btnShare.style.display = 'none';
    } else if (typeInvisibleRadio.checked) {
        containerImageInput.style.display = 'none';
        containerTextInput.style.display = 'block';
        containerFileInput.style.display = 'none';
        containerCoverInput.style.display = 'block';
        btnShare.style.display = 'none';
    }
}

revealTypeImageRadio.addEventListener('change', () => {
    containerRevealImage.style.display = 'block';
    containerRevealText.style.display = 'none';
});

revealTypeTextRadio.addEventListener('change', () => {
    containerRevealImage.style.display = 'none';
    containerRevealText.style.display = 'block';
});

fileSecretInput.addEventListener('change', (e) => {
    selectedSecretFile = e.target.files[0];
    if (selectedSecretFile) {
        labelSecretFile.innerText = `📄 Seçilen: ${selectedSecretFile.name} (${Math.floor(selectedSecretFile.size / 1024)} KB)`;
    }
});

// Canlı Kapasite Sayacı
inputHideText.addEventListener('input', () => {
    if (!currentHideCanvasData || typeInvisibleRadio.checked) return;
    const used = inputHideText.value.length;
    const max = currentHideCanvasData.maxCapacityBytes;
    const kb = Math.floor(max / 1024);
    
    document.getElementById('capacity-text').innerText = 
        `Kapasite: ${used} / ${max} Karakter (~${kb} KB)`;
    
    if (used > max) {
        showStatus("Yazdığınız metin görsel kapasitesini aşıyor!", true);
    } else {
        hideStatus();
    }
});

// GİZLEME SEKMESİ: Görsel Yükleme
document.getElementById('file-hide').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        showStatus("Görsel işleniyor...");
        const img = await ImageEngine.loadImage(file);
        currentHideCanvasData = ImageEngine.processToCanvas(img);

        const preview = document.getElementById('preview-hide');
        preview.src = URL.createObjectURL(file);
        preview.style.display = 'block';

        const capKB = Math.floor(currentHideCanvasData.maxCapacityBytes / 1024);
        document.getElementById('capacity-text').innerText = 
            `Maksimum Kapasite: ~${capKB} KB (${currentHideCanvasData.maxCapacityBytes} Karakter)`;
        
        hideStatus();
    } catch (err) {
        showStatus(err.message, true);
    }
});

// GİZLEME SEKMESİ: Şifrele & Göm
btnEncrypt.addEventListener('click', async () => {
    const pass = inputHidePass.value;
    if (!pass) return showStatus("Şifreleme parolasını girin.", true);

    const isFileMode = typeFileRadio.checked;
    const isInvisibleMode = typeInvisibleRadio.checked;
    let rawBufferToEncrypt = null;

    try {
        if (isFileMode) {
            if (!currentHideCanvasData) return showStatus("Lütfen taşıyıcı görsel seçin.", true);
            if (!selectedSecretFile) return showStatus("Lütfen gömülecek dosyayı seçin.", true);
            
            const fileNameBytes = new TextEncoder().encode(selectedSecretFile.name);
            const fileArrayBuffer = await selectedSecretFile.arrayBuffer();
            const fileBytes = new Uint8Array(fileArrayBuffer);

            rawBufferToEncrypt = new Uint8Array(1 + 1 + fileNameBytes.length + fileBytes.length);
            rawBufferToEncrypt[0] = 0x01; // Type = File
            rawBufferToEncrypt[1] = fileNameBytes.length;
            rawBufferToEncrypt.set(fileNameBytes, 2);
            rawBufferToEncrypt.set(fileBytes, 2 + fileNameBytes.length);

        } else {
            const text = inputHideText.value.trim();
            if (!text) return showStatus("Gizlenecek metni girin.", true);

            const textBytes = new TextEncoder().encode(text);
            rawBufferToEncrypt = new Uint8Array(1 + textBytes.length);
            rawBufferToEncrypt[0] = 0x00; // Type = Text
            rawBufferToEncrypt.set(textBytes, 1);
        }

        showStatus("Veri şifreleniyor...");
        const payload = await CryptoEngine.encryptBuffer(rawBufferToEncrypt, pass);

        if (isInvisibleMode) {
            // Görünmez Metin Modu
            const coverText = inputCoverText.value || "Selam, nasılsın?";
            const zeroWidthData = ZeroWidthEngine.encode(payload);
            const finalInvisibleText = coverText + zeroWidthData;

            textInvisibleOutput.value = finalInvisibleText;
            containerInvisibleOutput.style.display = 'block';

            payload.fill(0);
            rawBufferToEncrypt.fill(0);
            inputHidePass.value = '';
            inputHideText.value = '';

            showStatus("👻 Görünmez şifreli metin hazır! Aşağıdan kopyalayabilirsiniz.");
        } else {
            // Görsel LSB Modu
            if (!currentHideCanvasData) return showStatus("Lütfen taşıyıcı görsel seçin.", true);

            const modifiedImageData = StegoEngine.embed(currentHideCanvasData.imageData, payload);
            currentHideCanvasData.ctx.putImageData(modifiedImageData, 0, 0);

            payload.fill(0);
            rawBufferToEncrypt.fill(0);
            inputHidePass.value = '';
            inputHideText.value = '';

            currentHideCanvasData.canvas.toBlob((blob) => {
                generatedBlob = blob;
                showStatus("✅ İŞLEM BAŞARILI! Şifreli PNG görseli hazır.");
                btnShare.style.display = 'flex';
            }, 'image/png');
        }

    } catch (err) {
        showStatus("Hata: " + err.message, true);
    }
});

// Paylaş / İndir
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

// ÇÖZME SEKMESİ: Görsel Yükleme
document.getElementById('file-reveal').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const img = await ImageEngine.loadImage(file);
        const maxDim = Math.max(img.width, img.height);
        currentRevealCanvasData = ImageEngine.processToCanvas(img, maxDim);

        const preview = document.getElementById('preview-reveal');
        preview.src = URL.createObjectURL(file);
        preview.style.display = 'block';
        hideStatus();
    } catch (err) {
        showStatus(err.message, true);
    }
});

// ÇÖZME SEKMESİ: İçeriği Çöz
btnDecrypt.addEventListener('click', async () => {
    const pass = inputRevealPass.value;
    if (!pass) return showStatus("Parolayı girin.", true);

    const isImageReveal = revealTypeImageRadio.checked;

    try {
        let payload = null;

        if (isImageReveal) {
            if (!currentRevealCanvasData) return showStatus("Lütfen şifreli PNG seçin.", true);
            showStatus("Pikseller taranıyor...");
            payload = StegoEngine.extract(currentRevealCanvasData.imageData);
        } else {
            const pastedText = inputRevealTextInput.value;
            if (!pastedText) return showStatus("Lütfen şifreli metni yapıştırın.", true);
            showStatus("Görünmez karakterler taranıyor...");
            payload = ZeroWidthEngine.extractZeroWidth(pastedText);
        }

        const decryptedBytes = await CryptoEngine.decryptBuffer(payload, pass);
        payload.fill(0);
        const typeFlag = decryptedBytes[0];

        if (typeFlag === 0x00) {
            // Metin Çözüldü
            const text = new TextDecoder().decode(decryptedBytes.slice(1));
            inputRevealText.value = text;
            inputRevealText.style.display = 'block';
            btnCopy.style.display = 'flex';
            btnDownloadFile.style.display = 'none';
            showStatus("🎉 Gizli mesaj başarıyla çözüldü!");
        } else if (typeFlag === 0x01) {
            // Dosya Çözüldü
            const fileNameLen = decryptedBytes[1];
            decryptedFileName = new TextDecoder().decode(decryptedBytes.slice(2, 2 + fileNameLen));
            const fileData = decryptedBytes.slice(2 + fileNameLen);

            decryptedFileBlob = new Blob([fileData]);
            
            inputRevealText.style.display = 'none';
            btnCopy.style.display = 'none';
            btnDownloadFile.style.display = 'flex';
            btnDownloadFile.innerText = `💾 "${decryptedFileName}" Dosyasını İndir`;
            showStatus(`🎉 "${decryptedFileName}" isimli gizli dosya başarıyla çıkarıldı!`);
        }

        inputRevealPass.value = '';
        decryptedBytes.fill(0);

    } catch (err) {
        showStatus("Çözülemedi: Parola yanlış veya metin/görselde şifreli veri yok.", true);
    }
});

// Çözülen Dosyayı İndir
btnDownloadFile.addEventListener('click', () => {
    if (!decryptedFileBlob) return;
    downloadBlob(decryptedFileBlob, decryptedFileName);
});

// Görünmez Metni Kopyala
btnCopyInvisible.addEventListener('click', async () => {
    const text = textInvisibleOutput.value;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    showStatus("📋 Görünmez şifreli metin panoya kopyalandı! Doğrudan WhatsApp veya mesaja yapıştırabilirsiniz.");
});

// Panoya Kopyala ve 30s Sonra Temizle
btnCopy.addEventListener('click', async () => {
    const text = inputRevealText.value;
    if (!text) return;

    await navigator.clipboard.writeText(text);
    showStatus("📋 Mesaj panoya kopyalandı. 30 saniye sonra panodan otomatik silinecektir.");

    if (copyTimeout) clearTimeout(copyTimeout);
    
    copyTimeout = setTimeout(async () => {
        try {
            await navigator.clipboard.writeText('');
            showStatus("🔒 Güvenlik uyarısı: Panodaki mesaj otomatik temizlendi.");
        } catch {
            // Pano erişim engeli
        }
    }, 30000);
});