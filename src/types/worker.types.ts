/**
 * src/types/worker.types.ts
 * Web Worker iletişim protokolu ve mesaj tipleri.
 */

export type WorkerAction =
    | 'ENCRYPT_V3'
    | 'DECRYPT_AUTO'
    | 'ANALYZE_CHI_SQUARE'
    | 'RENDER_BIT_PLANE'
    | 'ANALYZE_RS'
    | 'RENDER_HEATMAP'
    | 'PNG_DECODE'
    | 'CALCULATE_RISK'
    | 'INSPECT_BINARY'
    | 'COMPARE_IMAGES'
    | 'ANALYZE_TEXT'
    | 'SCAN_ZSTEG'
    | 'EXTRACT_ZSTEG_PAYLOAD';

export interface WorkerRequest<T = any> {
    id: string;
    action: WorkerAction;
    data: T;
}

export interface WorkerProgressMessage {
    type: 'PROGRESS';
    id: string;
    percent: number;
    text: string;
}

export interface WorkerSuccessMessage<T = any> {
    type: 'SUCCESS';
    id: string;
    result: T;
}

export interface WorkerErrorMessage {
    type: 'ERROR';
    id: string;
    error: string;
}

export type WorkerResponse = WorkerProgressMessage | WorkerSuccessMessage | WorkerErrorMessage;
