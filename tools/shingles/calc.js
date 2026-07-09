/* Shingle Calculator — squares → bundles by brand/line, plus the matching
 * hip & ridge cap and its bundle count for a given ridge/hip length.
 *
 * Field bundles  = ceil(squares × bundlesPerSquare).
 * Hip/ridge bundles = ceil(linealFeet ÷ capCoveragePerBundle).
 * Both round up (bundles are sold whole). A square = 100 sq ft.
 *
 * Each line names its manufacturer-matched hip & ridge cap and that cap's
 * lineal-feet-per-bundle coverage (verified against manufacturer/distributor
 * listings, July 2026). Standard 3-tab/architectural lines pair with the
 * brand's standard cap; designer/premium lines pair with the premium cap.
 */

(() => {
  "use strict";

  const LS_BRAND = "worktools.shingles.brand";
  const LS_LINE = "worktools.shingles.line";
  const LS_RIDGE = "worktools.shingles.ridgeFeet";

  // Hip & ridge caps, keyed for reuse: { name, lf } (lf = lineal ft per bundle)
  const HR = {
    // GAF
    sealARidge: { name: "GAF Seal-A-Ridge", lf: 25 },
    sealARidgeAS: { name: "GAF Seal-A-Ridge AS", lf: 25 },
    timberTex: { name: "GAF TimberTex", lf: 20 },
    timberCrest: { name: "GAF TimberCrest", lf: 20 },
    // Owens Corning
    proEdge: { name: "OC ProEdge", lf: 33 },
    decoRidge: { name: "OC DecoRidge", lf: 20 },
    ocBerkshire: { name: "OC Berkshire Hip & Ridge", lf: 21.3 },
    // IKO
    ikoHR12: { name: "IKO Hip & Ridge 12", lf: 36.5 },
    ikoUltraHP: { name: "IKO UltraHP", lf: 20 },
    // TAMKO
    tamkoHR: { name: "TAMKO Hip & Ridge", lf: 33.3 },
    tamkoHRir: { name: "TAMKO Hip & Ridge IR", lf: 33.3 },
    // Atlas
    proCut: { name: "Atlas Pro-Cut", lf: 31 },
    // Malarkey
    ridgeFlex: { name: "Malarkey RidgeFlex", lf: 20 },
    ezRidge: { name: "Malarkey EZ-Ridge", lf: 20 },
  };

  const BRANDS = [
    {
      name: "GAF",
      lines: [
        { name: "Royal Sovereign (3-tab)", bps: 3, hr: HR.sealARidge },
        { name: "Timberline HDZ", bps: 3, hr: HR.timberTex },
        { name: "Timberline UHDZ", bps: 3, hr: HR.timberTex },
        { name: "Timberline AS II (impact)", bps: 3, hr: HR.sealARidgeAS },
        { name: "Slateline", bps: 3, hr: HR.timberTex },
        { name: "Camelot II", bps: 4, hr: HR.timberTex },
        { name: "Woodland", bps: 4, hr: HR.timberTex },
        { name: "Grand Sequoia", bps: 5, hr: HR.timberTex },
        { name: "Grand Canyon", bps: 6, hr: HR.timberCrest },
        { name: "Glenwood", bps: 6, hr: HR.timberTex },
      ],
    },
    {
      name: "Owens Corning",
      lines: [
        { name: "Supreme (3-tab)", bps: 3, hr: HR.proEdge },
        { name: "Oakridge", bps: 3, hr: HR.proEdge },
        { name: "TruDefinition Duration", bps: 3, hr: HR.proEdge },
        { name: "Duration Flex", bps: 3, hr: HR.proEdge },
        { name: "Duration Storm", bps: 3, hr: HR.proEdge },
        { name: "Duration Designer", bps: 3, hr: HR.decoRidge },
        { name: "Berkshire", bps: 5, hr: HR.ocBerkshire },
        { name: "Woodcrest", bps: 6, hr: HR.decoRidge },
        { name: "Woodmoor", bps: 6, hr: HR.decoRidge },
      ],
    },
    {
      name: "IKO",
      lines: [
        { name: "Marathon Plus AR (3-tab)", bps: 3, hr: HR.ikoHR12 },
        { name: "Cambridge", bps: 3, hr: HR.ikoHR12 },
        { name: "Dynasty", bps: 3, hr: HR.ikoHR12 },
        { name: "Nordic", bps: 3, hr: HR.ikoHR12 },
        { name: "Royal Estate", bps: 3, hr: HR.ikoUltraHP },
        { name: "Crowne Slate", bps: 4, hr: HR.ikoUltraHP },
        { name: "Armourshake", bps: 5, hr: HR.ikoUltraHP },
      ],
    },
    {
      name: "TAMKO",
      lines: [
        { name: "Elite Glass-Seal (3-tab)", bps: 3, hr: HR.tamkoHR },
        { name: "Heritage", bps: 3, hr: HR.tamkoHR },
        { name: "Heritage Proline Titan XT", bps: 3, hr: HR.tamkoHR },
        { name: "StormFighter Flex", bps: 3, hr: HR.tamkoHRir },
        { name: "StormFighter IR", bps: 3, hr: HR.tamkoHRir },
      ],
    },
    {
      name: "Atlas",
      lines: [
        { name: "GlassMaster (3-tab)", bps: 3, hr: HR.proCut },
        { name: "ProLam", bps: 3, hr: HR.proCut },
        { name: "Briarwood Pro", bps: 3, hr: HR.proCut },
        { name: "Castlebrook", bps: 3, hr: HR.proCut },
        { name: "Pinnacle Pristine", bps: 3, hr: HR.proCut },
        { name: "Pinnacle Impact (Sun)", bps: 3, hr: HR.proCut },
        { name: "StormMaster Shake", bps: 3, hr: HR.proCut },
        { name: "StormMaster Slate", bps: 3, hr: HR.proCut },
        { name: "Legend", bps: 3, hr: HR.proCut },
      ],
    },
    {
      name: "Malarkey",
      lines: [
        { name: "Dura-Seal (3-tab)", bps: 3, hr: HR.ridgeFlex },
        { name: "Vista", bps: 3, hr: HR.ridgeFlex },
        { name: "Highlander NEX", bps: 3, hr: HR.ridgeFlex },
        { name: "Legacy", bps: 4, hr: HR.ridgeFlex },
        { name: "Windsor", bps: 5, hr: HR.ezRidge },
      ],
    },
  ];

  const brandSel = document.getElementById("brand");
  const lineSel = document.getElementById("line");
  const lineNote = document.getElementById("lineNote");
  const squaresInput = document.getElementById("squares");
  const bundlesEl = document.getElementById("bundles");
  const exactNote = document.getElementById("exactNote");
  const ridgeInput = document.getElementById("ridgeFeet");
  const hrNameEl = document.getElementById("hrName");
  const hrBundlesEl = document.getElementById("hrBundles");
  const hrExactNote = document.getElementById("hrExactNote");

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
    } else {
      const exact = v * line.bps;
      bundlesEl.textContent = String(Math.ceil(exact));
      exactNote.textContent = Number.isInteger(exact)
        ? ""
        : `(${parseFloat(exact.toFixed(2))} exact, rounded up)`;
    }

    updateHipRidge();
  }

  function updateHipRidge() {
    const line = currentLine();
    if (!line) return;
    const cap = line.hr;
    hrNameEl.textContent = `${cap.name} — ${cap.lf} lin ft per bundle`;

    const lf = parseFloat(ridgeInput.value);
    if (!Number.isFinite(lf) || lf < 0) {
      hrBundlesEl.textContent = "—";
      hrExactNote.textContent = "";
      return;
    }
    const exact = lf / cap.lf;
    hrBundlesEl.textContent = String(Math.ceil(exact));
    hrExactNote.textContent = Number.isInteger(exact)
      ? ""
      : `(${parseFloat(exact.toFixed(2))} exact, rounded up)`;
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
  ridgeInput.addEventListener("input", () => {
    localStorage.setItem(LS_RIDGE, ridgeInput.value);
    updateHipRidge();
  });

  // init: restore last brand/line/ridge length
  const savedBrand = localStorage.getItem(LS_BRAND);
  const brandIdx = BRANDS.findIndex((b) => b.name === savedBrand);
  if (brandIdx >= 0) brandSel.value = String(brandIdx);
  renderLines(localStorage.getItem(LS_LINE));
  const savedRidge = localStorage.getItem(LS_RIDGE);
  if (savedRidge !== null && Number.isFinite(parseFloat(savedRidge))) {
    ridgeInput.value = savedRidge;
  }
  recalc();
})();
