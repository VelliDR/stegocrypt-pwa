import test from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/mockImageData.js';
import { StegoWorkerClient } from '../../js/StegoWorkerClient.js';
import { PngCodec } from '../../js/png/PngCodec.js';

test('StegoWorkerClient - Format v3 encrypt and decryptAuto roundtrip via client', async () => {
    // 64x64 RGBA dummy carrier
    const width = 64;
    const height = 64;
    const pixelBuffer = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixelBuffer.length; i += 4) {
        pixelBuffer[i] = (i * 3) & 0xFF;
        pixelBuffer[i + 1] = (i * 7) & 0xFF;
        pixelBuffer[i + 2] = (i * 11) & 0xFF;
        pixelBuffer[i + 3] = 255;
    }

    const secretPayload = new TextEncoder().encode("Worker Client E2E Gizli Veri Testi 2026");
    const rawBuffer = new Uint8Array(1 + secretPayload.length);
    rawBuffer[0] = 0x10; // Compressed text tag
    rawBuffer.set(secretPayload, 1);

    const password = "WorkerSuperPassword2026!";

    // 1. Encrypt via client
    const encResult = await StegoWorkerClient.encryptV3({
        pixelBuffer: pixelBuffer.buffer,
        width,
        height,
        rawBuffer,
        pass: password,
        lsbMode: 1,
        isDeniable: false
    });

    assert.ok(encResult.pngBytes, "PNG byte tamponu üretilmeli");
    assert.ok(encResult.pngBytes.byteLength > 0, "PNG byte tamponu boş olmamalı");

    // 2. Decode PNG bytes via PngCodec to verify it is valid PNG
    const decodedPng = await StegoWorkerClient.decodePng(encResult.pngBytes);
    assert.equal(decodedPng.width, width);
    assert.equal(decodedPng.height, height);

    // 3. Decrypt via client extractAuto
    const decryptedBytes = await StegoWorkerClient.decryptAuto({
        pixelBuffer: decodedPng.data.buffer,
        width: decodedPng.width,
        height: decodedPng.height,
        password
    });

    assert.equal(decryptedBytes[0], 0x10);
    const decryptedText = new TextDecoder().decode(decryptedBytes.subarray(1));
    assert.equal(decryptedText, "Worker Client E2E Gizli Veri Testi 2026");
});

test('StegoWorkerClient - Deniable dual-layer roundtrip via client', async () => {
    const width = 64;
    const height = 64;
    const pixelBuffer = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixelBuffer.length; i += 4) {
        pixelBuffer[i] = (i * 5) & 0xFF;
        pixelBuffer[i + 1] = (i * 9) & 0xFF;
        pixelBuffer[i + 2] = (i * 13) & 0xFF;
        pixelBuffer[i + 3] = 255;
    }

    const decoyPayload = new TextEncoder().encode("Tuzak: Sıradan yemek tarifi");
    const rawDecoy = new Uint8Array(1 + decoyPayload.length);
    rawDecoy[0] = 0x10;
    rawDecoy.set(decoyPayload, 1);

    const realPayload = new TextEncoder().encode("Gerçek: Gizli kasa şifresi #42");
    const rawReal = new Uint8Array(1 + realPayload.length);
    rawReal[0] = 0x10;
    rawReal.set(realPayload, 1);

    const passDecoy = "TuzakSifre123";
    const passReal = "GercekSifre999";

    const encResult = await StegoWorkerClient.encryptV3({
        pixelBuffer: pixelBuffer.buffer,
        width,
        height,
        rawBuffer: rawReal,
        pass: passReal,
        lsbMode: 1,
        isDeniable: true,
        rawDecoy,
        passDecoy
    });

    const decodedPng = await StegoWorkerClient.decodePng(encResult.pngBytes);

    // Decoy decryption
    const decDecoy = await StegoWorkerClient.decryptAuto({
        pixelBuffer: decodedPng.data.buffer,
        width: decodedPng.width,
        height: decodedPng.height,
        password: passDecoy
    });
    assert.equal(new TextDecoder().decode(decDecoy.subarray(1)), "Tuzak: Sıradan yemek tarifi");

    // Real decryption
    const decReal = await StegoWorkerClient.decryptAuto({
        pixelBuffer: decodedPng.data.buffer,
        width: decodedPng.width,
        height: decodedPng.height,
        password: passReal
    });
    assert.equal(new TextDecoder().decode(decReal.subarray(1)), "Gerçek: Gizli kasa şifresi #42");
});

