/*
 * Window Training — diagram stepper.
 *
 * The animated SVG figures are stepped through by hand, one named stage at a
 * time — back and forward arrows, plus a chip per stage. Nothing plays on its
 * own and there is no scrubber: on a ladder with one hand free you want to
 * land on "parting bead out" and stay there.
 *
 * There is no timeline library and no per-element JavaScript. Every moving
 * part in a figure is a normal CSS animation that is permanently paused, and
 * position is expressed as a single custom property `--t` (0..1) on .stage:
 *
 *   animation-play-state: paused;
 *   animation-delay: calc(var(--t) * var(--dur) * -1);
 *
 * A negative delay seeks an animation, so writing --t seeks every part of the
 * figure at once, in lockstep. Adding parts to a diagram costs no JS at all.
 *
 * Moving between stages tweens --t across the gap rather than snapping, so you
 * still see the bar lever and the sash lift — the motion is the teaching, the
 * arrows just decide when it happens. Reduced motion jumps instead.
 *
 * Figure markup contract:
 *
 *   <figure class="figure"
 *           data-dur="7s"
 *           data-steps="0:Intact|0.4:Scored|1:Stop removed">
 *     <div class="stage"> <svg>…</svg> </div>
 *     <figcaption>…</figcaption>
 *   </figure>
 *
 * A figure with fewer than two stages is static and gets no controls.
 */
(function () {
  "use strict";

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    /* matchMedia missing — treat as motion allowed. */
  }

  // How long a step transition runs: proportional to the distance travelled,
  // but always long enough to read and short enough not to feel like waiting.
  var MIN_MS = 320;
  var MAX_MS = 1100;

  var SVG_NS = "http://www.w3.org/2000/svg";

  function chevron(dir) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", dir < 0 ? "M10 3 L5 8 L10 13" : "M6 3 L11 8 L6 13");
    svg.appendChild(p);
    return svg;
  }

  // "7s" / "7000ms" / "7" -> milliseconds
  function parseDuration(raw) {
    if (!raw) return 6000;
    var m = /^\s*([\d.]+)\s*(ms|s)?\s*$/.exec(raw);
    if (!m) return 6000;
    var n = parseFloat(m[1]);
    if (!isFinite(n) || n <= 0) return 6000;
    return m[2] === "ms" ? n : n * 1000;
  }

  // "0:Intact|0.4:Scored|1:Done" -> [{t:0,label:"Intact"}, …]
  function parseSteps(raw) {
    if (!raw) return [];
    return raw
      .split("|")
      .map(function (chunk) {
        var i = chunk.indexOf(":");
        if (i === -1) return null;
        var t = parseFloat(chunk.slice(0, i));
        var label = chunk.slice(i + 1).trim();
        if (!isFinite(t) || !label) return null;
        return { t: Math.min(1, Math.max(0, t)), label: label };
      })
      .filter(Boolean);
  }

  function now() {
    return window.performance && performance.now ? performance.now() : Date.now();
  }

  function Player(figure) {
    this.figure = figure;
    this.stage = figure.querySelector(".stage");
    if (!this.stage) return;

    this.durMs = parseDuration(figure.getAttribute("data-dur"));
    this.steps = parseSteps(figure.getAttribute("data-steps"));
    this.rafId = 0;

    this.stage.style.setProperty("--dur", this.durMs + "ms");

    // A single-stage figure is just a drawing — no controls, no stepping.
    if (this.steps.length < 2) {
      this.static = true;
      this.seek(this.steps.length ? this.steps[0].t : 0);
      return;
    }

    this.idx = 0;
    this.seek(this.steps[0].t);
    this.build();
    this.render();
  }

  Player.prototype.build = function () {
    var self = this;
    var row = document.createElement("div");
    row.className = "player";

    function arrow(dir, label) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "nav";
      b.setAttribute("aria-label", label);
      b.appendChild(chevron(dir));
      b.addEventListener("click", function () { self.step(dir); });
      return b;
    }

    this.prevBtn = arrow(-1, "Previous stage");
    this.nextBtn = arrow(1, "Next stage");

    var readout = document.createElement("div");
    readout.className = "readout";
    this.nameEl = document.createElement("span");
    this.nameEl.className = "stage-name";
    this.countEl = document.createElement("span");
    this.countEl.className = "stage-count";
    readout.appendChild(this.nameEl);
    readout.appendChild(this.countEl);

    row.appendChild(this.prevBtn);
    row.appendChild(readout);
    row.appendChild(this.nextBtn);

    var chips = document.createElement("div");
    chips.className = "chips";
    this.chipEls = this.steps.map(function (step, i) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = step.label;
      chip.addEventListener("click", function () { self.goTo(i); });
      chips.appendChild(chip);
      return chip;
    });
    row.appendChild(chips);

    this.row = row;

    // Left/right keys drive the figure once it has focus.
    this.figure.setAttribute("tabindex", "0");
    this.figure.setAttribute("role", "group");
    this.figure.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { self.step(-1); e.preventDefault(); }
      else if (e.key === "ArrowRight") { self.step(1); e.preventDefault(); }
      else if (e.key === "Home") { self.goTo(0); e.preventDefault(); }
      else if (e.key === "End") { self.goTo(self.steps.length - 1); e.preventDefault(); }
    });

    var caption = this.figure.querySelector("figcaption");
    if (caption) this.figure.insertBefore(row, caption);
    else this.figure.appendChild(row);
  };

  /* Write a position. This is the only thing that moves a diagram. */
  Player.prototype.seek = function (t) {
    this.t = Math.min(1, Math.max(0, t));
    this.stage.style.setProperty("--t", this.t);
  };

  Player.prototype.step = function (dir) {
    this.goTo(this.idx + dir);
  };

  Player.prototype.goTo = function (i, instant) {
    if (this.static) return;
    i = Math.min(this.steps.length - 1, Math.max(0, i));
    var from = this.t;
    var to = this.steps[i].t;
    this.idx = i;
    this.render();

    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; }
    if (instant || reduceMotion || from === to) {
      this.seek(to);
      return;
    }
    this.tween(from, to);
  };

  Player.prototype.tween = function (from, to) {
    var self = this;
    var span = Math.abs(to - from);
    var ms = Math.max(MIN_MS, Math.min(MAX_MS, span * this.durMs));
    var started = now();

    this.figure.classList.add("is-moving");

    (function frame() {
      var p = (now() - started) / ms;
      if (p >= 1) {
        self.seek(to);
        self.rafId = 0;
        self.figure.classList.remove("is-moving");
        return;
      }
      // easeInOutQuad — the CSS animations are linear, so the feel is set here.
      var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      self.seek(from + (to - from) * e);
      self.rafId = requestAnimationFrame(frame);
    })();
  };

  Player.prototype.render = function () {
    var step = this.steps[this.idx];
    this.nameEl.textContent = step.label;
    this.countEl.textContent = (this.idx + 1) + " / " + this.steps.length;
    this.prevBtn.disabled = this.idx === 0;
    this.nextBtn.disabled = this.idx === this.steps.length - 1;
    for (var i = 0; i < this.chipEls.length; i++) {
      this.chipEls[i].setAttribute("aria-current", i === this.idx ? "true" : "false");
    }
  };

  function init() {
    var figures = document.querySelectorAll(".figure");
    for (var i = 0; i < figures.length; i++) {
      var p = new Player(figures[i]);
      if (p.stage) figures[i].__player = p;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
