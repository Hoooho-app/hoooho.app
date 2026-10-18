import { apiRequest } from '../../services/apiClient';
export interface CareTask {
    id: string;
    title: string;
    description: string;
    path: string;
    completed: boolean;
    reward: number;
}
export interface CareAchievement {
    id: string;
    title: string;
    description: string;
    reward: number;
    progress: number;
    target: number;
    achievedAt: string | null;
}
export interface CareOwned {
    kind?: string;
    expiresAt?: string;
    productId: string;
    id?: string;
    title?: string;
    path?: string;
    createdAt?: string;
}
export interface CareVoucher {
    id: string;
    productId: string;
    status: string;
    title?: string;
    path?: string;
    createdAt?: string;
}
export interface CareLedgerEntry {
    id: string;
    kind: string;
    amount: number;
    createdAt: string;
    label: string;
}
export type CareTheme = 'paper' | 'mist-blue';
export interface CareDashboard {
    currency: '树芽';
    balance: number;
    reserved: number;
    lifetime: number;
    level: {
        value: number;
        name: string;
        threshold: number;
        nextThreshold: number | null;
        nextName?: string;
    };
    today: {
        date: string;
        checkedIn: boolean;
        task: CareTask | null;
        complete: boolean;
    };
    achievements: CareAchievement[];
    owned: CareOwned[];
    vouchers: CareVoucher[];
    ledger: CareLedgerEntry[];
    theme: {
        active: CareTheme;
        owned: CareTheme[];
    };
}
export interface CareTaskMaterial {
    id: string;
    title: string;
    content: string | string[];
    type: string;
}
export interface CareProduct {
    id: string;
    title: string;
    description: string;
    cost: number;
    type: string;
    available: boolean;
    reason?: string;
    owned: boolean;
    included?: boolean;
    destination?: string;
}
export const careApi = {
    dashboard: (token: string, signal?: AbortSignal) => apiRequest<CareDashboard>('/api/care-journey', { token, signal }),
    catalogue: (token: string, signal?: AbortSignal) => apiRequest<{
        items: CareProduct[];
    }>('/api/care-journey/catalogue', { token, signal }),
    checkIn: (token: string) => apiRequest<CareDashboard>('/api/care-journey/check-in', { token, method: 'POST', body: {} }),
    verify: (token: string) => apiRequest<CareDashboard>('/api/care-journey/task/verify', { token, method: 'POST', body: {} }),
    redeem: (token: string, productId: string, requestId: string) => apiRequest<CareDashboard>('/api/care-journey/redeem', { token, method: 'POST', body: { productId, requestId } }),
    theme: (token: string, themeId: CareTheme) => apiRequest<CareDashboard>('/api/care-journey/theme', { token, method: 'POST', body: { themeId } }),
    taskMaterial: (token: string, memberId: string, type: 'profile' | 'knowledge', signal?: AbortSignal) => { const query = new URLSearchParams({ type }); if (memberId)
        query.set('memberId', memberId); return apiRequest<CareTaskMaterial>(`/api/care-journey/task-material?${query}`, { token, signal }); },
    confirmMaterial: (token: string, materialId: string) => apiRequest<CareDashboard>('/api/care-journey/task-material/confirm', { token, method: 'POST', body: { materialId } })
};
export function announceCareTheme(theme: CareTheme) { window.dispatchEvent(new CustomEvent('hoooho-care-theme-changed', { detail: { theme } })); }
export function carePath(path: unknown, fallback = '/care-journey') { return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : fallback; }
