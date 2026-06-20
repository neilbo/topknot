# Hardcoded accent -> token

You write a primary button.

```css
.btn-primary { background: #FA8072; padding: 8px 16px; border-radius: 6px; }
```

With topknot:

```css
/* every value already lives in the token set */
.btn-primary {
  background: var(--color-accent);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
}
```

drift: none yet — but `#FA8072` == `--color-accent`. Raw hex means the next
rebrand fixes the token everywhere and this button nowhere. Use the token.
