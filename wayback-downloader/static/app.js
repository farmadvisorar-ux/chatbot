(() => {
  const form = document.getElementById("download-form");
  const previewBtn = document.getElementById("preview-btn");
  const startBtn = document.getElementById("start-btn");
  const cancelBtn = document.getElementById("cancel-btn");
  const downloadLink = document.getElementById("download-link");

  const previewPanel = document.getElementById("preview-panel");
  const previewSummary = document.getElementById("preview-summary");
  const previewSample = document.getElementById("preview-sample");

  const progressPanel = document.getElementById("progress-panel");
  const progressMessage = document.getElementById("progress-message");
  const progressFill = document.getElementById("progress-fill");
  const statCompleted = document.getElementById("stat-completed");
  const statSkipped = document.getElementById("stat-skipped");
  const statFailed = document.getElementById("stat-failed");
  const statTotal = document.getElementById("stat-total");
  const logOutput = document.getElementById("log-output");

  const errorPanel = document.getElementById("error-panel");
  const errorMessage = document.getElementById("error-message");

  const concurrencyInput = document.getElementById("concurrency");
  const concurrencyValue = document.getElementById("concurrency-value");
  const maxFilesInput = document.getElementById("max_files");
  const maxFilesValue = document.getElementById("max-files-value");

  concurrencyInput.addEventListener("input", () => {
    concurrencyValue.textContent = concurrencyInput.value;
  });
  maxFilesInput.addEventListener("input", () => {
    maxFilesValue.textContent = maxFilesInput.value;
  });

  let currentJobId = null;
  let eventSource = null;
  let logLines = 0;
  const MAX_LOG_LINES = 300;

  function collectParams() {
    const extensions = Array.from(
      document.querySelectorAll("#extension-chips input:checked")
    ).map((el) => el.value);

    return {
      domain: document.getElementById("domain").value.trim(),
      from_ts: document.getElementById("from_ts").value.trim(),
      to_ts: document.getElementById("to_ts").value.trim(),
      exact_url: document.getElementById("exact_url").checked,
      all_snapshots: document.getElementById("all_snapshots").checked,
      only_status_200: document.getElementById("only_status_200").checked,
      extensions,
      only_pattern: document.getElementById("only_pattern").value.trim(),
      exclude_pattern: document.getElementById("exclude_pattern").value.trim(),
      concurrency: Number(concurrencyInput.value),
      max_files: Number(maxFilesInput.value),
    };
  }

  function showError(message) {
    hide(previewPanel);
    hide(progressPanel);
    errorMessage.textContent = message;
    show(errorPanel);
  }

  function hide(el) { el.classList.add("hidden"); }
  function show(el) { el.classList.remove("hidden"); }

  async function postJSON(url, body) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || `Request failed (${resp.status})`);
    }
    return data;
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
      const data = await postJSON("/api/preview", params);
      previewSummary.textContent =
        data.count === 0
          ? "No archived pages matched. Try widening your filters."
          : `Found ${data.count.toLocaleString()} matching snapshot(s).` +
            (data.truncated_at ? ` Only the first ${data.truncated_at.toLocaleString()} will be downloaded.` : "");
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
      showError(err.message);
    } finally {
      previewBtn.disabled = false;
      previewBtn.textContent = "Preview";
    }
  });

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
    logLines = 0;
    hide(downloadLink);
    show(cancelBtn);
    cancelBtn.disabled = false;
    progressFill.style.width = "0%";
    statCompleted.textContent = "0";
    statSkipped.textContent = "0";
    statFailed.textContent = "0";
    statTotal.textContent = "0";
    progressMessage.textContent = "Starting...";
    show(progressPanel);

    try {
      const job = await postJSON("/api/jobs", params);
      currentJobId = job.id;
      connectStream(job.id);
    } catch (err) {
      showError(err.message);
      startBtn.disabled = false;
    }
  });

  function connectStream(jobId) {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`/api/jobs/${jobId}/stream`);

    eventSource.onmessage = (evt) => {
      const data = JSON.parse(evt.data);
      updateProgress(data);

      if (data.file_event) {
        appendLog(data.file_event);
      }

      if (["done", "error", "cancelled"].includes(data.status)) {
        eventSource.close();
        startBtn.disabled = false;
        cancelBtn.disabled = true;

        if (data.status === "done") {
          downloadLink.href = `/api/jobs/${jobId}/download`;
          show(downloadLink);
          progressMessage.textContent = data.message || "Done!";
        } else if (data.status === "error") {
          progressMessage.textContent = data.message || "The download failed.";
          if (data.error) appendPlainLog(`Error: ${data.error}`, "log-error");
        } else {
          progressMessage.textContent = "Cancelled.";
        }
      }
    };

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) return;
    };
  }

  function updateProgress(data) {
    const total = data.total || 0;
    const done = (data.completed || 0) + (data.failed || 0) + (data.skipped || 0);
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    progressFill.style.width = `${pct}%`;
    statCompleted.textContent = data.completed || 0;
    statSkipped.textContent = data.skipped || 0;
    statFailed.textContent = data.failed || 0;
    statTotal.textContent = total;
    if (data.message) progressMessage.textContent = data.message;
  }

  function appendLog(fileEvent) {
    if (fileEvent.type === "ok") return; // keep the log focused on notable events
    const cls = fileEvent.type === "error" ? "log-error" : "log-skip";
    const label = fileEvent.type === "error" ? `Failed: ${fileEvent.message}` : "Skipped (already downloaded)";
    appendPlainLog(`${fileEvent.url} — ${label}`, cls);
  }

  function appendPlainLog(text, cls) {
    if (logLines >= MAX_LOG_LINES) return;
    const div = document.createElement("div");
    if (cls) div.className = cls;
    div.textContent = text;
    logOutput.appendChild(div);
    logOutput.scrollTop = logOutput.scrollHeight;
    logLines += 1;
  }

  cancelBtn.addEventListener("click", async () => {
    if (!currentJobId) return;
    cancelBtn.disabled = true;
    try {
      await fetch(`/api/jobs/${currentJobId}/cancel`, { method: "POST" });
    } catch (err) {
      // ignore — the stream will reflect the final state
    }
  });
})();
