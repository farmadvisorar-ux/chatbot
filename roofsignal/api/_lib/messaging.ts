import { STORM_EVENTS } from './leadgen.ts';

/**
 * There is no Twilio (or similar) account wired in, so nothing here sends a
 * text or places a call on its own — see the README for why (Google Voice
 * has no supported API for programmatic SMS or auto-dialing; only Twilio-class
 * providers offer that, and this deployment has no account/keys for one).
 *
 * What this module does instead: build the `tel:`/`sms:` links the phone's
 * own dialer and messaging app already understand, and log every message the
 * app "sends" so the pipeline and lead history stay accurate. On a phone
 * where Google Voice is set as the default calling/texting app, tapping these
 * links routes straight through Voice; on iOS, Google Voice cannot be the
 * default SMS handler (an OS restriction), so the frontend also offers a
 * "copy message" fallback for pasting into the Voice app by hand.
 *
 * Swapping in a real provider later means adding a `sendSms()` here that
 * calls Twilio (or Google Voice's own outbound API, if a Workspace tenant is
 * ever set up for it) and setting the resulting `messages.status` to 'sent'
 * instead of 'logged' — nothing else in the schema or API changes.
 */

export function telHref(phoneE164: string): string {
    return `tel:${phoneE164}`;
}

export function smsHref(phoneE164: string, body: string): string {
    // The `&body=` form (rather than `?body=`) is the one that works across
    // both iOS Messages and Android's default SMS app / Google Voice.
    return `sms:${phoneE164}?&body=${encodeURIComponent(body)}`;
}

function stormReferenceFor(stormScore: number): string {
    // Higher-scored roofs are attributed to more recent, more severe events —
    // all four are real documented storms in this territory (see leadgen.ts).
    const event = stormScore >= 75 ? STORM_EVENTS[0]
        : stormScore >= 55 ? STORM_EVENTS[1]
        : stormScore >= 35 ? STORM_EVENTS[2]
        : STORM_EVENTS[3];
    return `${event!.name} (${event!.date})`;
}

export type MessageLead = { name: string; neighborhood: string; stormScore: number };

/** After a call that wasn't answered — the "auto-SMS follow-up" from the spec. */
export function followUpMessage(lead: MessageLead): string {
    const storm = stormReferenceFor(lead.stormScore);
    return `Hi ${firstName(lead.name)}, this is John with Cypress — local roofer here in ${lead.neighborhood}. `
        + `Tried calling about your roof; homes near you took damage from ${storm}. Most LA carriers `
        + `(State Farm, Allstate, USAA, Farmers, Louisiana Citizens) cover wind/hail with a 1-5% deductible, `
        + `so a free inspection is usually worth 15 minutes. Reply YES and I'll get you on the schedule.`;
}

/** After a homeowner says yes and a 60-minute slot is booked. */
export function confirmationMessage(lead: MessageLead, whenLabel: string): string {
    return `You're booked, ${firstName(lead.name)}! John with Cypress will be out ${whenLabel} for your free roof `
        + `inspection. I'll text a reminder an hour before. Questions? Just reply here.`;
}

/** One hour before the appointment. */
export function reminderMessage(lead: MessageLead): string {
    return `Reminder ${firstName(lead.name)}: John with Cypress is heading your way in about an hour for your `
        + `roof inspection at ${lead.neighborhood}. See you soon!`;
}

/** The SMS-shareable inspection summary link. */
export function summaryLinkMessage(lead: MessageLead, url: string): string {
    return `Hi ${firstName(lead.name)}, here's your roof inspection summary from John with Cypress: ${url} `
        + `(link works for 30 days). Let me know if you have any questions!`;
}

function firstName(fullName: string): string {
    return fullName.split(' ')[0] || fullName;
}
