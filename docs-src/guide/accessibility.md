---
title: Accessibility
description: Keyboard navigation, screen reader support and accessible content.
---
# Accessibility

## Keyboard navigation

| Keys | Action |
|---|---|
| <kbd>Alt+F9</kbd> | Focus the menubar |
| <kbd>Alt+F10</kbd> | Focus the toolbar |
| <kbd>Alt+F11</kbd> | Focus the element path in the status bar |
| <kbd>Alt+F12</kbd> or <kbd>Esc</kbd> | Return focus to the editor |
| <kbd>←</kbd> <kbd>→</kbd> | Move between toolbar buttons / menubar entries |
| <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> | Move between toolbar groups and dialog fields |
| <kbd>↑</kbd> <kbd>↓</kbd> | Move in menus, grids and autocompleter lists |
| <kbd>Enter</kbd> / <kbd>Space</kbd> | Activate a button or menu item |
| <kbd>Esc</kbd> | Close menus, popups and dialogs |
| <kbd>Alt+0</kbd> | Open the help dialog (help plugin) |

The complete list of editing shortcuts is in [keyboard shortcuts](../reference/keyboard-shortcuts.html).

## Screen readers

Toolbars use `role="toolbar"` with labelled buttons (`aria-label`, `aria-pressed` for toggles, `aria-haspopup`/`aria-expanded` for menus); menus use `role="menu"`/`menuitem`/`menuitemcheckbox`; dialogs are `role="dialog"` with `aria-modal`, a labelled title and a focus trap; notifications live in an `aria-live` region; the editing iframe has a title (`iframe_aria_text`). `editor.announce(message)` speaks a message through the live region.

## Accessible content

- `image_description: true` (default) keeps the alt text field in the image dialog; `a11y_advanced_options: true` adds the "Image is decorative" checkbox which writes `alt=""` and `role="presentation"`.
- Table header rows and columns are real `th` elements with `scope`, and `tablecaption` adds a caption.
- `help_accessibility: true` (default) adds the Keyboard Navigation tab to the help dialog.

## Motion and contrast

Both skins meet WCAG AA contrast for text and controls; focus is always visible. No animation is essential, and transitions respect `prefers-reduced-motion`.
