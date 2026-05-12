#!/usr/bin/env bash
# Run SQL against Supabase remote DB via Management API.
# Falls back to this path when `supabase db push` can't connect (IPv6 TLS issue).
#
# Usage:
#   scripts/supabase-query.sh "SELECT * FROM reading_topics LIMIT 3;"
#   scripts/supabase-query.sh < supabase/migrations/042_something.sql
#   cat some.sql | scripts/supabase-query.sh
#
# Requires: SUPABASE_ACCESS_TOKEN in .env.local

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi

# Source .env.local to get SUPABASE_ACCESS_TOKEN
set -a
source "$ENV_FILE"
set +a

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN not set in $ENV_FILE" >&2
  exit 1
fi

PROJECT_REF="vwgeqttanuleaobrtrwv"
API_URL="https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query"

SQL=""
if [[ $# -ge 1 ]]; then
  SQL="$1"
elif [[ ! -t 0 ]]; then
  SQL="$(cat)"
fi

if [[ -z "$SQL" ]]; then
  echo "ERROR: no SQL provided (arg or stdin)" >&2
  echo "Usage: scripts/supabase-query.sh <sql>   OR   scripts/supabase-query.sh < file.sql" >&2
  exit 1
fi

# JSON-escape the SQL for the request body
BODY=$(python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" <<< "$SQL")

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 300 ]]; then
  # Pretty-print JSON array; handle empty array gracefully
  if [[ "$BODY" == "[]" ]]; then
    echo "OK (0 rows)"
  else
    echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  fi
else
  echo "ERROR (HTTP $HTTP_CODE):" >&2
  echo "$BODY" >&2
  exit 1
fi
