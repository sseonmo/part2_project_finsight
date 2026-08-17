# Finsight Design System

Design system for **Finsight** — a financial-insight platform for finance teams (live cash, close automation, forecasting, board reporting). The system is a stark-white marketing canvas with one canary-yellow brand accent, black pill CTAs, and a family of pastel feature cards.

## Sources & provenance — read this first

This system was built from **a written brand/token brief only**. There was no codebase, Figma file, .fig mount, repository, screenshot set, or slide template attached, so:

- **No logo files exist.** Wherever a mark belongs, the system renders the wordmark `finsight` in type beside a plain yellow tile. Nothing was drawn or reconstructed. Supply real SVG/PNG marks and they drop straight into `TopNav`, `thumbnail.html`, and `guidelines/brand-mark.card.html`.
- **The brief named `Roobert PRO`** as the core face but shipped no font binaries. **Hanken Grotesk** (Google Fonts) stands in — see Typography below. Flagged for replacement.
- **The brief specified token *names* but not hex values** (e.g. `{colors.brand-yellow}`). Every value in `tokens/` is an interpretation consistent with the described roles and contrast requirements, not an extracted value. Verify against real brand assets before production use.
- **The brief's prose described a different company's marketing site** (Miro) as a structural reference. Only structure and system rules were carried over — layout rhythm, pill-CTA discipline, pastel card family, 4-tier pricing, dense comparison table. No third-party brand colors, wordmark, product imagery, or copy were reproduced. All product copy here is original Finsight copy.
- **Product screens are recreations of nothing** — with no source product to copy, `ui_kits/marketing/mocks.jsx` renders neutral, plainly-built dashboard UI (KPI tiles, bar chart, reconciliation table) as mockup filler. Replace with the real product UI when available.

## Index

| Path | What |
|---|---|
| `styles.css` | Global entry point — `@import` list only. Consumers link this one file. |
| `tokens/fonts.css` | Font stack + weight tokens; carries the Hanken Grotesk substitution note |
| `tokens/colors.css` | Brand, pastel, surface, text, dark, semantic colors + semantic aliases |
| `tokens/typography.css` | Size/leading/tracking tokens + `.fs-*` utility classes |
| `tokens/spacing.css` | 4px-base scale, section rhythm, container width |
| `tokens/radius.css` | 4 → 32px scale + `--radius-full` pill |
| `tokens/elevation.css` | 5 shadow levels + motion tokens |
| `tokens/base.css` | Body/heading/link resets |
| `guidelines/*.card.html` | 18 foundation specimen cards (Colors, Type, Spacing, Shapes, Brand) |
| `components/<group>/` | 26 React primitives — see below |
| `ui_kits/marketing/` | Click-through 4-screen marketing site kit (`README.md` inside) |
| `thumbnail.html` | Homepage tile |
| `SKILL.md` | Agent Skills entry point |

## Components

26 primitives, grouped by concern. Every one has `<Name>.jsx`, `<Name>.d.ts`, `<Name>.prompt.md`; each directory has one `@dsCard` HTML.

