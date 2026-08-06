import './styles.css';
import { api, savedSecret, saveSecret, clearSecret, setSecret } from './api';
import { escapeHtml } from './escape-html';
import { initMap, renderLeadPins, invalidateMapSize } from './map';
import type { Lead, LeadDetail, Appointment } from './types';
import { STATUS_LABELS, PIPELINE_ORDER } from './types';

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector<T>(sel)!;
const $$ = <T extends HTMLElement>(sel: string, root: ParentNode = document): T[] => [...root.querySelectorAll<T>(sel)];

const loginScreen = $('#login-screen');
const appRoot = $('#app');
const loginForm = $<HTMLFormElement>('#login-form');
const secretInput = $<HTMLInputElement>('#app-secret');
const loginStatus = $('#login-status');

let statusFilter = '';
let calendarRange: 'today' | 'upcoming' = 'today';
let activeDetail: LeadDetail | null = null;
let pendingPhotoTag = 'general';

// ---------------------------------------------------------------- utilities

function telHref(phone: string): string {
    return `tel:${phone}`;
}
function smsHref(phone: string, body: string): string {
    return `sms:${phone}?&body=${encodeURIComponent(body)}`;
}
function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtTime(iso: string): string {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso));
}
function fmtWhen(iso: string): string {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso));
}
function statusColor(status: string): string {
    return `var(--${status})`;
}
function toast(message: string): void {
    // eslint-disable-next-line no-alert
    alert(message);
}

// ------------------------------------------------------------------- login

async function trySignIn(secret: string, remember: boolean): Promise<void> {
    setSecret(secret);
    loginStatus.textContent = 'Checking…';
    try {
        await api.listLeads({});
        if (remember) saveSecret(secret);
        loginScreen.classList.add('hidden');
        appRoot.classList.remove('hidden');
        await bootApp();
    } catch (err) {
        setSecret('');
        loginStatus.textContent = err instanceof Error ? err.message : 'Sign-in failed';
    }
}

loginForm.addEventListener('submit', event => {
    event.preventDefault();
    trySignIn(secretInput.value.trim(), true);
});

$('#signout-btn').addEventListener('click', () => {
    clearSecret();
    setSecret('');
    appRoot.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    secretInput.value = '';
});

// -------------------------------------------------------------------- tabs

$$('nav.bottom-nav button').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab!;
        $$('nav.bottom-nav button').forEach(b => b.classList.toggle('active', b === btn));
        $$('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
        if (tab === 'map') { requestAnimationFrame(() => invalidateMapSize()); refreshMap(); }
        if (tab === 'pipeline') refreshPipeline();
        if (tab === 'calendar') refreshCalendar();
    });
});

// ------------------------------------------------------------------- leads

$$('#status-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
        statusFilter = chip.dataset.status || '';
        $$('#status-chips .chip').forEach(c => c.classList.toggle('active', c === chip));
        refreshLeads();
    });
});

$('#generate-btn').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('#generate-btn');
    btn.disabled = true;
    btn.textContent = 'Generating…';
    try {
        const result = await api.generateLeads();
        toast(result.alreadyGeneratedToday
            ? "Today's leads were already generated."
            : `Dropped ${result.generated} new leads.`);
        await refreshLeads();
    } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not generate leads');
    } finally {
        btn.disabled = false;
        btn.textContent = "Generate today's leads";
    }
});

function leadCard(lead: Lead): string {
    return `<div class="lead-card" data-id="${lead.id}">
        <div class="row1">
            <h3>${escapeHtml(lead.name)}</h3>
            <span class="badge" style="background:${statusColor(lead.status)}">${STATUS_LABELS[lead.status]}</span>
        </div>
        <div class="meta">${escapeHtml(lead.neighborhood)} · ${lead.distanceMiles} mi away</div>
        <div class="meta">${escapeHtml(lead.address)}</div>
        <div class="scorepills">
            <span class="pill">Roof <b>${lead.roofAgeYears}y</b></span>
            <span class="pill">Storm <b>${lead.stormScore}</b></span>
            <span class="pill">Claim <b>${lead.insuranceLikelihood}%</b></span>
        </div>
    </div>`;
}

async function refreshLeads(): Promise<void> {
    const list = $('#leads-list');
    list.innerHTML = '<div class="empty">Loading…</div>';
    try {
        const { leads } = await api.listLeads(statusFilter ? { status: statusFilter } : {});
        list.innerHTML = leads.length
            ? leads.map(leadCard).join('')
            : '<div class="empty">No leads yet. Tap "Generate today\'s leads" to drop some in.</div>';
    } catch (err) {
        list.innerHTML = `<div class="empty">${escapeHtml(err instanceof Error ? err.message : 'Could not load leads')}</div>`;
    }
}

