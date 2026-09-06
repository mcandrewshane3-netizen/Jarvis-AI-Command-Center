---
name: Viewport-contained app shells
description: Reliable full-screen tablet and PWA layout containment across browser chrome, keyboards, CSS Grid, and nested scrollers.
---

For full-screen tablet and PWA shells, explicitly bound the root grid row with `minmax(0, 1fr)`, zero the minimum size of every grid/flex ancestor, and assign scrolling to one intended child per region.

Treat ordinary window resizing and keyboard-only VisualViewport contraction as separate height signals. A layout resize should use the current layout viewport immediately; a focused-input VisualViewport contraction should only override it after resize events settle.

**Why:** Browser geometry can report the shell itself at the correct viewport height while an implicit grid row expands to min-content height. Window and VisualViewport events can also arrive in opposite orders, producing a one-resize-behind shell.

**How to apply:** Use this for fixed-height app shells on iPad Safari or installed PWAs. Validate element rectangles, scroll ownership, and keyboard-height recovery at realistic width/height pairs rather than relying on screenshots or generic responsive mode alone.