/*
 * Window Training — measuring worksheet.
 *
 * Takes the six readings, two diagonals and the pocket depth for one opening,
 * and turns them into an order size. Two things matter more than the
 * arithmetic:
 *
 *   1. Carpenters type fractions. Every input accepts 36 1/2, 36-1/2, 36.5,
 *      3' 0 1/2", or a bare 36, and every output comes back as inches and a
 *      fraction. A worksheet that demands decimals does not get used.
 *   2. Order sizes round DOWN. A window a sixteenth small gets shimmed; a
 *      window a sixteenth big goes back on the truck.
 *
 * Saved openings live in localStorage, following the preset pattern used by
 * tools/margin-markup/calc.js.
 */
(function () {
  "use strict";

  // ---- Shop standards -----------------------------------------------------
  var DEDUCT_W = 0.5;      // inches off the smallest width
  var DEDUCT_H = 0.5;      // inches off the smallest height
  var ROUND_TO = 1 / 8;    // order sizes land on an eighth
  var SQUARE_OK = 0.25;    // diagonals within this are square enough
  var SQUARE_WARN = 0.5;   // beyond this the opening is badly racked
  var DEFAULT_DEPTH = 3.25;

  var STORE_KEY = "wt_window_openings";

  // ---- Fraction parsing ---------------------------------------------------

  /*
   * Parse the ways a tape measure actually gets written down.
   * Returns inches as a number, or null if it cannot be read.
   */
  function parseInches(raw) {
    if (raw == null) return null;
    var s = String(raw).trim();
    if (!s) return null;

    // Strip inch marks and normalise the unicode ones people paste in.
    s = s.replace(/[″”"]/g, " ")
         .replace(/[′’]/g, "'")
         .replace(/½/g, " 1/2").replace(/¼/g, " 1/4").replace(/¾/g, " 3/4")
         .replace(/⅛/g, " 1/8").replace(/⅜/g, " 3/8")
         .replace(/⅝/g, " 5/8").replace(/⅞/g, " 7/8")
         .replace(/⅓/g, " 1/3").replace(/⅔/g, " 2/3")
         .trim();

    var total = 0;

    // Feet, if given: 3' 0 1/2  or  3ft 0 1/2
    var feet = /^\s*(\d+(?:\.\d+)?)\s*(?:'|ft\b|feet\b)/i.exec(s);
    if (feet) {
      total += parseFloat(feet[1]) * 12;
      s = s.slice(feet[0].length).trim();
      if (!s) return total;
    }

    // A hyphen between whole and fraction is a separator, not a minus:
    // 36-1/2 means 36 and a half.
    s = s.replace(/^(\d+)\s*-\s*(\d)/, "$1 $2");

    // whole + fraction, e.g. "36 1/2"
    var mixed = /^(\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)$/.exec(s);
    if (mixed) {
      var den = parseFloat(mixed[3]);
      if (!den) return null;
      return total + parseFloat(mixed[1]) + parseFloat(mixed[2]) / den;
    }

    // bare fraction, e.g. "1/2"
    var frac = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
    if (frac) {
      var d2 = parseFloat(frac[2]);
      if (!d2) return null;
      return total + parseFloat(frac[1]) / d2;
    }

    // plain number, e.g. "36" or "36.5"
    var plain = /^(\d+(?:\.\d+)?)$/.exec(s);
    if (plain) return total + parseFloat(plain[1]);

    return null;
  }

  /* Inches as a number -> "35 3/4"" , to the nearest sixteenth. */
  function formatInches(v) {
    if (v == null || !isFinite(v)) return "—";
    var neg = v < 0;
    v = Math.abs(v);
    var whole = Math.floor(v);
    var sixteenths = Math.round((v - whole) * 16);
    if (sixteenths === 16) { whole += 1; sixteenths = 0; }

    var out;
    if (sixteenths === 0) {
      out = whole + "″";
    } else {
      var num = sixteenths, den = 16;
      while (num % 2 === 0 && den % 2 === 0) { num /= 2; den /= 2; }
      out = (whole ? whole + " " : "") + num + "/" + den + "″";
    }
    return (neg ? "-" : "") + out;
  }

  /* Order sizes always go to the smaller eighth. */
  function roundDownTo(v, step) {
    return Math.floor(v / step + 1e-9) * step;
  }

  // ---- DOM helpers --------------------------------------------------------

  function $(id) { return document.getElementById(id); }

  var WIDTH_IDS = ["wTop", "wMid", "wBot"];
  var HEIGHT_IDS = ["hLeft", "hCtr", "hRight"];

  function readGroup(ids) {
    var vals = [];
    var anyBad = false;
    ids.forEach(function (id) {
      var el = $(id);
      var raw = el.value.trim();
      if (!raw) { el.classList.remove("bad"); return; }
      var v = parseInches(raw);
      if (v == null || v <= 0) {
        el.classList.add("bad");
        anyBad = true;
      } else {
        el.classList.remove("bad");
        vals.push(v);
      }
    });
    return { values: vals, bad: anyBad };
  }

  function setResult(id, text, state) {
    var el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = "value" + (state ? " " + state : "");
  }

  function setNote(id, html, state) {
    var el = $(id);
    if (!el) return;
    el.innerHTML = html;
    el.className = "note" + (state ? " " + state : "");
  }

  // ---- The calculation ----------------------------------------------------

  var current = {};

  function recalc() {
    var w = readGroup(WIDTH_IDS);
    var h = readGroup(HEIGHT_IDS);

    // ---- Width
    var tightW = w.values.length ? Math.min.apply(null, w.values) : null;
    var orderW = tightW == null ? null : roundDownTo(tightW - DEDUCT_W, ROUND_TO);
    setResult("tightW", formatInches(tightW));
    setResult("orderW", formatInches(orderW), orderW != null ? "big" : "");

    if (tightW == null) {
      setNote("wNote", w.bad ? "That reading did not parse — try <code>36 1/2</code>."
                             : "Enter at least one width reading.", w.bad ? "bad" : "");
    } else {
      var spreadW = Math.max.apply(null, w.values) - tightW;
      var wMsg = "Smallest of " + w.values.length + " reading" + (w.values.length > 1 ? "s" : "") +
                 ", less ½″, rounded down to the nearest eighth.";
      if (w.values.length < 3) {
        setNote("wNote", wMsg + " <b>Take all three</b> — jambs bow.", "warn");
      } else if (spreadW >= 0.5) {
        setNote("wNote", wMsg + " Your readings vary by " + formatInches(spreadW) +
                " — that jamb is bowed, expect to shim hard.", "warn");
      } else {
        setNote("wNote", wMsg, "");
      }
    }

    // ---- Height
    var tightH = h.values.length ? Math.min.apply(null, h.values) : null;
    var orderH = tightH == null ? null : roundDownTo(tightH - DEDUCT_H, ROUND_TO);
    setResult("tightH", formatInches(tightH));
    setResult("orderH", formatInches(orderH), orderH != null ? "big" : "");

    if (tightH == null) {
      setNote("hNote", h.bad ? "That reading did not parse — try <code>59 7/8</code>."
                             : "Enter at least one height reading.", h.bad ? "bad" : "");
    } else {
      var spreadH = Math.max.apply(null, h.values) - tightH;
      var hMsg = "Smallest of " + h.values.length + " reading" + (h.values.length > 1 ? "s" : "") +
                 ", less ½″, rounded down to the nearest eighth.";
      if (h.values.length < 3) {
        setNote("hNote", hMsg + " <b>Take all three</b> — sills settle.", "warn");
      } else if (spreadH >= 0.5) {
        setNote("hNote", hMsg + " Your readings vary by " + formatInches(spreadH) +
                " — check you measured to the sill's high point.", "warn");
      } else {
        setNote("hNote", hMsg, "");
      }
    }

    // ---- Square
    var d1 = parseInches($("diag1").value);
    var d2 = parseInches($("diag2").value);
    $("diag1").classList.toggle("bad", !!$("diag1").value.trim() && d1 == null);
    $("diag2").classList.toggle("bad", !!$("diag2").value.trim() && d2 == null);

    var delta = null;
    if (d1 != null && d2 != null) {
      delta = Math.abs(d1 - d2);
      setResult("sqDelta", formatInches(delta),
                delta <= SQUARE_OK ? "good" : delta <= SQUARE_WARN ? "warn" : "bad");
      if (delta <= SQUARE_OK) {
        setNote("sqNote", "Square enough. Set it, shim it, done.", "good");
      } else if (delta <= SQUARE_WARN) {
        setNote("sqNote", "Noticeably out. Order normally, but expect to shim hard on one side " +
                          "and scribe the stops.", "warn");
      } else {
        setNote("sqNote", "<b>Badly racked.</b> Consider ordering another ¼″ down and " +
                          "warn the customer the trim will need scribing.", "bad");
      }
    } else {
      setResult("sqDelta", "—");
      setNote("sqNote", "Measure corner to corner, both ways.", "");
    }

    // ---- Pocket depth
    var depth = parseInches($("depth").value);
    var need = parseInches($("depthNeed").value);
    if (need == null) need = DEFAULT_DEPTH;
    $("depth").classList.toggle("bad", !!$("depth").value.trim() && depth == null);

    var depthOK = null;
    if (depth != null) {
      depthOK = depth + 1e-9 >= need;
      setResult("depthOut", formatInches(depth), depthOK ? "good" : "bad");
      setNote("depthNote", depthOK
        ? "Deep enough for a " + formatInches(need) + " insert."
        : "<b>Too shallow.</b> " + formatInches(depth) + " will not take a " + formatInches(need) +
          " insert — this is a full-frame job. Price it as one before anyone quotes it.",
        depthOK ? "good" : "bad");
    } else {
      setResult("depthOut", "—");
      setNote("depthNote", "Measure blind stop to inside stop, with the parting bead out.", "");
    }

    // ---- Headline
    var ready = orderW != null && orderH != null;
    $("orderLine").textContent = ready
      ? formatInches(orderW) + "  ×  " + formatInches(orderH)
      : "—";
    $("orderLine").className = "order-size" + (ready ? " ready" : "");
    $("saveBtn").disabled = !ready;

    current = {
      name: $("openingName").value.trim(),
      w: WIDTH_IDS.map(function (id) { return $(id).value.trim(); }),
      h: HEIGHT_IDS.map(function (id) { return $(id).value.trim(); }),
      d1: $("diag1").value.trim(),
      d2: $("diag2").value.trim(),
      depth: $("depth").value.trim(),
      depthNeed: $("depthNeed").value.trim(),
      tightW: tightW, tightH: tightH,
      orderW: orderW, orderH: orderH,
      delta: delta, depthOK: depthOK,
      notes: $("openingNotes").value.trim()
    };
  }

  // ---- Saved openings -----------------------------------------------------

  function loadAll() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveAll(list) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      // Private mode or storage disabled — the worksheet still calculates.
      return false;
    }
  }

  function renderSaved() {
    var list = loadAll();
    var wrap = $("savedWrap");
    var tbody = $("savedBody");
    tbody.innerHTML = "";

    if (!list.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;

    list.forEach(function (o, i) {
      var tr = document.createElement("tr");

      function cell(text, cls) {
        var td = document.createElement("td");
        td.textContent = text;
        if (cls) td.className = cls;
        return td;
      }

      tr.appendChild(cell(o.name || "Opening " + (i + 1)));
      tr.appendChild(cell(formatInches(o.orderW) + " × " + formatInches(o.orderH), "num"));
      tr.appendChild(cell(o.delta == null ? "—" : formatInches(o.delta), "num"));
      tr.appendChild(cell(o.depth ? o.depth : "—", "num"));
      tr.appendChild(cell(o.notes || ""));

      var actions = document.createElement("td");
      actions.className = "row-actions";

      var load = document.createElement("button");
      load.type = "button";
      load.className = "btn";
      load.textContent = "Load";
      load.addEventListener("click", function () { loadOpening(o); });

      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-danger";
      del.textContent = "Delete";
      del.addEventListener("click", function () {
        var all = loadAll();
        all.splice(i, 1);
        saveAll(all);
        renderSaved();
      });

      actions.appendChild(load);
      actions.appendChild(del);
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
  }

  function loadOpening(o) {
    $("openingName").value = o.name || "";
    WIDTH_IDS.forEach(function (id, i) { $(id).value = (o.w && o.w[i]) || ""; });
    HEIGHT_IDS.forEach(function (id, i) { $(id).value = (o.h && o.h[i]) || ""; });
    $("diag1").value = o.d1 || "";
    $("diag2").value = o.d2 || "";
    $("depth").value = o.depth || "";
    $("depthNeed").value = o.depthNeed || "";
    $("openingNotes").value = o.notes || "";
    recalc();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearForm() {
    ["openingName", "diag1", "diag2", "depth", "openingNotes"]
      .concat(WIDTH_IDS, HEIGHT_IDS)
      .forEach(function (id) { $(id).value = ""; $(id).classList.remove("bad"); });
    recalc();
    $("openingName").focus();
  }

  // ---- Wire up ------------------------------------------------------------

  function init() {
    if (!$("wTop")) return;

    var inputs = WIDTH_IDS.concat(HEIGHT_IDS,
      ["diag1", "diag2", "depth", "depthNeed", "openingName", "openingNotes"]);

    inputs.forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("input", recalc);
    });

    $("saveBtn").addEventListener("click", function () {
      if (!current.orderW || !current.orderH) return;
      var list = loadAll();
      if (!current.name) current.name = "Opening " + (list.length + 1);
      list.push(current);
      if (!saveAll(list)) {
        setNote("saveNote", "Could not save — this browser has storage turned off. " +
                            "The numbers above are still good; write them down.", "bad");
        return;
      }
      setNote("saveNote", "Saved “" + current.name + "”.", "good");
      renderSaved();
      clearForm();
    });

    $("clearBtn").addEventListener("click", clearForm);
    $("printBtn").addEventListener("click", function () { window.print(); });

    $("clearAllBtn").addEventListener("click", function () {
      if (!window.confirm("Delete every saved opening on this device? This cannot be undone."))
        return;
      saveAll([]);
      renderSaved();
    });

    recalc();
    renderSaved();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Exposed for the self-check on the page.
  window.WT_WORKSHEET = { parseInches: parseInches, formatInches: formatInches, roundDownTo: roundDownTo };
})();
