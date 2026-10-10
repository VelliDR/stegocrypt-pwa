/**
 * src/types/forensics.types.ts
 * Adli bilişim, steganaliz, diff ve ikili triyaj tip tanımları.
 */

export interface ChiSquareAnalysis {
    chiSquare: number;
    pValue: number;
    probability: number;
    isStego: boolean;
    degreesOfFreedom: number;
    verdict: string;
}

export interface RSAnalysisResult {
    Rm: number;
    R_m: number;
    Sm: number;
    S_m: number;
    diffR: number;
    diffS: number;
    estimatedRatio: number;
    estimatedPayloadPercent?: number;
    verdict: string;
    verdictLevel: 'clean' | 'suspicious' | 'stego';
    channel: string;
    details?: string;
}

export interface DiffComparison {
    mse: number;
    psnr: number;
    ssim: number;
    maxDiff: number;
    changedPixels: number;
    changedPercent: number;
}

export interface PngChunkInfo {
    index: number;
    type: string;
    length: number;
    offset: number;
    crcValid: boolean;
    isCritical: boolean;
    description: string;
}

export interface TrailingDataReport {
    offset: number;
    length: number;
    hexPreview: string;
    identifiedSignature: string;
    possibleExtension: string;
    bytes: Uint8Array;
}

export interface BinaryInspectionReport {
    format: 'png' | 'jpeg' | 'webp' | 'gif' | 'unknown';
    fileSize: number;
    chunks?: PngChunkInfo[] | undefined;
    chunkCount?: number | undefined;
    ihdrInfo?: {
        width: number;
        height: number;
        bitDepth: number;
        colorType: number;
        colorTypeName: string;
    } | undefined;
    textEntries?: { keyword: string; text: string }[] | undefined;
    trailingData: TrailingDataReport | null;
    verdict: string;
    verdictLevel: 'clean' | 'alert';
    verdictDetails: string;
}

export interface ZstegFinding {
    comboId: string;
    offset: number;
    signatureName: string;
    textSample: string;
    confidence: 'high' | 'medium' | 'low';
}

export interface ZeroWidthReport {
    hasZeroWidth: boolean;
    count: number;
    types: string[];
    cleanedText: string;
    smuggledText?: string | undefined;
    hasBidiTrojan: boolean;
    hasVariationSelectors?: boolean;
    hasWhitespaceStego?: boolean;
    categories?: {
        zeroWidth: number;
        variationSelectors: number;
        invisibleFillers: number;
        invisibleMathOrFormat: number;
        bidiControls: number;
        tagPlane14: number;
        trailingWhitespace: number;
    };
}

