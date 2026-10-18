import { apiRequest } from '../../services/apiClient';
export interface ObservationSource { id: string; eventId: string; occurredAt: string; createdAt: string; content: string; amount: string; foodForm: string }
export type IntakeAnswer = 'daily' | 'sometimes' | 'none' | 'unknown';
export type SymptomAnswer = 'none' | 'yes' | 'unknown';
export interface ObservationReview {
  id: string; round: number; reviewedAt: string; days: number; startAt: string; dueAt: string;
  sources: ObservationSource[]; symptoms: ObservationSource[]; intake: IntakeAnswer; intakeLabel: string;
  symptomsAnswer: SymptomAnswer; symptomsLabel: string; note: string; outcome: string; sourceChanged: boolean;
}
export interface FoodObservation {
  id: string; memberId: string; name: string; days: number; round: number; version: number; origin: 'manual' | 'automatic';
  createdAt: string; startAt: string | null; dueAt: string | null; elapsedDays: number;
  status: 'waiting' | 'observing' | 'due' | 'complete' | 'archived'; caution: string | null;
  sources: ObservationSource[]; symptoms: ObservationSource[]; reviews: ObservationReview[];
}
export interface ObservationList {
  now: string; memberId: string; automatic: boolean; dueCount: number; items: FoodObservation[];
  entitlement: { active: boolean; included: boolean; expiresAt: string | null; balance: number; cost: number; durationDays: number; available: boolean };
}
export interface ObservationCreate { memberId: string; name: string; days: number; requestId: string; hasEaten: boolean; occurredAt?: string; amount?: string }
export type ObservationAction = 'duration' | 'review' | 'next-round' | 'archive';
export const observationApi = {
  list: (token: string, memberId: string, signal?: AbortSignal) => apiRequest<ObservationList>(`/api/food-observations?${new URLSearchParams({ memberId })}`, { token, signal }),
  automatic: (token: string, memberId: string, enabled: boolean) => apiRequest<ObservationList>('/api/food-observations/automatic', { token, method: 'POST', body: { memberId, enabled } }),
  create: (token: string, body: ObservationCreate) => apiRequest<ObservationList>('/api/food-observations', { token, method: 'POST', body }),
  change: (token: string, id: string, action: ObservationAction, body: Record<string, unknown>) => apiRequest<ObservationList>(`/api/food-observations/${id}/${action}`, { token, method: 'POST', body })
};
