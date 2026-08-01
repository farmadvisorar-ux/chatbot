import { fetchSnapshots, filterSnapshots, CdxError, type Snapshot } from "./lib/cdx";
import { downloadSnapshots, type DownloadedFile } from "./lib/downloader";
import { parseParams, BadRequest, type JobParams } from "./lib/params";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const form = $<HTMLFormElement>("download-form");
const previewBtn = $<HTMLButtonElement>("preview-btn");
const startBtn = $<HTMLButtonElement>("start-btn");
const cancelBtn = $<HTMLButtonElement>("cancel-btn");
const downloadBtn = $<HTMLButtonElement>("download-btn");
const zipMessage = $<HTMLParagraphElement>("zip-message");

const previewPanel = $<HTMLElement>("preview-panel");
const previewSummary = $<HTMLParagraphElement>("preview-summary");
const previewSample = $<HTMLUListElement>("preview-sample");

const progressPanel = $<HTMLElement>("progress-panel");
const progressMessage = $<HTMLParagraphElement>("progress-message");
const progressFill = $<HTMLDivElement>("progress-fill");
const statCompleted = $<HTMLElement>("stat-completed");
const statSkipped = $<HTMLElement>("stat-skipped");
const statFailed = $<HTMLElement>("stat-failed");
const statTotal = $<HTMLElement>("stat-total");
const logOutput = $<HTMLDivElement>("log-output");

const errorPanel = $<HTMLElement>("error-panel");
const errorMessage = $<HTMLParagraphElement>("error-message");

const maxFilesInput = $<HTMLInputElement>("max_files");
const maxFilesValue = $<HTMLOutputElement>("max-files-value");

maxFilesInput.addEventListener("input", () => {
  maxFilesValue.textContent = maxFilesInput.value;
});

let cancelRequested = false;
let collectedFiles: DownloadedFile[] = [];
let logLines = 0;
const MAX_LOG_LINES = 300;

function hide(el: HTMLElement): void {
  el.classList.add("hidden");
}
function show(el: HTMLElement): void {
  el.classList.remove("hidden");
}

function readFormPayload(): Record<string, unknown> {
  const extensions = Array.from(
    document.querySelectorAll<HTMLInputElement>("#extension-chips input:checked"),
  ).map((el) => el.value);

  return {
    domain: $<HTMLInputElement>("domain").value.trim(),
    fromTs: $<HTMLInputElement>("from_ts").value.trim(),
    toTs: $<HTMLInputElement>("to_ts").value.trim(),
    exactUrl: $<HTMLInputElement>("exact_url").checked,
    allSnapshots: $<HTMLInputElement>("all_snapshots").checked,
    onlyStatus200: $<HTMLInputElement>("only_status_200").checked,
    extensions,
    onlyPattern: $<HTMLInputElement>("only_pattern").value.trim(),
    excludePattern: $<HTMLInputElement>("exclude_pattern").value.trim(),
    maxFiles: Number(maxFilesInput.value),
  };
}

function showError(message: string): void {
  hide(previewPanel);
  hide(progressPanel);
  errorMessage.textContent = message;
  show(errorPanel);
}

function friendlyNetworkError(err: unknown): string {
  const message = (err as Error)?.message || String(err);
  if (err instanceof CdxError) return message;
  return (
    `Could not reach the Wayback Machine from your browser (${message}). ` +
    `This can happen if archive.org is temporarily unreachable, or if your network/extensions are blocking it.`
  );
}

async function lookupSnapshots(params: JobParams): Promise<Snapshot[]> {
  let snapshots = await fetchSnapshots(params.domain, {
    fromTs: params.fromTs,
    toTs: params.toTs,
    exactUrl: params.exactUrl,
    onlyStatus200: params.onlyStatus200,
    allSnapshots: params.allSnapshots,
  });
  snapshots = filterSnapshots(snapshots, {
    extensions: params.extensions.length ? params.extensions : null,
    onlyPattern: params.onlyPattern,
    excludePattern: params.excludePattern,
  });
  return snapshots;
}

previewBtn.addEventListener("click", async () => {
  hide(errorPanel);
  let params: JobParams;
  try {
    params = parseParams(readFormPayload());
  } catch (err) {
    showError(err instanceof BadRequest ? err.message : (err as Error).message);
    return;
  }

  previewBtn.disabled = true;
  previewBtn.textContent = "Looking up...";
  try {
    const snapshots = await lookupSnapshots(params);
    const truncatedAt = snapshots.length > params.maxFiles ? params.maxFiles : null;

    previewSummary.textContent =
      snapshots.length === 0
        ? "No archived pages matched. Try widening your filters."
        : `Found ${snapshots.length.toLocaleString()} matching snapshot(s).` +
          (truncatedAt ? ` Only the first ${truncatedAt.toLocaleString()} will be downloaded.` : "");
    previewSample.innerHTML = "";
    snapshots.slice(0, 25).forEach((s) => {
      const li = document.createElement("li");
      li.textContent = `${s.original} (${s.timestamp})`;
      previewSample.appendChild(li);
    });
    hide(progressPanel);
    hide(errorPanel);
    show(previewPanel);
  } catch (err) {
    showError(friendlyNetworkError(err));
  } finally {
    previewBtn.disabled = false;
    previewBtn.textContent = "Preview";
  }
});

