#!/bin/bash
# Self-improvement system: Stop hook
# Generic reminder to capture learnings. Non-blocking.
# Silence with: touch ~/.claude/.reflect-quiet

if [ -f "$HOME/.claude/.reflect-quiet" ]; then exit 0; fi
echo "Session ending. If there were corrections worth capturing, run /reflect."
