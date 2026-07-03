/* Margin & Markup Calculator
 *
 * Four linked fields: cost (C), markup % (K), margin % (M), sell (S).
 *   S = C * (1 + K/100)
 *   M = (S - C) / S * 100
 *   K = (S - C) / C * 100
 * Exactly one field is locked at a time. Typing in an unlocked field
 * recomputes the rest from the pair (locked, typed). Markup and margin
 * determine each other, so whichever of the two is locked makes the
 * other read-only/derived.
 */

(() => {
  "use strict";

  const FIELDS = ["cost", "markup", "margin", "sell"];
  const LS_PRESETS = "worktools.taxPresets";
  const LS_TAX_RATE = "worktools.lastTaxRate";
  const LS_LOCK = "worktools.mm.lock";

  const inputs = {};
  FIELDS.forEach((f) => (inputs[f] = document.getElementById(f)));
  const taxRateInput = document.getElementById("taxRate");
  const taxPresetSelect = document.getElementById("taxPreset");
  const taxDollarsEl = document.getElementById("taxDollars");
  const totalDollarsEl = document.getElementById("totalDollars");
  const marginError = document.getElementById("marginError");

  const state = {
    locked: localStorage.getItem(LS_LOCK) || "margin",
    lastEdited: null, // last unlocked field the user typed in
  };
  if (!FIELDS.includes(state.locked)) state.locked = "margin";

  // ---------- math ----------

  const num = (el) => {
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : null;
  };

  const isPercentPair = (a, b) =>
    (a === "markup" && b === "margin") || (a === "margin" && b === "markup");

  // Given two known fields, return {cost, markup, margin, sell} or null.
  function solve(fa, va, fb, vb) {
    const known = { [fa]: va, [fb]: vb };
    let C = known.cost ?? null;
    let K = known.markup ?? null;
    let M = known.margin ?? null;
    let S = known.sell ?? null;

    if (M !== null && M >= 100) return null;
    if (K !== null && K <= -100) return null;

    if (C !== null && S !== null) {
      K = C !== 0 ? ((S - C) / C) * 100 : null;
      M = S !== 0 ? ((S - C) / S) * 100 : null;
    } else if (C !== null && K !== null) {
      S = C * (1 + K / 100);
      M = (100 * K) / (100 + K);
    } else if (C !== null && M !== null) {
      S = C / (1 - M / 100);
      K = (100 * M) / (100 - M);
    } else if (S !== null && K !== null) {
      C = S / (1 + K / 100);
      M = (100 * K) / (100 + K);
    } else if (S !== null && M !== null) {
      C = S * (1 - M / 100);
      K = (100 * M) / (100 - M);
    } else {
      return null; // markup+margin or fewer than two knowns
    }

    const out = { cost: C, markup: K, margin: M, sell: S };
    for (const f of FIELDS) {
      if (out[f] !== null && !Number.isFinite(out[f])) out[f] = null;
    }
    return out;
  }

  const fmt = (v) => (v === null ? "" : String(parseFloat(v.toFixed(2))));
  const money = (v) =>
    v.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
    });

  // ---------- recalculation ----------

  // Pick the field to pair with `f` (the field just edited) when `f` is
  // the locked field itself.
  function pickPartner(f) {
    const candidates = [];
    if (state.lastEdited && state.lastEdited !== f) {
      candidates.push(state.lastEdited);
    }
    candidates.push("cost", "sell", "markup", "margin");
    for (const c of candidates) {
      if (c === f || isPercentPair(c, f)) continue;
      if (num(inputs[c]) !== null) return c;
    }
    return null;
  }

  function recalc(edited) {
    let partner;
    if (edited === state.locked) {
      partner = pickPartner(edited);
    } else {
      partner = state.locked;
      state.lastEdited = edited;
    }

    const va = num(inputs[edited]);
    marginError.classList.toggle(
      "show",
      edited === "margin" && va !== null && va >= 100
    );

    if (partner && va !== null && !isPercentPair(edited, partner)) {
      const vb = num(inputs[partner]);
      if (vb !== null) {
        const res = solve(edited, va, partner, vb);
        if (res) {
          for (const f of FIELDS) {
            if (f === edited) continue;
            inputs[f].value = fmt(res[f]);
          }
        }
      }
    }
    updateTax();
  }

  function updateTax() {
    const S = num(inputs.sell);
    const rate = num(taxRateInput);
    if (S === null) {
      taxDollarsEl.textContent = "—";
      totalDollarsEl.textContent = "—";
      return;
    }
    const tax = rate !== null ? (S * rate) / 100 : 0;
    taxDollarsEl.textContent = money(tax);
    totalDollarsEl.textContent = money(S + tax);
  }

  // ---------- locks ----------

  function applyLockUI() {
    for (const f of FIELDS) {
      const row = inputs[f].closest(".field-row");
      const btn = row.querySelector(".lock-btn");
      const locked = f === state.locked;
      btn.setAttribute("aria-pressed", String(locked));
      btn.textContent = locked ? "🔒" : "🔓";
      row.classList.toggle("is-locked", locked);

      // Whichever of markup/margin is NOT locked (while its twin is)
      // becomes derived-only.
      const derived =
        (f === "markup" && state.locked === "margin") ||
        (f === "margin" && state.locked === "markup");
      inputs[f].disabled = derived;
      row.classList.toggle("is-derived", derived);
    }
  }

  document.querySelectorAll(".lock-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.locked = btn.dataset.lock;
      localStorage.setItem(LS_LOCK, state.locked);
      applyLockUI();
    });
  });

  FIELDS.forEach((f) => {
    inputs[f].addEventListener("input", () => recalc(f));
    inputs[f].addEventListener("blur", () => {
      const v = num(inputs[f]);
      if (v !== null && (f === "cost" || f === "sell")) {
        inputs[f].value = v.toFixed(2);
      }
    });
  });

  // ---------- tax presets ----------

  function loadPresets() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_PRESETS));
      if (
        Array.isArray(raw) &&
        raw.every(
          (p) => p && typeof p.name === "string" && Number.isFinite(p.rate)
        )
      ) {
        return raw;
      }
    } catch (_) {
      /* fall through to seed */
    }
    return [{ name: "None", rate: 0 }];
  }

  let presets = loadPresets();
  const savePresets = () =>
    localStorage.setItem(LS_PRESETS, JSON.stringify(presets));

  function renderPresetSelect() {
    taxPresetSelect.innerHTML = "";
    presets.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `${p.name} (${p.rate}%)`;
      taxPresetSelect.appendChild(opt);
    });
    const custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = "Custom…";
    taxPresetSelect.appendChild(custom);
  }

  function selectMatchingPreset(rate) {
    const idx = presets.findIndex((p) => p.rate === rate);
    taxPresetSelect.value = idx >= 0 ? String(idx) : "custom";
  }

  taxPresetSelect.addEventListener("change", () => {
    if (taxPresetSelect.value === "custom") {
      taxRateInput.focus();
      return;
    }
    const p = presets[Number(taxPresetSelect.value)];
    if (p) {
      taxRateInput.value = String(p.rate);
      localStorage.setItem(LS_TAX_RATE, String(p.rate));
      updateTax();
    }
  });

  taxRateInput.addEventListener("input", () => {
    const rate = num(taxRateInput);
    selectMatchingPreset(rate);
    if (rate !== null) localStorage.setItem(LS_TAX_RATE, String(rate));
    updateTax();
  });

  // ---------- preset manager dialog ----------

  const dialog = document.getElementById("presetDialog");
  const presetList = document.getElementById("presetList");
  const addForm = document.getElementById("presetAddForm");

  function renderPresetList() {
    presetList.innerHTML = "";
    presets.forEach((p, i) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = p.name;
      const rate = document.createElement("span");
      rate.className = "rate";
      rate.textContent = `${p.rate}%`;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "delete";
      del.setAttribute("aria-label", `Delete ${p.name}`);
      del.textContent = "✕";
      del.addEventListener("click", () => {
        presets.splice(i, 1);
        savePresets();
        renderPresetList();
        renderPresetSelect();
        selectMatchingPreset(num(taxRateInput));
      });
      li.append(name, rate, del);
      presetList.appendChild(li);
    });
  }

  document.getElementById("managePresets").addEventListener("click", () => {
    renderPresetList();
    dialog.showModal();
  });

  document.getElementById("closePresets").addEventListener("click", () => {
    dialog.close();
  });

  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(addForm);
    const name = String(data.get("name")).trim();
    const rate = parseFloat(data.get("rate"));
    if (!name || !Number.isFinite(rate)) return;
    presets.push({ name, rate });
    savePresets();
    addForm.reset();
    renderPresetList();
    renderPresetSelect();
    selectMatchingPreset(num(taxRateInput));
  });

  // ---------- init ----------

  applyLockUI();
  renderPresetSelect();
  const savedRate = parseFloat(localStorage.getItem(LS_TAX_RATE));
  if (Number.isFinite(savedRate)) {
    taxRateInput.value = String(savedRate);
  }
  selectMatchingPreset(num(taxRateInput));
  updateTax();
})();
