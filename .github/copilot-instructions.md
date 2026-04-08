## Design Context

### Users
Short-form video creators (TikTok, Reels, YouTube Shorts) who want production-quality sound design without professional audio skills. They're typically editing on desktop, moving fast between clips, and want their content to feel polished. They may not know audio terminology — the interface should guide them, not overwhelm them.

### Brand Personality
**Sleek, Modern, Premium** — the UI should feel like a high-end production suite. Polished surfaces, restrained color use, confident typography. Every element should feel intentional. Avoid anything that looks generic, templated, or cluttered.

### Emotional Goals
**Confidence** — users should feel in control at every step. Clear feedback on what's happening, predictable actions, no surprises. When they export, they should trust the result sounds professional.

### Aesthetic Direction
- **Visual tone:** Dark, minimal, high-contrast. Dense where needed (timeline), spacious where possible (controls).
- **References:** CapCut / Descript — creator-friendly, accessible workflows with professional polish. Fast, visual, not intimidating.
- **Anti-references:** Overly technical DAWs with tiny controls. Generic Bootstrap/Material UI dashboards. Anything with bright white backgrounds or loud gradients.
- **Theme:** Dark mode only. Orange accent (`#FF8000`). Surfaces layer from `#080808` → `#111111` → `#181818` → `#212121`.

### Design Principles

1. **Show, don't explain** — use visual cues (color-coded regions, waveforms, inline previews) over text labels and tooltips. The UI should be self-evident.

2. **Progressive disclosure** — collapsed cards show just enough (type, timestamp, description preview). Expanded cards reveal full controls. Never show everything at once.

3. **Sound is visual** — every sound event should have a clear visual identity: color, position on the timeline, duration width. Users should be able to "see" their sound design before hearing it.

4. **Confidence through feedback** — every action (generate, apply, update) should have immediate visual confirmation. Loading states, progress counters, inline errors. No silent failures.

5. **Creator speed** — minimize clicks. Pre-fill descriptions, auto-detect genres, generate multiple variations in one action. The tool should keep pace with creative momentum.

### Design Tokens Reference

**Figma source:** [OpusUI](https://www.figma.com/design/kCMiFZzEmTU44Yud5FftCR/%F0%9F%93%97-OpusUI?node-id=743-2030)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#080808` | Page background |
| `--surface` | `#111111` | Cards, panels |
| `--surface-2` | `#181818` | Selected/hover states |
| `--surface-3` | `#212121` | Nested surfaces |
| `--border` | `#252525` | Dividers, input borders |
| `--border-focus` | `#3d3d3d` | Focus/hover borders |
| `--text` | `#eeeeee` | Primary text |
| `--text-muted` | `#707070` | Secondary text |
| `--text-sub` | `#404040` | Tertiary text |
| `--accent` | `#FF8000` | Primary actions, focus |
| `--accent-hover` | `#FF9933` | Hover state |
| `--accent-subtle` | `rgba(255,128,0,0.08)` | Selection backgrounds |
| `--danger` | `#CF4020` | Errors, destructive |
| `--success` | `#22c55e` | Success states |

**Typography:** Inter, 13px base, -0.01em tracking, antialiased.

**Corners:** `rounded-md` (6px) inputs, `rounded-lg` (8px) cards, `rounded-xl` (12px) panels, `rounded-2xl` (16px) containers.

### Accessibility
- Target: **WCAG AA** compliance
- All interactive elements must have visible `:focus-visible` states
- Minimum 4.5:1 contrast for text, 3:1 for UI components
- Keyboard navigable — all controls reachable via Tab
- Reduced motion: respect `prefers-reduced-motion` for animations
- Color is never the sole indicator — always pair with text or icons
