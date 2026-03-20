#!/bin/bash
# Self-improvement system: SessionStart hook
# 1. MCP health check — verify stdio MCP servers can start
# 2. Surfaces learnings with Recurrence-Count >= 3 that haven't been promoted yet.
# Silent when no flagged learnings or file doesn't exist.

# --- MCP health check ---
MCP_CONFIG="$HOME/.mcp.json"
if [ -f "$MCP_CONFIG" ]; then
    # Extract stdio MCP servers (those with "command", not "url") and test them
    python3 -c "
import json, subprocess, sys
with open('$MCP_CONFIG') as f:
    cfg = json.load(f)
failed = []
for name, srv in cfg.get('mcpServers', {}).items():
    if 'command' not in srv:
        continue  # skip HTTP-based servers
    cmd = [srv['command']] + srv.get('args', [])
    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={**__import__('os').environ, **srv.get('env', {})}
        )
        # Send MCP initialize handshake
        init = '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{},\"clientInfo\":{\"name\":\"healthcheck\",\"version\":\"1.0\"}}}'
        try:
            out, err = proc.communicate(input=init.encode(), timeout=5)
            if b'jsonrpc' not in out and proc.returncode != 0:
                failed.append(f'{name}: exit code {proc.returncode}, stderr: {err.decode()[:200]}')
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
            # Timeout = server is running and waiting for more input = healthy
        except Exception as e:
            failed.append(f'{name}: {e}')
    except FileNotFoundError:
        failed.append(f'{name}: command not found: {srv[\"command\"]}')
    except Exception as e:
        failed.append(f'{name}: {e}')
if failed:
    print('MCP health check FAILED:')
    for f in failed:
        print(f'  - {f}')
    print('Fix ~/.mcp.json or run the server manually to debug.')
" 2>/dev/null
fi

# Auto-detect the home-project memory directory (the one scoped to ~/)
# Claude Code creates project scopes based on directory paths. The home scope
# uses a mangled version of the home directory path (e.g., -Users-username).
HOME_MANGLED=$(echo "$HOME" | sed 's|/|-|g')
MEMORY_DIR="$HOME/.claude/projects/$HOME_MANGLED/memory"
if [ ! -d "$MEMORY_DIR" ]; then
    # Fallback: find any memory directory under projects
    MEMORY_DIR=$(find "$HOME/.claude/projects" -type d -name "memory" 2>/dev/null | head -1)
fi
if [ -z "$MEMORY_DIR" ] || [ ! -d "$MEMORY_DIR" ]; then exit 0; fi
LEARNINGS="$MEMORY_DIR/learnings.md"
LEDGER="$MEMORY_DIR/reflect-usage.json"

if [ ! -f "$LEARNINGS" ]; then exit 0; fi

# Find pending entries with Recurrence-Count >= 3, sort by promotion candidacy
FLAGGED=$(python3 -c "
import sys
entries = []
current = None
in_code_block = False
with open('$LEARNINGS') as f:
    for line in f:
        stripped = line.strip()
        if len(stripped) >= 3 and stripped[:3] == chr(96)*3:
            in_code_block = not in_code_block
            continue
        if in_code_block:
            continue
        if line.startswith('## [LRN-'):
            if current and current.get('count',0) >= 3 and current.get('status') == 'pending':
                entries.append(current)
            current = {'key': line.strip().split('] ')[1] if '] ' in line else '?'}
        if current:
            if line.startswith('**Recurrence-Count**:'):
                try: current['count'] = int(line.split(':',1)[1].strip().rstrip('+'))
                except: pass
            if line.startswith('**Status**:'):
                current['status'] = line.split(':',1)[1].strip().split()[0]
            if line.startswith('**Score**:'):
                score_part = line.split('(Total:')
                if len(score_part) > 1:
                    try: current['total'] = int(score_part[1].strip().rstrip(')'))
                    except: current['total'] = 0
                if 'D=' in line:
                    try: current['durability'] = int(line.split('D=')[1][0])
                    except: current['durability'] = 0
            if line.startswith('### Summary'):
                current['reading_summary'] = True
            elif current.get('reading_summary') and line.strip():
                current['summary'] = line.strip()
                current['reading_summary'] = False
if current and current.get('count',0) >= 3 and current.get('status') == 'pending':
    entries.append(current)
def sort_key(e):
    promotable = 1 if e.get('total',0) >= 6 and e.get('durability',0) >= 2 else 0
    return (promotable, e.get('count',0), e.get('total',0))
entries.sort(key=sort_key, reverse=True)
for e in entries[:3]:
    tag = ' *PROMOTE*' if e.get('total',0) >= 6 and e.get('durability',0) >= 2 else ''
    print(f\"[{e.get('key','?')}] (x{e.get('count',0)}) {e.get('summary','')}{tag}\")
" 2>/dev/null)

if [ -n "$FLAGGED" ]; then
    echo "Recurring learnings awaiting review:"
    echo "$FLAGGED"
    echo "Run /reflect --review to see details."
fi

# Phase 2 readiness check (one-time prompt)
if [ -f "$LEDGER" ]; then
    python3 -c "
import json, sys
from datetime import datetime, timedelta
with open('$LEDGER') as f:
    d = json.load(f)
if d.get('phase2_prompted'): sys.exit(0)
learnings = d.get('learnings_captured', 0)
sessions = len(set(d.get('sessions_used', [])))
promotions = d.get('promotions', 0)
deployed = datetime.strptime(d.get('first_deployed','2099-01-01'), '%Y-%m-%d')
weeks = (datetime.now() - deployed).days / 7
if learnings >= 10 and promotions >= 2 and sessions >= 10 and weeks >= 2:
    print('Phase 1 mature. Run /reflect --phase2-check for details.')
    d['phase2_prompted'] = True
    with open('$LEDGER', 'w') as f:
        json.dump(d, f, indent=2)
" 2>/dev/null
fi
