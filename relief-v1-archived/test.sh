#!/bin/bash
# Relief MCP Server — Integration Tests
# Sends JSON-RPC messages to the server via stdin and checks responses.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PASS=0
FAIL=0
RELIEF_DIR="$HOME/.claude/relief"

send_messages() {
  # Send multiple JSON-RPC messages to the server, each on its own line
  # The server reads from stdin continuously
  (
    for msg in "$@"; do
      echo "$msg"
      sleep 0.3
    done
    sleep 1
  ) | node dist/index.js 2>/dev/null
}

check() {
  local desc="$1"
  local output="$2"
  local pattern="$3"

  if echo "$output" | grep -q "$pattern"; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (expected pattern: $pattern)"
    echo "  Got: $(echo "$output" | head -3)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Relief MCP Server Tests ==="
echo ""

# --- Test 1: Happy path (post_relief → assume_watch) ---
echo "Test 1: Happy path — post and assume"

INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
POST='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"post_relief","arguments":{"cwd":"/tmp/test-relief","situation":"On branch main, 3 files modified","mission":"Build the widget feature","execution":"Tasks 1-3 done, task 4 next","admin_logistics":"PORT=3000, DB_URL set","command_signal":"Need decision on caching strategy"}}}'
ASSUME='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"assume_watch","arguments":{"cwd":"/tmp/test-relief"}}}'

OUTPUT=$(send_messages "$INIT" "$POST" "$ASSUME")

check "post_relief returns session ID" "$OUTPUT" "Session ID:"
check "post_relief confirms save" "$OUTPUT" "Relief posted"
check "assume_watch returns SITUATION" "$OUTPUT" "SITUATION"
check "assume_watch returns MISSION" "$OUTPUT" "Build the widget feature"
check "assume_watch returns COMMAND/SIGNAL" "$OUTPUT" "caching strategy"

# --- Test 2: Key canonicalization (trailing slash) ---
echo ""
echo "Test 2: Key canonicalization"

POST2='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"post_relief","arguments":{"cwd":"/tmp/test-relief/","situation":"Trailing slash test","mission":"Same dir different path","execution":"Should overwrite","admin_logistics":"N/A","command_signal":"N/A"}}}'
ASSUME2='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"assume_watch","arguments":{"cwd":"/tmp/test-relief"}}}'

OUTPUT2=$(send_messages "$INIT" "$POST2" "$ASSUME2")
check "trailing slash maps to same key" "$OUTPUT2" "Trailing slash test"

# --- Test 3: Missing handoff ---
echo ""
echo "Test 3: Missing handoff"

ASSUME_MISSING='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"assume_watch","arguments":{"cwd":"/tmp/nonexistent-relief-test"}}}'

OUTPUT3=$(send_messages "$INIT" "$ASSUME_MISSING")
check "assume_watch returns no-handoff message" "$OUTPUT3" "No handoff available"

# --- Test 4: Questions (post → read → answer → read) ---
echo ""
echo "Test 4: Questions flow"

Q_POST='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"check_questions","arguments":{"cwd":"/tmp/test-relief","action":"post","question":"Why did you choose that caching approach?"}}}'
Q_READ='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"check_questions","arguments":{"cwd":"/tmp/test-relief","action":"read"}}}'

OUTPUT4=$(send_messages "$INIT" "$Q_POST" "$Q_READ")
check "question posted confirmation" "$OUTPUT4" "Question posted"
check "question appears on read" "$OUTPUT4" "caching approach"

# --- Test 5: Questions require active packet ---
echo ""
echo "Test 5: Questions without packet"

Q_NO_PACKET='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"check_questions","arguments":{"cwd":"/tmp/nonexistent-relief-test","action":"post","question":"This should fail"}}}'

OUTPUT5=$(send_messages "$INIT" "$Q_NO_PACKET")
check "questions rejected without packet" "$OUTPUT5" "No active handoff"

# --- Cleanup ---
echo ""
echo "Cleaning up test files..."
rm -f "$RELIEF_DIR"/test-relief-*.json "$RELIEF_DIR"/test-relief-*-questions.jsonl 2>/dev/null || true
rm -f "$RELIEF_DIR"/nonexistent-relief-test-*.json 2>/dev/null || true

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
