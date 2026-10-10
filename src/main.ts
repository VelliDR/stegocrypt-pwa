/**
 * src/main.ts
 * StegoCrypt TypeScript v3.1.0 - Main Application Controller.
 * Zero-shortcuts, strictly typed, memory-zeroizing frontend orchestrator.
 */

import { StegoWorkerClient } from './workers/StegoWorkerClient.ts';
import { ImageEngine } from './codec/ImageEngine.ts';
import { CompressionEngine } from './codec/CompressionEngine.ts';
import { ZeroWidthEngine } from './stego/ZeroWidthEngine.ts';
import { ZeroWidthDetector } from './forensics/ZeroWidthDetector.ts';
import { CryptoEngine } from './crypto/CryptoEngine.ts';
import type { LsbMode, EmbedMethod, DistributionMode, SimpleImageData } from './types/index.ts';

// State Variables
let currentCarrierImageData: SimpleImageData | null = null;
let currentRevealImageData: SimpleImageData | null = null;
let currentInspectImageData: SimpleImageData | null = null;
let diffOrigImageData: SimpleImageData | null = null;
let diffStegoImageData: SimpleImageData | null = null;
let generatedPngBlob: Blob | null = null;
let decryptedFileBlob: Blob | null = null;
let decryptedFileName: string = 'decrypted_secret.bin';
let selectedSecretFile: File | null = null;
let clipboardClearTimer: ReturnType<typeof setTimeout> | null = null;

// Helper: DOM Element selector with validation
function getEl<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id) as T | null;
    if (!el) throw new Error(`DOM element not found: #${id}`);
    return el;
}

// DOM Elements
const btnTabHide = getEl<HTMLButtonElement>('btn-tab-hide');
const btnTabReveal = getEl<HTMLButtonElement>('btn-tab-reveal');
const btnTabInspect = getEl<HTMLButtonElement>('btn-tab-inspect');
const tabHide = getEl<HTMLElement>('tab-hide');
const tabReveal = getEl<HTMLElement>('tab-reveal');
const tabInspect = getEl<HTMLElement>('tab-inspect');
const statusMsg = getEl<HTMLElement>('status-msg');

const progressContainer = getEl<HTMLElement>('progress-container');
const progressBarFill = getEl<HTMLElement>('progress-bar-fill');
const progressTextLabel = getEl<HTMLElement>('progress-text-label');
const progressTextPercent = getEl<HTMLElement>('progress-text-percent');

// Hide Tab Elements
const typeTextRadio = getEl<HTMLInputElement>('type-text');
const typeFileRadio = getEl<HTMLInputElement>('type-file');
const typeInvisibleRadio = getEl<HTMLInputElement>('type-invisible');

const containerImageInput = getEl<HTMLElement>('container-image-input');
const dropzoneHide = getEl<HTMLElement>('dropzone-hide');
const fileHideInput = getEl<HTMLInputElement>('file-hide');
const previewHide = getEl<HTMLImageElement>('preview-hide');

const containerDensityInput = getEl<HTMLElement>('container-density-input');
const density1lsbRadio = getEl<HTMLInputElement>('density-1lsb');

const containerScatterInput = getEl<HTMLElement>('container-scatter-input');
const scatterModeAdaptive = getEl<HTMLInputElement>('scatter-mode-adaptive');
const scatterModePrng = getEl<HTMLInputElement>('scatter-mode-prng');

const containerRiskIndicator = getEl<HTMLElement>('container-risk-indicator');
const riskBadge = getEl<HTMLElement>('risk-badge');
const riskProgressBar = getEl<HTMLElement>('risk-progress-bar');
const riskMessage = getEl<HTMLElement>('risk-message');

const containerMethodInput = getEl<HTMLElement>('container-method-input');
const methodMatching = getEl<HTMLInputElement>('method-matching');

const containerKdfInput = getEl<HTMLElement>('container-kdf-input');
const kdfArgon2idRadio = getEl<HTMLInputElement>('kdf-argon2id');

const checkDeniable = getEl<HTMLInputElement>('check-deniable');
const containerDeniableFields = getEl<HTMLElement>('container-deniable-fields');
const textDecoy = getEl<HTMLTextAreaElement>('text-decoy');
const passDecoy = getEl<HTMLInputElement>('pass-decoy');

const containerCoverInput = getEl<HTMLElement>('container-cover-input');
const textCover = getEl<HTMLInputElement>('text-cover');
const containerTextInput = getEl<HTMLElement>('container-text-input');
const textHide = getEl<HTMLTextAreaElement>('text-hide');

const containerFileInput = getEl<HTMLElement>('container-file-input');
const fileSecretInput = getEl<HTMLInputElement>('file-secret-input');
const labelSecretFile = getEl<HTMLElement>('label-secret-file');

const passHide = getEl<HTMLInputElement>('pass-hide');
const btnEncrypt = getEl<HTMLButtonElement>('btn-encrypt');
const btnShare = getEl<HTMLButtonElement>('btn-share');

