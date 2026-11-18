/**
 * src/ui/dom.ts
 * Ortak DOM seçicileri, durum/ilerleme yardımcıları, parola araçları ve sürükle-bırak yardımcıları.
 */

export function getEl<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id) as T | null;
    if (!el) throw new Error(`DOM element not found: #${id}`);
    return el;
}

let progressHideTimer: ReturnType<typeof setTimeout> | null = null;
const activePreviewUrls = new WeakMap<HTMLImageElement, string>();

export function showStatus(text: string, isSuccess: boolean): void {
    const statusMsg = getEl<HTMLElement>('status-msg');
    statusMsg.textContent = text;
    statusMsg.className = `m3-status ${isSuccess ? 'success' : 'error'}`;
    statusMsg.style.display = 'block';
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

export function clearStatus(): void {
    const statusMsg = getEl<HTMLElement>('status-msg');
    statusMsg.style.display = 'none';
    statusMsg.textContent = '';
}

export function updateProgress(percent: number, text: string): void {
    const progressContainer = getEl<HTMLElement>('progress-container');
    const progressBarFill = getEl<HTMLElement>('progress-bar-fill');
    const progressTextLabel = getEl<HTMLElement>('progress-text-label');
    const progressTextPercent = getEl<HTMLElement>('progress-text-percent');

    if (progressHideTimer) {
        clearTimeout(progressHideTimer);
        progressHideTimer = null;
    }

    progressContainer.style.display = 'block';
    const clamped = Math.min(100, Math.max(0, percent));
    progressBarFill.style.width = `${clamped}%`;
    progressTextLabel.textContent = text;
    progressTextPercent.textContent = `%${Math.round(clamped)}`;

    if (clamped >= 100) {
        progressHideTimer = setTimeout(() => {
            progressContainer.style.display = 'none';
            progressHideTimer = null;
        }, 1200);
    }
}

export function setPreviewImage(imgEl: HTMLImageElement, file: File): void {
    const prevUrl = activePreviewUrls.get(imgEl);
    if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
    }
    const newUrl = URL.createObjectURL(file);
    activePreviewUrls.set(imgEl, newUrl);
    imgEl.src = newUrl;
    imgEl.style.display = 'block';
}

export function setupDropzoneDragAndDrop(dropzone: HTMLElement, fileInput: HTMLInputElement): void {
    ['dragover', 'dragenter'].forEach(ev => {
        dropzone.addEventListener(ev, (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });
    });
    ['dragleave', 'drop'].forEach(ev => {
        dropzone.addEventListener(ev, (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
        });
    });
    dropzone.addEventListener('drop', (e: DragEvent) => {
        if (e.dataTransfer?.files?.[0]) {
            fileInput.files = e.dataTransfer.files;
            fileInput.dispatchEvent(new Event('change'));
        }
    });
}

export function setupPasswordToggles(): void {
    const toggleButtons = document.querySelectorAll<HTMLButtonElement>('.btn-toggle-pass');
    toggleButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            if (!targetId) return;
            const input = document.getElementById(targetId) as HTMLInputElement | null;
            if (!input) return;
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            btn.textContent = isHidden ? '🙈' : '👁️';
        });
    });
}

export function evaluatePasswordStrength(password: string): {
    percent: number;
    color: string;
    label: string;
} {
    if (!password) {
        return { percent: 0, color: 'transparent', label: '' };
    }

    let charsetSize = 0;
    if (/[a-z]/.test(password)) charsetSize += 26;
    if (/[A-Z]/.test(password)) charsetSize += 26;
    if (/[0-9]/.test(password)) charsetSize += 10;
    if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 32;

    const entropy = password.length * Math.log2(Math.max(1, charsetSize));

    if (entropy < 35 || password.length < 8) {
        return { percent: 25, color: 'var(--md-error)', label: 'Zayıf parola — en az 12 karakter önerilir' };
    }
    if (entropy < 55) {
        return { percent: 55, color: 'var(--md-warning)', label: 'Orta güçlükte parola' };
    }
    if (entropy < 75) {
        return { percent: 80, color: 'var(--md-primary)', label: 'Güçlü parola' };
    }
    return { percent: 100, color: '#4caf50', label: 'Çok güçlü parola' };
}

export function sanitizeFilename(rawName: string): string {
    const base = rawName.split(/[/\\]/).pop() || 'decrypted_secret.bin';
    const cleaned = base
        .replace(/[\x00-\x1F\x7F]/g, '')
        .replace(/^\.+/, '')
        .trim();
    return cleaned || 'decrypted_secret.bin';
}

export async function safeWriteClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}
