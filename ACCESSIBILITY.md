# Accessibility

We want everyone who builds with or uses Turingate to be able to do so, including people who use assistive technology.

## Our commitment

We aim to follow the [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/) at level AA for the browser widget, the documentation, and the website.

## What makes Turingate different

Turingate is a **reverse CAPTCHA**: its challenges are designed to be passed by AI agents, not people. **No human visitor is ever asked to solve one.** A site using Turingate only puts its challenge in front of automated agents, and people keep using the site as usual. This avoids the main accessibility problem with traditional CAPTCHAs, which make disabled people prove they're human.

## Supported environments

| Component | Support |
|---|---|
| Browser widget (`packages/widget`) | Current versions of Chrome, Edge, Firefox and Safari on desktop and mobile; works with screen readers (VoiceOver and NVDA) |
| CLI (`npx turingate`) | Any terminal with Node 20+; plain-text output that works with screen readers |
| Docs and README | Semantic headings, alt text on images, and readable text descriptions alongside each diagram |

## What we already do

- The widget has an accessible name (`aria-label`), announces status changes through an `aria-live` region, and hides decorative elements from assistive technology (`aria-hidden`).
- Every animated README image is decorative and has a written explanation next to it.
- The website respects the system "Reduce motion" setting.

## Known limitations

- Some animated SVGs in the README can't be paused. Every one is decorative, and the text next to it carries the same information.
- Some colour-coded charts in the benchmark section also label their values in text, but the colours alone may not meet contrast requirements for every reader.
- The widget's visual style can be overridden by a host site, and we can't guarantee the contrast of a site's custom styling.

## Report a barrier

If something gets in your way, please [open an accessibility issue](https://github.com/rudraneel93/turingate-sdk/issues/new?template=accessibility.yml). Tell us what you were trying to do, what got in the way, and the browser and assistive technology you use. We aim to respond within 5 working days and treat barriers as bugs.