test('StegoWorkerClient - Steganalysis and Bit Plane extraction via client', async () => {
    const width = 32;
    const height = 32;
    const pixelBuffer = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixelBuffer.length; i += 4) {
        pixelBuffer[i] = (i * 3) & 0xFF;
        pixelBuffer[i + 1] = (i * 7) & 0xFF;
        pixelBuffer[i + 2] = (i * 11) & 0xFF;
        pixelBuffer[i + 3] = 255;
    }

    const chiSquareResult = await StegoWorkerClient.analyzeChiSquare({
        pixelBuffer: pixelBuffer.buffer,
        width,
        height
    });
    assert.ok(typeof chiSquareResult.probability === 'number');
    assert.ok(chiSquareResult.verdict);

    const bitPlane = await StegoWorkerClient.renderBitPlane({
        pixelBuffer: pixelBuffer.buffer,
        width,
        height,
        channel: 'all',
        bitDepth: 1
    });
    assert.equal(bitPlane.width, width);
    assert.equal(bitPlane.height, height);
    assert.equal(bitPlane.data.length, width * height * 4);
});

test('StegoWorkerClient - inspectBinary, compareImages, and analyzeText via client', async () => {
    // 1. inspectBinary via client
    const width = 16;
    const height = 16;
    const pixelBuffer = new Uint8ClampedArray(width * height * 4).fill(128);
    const pngBytes = await PngCodec.encode({ width, height, data: pixelBuffer });

    const binaryReport = await StegoWorkerClient.inspectBinary({ fileBuffer: pngBytes.buffer });
    assert.equal(binaryReport.format, 'png');
    assert.equal(binaryReport.verdictLevel, 'clean');
    assert.ok(binaryReport.chunks.length >= 3);

    // 2. compareImages via client
    const pixelBuffer2 = new Uint8ClampedArray(pixelBuffer);
    pixelBuffer2[0] = 130; // slight difference
    const compResult = await StegoWorkerClient.compareImages({
        pixelBuffer1: pixelBuffer.buffer,
        pixelBuffer2: pixelBuffer2.buffer,
        width,
        height,
        amplifier: 20
    });
    assert.equal(compResult.comparison.changedPixels, 1);
    assert.ok(compResult.ampDiffData.length > 0);
    assert.ok(compResult.lsbDiffData.length > 0);

    // 3. analyzeText via client
    const textAnalysis = await StegoWorkerClient.analyzeText({ text: "Test\u200BText" });
    assert.equal(textAnalysis.totalInvisible, 1);
    assert.equal(textAnalysis.hasZeroWidth, true);
    assert.equal(textAnalysis.cleanedText, "TestText");
});

test('StegoWorkerClient - scanZsteg and extractZstegPayload via client', async () => {
    const width = 32;
    const height = 32;
    const pixelBuffer = new Uint8ClampedArray(width * height * 4).fill(128);

    // Embed flag{worker_test_123} into r,1b,lsb,xy
    const flagStr = "flag{worker_test_123}\n";
    const flagBytes = new TextEncoder().encode(flagStr);
    for (let i = 0; i < flagBytes.length; i++) {
        const b = flagBytes[i];
        for (let bit = 0; bit < 8; bit++) {
            const bitVal = (b >> bit) & 1;
            const pxIdx = i * 8 + bit;
            pixelBuffer[pxIdx * 4] = (pixelBuffer[pxIdx * 4] & 0xFE) | bitVal;
        }
    }

    let progressCalled = false;
    const findings = await StegoWorkerClient.scanZsteg({
        pixelBuffer: pixelBuffer.buffer,
        width,
        height,
        onProgress: () => { progressCalled = true; }
    });

    assert.ok(Array.isArray(findings));
    assert.ok(findings.length > 0);
    const flagFinding = findings.find(f => f.type === 'flag' && f.comboId === 'r,1b,lsb,xy');
    assert.ok(flagFinding, "r,1b,lsb,xy kombinasyonunda bayrak tespit edilmeli");
    assert.equal(flagFinding.preview, "flag{worker_test_123}");
    assert.ok(progressCalled);

    // Payload extraction via client
    const extracted = await StegoWorkerClient.extractZstegPayload({
        pixelBuffer: pixelBuffer.buffer,
        width,
        height,
        comboId: 'r,1b,lsb,xy',
        maxBytes: 64
    });
    assert.ok(extracted instanceof Uint8Array);
    const text = new TextDecoder().decode(extracted);
    assert.ok(text.startsWith("flag{worker_test_123}"));
});
