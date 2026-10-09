import test from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/mockImageData.js';
import { createMockImageData } from '../helpers/mockImageData.js';
import { SteganalysisEngine } from '../../js/SteganalysisEngine.js';
import { StegoEngine } from '../../js/StegoEngine.js';

test('SteganalysisEngine - Returns low probability on natural image gradient', () => {
    const width = 100;
    const height = 100;
    const img = createMockImageData(width, height);

    // Fill with natural-like varying gradient (adjacent even/odd counts differ)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            // Introduce natural asymmetry between even and odd pixel values
            img.data[idx] = (x * 2) % 256;         // Mostly even values
            img.data[idx + 1] = (y * 2) % 256;     // Mostly even values
            img.data[idx + 2] = ((x + y) * 2) % 256;
            img.data[idx + 3] = 255;
        }
    }

    const result = SteganalysisEngine.analyzeChiSquare(img);
    assert.ok(result.dof > 0, 'dof should be greater than 0');
    assert.strictEqual(result.probability < 20, true, `Probability should be low on natural image, got ${result.probability}%`);
    assert.match(result.verdict, /Temiz/);
});

test('SteganalysisEngine - Detects full sequential LSB replacement', () => {
    const width = 100;
    const height = 100;
    const img = createMockImageData(width, height);

    // Start with a natural gradient
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            img.data[idx] = (x * 2) % 256;
            img.data[idx + 1] = (y * 2) % 256;
            img.data[idx + 2] = ((x + y) * 2) % 256;
            img.data[idx + 3] = 255;
        }
    }

    // Now embed pseudo-random sequential payload filling the image
    const usableChannels = width * height * 3;
    const dummyPayload = new Uint8Array(Math.floor(usableChannels / 8));
    crypto.getRandomValues(dummyPayload);

    // Overwrite LSBs with pseudo-random bits
    let bitIdx = 0;
    for (let i = 0; i < img.data.length && bitIdx < dummyPayload.length * 8; i++) {
        if ((i + 1) % 4 === 0) continue; // skip alpha
        const bytePos = Math.floor(bitIdx / 8);
        const bitPos = 7 - (bitIdx % 8);
        const bitVal = (dummyPayload[bytePos] >> bitPos) & 1;
        img.data[i] = (img.data[i] & 0xFE) | bitVal;
        bitIdx++;
    }

    const result = SteganalysisEngine.analyzeChiSquare(img);
    assert.strictEqual(result.probability >= 50, true, `Probability should be >= 50% for full LSB replacement, got ${result.probability}%`);
    assert.match(result.verdict, /LSB Şifreli Veri İçeriyor|Şüpheli LSB Örüntüsü/);
});

test('SteganalysisEngine - Handles tiny image with insufficient data gracefully', () => {
    const img = createMockImageData(2, 2); // Only 12 channels
    const result = SteganalysisEngine.analyzeChiSquare(img);
    assert.strictEqual(result.dof, 0);
    assert.strictEqual(result.probability, 0);
    assert.match(result.verdict, /Yetersiz Veri/);
});
