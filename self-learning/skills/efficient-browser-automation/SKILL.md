---
name: efficient-browser-automation
description: Use when automating any browser task with the Playwright MCP plugin — form filling, portal navigation, developer console setup, web scraping. Prevents the slow snapshot-between-every-action anti-pattern.
---

# Efficient Browser Automation

## Overview

Use the Playwright MCP plugin's snapshot pattern (accessibility tree + refs) with **minimum round trips**. The plugin already implements the snapshot-based approach natively. The problem is wasteful usage: too many snapshots, too little batching.

## Core Rules

### 1. Navigate Directly

If you know the URL, use `browser_navigate`. Never click through 3 pages of navigation to reach a known destination.

```
BAD:  navigate homepage → snapshot → click "Settings" → snapshot → click "Basic" → snapshot
GOOD: browser_navigate("https://developers.facebook.com/apps/APP_ID/settings/basic/")
```

### 2. One Snapshot, Many Actions

Take ONE snapshot. Read the refs. Execute ALL planned actions. Then snapshot again ONLY if you need to verify or the page changed significantly.

```
BAD:  snapshot → click field → snapshot → type → snapshot → click next field → snapshot → type
GOOD: snapshot → browser_fill_form([field1, field2, field3, field4]) → click submit → snapshot to verify
```

### 3. Batch with browser_fill_form

`browser_fill_form` accepts multiple fields. Fill ALL visible form fields in one call.

### 4. Use browser_run_code for Complex Sequences

When you need multiple coordinated actions (scroll + wait + click + fill), use `browser_run_code` to execute Playwright code directly instead of 5 separate tool calls.

### 5. Skip Unnecessary Snapshots

After clicking a simple button or filling a field on the same page, you do NOT need a new snapshot. The refs are still valid until a page navigation or major DOM change.

Only re-snapshot when:
- Page navigated to new URL
- Modal opened/closed
- Tab/accordion expanded
- You need to verify an action worked

### 6. Site Categories

| Site Type | Delays? | Extra Caution? | Examples |
|-----------|---------|----------------|----------|
| Cooperative | No | No | Developer portals, admin panels, internal tools |
| Adversarial | Yes (800-4000ms) | Yes | LinkedIn, Cloudflare-protected sites |
| Fragile | No | Be gentle | Legacy portals, payer sites |

For cooperative sites (like Meta developer portal), move as fast as the tools allow. No artificial delays.

## Tool Quick Reference

| Tool | When to Use |
|------|-------------|
| `browser_navigate` | Go directly to a known URL |
| `browser_snapshot` | Get accessibility tree. Use sparingly — 1-2 per page, not per action |
| `browser_fill_form` | Fill multiple form fields in ONE call. Always prefer over individual fills |
| `browser_click` | Click a specific ref. No snapshot needed after if page doesn't change |
| `browser_run_code` | Complex multi-step sequences. Write Playwright JS directly |
| `browser_file_upload` | Upload files to file inputs |
| `browser_select_option` | Dropdowns and selects |
| `browser_evaluate` | Run JS in page context (read values, check state) |
| `browser_take_screenshot` | Visual verification only. Never for action planning — use snapshot |

## Anti-Patterns

| Anti-Pattern | Fix |
|-------------|-----|
| Snapshot after every click | Only snapshot after navigation or DOM change |
| Clicking through nav menus | Navigate directly to URL |
| Reading the entire accessibility tree aloud | Scan for relevant refs, act on them |
| One form field per tool call | Use browser_fill_form with all fields |
| Taking screenshots to "see" the page | Use browser_snapshot — it's text, faster, cheaper |
| Waiting between actions on cooperative sites | No delays needed — go fast |

## Workflow

```
1. browser_navigate(target_url)
2. browser_snapshot() → identify ALL actionable refs
3. Plan all actions from single snapshot
4. Execute: browser_fill_form / browser_click / browser_run_code
5. browser_snapshot() ONLY if page changed or need verification
6. Repeat 3-5 until done
```

## Common Mistakes

- **Narrating the tree**: Don't echo the entire snapshot back. Scan it, identify refs, act.
- **Defensive snapshots**: Don't snapshot "just to be safe." Trust that refs survive until navigation.
- **Sequential form filling**: If you see 5 textboxes, fill all 5 in one `browser_fill_form` call.
- **Forgetting browser_run_code**: For anything requiring scroll → wait → act → verify, write it as one Playwright script instead of 4 tool calls.
