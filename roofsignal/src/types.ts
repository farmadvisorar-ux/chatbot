export type LeadStatus = 'new' | 'interested' | 'needs_inspection' | 'booked' | 'not_interested';

export type Lead = {
    id: string;
    name: string;
    phone: string;
    address: string;
    neighborhood: string;
    lat: number;
    lng: number;
    distanceMiles: string | number;
    roofAgeYears: number;
    stormScore: number;
    insuranceLikelihood: number;
    status: LeadStatus;
    notes: string;
    leadDate: string;
    source: string;
    createdAt: string;
};

export type CallLog = { id: string; outcome: string; notes: string; createdAt: string };
export type MessageLog = { id: string; kind: string; body: string; status: string; createdAt: string };
export type Appointment = {
    id: string; startsAt: string; endsAt: string; status: string;
    reminderSentAt?: string | null; createdAt?: string;
    leadId?: string; name?: string; phone?: string; address?: string; neighborhood?: string;
    lat?: number; lng?: number;
};
export type Photo = { id: string; url: string; tag: string; takenAt: string };
export type Summary = {
    id: string; roofCondition: string; stormAnalysis: string; insuranceNotes: string;
    recommendation: string; notes: string; shareToken: string; shareExpiresAt: string; createdAt: string;
};

export type LeadDetail = {
    lead: Lead; calls: CallLog[]; messages: MessageLog[];
    appointments: Appointment[]; photos: Photo[]; summaries: Summary[];
};

export const STATUS_LABELS: Record<LeadStatus, string> = {
    new: 'New',
    interested: 'Interested',
    needs_inspection: 'Needs Inspection',
    booked: 'Booked',
    not_interested: 'Not Interested',
};

export const PIPELINE_ORDER: LeadStatus[] = ['new', 'interested', 'needs_inspection', 'booked', 'not_interested'];