const containerInvisibleOutput = getEl<HTMLElement>('container-invisible-output');
const textInvisibleOutput = getEl<HTMLTextAreaElement>('text-invisible-output');
const btnCopyInvisible = getEl<HTMLButtonElement>('btn-copy-invisible');

// Reveal Tab Elements
const revealTypeImageRadio = getEl<HTMLInputElement>('reveal-type-image');
const revealTypeTextRadio = getEl<HTMLInputElement>('reveal-type-text');
const containerRevealImage = getEl<HTMLElement>('container-reveal-image');
const containerRevealText = getEl<HTMLElement>('container-reveal-text');
const fileRevealInput = getEl<HTMLInputElement>('file-reveal');
const previewReveal = getEl<HTMLImageElement>('preview-reveal');
const textRevealInput = getEl<HTMLTextAreaElement>('text-reveal-input');
const passReveal = getEl<HTMLInputElement>('pass-reveal');
const btnDecrypt = getEl<HTMLButtonElement>('btn-decrypt');
const textReveal = getEl<HTMLTextAreaElement>('text-reveal');
const btnDownloadFile = getEl<HTMLButtonElement>('btn-download-file');
const btnCopy = getEl<HTMLButtonElement>('btn-copy');
const btnClearOutput = getEl<HTMLButtonElement>('btn-clear-output');

// Inspect Tab Elements
const subtabBtns = [
    getEl<HTMLButtonElement>('btn-subtab-lsb'),
    getEl<HTMLButtonElement>('btn-subtab-binary'),
    getEl<HTMLButtonElement>('btn-subtab-diff'),
    getEl<HTMLButtonElement>('btn-subtab-zerowidth'),
    getEl<HTMLButtonElement>('btn-subtab-zsteg')
];
const subtabContents = [
    getEl<HTMLElement>('subtab-content-lsb'),
    getEl<HTMLElement>('subtab-content-binary'),
    getEl<HTMLElement>('subtab-content-diff'),
    getEl<HTMLElement>('subtab-content-zerowidth'),
    getEl<HTMLElement>('subtab-content-zsteg')
];

// UI Helpers
function showStatus(text: string, isSuccess: boolean): void {
    statusMsg.textContent = text;
    statusMsg.className = `m3-status ${isSuccess ? 'success' : 'error'}`;
    statusMsg.style.display = 'block';
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function clearStatus(): void {
    statusMsg.style.display = 'none';
    statusMsg.textContent = '';
}

function updateProgress(percent: number, text: string): void {
    progressContainer.style.display = 'block';
    progressBarFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    progressTextLabel.textContent = text;
    progressTextPercent.textContent = `%${Math.round(percent)}`;
    if (percent >= 100) {
        setTimeout(() => {
            progressContainer.style.display = 'none';
        }, 1200);
    }
}

// -----------------------------------------------------------------------------
// Tab Switching
// -----------------------------------------------------------------------------
function activateTab(tab: 'hide' | 'reveal' | 'inspect'): void {
    clearStatus();
    btnTabHide.classList.toggle('active', tab === 'hide');
    btnTabReveal.classList.toggle('active', tab === 'reveal');
    btnTabInspect.classList.toggle('active', tab === 'inspect');

    tabHide.classList.toggle('active', tab === 'hide');
    tabReveal.classList.toggle('active', tab === 'reveal');
    tabInspect.classList.toggle('active', tab === 'inspect');
}

btnTabHide.addEventListener('click', () => activateTab('hide'));
btnTabReveal.addEventListener('click', () => activateTab('reveal'));
btnTabInspect.addEventListener('click', () => activateTab('inspect'));

// Subtab Switching
subtabBtns.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
        subtabBtns.forEach(b => b.classList.remove('active'));
        subtabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        subtabContents[idx]?.classList.add('active');
    });
});

// -----------------------------------------------------------------------------
// Hide Mode Switching
// -----------------------------------------------------------------------------
function updateHideModeUI(): void {
    const isText = typeTextRadio.checked;
    const isFile = typeFileRadio.checked;
    const isInv = typeInvisibleRadio.checked;

    containerImageInput.style.display = isInv ? 'none' : 'block';
    containerDensityInput.style.display = isInv ? 'none' : 'block';
    containerScatterInput.style.display = isInv ? 'none' : 'block';
    containerMethodInput.style.display = isInv ? 'none' : 'block';
    containerKdfInput.style.display = isInv ? 'none' : 'block';
    getEl('container-deniable-toggle').style.display = isInv ? 'none' : 'block';

    containerCoverInput.style.display = isInv ? 'block' : 'none';
    containerTextInput.style.display = isText ? 'block' : 'none';
    containerFileInput.style.display = isFile ? 'block' : 'none';

    updateRiskAssessment();
}

typeTextRadio.addEventListener('change', updateHideModeUI);
typeFileRadio.addEventListener('change', updateHideModeUI);
typeInvisibleRadio.addEventListener('change', updateHideModeUI);

checkDeniable.addEventListener('change', () => {
    containerDeniableFields.style.display = checkDeniable.checked ? 'block' : 'none';
    updateRiskAssessment();
});

