/* Hardie Siding Calculator — pieces needed by product type and exposure.
 *
 * Lap products (HardiePlank, Artisan): 12 ft planks overlap 1.25" minimum,
 * so max exposure = width − 1.25". Coverage per piece = 12 ft × exposure/12
 * sq ft (i.e. exposure-in-inches sq ft per plank).
 * HardiePanel: full sheets, coverage = sheet area (no exposure).
 * HardieShingle: 48" wide panels; straight edge max 7" exposure, staggered
 * edge max 6". Coverage per panel = 4 ft × exposure/12.
 *
 * pieces = ceil(area × (1 + waste%) ÷ coverage-per-piece).
 * Dimensions from James Hardie product data sheets (July 2026).
 */

(() => {
  "use strict";

  const LS = {
    product: "worktools.hardie.product",
    plankWidth: "worktools.hardie.plankWidth",
    artisanWidth: "worktools.hardie.artisanWidth",
    panelSize: "worktools.hardie.panelSize",
    shingleEdge: "worktools.hardie.shingleEdge",
    exposure: "worktools.hardie.exposure",
    waste: "worktools.hardie.waste",
  };

  const OVERLAP = 1.25; // minimum lap overlap in inches

  const PRODUCTS = [
    {
      id: "plank",
      name: "HardiePlank (lap)",
      kind: "lap",
      lengthFt: 12,
      widths: [5.25, 6.25, 7.25, 8.25, 9.25, 12],
      defaultWidth: 8.25,
      lsWidth: LS.plankWidth,
    },
    {
      id: "artisan",
      name: "Artisan (lap)",
      kind: "lap",
      lengthFt: 12,
      widths: [5.25, 7.25, 8.25],
      defaultWidth: 8.25,
      lsWidth: LS.artisanWidth,
    },
    {
      id: "panel",
      name: "HardiePanel (vertical)",
      kind: "panel",
      sizes: [
        { name: "4 × 8 ft", sqft: 32 },
        { name: "4 × 9 ft", sqft: 36 },
        { name: "4 × 10 ft", sqft: 40 },
      ],
    },
    {
      id: "shingle",
      name: "HardieShingle (panels)",
      kind: "shingle",
      lengthFt: 4,
      edges: [
        { name: "Straight edge", maxExp: 7 },
        { name: "Staggered edge", maxExp: 6 },
      ],
    },
  ];

  const $ = (id) => document.getElementById(id);
  const productSel = $("product");
  const widthRow = $("widthRow");
  const widthSel = $("plankWidth");
  const sizeRow = $("sizeRow");
  const sizeSel = $("panelSize");
  const edgeRow = $("edgeRow");
  const edgeSel = $("shingleEdge");
  const exposureRow = $("exposureRow");
  const exposureInput = $("exposure");
  const exposureError = $("exposureError");
  const coverageNote = $("coverageNote");
  const lengthInput = $("lengthFt");
  const heightInput = $("heightFt");
  const sqftInput = $("sqft");
  const wasteInput = $("waste");
  const piecesEl = $("pieces");
  const exactNote = $("exactNote");

  const num = (el) => {
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : null;
  };
  const fmt = (v) => String(parseFloat(v.toFixed(2)));
  // Squash float noise (700*1.1/7 = 110.00000000000001) before ceil/integer checks.
  const tidy = (v) => Math.round(v * 1e9) / 1e9;

  PRODUCTS.forEach((p, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = p.name;
    productSel.appendChild(opt);
  });

  function currentProduct() {
    return PRODUCTS[Number(productSel.value)] ?? PRODUCTS[0];
  }

  function maxExposure() {
    const p = currentProduct();
    if (p.kind === "lap") {
      const w = parseFloat(widthSel.value);
      return Number.isFinite(w) ? w - OVERLAP : null;
    }
    if (p.kind === "shingle") {
      const edge = p.edges[Number(edgeSel.value)] ?? p.edges[0];
      return edge.maxExp;
    }
    return null; // panels have no exposure
  }

  // Rebuild the product-specific controls for the current product.
  function renderProductControls() {
    const p = currentProduct();

    widthRow.style.display = p.kind === "lap" ? "" : "none";
    sizeRow.style.display = p.kind === "panel" ? "" : "none";
    edgeRow.style.display = p.kind === "shingle" ? "" : "none";
    exposureRow.style.display = p.kind === "panel" ? "none" : "";

    if (p.kind === "lap") {
      widthSel.innerHTML = "";
      p.widths.forEach((w) => {
        const opt = document.createElement("option");
        opt.value = String(w);
        opt.textContent = `${w}" (max ${fmt(w - OVERLAP)}" exposure)`;
        widthSel.appendChild(opt);
      });
      const saved = parseFloat(localStorage.getItem(p.lsWidth));
      widthSel.value = String(
        p.widths.includes(saved) ? saved : p.defaultWidth
      );
    } else if (p.kind === "panel") {
      sizeSel.innerHTML = "";
      p.sizes.forEach((s, i) => {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = `${s.name} (${s.sqft} sq ft)`;
        sizeSel.appendChild(opt);
      });
      const saved = Number(localStorage.getItem(LS.panelSize));
      if (saved >= 0 && saved < p.sizes.length) sizeSel.value = String(saved);
    } else if (p.kind === "shingle") {
      edgeSel.innerHTML = "";
      p.edges.forEach((e, i) => {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = `${e.name} (max ${e.maxExp}" exposure)`;
        edgeSel.appendChild(opt);
      });
      const saved = Number(localStorage.getItem(LS.shingleEdge));
      if (saved >= 0 && saved < p.edges.length) edgeSel.value = String(saved);
    }

    resetExposureToMax();
  }

  function resetExposureToMax() {
    const max = maxExposure();
    if (max !== null) exposureInput.value = fmt(max);
  }

  // Sq ft covered by one piece at current settings, or null if invalid.
  function coveragePerPiece() {
    const p = currentProduct();
    if (p.kind === "panel") {
      const s = p.sizes[Number(sizeSel.value)] ?? p.sizes[0];
      return s.sqft;
    }
    const exp = num(exposureInput);
    const max = maxExposure();
    if (exp === null || exp <= 0 || (max !== null && exp > max)) return null;
    return p.lengthFt * (exp / 12);
  }

  function wastePct() {
    const v = num(wasteInput);
    return v !== null && v >= 0 ? v : 0;
  }

  function recalc() {
    const p = currentProduct();
    const max = maxExposure();
    const exp = num(exposureInput);
    const badExposure =
      p.kind !== "panel" &&
      exp !== null &&
      max !== null &&
      (exp > max || exp <= 0);
    exposureError.textContent = badExposure
      ? `Exposure must be between 0 and ${fmt(max)}" for this ${
          p.kind === "lap" ? "plank width" : "edge style"
        } (1.25" minimum overlap).`
      : "";
    exposureError.classList.toggle("show", badExposure);

    const cov = coveragePerPiece();
    if (cov === null) {
      coverageNote.textContent = "";
      piecesEl.textContent = "—";
      exactNote.textContent = "";
      return;
    }

    if (p.kind === "panel") {
      coverageNote.textContent = `1 sheet covers ${fmt(cov)} sq ft`;
    } else {
      coverageNote.textContent =
        `1 piece = ${p.lengthFt} ft × ${fmt(exp)}" exposure → ` +
        `${fmt(cov)} sq ft`;
    }

    const area = num(sqftInput);
    if (area === null || area < 0) {
      piecesEl.textContent = "—";
      exactNote.textContent = "";
      return;
    }
    const exact = tidy((area * (1 + wastePct() / 100)) / cov);
    piecesEl.textContent = String(Math.ceil(exact));
    exactNote.textContent = Number.isInteger(exact)
      ? ""
      : `(${fmt(exact)} exact, rounded up)`;
  }

  // ---------- events ----------

  productSel.addEventListener("change", () => {
    localStorage.setItem(LS.product, currentProduct().id);
    renderProductControls();
    recalc();
  });

  widthSel.addEventListener("change", () => {
    localStorage.setItem(currentProduct().lsWidth, widthSel.value);
    resetExposureToMax();
    recalc();
  });

  sizeSel.addEventListener("change", () => {
    localStorage.setItem(LS.panelSize, sizeSel.value);
    recalc();
  });

  edgeSel.addEventListener("change", () => {
    localStorage.setItem(LS.shingleEdge, edgeSel.value);
    resetExposureToMax();
    recalc();
  });

  exposureInput.addEventListener("input", recalc);

  [lengthInput, heightInput].forEach((el) =>
    el.addEventListener("input", () => {
      const L = num(lengthInput);
      const H = num(heightInput);
      sqftInput.value = L !== null && H !== null ? fmt(L * H) : "";
      recalc();
    })
  );

  sqftInput.addEventListener("input", () => {
    lengthInput.value = "";
    heightInput.value = "";
    recalc();
  });

  wasteInput.addEventListener("input", () => {
    localStorage.setItem(LS.waste, wasteInput.value);
    recalc();
  });

  // ---------- init ----------

  const savedProduct = localStorage.getItem(LS.product);
  const pIdx = PRODUCTS.findIndex((p) => p.id === savedProduct);
  if (pIdx >= 0) productSel.value = String(pIdx);

  const savedWaste = localStorage.getItem(LS.waste);
  if (savedWaste !== null && Number.isFinite(parseFloat(savedWaste))) {
    wasteInput.value = savedWaste;
  }

  renderProductControls();
  recalc();
})();