function appendLogLine(text: string, cls: string): void {
  if (logLines >= MAX_LOG_LINES) return;
  const div = document.createElement("div");
  div.className = cls;
  div.textContent = text;
  logOutput.appendChild(div);
  logOutput.scrollTop = logOutput.scrollHeight;
  logLines += 1;
}

function updateStats(completed: number, failed: number, skipped: number, total: number): void {
  const done = completed + failed + skipped;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  progressFill.style.width = `${pct}%`;
  statCompleted.textContent = String(completed);
  statFailed.textContent = String(failed);
  statSkipped.textContent = String(skipped);
  statTotal.textContent = String(total);
}

function safeFilename(domain: string): string {
  const host = domain.replace(/^\w+:\/\//, "").replace(/\/.*$/, "");
  return host.replace(/[^a-zA-Z0-9.-]/g, "_") || "site";
}

async function buildAndSaveZip(domain: string): Promise<void> {
  if (collectedFiles.length === 0) return;
  show(zipMessage);
  zipMessage.textContent = `Zipping ${collectedFiles.length} file(s)...`;

  try {
    const { downloadZip } = await import("client-zip");
    const blob = await downloadZip(
      collectedFiles.map((f) => ({ name: f.name, input: f.blob, lastModified: new Date() })),
    ).blob();

    const filename = `${safeFilename(domain)}.zip`;
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);

    zipMessage.textContent = `Saved ${filename} (${(blob.size / 1024 / 1024).toFixed(1)} MB). If the save dialog didn't appear, use the button below.`;
  } catch (err) {
    zipMessage.textContent = `Could not build the zip: ${(err as Error).message}`;
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hide(errorPanel);
  hide(previewPanel);

  let params: JobParams;
  try {
    params = parseParams(readFormPayload());
  } catch (err) {
    showError(err instanceof BadRequest ? err.message : (err as Error).message);
    return;
  }

  startBtn.disabled = true;
  cancelRequested = false;
  collectedFiles = [];
  logOutput.innerHTML = "";
  logLines = 0;
  hide(downloadBtn);
  hide(zipMessage);
  show(cancelBtn);
  cancelBtn.disabled = false;
  updateStats(0, 0, 0, 0);
  progressMessage.textContent = "Looking up snapshots...";
  show(progressPanel);

  try {
    const snapshots = await lookupSnapshots(params);
    const truncated = snapshots.length > params.maxFiles;
    const capped = truncated ? snapshots.slice(0, params.maxFiles) : snapshots;

    if (capped.length === 0) {
      progressMessage.textContent = "No matching snapshots were found.";
      finish();
      return;
    }

    progressMessage.textContent = `Downloading ${capped.length} file(s)${truncated ? ` (capped at ${params.maxFiles})` : ""}...`;
    updateStats(0, 0, 0, capped.length);

    const result = await downloadSnapshots(capped, {
      allSnapshots: params.allSnapshots,
      onEvent: (event, progress) => {
        updateStats(progress.completed, progress.failed, progress.skipped, progress.total);
        if (event.type === "error") {
          appendLogLine(`${event.url} — Failed: ${event.message}`, "log-error");
        } else if (event.type === "skip") {
          appendLogLine(`${event.url} — Skipped (duplicate)`, "log-skip");
        }
      },
      isCancelled: () => cancelRequested,
    });

    collectedFiles = result.files;

    if (result.cancelled) {
      progressMessage.textContent = "Cancelled.";
      finish();
      return;
    }

    progressMessage.textContent =
      `Done! ${result.completed} file(s) downloaded` +
      (result.skipped ? `, ${result.skipped} skipped` : "") +
      (result.failed ? `, ${result.failed} failed` : "") +
      ".";
    finish();

    if (result.completed > 0) {
      await buildAndSaveZip(params.domain);
    }
  } catch (err) {
    showError(friendlyNetworkError(err));
    startBtn.disabled = false;
    hide(cancelBtn);
  }
});

function finish(): void {
  startBtn.disabled = false;
  cancelBtn.disabled = true;
  hide(cancelBtn);
  if (collectedFiles.length > 0) {
    show(downloadBtn);
    downloadBtn.disabled = false;
  }
}

cancelBtn.addEventListener("click", () => {
  cancelRequested = true;
  cancelBtn.disabled = true;
});

downloadBtn.addEventListener("click", async () => {
  downloadBtn.disabled = true;
  await buildAndSaveZip($<HTMLInputElement>("domain").value);
  downloadBtn.disabled = false;
});
