const API_BASE = 'https://prstuvw.xyz';

function formatUsd(val) {
  if (val == null) return '$0';
  return '$' + Math.round(val).toLocaleString();
}

document.addEventListener('DOMContentLoaded', async () => {
  const domainInput = document.getElementById('domainInput');
  const evaluateBtn = document.getElementById('evaluateBtn');
  const loader = document.getElementById('loader');
  const errorBox = document.getElementById('errorBox');
  const resultBox = document.getElementById('resultBox');

  const resDomain = document.getElementById('resDomain');
  const resConfidence = document.getElementById('resConfidence');
  const resPrice = document.getElementById('resPrice');
  const resRange = document.getElementById('resRange');
  const resLiquidation = document.getElementById('resLiquidation');
  const resBin = document.getElementById('resBin');
  const resLease = document.getElementById('resLease');
  const resTrademark = document.getElementById('resTrademark');
  const fullReportBtn = document.getElementById('fullReportBtn');

  // Auto-detect domain from current active tab
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url) {
        try {
          const url = new URL(tabs[0].url);
          if (url.protocol.startsWith('http')) {
            const host = url.hostname.replace(/^www\./, '');
            domainInput.value = host;
            runAppraisal(host);
          }
        } catch {
          // ignore
        }
      }
    });
  }

  evaluateBtn.addEventListener('click', () => {
    const d = domainInput.value.trim().toLowerCase();
    if (d) runAppraisal(d);
  });

  domainInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const d = domainInput.value.trim().toLowerCase();
      if (d) runAppraisal(d);
    }
  });

  async function runAppraisal(domain) {
    errorBox.classList.add('hidden');
    resultBox.classList.add('hidden');
    loader.classList.remove('hidden');

    try {
      const res = await fetch(`${API_BASE}/api/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: [domain] }),
      });

      const data = await res.json();
      loader.classList.add('hidden');

      if (!res.ok) {
        errorBox.textContent = data.error || 'Evaluation failed';
        errorBox.classList.remove('hidden');
        return;
      }

      const item = data.results && data.results[0];
      if (!item || item.error || !item.result) {
        errorBox.textContent = item?.error || 'Unable to appraise domain';
        errorBox.classList.remove('hidden');
        return;
      }

      const r = item.result;
      resDomain.textContent = r.domain;
      resConfidence.textContent = `${r.confidenceScore || 75}% CONFIDENCE`;
      resPrice.textContent = formatUsd(r.midUsd);
      resRange.textContent = `Range: ${formatUsd(r.lowUsd)} – ${formatUsd(r.highUsd)}`;

      resLiquidation.textContent = formatUsd(r.channelPricing?.liquidationFloor || Math.round(r.midUsd * 0.25));
      resBin.textContent = formatUsd(r.channelPricing?.recommendedBinPrice || r.midUsd);
      resLease.textContent = `${formatUsd(r.channelPricing?.leaseToOwn?.months24?.monthlyUsd || Math.round((r.midUsd * 1.15) / 24))}/mo`;

      const udrpRating = r.trademark?.udrpRating || 'Minimal Risk';
      resTrademark.textContent = udrpRating;
      if (r.trademark?.riskLevel === 'severe' || r.trademark?.riskLevel === 'elevated') {
        resTrademark.style.color = '#f87171';
      } else {
        resTrademark.style.color = '#6ee7b7';
      }

      fullReportBtn.href = `${API_BASE}/valuation/${encodeURIComponent(r.domain)}`;
      resultBox.classList.remove('hidden');
    } catch (err) {
      loader.classList.add('hidden');
      errorBox.textContent = 'Connection error. Check network or server status.';
      errorBox.classList.remove('hidden');
    }
  }
});
