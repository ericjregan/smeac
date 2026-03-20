#!/bin/bash
# Hook: UserPromptSubmit — detect diagnostic questions and inject investigation reminder
# Prevents Claude from guessing when the answer is findable

# Read the user's message from stdin
INPUT=$(cat)

# Extract the user's message content
MESSAGE=$(echo "$INPUT" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    msg = data.get('message', '').lower()
    print(msg)
except:
    print('')
" 2>/dev/null)

# Check for diagnostic question patterns
IS_DIAGNOSTIC=$(echo "$MESSAGE" | python3 -c "
import sys, re
msg = sys.stdin.read().strip()
patterns = [
    r'\bwhy\b.*\b(is|are|did|does|do|was|were|happen|broke|break|fail|show|appear|leak)\b',
    r'\bhow did\b',
    r'\bwhat happened\b',
    r'\bwhat.s wrong\b',
    r'\bwhat caused\b',
    r'\bwhere.* coming from\b',
    r'\bkeep.*(getting|showing|appearing|happening)\b',
    r'\bstill.*(showing|appearing|happening|broken)\b',
]
for p in patterns:
    if re.search(p, msg):
        print('yes')
        sys.exit(0)
print('no')
" 2>/dev/null)

if [ "$IS_DIAGNOSTIC" = "yes" ]; then
    echo "DIAGNOSTIC QUESTION DETECTED — INVESTIGATE BEFORE ANSWERING. Read the code. Query the data. Grep for evidence. Do NOT present theories. Find the root cause, then report facts."
fi
