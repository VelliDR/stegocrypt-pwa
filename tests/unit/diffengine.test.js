import test from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/mockImageData.js';
import { DiffEngine } from '../../js/DiffEngine.js';

test('DiffEngine - Identical images produce MSE 0, PSNR Infinity, SSIM 1.000', () => {
    const width = 32;
    const height = 32;
    const data1 = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data1.length; i += 4) {
        data1[i] = (i * 3) & 0xFF;
        data1[i + 1] = (i * 7) & 0xFF;
        data1[i + 2] = (i * 11) & 0xFF;
        data1[i + 3] = 255;
    }
    const data2 = new Uint8ClampedArray(data1);

    const img1 = { width, height, data: data1 };
    const img2 = { width, height, data: data2 };

    const comp = DiffEngine.compare(img1, img2);
    assert.equal(comp.changedPixels, 0);
    assert.equal(comp.changedPixelsPercent, 0);
    assert.equal(comp.mse, 0);
    assert.equal(comp.psnr, Infinity);
    assert.equal(comp.ssim, 1.0);
    assert.equal(comp.verdictLevel, 'clean');
});

test('DiffEngine - Detects subtle LSB modifications with realistic PSNR and SSIM', () => {
    const width = 32;
    const height = 32;
    const data1 = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data1.length; i += 4) {
        data1[i] = 128;
        data1[i + 1] = 128;
        data1[i + 2] = 128;
        data1[i + 3] = 255;
    }

    const data2 = new Uint8ClampedArray(data1);
    // 50 pikselin LSB'sini 1 artır/azalt
    for (let i = 0; i < 50; i++) {
        data2[i * 4] = data1[i * 4] + 1;
    }

    const img1 = { width, height, data: data1 };
    const img2 = { width, height, data: data2 };

    const comp = DiffEngine.compare(img1, img2);
    assert.equal(comp.changedPixels, 50);
    assert.ok(comp.changedPixelsPercent > 0);
    assert.ok(comp.psnr > 50, `Subtle LSB modification should have PSNR > 50 dB, got ${comp.psnr}`);
    assert.ok(comp.ssim > 0.99, `Subtle LSB modification should have SSIM > 0.99, got ${comp.ssim}`);
    assert.equal(comp.verdictLevel, 'alert');
});

test('DiffEngine - renderAmplifiedDiff and renderLsbDiff produce valid output maps', () => {
    const width = 16;
    const height = 16;
    const data1 = new Uint8ClampedArray(width * height * 4).fill(100);
    const data2 = new Uint8ClampedArray(data1);

    // Piksel 0'da fark oluştur
    data2[0] = 105; // dr = 5
    data2[1] = 102; // dg = 2
    data2[2] = 100; // db = 0

    const img1 = { width, height, data: data1 };
    const img2 = { width, height, data: data2 };

    // Büyütülmüş fark (k = 20): dr = 5 * 20 = 100
    const ampDiff = DiffEngine.renderAmplifiedDiff(img1, img2, 20);
    assert.equal(ampDiff.data[0], 100);
    assert.equal(ampDiff.data[1], 40);
    assert.equal(ampDiff.data[2], 0);
    assert.equal(ampDiff.data[3], 255);

    // LSB fark haritası: Piksel 0 LSB farklı olmalı (altın sarısı: 255, 215, 0)
    const lsbDiff = DiffEngine.renderLsbDiff(img1, img2);
    assert.equal(lsbDiff.data[0], 255);
    assert.equal(lsbDiff.data[1], 215);
    assert.equal(lsbDiff.data[2], 0);
    assert.equal(lsbDiff.data[3], 255);
});

test('DiffEngine - Throws error on mismatched image dimensions', () => {
    const img1 = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
    const img2 = { width: 20, height: 20, data: new Uint8ClampedArray(1600) };

    assert.throws(() => {
        DiffEngine.calculatePsnr(img1, img2);
    }, /boyutları uyuşmuyor/);
});
