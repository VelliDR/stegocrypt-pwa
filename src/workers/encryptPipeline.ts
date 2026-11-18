/**
 * src/workers/encryptPipeline.ts
 * Web Worker ve Fallback yürütücüleri arasında paylaşılan şifreleme ve gömme boru hattı.
 */

import { CryptoEngine } from '../crypto/CryptoEngine.ts';
import { KeyDerivation } from '../crypto/KeyDerivation.ts';
import { StegoEngine } from '../stego/StegoEngine.ts';
import { AdaptiveEngine } from '../stego/AdaptiveEngine.ts';
import { PngCodec } from '../codec/PngCodec.ts';
import type {
    CipherAlgorithm,
    DistributionMode,
    EmbedMethod,
    LsbMode,
    Partition,
    SimpleImageData
} from '../types/index.ts';

export interface EncryptPipelineInput {
    pixelBuffer: ArrayBuffer;
    width: number;
    height: number;
    rawBuffer: ArrayBuffer;
    pass: string;
    lsbMode: LsbMode;
    method?: EmbedMethod;
    distribution?: DistributionMode;
    kdfType?: 'pbkdf2' | 'argon2id';
    cipherAlgorithm?: CipherAlgorithm;
    isDeniable?: boolean;
    rawDecoy?: ArrayBuffer | null;
    passDecoy?: string | null;
}

export interface EncryptPipelineOutput {
    pngBytes: ArrayBuffer;
    pixelBuffer: ArrayBuffer;
    width: number;
    height: number;
}

async function encryptAndEmbedLayer(params: {
    imageData: SimpleImageData;
    plainBytes: Uint8Array;
    pass: string;
    salt: Uint8Array;
    writeSalt: boolean;
    partition: Partition;
    lsbMode: LsbMode;
    method: EmbedMethod;
    distribution: 'adaptive' | 'scattered';
    kdfType: 'pbkdf2' | 'argon2id';
    cipherAlgorithm: CipherAlgorithm;
}): Promise<void> {
    const {
        imageData, plainBytes, pass, salt, writeSalt,
        partition, lsbMode, method, distribution, kdfType, cipherAlgorithm
    } = params;

    const kdfId = kdfType === 'argon2id' ? 0x02 : 0x01;
    const masterKey = kdfType === 'argon2id'
        ? await KeyDerivation.deriveMasterKeyArgon2id(pass, salt)
        : await KeyDerivation.deriveMasterKeyV3(pass, salt, 600000);

    const label = `v3/${partition}` as const;
    const subkeys = await KeyDerivation.deriveSubkeysV3(masterKey, label);

    let chachaKey: Uint8Array | null = null;
    try {
        const bodyKey = cipherAlgorithm === 'chacha20-poly1305'
            ? (chachaKey = await KeyDerivation.deriveChaChaBodyKeyV3(masterKey, label))
            : subkeys.bodyKey;

        const enc = await CryptoEngine.encryptV3(
            plainBytes,
            subkeys.metaKey as CryptoKey,
            bodyKey,
            lsbMode,
            kdfId,
            cipherAlgorithm
        );

        const saltToEmbed = writeSalt ? salt : null;
        if (distribution === 'adaptive') {
            AdaptiveEngine.embedAdaptive(
                imageData, enc.header48, enc.cipherBody, lsbMode,
                subkeys.scatterBits, saltToEmbed, partition, method
            );
        } else {
            StegoEngine.embedV3(
                imageData, enc.header48, enc.cipherBody, lsbMode,
                subkeys.scatterBits, saltToEmbed, partition, method
            );
        }
    } finally {
        if (chachaKey) chachaKey.fill(0);
    }
}

export async function runEncryptPipeline(
    data: EncryptPipelineInput,
    onProgress?: (percent: number, text: string) => void
): Promise<EncryptPipelineOutput> {
    const { pixelBuffer, width, height, rawBuffer, pass, lsbMode, isDeniable, rawDecoy, passDecoy } = data;
    const method: EmbedMethod = data.method || 'matching';
    const distribution: DistributionMode = data.distribution || 'adaptive';
    const kdfType: 'pbkdf2' | 'argon2id' = data.kdfType === 'argon2id' ? 'argon2id' : 'pbkdf2';
    const cipherAlgorithm: CipherAlgorithm = data.cipherAlgorithm === 'chacha20-poly1305'
        ? 'chacha20-poly1305'
        : 'aes-256-gcm';

    const imageData: SimpleImageData = {
        width,
        height,
        data: new Uint8ClampedArray(pixelBuffer)
    };

    if (distribution === 'sequential') {
        if (isDeniable) {
            throw new Error("Sıralı (Format v1) modda İnkâr Edilebilir Çift Katman desteklenmez. Lütfen İçerik Duyarlı veya Homojen Dağınık mod seçin.");
        }
        onProgress?.(30, "Format v1 paketi şifreleniyor (PBKDF2 100k + AES-256-GCM)...");
        const payload = await CryptoEngine.encryptBuffer(new Uint8Array(rawBuffer), pass, lsbMode);
        onProgress?.(70, `Piksellere sıralı gömülüyor (Format v1, ${method})...`);
        StegoEngine.embedSequential(imageData, payload, lsbMode, method);
    } else {
        const sharedSalt = crypto.getRandomValues(new Uint8Array(16));
        const kdfName = kdfType === 'argon2id' ? 'Argon2id SIMD Wasm 64MB' : '600.000 PBKDF2';
        const cipherName = cipherAlgorithm === 'chacha20-poly1305' ? 'ChaCha20-Poly1305' : 'AES-256-GCM';

        if (isDeniable && rawDecoy && passDecoy) {
            if (pass === passDecoy) {
                throw new Error("Tuzak parola ile gerçek parola aynı olamaz.");
            }
            onProgress?.(15, `1/4: Tuzak katman anahtarı türetiliyor (${kdfName})...`);
            await encryptAndEmbedLayer({
                imageData,
                plainBytes: new Uint8Array(rawDecoy),
                pass: passDecoy,
                salt: sharedSalt,
                writeSalt: true,
                partition: 'even',
                lsbMode,
                method,
                distribution,
                kdfType,
                cipherAlgorithm
            });

            onProgress?.(55, `3/4: Gerçek katman şifreleniyor (${cipherName}, ${method})...`);
            await encryptAndEmbedLayer({
                imageData,
                plainBytes: new Uint8Array(rawBuffer),
                pass,
                salt: sharedSalt,
                writeSalt: false,
                partition: 'odd',
                lsbMode,
                method,
                distribution,
                kdfType,
                cipherAlgorithm
            });
        } else {
            onProgress?.(25, `1/3: Anahtar türetiliyor (${kdfName})...`);
            onProgress?.(50, `2/3: Veri şifreleniyor (${cipherName})...`);
            await encryptAndEmbedLayer({
                imageData,
                plainBytes: new Uint8Array(rawBuffer),
                pass,
                salt: sharedSalt,
                writeSalt: true,
                partition: 'all',
                lsbMode,
                method,
                distribution,
                kdfType,
                cipherAlgorithm
            });
        }
    }

    onProgress?.(90, "PNG kodlanıyor (saf deterministik codec)...");
    const pngBytes = await PngCodec.encode({ width, height, data: imageData.data });

    onProgress?.(100, "Tamamlandı!");
    return {
        pngBytes: pngBytes.buffer as ArrayBuffer,
        pixelBuffer: imageData.data.buffer as ArrayBuffer,
        width,
        height
    };
}
