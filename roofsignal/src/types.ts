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
    stormEventId: string | null;
    status: LeadStatus;
    notes: string;
    leadDate: string;
    source: string;
    createdAt: string;
};

/** A real NOAA/NCEI Storm Events record — see api/_lib/stormData.ts. */
export type StormEvent = {
    id: string;
    eventDate: string;
    eventType: string;
    magnitude: number | null;
    magnitudeType: string | null;
    countyFips: number;
    countyName: string;
    narrative: string;
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
    lead: Lead; stormEvent: StormEvent | null; calls: CallLog[]; messages: MessageLog[];
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
