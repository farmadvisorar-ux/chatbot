'use client';

export default function PrintCertificateButton() {
    return (
        <button
            type="button"
            onClick={() => window.print()}
            className="btn-primary !py-2 !px-4 text-xs font-bold flex items-center gap-2 shadow-sm"
        >
            <span>🖨️ Print / Save Certificate as PDF</span>
        </button>
    );
}
