#!/bin/bash
# Hook: PreToolUse on Agent — gate plan-driven implementation dispatches
#
# Purpose: When a subagent is dispatched with a description matching plan-driven
# implementation patterns (e.g., "Task 2: Add schema field" or "Phase 1 Task 5:
# Apply migration"), require a .phase-gate.yaml state file in the working
# directory showing audit + convergence + user approval all passed.
#
# Why: Claude's global system prompt is too large to reliably enforce
# "audit before build" via memory. This hook makes the rule mechanical:
# implementation-pattern dispatches without a passed gate file are denied.
#
# Escape hatch: name the dispatch something that doesn't match the
# implementation pattern (e.g., "Fix the bug in X" instead of "Task 1: Fix X").
# Ad-hoc work doesn't need the gate; plan-driven work does.

set -u

# Capture full JSON envelope from Claude Code into an env var so the
# python interpreter can read its script body from a heredoc.
PHASE_GATE_INPUT=$(cat)
export PHASE_GATE_INPUT

DECISION=$(python3 <<'PYEOF'
import json
import os
import re
import sys

raw = os.environ.get("PHASE_GATE_INPUT", "")
if not raw.strip():
    print("SKIP_EMPTY_INPUT")
    sys.exit(0)

try:
    data = json.loads(raw)
except Exception as e:
    print(f"PARSE_INPUT_ERROR:{e}")
    sys.exit(0)

tool_name = data.get("tool_name", "")
if tool_name != "Agent":
    print("SKIP_NOT_AGENT")
    sys.exit(0)

tool_input = data.get("tool_input", {}) or {}
desc = tool_input.get("description", "") or ""
subagent_type = tool_input.get("subagent_type", "general-purpose") or "general-purpose"

# Implementation-pattern detection. Match descriptions that look like plan-driven dispatches.
impl_patterns = [
    r"^\s*(Phase\s+\d+\s+)?Task\s+\d+\b",
    r"^\s*Step\s+\d+\b",
    r"^\s*Implement(ing|ation)?\b",
    r"^\s*Build(ing)?\s+Task\s+\d+\b",
]
# Deploy-pattern detection. Match dispatches that ship code to a real environment.
# These require the build-side gates (build_audit, build_convergence, deploy_approval)
# IN ADDITION TO the plan-side gates (audit, convergence, user_approval).
deploy_patterns = [
    r"^\s*(Phase\s+\d+\s+Task\s+\d+:\s*)?Deploy(ing|ment)?\b",
    r"^\s*Push\s+to\s+(staging|main|production|prod)\b",
    r"^\s*Merge\s+to\s+(staging|main|production|prod)\b",
    r"^\s*Release\b",
    r"^\s*Ship(ping|ped)?\b",
    r"^\s*Cutover\b",
]
# Review/exploration patterns — explicitly NOT gated.
review_patterns = [
    r"^\s*(Spec|Code)\s+(compliance\s+)?(review|reviewer)",
    r"^\s*Audit(ing)?\b",
    r"^\s*Review(ing)?\b",
    r"^\s*Verif(y|ying)\b",
    r"^\s*Explor(e|ing)\b",
    r"^\s*Research(ing)?\b",
    r"^\s*Analyz(e|ing)\b",
    r"^\s*Plan(ning)?\b",
    r"^\s*Brainstorm(ing)?\b",
]

def matches_any(s, patterns):
    return any(re.search(p, s, re.IGNORECASE) for p in patterns)

is_review = matches_any(desc, review_patterns)
is_deploy = matches_any(desc, deploy_patterns) and not is_review
is_impl = matches_any(desc, impl_patterns) and not is_review and not is_deploy

# Reviewer/explorer agent types are not implementation regardless of description.
review_subagent_types = {
    "Explore",
    "Plan",
    "feature-dev:code-reviewer",
    "feature-dev:code-explorer",
    "pr-review-toolkit:code-reviewer",
    "pr-review-toolkit:comment-analyzer",
    "pr-review-toolkit:pr-test-analyzer",
    "pr-review-toolkit:silent-failure-hunter",
    "pr-review-toolkit:type-design-analyzer",
    "superpowers:code-reviewer",
    "code-review:code-reviewer",
    "code-simplifier:code-simplifier",
}
if subagent_type in review_subagent_types:
    is_impl = False
    is_deploy = False

if not is_impl and not is_deploy:
    print("SKIP_NOT_IMPLEMENTATION")
    sys.exit(0)

cwd = data.get("cwd", os.getcwd())
gate_path = os.path.join(cwd, ".phase-gate.yaml")

if not os.path.exists(gate_path):
    safe_desc = desc.replace("\n", " ").replace("|", "/")[:160]
    print(f"BLOCK_NO_GATE|{safe_desc}|{cwd}")
    sys.exit(0)

# Parse the gate file. Prefer yaml; fall back to a small key-value parser.
try:
    try:
        import yaml
        with open(gate_path) as f:
            gate = yaml.safe_load(f) or {}
    except ImportError:
        gate = {}
        section = None
        with open(gate_path) as f:
            for line in f:
                line = line.rstrip("\n")
                if not line or line.lstrip().startswith("#"):
                    continue
                if not line.startswith(" "):
                    if ":" in line:
                        key, _, val = line.partition(":")
                        section = key.strip()
                        val = val.strip()
                        gate[section] = {} if not val else val
                else:
                    if section is None or not isinstance(gate.get(section), dict):
                        continue
                    inner = line.strip()
                    if ":" not in inner:
                        continue
                    key, _, val = inner.partition(":")
                    val = val.strip()
                    if val.lower() == "true":
                        val = True
                    elif val.lower() == "false":
                        val = False
                    elif val.isdigit():
                        val = int(val)
                    gate[section][key.strip()] = val
except Exception as e:
    print(f"BLOCK_PARSE_ERROR|{e}")
    sys.exit(0)

reasons = []

# Plan-side gates — required for both implementation AND deploy dispatches.
audit = gate.get("audit") or {}
if audit.get("passed") is not True:
    reasons.append("audit.passed != true")
blockers_audit = audit.get("blockers_open", 0) or 0
if isinstance(blockers_audit, int) and blockers_audit > 0:
    reasons.append(f"{blockers_audit} audit blocker(s) still open")

convergence = gate.get("convergence") or {}
if convergence.get("passed") is not True:
    reasons.append("convergence.passed != true")
blockers_conv = convergence.get("blockers_open", 0) or 0
if isinstance(blockers_conv, int) and blockers_conv > 0:
    reasons.append(f"{blockers_conv} convergence blocker(s) still open")

approval = gate.get("user_approval") or {}
if approval.get("approved") is not True:
    reasons.append("user_approval.approved != true")

# Build-side gates — required ONLY for deploy dispatches.
if is_deploy:
    build_audit = gate.get("build_audit") or {}
    if build_audit.get("passed") is not True:
        reasons.append("build_audit.passed != true (run build audit on the actual diff before deploy)")
    blockers_ba = build_audit.get("blockers_open", 0) or 0
    if isinstance(blockers_ba, int) and blockers_ba > 0:
        reasons.append(f"{blockers_ba} build_audit blocker(s) still open")

    build_convergence = gate.get("build_convergence") or {}
    if build_convergence.get("passed") is not True:
        reasons.append("build_convergence.passed != true (run Codex on the actual diff before deploy)")
    blockers_bc = build_convergence.get("blockers_open", 0) or 0
    if isinstance(blockers_bc, int) and blockers_bc > 0:
        reasons.append(f"{blockers_bc} build_convergence blocker(s) still open")

    deploy_approval = gate.get("deploy_approval") or {}
    if deploy_approval.get("approved") is not True:
        reasons.append("deploy_approval.approved != true (deploy needs its own user approval, separate from execute approval)")

if reasons:
    print("BLOCK_GATES_OPEN|" + ";;".join(reasons))
    sys.exit(0)

print("ALLOW")
sys.exit(0)
PYEOF
)

