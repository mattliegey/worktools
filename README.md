# WorkTools

A personal collection of small tools used throughout the workday. Plain static HTML/CSS/JS — no build step — deployed to GitHub Pages.

**Live site:** https://mattliegey.github.io/worktools/

## Tools

- **Margin & Markup Calculator** (`tools/margin-markup/`) — cost, markup %, margin %, sell price, and sales tax. Lock any one of the four linked values and the others recalculate around it. Tax rates can be saved as named presets (stored in the browser via localStorage).

## Development

No tooling required. Serve the repo root with any static server:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/.

## Adding a new tool

1. Create `tools/<tool-name>/index.html` (+ its JS), linking `../../assets/style.css` for the shared look.
2. Add a card for it to the grid in `index.html`.

Deploys automatically to GitHub Pages on every push to `main` (`.github/workflows/pages.yml`).
