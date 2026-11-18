/**
 * src/ui/HideTab.ts
 * İçerik Gizleme Sekmesi (Görsel Steganografi & Görünmez Metin / QR).
 */

import { StegoWorkerClient } from '../workers/StegoWorkerClient.ts';
import { ImageEngine } from '../codec/ImageEngine.ts';
import { CompressionEngine } from '../codec/CompressionEngine.ts';
import { ZeroWidthEngine } from '../stego/ZeroWidthEngine.ts';
import { VariationSelectorEngine } from '../stego/VariationSelectorEngine.ts';
import { CryptoEngine } from '../crypto/CryptoEngine.ts';
import { QREngine } from '../codec/QREngine.ts';
import type { CipherAlgorithm, DistributionMode, EmbedMethod, LsbMode, SimpleImageData } from '../types/index.ts';
import {
    clearStatus,
    evaluatePasswordStrength,
    getEl,
    safeWriteClipboard,
    setPreviewImage,
    setupDropzoneDragAndDrop,
    showStatus,
    updateProgress
} from './dom.ts';

export function initHideTab(): void {
    let currentCarrierImageData: SimpleImageData | null = null;
    let generatedPngBlob: Blob | null = null;
    let selectedSecretFile: File | null = null;

    const typeTextRadio = getEl<HTMLInputElement>('type-text');
    const typeFileRadio = getEl<HTMLInputElement>('type-file');
    const typeInvisibleRadio = getEl<HTMLInputElement>('type-invisible');

    const containerImageInput = getEl<HTMLElement>('container-image-input');
    const dropzoneHide = getEl<HTMLElement>('dropzone-hide');
    const fileHideInput = getEl<HTMLInputElement>('file-hide');
    const previewHide = getEl<HTMLImageElement>('preview-hide');
    const carrierInfoBadge = getEl<HTMLElement>('carrier-info-badge');

    const containerDensityInput = getEl<HTMLElement>('container-density-input');
    const density1lsbRadio = getEl<HTMLInputElement>('density-1lsb');
    const density2lsbRadio = getEl<HTMLInputElement>('density-2lsb');

    const containerScatterInput = getEl<HTMLElement>('container-scatter-input');
    const scatterModeAdaptive = getEl<HTMLInputElement>('scatter-mode-adaptive');
    const scatterModePrng = getEl<HTMLInputElement>('scatter-mode-prng');
    const scatterModeSeq = getEl<HTMLInputElement>('scatter-mode-seq');

    const containerRiskIndicator = getEl<HTMLElement>('container-risk-indicator');
    const riskBadge = getEl<HTMLElement>('risk-badge');
    const riskProgressBar = getEl<HTMLElement>('risk-progress-bar');
    const riskMessage = getEl<HTMLElement>('risk-message');

    const containerMethodInput = getEl<HTMLElement>('container-method-input');
    const methodMatching = getEl<HTMLInputElement>('method-matching');

    const containerKdfInput = getEl<HTMLElement>('container-kdf-input');
    const kdfPbkdf2Radio = getEl<HTMLInputElement>('kdf-pbkdf2');
    const kdfArgon2idRadio = getEl<HTMLInputElement>('kdf-argon2id');
    const optKdfArgon2id = getEl<HTMLElement>('opt-kdf-argon2id');

    const containerCipherInput = getEl<HTMLElement>('container-cipher-input');
    const cipherAesGcmRadio = getEl<HTMLInputElement>('cipher-aes-gcm');
    const cipherChaChaRadio = getEl<HTMLInputElement>('cipher-chacha20');
    const optCipherChaCha = getEl<HTMLElement>('opt-cipher-chacha');

    const containerDeniableToggle = getEl<HTMLElement>('container-deniable-toggle');
    const optDeniable = getEl<HTMLElement>('opt-deniable');
    const checkDeniable = getEl<HTMLInputElement>('check-deniable');
    const containerDeniableFields = getEl<HTMLElement>('container-deniable-fields');
    const textDecoy = getEl<HTMLTextAreaElement>('text-decoy');
    const passDecoy = getEl<HTMLInputElement>('pass-decoy');

    const containerCoverInput = getEl<HTMLElement>('container-cover-input');
    const invTypeZerowidth = getEl<HTMLInputElement>('inv-type-zerowidth');
    const invTypeVariation = getEl<HTMLInputElement>('inv-type-variation');
    const lblTextCover = getEl<HTMLElement>('lbl-text-cover');
    const textCover = getEl<HTMLInputElement>('text-cover');
    const containerTextInput = getEl<HTMLElement>('container-text-input');
    const textHide = getEl<HTMLTextAreaElement>('text-hide');

    const containerFileInput = getEl<HTMLElement>('container-file-input');
    const dropzoneSecretFile = getEl<HTMLElement>('dropzone-secret-file');
    const fileSecretInput = getEl<HTMLInputElement>('file-secret-input');
    const labelSecretFile = getEl<HTMLElement>('label-secret-file');

    const passHide = getEl<HTMLInputElement>('pass-hide');
    const passStrengthRow = getEl<HTMLElement>('pass-strength-row');
    const passStrengthFill = getEl<HTMLElement>('pass-strength-fill');
    const passStrengthText = getEl<HTMLElement>('pass-strength-text');

    const btnEncrypt = getEl<HTMLButtonElement>('btn-encrypt');
    const btnShare = getEl<HTMLButtonElement>('btn-share');

    const containerInvisibleOutput = getEl<HTMLElement>('container-invisible-output');
    const textInvisibleOutput = getEl<HTMLTextAreaElement>('text-invisible-output');
    const invisibleByteInfo = getEl<HTMLElement>('invisible-byte-info');
    const btnCopyInvisible = getEl<HTMLButtonElement>('btn-copy-invisible');
    const btnShowQr = getEl<HTMLButtonElement>('btn-show-qr');
    const containerQrPreview = getEl<HTMLElement>('container-qr-preview');
    const btnCloseQr = getEl<HTMLButtonElement>('btn-close-qr');
    const canvasQr = getEl<HTMLCanvasElement>('canvas-qr');
    const btnDownloadQr = getEl<HTMLButtonElement>('btn-download-qr');

    function syncSequentialCompatibility(): void {
        const isSeq = scatterModeSeq.checked;
        kdfArgon2idRadio.disabled = isSeq;
        optKdfArgon2id.classList.toggle('disabled', isSeq);
        cipherChaChaRadio.disabled = isSeq;
        optCipherChaCha.classList.toggle('disabled', isSeq);
        checkDeniable.disabled = isSeq;
        optDeniable.classList.toggle('disabled', isSeq);

        if (isSeq) {
            kdfPbkdf2Radio.checked = true;
            cipherAesGcmRadio.checked = true;
            if (checkDeniable.checked) {
                checkDeniable.checked = false;
                containerDeniableFields.style.display = 'none';
            }
        }
    }

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
        const bufCopy = currentCarrierImageData.data.buffer.slice(0);

        StegoWorkerClient.execute<{ risk: any }>('CALCULATE_RISK', {
            pixelBuffer: bufCopy,
            width: currentCarrierImageData.width,
            height: currentCarrierImageData.height,
            payloadBytes,
            lsbMode
        }, [bufCopy]).then((res) => {
            const risk = res.risk;
            containerRiskIndicator.style.display = 'block';
            riskBadge.textContent = `${risk.label.toUpperCase()} (%${risk.usagePercent.toFixed(1)})`;
            riskBadge.style.backgroundColor = risk.badgeColor;
            riskBadge.style.color = risk.level === 'high' ? '#120808' : '#122818';
            riskProgressBar.style.width = `${Math.min(100, risk.usagePercent)}%`;
            riskProgressBar.style.backgroundColor = risk.badgeColor;
            riskMessage.textContent = risk.message;
        }).catch(() => {
            containerRiskIndicator.style.display = 'none';
        });
    }

    function updateHideModeUI(): void {
        const isText = typeTextRadio.checked;
        const isFile = typeFileRadio.checked;
        const isInv = typeInvisibleRadio.checked;

        containerImageInput.style.display = isInv ? 'none' : 'block';
        containerDensityInput.style.display = isInv ? 'none' : 'block';
        containerScatterInput.style.display = isInv ? 'none' : 'block';
        containerMethodInput.style.display = isInv ? 'none' : 'block';
        containerKdfInput.style.display = isInv ? 'none' : 'block';
        containerCipherInput.style.display = isInv ? 'none' : 'block';
        containerDeniableToggle.style.display = isInv ? 'none' : 'block';
        if (isInv) {
            containerDeniableFields.style.display = 'none';
        } else if (checkDeniable.checked) {
            containerDeniableFields.style.display = 'block';
        }

        containerCoverInput.style.display = isInv ? 'block' : 'none';
        containerTextInput.style.display = (isText || isInv) ? 'block' : 'none';
        containerFileInput.style.display = isFile ? 'block' : 'none';

        if (!isInv) {
            containerInvisibleOutput.style.display = 'none';
            containerQrPreview.style.display = 'none';
        }

        syncSequentialCompatibility();
        updateRiskAssessment();
    }

    typeTextRadio.addEventListener('change', updateHideModeUI);
    typeFileRadio.addEventListener('change', updateHideModeUI);
    typeInvisibleRadio.addEventListener('change', updateHideModeUI);

    density1lsbRadio.addEventListener('change', updateRiskAssessment);
    density2lsbRadio.addEventListener('change', updateRiskAssessment);

    scatterModeAdaptive.addEventListener('change', () => { syncSequentialCompatibility(); updateRiskAssessment(); });
    scatterModePrng.addEventListener('change', () => { syncSequentialCompatibility(); updateRiskAssessment(); });
    scatterModeSeq.addEventListener('change', () => { syncSequentialCompatibility(); updateRiskAssessment(); });

    invTypeVariation.addEventListener('change', () => {
        lblTextCover.textContent = "Taşıyıcı Emoji veya Mesaj";
        textCover.placeholder = "Örn: 🛡️ veya Selamlar 🚀";
        if (textCover.value === "Selam, toplantı notlarını ekte bulabilirsin.") {
            textCover.value = "🛡️";
        }
    });

    invTypeZerowidth.addEventListener('change', () => {
        lblTextCover.textContent = "Kılıf Mesajı (Görünecek Masum Metin)";
        textCover.placeholder = "Örn: Merhaba, nasılsın?";
        if (textCover.value === "🛡️") {
            textCover.value = "Selam, toplantı notlarını ekte bulabilirsin.";
        }
    });

    checkDeniable.addEventListener('change', () => {
        containerDeniableFields.style.display = checkDeniable.checked ? 'block' : 'none';
        updateRiskAssessment();
    });

    passHide.addEventListener('input', () => {
        const res = evaluatePasswordStrength(passHide.value);
        if (!passHide.value) {
            passStrengthRow.style.display = 'none';
            return;
        }
        passStrengthRow.style.display = 'block';
        passStrengthFill.style.width = `${res.percent}%`;
        passStrengthFill.style.backgroundColor = res.color;
        passStrengthText.textContent = res.label;
    });

    fileHideInput.addEventListener('change', async () => {
        const file = fileHideInput.files?.[0];
        if (!file) return;

        try {
            clearStatus();
            const safety = ImageEngine.checkCarrierSafety(file);
            if (safety.warning) {
                showStatus(`Uyarı: ${safety.warning}`, false);
            }

            currentCarrierImageData = await ImageEngine.loadImageData(file);
            setPreviewImage(previewHide, file);

            const totalChannels = currentCarrierImageData.width * currentCarrierImageData.height * 3;
            const cap1Kb = Math.floor(Math.max(0, (totalChannels - 512) / 8) / 1024);
            const cap2Kb = Math.floor(Math.max(0, ((totalChannels - 512) * 2) / 8) / 1024);
            carrierInfoBadge.textContent = `📐 ${currentCarrierImageData.width}×${currentCarrierImageData.height} px • Maks Kapasite: ~${cap1Kb} KB (1-LSB) / ~${cap2Kb} KB (2-LSB)`;
            carrierInfoBadge.style.display = 'block';

            updateRiskAssessment();
        } catch (err: any) {
            currentCarrierImageData = null;
            carrierInfoBadge.style.display = 'none';
            showStatus(`Görsel yüklenemedi: ${err.message}`, false);
        }
    });

    setupDropzoneDragAndDrop(dropzoneHide, fileHideInput);
    setupDropzoneDragAndDrop(dropzoneSecretFile, fileSecretInput);

    textHide.addEventListener('input', updateRiskAssessment);
    textDecoy.addEventListener('input', updateRiskAssessment);

    fileSecretInput.addEventListener('change', () => {
        selectedSecretFile = fileSecretInput.files?.[0] || null;
        if (selectedSecretFile) {
            labelSecretFile.textContent = `📁 ${selectedSecretFile.name} (${Math.round(selectedSecretFile.size / 1024)} KB)`;
        }
        updateRiskAssessment();
    });

    passHide.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            btnEncrypt.click();
        }
    });

    btnEncrypt.addEventListener('click', async () => {
        clearStatus();
        btnShare.style.display = 'none';
        generatedPngBlob = null;

        let plainTextBytes: Uint8Array | null = null;
        let mergedFileBytes: Uint8Array | null = null;
        let decoyBytes: Uint8Array | null = null;
        let rawBuffer: ArrayBuffer | null = null;
        let rawDecoy: ArrayBuffer | null = null;

        btnEncrypt.disabled = true;
        try {
            const pass = passHide.value;
            if (!pass || pass.trim().length === 0) {
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
                plainTextBytes = new TextEncoder().encode(secret);
                const encryptedBytes = await CryptoEngine.encryptBuffer(plainTextBytes, pass);

                let finalInvisibleText: string;
                if (invTypeVariation.checked) {
                    updateProgress(70, "Emoji Varyasyon Seçicilerine (VS1-VS16) kodlanıyor...");
                    const carrier = textCover.value || "🛡️";
                    finalInvisibleText = VariationSelectorEngine.encode(encryptedBytes, carrier);
                } else {
                    updateProgress(70, "Sıfır genişlikli karakterlere kodlanıyor...");
                    const invisible = ZeroWidthEngine.encode(encryptedBytes);
                    const cover = textCover.value || "Selam, nasılsın?";
                    finalInvisibleText = `${cover} ${invisible}`;
                }

                textInvisibleOutput.value = finalInvisibleText;
                const utf8Len = new TextEncoder().encode(finalInvisibleText).length;
                const qrOk = utf8Len <= QREngine.MAX_QR_BYTES;
                invisibleByteInfo.textContent = `Çıktı boyutu: ${utf8Len} UTF-8 bayt • ${qrOk ? 'QR Kod ile paylaşılabilir (≤ 2300 B)' : 'QR sınırını (> 2300 B) aşıyor — metin olarak kopyalayın'}`;
                invisibleByteInfo.style.color = qrOk ? 'var(--md-primary)' : 'var(--md-warning)';

                containerInvisibleOutput.style.display = 'block';
                containerQrPreview.style.display = 'none';
                updateProgress(100, "Gizli metin başarıyla oluşturuldu!");
                showStatus("Gizli metin hazır! WhatsApp veya sosyal medyaya kopyalayabilirsiniz.", true);
                return;
            }

            // 2. Görsel Steganografi Modu
            if (!currentCarrierImageData) {
                showStatus("Lütfen bir taşıyıcı görsel seçin.", false);
                return;
            }

            if (typeTextRadio.checked) {
                const text = textHide.value;
                if (!text) {
                    showStatus("Lütfen gizlenecek metni girin.", false);
                    return;
                }
                plainTextBytes = new TextEncoder().encode(text);
                updateProgress(10, "Veri sıkıştırılıyor (Deflate)...");
                const compressed = await CompressionEngine.compress(plainTextBytes);
                rawBuffer = compressed.buffer as ArrayBuffer;
            } else {
                if (!selectedSecretFile) {
                    showStatus("Lütfen gizlenecek bir dosya seçin.", false);
                    return;
                }
                const fileBuf = await selectedSecretFile.arrayBuffer();
                const metaHeader = new TextEncoder().encode(JSON.stringify({ n: selectedSecretFile.name, s: selectedSecretFile.size }) + '\n');
                mergedFileBytes = new Uint8Array(metaHeader.length + fileBuf.byteLength);
                mergedFileBytes.set(metaHeader, 0);
                mergedFileBytes.set(new Uint8Array(fileBuf), metaHeader.length);

                updateProgress(10, "Dosya sıkıştırılıyor (Deflate)...");
                const compressed = await CompressionEngine.compress(mergedFileBytes);
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
            const cipherAlgorithm: CipherAlgorithm = cipherChaChaRadio.checked ? 'chacha20-poly1305' : 'aes-256-gcm';

            let passDecoyStr: string | null = null;
            const isDeniable = checkDeniable.checked;

            if (isDeniable) {
                passDecoyStr = passDecoy.value;
                if (!passDecoyStr || passDecoyStr.trim().length === 0 || !textDecoy.value.trim()) {
                    showStatus("Lütfen tuzak katman mesajı ve parolasını doldurun.", false);
                    return;
                }
                if (passDecoyStr === pass) {
                    showStatus("Tuzak parola ile gerçek parola aynı olamaz.", false);
                    return;
                }
                decoyBytes = new TextEncoder().encode(textDecoy.value);
                const decoyComp = await CompressionEngine.compress(decoyBytes);
                rawDecoy = decoyComp.buffer as ArrayBuffer;
            }

            const pixelBufferCopy = currentCarrierImageData.data.buffer.slice(0);
            const transferables: Transferable[] = [pixelBufferCopy, rawBuffer];
            if (rawDecoy) transferables.push(rawDecoy);

            const workerResult = await StegoWorkerClient.execute<{ pngBytes: ArrayBuffer }>(
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
                    cipherAlgorithm,
                    isDeniable,
                    rawDecoy,
                    passDecoy: passDecoyStr
                },
                transferables,
                (pct, txt) => updateProgress(pct, txt)
            );

            generatedPngBlob = new Blob([workerResult.pngBytes], { type: 'image/png' });
            btnShare.style.display = 'block';
            const modeText = distribution === 'adaptive'
                ? ' (İçerik Duyarlı Doku Kafesi)'
                : distribution === 'sequential'
                ? ' (Format v1 Sıralı)'
                : '';
            showStatus(`Şifreleme ve görsel içine gömme${modeText} başarıyla tamamlandı! İndirebilirsiniz.`, true);
        } catch (err: any) {
            showStatus(`Şifreleme hatası: ${err.message}`, false);
        } finally {
            btnEncrypt.disabled = false;
            if (plainTextBytes) plainTextBytes.fill(0);
            if (mergedFileBytes) mergedFileBytes.fill(0);
            if (decoyBytes) decoyBytes.fill(0);
            if (rawBuffer && rawBuffer.byteLength > 0) new Uint8Array(rawBuffer).fill(0);
            if (rawDecoy && rawDecoy.byteLength > 0) new Uint8Array(rawDecoy).fill(0);
        }
    });

    btnShare.addEventListener('click', () => {
        if (!generatedPngBlob) return;
        const url = URL.createObjectURL(generatedPngBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stegocrypt_v3_${Date.now()}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    btnCopyInvisible.addEventListener('click', async () => {
        if (!textInvisibleOutput.value) return;
        const ok = await safeWriteClipboard(textInvisibleOutput.value);
        showStatus(ok ? "Görünmez metin panoya kopyalandı!" : "Panoya kopyalama izni reddedildi.", ok);
    });

    btnShowQr.addEventListener('click', () => {
        const text = textInvisibleOutput.value;
        if (!text) {
            showStatus("Önce görünmez metin oluşturulmalıdır.", false);
            return;
        }
        try {
            QREngine.renderToCanvas(canvasQr, text, { level: 'M' });
            containerQrPreview.style.display = 'block';
            showStatus("QR kod başarıyla üretildi!", true);
        } catch (err: any) {
            showStatus(err?.message || "QR kod üretilemedi.", false);
        }
    });

    btnCloseQr.addEventListener('click', () => {
        containerQrPreview.style.display = 'none';
    });

    btnDownloadQr.addEventListener('click', () => {
        try {
            const dataUrl = canvasQr.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `stegocrypt_qr_${Date.now()}.png`;
            a.click();
            showStatus("QR kod görseli indirildi.", true);
        } catch {
            showStatus("QR kod indirilemedi.", false);
        }
    });
}
