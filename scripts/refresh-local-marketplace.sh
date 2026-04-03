#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FALLBACK_MARKETPLACE_NAME="$(node -p "require('./.claude-plugin/marketplace.json').name")"

source "${ROOT_DIR}/scripts/lib/marketplace-name.sh"

BUMP_OUTPUT="$(node "${ROOT_DIR}/scripts/bump-local-plugin-version.mjs")"
echo "${BUMP_OUTPUT}"

MARKETPLACE_NAME="$(resolve_marketplace_name_for_path "${ROOT_DIR}" "${FALLBACK_MARKETPLACE_NAME}")"

echo "Refreshing local marketplace: ${MARKETPLACE_NAME}"
claude plugin marketplace update "${MARKETPLACE_NAME}"

cat <<'EOF'

Marketplace refresh finished.
Next steps:
1. In Claude Code, run: /reload-plugins
2. Verify the updated plugin with: /kiro:setup
EOF
