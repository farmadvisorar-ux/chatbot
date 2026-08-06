import type { Appointment, LeadDetail, Lead } from './types';

const STORAGE_KEY = 'roofsignal_app_secret';

export function savedSecret(): string | null {
    return localStorage.getItem(STORAGE_KEY);
}
export function saveSecret(secret: string): void {
    localStorage.setItem(STORAGE_KEY, secret);
}
export function clearSecret(): void {
    localStorage.removeItem(STORAGE_KEY);
}

let secret = '';
export function setSecret(value: string): void { secret = value; }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        ...init,
        headers: {
            ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
            Authorization: `Bearer ${secret}`,
        },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
    }
    return payload as T;
}

export const api = {
    listLeads: (params: { status?: string; date?: string } = {}) => {
        const qs = new URLSearchParams(params as Record<string, string>).toString();
        return call<{ leads: Lead[] }>(`/api/leads${qs ? `?${qs}` : ''}`);
    },
    generateLeads: (count?: number) =>
        call<{ ok: true; generated: number; alreadyGeneratedToday?: boolean }>('/api/leads?action=generate', {
            method: 'POST', body: JSON.stringify(count ? { count } : {}),
        }),
    getLead: (id: string) => call<LeadDetail>(`/api/leads/${id}`),
    updateLead: (id: string, body: { status?: string; notes?: string }) =>
        call<{ lead: Lead }>(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    logCall: (id: string, outcome: string, notes?: string) =>
        call(`/api/leads/${id}?resource=call`, { method: 'POST', body: JSON.stringify({ outcome, notes }) }),
    logMessage: (id: string, kind: string, body?: string) =>
        call<{ message: { body: string } }>(`/api/leads/${id}?resource=message`, {
            method: 'POST', body: JSON.stringify({ kind, body }),
        }),
    uploadPhoto: (id: string, dataUrl: string, tag: string) =>
        call(`/api/leads/${id}?resource=photo`, { method: 'POST', body: JSON.stringify({ dataUrl, tag }) }),
    scheduleAppointment: (id: string, startsAt?: string) =>
        call<{ appointment: Appointment }>(`/api/leads/${id}?resource=appointment`, {
            method: 'POST', body: JSON.stringify(startsAt ? { startsAt } : {}),
        }),
    setAppointmentStatus: (id: string, appointmentId: string, status: string) =>
        call(`/api/leads/${id}?resource=appointment-status`, {
            method: 'POST', body: JSON.stringify({ appointmentId, status }),
        }),
    generateSummary: (id: string, notes?: string) =>
        call<{ shareUrl: string }>(`/api/leads/${id}?resource=summary`, {
            method: 'POST', body: JSON.stringify({ notes }),
        }),
    listAppointments: (range: 'today' | 'upcoming' = 'upcoming') =>
        call<{ appointments: Appointment[] }>(`/api/appointments?range=${range}`),
};
