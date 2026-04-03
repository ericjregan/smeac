#!/bin/bash
# Hook: UserPromptSubmit — detect bug reports and inject rule enforcement
# Forces Claude to investigate code before suggesting browser/env fixes
#
# The problem: Claude has rules telling it not to blame the browser.
# Claude ignores those rules. This hook makes it impossible to ignore
# by injecting the rules directly into the conversation context.
#
# Install: Add to settings.json under hooks.UserPromptSubmit
# Can coexist with no-guessing.sh — they catch different patterns.

INPUT=$(cat)
MESSAGE=$(echo "$INPUT" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    msg = data.get('message', '').lower()
    print(msg)
except:
    print('')
" 2>/dev/null)

IS_BUG_REPORT=$(echo "$MESSAGE" | python3 -c "
import sys, re
msg = sys.stdin.read().strip()
patterns = [
    r'\bnot working\b',
    r'\bbroken\b',
    r'\bdoesn.t work\b',
    r'\bnot showing\b',
    r'\bnot see\b',
    r'\bdon.t see\b',
    r'\bnothing happens\b',
    r'\bnot there\b',
    r'\bit.s not\b',
    r'\bstill broken\b',
    r'\bstill not\b',
    r'\bnot visib\b',
    r'\bnot appear\b',
    r'\bdisappear\b',
    r'\bnot fixed\b',
]
for p in patterns:
    if re.search(p, msg):
        print('yes')
        sys.exit(0)
print('no')
" 2>/dev/null)

if [ "$IS_BUG_REPORT" = "yes" ]; then
    # Inject relevant rules directly — Claude can't skip what's in the prompt
    RULES=""
    RULES_DIR="${HOME}/.claude/rules"
    for f in "$RULES_DIR"/never-blame-browser.md \
             "$RULES_DIR"/never-blame-delivery.md; do
        if [ -f "$f" ]; then
            RULES="$RULES
---
$(cat "$f")"
        fi
    done

    cat <<EOF
BUG REPORT DETECTED. MANDATORY INVESTIGATION BEFORE RESPONDING:

1. Trace the code path from user action to expected behavior
2. Read the relevant source files
3. Reproduce in Playwright or via API (do NOT ask the user to test)
4. Identify the actual code bug with evidence
5. NEVER suggest cache/refresh/browser/hard-reload/incognito as a fix

The code is wrong until proven otherwise. Investigate first, respond second.
${RULES}
EOF
fi
