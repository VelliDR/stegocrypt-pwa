import test from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/mockImageData.js';
import { createMockImageData } from '../helpers/mockImageData.js';
import { StegoEngine } from '../../js/StegoEngine.js';
import { SteganalysisEngine } from '../../js/SteganalysisEngine.js';
import { CryptoEngine } from '../../js/CryptoEngine.js';

test('StegoEngine - matchLsb1 unit logic and boundary clamping', () => {
    // 1. Identical bit -> no change
    assert.strictEqual(StegoEngine.matchLsb1(10, 0), 10);
    assert.strictEqual(StegoEngine.matchLsb1(11, 1), 11);

    // 2. Mismatched bit -> shifts by ±1
    const res10_1a = StegoEngine.matchLsb1(10, 1, 0); // randChoice < 0.5 -> -1
    const res10_1b = StegoEngine.matchLsb1(10, 1, 1); // randChoice >= 0.5 -> +1
    assert.strictEqual(res10_1a, 9);
    assert.strictEqual(res10_1b, 11);
    assert.strictEqual(res10_1a % 2, 1);
    assert.strictEqual(res10_1b % 2, 1);

    // 3. Boundary 0 -> must become +1 (never negative)
    assert.strictEqual(StegoEngine.matchLsb1(0, 1, 0), 1);
    assert.strictEqual(StegoEngine.matchLsb1(0, 1, 1), 1);

    // 4. Boundary 255 -> must become 254 (never > 255)
    assert.strictEqual(StegoEngine.matchLsb1(255, 0, 0), 254);
    assert.strictEqual(StegoEngine.matchLsb1(255, 0, 1), 254);
});

test('StegoEngine - matchLsb2 unit logic and boundary clamping', () => {
    // 1. Identical bits -> no change
    assert.strictEqual(StegoEngine.matchLsb2(10, 2), 10); // 10 % 4 = 2
    assert.strictEqual(StegoEngine.matchLsb2(15, 3), 15); // 15 % 4 = 3

    // 2. Mismatched bits -> target mod 4 matches with minimal delta
    for (let val = 0; val < 256; val++) {
        for (let target = 0; target < 4; target++) {
            const matched = StegoEngine.matchLsb2(val, target, 0.5);
            assert.ok(matched >= 0 && matched <= 255, `Value ${matched} must be within [0, 255]`);
            assert.strictEqual(matched % 4, target, `Result ${matched} % 4 must equal target ${target}`);
            assert.ok(Math.abs(matched - val) <= 3, `Delta |${matched} - ${val}| must be <= 3`);
        }
    }
});

test('StegoEngine - Format v3 matching vs replacement roundtrip', async () => {
    const width = 80;
    const height = 80;
    const imgMatching = createMockImageData(width, height);
    const imgReplacement = createMockImageData(width, height);

    // Natural gradient background
    for (let i = 0; i < imgMatching.data.length; i += 4) {
        const val = (Math.floor(i / 4) * 3) % 256;
        imgMatching.data[i] = val;
        imgMatching.data[i + 1] = (val + 10) % 256;
        imgMatching.data[i + 2] = (val + 20) % 256;
        imgMatching.data[i + 3] = 255;

        imgReplacement.data[i] = val;
        imgReplacement.data[i + 1] = (val + 10) % 256;
        imgReplacement.data[i + 2] = (val + 20) % 256;
        imgReplacement.data[i + 3] = 255;
    }

    const secretText = 'LSB Matching vs LSB Replacement Bit-Exact Decodability Test.';
    const plainBytes = new TextEncoder().encode(secretText);
    const password = 'BenchmarkPassword#2026';
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const masterKey = await CryptoEngine.deriveMasterKeyV3(password, salt, 2000);
    const { scatterBits, metaKey, bodyKey } = await CryptoEngine.deriveSubkeysV3(masterKey, 'v3/all');
    const { header48, cipherBody } = await CryptoEngine.encryptV3(plainBytes, metaKey, bodyKey, 1);

    // Embed imgMatching with method 'matching'
    StegoEngine.embedV3(imgMatching, header48, cipherBody, 1, scatterBits, salt, 'all', 'matching');

    // Embed imgReplacement with method 'replacement'
    StegoEngine.embedV3(imgReplacement, header48, cipherBody, 1, scatterBits, salt, 'all', 'replacement');

    // Both must extract identically using standard bit reader
    const extractedMatching = await StegoEngine.extractV3(imgMatching, masterKey, 'all');
    const extractedReplacement = await StegoEngine.extractV3(imgReplacement, masterKey, 'all');

    assert.strictEqual(new TextDecoder().decode(extractedMatching), secretText);
    assert.strictEqual(new TextDecoder().decode(extractedReplacement), secretText);
});

