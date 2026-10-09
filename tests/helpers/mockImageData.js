// Minimal mock for ImageData in Node.js test environment
if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {
        constructor(...args) {
            if (args[0] instanceof Uint8ClampedArray || args[0] instanceof Uint8Array) {
                this.data = args[0] instanceof Uint8ClampedArray ? args[0] : new Uint8ClampedArray(args[0]);
                this.width = args[1];
                this.height = args[2];
            } else {
                this.width = args[0];
                this.height = args[1];
                this.data = new Uint8ClampedArray(this.width * this.height * 4);
            }
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
