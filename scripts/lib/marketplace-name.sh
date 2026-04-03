#!/usr/bin/env bash
set -euo pipefail

resolve_marketplace_name_for_path() {
  local root_dir="$1"
  local fallback_name="$2"
  local current_name=""
  local current_source=""

  while IFS= read -r line; do
    if [[ "$line" =~ ^[[:space:]]*[❯]?[[:space:]]*([a-zA-Z0-9._-]+)[[:space:]]*$ ]]; then
      current_name="${BASH_REMATCH[1]}"
      current_source=""
      continue
    fi

    if [[ "$line" =~ Source:\ Directory\ \((.*)\)$ ]]; then
      current_source="${BASH_REMATCH[1]}"
      if [[ -n "$current_name" && "$current_source" == "$root_dir" ]]; then
        printf '%s\n' "$current_name"
        return 0
      fi
    fi
  done < <(claude plugin marketplace list 2>/dev/null || true)

  printf '%s\n' "$fallback_name"
}
