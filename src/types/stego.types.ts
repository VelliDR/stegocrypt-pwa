/**
 * src/types/stego.types.ts
 * Steganografi, doku kafesi ve taşıyıcı güvenliği tip tanımları.
 */

export type LsbMode = 1 | 2;
export type EmbedMethod = 'matching' | 'replacement';
export type DistributionMode = 'adaptive' | 'scattered' | 'sequential';
export type Partition = 'all' | 'even' | 'odd';

export interface StegoRiskReport {
    level: 'low' | 'medium' | 'high';
    label: string;
    badgeColor: string;
    usagePercent: number;
    isTextureOverflow: boolean;
    safeTextureBytes: number;
    totalPayloadBytes: number;
    message: string;
}

export interface ScatterParams {
    c0: number;
    step: number;
    nPartition: number;
}

export interface CarrierSafetyReport {
    isLossy: boolean;
    isSocialMedia: boolean;
    format: string;
    warning: string | null;
    recommendation: string | null;
}

export interface SimpleImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
}
