// Minimal mock for ImageData in Node.js test environment
if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {
        constructor(width, height) {
            this.width = width;
            this.height = height;
            this.data = new Uint8ClampedArray(width * height * 4);
        }
    };
}

export function createMockImageData(width, height) {
    const img = new ImageData(width, height);
    // Initialize with 255 alpha
    for (let i = 3; i < img.data.length; i += 4) {
        img.data[i] = 255;
    }
    return img;
}
