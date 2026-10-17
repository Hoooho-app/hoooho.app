import { apiRequest } from '../../services/apiClient';
export interface ToolPhoto {
    dataUrl: string;
}
export interface FoodProductInput {
    name: string;
    photos: ToolPhoto[];
}
export interface FoodIngredient {
    original: string;
    chinese: string;
    status: string;
    reason: string;
}
export type FoodNotice = string | {
    original?: string;
    chinese?: string;
    reason?: string;
    name?: string;
};
export interface FoodComparisonResult {
    id: string;
    kind: 'food-comparison';
    memberId: string;
    createdAt: string;
    cost: number;
    unreadable?: {
        name: string;
        message: string;
    }[];
    products: {
        name: string;
        ingredients: FoodIngredient[];
        contains: FoodNotice[];
        advisory: FoodNotice[];
        photos: ToolPhoto[];
        sourcePhotoCount: number;
    }[];
}
export type HandoffScenario = 'nursery' | 'travel' | 'temporary';
export interface HandoffResult {
    id: string;
    kind: 'handoff-enhanced';
    memberId: string;
    createdAt: string;
    cost: number;
    scenario: HandoffScenario;
    title: string;
    memberName: string;
    avoid: string[];
    temporary: string[];
    avoidCrossContact: boolean;
    note: string;
    handoffChecklist?: string[];
}
export interface MedicationTemplate {
    id: string;
    label: string;
    structure: {
        mode: string;
        times: string[];
        intervalHours?: number;
        reminderTargets: string[];
    };
}
export type ToolResult = FoodComparisonResult | HandoffResult;
export const careToolsApi = {
    food: (token: string, body: {
        requestId: string;
        memberId: string;
        products: FoodProductInput[];
    }) => apiRequest<FoodComparisonResult>('/api/care-tools/food-comparison', { token, method: 'POST', body }),
    handoff: (token: string, body: {
        requestId: string;
        memberId: string;
        scenario: HandoffScenario;
        note: string;
        confirmed: true;
    }) => apiRequest<HandoffResult>('/api/care-tools/handoff', { token, method: 'POST', body }),
    results: (token: string, signal?: AbortSignal) => apiRequest<{
        items: ToolResult[];
    }>('/api/care-tools/results', { token, signal }),
    result: (token: string, id: string, signal?: AbortSignal) => apiRequest<ToolResult>(`/api/care-tools/results/${encodeURIComponent(id)}`, { token, signal }),
    templates: (token: string, signal?: AbortSignal) => apiRequest<{
        owned: boolean;
        items: MedicationTemplate[];
    }>('/api/care-tools/medication-templates', { token, signal }),
    saveTemplate: (token: string, body: {
        requestId: string;
        reminderId: string;
        label: string;
    }) => apiRequest<unknown>('/api/care-tools/medication-templates', { token, method: 'POST', body }),
    removeTemplate: (token: string, id: string) => apiRequest<unknown>(`/api/care-tools/medication-templates/${encodeURIComponent(id)}`, { token, method: 'DELETE' })
};
