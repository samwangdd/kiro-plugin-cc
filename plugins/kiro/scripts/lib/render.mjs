function listOrFallback(items, fallback = "unavailable") {
  return Array.isArray(items) && items.length > 0 ? items.join(", ") : fallback;
}

export function renderSetupReport(report) {
  const lines = [
    "Kiro Companion Setup",
    "",
    `Ready: ${report.ready ? "yes" : "no"}`,
    `Installed: ${report.installed ? "yes" : "no"}`,
    `Authenticated: ${report.loggedIn ? "yes" : "no"}`,
    `Version: ${report.version || "missing"}`,
    `User: ${report.whoami?.username || report.whoami?.email || "not signed in"}`,
    `Models: ${listOrFallback(report.models)}`
  ];

  if (!report.installed) {
    lines.push("Install Kiro CLI with: curl -fsSL https://cli.kiro.dev/install | bash");
  }

  if (report.installed && !report.loggedIn) {
    lines.push("Auto-login failed. Run manually: kiro-cli login");
  }

  return `${lines.join("\n")}\n`;
}

export function renderReviewReport(payload) {
  const lines = [
    `Review verdict: ${payload.verdict}`,
    "",
    `Summary: ${payload.summary}`,
    ""
  ];
  if (payload.findings.length === 0) {
    lines.push("Findings: none");
  } else {
    lines.push("Findings:");
    for (const finding of payload.findings) {
      const location = finding.file ? ` ${finding.file}${finding.line ? `:${finding.line}` : ""}` : "";
      lines.push(`- [${finding.severity}]${location} ${finding.title}`);
      lines.push(`  ${finding.details}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function renderRescueStartReport(job) {
  return `Started ${job.id}\n`;
}

export function renderStatusReport(report) {
  const lines = ["Kiro jobs", ""];
  for (const job of report.jobs) {
    lines.push(`- ${job.id} | ${job.command} | ${job.status} | ${job.updatedAt || job.createdAt}`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderResultReport(report) {
  return `Job: ${report.job.id}\nStatus: ${report.job.status}\n\n${report.logText}\n`;
}

export function renderCancelReport(report) {
  return `Cancelled ${report.job.id} (${report.job.failureReason})\n`;
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function truncate(str, max) {
  return str.length > max ? `${str.slice(0, max)}...` : str;
}

export function renderTasksReport(report) {
  if (report.active.length === 0) {
    return "No active kiro tasks.\n";
  }
  const lines = [`Kiro tasks (${report.active.length} active)`, ""];
  for (const job of report.active) {
    const elapsed = job.status === "running"
      ? formatElapsed(Date.now() - new Date(job.startedAt || job.createdAt).getTime())
      : "—";
    const summary = job.summary ? truncate(job.summary, 40) : "—";
    lines.push(`  ${job.id}  ${job.command}  ${job.status}  ${elapsed}  ${summary}`);
  }
  lines.push("", "Tips: /kiro:result <id> to view details, /kiro:cancel <id> to cancel");
  return `${lines.join("\n")}\n`;
}
