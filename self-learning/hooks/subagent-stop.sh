#!/bin/bash
# SubagentStop hook: Quality gate for subagent results.
# Three checks:
#   1. Substance — rejects empty/thin results (< 80 chars)
#   2. Garbage — rejects status-only messages ("Done", "Completed")
#   3. Verification — rejects deliverable-producing agents that don't verify output
#
# Exit 0 = accept. Exit 2 = reject and send feedback to agent.

INPUT=$(cat)

# Extract last_assistant_message from the JSON payload
MESSAGE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    msg = data.get('last_assistant_message', '')
    print(msg)
except:
    print('')
" 2>/dev/null)

# If we couldn't parse anything, let it through
if [ -z "$MESSAGE" ]; then
    exit 0
fi

# ─── CHECK 1: Substance (thin results) ──────────────────────────
CHAR_COUNT=$(echo "$MESSAGE" | tr -d '[:space:]' | wc -c | tr -d '[:space:]')

if [ "$CHAR_COUNT" -lt 80 ]; then
    echo "Your result was too thin (${CHAR_COUNT} chars). The task asked for substantive output. Re-examine what was requested and provide complete, detailed results. Do not return a status word — return the actual work product." >&2
    exit 2
fi

# ─── CHECK 2: Garbage (status-only messages) ─────────────────────
GARBAGE=$(echo "$MESSAGE" | python3 -c "
import sys
msg = sys.stdin.read().strip().lower()
garbage_phrases = [
    'done', 'completed', 'finished', 'task complete',
    'i have completed', 'the task is done', 'analysis complete',
    'i have finished', 'work is complete', 'all done',
    'i was unable to', 'i could not', 'i cannot'
]
clean = msg.rstrip('.!').strip()
for phrase in garbage_phrases:
    if clean == phrase or clean.startswith(phrase + '.') or clean.startswith(phrase + ','):
        if len(msg) < 200:
            print('GARBAGE')
            sys.exit(0)
print('OK')
" 2>/dev/null)

if [ "$GARBAGE" = "GARBAGE" ]; then
    echo "Your result was just a status message, not actual work output. Go back and complete the task — return the research, analysis, code, or findings that were requested." >&2
    exit 2
fi

# ─── CHECK 3: Verification (did agent check its own work?) ───────
# Only applies to agents that produced a deliverable (file, doc, build).
# If the result mentions creating/writing/saving a file but has NO
# verification evidence, reject it.

VERIFY_RESULT=$(echo "$MESSAGE" | python3 -c "
import sys, re

msg = sys.stdin.read()
msg_lower = msg.lower()

# Did the agent produce a deliverable?
deliverable_signals = [
    'saved to', 'written to', 'wrote to', 'created file',
    'output file', 'generated', '.docx', '.pdf', '.html',
    '.txt', '.csv', '.json', '.xlsx', 'document built',
    'file has been', 'wrote the file'
]
produced_deliverable = any(s in msg_lower for s in deliverable_signals)

if not produced_deliverable:
    # Not a deliverable task — skip verification check
    print('SKIP')
    sys.exit(0)

# Did the agent verify its work?
verification_signals = [
    'verified', 'confirmed', 'validated', 'checked',
    'inspected', 'reviewed the output', 'opened the file',
    'rendered', 'tested', 'spot-check', 'looks correct',
    'matches the spec', 'columns align', 'formatting is',
    'page count', 'line count', 'file size',
    'xml inspection', 'parsed and confirmed',
    'screenshot', 'visual check', 'rendered to pdf',
    'all .* confirmed present', 'bookmarks.*confirmed',
    'hyperlinks.*confirmed', 'verified via'
]
has_verification = any(re.search(s, msg_lower) for s in verification_signals)

if not has_verification:
    print('NO_VERIFY')
else:
    print('OK')
" 2>/dev/null)

if [ "$VERIFY_RESULT" = "NO_VERIFY" ]; then
    echo "You produced a deliverable but did NOT verify your output. Before returning, you MUST:
1. Open/read the file you created
2. Check that it renders correctly (formatting, alignment, content)
3. Spot-check at least 3 specific items against the spec
4. Report what you verified and what it looked like

Do not return until you have verified your work." >&2
    exit 2
fi

# All checks passed
exit 0
