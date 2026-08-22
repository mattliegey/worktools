/*
 * Window Training — diagram player.
 *
 * Drives the animated SVG figures. There is no timeline library and no
 * per-element JavaScript: every moving part in a figure is a normal CSS
 * animation that is permanently paused, and playback position is expressed as
 * a single custom property `--t` (0..1) on the figure's .stage.
 *
 *   animation-play-state: paused;
 *   animation-delay: calc(var(--t) * var(--dur) * -1);
 *
 * A negative delay seeks an animation, so setting --t seeks every part of the
 * figure at once, in lockstep, for free. Scrubbing is therefore just writing a
 * number, and adding parts to a diagram costs no JS at all.
 *
 * To play, we hand the animation back to the browser's own clock: --t0 records
 * where playback started, the .playing class switches the delay to --t0 and the
 * play-state to running, and a rAF loop mirrors the position back into --t (and
 * the slider) so that pausing is seamless.
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
 * The player row (play/pause, scrubber, step chips) is generated from those
 * attributes, so the page source stays readable.
 */
(function () {
  "use strict";

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    /* matchMedia missing — treat as motion allowed. */
  }

  var SVG_NS = "http://www.w3.org/2000/svg";

  function svgIcon(paths, extraClass) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    if (extraClass) svg.setAttribute("class", extraClass);
    paths.forEach(function (d) {
      var p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    });
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

  function Player(figure) {
    this.figure = figure;
    this.stage = figure.querySelector(".stage");
    if (!this.stage) return;

    this.durMs = parseDuration(figure.getAttribute("data-dur"));
    this.steps = parseSteps(figure.getAttribute("data-steps"));
    this.t = reduceMotion ? 1 : 0;
    this.playing = false;
    this.rafId = 0;
    this.hasAutoPlayed = false;

    this.stage.style.setProperty("--dur", this.durMs + "ms");

    this.build();
    this.seek(this.t);
  }

  Player.prototype.build = function () {
    var self = this;
    var row = document.createElement("div");
    row.className = "player";

    // Play / pause
    var play = document.createElement("button");
    play.type = "button";
    play.className = "play";
    play.setAttribute("aria-label", "Play animation");
    play.appendChild(svgIcon(["M4.5 2.7v10.6a.6.6 0 0 0 .93.5l8-5.3a.6.6 0 0 0 0-1l-8-5.3a.6.6 0 0 0-.93.5z"], "ico-play"));
    play.appendChild(svgIcon(["M4 2.5h3v11H4zM9 2.5h3v11H9z"], "ico-pause"));
    play.addEventListener("click", function () {
      self.playing ? self.pause() : self.play();
    });
    row.appendChild(play);

    // Scrubber
    var scrub = document.createElement("input");
    scrub.type = "range";
    scrub.className = "scrub";
    scrub.min = "0";
    scrub.max = "1000";
    scrub.step = "1";
    scrub.value = String(Math.round(this.t * 1000));
    scrub.setAttribute("aria-label", "Scrub through the animation");
    scrub.addEventListener("input", function () {
      self.pause();
      self.seek(parseInt(scrub.value, 10) / 1000);
    });
    row.appendChild(scrub);

    // Step chips
    if (this.steps.length) {
      var chips = document.createElement("div");
      chips.className = "chips";
      this.chipEls = this.steps.map(function (step) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = step.label;
        chip.addEventListener("click", function () {
          self.pause();
          self.seek(step.t);
        });
        chips.appendChild(chip);
        return chip;
      });
      row.appendChild(chips);
    }

    this.playBtn = play;
    this.scrubEl = scrub;
    this.row = row;

    var caption = this.figure.querySelector("figcaption");
    if (caption) {
      this.figure.insertBefore(row, caption);
    } else {
      this.figure.appendChild(row);
    }
  };

  /* Write a position without touching playback state. */
  Player.prototype.seek = function (t) {
    this.t = Math.min(1, Math.max(0, t));
    this.stage.style.setProperty("--t", this.t);
    if (this.scrubEl) this.scrubEl.value = String(Math.round(this.t * 1000));
    this.markCurrentStep();
  };

  Player.prototype.markCurrentStep = function () {
    if (!this.chipEls) return;
    // The active chip is the last one whose t is at or before the playhead.
    var active = 0;
    for (var i = 0; i < this.steps.length; i++) {
      if (this.t + 1e-6 >= this.steps[i].t) active = i;
    }
    for (var j = 0; j < this.chipEls.length; j++) {
      this.chipEls[j].setAttribute("aria-current", j === active ? "true" : "false");
    }
  };

  Player.prototype.play = function () {
    if (this.playing) return;
    // Replaying from the end starts over rather than sitting on the last frame.
    var from = this.t >= 0.999 ? 0 : this.t;
    this.seek(from);

    this.playing = true;
    this.stage.style.setProperty("--t0", from);
    // Force a style flush so the delay change is picked up as a fresh start
    // rather than being coalesced with the class toggle below.
    void this.stage.offsetWidth;
    this.stage.classList.add("playing");
    this.row.classList.add("is-playing");
    this.playBtn.setAttribute("aria-label", "Pause animation");

    var self = this;
    var started = (window.performance && performance.now ? performance.now() : Date.now());
    var span = (1 - from) * this.durMs;

    (function tick(now) {
      if (!self.playing) return;
      var elapsed = (now || (window.performance && performance.now ? performance.now() : Date.now())) - started;
      if (elapsed >= span) {
        self.finish();
        return;
      }
      // Mirror the browser's clock into --t so a pause lands exactly here.
      self.t = from + (elapsed / self.durMs);
      if (self.scrubEl) self.scrubEl.value = String(Math.round(self.t * 1000));
      self.markCurrentStep();
      self.rafId = requestAnimationFrame(tick);
    })();
  };

  Player.prototype.pause = function () {
    if (!this.playing) return;
    this.playing = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.stage.classList.remove("playing");
    this.row.classList.remove("is-playing");
    this.playBtn.setAttribute("aria-label", "Play animation");
    // Re-assert the paused position we were mirroring during playback.
    this.seek(this.t);
  };

  Player.prototype.finish = function () {
    this.playing = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.stage.classList.remove("playing");
    this.row.classList.remove("is-playing");
    this.playBtn.setAttribute("aria-label", "Play animation");
    this.seek(1);
  };

  function init() {
    var figures = document.querySelectorAll(".figure");
    if (!figures.length) return;

    var players = [];
    for (var i = 0; i < figures.length; i++) {
      var p = new Player(figures[i]);
      if (p.stage) {
        figures[i].__player = p;
        players.push(p);
      }
    }

    // Play a figure the first time it is scrolled into view, and pause it when
    // it leaves so off-screen diagrams aren't burning frames. Never when the
    // visitor has asked for reduced motion.
    if (reduceMotion || !("IntersectionObserver" in window)) return;

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var player = entry.target.__player;
          if (!player) return;
          if (entry.isIntersecting) {
            if (!player.hasAutoPlayed) {
              player.hasAutoPlayed = true;
              player.play();
            }
          } else {
            player.pause();
          }
        });
      },
      { threshold: 0.45 }
    );

    players.forEach(function (p) {
      io.observe(p.figure);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