test('SteganalysisEngine - RS Analysis distinguishes natural, replacement, and matching', () => {
    const width = 120;
    const height = 120;
    const imgNatural = createMockImageData(width, height);
    const imgReplacement = createMockImageData(width, height);
    const imgMatching = createMockImageData(width, height);

    // Natural smooth photographic-like gradient
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const v = Math.round(128 + 60 * Math.sin(x / 10) + 40 * Math.cos(y / 10));
            imgNatural.data[idx] = v;
            imgNatural.data[idx + 1] = (v + 5) % 256;
            imgNatural.data[idx + 2] = (v + 15) % 256;
            imgNatural.data[idx + 3] = 255;

            imgReplacement.data[idx] = v;
            imgReplacement.data[idx + 1] = (v + 5) % 256;
            imgReplacement.data[idx + 2] = (v + 15) % 256;
            imgReplacement.data[idx + 3] = 255;

            imgMatching.data[idx] = v;
            imgMatching.data[idx + 1] = (v + 5) % 256;
            imgMatching.data[idx + 2] = (v + 15) % 256;
            imgMatching.data[idx + 3] = 255;
        }
    }

    // 1. Natural image RS analysis
    const rsNatural = SteganalysisEngine.analyzeRS(imgNatural);
    assert.ok(rsNatural.estimatedPayloadPercent < 5, `Natural image RS should be < 5%, got ${rsNatural.estimatedPayloadPercent}%`);

    // 2. Full 100% LSB Replacement embedding (overwrite LSBs with pseudo-random bits)
    const randBits = new Uint8Array(imgReplacement.data.length);
    crypto.getRandomValues(randBits);
    for (let i = 0; i < imgReplacement.data.length; i++) {
        if ((i + 1) % 4 === 0) continue;
        const targetBit = randBits[i] & 1;
        imgReplacement.data[i] = (imgReplacement.data[i] & 0xFE) | targetBit;
    }

    const rsReplacement = SteganalysisEngine.analyzeRS(imgReplacement);
    assert.ok(rsReplacement.estimatedPayloadPercent >= 70, `Full LSB replacement RS should be >= 70%, got ${rsReplacement.estimatedPayloadPercent}%`);

    // 3. Full 100% LSB Matching embedding (shift ±1 symmetrically)
    for (let i = 0; i < imgMatching.data.length; i++) {
        if ((i + 1) % 4 === 0) continue;
        const targetBit = randBits[i] & 1;
        imgMatching.data[i] = StegoEngine.matchLsb1(imgMatching.data[i], targetBit, (randBits[(i + 1) % randBits.length] % 100) / 100);
    }

    const rsMatching = SteganalysisEngine.analyzeRS(imgMatching);
    // Crucial mathematical proof of LSB Matching: RS asymmetry c ≈ 0, so estimatedPayloadPercent is near 0%!
    assert.ok(rsMatching.estimatedPayloadPercent < 10, `LSB Matching RS should be < 10% (immune to RS), got ${rsMatching.estimatedPayloadPercent}%`);
});

test('SteganalysisEngine - renderHeatmap creates valid RGBA heatmap overlay', () => {
    const width = 64;
    const height = 64;
    const img = createMockImageData(width, height);

    for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = 120;
        img.data[i + 1] = 130;
        img.data[i + 2] = 140;
        img.data[i + 3] = 255;
    }

    const heatmap = SteganalysisEngine.renderHeatmap(img, 32);
    assert.strictEqual(heatmap.width, width);
    assert.strictEqual(heatmap.height, height);
    assert.strictEqual(heatmap.data.length, width * height * 4);

    // Alpha of heatmap pixels should be 30 for clean/green blocks
    assert.strictEqual(heatmap.data[3], 30);
});
