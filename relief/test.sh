#!/bin/bash
# Relief MCP Server — Integration Tests
# Sends JSON-RPC messages to the server via stdin and checks responses.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PASS=0
FAIL=0
RELIEF_DIR="$HOME/.claude/relief"
TEST_REPO="$(mktemp -d /tmp/relief-broker-XXXXXX)"

cleanup() {
  rm -rf "$TEST_REPO" 2>/dev/null || true
}

trap cleanup EXIT

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

send_messages_env() {
  local env_prefix="$1"
  shift
  (
    for msg in "$@"; do
      echo "$msg"
      sleep 0.3
    done
    sleep 1
  ) | env $env_prefix node dist/index.js 2>/dev/null
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

QUESTION_ID=$(echo "$OUTPUT4" | sed -n 's/.*Question posted (ID: \([a-f0-9-]*\)).*/\1/p' | head -1)
Q_ANSWER="{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"check_questions\",\"arguments\":{\"cwd\":\"/tmp/test-relief\",\"action\":\"answer\",\"question_id\":\"$QUESTION_ID\",\"answer\":\"Because it kept the invalidation logic local.\"}}}"
Q_READ_ANSWERED='{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"check_questions","arguments":{"cwd":"/tmp/test-relief","action":"read"}}}'

OUTPUT4B=$(send_messages "$INIT" "$Q_ANSWER" "$Q_READ_ANSWERED")
check "question answer confirmation" "$OUTPUT4B" "Answer posted for question"
check "answered question appears on read" "$OUTPUT4B" "Because it kept the invalidation logic local."

# --- Test 5: Session scoping on answers ---
echo ""
echo "Test 5: Question answers stay scoped to the active packet"

POST_OLD='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"post_relief","arguments":{"cwd":"/tmp/test-relief-scope","situation":"Original packet","mission":"Packet one","execution":"First handoff","admin_logistics":"N/A","command_signal":"N/A"}}}'
Q_POST_OLD='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"check_questions","arguments":{"cwd":"/tmp/test-relief-scope","action":"post","question":"Question from the first packet?"}}}'
OUTPUT5=$(send_messages "$INIT" "$POST_OLD" "$Q_POST_OLD")
OLD_SESSION_ID=$(echo "$OUTPUT5" | sed -n 's/.*Session ID: \([a-f0-9-]*\).*/\1/p' | head -1)
OLD_QUESTION_ID=$(echo "$OUTPUT5" | sed -n 's/.*Question posted (ID: \([a-f0-9-]*\)).*/\1/p' | head -1)

POST_NEW='{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"post_relief","arguments":{"cwd":"/tmp/test-relief-scope","situation":"Replacement packet","mission":"Packet two","execution":"Second handoff","admin_logistics":"N/A","command_signal":"N/A"}}}'
Q_ANSWER_WRONG="{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"check_questions\",\"arguments\":{\"cwd\":\"/tmp/test-relief-scope\",\"action\":\"answer\",\"question_id\":\"$OLD_QUESTION_ID\",\"answer\":\"This should be rejected.\"}}}"
Q_ANSWER_OLD_SESSION="{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"check_questions\",\"arguments\":{\"cwd\":\"/tmp/test-relief-scope\",\"action\":\"answer\",\"session_id\":\"$OLD_SESSION_ID\",\"question_id\":\"$OLD_QUESTION_ID\",\"answer\":\"This belongs to the first packet.\"}}}"
Q_READ_OLD_SESSION="{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"tools/call\",\"params\":{\"name\":\"check_questions\",\"arguments\":{\"cwd\":\"/tmp/test-relief-scope\",\"action\":\"read\",\"session_id\":\"$OLD_SESSION_ID\"}}}"

OUTPUT5B=$(send_messages "$INIT" "$POST_NEW" "$Q_ANSWER_WRONG" "$Q_ANSWER_OLD_SESSION" "$Q_READ_OLD_SESSION")
check "wrong-session answer rejected" "$OUTPUT5B" "does not belong to session"
check "explicit old-session answer succeeds" "$OUTPUT5B" "Answer posted for question"
check "old-session read shows explicit answer" "$OUTPUT5B" "This belongs to the first packet."

# --- Test 6: Questions require active packet ---
echo ""
echo "Test 6: Questions without packet"

Q_NO_PACKET='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"check_questions","arguments":{"cwd":"/tmp/nonexistent-relief-test","action":"post","question":"This should fail"}}}'

OUTPUT5=$(send_messages "$INIT" "$Q_NO_PACKET")
check "questions rejected without packet" "$OUTPUT5" "No active handoff"

# --- Test 7: Broker registration and workstream identity ---
echo ""
echo "Test 7: Broker registration"

git init -b main "$TEST_REPO" >/dev/null 2>&1
SESSION_A="test-sess-a-$$"
REG_A="{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"register_session\",\"arguments\":{\"cwd\":\"$TEST_REPO\",\"tool\":\"claude\",\"session_id\":\"$SESSION_A\"}}}"

OUTPUT7=$(send_messages "$INIT" "$REG_A")
check "register_session returns branch" "$OUTPUT7" "Branch: main"
check "register_session creates unambiguous workstream" "$OUTPUT7" "Ambiguous: no"
check "register_session returns workstate path" "$OUTPUT7" "WORKSTATE:"
if [ -f "$RELIEF_DIR/broker-state.json" ]; then
  echo "  PASS: broker-state source of truth created"
  PASS=$((PASS + 1))
else
  echo "  FAIL: broker-state source of truth created"
  FAIL=$((FAIL + 1))
fi

# --- Test 8: Same repo+branch ambiguity blocks auto/full-auto ---
echo ""
echo "Test 8: Same-branch ambiguity"

SESSION_B="test-sess-b-$$"
REG_B="{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"register_session\",\"arguments\":{\"cwd\":\"$TEST_REPO\",\"tool\":\"claude\",\"session_id\":\"$SESSION_B\"}}}"
SHOW_A="{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"workstream_control\",\"arguments\":{\"action\":\"show\",\"session_id\":\"$SESSION_A\"}}}"
MODE_AUTO_A="{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"set_relief_mode\",\"arguments\":{\"session_id\":\"$SESSION_A\",\"mode\":\"auto\"}}}"

OUTPUT8=$(send_messages "$INIT" "$REG_B" "$SHOW_A" "$MODE_AUTO_A")
check "second unnamed session makes workstream ambiguous" "$OUTPUT8" "Ambiguous: yes"
check "ambiguous workstream blocks auto mode" "$OUTPUT8" "before enabling auto"

# --- Test 9: Naming resolves ambiguity and allows auto mode ---
echo ""
echo "Test 9: Named workstream resolves ambiguity"

NAME_B="{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"workstream_control\",\"arguments\":{\"action\":\"set_name\",\"session_id\":\"$SESSION_B\",\"workstream_name\":\"frontend-fix\"}}}"
MODE_AUTO_B="{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"tools/call\",\"params\":{\"name\":\"set_relief_mode\",\"arguments\":{\"session_id\":\"$SESSION_B\",\"mode\":\"auto\"}}}"
SHOW_B="{\"jsonrpc\":\"2.0\",\"id\":8,\"method\":\"tools/call\",\"params\":{\"name\":\"workstream_control\",\"arguments\":{\"action\":\"show\",\"session_id\":\"$SESSION_B\"}}}"

OUTPUT9=$(send_messages "$INIT" "$NAME_B" "$MODE_AUTO_B" "$SHOW_B")
check "set_name moves session to named workstream" "$OUTPUT9" "frontend-fix"
check "named workstream allows auto mode" "$OUTPUT9" "is now auto"
check "named workstream remains unambiguous" "$OUTPUT9" "Ambiguous: no"

# --- Test 10: Protected-phase gating and approved checkpoints ---
echo ""
echo "Test 10: Protected-phase gating"

PHASE_START="{\"jsonrpc\":\"2.0\",\"id\":9,\"method\":\"tools/call\",\"params\":{\"name\":\"phase_control\",\"arguments\":{\"session_id\":\"$SESSION_B\",\"action\":\"start\",\"phase\":\"build\"}}}"
DRY_BLOCK="{\"jsonrpc\":\"2.0\",\"id\":10,\"method\":\"tools/call\",\"params\":{\"name\":\"spawn_successor\",\"arguments\":{\"session_id\":\"$SESSION_B\",\"dry_run\":true}}}"
CHECKPOINT_OK="{\"jsonrpc\":\"2.0\",\"id\":11,\"method\":\"tools/call\",\"params\":{\"name\":\"phase_control\",\"arguments\":{\"session_id\":\"$SESSION_B\",\"action\":\"checkpoint\",\"checkpoint_type\":\"micro_task_closed\"}}}"
DRY_ALLOW="{\"jsonrpc\":\"2.0\",\"id\":12,\"method\":\"tools/call\",\"params\":{\"name\":\"spawn_successor\",\"arguments\":{\"session_id\":\"$SESSION_B\",\"dry_run\":true}}}"

OUTPUT10=$(send_messages "$INIT" "$PHASE_START" "$DRY_BLOCK" "$CHECKPOINT_OK" "$DRY_ALLOW")
check "protected phase starts" "$OUTPUT10" "Protected phase build started"
check "handoff blocked mid-build before checkpoint" "$OUTPUT10" "Handoff blocked"
check "approved checkpoint accepted" "$OUTPUT10" "Approved checkpoint micro_task_closed"
check "handoff allowed after approved checkpoint" "$OUTPUT10" "Handoff allowed"

# --- Test 11: tmux absence is graceful ---
echo ""
echo "Test 11: tmux absence"

SPAWN_REAL="{\"jsonrpc\":\"2.0\",\"id\":13,\"method\":\"tools/call\",\"params\":{\"name\":\"spawn_successor\",\"arguments\":{\"session_id\":\"$SESSION_B\"}}}"
OUTPUT11=$(send_messages "$INIT" "$SPAWN_REAL")
check "spawn_successor degrades cleanly without tmux" "$OUTPUT11" "tmux is not available"

# --- Test 12: Shared workstate and broker messages ---
echo ""
echo "Test 12: Shared workstate and broker messages"

WORKSTATE_WRITE="{\"jsonrpc\":\"2.0\",\"id\":14,\"method\":\"tools/call\",\"params\":{\"name\":\"workstream_control\",\"arguments\":{\"action\":\"write_workstate\",\"session_id\":\"$SESSION_B\",\"content\":\"# WORKSTATE\\n\\n## Objective\\nShip broker v2\\n\\n## Status\\nIn progress\\n\"}}}"
WORKSTATE_READ="{\"jsonrpc\":\"2.0\",\"id\":15,\"method\":\"tools/call\",\"params\":{\"name\":\"workstream_control\",\"arguments\":{\"action\":\"read_workstate\",\"session_id\":\"$SESSION_B\"}}}"
MESSAGE_POST="{\"jsonrpc\":\"2.0\",\"id\":16,\"method\":\"tools/call\",\"params\":{\"name\":\"relay_message\",\"arguments\":{\"session_id\":\"$SESSION_B\",\"action\":\"post\",\"type\":\"note\",\"body\":\"Need clarity on retry policy.\"}}}"
MESSAGE_READ="{\"jsonrpc\":\"2.0\",\"id\":17,\"method\":\"tools/call\",\"params\":{\"name\":\"relay_message\",\"arguments\":{\"session_id\":\"$SESSION_B\",\"action\":\"read\"}}}"

OUTPUT12=$(send_messages "$INIT" "$WORKSTATE_WRITE" "$WORKSTATE_READ" "$MESSAGE_POST" "$MESSAGE_READ")
check "workstate write succeeds" "$OUTPUT12" "WORKSTATE updated at"
check "workstate read returns content" "$OUTPUT12" "Ship broker v2"
check "relay_message post succeeds" "$OUTPUT12" "Message posted"
check "relay_message read returns note" "$OUTPUT12" "Need clarity on retry policy."

# --- Test 13: Stale sessions are reaped before ambiguity spreads ---
echo ""
echo "Test 13: Stale session reaping"

TEST_REPO2="$(mktemp -d /tmp/relief-broker-stale-XXXXXX)"
git init -b main "$TEST_REPO2" >/dev/null 2>&1
STALE_A="stale-a-$$"
STALE_B="stale-b-$$"
REG_STALE_A="{\"jsonrpc\":\"2.0\",\"id\":18,\"method\":\"tools/call\",\"params\":{\"name\":\"register_session\",\"arguments\":{\"cwd\":\"$TEST_REPO2\",\"tool\":\"claude\",\"session_id\":\"$STALE_A\"}}}"
OUTPUT13A=$(send_messages "$INIT" "$REG_STALE_A")
check "initial stale test registration works" "$OUTPUT13A" "Session ID: $STALE_A"

python3 - <<PY
import json, os
path = os.path.expanduser("~/.claude/relief/sessions.json")
with open(path, "r", encoding="utf-8") as fh:
    data = json.load(fh)
data["$STALE_A"]["last_heartbeat_at"] = "2000-01-01T00:00:00.000Z"
data["$STALE_A"]["status"] = "active"
with open(path, "w", encoding="utf-8") as fh:
    json.dump(data, fh, indent=2)
    fh.write("\n")
PY

REG_STALE_B="{\"jsonrpc\":\"2.0\",\"id\":19,\"method\":\"tools/call\",\"params\":{\"name\":\"register_session\",\"arguments\":{\"cwd\":\"$TEST_REPO2\",\"tool\":\"claude\",\"session_id\":\"$STALE_B\"}}}"
OUTPUT13B=$(send_messages_env "RELIEF_STALE_SESSION_MS=1" "$INIT" "$REG_STALE_B")
check "stale session is reaped before new ambiguity" "$OUTPUT13B" "Ambiguous: no"
rm -rf "$TEST_REPO2" 2>/dev/null || true

# --- Test 14: Corrupt JSONL lines do not break reads ---
echo ""
echo "Test 14: Corrupt JSONL tolerance"

python3 - <<'PY'
from pathlib import Path
path = Path.home() / ".claude" / "relief" / "messages.jsonl"
path.parent.mkdir(parents=True, exist_ok=True)
with path.open("a", encoding="utf-8") as fh:
    fh.write("{not valid json}\n")
PY
MESSAGE_READ_AGAIN="{\"jsonrpc\":\"2.0\",\"id\":20,\"method\":\"tools/call\",\"params\":{\"name\":\"relay_message\",\"arguments\":{\"session_id\":\"$SESSION_B\",\"action\":\"read\"}}}"
OUTPUT14=$(send_messages "$INIT" "$MESSAGE_READ_AGAIN")
check "corrupt message line is skipped" "$OUTPUT14" "Need clarity on retry policy."

# --- Test 15: JSONL rotation keeps broker files bounded ---
echo ""
echo "Test 15: JSONL rotation"

ROTATE1="{\"jsonrpc\":\"2.0\",\"id\":21,\"method\":\"tools/call\",\"params\":{\"name\":\"relay_message\",\"arguments\":{\"session_id\":\"$SESSION_B\",\"action\":\"post\",\"type\":\"note\",\"body\":\"rotation-1\"}}}"
ROTATE2="{\"jsonrpc\":\"2.0\",\"id\":22,\"method\":\"tools/call\",\"params\":{\"name\":\"relay_message\",\"arguments\":{\"session_id\":\"$SESSION_B\",\"action\":\"post\",\"type\":\"note\",\"body\":\"rotation-2\"}}}"
ROTATE3="{\"jsonrpc\":\"2.0\",\"id\":23,\"method\":\"tools/call\",\"params\":{\"name\":\"relay_message\",\"arguments\":{\"session_id\":\"$SESSION_B\",\"action\":\"post\",\"type\":\"note\",\"body\":\"rotation-3\"}}}"
send_messages_env "RELIEF_JSONL_MAX_LINES=2 RELIEF_JSONL_KEEP_LINES=1" "$INIT" "$ROTATE1" "$ROTATE2" "$ROTATE3" >/dev/null
ARCHIVE_COUNT=$(find "$RELIEF_DIR" -maxdepth 1 -name 'messages.jsonl.*.archive' | wc -l | tr -d ' ')
if [ "${ARCHIVE_COUNT:-0}" -gt 0 ]; then
  echo "  PASS: message log rotation created archive"
  PASS=$((PASS + 1))
else
  echo "  FAIL: message log rotation created archive"
  FAIL=$((FAIL + 1))
fi

# --- Cleanup ---
echo ""
echo "Cleaning up test files..."
rm -f "$RELIEF_DIR"/test-relief-*.json "$RELIEF_DIR"/test-relief-*-questions.jsonl 2>/dev/null || true
rm -f "$RELIEF_DIR"/test-relief-scope-*.json "$RELIEF_DIR"/test-relief-scope-*-questions.jsonl 2>/dev/null || true
rm -f "$RELIEF_DIR"/nonexistent-relief-test-*.json 2>/dev/null || true
rm -f "$RELIEF_DIR"/messages.jsonl.*.archive 2>/dev/null || true

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