$('#leads-list').addEventListener('click', event => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.lead-card');
    if (card?.dataset.id) openDetail(card.dataset.id);
});

// --------------------------------------------------------------------- map

let mapReady = false;
async function refreshMap(): Promise<void> {
    if (!mapReady) { initMap($('#map')); mapReady = true; }
    try {
        const { leads } = await api.listLeads({});
        renderLeadPins(leads, id => openDetail(id));
    } catch {
        /* map stays as-is; the leads tab already surfaces load errors */
    }
}

// ---------------------------------------------------------------- pipeline

async function refreshPipeline(): Promise<void> {
    const board = $('#pipeline-board');
    board.innerHTML = '<div class="empty">Loading…</div>';
    try {
        const { leads } = await api.listLeads({});
        board.innerHTML = PIPELINE_ORDER.map(status => {
            const inColumn = leads.filter(l => l.status === status);
            return `<div class="pipeline-col">
                <h4>${STATUS_LABELS[status]} <span>${inColumn.length}</span></h4>
                ${inColumn.map(lead => `
                    <div class="pipeline-card" data-id="${lead.id}">
                        <div class="name">${escapeHtml(lead.name)}</div>
                        <div class="small-muted">${escapeHtml(lead.neighborhood)}</div>
                        <select data-id="${lead.id}">
                            ${PIPELINE_ORDER.map(s => `<option value="${s}" ${s === status ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}
                        </select>
                    </div>`).join('') || '<div class="small-muted">Empty</div>'}
            </div>`;
        }).join('');
    } catch (err) {
        board.innerHTML = `<div class="empty">${escapeHtml(err instanceof Error ? err.message : 'Could not load pipeline')}</div>`;
    }
}

$('#pipeline-board').addEventListener('change', async event => {
    const select = event.target as HTMLSelectElement;
    if (select.tagName !== 'SELECT' || !select.dataset.id) return;
    try {
        await api.updateLead(select.dataset.id, { status: select.value });
        await refreshPipeline();
    } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not update status');
    }
});
$('#pipeline-board').addEventListener('click', event => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.pipeline-card');
    if (card?.dataset.id && !(event.target as HTMLElement).matches('select')) openDetail(card.dataset.id);
});

// ---------------------------------------------------------------- calendar

$$('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
        calendarRange = btn.dataset.range as 'today' | 'upcoming';
        $$('[data-range]').forEach(b => b.classList.toggle('active', b === btn));
        refreshCalendar();
    });
});

function apptCard(appt: Appointment): string {
    return `<div class="appt-card">
        <div class="appt-time">${fmtWhen(appt.startsAt)}<br><span class="small-muted">${fmtDate(appt.startsAt)}</span></div>
        <div class="appt-body">
            <h4>${escapeHtml(appt.name || '')}</h4>
            <div class="meta">${escapeHtml(appt.address || '')}</div>
            <div class="meta">${escapeHtml(appt.neighborhood || '')}</div>
            <div class="appt-actions">
                <a class="btn" href="${telHref(appt.phone || '')}">📞 Call</a>
                <button class="btn" data-open="${appt.leadId}">Open lead</button>
            </div>
        </div>
    </div>`;
}

async function refreshCalendar(): Promise<void> {
    const list = $('#calendar-list');
    list.innerHTML = '<div class="empty">Loading…</div>';
    try {
        const { appointments } = await api.listAppointments(calendarRange);
        list.innerHTML = appointments.length
            ? appointments.map(apptCard).join('')
            : `<div class="empty">Nothing scheduled ${calendarRange === 'today' ? 'today' : 'yet'}.</div>`;
    } catch (err) {
        list.innerHTML = `<div class="empty">${escapeHtml(err instanceof Error ? err.message : 'Could not load schedule')}</div>`;
    }
}

$('#calendar-list').addEventListener('click', event => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-open]');
    if (btn?.dataset.open) openDetail(btn.dataset.open);
});

// ---------------------------------------------------------------- detail

const overlay = $('#detail-overlay');
const drawer = $('#detail-drawer');

async function openDetail(id: string): Promise<void> {
    overlay.classList.remove('hidden');
    drawer.innerHTML = '<div class="empty">Loading…</div>';
    await loadDetail(id);
}

async function loadDetail(id: string): Promise<void> {
    try {
        activeDetail = await api.getLead(id);
        renderDetail();
    } catch (err) {
        drawer.innerHTML = `<div class="empty">${escapeHtml(err instanceof Error ? err.message : 'Could not load lead')}</div>`;
    }
}

function closeDetail(): void {
    overlay.classList.add('hidden');
    activeDetail = null;
    refreshLeads();
}
overlay.addEventListener('click', event => { if (event.target === overlay) closeDetail(); });

function renderDetail(): void {
    if (!activeDetail) return;
    const { lead, calls, messages, appointments, photos, summaries } = activeDetail;
    const latestSummary = summaries[0];
    const shareUrl = latestSummary ? `${location.origin}/s/${latestSummary.shareToken}` : '';

    drawer.innerHTML = `
      <div class="drawer-head">
        <h2>${escapeHtml(lead.name)}</h2>
        <button class="close-btn" data-action="close">&times;</button>
      </div>

      <div class="section">
        <h4>Contact</h4>
        <div class="meta">${escapeHtml(lead.address)} · ${escapeHtml(lead.neighborhood)} · ${lead.distanceMiles} mi</div>
        <div class="scorepills">
            <span class="pill">Roof <b>${lead.roofAgeYears}y</b></span>
            <span class="pill">Storm <b>${lead.stormScore}/100</b></span>
            <span class="pill">Claim <b>${lead.insuranceLikelihood}%</b></span>
        </div>
        <div class="contact-row" style="margin-top:10px">
            <a class="btn primary" href="${telHref(lead.phone)}">📞 Call</a>
            <button class="btn" data-action="text-followup">💬 Text follow-up</button>
        </div>
      </div>

      <div class="section">
        <h4>Pipeline status</h4>
        <div class="status-buttons">
            ${PIPELINE_ORDER.map(s => `<button data-action="set-status" data-status="${s}"
                class="${s === lead.status ? 'active' : ''}"
                style="${s === lead.status ? `background:${statusColor(s)}` : ''}">${STATUS_LABELS[s]}</button>`).join('')}
        </div>
      </div>

      <div class="section">
        <h4>Call log</h4>
        <div class="call-log-row">
            <button class="btn" data-action="log-call" data-outcome="answered">Answered</button>
            <button class="btn" data-action="log-call" data-outcome="no_answer">No answer</button>
            <button class="btn" data-action="log-call" data-outcome="voicemail">Voicemail</button>
            <button class="btn" data-action="log-call" data-outcome="callback_requested">Callback requested</button>
        </div>
        ${calls.length ? calls.map(c => `<div class="timeline-item"><b>${c.outcome.replace('_', ' ')}</b>
            <div class="when">${fmtTime(c.createdAt)}</div>${c.notes ? `<div>${escapeHtml(c.notes)}</div>` : ''}</div>`).join('')
            : '<div class="small-muted">No calls logged yet.</div>'}
      </div>

      <div class="section">
        <h4>Notes</h4>
        <textarea class="notes" id="lead-notes">${escapeHtml(lead.notes)}</textarea>
        <button class="btn" data-action="save-notes" style="margin-top:8px">Save notes</button>
      </div>

      <div class="section">
        <h4>Appointments</h4>
        <button class="btn primary block" data-action="schedule">📅 Book next available 60-min slot</button>
        ${appointments.length ? appointments.map(a => `<div class="timeline-item">
            <b>${fmtTime(a.startsAt)}</b> — ${a.status}
            ${a.status === 'scheduled' ? `<div class="call-log-row" style="margin-top:6px">
                <button class="btn" data-action="appt-status" data-id="${a.id}" data-status="completed">Mark completed</button>
                <button class="btn" data-action="appt-status" data-id="${a.id}" data-status="cancelled">Cancel</button>
            </div>` : ''}
        </div>`).join('') : '<div class="small-muted">Nothing booked yet.</div>'}
      </div>

      <div class="section">
        <h4>Inspection photos</h4>
        <div class="tag-row">
            ${['storm', 'age', 'insurance', 'general'].map(tag =>
                `<button class="btn ${tag === pendingPhotoTag ? 'primary' : ''}" data-action="pick-tag" data-tag="${tag}">${tag}</button>`).join('')}
        </div>
        <button class="btn block" data-action="take-photo">📷 Take / upload photo</button>
        <input type="file" accept="image/*" capture="environment" id="photo-input" class="hidden" />
        <div class="photo-grid">
            ${photos.map(p => `<img src="${escapeHtml(p.url)}" alt="${p.tag} photo" title="${p.tag}" />`).join('')}
        </div>
      </div>

      <div class="section">
        <h4>Inspection summary</h4>
        <button class="btn primary block" data-action="generate-summary">📝 Generate summary + share link</button>
        ${latestSummary ? `
            <div style="margin-top:10px">
                <p><b>Roof condition:</b> ${escapeHtml(latestSummary.roofCondition)}</p>
                <p><b>Storm analysis:</b> ${escapeHtml(latestSummary.stormAnalysis)}</p>
                <p><b>Insurance notes:</b> ${escapeHtml(latestSummary.insuranceNotes)}</p>
                <p><b>Recommendation:</b> ${escapeHtml(latestSummary.recommendation)}</p>
                <div class="share-box">
                    Shareable link (expires ${fmtDate(latestSummary.shareExpiresAt)}):<br>
                    <a href="${shareUrl}" target="_blank" rel="noopener">${escapeHtml(shareUrl)}</a>
                </div>
                <button class="btn" data-action="text-summary-link" style="margin-top:8px">💬 Text this link</button>
            </div>` : '<div class="small-muted">No summary yet — generate one after the inspection.</div>'}
      </div>

      <div class="section">
        <h4>Message log</h4>
        ${messages.length ? messages.map(m => `<div class="timeline-item">
            <b>${m.kind.replace('_', ' ')}</b> <span class="small-muted">(${m.status})</span>
            <div class="when">${fmtTime(m.createdAt)}</div>
            <div>${escapeHtml(m.body)}</div>
        </div>`).join('') : '<div class="small-muted">Nothing sent yet.</div>'}
      </div>
    `;

    bindPhotoInput();
}

function bindPhotoInput(): void {
    if (!activeDetail) return;
    const { lead } = activeDetail;
    $<HTMLInputElement>('#photo-input').addEventListener('change', async event => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file || !activeDetail) return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                await api.uploadPhoto(lead.id, reader.result as string, pendingPhotoTag);
                await loadDetail(lead.id);
            } catch (err) {
                toast(err instanceof Error ? err.message : 'Could not upload photo');
            }
        };
        reader.readAsDataURL(file);
    });
}

// Bound once at startup: `drawer`'s own node never changes across renders
// (only its innerHTML does), so a single delegated listener here covers
// every render — re-adding it inside renderDetail would stack listeners
// and, worse, a `{once:true}` version would silently die after one click.
drawer.addEventListener('click', async event => {
        const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
        if (!btn || !activeDetail) return;
        const action = btn.dataset.action;
        const currentLead = activeDetail.lead;

        try {
            if (action === 'close') {
                closeDetail();
            } else if (action === 'set-status') {
                await api.updateLead(currentLead.id, { status: btn.dataset.status! });
                await loadDetail(currentLead.id);
            } else if (action === 'log-call') {
                const result = await api.logCall(currentLead.id, btn.dataset.outcome!);
                await loadDetail(currentLead.id);
                const auto = (result as { autoMessage?: { body: string } }).autoMessage;
                if (auto) {
                    if (confirm('Logged the call and drafted a follow-up text. Open it to send now?')) {
                        window.location.href = smsHref(currentLead.phone, auto.body);
                    }
                }
            } else if (action === 'text-followup') {
                const result = await api.logMessage(currentLead.id, 'follow_up');
                await loadDetail(currentLead.id);
                window.location.href = smsHref(currentLead.phone, result.message.body);
            } else if (action === 'save-notes') {
                const notes = $<HTMLTextAreaElement>('#lead-notes').value;
                await api.updateLead(currentLead.id, { notes });
                toast('Notes saved.');
            } else if (action === 'schedule') {
                btn.textContent = 'Booking…';
                await api.scheduleAppointment(currentLead.id);
                await loadDetail(currentLead.id);
                toast('Booked the next open 60-minute slot and drafted a confirmation text.');
            } else if (action === 'appt-status') {
                await api.setAppointmentStatus(currentLead.id, btn.dataset.id!, btn.dataset.status!);
                await loadDetail(currentLead.id);
            } else if (action === 'pick-tag') {
                pendingPhotoTag = btn.dataset.tag!;
                renderDetail();
            } else if (action === 'take-photo') {
                $<HTMLInputElement>('#photo-input').click();
            } else if (action === 'generate-summary') {
                btn.textContent = 'Generating…';
                await api.generateSummary(currentLead.id);
                await loadDetail(currentLead.id);
            } else if (action === 'text-summary-link') {
                const latest = activeDetail.summaries[0];
                if (latest) {
                    const link = await api.logMessage(currentLead.id, 'summary_link', `${location.origin}/s/${latest.shareToken}`);
                    window.location.href = smsHref(currentLead.phone, link.message.body);
                }
            }
        } catch (err) {
            toast(err instanceof Error ? err.message : 'Something went wrong');
        }
});

// -------------------------------------------------------------------- boot

async function bootApp(): Promise<void> {
    await refreshLeads();
}

const saved = savedSecret();
if (saved) {
    secretInput.value = '';
    trySignIn(saved, true);
}