// -----------------------------------------------------------------------------
// Carrier Image Selection & Risk Assessment
// -----------------------------------------------------------------------------
fileHideInput.addEventListener('change', async () => {
    const file = fileHideInput.files?.[0];
    if (!file) return;

    try {
        const safety = ImageEngine.checkCarrierSafety(file);
        if (safety.warning) {
            showStatus(`Uyarı: ${safety.warning}`, false);
        }

        currentCarrierImageData = await ImageEngine.loadImageData(file);
        previewHide.src = URL.createObjectURL(file);
        previewHide.style.display = 'block';

        updateRiskAssessment();
    } catch (err: any) {
        showStatus(`Görsel yüklenemedi: ${err.message}`, false);
    }
});

// Drag and Drop for Carrier Dropzone
['dragover', 'dragenter'].forEach(ev => {
    dropzoneHide.addEventListener(ev, (e) => {
        e.preventDefault();
        dropzoneHide.classList.add('dragover');
    });
});
['dragleave', 'drop'].forEach(ev => {
    dropzoneHide.addEventListener(ev, (e) => {
        e.preventDefault();
        dropzoneHide.classList.remove('dragover');
    });
});
dropzoneHide.addEventListener('drop', (e: DragEvent) => {
    if (e.dataTransfer?.files?.[0]) {
        fileHideInput.files = e.dataTransfer.files;
        fileHideInput.dispatchEvent(new Event('change'));
    }
});

function updateRiskAssessment(): void {
    if (!currentCarrierImageData || typeInvisibleRadio.checked) {
        containerRiskIndicator.style.display = 'none';
        return;
    }

    let payloadBytes = 0;
    if (typeTextRadio.checked) {
        payloadBytes = new TextEncoder().encode(textHide.value).length;
    } else if (typeFileRadio.checked && selectedSecretFile) {
        payloadBytes = selectedSecretFile.size + 64;
    }

    if (checkDeniable.checked) {
        payloadBytes += new TextEncoder().encode(textDecoy.value).length + 64;
    }

    const lsbMode: LsbMode = density1lsbRadio.checked ? 1 : 2;

    StegoWorkerClient.execute('CALCULATE_RISK', {
        pixelBuffer: currentCarrierImageData.data.buffer.slice(0),
        width: currentCarrierImageData.width,
        height: currentCarrierImageData.height,
        payloadBytes,
        lsbMode
    }).then((res: any) => {
        const risk = res.risk;
        containerRiskIndicator.style.display = 'block';
        riskBadge.textContent = risk.label.toUpperCase();
        riskBadge.style.backgroundColor = risk.badgeColor;
        riskProgressBar.style.width = `${Math.min(100, risk.usagePercent)}%`;
        riskProgressBar.style.backgroundColor = risk.badgeColor;
        riskMessage.textContent = risk.message;
    }).catch(() => {
        containerRiskIndicator.style.display = 'none';
    });
}

textHide.addEventListener('input', updateRiskAssessment);
textDecoy.addEventListener('input', updateRiskAssessment);

fileSecretInput.addEventListener('change', () => {
    selectedSecretFile = fileSecretInput.files?.[0] || null;
    if (selectedSecretFile) {
        labelSecretFile.textContent = `📁 ${selectedSecretFile.name} (${Math.round(selectedSecretFile.size / 1024)} KB)`;
    }
    updateRiskAssessment();
});

