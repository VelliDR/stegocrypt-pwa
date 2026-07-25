/**
 * ImageEngine.js
 * Görsel yükleme, Canvas işleme ve mobil RAM optimizasyon motoru.
 */

export const ImageEngine = {
    async loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Görsel dosyası okunamadı."));
            img.src = URL.createObjectURL(file);
        });
    },

    processToCanvas(img, maxDim = 1920) {
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

        // Renk profili dönüşümünü ve piksellerin bozulmasını engelleme
        const ctx = canvas.getContext("2d", { 
            willReadFrequently: true,
            colorSpace: "srgb"
        });
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const maxCapacityBytes = Math.floor((imageData.data.length / 4) * 3 / 8) - 36;

        return { canvas, ctx, imageData, maxCapacityBytes };
    }
};