import test from 'node:test';
import assert from 'node:assert/strict';
import { BinaryInspector } from '../../js/BinaryInspector.js';
import { PngCodec } from '../../js/png/PngCodec.js';

test('BinaryInspector - detectFileType correctly identifies file formats', () => {
    // 1. PNG magic
    const pngMagic = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0]);
    assert.equal(BinaryInspector.detectFileType(pngMagic), 'png');

    // 2. JPEG magic
    const jpegMagic = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0]);
    assert.equal(BinaryInspector.detectFileType(jpegMagic), 'jpeg');

    // 3. WebP magic
    const webpMagic = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    assert.equal(BinaryInspector.detectFileType(webpMagic), 'webp');

    // 4. Unknown
    const randomBytes = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
    assert.equal(BinaryInspector.detectFileType(randomBytes), 'unknown');
});

test('BinaryInspector - inspectPng extracts chunks, IHDR, and validates clean PNG', async () => {
    const width = 16;
    const height = 16;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 100;
        data[i + 1] = 150;
        data[i + 2] = 200;
        data[i + 3] = 255;
    }

    const pngBytes = await PngCodec.encode({ width, height, data });
    const report = BinaryInspector.inspectPng(pngBytes);

    assert.equal(report.format, 'png');
    assert.equal(report.verdictLevel, 'clean');
    assert.equal(report.trailingData, null);
    assert.ok(report.chunks.length >= 3, "En az IHDR, IDAT, IEND chunk'ları olmalı");

    // IHDR kontrolü
    assert.ok(report.ihdrInfo);
    assert.equal(report.ihdrInfo.width, width);
    assert.equal(report.ihdrInfo.height, height);
    assert.equal(report.ihdrInfo.bitDepth, 8);
    assert.equal(report.ihdrInfo.colorTypeName, 'RGBA');

    // Tüm chunk'ların CRC'sinin geçerli olduğunu doğrula
    for (const chunk of report.chunks) {
        assert.equal(chunk.crcValid, true, `Chunk ${chunk.type} CRC geçerli olmalı`);
    }
});

test('BinaryInspector - Detects trailing data after IEND (Overlay Injection) and identifies ZIP signature', async () => {
    const width = 8;
    const height = 8;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    const validPngBytes = await PngCodec.encode({ width, height, data });

    // Sentetik ZIP Arşivi ek verisi oluştur (PK\x03\x04 + dummy dosya)
    const zipPayload = new Uint8Array([
        0x50, 0x4B, 0x03, 0x04, // ZIP Local File Header magic
        0x14, 0x00, 0x00, 0x00,
        0x08, 0x00, 0x00, 0x00,
        0x54, 0x65, 0x73, 0x74 // 'Test'
    ]);

    // PNG dosyasının sonuna ZIP ekle (Klasik Steganografik Dosya Birleştirme)
    const injectedBytes = new Uint8Array(validPngBytes.length + zipPayload.length);
    injectedBytes.set(validPngBytes, 0);
    injectedBytes.set(zipPayload, validPngBytes.length);

    const report = BinaryInspector.inspectPng(injectedBytes);

    assert.equal(report.verdictLevel, 'alert');
    assert.match(report.verdict, /Overlay Injection|Gizli Veri/);
    assert.ok(report.trailingData, "IEND sonrası ek veri raporlanmalı");
    assert.equal(report.trailingData.length, zipPayload.length);
    assert.equal(report.trailingData.identifiedSignature, 'ZIP Arşivi (Local File Header)');
    assert.equal(report.trailingData.possibleExtension, 'zip');
});

test('BinaryInspector - Detects corrupted chunk CRC in tampered PNG', async () => {
    const width = 8;
    const height = 8;
    const data = new Uint8ClampedArray(width * height * 4).fill(128);
    const pngBytes = await PngCodec.encode({ width, height, data });

    // IDAT verisi içindeki bir baytı bozarak CRC hatası oluştur
    const tamperedBytes = new Uint8Array(pngBytes);
    // IHDR (33 bayt) sonrasındaki IDAT chunk verisini (ofset 41..55) boz
    tamperedBytes[42] ^= 0xFF;

    const report = BinaryInspector.inspectPng(tamperedBytes);
    assert.equal(report.verdictLevel, 'warning');
    assert.match(report.verdict, /CRC Hatası/);

    const idatChunk = report.chunks.find(c => c.type === 'IDAT');
    assert.ok(idatChunk);
    assert.equal(idatChunk.crcValid, false);
});

test('BinaryInspector - Inspects JPEG markers and detects EXIF / comments', () => {
    // Minimal yapay JPEG stream: SOI + APP1 (EXIF) + SOF0 (8x8) + SOS + EOI
    const jpegBytes = new Uint8Array([
        0xFF, 0xD8, // SOI
        0xFF, 0xE1, 0x00, 0x0A, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x01, 0x02, // APP1 Exif
        0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x10, 0x00, 0x20, 0x03, 0x01, 0x11, 0x00, // SOF0 (16x32)
        0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, // SOS
        0x12, 0x34, // entropy data
        0xFF, 0xD9  // EOI
    ]);

    const report = BinaryInspector.inspectJpeg(jpegBytes);
    assert.equal(report.format, 'jpeg');
    assert.equal(report.hasExif, true);
    assert.equal(report.dimensions.width, 32);
    assert.equal(report.dimensions.height, 16);
    assert.equal(report.trailingData, null);
    assert.equal(report.verdictLevel, 'clean');
});
