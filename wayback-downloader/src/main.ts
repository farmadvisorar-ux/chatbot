interface FileEntry {
  name: string;
  url: string;
  size: number;
}

interface LogEntry {
  type: "ok" | "error" | "skip";
  url: string;
  message?: string;
}

type JobStatus = "queued" | "downloading" | "done" | "error" | "cancelled";

interface PublicJobState {
  id: string;
  status: JobStatus;
  message: string;
  error: string | null;
  cursor: number;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  files: FileEntry[];
  recentEvents: LogEntry[];
  cancelRequested: boolean;
}

const TERMINAL_STATUSES: JobStatus[] = ["done", "error", "cancelled"];
const TICK_DELAY_MS = 250;

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

let currentJob: PublicJobState | null = null;

function hide(el: HTMLElement): void {
  el.classList.add("hidden");
}
function show(el: HTMLElement): void {
  el.classList.remove("hidden");
}

interface FormParams {
  domain: string;
  fromTs: string;
  toTs: string;
  exactUrl: boolean;
  allSnapshots: boolean;
  onlyStatus200: boolean;
  extensions: string[];
  onlyPattern: string;
  excludePattern: string;
  maxFiles: number;
}

function collectParams(): FormParams {
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

async function postJSON<T>(url: string, body?: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${resp.status})`);
  }
  return data as T;
}

previewBtn.addEventListener("click", async () => {
  hide(errorPanel);
  const params = collectParams();
  if (!params.domain) {
    showError("Please enter a domain or URL first.");
    return;
  }
  previewBtn.disabled = true;
  previewBtn.textContent = "Looking up...";
  try {
    const data = await postJSON<{ count: number; sample: { url: string; timestamp: string }[]; truncatedAt: number | null }>(
      "/api/preview",
      params,
    );
    previewSummary.textContent =
      data.count === 0
        ? "No archived pages matched. Try widening your filters."
        : `Found ${data.count.toLocaleString()} matching snapshot(s).` +
          (data.truncatedAt ? ` Only the first ${data.truncatedAt.toLocaleString()} will be downloaded.` : "");
    previewSample.innerHTML = "";
    data.sample.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = `${item.url} (${item.timestamp})`;
      previewSample.appendChild(li);
    });
    hide(progressPanel);
    hide(errorPanel);
    show(previewPanel);
  } catch (err) {
    showError((err as Error).message);
  } finally {
    previewBtn.disabled = false;
    previewBtn.textContent = "Preview";
  }
});

function renderLog(events: LogEntry[]): void {
  logOutput.innerHTML = "";
  events
    .filter((e) => e.type !== "ok")
    .forEach((e) => {
      const div = document.createElement("div");
      div.className = e.type === "error" ? "log-error" : "log-skip";
      div.textContent = e.type === "error" ? `${e.url} — Failed: ${e.message}` : `${e.url} — Skipped (duplicate)`;
      logOutput.appendChild(div);
    });
  logOutput.scrollTop = logOutput.scrollHeight;
}

function renderProgress(state: PublicJobState): void {
  const done = state.completed + state.failed + state.skipped;
  const pct = state.total > 0 ? Math.min(100, Math.round((done / state.total) * 100)) : 0;
  progressFill.style.width = `${pct}%`;
  statCompleted.textContent = String(state.completed);
  statSkipped.textContent = String(state.skipped);
  statFailed.textContent = String(state.failed);
  statTotal.textContent = String(state.total);
  progressMessage.textContent = state.message;
  renderLog(state.recentEvents);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function driveJob(jobId: string): Promise<void> {
  // Runs ticks sequentially so at most one write to the job's state is ever
  // in flight, and drives progress purely by polling — there is no
  // persistent connection to keep alive between requests.
  while (true) {
    const state = await postJSON<PublicJobState>(`/api/jobs/${jobId}/tick`);
    currentJob = state;
    renderProgress(state);

    if (TERMINAL_STATUSES.includes(state.status)) {
      finishJob(state);
      return;
    }
    await sleep(TICK_DELAY_MS);
  }
}

function finishJob(state: PublicJobState): void {
  startBtn.disabled = false;
  cancelBtn.disabled = true;
  hide(cancelBtn);

  if (state.status === "done") {
    if (state.files.length > 0) {
      show(downloadBtn);
      downloadBtn.disabled = false;
    } else {
      progressMessage.textContent = state.message || "No files were downloaded.";
    }
  } else if (state.status === "error") {
    progressMessage.textContent = state.message || "The download failed.";
    if (state.error) {
      const div = document.createElement("div");
      div.className = "log-error";
      div.textContent = `Error: ${state.error}`;
      logOutput.appendChild(div);
    }
  } else {
    progressMessage.textContent = "Cancelled.";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hide(errorPanel);
  hide(previewPanel);
  const params = collectParams();
  if (!params.domain) {
    showError("Please enter a domain or URL first.");
    return;
  }

  startBtn.disabled = true;
  logOutput.innerHTML = "";
  hide(downloadBtn);
  hide(zipMessage);
  show(cancelBtn);
  cancelBtn.disabled = false;
  progressFill.style.width = "0%";
  statCompleted.textContent = "0";
  statSkipped.textContent = "0";
  statFailed.textContent = "0";
  statTotal.textContent = "0";
  progressMessage.textContent = "Looking up snapshots...";
  show(progressPanel);

  try {
    const job = await postJSON<PublicJobState>("/api/jobs", params);
    currentJob = job;
    renderProgress(job);
    if (TERMINAL_STATUSES.includes(job.status)) {
      finishJob(job);
      return;
    }
    await driveJob(job.id);
  } catch (err) {
    showError((err as Error).message);
    startBtn.disabled = false;
  }
});

cancelBtn.addEventListener("click", async () => {
  if (!currentJob) return;
  cancelBtn.disabled = true;
  try {
    await fetch(`/api/jobs/${currentJob.id}`, { method: "POST" });
  } catch {
    // The in-flight tick loop will pick up the cancellation on its next call regardless.
  }
});

async function* zipEntries(files: FileEntry[]) {
  // Kick off every fetch in parallel (fetch() resolves once headers arrive,
  // not the full body, so this doesn't buffer file contents in memory),
  // then hand each resolved Response to client-zip, which streams the
  // body straight into the zip as it's generated.
  const responses = await Promise.all(files.map((f) => fetch(f.url)));
  for (let i = 0; i < files.length; i++) {
    yield { name: files[i].name, input: responses[i] };
  }
}

function safeFilename(domain: string): string {
  const host = domain.replace(/^\w+:\/\//, "").replace(/\/.*$/, "");
  return host.replace(/[^a-zA-Z0-9.-]/g, "_") || "site";
}

downloadBtn.addEventListener("click", async () => {
  if (!currentJob || currentJob.files.length === 0) return;
  downloadBtn.disabled = true;
  show(zipMessage);
  zipMessage.textContent = `Zipping ${currentJob.files.length} file(s) in your browser...`;

  try {
    const { downloadZip } = await import("client-zip");
    const blob = await downloadZip(zipEntries(currentJob.files)).blob();

    const filename = `${safeFilename($<HTMLInputElement>("domain").value)}.zip`;
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);

    zipMessage.textContent = `Saved ${filename} (${(blob.size / 1024 / 1024).toFixed(1)} MB).`;
  } catch (err) {
    zipMessage.textContent = `Could not build the zip: ${(err as Error).message}`;
  } finally {
    downloadBtn.disabled = false;
  }
});
