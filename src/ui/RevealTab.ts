/**
 * src/ui/RevealTab.ts
 * İçerik Çözme Sekmesi (PNG Stego & Görünmez Metin / QR Tarama).
 */

import { StegoWorkerClient } from '../workers/StegoWorkerClient.ts';
import { ImageEngine } from '../codec/ImageEngine.ts';
import { CompressionEngine } from '../codec/CompressionEngine.ts';
import { ZeroWidthEngine } from '../stego/ZeroWidthEngine.ts';
import { VariationSelectorEngine } from '../stego/VariationSelectorEngine.ts';
import { CryptoEngine } from '../crypto/CryptoEngine.ts';
import { QREngine } from '../codec/QREngine.ts';
import type { SimpleImageData } from '../types/index.ts';
import {
    clearStatus,
    getEl,
    safeWriteClipboard,
    sanitizeFilename,
    setPreviewImage,
    setupDropzoneDragAndDrop,
    showStatus,
    updateProgress
} from './dom.ts';

export function initRevealTab(): void {
    let currentRevealImageData: SimpleImageData | null = null;
    let decryptedFileBlob: Blob | null = null;
    let decryptedFileName: string = 'decrypted_secret.bin';
    let clipboardClearTimer: ReturnType<typeof setTimeout> | null = null;

    const revealTypeImageRadio = getEl<HTMLInputElement>('reveal-type-image');
    const revealTypeTextRadio = getEl<HTMLInputElement>('reveal-type-text');
    const containerRevealImage = getEl<HTMLElement>('container-reveal-image');
    const containerRevealText = getEl<HTMLElement>('container-reveal-text');
    const dropzoneReveal = getEl<HTMLElement>('dropzone-reveal');
    const fileRevealInput = getEl<HTMLInputElement>('file-reveal');
    const previewReveal = getEl<HTMLImageElement>('preview-reveal');
    const textRevealInput = getEl<HTMLTextAreaElement>('text-reveal-input');
    const dropzoneQrScan = getEl<HTMLElement>('dropzone-qr-scan');
    const fileQrScanInput = getEl<HTMLInputElement>('file-qr-scan');
    const labelQrScan = getEl<HTMLElement>('label-qr-scan');
    const passReveal = getEl<HTMLInputElement>('pass-reveal');
    const btnDecrypt = getEl<HTMLButtonElement>('btn-decrypt');
    const textReveal = getEl<HTMLTextAreaElement>('text-reveal');
    const btnDownloadFile = getEl<HTMLButtonElement>('btn-download-file');
    const btnCopy = getEl<HTMLButtonElement>('btn-copy');
    const btnClearOutput = getEl<HTMLButtonElement>('btn-clear-output');

    function cancelClipboardTimer(): void {
        if (clipboardClearTimer) {
            clearTimeout(clipboardClearTimer);
            clipboardClearTimer = null;
        }
    }

    function clearDecryptedOutput(): void {
        cancelClipboardTimer();
        textReveal.value = '';
        textReveal.style.display = 'none';
        btnDownloadFile.style.display = 'none';
        btnCopy.style.display = 'none';
        btnClearOutput.style.display = 'none';
        decryptedFileBlob = null;
    }

    function startClipboardClearTimer(): void {
        cancelClipboardTimer();
        clipboardClearTimer = setTimeout(() => {
            if (document.hasFocus()) {
                safeWriteClipboard('');
            }
            clearDecryptedOutput();
            clipboardClearTimer = null;
        }, 30000);
    }

    revealTypeImageRadio.addEventListener('change', () => {
        containerRevealImage.style.display = 'block';
        containerRevealText.style.display = 'none';
    });
    revealTypeTextRadio.addEventListener('change', () => {
        containerRevealImage.style.display = 'none';
        containerRevealText.style.display = 'block';
    });

    setupDropzoneDragAndDrop(dropzoneReveal, fileRevealInput);
    setupDropzoneDragAndDrop(dropzoneQrScan, fileQrScanInput);

    fileRevealInput.addEventListener('change', async () => {
        const file = fileRevealInput.files?.[0];
        if (!file) return;
        try {
            clearStatus();
            const safety = ImageEngine.checkCarrierSafety(file);
            if (safety.warning) {
                showStatus(`Uyarı: ${safety.warning}`, false);
            }
            currentRevealImageData = await ImageEngine.loadImageData(file);
            setPreviewImage(previewReveal, file);
        } catch (err: any) {
            currentRevealImageData = null;
            showStatus(`Görsel açılamadı: ${err.message}`, false);
        }
    });

    fileQrScanInput.addEventListener('change', async () => {
        const file = fileQrScanInput.files?.[0];
        if (!file) return;

        labelQrScan.textContent = `⏳ Taranıyor: ${file.name}...`;
        try {
            const decoded = await QREngine.scanFromFile(file);
            if (decoded) {
                textRevealInput.value = decoded;
                labelQrScan.textContent = `✓ Başarıyla okundu: ${file.name}`;
                showStatus("QR kod içeriği çözme metin alanına aktarıldı!", true);
            } else {
                labelQrScan.textContent = `⚠️ QR Kod bulunamadı: ${file.name}`;
                showStatus("Görsel içinde geçerli bir QR kod tespit edilemedi.", false);
            }
        } catch (err: any) {
            labelQrScan.textContent = `Hata: ${file.name}`;
            showStatus(err?.message || "QR kod taranamadı.", false);
        } finally {
            fileQrScanInput.value = '';
        }
    });

    passReveal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            btnDecrypt.click();
        }
    });

    btnDecrypt.addEventListener('click', async () => {
        clearStatus();
        clearDecryptedOutput();

        btnDecrypt.disabled = true;
        try {
            const pass = passReveal.value;
            if (!pass || pass.trim().length === 0) {
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

                let encryptedBytes: Uint8Array;
                if (VariationSelectorEngine.hasVariationSelectors(rawText)) {
                    updateProgress(30, "Emoji Varyasyon Seçicileri (VS1-VS16) ayıklanıyor...");
                    encryptedBytes = VariationSelectorEngine.extract(rawText);
                } else {
                    updateProgress(30, "Görünmez sıfır-genişlikli karakterler ayıklanıyor...");
                    encryptedBytes = ZeroWidthEngine.extractZeroWidth(rawText);
                }

                updateProgress(70, "Şifre çözülüyor (AES-256-GCM)...");
                const plainBytes = await CryptoEngine.decryptBuffer(encryptedBytes, pass);
                const decryptedStr = new TextDecoder().decode(plainBytes);
                plainBytes.fill(0);

                textReveal.value = decryptedStr;
                textReveal.style.display = 'block';
                btnCopy.style.display = 'block';
                btnClearOutput.style.display = 'block';

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
            const pixelBufferCopy = currentRevealImageData.data.buffer.slice(0);
            const workerResult = await StegoWorkerClient.execute<{ decryptedBytes: ArrayBuffer }>(
                'DECRYPT_AUTO',
                {
                    pixelBuffer: pixelBufferCopy,
                    width: currentRevealImageData.width,
                    height: currentRevealImageData.height,
                    password: pass
                },
                [pixelBufferCopy],
                (pct, txt) => updateProgress(pct, txt)
            );

            updateProgress(85, "Veri açılıyor (Inflate)...");
            let decompressedBytes: Uint8Array;
            try {
                decompressedBytes = await CompressionEngine.decompress(new Uint8Array(workerResult.decryptedBytes));
            } catch {
                // Sıkıştırılmamış eski versiyon fallback
                decompressedBytes = new Uint8Array(workerResult.decryptedBytes);
            } finally {
                new Uint8Array(workerResult.decryptedBytes).fill(0);
            }

            // Dosya mı yoksa metin mi kontrol et (bayt düzeyinde \n arayarak UTF-8 ofset kaymasını önle)
            const headerWindow = decompressedBytes.subarray(0, Math.min(4096, decompressedBytes.length));
            const nlByteIdx = headerWindow.indexOf(0x0A);

            if (nlByteIdx > 0) {
                try {
                    const metaStr = new TextDecoder().decode(decompressedBytes.subarray(0, nlByteIdx));
                    const meta = JSON.parse(metaStr);
                    if (meta && typeof meta.n === 'string' && meta.n.length > 0 && typeof meta.s === 'number') {
                        decryptedFileName = sanitizeFilename(meta.n);
                        const fileBody = decompressedBytes.subarray(nlByteIdx + 1);
                        decryptedFileBlob = new Blob([fileBody.slice() as unknown as BlobPart]);
                        decompressedBytes.fill(0);

                        btnDownloadFile.textContent = `💾 İndir: ${decryptedFileName} (${Math.round(fileBody.length / 1024)} KB)`;
                        btnDownloadFile.style.display = 'block';
                        btnClearOutput.style.display = 'block';
                        updateProgress(100, "Dosya başarıyla çözüldü!");
                        showStatus(`Görselin içinden "${decryptedFileName}" başarıyla çıkartıldı!`, true);
                        return;
                    }
                } catch {
                    // JSON meta değilse düz metin olarak devam et
                }
            }

            const plainText = new TextDecoder().decode(decompressedBytes);
            decompressedBytes.fill(0);

            textReveal.value = plainText;
            textReveal.style.display = 'block';
            btnCopy.style.display = 'block';
            btnClearOutput.style.display = 'block';

            updateProgress(100, "Mesaj çözüldü!");
            showStatus("Gizli mesaj başarıyla açığa çıkarıldı!", true);
        } catch (err: any) {
            showStatus(`Çözme başarısız: ${err.message}`, false);
        } finally {
            btnDecrypt.disabled = false;
        }
    });

    btnDownloadFile.addEventListener('click', () => {
        if (!decryptedFileBlob) return;
        const url = URL.createObjectURL(decryptedFileBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = decryptedFileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    btnCopy.addEventListener('click', async () => {
        if (!textReveal.value) return;
        const ok = await safeWriteClipboard(textReveal.value);
        if (ok) {
            startClipboardClearTimer();
            showStatus("Gizli mesaj panoya kopyalandı! (30 saniye içinde pano ve çıktı temizlenecektir)", true);
        } else {
            showStatus("Panoya kopyalanamadı. Tarayıcı pano iznini kontrol edin.", false);
        }
    });

    btnClearOutput.addEventListener('click', () => {
        clearDecryptedOutput();
        clearStatus();
    });
}
