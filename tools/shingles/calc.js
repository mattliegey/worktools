/* Shingle Calculator — squares → bundles by brand/line
 *
 * bundles = ceil(squares × bundlesPerSquare), since bundles are sold whole.
 * Bundle counts are the manufacturers' standard packaging (verified against
 * manufacturer/distributor listings, July 2026). A square = 100 sq ft.
 */

(() => {
  "use strict";

  const LS_BRAND = "worktools.shingles.brand";
  const LS_LINE = "worktools.shingles.line";

  const BRANDS = [
    {
      name: "GAF",
      lines: [
        { name: "Royal Sovereign (3-tab)", bps: 3 },
        { name: "Timberline HDZ", bps: 3 },
        { name: "Timberline UHDZ", bps: 3 },
        { name: "Timberline AS II (impact)", bps: 3 },
        { name: "Slateline", bps: 4 },
        { name: "Camelot II", bps: 4 },
        { name: "Woodland", bps: 4 },
        { name: "Grand Sequoia", bps: 5 },
        { name: "Grand Canyon", bps: 6 },
        { name: "Glenwood", bps: 6 },
      ],
    },
    {
      name: "Owens Corning",
      lines: [
        { name: "Supreme (3-tab)", bps: 3 },
        { name: "Oakridge", bps: 3 },
        { name: "TruDefinition Duration", bps: 3 },
        { name: "Duration Flex", bps: 3 },
        { name: "Duration Storm", bps: 3 },
        { name: "Duration Designer", bps: 3 },
        { name: "Berkshire", bps: 5 },
        { name: "Woodcrest", bps: 6 },
        { name: "Woodmoor", bps: 6 },
      ],
    },
    {
      name: "IKO",
      lines: [
        { name: "Marathon Plus AR (3-tab)", bps: 3 },
        { name: "Cambridge", bps: 3 },
        { name: "Dynasty", bps: 3 },
        { name: "Nordic", bps: 3 },
        { name: "Royal Estate", bps: 3 },
        { name: "Crowne Slate", bps: 4 },
        { name: "Armourshake", bps: 4 },
      ],
    },
    {
      name: "TAMKO",
      lines: [
        { name: "Elite Glass-Seal (3-tab)", bps: 3 },
        { name: "Heritage", bps: 3 },
        { name: "Heritage Proline Titan XT", bps: 3 },
        { name: "StormFighter Flex", bps: 3 },
        { name: "StormFighter IR", bps: 3 },
      ],
    },
    {
      name: "Atlas",
      lines: [
        { name: "GlassMaster (3-tab)", bps: 3 },
        { name: "ProLam", bps: 3 },
        { name: "Pinnacle Pristine", bps: 3 },
        { name: "Pinnacle Impact (Sun)", bps: 3 },
        { name: "StormMaster Shake", bps: 3 },
        { name: "StormMaster Slate", bps: 3 },
        { name: "Legend", bps: 3 },
      ],
    },
    {
      name: "Malarkey",
      lines: [
        { name: "Dura-Seal (3-tab)", bps: 3 },
        { name: "Vista", bps: 3 },
        { name: "Highlander NEX", bps: 3 },
        { name: "Legacy", bps: 4 },
        { name: "Windsor", bps: 5 },
      ],
    },
  ];

  const brandSel = document.getElementById("brand");
  const lineSel = document.getElementById("line");
  const lineNote = document.getElementById("lineNote");
  const squaresInput = document.getElementById("squares");
  const bundlesEl = document.getElementById("bundles");
  const exactNote = document.getElementById("exactNote");

  BRANDS.forEach((b, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = b.name;
    brandSel.appendChild(opt);
  });

  function currentBrand() {
    return BRANDS[Number(brandSel.value)] ?? BRANDS[0];
  }

  function currentLine() {
    return currentBrand().lines[Number(lineSel.value)] ?? null;
  }

  function renderLines(preferredName) {
    const brand = currentBrand();
    lineSel.innerHTML = "";
    brand.lines.forEach((l, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = l.name;
      lineSel.appendChild(opt);
    });
    if (preferredName) {
      const idx = brand.lines.findIndex((l) => l.name === preferredName);
      if (idx >= 0) lineSel.value = String(idx);
    }
  }

  function recalc() {
    const line = currentLine();
    if (!line) return;
    lineNote.textContent = `${line.name}: ${line.bps} bundles per square`;

    const v = parseFloat(squaresInput.value);
    if (!Number.isFinite(v) || v < 0) {
      bundlesEl.textContent = "—";
      exactNote.textContent = "";
      return;
    }
    const exact = v * line.bps;
    bundlesEl.textContent = String(Math.ceil(exact));
    exactNote.textContent =
      Number.isInteger(exact) ? "" : `(${parseFloat(exact.toFixed(2))} exact, rounded up)`;
  }

  brandSel.addEventListener("change", () => {
    localStorage.setItem(LS_BRAND, currentBrand().name);
    renderLines();
    localStorage.setItem(LS_LINE, currentLine().name);
    recalc();
  });

  lineSel.addEventListener("change", () => {
    localStorage.setItem(LS_LINE, currentLine().name);
    recalc();
  });

  squaresInput.addEventListener("input", recalc);

  // init: restore last brand/line
  const savedBrand = localStorage.getItem(LS_BRAND);
  const brandIdx = BRANDS.findIndex((b) => b.name === savedBrand);
  if (brandIdx >= 0) brandSel.value = String(brandIdx);
  renderLines(localStorage.getItem(LS_LINE));
  recalc();
})();
