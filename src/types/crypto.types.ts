/**
 * src/types/crypto.types.ts
 * Kriptografik tip tanımları: AES-256-GCM, ChaCha20-Poly1305, PBKDF2 ve Argon2id.
 */

export type CipherAlgorithm = 'aes-256-gcm' | 'chacha20-poly1305';
export type KdfAlgorithm = 'pbkdf2-sha256' | 'argon2id';

export interface KdfParams {
    algorithm: KdfAlgorithm;
    salt: Uint8Array;
    iterations?: number;      // PBKDF2 için varsayılan: 600.000
    memorySizeKB?: number;    // Argon2id için varsayılan: 64MB (65536 KB)
    parallelism?: number;     // Argon2id için varsayılan: 1
}

export interface EncryptedPackageV3 {
    header48: Uint8Array;
    cipherBody: Uint8Array;
}

export interface SubkeysV3 {
    scatterBits: ArrayBuffer;
    metaKey: CryptoKey | Uint8Array;
    bodyKey: CryptoKey | Uint8Array;
}

export interface ZeroSigHeaderResult {
    key: CryptoKey | Uint8Array;
    ivBody: Uint8Array;
    lsbMode: number;
    cipherLen: number;
}
