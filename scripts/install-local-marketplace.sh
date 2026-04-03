#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FALLBACK_MARKETPLACE_NAME="$(node -p "require('./.claude-plugin/marketplace.json').name")"
PLUGIN_NAME="kiro"

source "${ROOT_DIR}/scripts/lib/marketplace-name.sh"

echo "Adding local marketplace from: ${ROOT_DIR}"
claude plugin marketplace add "${ROOT_DIR}" --scope user

MARKETPLACE_NAME="$(resolve_marketplace_name_for_path "${ROOT_DIR}" "${FALLBACK_MARKETPLACE_NAME}")"

echo "Installing plugin: ${PLUGIN_NAME}@${MARKETPLACE_NAME}"
claude plugin install "${PLUGIN_NAME}@${MARKETPLACE_NAME}"

cat <<'EOF'

Local install finished.
Next steps:
1. In Claude Code, run: /reload-plugins
2. Verify with: /kiro:setup
EOF
