/**
 * ImageEngine.js (Revize - QHD 2560px, Çift Kapasite & HEIC/HEIF Desteği)
 * - Görsel yükleme, canvas işleme ve mobil RAM optimizasyonu
 * - heic2any entegrasyonu ile Apple HEIC/HEIF görsellerini otomatik PNG'ye çevirme
 * - URL.revokeObjectURL ile bellek sızıntısı engelleme
 */

let heicLoaderPromise = null;

async function ensureHeic2Any() {
    if (typeof window !== 'undefined' && window.heic2any) {
        return window.heic2any;
    }
    if (heicLoaderPromise) return heicLoaderPromise;

    heicLoaderPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = './js/vendor/heic2any.min.js';
        script.onload = () => {
            if (window.heic2any) resolve(window.heic2any);
            else reject(new Error("heic2any başlatılamadı."));
        };
        script.onerror = () => reject(new Error("heic2any kütüphanesi yüklenemedi."));
        document.head.appendChild(script);
    });
    return heicLoaderPromise;
}

function isHeic(file) {
    if (!file) return false;
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    return type === 'image/heic' || 
           type === 'image/heif' || 
           name.endsWith('.heic') || 
           name.endsWith('.heif');
}

export const ImageEngine = {
    /**
     * Dosyanın HEIC/HEIF formatında olup olmadığını kontrol eder.
     * @param {File|Blob} file
     * @returns {boolean}
     */
    isHeicFile(file) {
        return isHeic(file);
    },

    /**
     * Taşıyıcı görsel kanal güvenliğini ve kayıplı sıkıştırma riskini denetler.
     * (Sosyal medya platformları, JPEG/WebP formatları vb.)
     * @param {File|Blob} file
     * @returns {{
     *   isLossy: boolean,
     *   isSocialMedia: boolean,
     *   format: string,
     *   warning: string|null,
     *   recommendation: string|null
     * }}
     */
    checkCarrierSafety(file) {
        if (!file) {
            return { isLossy: false, isSocialMedia: false, format: 'unknown', warning: null, recommendation: null };
        }
        const name = (file.name || '').toLowerCase();
        const type = (file.type || '').toLowerCase();

        const isJpeg = type === 'image/jpeg' || /\.(jpe?g)$/i.test(name);
        const isWebp = type === 'image/webp' || /\.webp$/i.test(name);
        const isSocial = /whatsapp|telegram|instagram|messenger|discord|signal|twitter|facebook|viber/i.test(name) ||
                         /img[-_]\d{8}[-_]wa\d+/i.test(name);

        if (isJpeg || isWebp) {
            const fmt = isJpeg ? 'JPEG' : 'WebP';
            return {
                isLossy: true,
                isSocialMedia: isSocial,
                format: fmt,
                warning: `Seçilen görsel kayıplı ${fmt} formatında. Kayıplı sıkıştırma pikselleri değiştirdiği için mekânsal LSB verilerini bozar; şifre çözülemeyebilir.`,
                recommendation: 'Lütfen şifreli orijinal, kayıpsız PNG dosyasını kullanın.'
            };
        }

        if (isSocial) {
            return {
                isLossy: false,
                isSocialMedia: true,
                format: 'PNG (Sosyal Medya İsimli)',
                warning: 'Görsel dosya adı bir sosyal medya veya mesajlaşma platformuna ait görünüyor. Eğer dosya "Fotoğraf" olarak iletildiyse sunucu tarafında kayıplı sıkıştırılmış olabilir.',
                recommendation: 'Şifre çözülemezse, göndericiden görseli "Belge / Dosya (Kayıpsız)" olarak tekrar iletmesini isteyin.'
            };
        }

        return {
            isLossy: false,
            isSocialMedia: false,
            format: type || 'image/png',
            warning: null,
            recommendation: null
        };
    },

    /**
     * HEIC/HEIF dosyasını saf istemci tarafında PNG Blob'a dönüştürür.
     * @param {File|Blob} file
     * @param {(status: string) => void} [onProgress]
     * @returns {Promise<Blob>}
     */
    async convertHeicToPng(file, onProgress) {
        if (onProgress) onProgress("Apple HEIC/HEIF görseli algılandı. PNG'ye dönüştürülüyor...");
        const converter = await ensureHeic2Any();
        const result = await converter({
            blob: file,
            toType: 'image/png',
            quality: 1.0
        });
        return Array.isArray(result) ? result[0] : result;
    },

    /**
     * Dosyadan Image nesnesi yükler. HEIC dosyalarını otomatik PNG'ye dönüştürür.
     * @param {File|Blob} file
     * @param {(status: string) => void} [onProgress]
     * @returns {Promise<HTMLImageElement>}
     */
    async loadImage(file, onProgress) {
        let processableFile = file;
        if (isHeic(file)) {
            processableFile = await this.convertHeicToPng(file, onProgress);
        }

        const url = URL.createObjectURL(processableFile);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("Görsel dosyası okunamadı. Desteklenen formatlar: PNG, JPG, JPEG, WEBP, HEIC, HEIF, BMP, GIF."));
            };
            img.src = url;
        });
    },

    /**
     * Görseli canvas'a çizer, maksimum boyuta ölçeklendirir (varsayılan 2560px QHD).
     * @param {HTMLImageElement} img
     * @param {number} [maxDim=2560] - Maksimum en/boy
     * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, imageData: ImageData, maxCapacityBytes: number, maxCapacityBytes1LSB: number, maxCapacityBytes2LSB: number }}
     */
    processToCanvas(img, maxDim = 2560) {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
            if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
            } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
            }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d", {
            willReadFrequently: true,
            colorSpace: "srgb"
        });

        // 1. Opak arka plan doldur (şeffaf PNG taşıyıcılarda alfa bozulmasını önler)
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);

        // 2. Görseli çiz
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        
        // 3. Tüm alfa piksellerini 255'e sabitle (Premultiplied alpha kaynaklı LSB bozulmasını engeller)
        const d = imageData.data;
        for (let i = 3; i < d.length; i += 4) {
            d[i] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
        
        // Kapasite hesapları (1-LSB ve 2-LSB)
        const totalChannels = Math.floor((imageData.data.length / 4) * 3);
        const maxCapacityBytes1LSB = Math.max(0, Math.floor(totalChannels / 8) - 36);
        const maxCapacityBytes2LSB = Math.max(0, 36 + Math.floor(((totalChannels - 288) * 2) / 8) - 36);
        const maxCapacityBytes = maxCapacityBytes1LSB;

        return { 
            canvas, 
            ctx, 
            imageData, 
            maxCapacityBytes, 
            maxCapacityBytes1LSB, 
            maxCapacityBytes2LSB 
        };
    },

    /**
     * Tarayıcının canvas çizimlerine parmak izi koruması (farbling/noise) ekleyip eklemediğini test eder.
     * Brave Shields, Firefox RFP veya gizlilik eklentileri piksel okumalarına gürültü ekleyerek LSB'yi bozabilir.
     * @returns {{ ok: boolean, farblingDetected: boolean, reason?: string }}
     */
    verifyCanvasIntegrity() {
        if (typeof document === 'undefined') return { ok: true, farblingDetected: false };
        try {
            const canvas = document.createElement("canvas");
            canvas.width = 8;
            canvas.height = 8;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) return { ok: false, farblingDetected: false, reason: "Canvas context alınamadı." };

            const testData = ctx.createImageData(8, 8);
            for (let i = 0; i < testData.data.length; i += 4) {
                testData.data[i] = (i * 7) & 0xFF;
                testData.data[i + 1] = (i * 13) & 0xFF;
                testData.data[i + 2] = (i * 29) & 0xFF;
                testData.data[i + 3] = 255;
            }
            ctx.putImageData(testData, 0, 0);

            const readBack = ctx.getImageData(0, 0, 8, 8);
            for (let i = 0; i < testData.data.length; i++) {
                if (testData.data[i] !== readBack.data[i]) {
                    return {
                        ok: false,
                        farblingDetected: true,
                        reason: `Canvas gürültüsü/farbling tespit edildi (bayt ${i}: beklenen ${testData.data[i]}, okunan ${readBack.data[i]}).`
                    };
                }
            }
            return { ok: true, farblingDetected: false };
        } catch (e) {
            return { ok: false, farblingDetected: false, reason: e.message };
        }
    }
};