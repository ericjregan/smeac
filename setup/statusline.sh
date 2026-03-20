#!/usr/bin/env bash
# ~/.claude/statusline.sh
# Claude Code status line: model | context bar | git branch

input=$(cat)

# --- Model ---
model=$(echo "$input" | jq -r '.model.display_name // "Unknown Model"')

# --- Context window usage ---
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

# --- Git branch (skip optional lock) ---
branch=$(GIT_OPTIONAL_LOCKS=0 git -C "$(echo "$input" | jq -r '.workspace.current_dir // "."')" \
  symbolic-ref --short HEAD 2>/dev/null)

# --- ANSI colors ---
RESET="\033[0m"
DIM="\033[2m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
BOLD="\033[1m"

# --- Build progress bar ---
if [ -n "$used_pct" ]; then
  pct_int=$(printf "%.0f" "$used_pct")

  # Pick color based on usage
  if [ "$pct_int" -ge 90 ]; then
    bar_color="$RED"
  elif [ "$pct_int" -ge 70 ]; then
    bar_color="$YELLOW"
  else
    bar_color="$GREEN"
  fi

  # 10-block bar
  filled=$(( pct_int / 10 ))
  empty=$(( 10 - filled ))
  bar=""
  for i in $(seq 1 $filled); do bar="${bar}█"; done
  for i in $(seq 1 $empty);  do bar="${bar}░"; done

  ctx_part="${bar_color}${bar}${RESET} ${DIM}${pct_int}%${RESET}"
else
  ctx_part="${DIM}no context data${RESET}"
fi

# --- Assemble output ---
model_part="${CYAN}${model}${RESET}"

if [ -n "$branch" ]; then
  branch_part="${DIM}on${RESET} ${BOLD}${branch}${RESET}"
  echo -e "${model_part}  ${ctx_part}  ${branch_part}"
else
  echo -e "${model_part}  ${ctx_part}"
fi