// -----------------------------------------------------------------------------
// Encryption Action
// -----------------------------------------------------------------------------
btnEncrypt.addEventListener('click', async () => {
    clearStatus();
    btnShare.style.display = 'none';
    generatedPngBlob = null;

    try {
        const pass = passHide.value.trim();
        if (!pass) {
            showStatus("Lütfen şifreleme parolası girin.", false);
            return;
        }

        // 1. Görünmez Metin Modu
        if (typeInvisibleRadio.checked) {
            const secret = textHide.value;
            if (!secret) {
                showStatus("Lütfen gizlenecek metni girin.", false);
                return;
            }

            updateProgress(30, "Metin şifreleniyor (AES-256-GCM)...");
            const rawBytes = new TextEncoder().encode(secret);
            const encryptedBytes = await CryptoEngine.encryptBuffer(rawBytes, pass);

            updateProgress(70, "Sıfır genişlikli karakterlere kodlanıyor...");
            const invisible = ZeroWidthEngine.encode(encryptedBytes);
            const cover = textCover.value || "Selam, nasılsın?";
            const finalInvisibleText = `${cover} ${invisible}`;

            textInvisibleOutput.value = finalInvisibleText;
            containerInvisibleOutput.style.display = 'block';
            updateProgress(100, "Görünmez metin başarıyla oluşturuldu!");
            showStatus("Görünmez metin hazır! WhatsApp veya metin uygulamalarına kopyalayabilirsiniz.", true);
            return;
        }

        // 2. Görsel Steganografi Modu
        if (!currentCarrierImageData) {
            showStatus("Lütfen bir taşıyıcı görsel seçin.", false);
            return;
        }

        let rawBuffer: ArrayBuffer;
        if (typeTextRadio.checked) {
            const text = textHide.value;
            if (!text) {
                showStatus("Lütfen gizlenecek metni girin.", false);
                return;
            }
            const encoded = new TextEncoder().encode(text);
            updateProgress(10, "Veri sıkıştırılıyor (Deflate)...");
            const compressed = await CompressionEngine.compress(encoded);
            rawBuffer = compressed.buffer as ArrayBuffer;
        } else {
            if (!selectedSecretFile) {
                showStatus("Lütfen gizlenecek bir dosya seçin.", false);
                return;
            }
            const fileBuf = await selectedSecretFile.arrayBuffer();
            const metaHeader = new TextEncoder().encode(JSON.stringify({ n: selectedSecretFile.name, s: selectedSecretFile.size }) + '\n');
            const merged = new Uint8Array(metaHeader.length + fileBuf.byteLength);
            merged.set(metaHeader, 0);
            merged.set(new Uint8Array(fileBuf), metaHeader.length);

            updateProgress(10, "Dosya sıkıştırılıyor (Deflate)...");
            const compressed = await CompressionEngine.compress(merged);
            rawBuffer = compressed.buffer as ArrayBuffer;
        }

        const lsbMode: LsbMode = density1lsbRadio.checked ? 1 : 2;
        const method: EmbedMethod = methodMatching.checked ? 'matching' : 'replacement';
        const distribution: DistributionMode = scatterModeAdaptive.checked
            ? 'adaptive'
            : scatterModePrng.checked
            ? 'scattered'
            : 'sequential';
        const kdfType = kdfArgon2idRadio.checked ? 'argon2id' : 'pbkdf2';

        let rawDecoy: ArrayBuffer | null = null;
        let passDecoyStr: string | null = null;
        const isDeniable = checkDeniable.checked;

        if (isDeniable) {
            passDecoyStr = passDecoy.value.trim();
            if (!passDecoyStr || !textDecoy.value.trim()) {
                showStatus("Lütfen tuzak katman mesajı ve parolasını doldurun.", false);
                return;
            }
            const decoyEncoded = new TextEncoder().encode(textDecoy.value);
            const decoyComp = await CompressionEngine.compress(decoyEncoded);
            rawDecoy = decoyComp.buffer as ArrayBuffer;
        }

        const pixelBufferCopy = currentCarrierImageData.data.buffer.slice(0);
        const transferables: Transferable[] = [pixelBufferCopy, rawBuffer];
        if (rawDecoy) transferables.push(rawDecoy);

        try {
            const workerResult = await StegoWorkerClient.execute<{
                pngBytes: ArrayBuffer;
            }>(
                'ENCRYPT_V3',
                {
                    pixelBuffer: pixelBufferCopy,
                    width: currentCarrierImageData.width,
                    height: currentCarrierImageData.height,
                    rawBuffer,
                    pass,
                    lsbMode,
                    method,
                    distribution,
                    kdfType,
                    isDeniable,
                    rawDecoy,
                    passDecoy: passDecoyStr
                },
                transferables,
                (pct, txt) => updateProgress(pct, txt)
            );

            generatedPngBlob = new Blob([workerResult.pngBytes], { type: 'image/png' });
            btnShare.style.display = 'block';
            showStatus("Şifreleme ve görsel içine gömme başarıyla tamamlandı! İndirebilirsiniz.", true);
        } finally {
            // Bellek temizliği (Zeroization)
            if (rawBuffer && rawBuffer.byteLength > 0) new Uint8Array(rawBuffer).fill(0);
            if (rawDecoy && rawDecoy.byteLength > 0) new Uint8Array(rawDecoy).fill(0);
        }

    } catch (err: any) {
        showStatus(`Şifreleme hatası: ${err.message}`, false);
    }
});

