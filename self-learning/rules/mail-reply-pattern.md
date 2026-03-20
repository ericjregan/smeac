---
description: Correct AppleScript pattern for replying to emails in Mail.app — preserves quoted chain, runs in background
globs:
---

# Mail.app Reply Pattern

ALWAYS use this pattern when drafting email replies via AppleScript. NEVER use `System Events` keyboard input (hijacks screen) or set `content` without building the chain manually (destroys quoted thread).

## The Pattern

1. Get original message's `content`, `sender`, and `date sent`
2. Build quoted chain: `"On [date], [sender] wrote:\n\n[content]"`
3. Create reply: `reply msg with opening window` (threads via In-Reply-To headers)
4. Add CC/BCC recipients via AppleScript
5. Set content: `set content of theReply to newText & quotedChain`

## Why

- `set content` on a reply overwrites Mail's auto-generated quoted chain
- Building the chain manually preserves threading AND runs in the background
- System Events keyboard input works but takes over the user's screen — never acceptable
