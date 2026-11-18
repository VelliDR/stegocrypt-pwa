/**
 * src/ui/InspectTab.ts
 * Steganaliz & Adli Bilişim Laboratuvarı Sekmesi (LSB, Binary, Diff, ZeroWidth, zsteg).
 */

import { StegoWorkerClient } from '../workers/StegoWorkerClient.ts';
import { ImageEngine } from '../codec/ImageEngine.ts';
import { ZeroWidthDetector } from '../forensics/ZeroWidthDetector.ts';
import type { BinaryInspectionReport, SimpleImageData, ZstegFinding } from '../types/index.ts';
import {
    clearStatus,
    getEl,
    safeWriteClipboard,
    setupDropzoneDragAndDrop,
    showStatus,
    updateProgress
} from './dom.ts';

export function initInspectTab(): void {
    // 3.A LSB & Steganalysis
    let currentInspectImageData: SimpleImageData | null = null;
    let inspectRenderNonce = 0;

    const dropzoneInspect = getEl<HTMLElement>('dropzone-inspect');
    const fileInspectInput = getEl<HTMLInputElement>('file-inspect');
    const canvasInspect = getEl<HTMLCanvasElement>('canvas-inspect');
    const viewModeBitplane = getEl<HTMLInputElement>('view-mode-bitplane');
    const viewModeHeatmap = getEl<HTMLInputElement>('view-mode-heatmap');
    const bitplaneControls = getEl<HTMLElement>('bitplane-controls');
    const inspectChannelSelect = getEl<HTMLSelectElement>('inspect-bitplane-channel');
    const inspectDepthSelect = getEl<HTMLSelectElement>('inspect-bitplane-depth');
    const inspectProbBadge = getEl<HTMLElement>('inspect-prob-badge');
    const inspectVerdict = getEl<HTMLElement>('inspect-verdict');
    const inspectDetails = getEl<HTMLElement>('inspect-details');
    const inspectRsBadge = getEl<HTMLElement>('inspect-rs-badge');
    const inspectRsVerdict = getEl<HTMLElement>('inspect-rs-verdict');
    const inspectRsDetails = getEl<HTMLElement>('inspect-rs-details');

    async function renderInspectCanvas(): Promise<void> {
        if (!currentInspectImageData) return;
        const nonce = ++inspectRenderNonce;
        const isBitplane = viewModeBitplane.checked;
        const channel = inspectChannelSelect.value as 'r' | 'g' | 'b' | 'a' | 'all';
        const bitDepth = parseInt(inspectDepthSelect.value || '0', 10);

        bitplaneControls.style.display = isBitplane ? 'grid' : 'none';
        const label = document.getElementById('inspect-canvas-label');
        if (label) {
            label.textContent = isBitplane
                ? `Röntgen Filtresi & Görünüm: Bit Düzlemi ${bitDepth} (${channel === 'all' ? 'RGB' : channel.toUpperCase()})`
                : 'Röntgen Filtresi & Görünüm: χ² Isı Haritası (32x32)';
        }

        try {
            const pixelBufferCopy = currentInspectImageData.data.buffer.slice(0);
            if (isBitplane) {
                const res = await StegoWorkerClient.execute<{ bitPlaneBuffer: ArrayBuffer }>('RENDER_BIT_PLANE', {
                    pixelBuffer: pixelBufferCopy,
                    width: currentInspectImageData.width,
                    height: currentInspectImageData.height,
                    channel,
                    bitDepth
                }, [pixelBufferCopy]);
                if (nonce !== inspectRenderNonce) return;

                canvasInspect.width = currentInspectImageData.width;
                canvasInspect.height = currentInspectImageData.height;
                const ctx = canvasInspect.getContext('2d');
                if (ctx) {
                    const imgData = new ImageData(new Uint8ClampedArray(res.bitPlaneBuffer), currentInspectImageData.width, currentInspectImageData.height);
                    ctx.putImageData(imgData, 0, 0);
                }
            } else {
                const res = await StegoWorkerClient.execute<{ heatmapBuffer: ArrayBuffer }>('RENDER_HEATMAP', {
                    pixelBuffer: pixelBufferCopy,
                    width: currentInspectImageData.width,
                    height: currentInspectImageData.height,
                    blockSize: 32
                }, [pixelBufferCopy]);
                if (nonce !== inspectRenderNonce) return;

                canvasInspect.width = currentInspectImageData.width;
                canvasInspect.height = currentInspectImageData.height;
                const ctx = canvasInspect.getContext('2d');
                if (ctx) {
                    const imgData = new ImageData(new Uint8ClampedArray(res.heatmapBuffer), currentInspectImageData.width, currentInspectImageData.height);
                    ctx.putImageData(imgData, 0, 0);
                }
            }
        } catch (err: any) {
            showStatus(`Röntgen görselleştirme hatası: ${err.message}`, false);
        }
    }

    setupDropzoneDragAndDrop(dropzoneInspect, fileInspectInput);

    fileInspectInput.addEventListener('change', async () => {
        const file = fileInspectInput.files?.[0];
        if (!file) return;

        try {
            clearStatus();
            const inspectImg = await ImageEngine.loadImageData(file, { preserveAlpha: true });
            currentInspectImageData = inspectImg;
            getEl('inspect-controls').style.display = 'block';

            const chiBuf = inspectImg.data.buffer.slice(0);
            const chiRes = await StegoWorkerClient.execute<{ analysis: any }>('ANALYZE_CHI_SQUARE', {
                pixelBuffer: chiBuf,
                width: inspectImg.width,
                height: inspectImg.height
            }, [chiBuf]);

            const chi = chiRes.analysis;
            inspectProbBadge.textContent = `%${chi.probability}`;
            inspectProbBadge.style.backgroundColor = chi.isStego ? 'var(--md-error-container)' : 'var(--md-primary-container)';
            inspectProbBadge.style.color = chi.isStego ? 'var(--md-on-error-container)' : 'var(--md-on-primary-container)';
            inspectVerdict.textContent = chi.verdict;
            inspectDetails.textContent = `χ²: ${chi.chiSquare} | p-değeri: ${chi.pValue} | Serbestlik Derecesi: ${chi.degreesOfFreedom}`;

            const rsBuf = inspectImg.data.buffer.slice(0);
            const rsRes = await StegoWorkerClient.execute<{ rsResult: any }>('ANALYZE_RS', {
                pixelBuffer: rsBuf,
                width: inspectImg.width,
                height: inspectImg.height,
                channel: 'all'
            }, [rsBuf]);

            const rs = rsRes.rsResult;
            inspectRsBadge.textContent = `%${rs.estimatedPayloadPercent ?? (rs.estimatedRatio * 100)}`;
            inspectRsBadge.style.backgroundColor = rs.verdictLevel === 'stego' ? 'var(--md-error-container)' : 'var(--md-primary-container)';
            inspectRsBadge.style.color = rs.verdictLevel === 'stego' ? 'var(--md-on-error-container)' : 'var(--md-on-primary-container)';
            inspectRsVerdict.textContent = rs.verdict;
            inspectRsDetails.textContent = rs.details ?? `Tahmini LSB manipülasyon oranı: %${rs.estimatedRatio * 100}`;

            await renderInspectCanvas();
        } catch (err: any) {
            showStatus(`Steganaliz hatası: ${err.message}`, false);
        }
    });

    viewModeBitplane.addEventListener('change', () => { void renderInspectCanvas(); });
    viewModeHeatmap.addEventListener('change', () => { void renderInspectCanvas(); });
    inspectChannelSelect.addEventListener('change', () => { void renderInspectCanvas(); });
    inspectDepthSelect.addEventListener('change', () => { void renderInspectCanvas(); });

    // 3.B Binary Triage
    const dropzoneBinary = getEl<HTMLElement>('dropzone-binary');
    const fileBinaryInput = getEl<HTMLInputElement>('file-binary');
    const containerBinaryResults = getEl<HTMLElement>('container-binary-results');
    const binaryReportBox = getEl<HTMLElement>('binary-report');
    const binaryFormatBadge = getEl<HTMLElement>('binary-format-badge');
    const binarySizeLbl = getEl<HTMLElement>('binary-size-lbl');
    const binaryVerdict = getEl<HTMLElement>('binary-verdict');
    const binaryDetails = getEl<HTMLElement>('binary-details');
    const binaryIhdrSummary = getEl<HTMLElement>('binary-ihdr-summary');
    const binaryTextEntries = getEl<HTMLElement>('binary-text-entries');
    const binaryOverlayCard = getEl<HTMLElement>('binary-overlay-card');
    const binaryOverlayDetails = getEl<HTMLElement>('binary-overlay-details');
    const binaryOverlayHex = getEl<HTMLElement>('binary-overlay-hex');
    const btnDownloadOverlay = getEl<HTMLButtonElement>('btn-download-overlay');
    const binaryChunksContainer = getEl<HTMLElement>('binary-chunks-container');
    const binaryChunksTbody = getEl<HTMLTableSectionElement>('tbody-binary-chunks');

    setupDropzoneDragAndDrop(dropzoneBinary, fileBinaryInput);

    fileBinaryInput.addEventListener('change', async () => {
        const file = fileBinaryInput.files?.[0];
        if (!file) return;

        try {
            clearStatus();
            const buf = await file.arrayBuffer();
            const res = await StegoWorkerClient.execute<{ report: BinaryInspectionReport }>('INSPECT_BINARY', { fileBuffer: buf }, [buf]);
            const r = res.report;

            containerBinaryResults.style.display = 'block';
            binaryReportBox.style.display = 'block';
            binaryFormatBadge.textContent = r.format.toUpperCase();
            binarySizeLbl.textContent = `${Math.round(r.fileSize / 1024)} KB`;
            binaryVerdict.textContent = r.verdict;
            binaryDetails.textContent = r.verdictDetails;

            if (r.ihdrInfo) {
                binaryIhdrSummary.style.display = 'block';
                binaryIhdrSummary.textContent = `IHDR: ${r.ihdrInfo.width}×${r.ihdrInfo.height} • ${r.ihdrInfo.colorTypeName} • ${r.ihdrInfo.bitDepth}-bit`;
            } else {
                binaryIhdrSummary.style.display = 'none';
            }

            binaryTextEntries.textContent = '';
            if (r.textEntries && r.textEntries.length > 0) {
                binaryTextEntries.style.display = 'block';
                const title = document.createElement('strong');
                title.textContent = `tEXt Metaverileri (${r.textEntries.length}): `;
                binaryTextEntries.appendChild(title);
                binaryTextEntries.appendChild(
                    document.createTextNode(r.textEntries.map(t => `${t.keyword}=${t.text}`).join(' | '))
                );
            } else {
                binaryTextEntries.style.display = 'none';
            }

            if (r.trailingData) {
                const trailing = r.trailingData;
                binaryOverlayCard.style.display = 'block';
                binaryOverlayDetails.textContent = r.verdictDetails;
                binaryOverlayHex.textContent = trailing.hexPreview;
                btnDownloadOverlay.onclick = () => {
                    const blob = new Blob([trailing.bytes as unknown as BlobPart]);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `overlay_extracted.${trailing.possibleExtension || 'bin'}`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                };
            } else {
                binaryOverlayCard.style.display = 'none';
            }

            binaryChunksTbody.textContent = '';
            if (r.chunks && r.chunks.length > 0) {
                binaryChunksContainer.style.display = 'block';
                for (const chunk of r.chunks) {
                    const tr = document.createElement('tr');

                    const tdType = document.createElement('td');
                    tdType.style.fontWeight = '700';
                    tdType.style.color = chunk.isCritical ? 'var(--md-primary)' : 'var(--md-on-surface)';
                    tdType.textContent = chunk.type;

                    const tdLen = document.createElement('td');
                    tdLen.textContent = `${chunk.length} B`;

                    const tdOffset = document.createElement('td');
                    tdOffset.textContent = `0x${chunk.offset.toString(16)}`;

                    const tdCrc = document.createElement('td');
                    tdCrc.style.color = chunk.crcValid ? '#4caf50' : '#f44336';
                    tdCrc.textContent = chunk.crcValid ? '✓ Geçerli' : '✗ Hatalı';

                    tr.append(tdType, tdLen, tdOffset, tdCrc);
                    binaryChunksTbody.appendChild(tr);
                }
            } else {
                binaryChunksContainer.style.display = 'none';
            }
        } catch (err: any) {
            showStatus(`İkili analiz hatası: ${err.message}`, false);
        }
    });

    // 3.C Diff Comparison
    let diffOrigImageData: SimpleImageData | null = null;
    let diffStegoImageData: SimpleImageData | null = null;
    let cachedDiffResult: {
        comparison: any;
        ampDiffBuffer: ArrayBuffer;
        lsbDiffBuffer: ArrayBuffer;
        width: number;
        height: number;
    } | null = null;
    let diffAmpTimer: ReturnType<typeof setTimeout> | null = null;

    const dropzoneDiffOrig = getEl<HTMLElement>('dropzone-diff-orig');
    const dropzoneDiffStego = getEl<HTMLElement>('dropzone-diff-stego');
    const fileDiffCover = getEl<HTMLInputElement>('file-diff-cover');
    const fileDiffStego = getEl<HTMLInputElement>('file-diff-stego');
    const labelDiffCover = getEl<HTMLElement>('label-diff-cover');
    const labelDiffStego = getEl<HTMLElement>('label-diff-stego');
    const btnRunDiff = getEl<HTMLButtonElement>('btn-run-diff');
    const containerDiffResults = getEl<HTMLElement>('container-diff-results');
    const diffPsnrVal = getEl<HTMLElement>('diff-psnr-val');
    const diffSsimVal = getEl<HTMLElement>('diff-ssim-val');
    const diffChangedVal = getEl<HTMLElement>('diff-changed-val');
    const diffModeAmplified = getEl<HTMLInputElement>('diff-mode-amplified');
    const diffModeLsb = getEl<HTMLInputElement>('diff-mode-lsb');
    const containerDiffSlider = getEl<HTMLElement>('container-diff-slider');
    const diffAmpSlider = getEl<HTMLInputElement>('diff-amp-slider');
    const diffAmpLabel = getEl<HTMLElement>('diff-amp-label');
    const canvasDiff = getEl<HTMLCanvasElement>('canvas-diff');

    setupDropzoneDragAndDrop(dropzoneDiffOrig, fileDiffCover);
    setupDropzoneDragAndDrop(dropzoneDiffStego, fileDiffStego);

    fileDiffCover.addEventListener('change', async () => {
        const f = fileDiffCover.files?.[0];
        if (!f) return;
        try {
            clearStatus();
            diffOrigImageData = await ImageEngine.loadImageData(f, { preserveAlpha: true });
            labelDiffCover.textContent = `Cover (${diffOrigImageData.width}x${diffOrigImageData.height})`;
        } catch (err: any) {
            diffOrigImageData = null;
            showStatus(`Referans görsel yüklenemedi: ${err.message}`, false);
        }
    });

    fileDiffStego.addEventListener('change', async () => {
        const f = fileDiffStego.files?.[0];
        if (!f) return;
        try {
            clearStatus();
            diffStegoImageData = await ImageEngine.loadImageData(f, { preserveAlpha: true });
            labelDiffStego.textContent = `Stego (${diffStegoImageData.width}x${diffStegoImageData.height})`;
        } catch (err: any) {
            diffStegoImageData = null;
            showStatus(`Şüpheli görsel yüklenemedi: ${err.message}`, false);
        }
    });

    function renderDiffCanvas(): void {
        if (!cachedDiffResult) return;
        const isLsb = diffModeLsb.checked;
        containerDiffSlider.style.display = isLsb ? 'none' : 'block';

        canvasDiff.width = cachedDiffResult.width;
        canvasDiff.height = cachedDiffResult.height;
        const ctx = canvasDiff.getContext('2d');
        if (ctx) {
            const buffer = isLsb ? cachedDiffResult.lsbDiffBuffer : cachedDiffResult.ampDiffBuffer;
            const imgData = new ImageData(new Uint8ClampedArray(buffer), cachedDiffResult.width, cachedDiffResult.height);
            ctx.putImageData(imgData, 0, 0);
        }
    }

    diffModeAmplified.addEventListener('change', renderDiffCanvas);
    diffModeLsb.addEventListener('change', renderDiffCanvas);
    diffAmpSlider.addEventListener('input', () => {
        diffAmpLabel.textContent = `${diffAmpSlider.value}x`;
        if (!cachedDiffResult || !diffOrigImageData || !diffStegoImageData || diffModeLsb.checked) return;

        if (diffAmpTimer) clearTimeout(diffAmpTimer);
        diffAmpTimer = setTimeout(async () => {
            if (!diffOrigImageData || !diffStegoImageData || !cachedDiffResult) return;
            try {
                const amp = parseInt(diffAmpSlider.value || '30', 10);
                const b1 = diffOrigImageData.data.buffer.slice(0);
                const b2 = diffStegoImageData.data.buffer.slice(0);
                const res = await StegoWorkerClient.execute<{ ampDiffBuffer: ArrayBuffer }>('RENDER_AMPLIFIED_DIFF', {
                    pixelBuffer1: b1,
                    pixelBuffer2: b2,
                    width: diffOrigImageData.width,
                    height: diffOrigImageData.height,
                    amplifier: amp
                }, [b1, b2]);
                if (cachedDiffResult) {
                    cachedDiffResult.ampDiffBuffer = res.ampDiffBuffer;
                    renderDiffCanvas();
                }
            } catch {
                // Slider önizleme güncelleme hatasını sessizce yoksay
            }
        }, 80);
    });

    btnRunDiff.addEventListener('click', async () => {
        if (!diffOrigImageData || !diffStegoImageData) {
            showStatus("Lütfen hem orijinal hem de stego görseli seçin.", false);
            return;
        }

        btnRunDiff.disabled = true;
        try {
            clearStatus();
            const amp = parseInt(diffAmpSlider.value || '30', 10);
            const b1 = diffOrigImageData.data.buffer.slice(0);
            const b2 = diffStegoImageData.data.buffer.slice(0);
            const res = await StegoWorkerClient.execute<{
                comparison: any;
                ampDiffBuffer: ArrayBuffer;
                lsbDiffBuffer: ArrayBuffer;
                width: number;
                height: number;
            }>('COMPARE_IMAGES', {
                pixelBuffer1: b1,
                pixelBuffer2: b2,
                width: diffOrigImageData.width,
                height: diffOrigImageData.height,
                amplifier: amp
            }, [b1, b2]);

            cachedDiffResult = res;
            containerDiffResults.style.display = 'block';
            diffPsnrVal.textContent = res.comparison.psnr === Infinity ? '∞ dB' : `${res.comparison.psnr.toFixed(2)} dB`;
            diffSsimVal.textContent = res.comparison.ssim.toFixed(4);
            diffChangedVal.textContent = `${res.comparison.changedPixels} (%${res.comparison.changedPercent.toFixed(2)})`;

            renderDiffCanvas();
        } catch (err: any) {
            showStatus(`Diff hatası: ${err.message}`, false);
        } finally {
            btnRunDiff.disabled = false;
        }
    });

    // 3.D Invisible Text Detector
    const textZerowidthInput = getEl<HTMLTextAreaElement>('text-zerowidth-input');
    const btnAnalyzeZerowidth = getEl<HTMLButtonElement>('btn-analyze-zerowidth');
    const containerZerowidthResults = getEl<HTMLElement>('container-zerowidth-results');
    const zerowidthVerdictBanner = getEl<HTMLElement>('zerowidth-verdict-banner');
    const zwVerdict = getEl<HTMLElement>('zw-verdict');
    const zwDetails = getEl<HTMLElement>('zw-details');
    const containerSmuggledAscii = getEl<HTMLElement>('container-smuggled-ascii');
    const textSmuggledPayload = getEl<HTMLTextAreaElement>('text-smuggled-payload');
    const containerBidiWarning = getEl<HTMLElement>('container-bidi-warning');
    const textZerowidthClean = getEl<HTMLTextAreaElement>('text-zerowidth-clean');
    const btnCopyCleanText = getEl<HTMLButtonElement>('btn-copy-clean-text');

    btnAnalyzeZerowidth.addEventListener('click', () => {
        const text = textZerowidthInput.value;
        if (!text) {
            showStatus("Lütfen taranacak metni girin.", false);
            return;
        }

        const report = ZeroWidthDetector.analyze(text);
        containerZerowidthResults.style.display = 'block';

        if (report.hasZeroWidth) {
            zerowidthVerdictBanner.textContent = "🚨 Gizli Karakter Tespit Edildi! (Sıfır Genişlik / Smuggling / BiDi)";
            if (report.hasBidiTrojan) {
                zwVerdict.textContent = "🚨 Kritik Uyarı: BiDi Truva Atı ve Gizli Karakterler Tespit Edildi!";
                zwVerdict.style.color = 'var(--md-error)';
                containerBidiWarning.style.display = 'block';
            } else {
                zwVerdict.textContent = "⚠️ Şüpheli / Görünmez Karakterler Tespit Edildi!";
                zwVerdict.style.color = 'var(--md-error)';
                containerBidiWarning.style.display = 'none';
            }

            zwDetails.textContent = `Toplam ${report.count} adet şüpheli / gizli karakter tespit edildi.\nTespit Edilen Türler: ${report.types.join(', ')}`;

            if (report.smuggledText) {
                containerSmuggledAscii.style.display = 'block';
                textSmuggledPayload.value = report.smuggledText;
            } else {
                containerSmuggledAscii.style.display = 'none';
                textSmuggledPayload.value = '';
            }

            textZerowidthClean.value = report.cleanedText;
        } else {
            zerowidthVerdictBanner.textContent = "✓ Temiz Metin (Görünmez veya Aldatıcı Karakter Yok)";
            zwVerdict.textContent = "✓ Temiz Metin (Görünmez veya Aldatıcı Karakter Yok)";
            zwVerdict.style.color = 'var(--md-primary)';
            zwDetails.textContent = "Metinde herhangi bir sıfır-genişlikli, variation selector, BiDi yönlendirici, dolgu veya tag karakteri bulunamadı.";
            containerSmuggledAscii.style.display = 'none';
            textSmuggledPayload.value = '';
            containerBidiWarning.style.display = 'none';
            textZerowidthClean.value = report.cleanedText;
        }
    });

    btnCopyCleanText.addEventListener('click', async () => {
        if (!textZerowidthClean.value) return;
        const ok = await safeWriteClipboard(textZerowidthClean.value);
        showStatus(ok ? "Arındırılmış temiz metin panoya kopyalandı!" : "Panoya kopyalanamadı.", ok);
    });

    // 3.E zsteg Deep Scanner
    let zstegImageData: SimpleImageData | null = null;
    const dropzoneZsteg = getEl<HTMLElement>('dropzone-zsteg');
    const fileZstegInput = getEl<HTMLInputElement>('file-zsteg');
    const labelZstegFile = getEl<HTMLElement>('label-zsteg-file');
    const btnStartZsteg = getEl<HTMLButtonElement>('btn-start-zsteg');
    const containerZstegResults = getEl<HTMLElement>('container-zsteg-results');
    const zstegFindingsCount = getEl<HTMLElement>('zsteg-findings-count');
    const tbodyZstegResults = getEl<HTMLTableSectionElement>('tbody-zsteg-results');

    setupDropzoneDragAndDrop(dropzoneZsteg, fileZstegInput);

    fileZstegInput.addEventListener('change', async () => {
        const f = fileZstegInput.files?.[0];
        if (!f) return;
        try {
            clearStatus();
            zstegImageData = await ImageEngine.loadImageData(f, { preserveAlpha: true });
            labelZstegFile.textContent = `${f.name} (${zstegImageData.width}×${zstegImageData.height})`;
        } catch (err: any) {
            zstegImageData = null;
            showStatus(`zsteg görseli yüklenemedi: ${err.message}`, false);
        }
    });

    btnStartZsteg.addEventListener('click', async () => {
        if (!zstegImageData) {
            showStatus("Lütfen taranacak PNG görselini seçin.", false);
            return;
        }

        btnStartZsteg.disabled = true;
        try {
            clearStatus();
            tbodyZstegResults.textContent = '';
            containerZstegResults.style.display = 'block';

            const bufCopy = zstegImageData.data.buffer.slice(0);
            const res = await StegoWorkerClient.execute<{ findings: ZstegFinding[] }>(
                'SCAN_ZSTEG',
                {
                    pixelBuffer: bufCopy,
                    width: zstegImageData.width,
                    height: zstegImageData.height,
                    maxSampleBytes: 2048
                },
                [bufCopy],
                (pct, txt) => updateProgress(pct, txt)
            );

            zstegFindingsCount.textContent = `${res.findings.length} Bulgu`;

            if (res.findings.length === 0) {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 4;
                td.style.textAlign = 'center';
                td.style.color = 'var(--md-on-surface-variant)';
                td.textContent = '56 kombinasyonda belirgin dosya imzası veya metin bulunamadı.';
                tr.appendChild(td);
                tbodyZstegResults.appendChild(tr);
                return;
            }

            const scannedSnapshot = zstegImageData;
            for (const finding of res.findings) {
                const tr = document.createElement('tr');

                const tdCombo = document.createElement('td');
                tdCombo.style.fontFamily = 'monospace';
                tdCombo.style.fontWeight = '700';
                tdCombo.style.color = 'var(--md-primary)';
                tdCombo.textContent = finding.comboId;

                const tdSig = document.createElement('td');
                tdSig.style.fontWeight = '600';
                tdSig.textContent = finding.signatureName;

                const tdSample = document.createElement('td');
                tdSample.style.fontFamily = 'monospace';
                tdSample.style.fontSize = '0.75rem';
                tdSample.style.color = '#fff';
                tdSample.textContent = finding.textSample;

                const tdAction = document.createElement('td');
                const btnExtract = document.createElement('button');
                btnExtract.type = 'button';
                btnExtract.className = 'm3-btn m3-btn-tonal btn-zsteg-export';
                btnExtract.style.padding = '4px 8px';
                btnExtract.style.fontSize = '0.7rem';
                btnExtract.style.width = 'auto';
                btnExtract.dataset.combo = finding.comboId;
                btnExtract.textContent = 'Çıkart';

                btnExtract.addEventListener('click', async () => {
                    btnExtract.disabled = true;
                    try {
                        const extractBuf = scannedSnapshot.data.buffer.slice(0);
                        const payloadRes = await StegoWorkerClient.execute<{ payloadBuffer: ArrayBuffer }>(
                            'EXTRACT_ZSTEG_PAYLOAD',
                            {
                                pixelBuffer: extractBuf,
                                width: scannedSnapshot.width,
                                height: scannedSnapshot.height,
                                comboId: finding.comboId,
                                maxBytes: 1048576
                            },
                            [extractBuf]
                        );
                        const blob = new Blob([payloadRes.payloadBuffer]);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `zsteg_${finding.comboId}.bin`;
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } catch (err: any) {
                        showStatus(`zsteg yük çıkarma hatası: ${err.message}`, false);
                    } finally {
                        btnExtract.disabled = false;
                    }
                });

                tdAction.appendChild(btnExtract);
                tr.append(tdCombo, tdSig, tdSample, tdAction);
                tbodyZstegResults.appendChild(tr);
            }
        } catch (err: any) {
            showStatus(`zsteg tarama hatası: ${err.message}`, false);
        } finally {
            btnStartZsteg.disabled = false;
        }
    });
}
