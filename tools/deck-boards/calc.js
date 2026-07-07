/* Deck Board Calculator — lineal feet ↔ square feet
 *
 * Each board course occupies (board width + gap) inches across the deck,
 * so 1 lineal foot of board covers (w + g) / 12 sq ft. Waste inflates
 * lineal feet: LF = sqft * 12 / (w + g) * (1 + waste/100). The missing
 * gap on the last course is ignored (standard takeoff approximation).
 */

(() => {
  "use strict";

  const LS_WIDTH = "worktools.deck.width";
  const LS_CUSTOM_WIDTH = "worktools.deck.customWidth";
  const LS_GAP = "worktools.deck.gap";
  const LS_CUSTOM_GAP = "worktools.deck.customGap";
  const LS_WASTE = "worktools.deck.waste";
  const LS_BOARD_LENGTH = "worktools.deck.boardLength";

  const GAP_OPTIONS = [
    { label: "None (0\")", value: 0 },
    { label: "1/16\"", value: 1 / 16 },
    { label: "1/8\"", value: 1 / 8 },
    { label: "3/16\"", value: 3 / 16 },
    { label: "1/4\"", value: 1 / 4 },
    { label: "5/16\"", value: 5 / 16 },
    { label: "3/8\"", value: 3 / 8 },
    { label: "7/16\"", value: 7 / 16 },
    { label: "1/2\"", value: 1 / 2 },
  ];
  const DEFAULT_GAP = String(1 / 8);

  const boardWidthSel = document.getElementById("boardWidth");
  const customWidthGroup = document.getElementById("customWidthGroup");
  const customWidthInput = document.getElementById("customWidth");
  const gapSel = document.getElementById("gap");
  const customGapGroup = document.getElementById("customGapGroup");
  const customGapInput = document.getElementById("customGap");
  const wasteInput = document.getElementById("waste");
  const lengthInput = document.getElementById("lengthFt");
  const widthInput = document.getElementById("widthFt");
  const sqftInput = document.getElementById("sqft");
  const lfInput = document.getElementById("lf");
  const boardLengthInput = document.getElementById("boardLength");
  const piecesEl = document.getElementById("pieces");
  const coverageNote = document.getElementById("coverageNote");

  // Which of sqft / lf the user last entered; the other side is derived.
  let driver = "sqft";

  const num = (el) => {
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : null;
  };

  const fmt = (v) => (v === null ? "" : String(parseFloat(v.toFixed(2))));

  // ---------- material settings ----------

  GAP_OPTIONS.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = String(g.value);
    opt.textContent = g.label;
    gapSel.appendChild(opt);
  });
  const customGapOpt = document.createElement("option");
  customGapOpt.value = "custom";
  customGapOpt.textContent = "Custom…";
  gapSel.appendChild(customGapOpt);
  gapSel.value = DEFAULT_GAP;

  function boardWidthInches() {
    if (boardWidthSel.value === "custom") return num(customWidthInput);
    return parseFloat(boardWidthSel.value);
  }

  function gapInches() {
    if (gapSel.value === "custom") return num(customGapInput);
    return parseFloat(gapSel.value);
  }

  function wastePct() {
    const v = num(wasteInput);
    return v !== null && v >= 0 ? v : 0;
  }

  function syncCustomVisibility() {
    customWidthGroup.classList.toggle(
      "hidden",
      boardWidthSel.value !== "custom"
    );
    customGapGroup.classList.toggle("hidden", gapSel.value !== "custom");
  }

  // ---------- conversion ----------

  // Sq ft covered by one lineal foot of decking, or null if inputs invalid.
  function coveragePerLF() {
    const w = boardWidthInches();
    const g = gapInches();
    if (w === null || w <= 0 || g === null || g < 0) return null;
    return (w + g) / 12;
  }

  function recalc() {
    const cov = coveragePerLF();
    if (cov === null) {
      coverageNote.textContent = "Enter a board width to calculate.";
      return;
    }

    const w = boardWidthInches();
    const g = gapInches();
    coverageNote.textContent =
      `1 board course = ${parseFloat((w + g).toFixed(4))}" wide → ` +
      `${cov.toFixed(3)} sq ft per lineal ft` +
      ` (before ${wastePct()}% waste)`;

    const wasteMult = 1 + wastePct() / 100;
    if (driver === "sqft") {
      const area = num(sqftInput);
      lfInput.value = area === null ? "" : fmt((area / cov) * wasteMult);
    } else {
      const lf = num(lfInput);
      sqftInput.value = lf === null ? "" : fmt((lf / wasteMult) * cov);
    }
    updatePieces();
  }

  function updatePieces() {
    const lf = num(lfInput);
    const len = num(boardLengthInput);
    piecesEl.textContent =
      lf !== null && lf >= 0 && len !== null && len > 0
        ? String(Math.ceil(lf / len))
        : "—";
  }

  // ---------- events ----------

  [lengthInput, widthInput].forEach((el) =>
    el.addEventListener("input", () => {
      const L = num(lengthInput);
      const W = num(widthInput);
      sqftInput.value = L !== null && W !== null ? fmt(L * W) : "";
      driver = "sqft";
      recalc();
    })
  );

  sqftInput.addEventListener("input", () => {
    lengthInput.value = "";
    widthInput.value = "";
    driver = "sqft";
    recalc();
  });

  lfInput.addEventListener("input", () => {
    lengthInput.value = "";
    widthInput.value = "";
    driver = "lf";
    recalc();
  });

  boardWidthSel.addEventListener("change", () => {
    localStorage.setItem(LS_WIDTH, boardWidthSel.value);
    syncCustomVisibility();
    if (boardWidthSel.value === "custom") customWidthInput.focus();
    recalc();
  });

  customWidthInput.addEventListener("input", () => {
    localStorage.setItem(LS_CUSTOM_WIDTH, customWidthInput.value);
    recalc();
  });

  gapSel.addEventListener("change", () => {
    localStorage.setItem(LS_GAP, gapSel.value);
    syncCustomVisibility();
    if (gapSel.value === "custom") customGapInput.focus();
    recalc();
  });

  customGapInput.addEventListener("input", () => {
    localStorage.setItem(LS_CUSTOM_GAP, customGapInput.value);
    recalc();
  });

  wasteInput.addEventListener("input", () => {
    localStorage.setItem(LS_WASTE, wasteInput.value);
    recalc();
  });

  boardLengthInput.addEventListener("input", () => {
    localStorage.setItem(LS_BOARD_LENGTH, boardLengthInput.value);
    updatePieces();
  });

  // ---------- init ----------

  const savedWidth = localStorage.getItem(LS_WIDTH);
  if (savedWidth && ["3.5", "5.5", "custom"].includes(savedWidth)) {
    boardWidthSel.value = savedWidth;
  }
  const savedCustomWidth = localStorage.getItem(LS_CUSTOM_WIDTH);
  if (savedCustomWidth) customWidthInput.value = savedCustomWidth;

  const savedGap = localStorage.getItem(LS_GAP);
  if (
    savedGap &&
    (savedGap === "custom" ||
      GAP_OPTIONS.some((g) => String(g.value) === savedGap))
  ) {
    gapSel.value = savedGap;
  }
  const savedCustomGap = localStorage.getItem(LS_CUSTOM_GAP);
  if (savedCustomGap) customGapInput.value = savedCustomGap;

  const savedWaste = localStorage.getItem(LS_WASTE);
  if (savedWaste !== null && Number.isFinite(parseFloat(savedWaste))) {
    wasteInput.value = savedWaste;
  }

  const savedBoardLength = localStorage.getItem(LS_BOARD_LENGTH);
  if (
    savedBoardLength !== null &&
    Number.isFinite(parseFloat(savedBoardLength))
  ) {
    boardLengthInput.value = savedBoardLength;
  }

  syncCustomVisibility();
  recalc();
})();
