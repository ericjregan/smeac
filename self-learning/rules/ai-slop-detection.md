---
description: Detect and prevent common AI-generated design anti-patterns in frontend code
globs: ["**/*.tsx", "**/*.jsx", "**/*.html", "**/*.css"]
---

# AI Slop Detection

NEVER ship these AI-generated design anti-patterns. The test: "Would a human designer at a respected studio ship this?"

## The Blacklist

1. **Purple/violet/indigo gradients** or blue-to-purple color schemes as backgrounds
2. **The 3-column feature grid** — icon-in-colored-circle + bold title + 2-line description, repeated 3x symmetrically. THE most recognizable AI layout.
3. **Icons in colored circles** as section decoration
4. **Centered everything** — text-align: center on all headings, descriptions, and cards
5. **Uniform bubbly border-radius** on every element
6. **Decorative blobs, floating circles, wavy SVG dividers** as visual filler
7. **Emoji as design elements** in headings, buttons, or cards
8. **Colored left-border on cards** as the only visual differentiation
9. **Generic hero copy** — "Welcome to [X]", "Unlock the power of...", "Revolutionize your..."
10. **Cookie-cutter section rhythm** — hero → 3 features → testimonials → pricing → CTA, every time

## What To Do Instead

- Use the project's existing design system. If none exists, invoke the `frontend-design` skill.
- Reference real sites in the same industry for layout inspiration.
- Vary section layouts — not every section needs the same card grid.
- Use asymmetry, whitespace, and typography hierarchy instead of decorative elements.
- Write copy specific to the product, not template filler.
