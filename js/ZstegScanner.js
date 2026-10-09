/**
 * js/ZstegScanner.js
 * Faz 6: zsteg Tarzı Derin Çok Kanallı Steganaliz ve Sezgisel Tarayıcı (Stego-Workbench)
 * - 56 Kombinasyon: Kanallar (r, g, b, rgb, bgr, rgba, abgr) x Bit Derinliği (1b, 2b) x Bit Sırası (lsb, msb) x Piksel Sırası (xy, yx).
 * - Bilinen Dosya İmzaları: ZIP/JAR, PDF, PNG, JPEG, GIF, 7z, RAR, GZIP, BZIP2, BMP, StegoCrypt STG1/STG2/ZeroSig, ELF, MZ/PE.
 * - Metin ve CTF Sezgiselleri: flag{...}, ctf{...}, stego{...}, JSON ve basılabilir ASCII metin tespiti.
 * - İptal edilebilir ve Web Worker içinde yüksek performanslı çalışan arama mimarisi.
 */

// Bilinen dosya ve başlık imzaları
const SIGNATURES = [
    { name: 'ZIP / Office Arşivi (PK\x03\x04)', bytes: [0x50, 0x4B, 0x03, 0x04], ext: 'zip', confidence: 'high' },
    { name: 'ZIP Boş/Dizin Sonu (PK\x05\x06)', bytes: [0x50, 0x4B, 0x05, 0x06], ext: 'zip', confidence: 'high' },
    { name: 'PDF Belgesi (%PDF-)', bytes: [0x25, 0x50, 0x44, 0x46], ext: 'pdf', confidence: 'high' },
    { name: 'PNG Görseli (\x89PNG)', bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], ext: 'png', confidence: 'high' },
    { name: 'JPEG Görseli (\xFF\xD8\xFF)', bytes: [0xFF, 0xD8, 0xFF], ext: 'jpg', confidence: 'high' },
    { name: 'GIF87a Görseli', bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], ext: 'gif', confidence: 'high' },
    { name: 'GIF89a Görseli', bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], ext: 'gif', confidence: 'high' },
    { name: '7-Zip Arşivi (7z)', bytes: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C], ext: '7z', confidence: 'high' },
    { name: 'RAR Arşivi (Rar!)', bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07], ext: 'rar', confidence: 'high' },
    {
        name: 'GZIP Sıkıştırılmış Veri',
        bytes: [0x1F, 0x8B],
        ext: 'gz',
        confidence: 'high',
        validate: (b) => b.length >= 3 && b[2] === 0x08 // Deflate method
    },
    { name: 'BZIP2 Sıkıştırılmış Veri', bytes: [0x42, 0x5A, 0x68], ext: 'bz2', confidence: 'high' },
    { name: 'XZ Sıkıştırılmış Veri', bytes: [0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00], ext: 'xz', confidence: 'high' },
    {
        name: 'BMP Görseli (BM)',
        bytes: [0x42, 0x4D],
        ext: 'bmp',
        confidence: 'medium',
        validate: (b) => b.length >= 10 && b[6] === 0 && b[7] === 0 && b[8] === 0 && b[9] === 0
    },
    { name: 'StegoCrypt v1 (STG1)', bytes: [0x53, 0x54, 0x47, 0x31], ext: 'stg', confidence: 'high' },
    { name: 'StegoCrypt v1 (STG2)', bytes: [0x53, 0x54, 0x47, 0x32], ext: 'stg', confidence: 'high' },
    { name: 'StegoCrypt Legacy (STEG)', bytes: [0x53, 0x54, 0x45, 0x47], ext: 'stg', confidence: 'high' },
    { name: 'StegoCrypt ZeroSig (SG)', bytes: [0x53, 0x47], ext: 'sg', confidence: 'medium' },
    { name: 'Windows MZ Çalıştırılabilir', bytes: [0x4D, 0x5A], ext: 'exe', confidence: 'high' },
    { name: 'Linux ELF Çalıştırılabilir', bytes: [0x7F, 0x45, 0x4C, 0x46], ext: 'elf', confidence: 'high' }
];

// CTF ve gizli anahtar regex deseni
const FLAG_REGEX = /(?:flag|ctf|stego|key|secret|pass|token)\{[^}\n\r\t]{3,100}\}/i;

// 7 Renk Kanalı Yapılandırması
const CHANNEL_CONFIGS = [
    { name: 'r', offsets: [0] },
    { name: 'g', offsets: [1] },
    { name: 'b', offsets: [2] },
    { name: 'rgb', offsets: [0, 1, 2] },
    { name: 'bgr', offsets: [2, 1, 0] },
    { name: 'rgba', offsets: [0, 1, 2, 3] },
    { name: 'abgr', offsets: [3, 2, 1, 0] }
];

// Bit derinlikleri: 1-bit, 2-bit
const BIT_DEPTHS = [1, 2];

// Bit sıraları: lsb, msb
const BIT_ORDERS = ['lsb', 'msb'];

