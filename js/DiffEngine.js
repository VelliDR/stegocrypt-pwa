/**
 * js/DiffEngine.js
 * Faz 5: Görsel Karşılaştırma, Fark Haritası, PSNR ve SSIM Motoru (Stego-Workbench)
 * - Taşıyıcı (Cover) ve Şifreli (Stego) görselleri piksel düzeyinde karşılaştırır.
 * - Değişen piksel sayısı ve yüzdesi, MSE, PSNR (dB) ve SSIM hesaplar.
 * - Büyütülmüş fark haritası (|P1 - P2| * k) ve LSB Düzlemi fark haritası üretir.
 */

export const DiffEngine = {
    /**
     * İki görselin boyut ve veri uyumluluğunu denetler.
     * @param {ImageData|object} img1
     * @param {ImageData|object} img2
     */
    validateDimensions(img1, img2) {
        if (!img1 || !img2) {
            throw new Error("Karşılaştırma için iki görsel de sağlanmalıdır.");
        }
        if (img1.width !== img2.width || img1.height !== img2.height) {
            throw new Error(`Görsel boyutları uyuşmuyor: (${img1.width}x${img1.height}) vs (${img2.width}x${img2.height}).`);
        }
    },

    /**
     * İki görsel arasındaki MSE ve PSNR (Peak Signal-to-Noise Ratio) değerini hesaplar.
     * @param {ImageData|object} img1 - Orijinal / Taşıyıcı
     * @param {ImageData|object} img2 - Şifreli / Karşılaştırılan
     * @returns {{ mse: number, psnr: number, changedPixels: number, changedPixelsPercent: number, totalPixels: number }}
     */
    calculatePsnr(img1, img2) {
        this.validateDimensions(img1, img2);
        const d1 = img1.data;
        const d2 = img2.data;
        const totalPixels = img1.width * img1.height;

        let sumSquaredError = 0;
        let changedPixels = 0;

        for (let i = 0; i < totalPixels; i++) {
            const idx = i * 4;
            const dr = d1[idx] - d2[idx];
            const dg = d1[idx + 1] - d2[idx + 1];
            const db = d1[idx + 2] - d2[idx + 2];

            if (dr !== 0 || dg !== 0 || db !== 0) {
                changedPixels++;
                sumSquaredError += (dr * dr) + (dg * dg) + (db * db);
            }
        }

        const mse = sumSquaredError / (3 * totalPixels);
        let psnr = Infinity;
        if (mse > 0) {
            psnr = 10 * Math.log10((255 * 255) / mse);
        }

        const changedPixelsPercent = parseFloat(((changedPixels / totalPixels) * 100).toFixed(2));

        return {
            mse: parseFloat(mse.toFixed(4)),
            psnr: psnr === Infinity ? Infinity : parseFloat(psnr.toFixed(2)),
            changedPixels,
            changedPixelsPercent,
            changedPercent: changedPixelsPercent,
            totalPixels
        };
    },

    /**
     * İki görsel arasındaki SSIM (Structural Similarity Index Measure) değerini hesaplar.
     * Standart 8x8 blok temelli lüminans (Y) karşılaştırması uygular.
     * @param {ImageData|object} img1
     * @param {ImageData|object} img2
     * @param {number} [blockSize=8]
     * @returns {number} 0.0 ile 1.0 arasında SSIM değeri (Birebir aynı görsellerde 1.0)
     */
    calculateSsim(img1, img2, blockSize = 8) {
        this.validateDimensions(img1, img2);
        const width = img1.width;
        const height = img1.height;
        const d1 = img1.data;
        const d2 = img2.data;

        // Birebir aynı ise doğrudan 1.0 döndür
        let identical = true;
        for (let i = 0; i < d1.length; i += 4) {
            if (d1[i] !== d2[i] || d1[i + 1] !== d2[i + 1] || d1[i + 2] !== d2[i + 2]) {
                identical = false;
                break;
            }
        }
        if (identical) return 1.0;

        // Lüminans dizileri (Y kanalı)
        const y1 = new Float32Array(width * height);
        const y2 = new Float32Array(width * height);
        for (let i = 0; i < width * height; i++) {
            const idx = i * 4;
            y1[i] = 0.299 * d1[idx] + 0.587 * d1[idx + 1] + 0.114 * d1[idx + 2];
            y2[i] = 0.299 * d2[idx] + 0.587 * d2[idx + 1] + 0.114 * d2[idx + 2];
        }

        const C1 = 6.5025;  // (0.01 * 255)^2
        const C2 = 58.5225; // (0.03 * 255)^2

        let totalSsim = 0;
        let blockCount = 0;

        const xBlocks = Math.floor(width / blockSize);
        const yBlocks = Math.floor(height / blockSize);

        if (xBlocks === 0 || yBlocks === 0) {
            // Görsel blok boyutundan küçükse tüm görseli tek blok yap
            return this._calculateBlockSsim(y1, y2, 0, 0, width, height, width, C1, C2);
        }

        for (let by = 0; by < yBlocks; by++) {
            const startY = by * blockSize;
            for (let bx = 0; bx < xBlocks; bx++) {
                const startX = bx * blockSize;
                const blockSsim = this._calculateBlockSsim(y1, y2, startX, startY, blockSize, blockSize, width, C1, C2);
                totalSsim += blockSsim;
                blockCount++;
            }
        }

        const avgSsim = totalSsim / blockCount;
        return parseFloat(Math.max(0, Math.min(1, avgSsim)).toFixed(4));
    },

    _calculateBlockSsim(y1, y2, startX, startY, bw, bh, stride, C1, C2) {
        const N = bw * bh;
        let sum1 = 0;
        let sum2 = 0;

        for (let y = 0; y < bh; y++) {
            const rowOffset = (startY + y) * stride + startX;
            for (let x = 0; x < bw; x++) {
                sum1 += y1[rowOffset + x];
                sum2 += y2[rowOffset + x];
            }
        }

        const mu1 = sum1 / N;
        const mu2 = sum2 / N;

        let var1 = 0;
        let var2 = 0;
        let covar = 0;

        for (let y = 0; y < bh; y++) {
            const rowOffset = (startY + y) * stride + startX;
            for (let x = 0; x < bw; x++) {
                const diff1 = y1[rowOffset + x] - mu1;
                const diff2 = y2[rowOffset + x] - mu2;
                var1 += diff1 * diff1;
                var2 += diff2 * diff2;
                covar += diff1 * diff2;
            }
        }

        const sigma1Sq = var1 / (N - 1 || 1);
        const sigma2Sq = var2 / (N - 1 || 1);
        const sigma12 = covar / (N - 1 || 1);

        const numerator = (2 * mu1 * mu2 + C1) * (2 * sigma12 + C2);
        const denominator = (mu1 * mu1 + mu2 * mu2 + C1) * (sigma1Sq + sigma2Sq + C2);

        return denominator === 0 ? 1 : numerator / denominator;
    },

    /**
     * Büyütülmüş fark haritası (Amplified Difference Map) üretir.
     * @param {ImageData|object} img1
     * @param {ImageData|object} img2
     * @param {number} [amplifier=20]
     * @returns {ImageData|object} RGBA fark haritası
     */
    renderAmplifiedDiff(img1, img2, amplifier = 20) {
        this.validateDimensions(img1, img2);
        const width = img1.width;
        const height = img1.height;
        const d1 = img1.data;
        const d2 = img2.data;

        const outData = new Uint8ClampedArray(width * height * 4);

        for (let i = 0; i < width * height; i++) {
            const idx = i * 4;
            const dr = Math.abs(d1[idx] - d2[idx]) * amplifier;
            const dg = Math.abs(d1[idx + 1] - d2[idx + 1]) * amplifier;
            const db = Math.abs(d1[idx + 2] - d2[idx + 2]) * amplifier;

            outData[idx] = Math.min(255, dr);
            outData[idx + 1] = Math.min(255, dg);
            outData[idx + 2] = Math.min(255, db);
            outData[idx + 3] = 255;
        }

        if (typeof ImageData !== 'undefined') {
            return new ImageData(outData, width, height);
        }
        return { width, height, data: outData };
    },

    /**
     * LSB düzlemi fark haritası üretir (Değişen LSB bitlerini parlak sarı/kırmızı ile vurgular).
     * @param {ImageData|object} img1
     * @param {ImageData|object} img2
     * @returns {ImageData|object}
     */
    renderLsbDiff(img1, img2) {
        this.validateDimensions(img1, img2);
        const width = img1.width;
        const height = img1.height;
        const d1 = img1.data;
        const d2 = img2.data;

        const outData = new Uint8ClampedArray(width * height * 4);

        for (let i = 0; i < width * height; i++) {
            const idx = i * 4;
            const diffLsb = ((d1[idx] ^ d2[idx]) & 1) ||
                            ((d1[idx + 1] ^ d2[idx + 1]) & 1) ||
                            ((d1[idx + 2] ^ d2[idx + 2]) & 1);

            if (diffLsb) {
                // Değişen LSB: Parlak altın sarısı
                outData[idx] = 255;
                outData[idx + 1] = 215;
                outData[idx + 2] = 0;
                outData[idx + 3] = 255;
            } else {
                // Değişmeyen: Arka planı koyulaştırılmış gri
                const y = Math.floor((0.299 * d1[idx] + 0.587 * d1[idx + 1] + 0.114 * d1[idx + 2]) * 0.15);
                outData[idx] = y;
                outData[idx + 1] = y;
                outData[idx + 2] = y;
                outData[idx + 3] = 255;
            }
        }

        if (typeof ImageData !== 'undefined') {
            return new ImageData(outData, width, height);
        }
        return { width, height, data: outData };
    },

    /**
     * Kapsamlı karşılaştırma raporu üretir.
     * @param {ImageData|object} img1
     * @param {ImageData|object} img2
     * @returns {object}
     */
    compare(img1, img2) {
        const psnrResult = this.calculatePsnr(img1, img2);
        const ssim = this.calculateSsim(img1, img2);

        let verdict = "Birebir Aynı Görseller";
        let verdictLevel = "clean";
        let verdictDetails = "Görseller piksel düzeyinde %100 özdeştir (MSE = 0, PSNR = ∞, SSIM = 1.000).";

        if (psnrResult.changedPixels > 0) {
            if (psnrResult.psnr >= 50) {
                verdict = "İnce / Steganografik Değişiklik";
                verdictLevel = "alert";
                verdictDetails = `Görselde insan gözünün ayırt edemeyeceği çok küçük değişiklikler saptandı (PSNR: ${psnrResult.psnr} dB, SSIM: ${ssim}). LSB steganografi tespit edildi.`;
            } else if (psnrResult.psnr >= 35) {
                verdict = "Orta Düzey Manipülasyon / Sıkıştırma";
                verdictLevel = "warning";
                verdictDetails = `Görselde fark edilebilir varyans değişimi var (PSNR: ${psnrResult.psnr} dB, SSIM: ${ssim}).`;
            } else {
                verdict = "Belirgin Görsel Farklılık";
                verdictLevel = "alert";
                verdictDetails = `İki görsel arasında gözle görülür büyük değişiklikler var (PSNR: ${psnrResult.psnr} dB, SSIM: ${ssim}).`;
            }
        }

        return {
            ...psnrResult,
            ssim,
            verdict,
            verdictLevel,
            verdictDetails
        };
    }
};
