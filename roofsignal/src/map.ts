import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Lead } from './types';

const TERRITORY_CENTER: [number, number] = [32.5205, -93.7412];

const COLOR_FOR: Record<string, string> = {
    new: '#64748b',
    interested: '#2563eb',
    needs_inspection: '#d97706',
    booked: '#16a34a',
    not_interested: '#94a3b8',
};

let map: L.Map | null = null;
let markers: L.CircleMarker[] = [];

export function initMap(container: HTMLElement): L.Map {
    if (map) return map;
    map = L.map(container, { zoomControl: true }).setView(TERRITORY_CENTER, 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    L.circle(TERRITORY_CENTER, { radius: 30 * 1609.34, color: '#c2410c', weight: 1, fillOpacity: 0.03 }).addTo(map);
    return map;
}

export function renderLeadPins(leads: Lead[], onSelect: (leadId: string) => void): void {
    if (!map) return;
    for (const marker of markers) marker.remove();
    markers = [];

    for (const lead of leads) {
        const marker = L.circleMarker([lead.lat, lead.lng], {
            radius: 7,
            color: '#fff',
            weight: 1.5,
            fillColor: COLOR_FOR[lead.status] ?? '#64748b',
            fillOpacity: 0.9,
        }).addTo(map);
        marker.bindTooltip(`${lead.name} — ${lead.neighborhood}`);
        marker.on('click', () => onSelect(lead.id));
        markers.push(marker);
    }
}

export function invalidateMapSize(): void {
    map?.invalidateSize();
}
