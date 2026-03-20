#!/bin/bash
set -euo pipefail

# Convergence Loop Installer
# Copies commands to ~/.claude/commands/ and configures Codex MCP bridge

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
COMMANDS_DIR="$CLAUDE_DIR/commands"
TMP_DIR="$CLAUDE_DIR/tmp"
MCP_FILE="$HOME/.mcp.json"

echo "=== Convergence Loop Installer ==="
echo ""

# Check prerequisites
if ! command -v claude &> /dev/null; then
    echo "ERROR: Claude Code CLI not found. Install it first."
    exit 1
fi

if ! command -v codex &> /dev/null; then
    echo "ERROR: Codex CLI not found. Install with: npm install -g @openai/codex"
    exit 1
fi

echo "Prerequisites OK: claude $(claude --version 2>/dev/null || echo '(version unknown)'), codex $(codex --version 2>/dev/null || echo '(version unknown)')"
echo ""

# Create directories
mkdir -p "$COMMANDS_DIR"
mkdir -p "$TMP_DIR"
echo "Directories: $COMMANDS_DIR, $TMP_DIR"

# Copy command files
COMMANDS=(planaz build converge conductor audit codex)
for cmd in "${COMMANDS[@]}"; do
    if [ -f "$COMMANDS_DIR/$cmd.md" ]; then
        echo "  Backing up existing $cmd.md -> $cmd.md.bak"
        cp "$COMMANDS_DIR/$cmd.md" "$COMMANDS_DIR/$cmd.md.bak"
    fi
    cp "$SCRIPT_DIR/commands/$cmd.md" "$COMMANDS_DIR/$cmd.md"
    echo "  Installed /$cmd"
done
echo ""

# Add Codex MCP server to .mcp.json
# NOTE: This uses --dangerously-bypass-approvals-and-sandbox so Codex can read files
# and run tests without prompting. Codex is the AUDITOR — it reads, it doesn't write.
# Claude always declines if Codex asks to edit files.
echo ""
echo "WARNING: The Codex MCP bridge uses --dangerously-bypass-approvals-and-sandbox"
echo "so Codex can read files and run tests during audits without prompting."
echo "Codex is the auditor — it reads and reports. Claude applies fixes."
echo ""
read -p "Configure Codex MCP in $MCP_FILE? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f "$MCP_FILE" ]; then
        if python3 -c "import json; d=json.load(open('$MCP_FILE')); assert 'codex' in d.get('mcpServers', {})" 2>/dev/null; then
            echo "Codex MCP: already configured in $MCP_FILE"
        else
            echo "Codex MCP: adding to existing $MCP_FILE"
            python3 -c "
import json
with open('$MCP_FILE', 'r') as f:
    config = json.load(f)
if 'mcpServers' not in config:
    config['mcpServers'] = {}
config['mcpServers']['codex'] = {
    'command': 'codex',
    'args': ['--dangerously-bypass-approvals-and-sandbox', 'mcp-server']
}
with open('$MCP_FILE', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
"
        fi
    else
        echo "Codex MCP: creating $MCP_FILE"
        cat > "$MCP_FILE" << 'MCPEOF'
{
  "mcpServers": {
    "codex": {
      "command": "codex",
      "args": ["--dangerously-bypass-approvals-and-sandbox", "mcp-server"]
    }
  }
}
MCPEOF
    fi
else
    echo "Skipped Codex MCP configuration. You can add it manually later."
    echo "See convergence/CONVERGENCE.md for the MCP bridge setup."
fi

echo ""
echo "=== Done ==="
echo ""
echo "Restart Claude Code to pick up the changes."
echo ""
echo "Commands installed:"
echo "  /planaz    Plan A-to-Z with Codex convergence loop"
echo "  /build     Build from plan with Codex convergence loop"
echo "  /converge  Standalone convergence loop (called by planaz/build)"
echo "  /conductor Conductor framework (micro-tasking protocol)"
echo "  /audit     Reliability push audit"
echo "  /codex     Manual Codex prompt generator"