// Piksel yönleri: xy (satır öncelikli), yx (sütun öncelikli)
const PIXEL_ORDERS = ['xy', 'yx'];

export const ZstegScanner = {
    /**
     * Tüm 56 kombinasyon listesini döndürür.
     * @returns {Array<object>}
     */
    getCombinations() {
        const combos = [];
        for (const ch of CHANNEL_CONFIGS) {
            for (const bits of BIT_DEPTHS) {
                for (const bo of BIT_ORDERS) {
                    for (const po of PIXEL_ORDERS) {
                        combos.push({
                            id: `${ch.name},${bits}b,${bo},${po}`,
                            channel: ch.name,
                            channelOffsets: ch.offsets,
                            bitDepth: bits,
                            bitOrder: bo,
                            pixelOrder: po
                        });
                    }
                }
            }
        }
        return combos;
    },

    /**
     * Belirtilen kombinasyona göre görsel piksellerinden bayt dizisi çıkarır.
     * @param {ImageData|object} imageData
     * @param {Array<number>} channelOffsets
     * @param {number} bitDepth
     * @param {'lsb'|'msb'} bitOrder
     * @param {'xy'|'yx'} pixelOrder
     * @param {number} maxBytes
     * @returns {Uint8Array}
     */
    extractBytes(imageData, channelOffsets, bitDepth, bitOrder, pixelOrder, maxBytes = 2048) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const out = new Uint8Array(maxBytes);
        let outIdx = 0;

        let curByte = 0;
        let bitPos = 0;
        const mask = (1 << bitDepth) - 1;
        const numChannels = channelOffsets.length;

        if (pixelOrder === 'xy') {
            for (let y = 0; y < height; y++) {
                const rowOffset = y * width * 4;
                for (let x = 0; x < width; x++) {
                    const pxOffset = rowOffset + (x * 4);
                    for (let c = 0; c < numChannels; c++) {
                        const rawVal = data[pxOffset + channelOffsets[c]];
                        const bits = rawVal & mask;

                        if (bitOrder === 'lsb') {
                            curByte |= (bits << bitPos);
                        } else {
                            curByte = (curByte << bitDepth) | bits;
                        }
                        bitPos += bitDepth;

                        if (bitPos >= 8) {
                            out[outIdx++] = curByte & 0xFF;
                            if (outIdx >= maxBytes) return out;
                            curByte = 0;
                            bitPos = 0;
                        }
                    }
                }
            }
        } else {
            // 'yx' sütun öncelikli (vertical scan)
            for (let x = 0; x < width; x++) {
                for (let y = 0; y < height; y++) {
                    const pxOffset = (y * width + x) * 4;
                    for (let c = 0; c < numChannels; c++) {
                        const rawVal = data[pxOffset + channelOffsets[c]];
                        const bits = rawVal & mask;

                        if (bitOrder === 'lsb') {
                            curByte |= (bits << bitPos);
                        } else {
                            curByte = (curByte << bitDepth) | bits;
                        }
                        bitPos += bitDepth;

                        if (bitPos >= 8) {
                            out[outIdx++] = curByte & 0xFF;
                            if (outIdx >= maxBytes) return out;
                            curByte = 0;
                            bitPos = 0;
                        }
                    }
                }
            }
        }

        return out.subarray(0, outIdx);
    },

    /**
     * Bayt dizisinin hex görünümünü üretir.
     * @param {Uint8Array} data
     * @param {number} maxBytes
     * @returns {string}
     */
    toHexPreview(data, maxBytes = 24) {
        const count = Math.min(data.length, maxBytes);
        const hex = [];
        for (let i = 0; i < count; i++) {
            hex.push(data[i].toString(16).padStart(2, '0').toUpperCase());
        }
        return hex.join(' ') + (data.length > maxBytes ? ' ...' : '');
    },

    /**
     * Bayt dizisinde bilinen imza veya metin sezgisellerini inceler.
     * @param {Uint8Array} bytes
     * @returns {object|null}
     */
    inspectSample(bytes) {
        if (!bytes || bytes.length < 4) return null;

        // 1. Bilinen Dosya İmzaları
        for (const sig of SIGNATURES) {
            if (bytes.length >= sig.bytes.length) {
                let match = true;
                for (let i = 0; i < sig.bytes.length; i++) {
                    if (bytes[i] !== sig.bytes[i]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    if (sig.validate && !sig.validate(bytes)) {
                        continue;
                    }
                    return {
                        type: 'signature',
                        title: sig.name,
                        ext: sig.ext,
                        confidence: sig.confidence || 'high',
                        preview: this.toHexPreview(bytes, 20),
                        detail: `İmza Eşleşmesi (${sig.name})`
                    };
                }
            }
        }

        // 2. CTF Bayrak Kalıpları (flag{...}, ctf{...})
        const latinSample = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 512)));
        const flagMatch = latinSample.match(FLAG_REGEX);
        if (flagMatch) {
            return {
                type: 'flag',
                title: '🚩 CTF Bayrağı (Flag)',
                ext: 'txt',
                confidence: 'high',
                preview: flagMatch[0],
                detail: `Gizli Bayrak Kalıbı Tespit Edildi: "${flagMatch[0]}"`
            };
        }

        // 3. JSON Veri Sezgisi
        const trimmed = latinSample.trimStart();
        if ((trimmed.startsWith('{') && trimmed.includes('}')) || (trimmed.startsWith('[') && trimmed.includes(']'))) {
            try {
                // İlk 120 baytta en az bir key:value veya dizi elemanı var mı
                if (/["'][a-zA-Z0-9_-]+["']\s*:\s*/.test(trimmed)) {
                    return {
                        type: 'json',
                        title: '📋 JSON Verisi',
                        ext: 'json',
                        confidence: 'high',
                        preview: trimmed.slice(0, 48),
                        detail: 'Yapılandırılmış JSON Nesnesi'
                    };
                }
            } catch {
                // devam et
            }
        }

        // 4. Açık Metin (Printable ASCII / UTF-8) Sezgisi
        const checkLen = Math.min(bytes.length, 64);
        if (checkLen >= 16) {
            let printable = 0;
            for (let i = 0; i < checkLen; i++) {
                const b = bytes[i];
                // 0x20..0x7E veya newline/tab/cr
                if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
                    printable++;
                }
            }

            const ratio = printable / checkLen;
            // İlk 12 baytta null byte yoksa ve basılabilir oranı %85 üzerindeyse
            let nullInPrefix = false;
            for (let i = 0; i < Math.min(12, bytes.length); i++) {
                if (bytes[i] === 0) { nullInPrefix = true; break; }
            }

            if (ratio >= 0.85 && !nullInPrefix) {
                // Temiz metin satırı al
                const cleanText = latinSample.slice(0, Math.min(64, latinSample.length)).replace(/[\x00-\x1F\x7F-\x9F]/g, ' ').trim();
                if (cleanText.length >= 8) {
                    return {
                        type: 'text',
                        title: '📝 Açık Metin (Plaintext)',
                        ext: 'txt',
                        confidence: 'medium',
                        preview: `"${cleanText}"`,
                        detail: `Basılabilir Karakter Oranı: %${Math.round(ratio * 100)}`
                    };
                }
            }
        }

        return null;
    },

    /**
     * Görsel üzerinde tüm 56 kombinasyon için derin tarama çalıştırır.
     * @param {ImageData|object} imageData
     * @param {object} [options]
     * @param {number} [options.maxSampleBytes=2048]
     * @param {function} [options.onProgress]
     * @param {function} [options.isCancelled]
     * @returns {Array<object>}
     */
    scan(imageData, options = {}) {
        const maxSampleBytes = options.maxSampleBytes || 2048;
        const onProgress = options.onProgress || null;
        const isCancelled = options.isCancelled || (() => false);

        const combos = this.getCombinations();
        const total = combos.length;
        const findings = [];

        for (let i = 0; i < total; i++) {
            if (isCancelled()) {
                break;
            }

            const combo = combos[i];
            const bytes = this.extractBytes(
                imageData,
                combo.channelOffsets,
                combo.bitDepth,
                combo.bitOrder,
                combo.pixelOrder,
                maxSampleBytes
            );

            const match = this.inspectSample(bytes);
            if (match) {
                findings.push({
                    comboId: combo.id,
                    channel: combo.channel,
                    bitDepth: combo.bitDepth,
                    bitOrder: combo.bitOrder,
                    pixelOrder: combo.pixelOrder,
                    type: match.type,
                    title: match.title,
                    ext: match.ext,
                    confidence: match.confidence,
                    preview: match.preview,
                    detail: match.detail,
                    sampleBytes: bytes
                });
            }

            if (onProgress && (i % 4 === 0 || i === total - 1)) {
                const pct = Math.round(((i + 1) / total) * 100);
                onProgress(pct, combo.id, findings.length);
            }
        }

        return findings;
    },

    /**
     * Seçilen bir kombinasyonun tüm veya belirtilen boyuttaki ham verisini çıkarır (Export için).
     * @param {ImageData|object} imageData
     * @param {string} comboId - Örn: "rgb,1b,lsb,xy"
     * @param {number} [maxBytes=1048576]
     * @returns {Uint8Array}
     */
    extractPayload(imageData, comboId, maxBytes = 1048576) {
        const parts = comboId.split(',');
        if (parts.length < 4) throw new Error("Geçersiz kombinasyon kimliği: " + comboId);

        const chName = parts[0];
        const bitDepth = parseInt(parts[1], 10);
        const bitOrder = parts[2];
        const pixelOrder = parts[3];

        const chConfig = CHANNEL_CONFIGS.find(c => c.name === chName);
        if (!chConfig) throw new Error("Bilinmeyen kanal: " + chName);

        return this.extractBytes(
            imageData,
            chConfig.offsets,
            bitDepth,
            bitOrder,
            pixelOrder,
            maxBytes
        );
    }
};
