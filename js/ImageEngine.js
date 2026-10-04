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
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        
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
    }
};