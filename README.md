# WorkTools

A personal collection of small tools used throughout the workday. Plain static HTML/CSS/JS — no build step — deployed to GitHub Pages.

**Live site:** https://mattliegey.github.io/worktools/

## Tools

- **Margin & Markup Calculator** (`tools/margin-markup/`) — cost, markup %, margin %, sell price, and sales tax. Lock any one of the four linked values and the others recalculate around it. Tax rates can be saved as named presets (stored in the browser via localStorage).
- **Vinyl Window Training** (`tools/window-training/`) — a field training site for measuring, prepping and installing a vinyl replacement window inside an original window frame. Covers both starting points (original sashes still in, or an older insert being changed out), with animated SVG diagrams and a measuring worksheet that takes fractions and returns the order size.

## Feedback & visit counts

Every page carries a feedback widget and a visit-counting beacon, both backed by
Supabase. Review both in the private report at `tools/feedback-report/`.

- Feedback setup: [`docs/feedback-setup.md`](docs/feedback-setup.md)
- Visit counter setup: [`docs/analytics-setup.md`](docs/analytics-setup.md)

## Development

No tooling required. Serve the repo root with any static server:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/.

## Adding a new tool

1. Create `tools/<tool-name>/index.html` (+ its JS), linking `../../assets/style.css` for the shared look.
2. Add a card for it to the grid in `index.html`.
3. Before `</body>`, add the shared scripts so the tool gets the feedback widget
   and gets counted in the visits report:

   ```html
   <script src="../../assets/feedback-config.js"></script>
   <script src="../../assets/feedback.js" defer></script>
   <script src="../../assets/analytics.js" defer></script>
   ```

   The tool's name in both reports comes from its `<title>` (the
   `— WorkTools` suffix is stripped), so give it a clear one.

Deploys automatically to GitHub Pages on every push to `main` (`.github/workflows/pages.yml`).
