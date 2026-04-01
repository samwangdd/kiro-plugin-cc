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
    `User: ${report.whoami?.username || "not signed in"}`,
    `Models: ${listOrFallback(report.models)}`
  ];

  if (!report.installed) {
    lines.push("Install Kiro CLI with: curl -fsSL https://cli.kiro.dev/install | bash");
  }

  if (report.installed && !report.loggedIn) {
    lines.push("Authenticate with: kiro-cli login");
  }

  return `${lines.join("\n")}\n`;
}
