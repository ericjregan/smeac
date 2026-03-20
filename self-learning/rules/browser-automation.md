---
description: Browser automation standard — use Playwright with accessibility-tree snapshot refs, not CSS selectors or screenshots
globs:
---

# Browser Automation Standard

ALWAYS use the Playwright MCP plugin for browser automation. It already implements accessibility-tree-based refs natively — don't reinvent the pattern.

## Core Rules

- **Playwright MCP, not Selenium or Puppeteer.** The plugin is installed and configured.
- **Use `browser_snapshot`, not screenshots**, for understanding page state. Snapshots return accessibility tree refs that `browser_click`, `browser_fill_form`, etc. accept directly.
- **Never hard-code CSS selectors or XPath** for dynamic web content. The snapshot ref system survives UI redesigns.
- **Re-snapshot after navigation** or major DOM changes. Stale refs will fail.

## Adversarial vs. Cooperative Sites

- **Adversarial sites** (LinkedIn, Cloudflare-protected): Human-like delays (800-4000ms, non-uniform distribution).
- **Cooperative sites** (internal tools, scraping targets): No delays needed. Don't hammer them, but no stealth required.

## When to Use

- Portal automation (insurance portals, admin dashboards)
- Social media engagement beyond API limits
- Web scraping from complex/dynamic sites
- E2E testing for any frontend
- Any "a human clicks through a website" workflow