if [[ "$DECISION" == "ALLOW" ]] || [[ "$DECISION" == SKIP_* ]] || [[ "$DECISION" == PARSE_INPUT_ERROR:* ]]; then
    exit 0
fi

if [[ "$DECISION" == BLOCK_NO_GATE\|* ]]; then
    IFS='|' read -r _ DESC CWD <<< "$DECISION"
    cat >&2 <<EOF
PHASE-GATE BLOCK — no .phase-gate.yaml found

A subagent dispatch was attempted with an implementation-pattern description:
  description: "${DESC}"
  cwd: ${CWD}

Plan-driven implementation requires .phase-gate.yaml in the working directory
recording that:
  1. The plan was audited by a fresh-eyes review agent (audit.passed: true)
  2. The plan was converged with Codex or equivalent (convergence.passed: true)
  3. The user explicitly approved execution (user_approval.approved: true)

To proceed, write .phase-gate.yaml at:
  ${CWD}/.phase-gate.yaml

Example format:
  plan: docs/superpowers/plans/2026-05-26-feature-name-phase-1.md
  spec: docs/superpowers/specs/2026-05-26-feature-name-design.md
  state: approved
  audit:
    passed: true
    agent: feature-dev:code-reviewer
    timestamp: 2026-05-26T18:30:00Z
    findings_file: docs/superpowers/reviews/2026-05-26-phase-1-audit.md
    blockers_open: 0
    warnings_open: 0
  convergence:
    passed: true
    tool: codex-mcp
    timestamp: 2026-05-26T18:45:00Z
    findings_file: docs/superpowers/reviews/2026-05-26-phase-1-codex.md
    blockers_open: 0
  user_approval:
    approved: true
    timestamp: 2026-05-26T19:00:00Z
    evidence: "Eric: 'yes, go' (session at 18:55)"

If this dispatch is NOT plan-driven (ad-hoc fix, exploration, etc.), rename the
dispatch description to something that doesn't match the implementation pattern
(e.g., "Fix bug in X" instead of "Task 1: Fix X").
EOF
    exit 2
fi

if [[ "$DECISION" == BLOCK_PARSE_ERROR\|* ]]; then
    REASON="${DECISION#BLOCK_PARSE_ERROR|}"
    echo "PHASE-GATE BLOCK — .phase-gate.yaml exists but failed to parse: ${REASON}" >&2
    exit 2
fi

if [[ "$DECISION" == BLOCK_GATES_OPEN\|* ]]; then
    REASONS_STR="${DECISION#BLOCK_GATES_OPEN|}"
    {
        echo "PHASE-GATE BLOCK — gates not satisfied"
        echo ""
        echo "Open gates:"
        # Reasons are separated by ;; — split with python for reliability
        python3 -c "
import sys
s = sys.argv[1]
for r in s.split(';;'):
    r = r.strip()
    if r:
        print(f'  - {r}')
" "$REASONS_STR"
        echo ""
        echo "Resolve all gates in .phase-gate.yaml before re-dispatching."
        echo "If an audit/convergence finding was resolved, update the corresponding"
        echo "blockers_open count and re-run the gate."
    } >&2
    exit 2
fi

# Unknown decision — fail open with a stderr note so we don't strand work.
echo "PHASE-GATE WARN — unexpected hook decision: ${DECISION}" >&2
exit 0