btnShare.addEventListener('click', () => {
    if (!generatedPngBlob) return;
    const url = URL.createObjectURL(generatedPngBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stegocrypt_v3_${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
});

btnCopyInvisible.addEventListener('click', async () => {
    if (!textInvisibleOutput.value) return;
    await navigator.clipboard.writeText(textInvisibleOutput.value);
    showStatus("Görünmez metin panoya kopyalandı!", true);
});

// -----------------------------------------------------------------------------
// Reveal Mode Switching & Decryption
// -----------------------------------------------------------------------------
revealTypeImageRadio.addEventListener('change', () => {
    containerRevealImage.style.display = 'block';
    containerRevealText.style.display = 'none';
});
revealTypeTextRadio.addEventListener('change', () => {
    containerRevealImage.style.display = 'none';
    containerRevealText.style.display = 'block';
});

fileRevealInput.addEventListener('change', async () => {
    const file = fileRevealInput.files?.[0];
    if (!file) return;
    try {
        currentRevealImageData = await ImageEngine.loadImageData(file);
        previewReveal.src = URL.createObjectURL(file);
        previewReveal.style.display = 'block';
    } catch (err: any) {
        showStatus(`Görsel açılamadı: ${err.message}`, false);
    }
});

btnDecrypt.addEventListener('click', async () => {
    clearStatus();
    textReveal.style.display = 'none';
    btnDownloadFile.style.display = 'none';
    btnCopy.style.display = 'none';
    btnClearOutput.style.display = 'none';

    try {
        const pass = passReveal.value.trim();
        if (!pass) {
            showStatus("Lütfen şifre çözme parolasını girin.", false);
            return;
        }

        // Görünmez Metin Çözme
        if (revealTypeTextRadio.checked) {
            const rawText = textRevealInput.value;
            if (!rawText) {
                showStatus("Lütfen çözülecek şifreli metni yapıştırın.", false);
                return;
            }

            updateProgress(30, "Görünmez karakterler ayıklanıyor...");
            const encryptedBytes = ZeroWidthEngine.extractZeroWidth(rawText);

            updateProgress(70, "Şifre çözülüyor (AES-256-GCM)...");
            const plainBytes = await CryptoEngine.decryptBuffer(encryptedBytes, pass);
            const decryptedStr = new TextDecoder().decode(plainBytes);

            textReveal.value = decryptedStr;
            textReveal.style.display = 'block';
            btnCopy.style.display = 'block';
            btnClearOutput.style.display = 'block';
            startClipboardTimer();

            updateProgress(100, "Şifre başarıyla çözüldü!");
            showStatus("Gizli mesaj başarıyla açığa çıkarıldı!", true);
            return;
        }

        // Görsel Steganografi Çözme
        if (!currentRevealImageData) {
            showStatus("Lütfen şifreli PNG görselini seçin.", false);
            return;
        }

        updateProgress(20, "StegoCrypt akıllı çözücü başlatılıyor (v3/v2/v1)...");
        const workerResult = await StegoWorkerClient.execute<{
            decryptedBytes: ArrayBuffer;
        }>(
            'DECRYPT_AUTO',
            {
                pixelBuffer: currentRevealImageData.data.buffer.slice(0),
                width: currentRevealImageData.width,
                height: currentRevealImageData.height,
                password: pass
            },
            [],
            (pct, txt) => updateProgress(pct, txt)
        );

        updateProgress(85, "Veri açılıyor (Inflate)...");
        let decompressedBytes: Uint8Array;
        try {
            decompressedBytes = await CompressionEngine.decompress(new Uint8Array(workerResult.decryptedBytes));
        } catch {
            // Sıkıştırılmamış eski versiyon fallback
            decompressedBytes = new Uint8Array(workerResult.decryptedBytes);
        }

        // Dosya mı yoksa metin mi kontrol et
        const headStr = new TextDecoder().decode(decompressedBytes.subarray(0, Math.min(256, decompressedBytes.length)));
        const nlIdx = headStr.indexOf('\n');

        if (nlIdx > 0) {
            try {
                const meta = JSON.parse(headStr.substring(0, nlIdx));
                if (meta.n && typeof meta.s === 'number') {
                    // Dosya yükü
                    decryptedFileName = meta.n;
                    const fileBody = decompressedBytes.subarray(nlIdx + 1);
                    decryptedFileBlob = new Blob([fileBody.slice() as unknown as BlobPart]);

                    btnDownloadFile.textContent = `💾 İndir: ${decryptedFileName} (${Math.round(fileBody.length / 1024)} KB)`;
                    btnDownloadFile.style.display = 'block';
                    btnClearOutput.style.display = 'block';
                    updateProgress(100, "Dosya başarıyla çözüldü!");
                    showStatus(`Görselin içinden "${decryptedFileName}" başarıyla çıkartıldı!`, true);
                    return;
                }
            } catch {
                // JSON meta değilse düz metin devam
            }
        }

        const plainText = new TextDecoder().decode(decompressedBytes);
        textReveal.value = plainText;
        textReveal.style.display = 'block';
        btnCopy.style.display = 'block';
        btnClearOutput.style.display = 'block';
        startClipboardTimer();

        updateProgress(100, "Mesaj çözüldü!");
        showStatus("Gizli mesaj başarıyla açığa çıkarıldı!", true);

    } catch (err: any) {
        showStatus(`Çözme başarısız: ${err.message}`, false);
    }
});

btnDownloadFile.addEventListener('click', () => {
    if (!decryptedFileBlob) return;
    const url = URL.createObjectURL(decryptedFileBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = decryptedFileName;
    a.click();
    URL.revokeObjectURL(url);
});

btnCopy.addEventListener('click', async () => {
    if (!textReveal.value) return;
    await navigator.clipboard.writeText(textReveal.value);
    showStatus("Gizli mesaj panoya kopyalandı! (30 saniye içinde otomatik temizlenecektir)", true);
});

btnClearOutput.addEventListener('click', () => {
    textReveal.value = '';
    textReveal.style.display = 'none';
    btnDownloadFile.style.display = 'none';
    btnCopy.style.display = 'none';
    btnClearOutput.style.display = 'none';
    decryptedFileBlob = null;
    clearStatus();
});

function startClipboardTimer(): void {
    if (clipboardClearTimer) clearTimeout(clipboardClearTimer);
    clipboardClearTimer = setTimeout(() => {
        textReveal.value = '';
        textReveal.style.display = 'none';
        btnCopy.style.display = 'none';
    }, 30000);
}

// -----------------------------------------------------------------------------
// Forensic Workbench (Subtab Handlers)
// -----------------------------------------------------------------------------

// 3.A LSB & Steganalysis
const fileInspectInput = getEl<HTMLInputElement>('file-inspect');
const canvasInspect = getEl<HTMLCanvasElement>('canvas-inspect');
const viewModeBitplane = getEl<HTMLInputElement>('view-mode-bitplane');
const inspectProbBadge = getEl<HTMLElement>('inspect-prob-badge');
const inspectVerdict = getEl<HTMLElement>('inspect-verdict');
const inspectDetails = getEl<HTMLElement>('inspect-details');
const inspectRsBadge = getEl<HTMLElement>('inspect-rs-badge');
const inspectRsVerdict = getEl<HTMLElement>('inspect-rs-verdict');
const inspectRsDetails = getEl<HTMLElement>('inspect-rs-details');

fileInspectInput.addEventListener('change', async () => {
    const file = fileInspectInput.files?.[0];
    if (!file) return;

    try {
        const inspectImg = await ImageEngine.loadImageData(file);
        currentInspectImageData = inspectImg;
        getEl('inspect-controls').style.display = 'block';

        // 1. Chi-Square Analizi
        const chiRes = await StegoWorkerClient.execute<{ analysis: any }>('ANALYZE_CHI_SQUARE', {
            pixelBuffer: inspectImg.data.buffer.slice(0),
            width: inspectImg.width,
            height: inspectImg.height
        });

        const chi = chiRes.analysis;
        inspectProbBadge.textContent = `%${chi.probability}`;
        inspectProbBadge.style.backgroundColor = chi.isStego ? 'var(--md-error-container)' : 'var(--md-primary-container)';
        inspectProbBadge.style.color = chi.isStego ? 'var(--md-error)' : 'var(--md-on-primary-container)';
        inspectVerdict.textContent = chi.verdict;
        inspectDetails.textContent = `χ²: ${chi.chiSquare} | p-değeri: ${chi.pValue} | Serbestlik Derecesi: ${chi.degreesOfFreedom}`;

        // 2. Fridrich RS Analizi
        const rsRes = await StegoWorkerClient.execute<{ rsResult: any }>('ANALYZE_RS', {
            pixelBuffer: inspectImg.data.buffer.slice(0),
            width: inspectImg.width,
            height: inspectImg.height,
            channel: 'all'
        });

        const rs = rsRes.rsResult;
        inspectRsBadge.textContent = `%${rs.estimatedPayloadPercent ?? (rs.estimatedRatio * 100)}`;
        inspectRsBadge.style.backgroundColor = rs.verdictLevel === 'stego' ? 'var(--md-error-container)' : 'var(--md-primary-container)';
        inspectRsBadge.style.color = rs.verdictLevel === 'stego' ? 'var(--md-error)' : 'var(--md-on-primary-container)';
        inspectRsVerdict.textContent = rs.verdict;
        inspectRsDetails.textContent = rs.details ?? `Tahmini LSB manipülasyon oranı: %${rs.estimatedRatio * 100}`;

        renderInspectCanvas();
    } catch (err: any) {
        showStatus(`Steganaliz hatası: ${err.message}`, false);
    }
});

viewModeBitplane.addEventListener('change', renderInspectCanvas);
getEl('view-mode-heatmap').addEventListener('change', renderInspectCanvas);

async function renderInspectCanvas(): Promise<void> {
    if (!currentInspectImageData) return;
    const isBitplane = viewModeBitplane.checked;

    if (isBitplane) {
        const res = await StegoWorkerClient.execute<{ bitPlaneBuffer: ArrayBuffer }>('RENDER_BIT_PLANE', {
            pixelBuffer: currentInspectImageData.data.buffer.slice(0),
            width: currentInspectImageData.width,
            height: currentInspectImageData.height,
            channel: 'all',
            bitDepth: 0
        });

        canvasInspect.width = currentInspectImageData.width;
        canvasInspect.height = currentInspectImageData.height;
        const ctx = canvasInspect.getContext('2d');
        if (ctx) {
            const imgData = new ImageData(new Uint8ClampedArray(res.bitPlaneBuffer), currentInspectImageData.width, currentInspectImageData.height);
            ctx.putImageData(imgData, 0, 0);
        }
    } else {
        const res = await StegoWorkerClient.execute<{ heatmapBuffer: ArrayBuffer }>('RENDER_HEATMAP', {
            pixelBuffer: currentInspectImageData.data.buffer.slice(0),
            width: currentInspectImageData.width,
            height: currentInspectImageData.height,
            blockSize: 32
        });

        canvasInspect.width = currentInspectImageData.width;
        canvasInspect.height = currentInspectImageData.height;
        const ctx = canvasInspect.getContext('2d');
        if (ctx) {
            const imgData = new ImageData(new Uint8ClampedArray(res.heatmapBuffer), currentInspectImageData.width, currentInspectImageData.height);
            ctx.putImageData(imgData, 0, 0);
        }
    }
}

// 3.B Binary Triage
const fileBinaryInput = getEl<HTMLInputElement>('file-binary');
const binaryReportBox = getEl<HTMLElement>('binary-report');
const binaryFormatBadge = getEl<HTMLElement>('binary-format-badge');
const binarySizeLbl = getEl<HTMLElement>('binary-size-lbl');
const binaryVerdict = getEl<HTMLElement>('binary-verdict');
const binaryDetails = getEl<HTMLElement>('binary-details');
const binaryChunksTbody = getEl<HTMLTableSectionElement>('binary-chunks-table').querySelector('tbody')!;

fileBinaryInput.addEventListener('change', async () => {
    const file = fileBinaryInput.files?.[0];
    if (!file) return;

    try {
        const buf = await file.arrayBuffer();
        const res = await StegoWorkerClient.execute<{ report: any }>('INSPECT_BINARY', { fileBuffer: buf });
        const r = res.report;

        binaryReportBox.style.display = 'block';
        binaryFormatBadge.textContent = `FORMAT: ${r.format.toUpperCase()}`;
        binarySizeLbl.textContent = `${Math.round(r.fileSize / 1024)} KB`;
        binaryVerdict.textContent = r.verdict;
        binaryDetails.textContent = r.verdictDetails;

        binaryChunksTbody.innerHTML = '';
        if (r.chunks && r.chunks.length > 0) {
            for (const chunk of r.chunks) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-weight: 700; color: ${chunk.isCritical ? 'var(--md-primary)' : 'var(--md-on-surface)'};">${chunk.type}</td>
                    <td>${chunk.length} B</td>
                    <td>0x${chunk.offset.toString(16)}</td>
                    <td style="color: ${chunk.crcValid ? '#4caf50' : '#f44336'};">${chunk.crcValid ? '✓ Geçerli' : '✗ Hatalı'}</td>
                `;
                binaryChunksTbody.appendChild(tr);
            }
        }
    } catch (err: any) {
        showStatus(`İkili analiz hatası: ${err.message}`, false);
    }
});

// 3.C Diff Comparison
const fileDiffOrig = getEl<HTMLInputElement>('file-diff-orig');
const fileDiffStego = getEl<HTMLInputElement>('file-diff-stego');
const btnCompareDiff = getEl<HTMLButtonElement>('btn-compare-diff');
const diffResultsBox = getEl<HTMLElement>('diff-results');
const diffValPsnr = getEl<HTMLElement>('diff-val-psnr');
const diffValSsim = getEl<HTMLElement>('diff-val-ssim');
const diffValChanged = getEl<HTMLElement>('diff-val-changed');
const canvasDiff = getEl<HTMLCanvasElement>('canvas-diff');

fileDiffOrig.addEventListener('change', async () => {
    const f = fileDiffOrig.files?.[0];
    if (f) {
        diffOrigImageData = await ImageEngine.loadImageData(f);
        getEl('lbl-diff-orig').textContent = `✓ ${f.name}`;
    }
});

fileDiffStego.addEventListener('change', async () => {
    const f = fileDiffStego.files?.[0];
    if (f) {
        diffStegoImageData = await ImageEngine.loadImageData(f);
        getEl('lbl-diff-stego').textContent = `✓ ${f.name}`;
    }
});

btnCompareDiff.addEventListener('click', async () => {
    if (!diffOrigImageData || !diffStegoImageData) {
        showStatus("Lütfen hem orijinal hem de stego görseli seçin.", false);
        return;
    }

    try {
        const res = await StegoWorkerClient.execute<{
            comparison: any;
            ampDiffBuffer: ArrayBuffer;
            width: number;
            height: number;
        }>('COMPARE_IMAGES', {
            pixelBuffer1: diffOrigImageData.data.buffer.slice(0),
            pixelBuffer2: diffStegoImageData.data.buffer.slice(0),
            width: diffOrigImageData.width,
            height: diffOrigImageData.height,
            amplifier: 20
        });

        diffResultsBox.style.display = 'block';
        diffValPsnr.textContent = res.comparison.psnr === Infinity ? '∞' : `${res.comparison.psnr.toFixed(2)}`;
        diffValSsim.textContent = res.comparison.ssim.toFixed(4);
        diffValChanged.textContent = `${res.comparison.changedPixels} (%${res.comparison.changedPercent.toFixed(2)})`;

        canvasDiff.width = res.width;
        canvasDiff.height = res.height;
        const ctx = canvasDiff.getContext('2d');
        if (ctx) {
            const imgData = new ImageData(new Uint8ClampedArray(res.ampDiffBuffer), res.width, res.height);
            ctx.putImageData(imgData, 0, 0);
        }
    } catch (err: any) {
        showStatus(`Diff hatası: ${err.message}`, false);
    }
});

// 3.D Invisible Text Detector
const textDetectInput = getEl<HTMLTextAreaElement>('text-detect-input');
const btnDetectZerowidth = getEl<HTMLButtonElement>('btn-detect-zerowidth');
const zerowidthReportBox = getEl<HTMLElement>('zerowidth-report');
const zwVerdict = getEl<HTMLElement>('zw-verdict');
const zwDetails = getEl<HTMLElement>('zw-details');
const zwSmuggledBox = getEl<HTMLElement>('zw-smuggled-box');
const zwSmuggledText = getEl<HTMLElement>('zw-smuggled-text');

btnDetectZerowidth.addEventListener('click', () => {
    const text = textDetectInput.value;
    if (!text) {
        showStatus("Lütfen taranacak metni girin.", false);
        return;
    }

    const report = ZeroWidthDetector.analyze(text);
    zerowidthReportBox.style.display = 'block';

    if (report.hasZeroWidth) {
        zwVerdict.textContent = "⚠️ Görünmez Karakterler Tespit Edildi!";
        zwVerdict.style.color = 'var(--md-error)';
        zwDetails.textContent = `Toplam ${report.count} adet sıfır-genişlikli karakter bulundu. Türler: ${report.types.join(', ')}.`;

        if (report.smuggledText) {
            zwSmuggledBox.style.display = 'block';
            zwSmuggledText.textContent = report.smuggledText;
        } else {
            zwSmuggledBox.style.display = 'none';
        }
    } else {
        zwVerdict.textContent = "✓ Temiz Metin (Görünmez Karakter Yok)";
        zwVerdict.style.color = 'var(--md-primary)';
        zwDetails.textContent = "Metinde gizlenmiş sıfır-genişlikli veya Unicode Düzlem 14 etiketi bulunamadı.";
        zwSmuggledBox.style.display = 'none';
    }
});

// 3.E zsteg Deep Scanner
const fileZstegInput = getEl<HTMLInputElement>('file-zsteg');
const btnScanZsteg = getEl<HTMLButtonElement>('btn-scan-zsteg');
const zstegResultsBox = getEl<HTMLElement>('zsteg-results');
const zstegTableTbody = getEl<HTMLTableSectionElement>('zsteg-table').querySelector('tbody')!;
let zstegImageData: SimpleImageData | null = null;

fileZstegInput.addEventListener('change', async () => {
    const f = fileZstegInput.files?.[0];
    if (f) zstegImageData = await ImageEngine.loadImageData(f);
});

btnScanZsteg.addEventListener('click', async () => {
    if (!zstegImageData) {
        showStatus("Lütfen taranacak PNG görselini seçin.", false);
        return;
    }

    try {
        zstegTableTbody.innerHTML = '';
        zstegResultsBox.style.display = 'block';

        const res = await StegoWorkerClient.execute<{ findings: any[] }>(
            'SCAN_ZSTEG',
            {
                pixelBuffer: zstegImageData.data.buffer.slice(0),
                width: zstegImageData.width,
                height: zstegImageData.height,
                maxSampleBytes: 2048
            },
            [],
            (pct, txt) => updateProgress(pct, txt)
        );

        if (res.findings.length === 0) {
            zstegTableTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--md-on-surface-variant);">56 kombinasyonda belirgin dosya imzası veya metin bulunamadı.</td></tr>';
            return;
        }

        for (const finding of res.findings) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-family: monospace; font-weight: 700; color: var(--md-primary);">${finding.comboId}</td>
                <td style="font-weight: 600;">${finding.signatureName}</td>
                <td style="font-family: monospace; font-size: 0.75rem; color: #fff;">${finding.textSample}</td>
                <td><button type="button" class="m3-btn m3-btn-tonal" style="padding: 4px 8px; font-size: 0.7rem; width: auto;" data-combo="${finding.comboId}">Çıkart</button></td>
            `;

            const btnExtract = tr.querySelector('button')!;
            btnExtract.addEventListener('click', async () => {
                const payloadRes = await StegoWorkerClient.execute<{ payloadBuffer: ArrayBuffer }>(
                    'EXTRACT_ZSTEG_PAYLOAD',
                    {
                        pixelBuffer: zstegImageData!.data.buffer.slice(0),
                        width: zstegImageData!.width,
                        height: zstegImageData!.height,
                        comboId: finding.comboId,
                        maxBytes: 1048576
                    }
                );
                const blob = new Blob([payloadRes.payloadBuffer]);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `zsteg_${finding.comboId}.bin`;
                a.click();
                URL.revokeObjectURL(url);
            });

            zstegTableTbody.appendChild(tr);
        }
    } catch (err: any) {
        showStatus(`zsteg tarama hatası: ${err.message}`, false);
    }
});

// Canvas Fingerprinting Noise Detection Check
(() => {
    try {
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 16;
        testCanvas.height = 16;
        const ctx = testCanvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#123456';
            ctx.fillRect(0, 0, 16, 16);
            const d1 = ctx.getImageData(0, 0, 16, 16).data;
            const d2 = ctx.getImageData(0, 0, 16, 16).data;
            let diff = false;
            for (let i = 0; i < d1.length; i++) {
                if (d1[i] !== d2[i]) { diff = true; break; }
            }
            if (diff) {
                getEl('banner-canvas-warning').style.display = 'flex';
            }
        }
    } catch {
        // Ignore canvas test errors
    }
})();

console.log("🌿 StegoCrypt TypeScript v3.1.0 initialized successfully.");