- **actions/** — `Button`, `IconButton`
- **surfaces/** — `Card`, `FeatureCard`, `StatCard`, `StoryCard`, `ProductMockup`, `IndustryTile`, `TemplateCard`
- **forms/** — `Input`, `SearchPill`, `FilterDropdown`
- **navigation/** — `TopNav`, `PillTabs`, `BillingToggle`, `Footer`
- **feedback/** — `Badge`, `PromoBanner`
- **pricing/** — `PricingCard`, `ComparisonTable`
- **marketing/** — `HeroBand`, `CtaBanner`, `FaqAccordion`, `LogoWall`, `StoreBadge`, `ReviewBadge`

Starting points: `Button`, `FeatureCard`, `PricingCard`, `HeroBand`, and the marketing-site screen.

**Intentional additions** (not named in the brief, added because the described surfaces cannot be built without them): `IconButton` (36px circular utility control implied by the component list), `ProductMockup` (the brief's `whiteboard-mockup` generalised to a product frame), `PillTabs` (the brief documented a single `pill-tab`; a group component is the usable unit), `StatCard`/`StoreBadge`/`ReviewBadge` (the brief's `card-stat`, `app-store-badge`, `capterra-badge`).

## Content fundamentals

**Voice.** Confident, plain, faintly wry. Finsight talks like a competent colleague, not a vendor. Claims are concrete and countable; nothing is "revolutionary", "seamless" or "world-class".

**Person.** Second person for the reader (*"your close"*, *"you keep the judgement calls"*), first-person plural only for commitments (*"we never share it"*). Never "I". Never "users" in customer-facing copy — say *finance teams*, *your team*.

**Casing.** Sentence case everywhere — headlines, buttons, nav, table headers, card titles. The only uppercase in the system is the 11px table-divider label (`COLLABORATION & SHARING`) and promo-banner action pills (`GET YOUR SPOT`). No Title Case Headlines.

**Headlines** are one clause, 4–8 words, no period, and name an outcome rather than a feature: *"Every number, one source of truth"*, *"The close, on autopilot"*, *"Start closing faster"*. **Subtitles** are exactly one sentence and add the mechanism the headline withheld: *"Finsight connects your banks, billing and ledger into one live picture — so the close takes days, not weeks."*

**Buttons** are verb-first and 2–4 words: *Get started free*, *Book a demo*, *Contact sales*, *Watch the 3-min tour*. Never *Learn more* alone, never *Submit*, never *Click here*.

**Numbers** carry the persuasion: *6 days median close*, *$18B+ monitored*, *−31% reporting hours*, *200+ connections*. Always a real unit and a comparison baseline; percentages get a sign. Currency abbreviates ($14.2M, $812K).

**Tables and specs** stay terse and parallel: *Unlimited*, *2 years*, *Community*, *Dedicated CSM*. Absence is an em dash, never "No".

**Punctuation.** Em dashes for the turn in an argument; Oxford comma off; no exclamation marks; no ALL-CAPS for emphasis. British-neutral spelling avoided — use US (*organisation* → *organization*) except where a product noun says otherwise.

**Emoji: never.** Not in UI, not in marketing copy, not in changelogs. Status is carried by `Badge` chips and color.

## Visual foundations

**Canvas.** White (`--canvas`) is the default and dominant surface; `--surface-soft` marks alternating bands, `--surface` is a resting tint for search fields and the toggle track. Maximum two background colors per page. No gradients anywhere — not in heroes, not behind cards, not on buttons.

**Color behaviour.** One saturated brand accent (`--brand-yellow`) with strict scope: the wordmark tile, the promo banner pill, discount chips, tag chips. It is never a primary CTA and never a large background field. Pastels (`--yellow-light`, `--coral-light`, `--rose-light`, `--teal-light`, `--brand-mint`, `--brand-orange-light`, `--surface-pricing-featured`) are card fills only — always mixed with white cards in the same viewport, never a whole section in one tint. `--brand-blue` is action-blue for links, the focus ring, and the featured pricing border. Semantic red/green appear only in validation and status.

**Type.** One family, one axis of contrast: geometric sans at weight 500 for everything structural, 400 for prose, 600 reserved for 13px badge text and the 11px uppercase divider. Weight 700 does not exist in this system. Display sizes carry negative tracking (−2px at 80px, −1.5px at 60px, easing to 0 by 22px) and tight leading (1.05 hero). Body sits at 1.5.

**Backgrounds & imagery.** No stock photography, no illustration sets, no textures, no patterns, no full-bleed photo heroes. The only imagery is the product itself, framed in `ProductMockup` (16px radius, `--shadow-3`). Customer-story cards are the one place photography appears — 16:9, full-bleed inside a 28px radius, with the customer name overlaid in white.

**Cards.** Flat by default: white fill, 1px `--hairline-soft` border, no shadow. Radius encodes the card's job — 16px for content/pricing/template cards, 28px for pastel feature and story cards, 32px only for the dark CTA band. Pastel cards drop the border (color does the separating). Padding: 24px compact, 32px feature panels.

**Shadows.** Five levels, used sparingly: level 0 (flat) is the default for documentation and content cards; level 1 for the selected toggle knob; level 2 for a lifted feature card; level 3 reserved for product mockups; level 4 for dropdowns and modals only. All shadows are cast from the same indigo (`rgba(5,0,56,·)`) — never neutral black. No inner shadows anywhere.

**Borders & dividers.** Three hairline weights, all 1px: `--hairline-soft` for table rows and quiet card edges, `--hairline` for structural dividers and nav underlines, `--hairline-strong` for inputs and outlined pills. The only 2px border in the system is the featured pricing card and the input focus ring.

**Shape.** The pill (`--radius-full`) is the brand signature: every button, tab, badge, filter and toggle. `ghost` buttons at 8px are the single exception. Never soften or square a pill.

**Motion.** Restrained and short: 150–200ms with `cubic-bezier(0.2,0,0.2,1)` on background, border and opacity only. No entrance animations, no parallax, no scroll-triggered reveals, no bouncing, no spring easing. Content does not move as you scroll.

**Hover.** Fills darken slightly, outlines gain ink; links move from `--brand-blue` to `--blue-pressed` and underline. Nothing scales up, nothing lifts on hover, nothing changes color family.

**Press.** Primary pill goes from `--primary` to `--charcoal`; outlined pill takes a `--surface` fill. No shrink transform, no shadow removal. Focus is always visible: 2px `--brand-blue`.

**Transparency & blur.** Almost none. `--on-dark-muted` (72% white) is the only alpha in text, and shadows are the only other alpha. No frosted glass, no backdrop blur, no scrim gradients except the dark overlay on story photography. Protection comes from solid capsules and cards, not gradients.

**Layout.** 1280px max width, 32px gutters, single centered column. Section rhythm: 96px on marketing, 64px on pricing, 32px in dense stacks, 120px in the hero. Fixed elements: the promo strip and the 64px nav bar at the top; nothing else pins. Grids are flex/grid with `gap` — 4-up pricing, 3-up features, 2-up stories, 6-column footer.

**Dark surfaces.** Two only: `--primary` (near-black) for CTA bands, the enterprise pricing card and the promo strip; `--footer-bg` (deep indigo) for the footer. On dark, the CTA becomes a white pill and yellow may appear as an inline link color.

## Iconography

No icon set was supplied with the brief — nothing to copy in. **Substitution flagged:** the system uses **Lucide** (`unpkg.com/lucide@0.460.0`, 24px grid, 2px stroke, round caps) as the closest match to the described geometric, slightly rounded character. Cards and UI kits load it from CDN and render glyphs as `<i data-lucide="name">`.

Rules in force:
- Icons are line-only, 2px stroke, no fills, no duotone, no colored icon backgrounds.
- Sizes: 16px inline in buttons and rows, 20px in tiles, 24px standalone. Icons inherit `currentColor` — never a brand color of their own.
- Icons are optional decoration on a labelled control, never the only label except in `IconButton` (which requires `aria-label`).
- No emoji, ever. No unicode pictographs as icons. The three exceptions where a character stands in for a glyph are the pricing checkmark (`✓`), the em-dash absence marker (`—`), and the FAQ `+`/`−` — replace with Lucide `check`, `minus`, `plus` if you want strict consistency.
- There is no icon font and no SVG sprite in this project. If Finsight has one, drop it in `assets/icons/` and it supersedes Lucide.

## Responsive

Breakpoints: <480 (1-col, hero 36px), 480–767 (features 2-up, hero 48px), 768–1023 (2-col grids, hero 60px), 1024–1279 (4-tier pricing row, hero 64px), ≥1280 (full 80px hero). Nav collapses to a hamburger below 1024. Comparison table becomes horizontal-scroll below 768. Footer 6 → 3 → 2 columns. Touch targets: pills 40–44px, inputs 44px, icon buttons 36px desktop → 44px mobile.

## Known gaps

- No dark-mode token set.
- No real logo, font binaries, product screenshots, or customer photography.
- Hover/press states are documented above but implemented only where components need them (the brief's no-hover policy).
- No deck/slide template — none was supplied.
