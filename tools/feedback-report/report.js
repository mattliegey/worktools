/*
 * WorkTools reports.
 *
 * Private admin view of page visits and submitted feedback. Uses supabase-js for magic-link
 * auth and queries. Row Level Security means only an authenticated user can
 * read/update rows, so this page is safe to host publicly — without a valid
 * login it can't see any data.
 */
(function () {
  "use strict";

  var cfg = window.WORKTOOLS_SUPABASE;
  var boot = document.getElementById("bootLoading");

  if (!cfg || !cfg.url || !cfg.anonKey || /YOUR-/.test(cfg.url) || /YOUR-/.test(cfg.anonKey)) {
    boot.textContent = "Supabase is not configured yet. Fill in assets/feedback-config.js.";
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    boot.textContent = "Could not load Supabase client library.";
    return;
  }

  var sb = window.supabase.createClient(cfg.url, cfg.anonKey);

  var loginView = document.getElementById("loginView");
  var reportView = document.getElementById("reportView");
  var loginForm = document.getElementById("loginForm");
  var loginEmail = document.getElementById("loginEmail");
  var loginBtn = document.getElementById("loginBtn");
  var loginNote = document.getElementById("loginNote");

  var summaryEl = document.getElementById("summary");
  var listEl = document.getElementById("list");
  var toolFiltersEl = document.getElementById("toolFilters");
  var visitsBodyEl = document.getElementById("visitsBody");

  var allRows = [];
  var filters = { type: "all", status: "all", tool: "all" };
  var visitRange = "30";   // "7" | "30" | "all"

  var TYPE_LABELS = { bug: "🐞 Bug", idea: "💡 Idea", feedback: "💬 Feedback" };

  function show(view) {
    boot.hidden = true;
    loginView.hidden = view !== "login";
    reportView.hidden = view !== "report";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return iso || "";
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit"
    });
  }

  // ---- Auth ----------------------------------------------------------------

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = loginEmail.value.trim();
    if (!email) return;
    loginBtn.disabled = true;
    loginNote.textContent = "Sending…";
    loginNote.className = "note";
    sb.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: location.href.split("#")[0] }
    }).then(function (res) {
      loginBtn.disabled = false;
      if (res.error) {
        loginNote.textContent = res.error.message || "Could not send link.";
        loginNote.className = "note err";
      } else {
        loginNote.textContent = "Check your email for the sign-in link. ✅";
        loginNote.className = "note ok";
      }
    });
  });

  document.getElementById("signOutBtn").addEventListener("click", function () {
    sb.auth.signOut().then(function () { show("login"); });
  });
  document.getElementById("refreshBtn").addEventListener("click", loadData);

  // React to auth state (initial session + magic-link return).
  sb.auth.onAuthStateChange(function (_event, session) {
    if (session && session.user) {
      show("report");
      loadData();
    } else {
      show("login");
    }
  });

  // Kick things off from the current session.
  sb.auth.getSession().then(function (res) {
    var session = res.data && res.data.session;
    if (session && session.user) {
      show("report");
      loadData();
    } else {
      show("login");
    }
  });

  // ---- Data ----------------------------------------------------------------

  function loadData() {
    loadVisits();
    listEl.innerHTML = '<div class="loading">Loading…</div>';
    sb.from("feedback")
      .select("*")
      .order("created_at", { ascending: false })
      .then(function (res) {
        if (res.error) {
          listEl.innerHTML = '<div class="empty">Error loading feedback: ' +
            esc(res.error.message) + "</div>";
          return;
        }
        allRows = res.data || [];
        buildToolFilters();
        render();
      });
  }

  function buildToolFilters() {
    var tools = [];
    allRows.forEach(function (r) {
      if (r.tool && tools.indexOf(r.tool) === -1) tools.push(r.tool);
    });
    tools.sort();
    var html = '<button type="button" class="chip" data-f="tool" data-v="all" aria-pressed="' +
      (filters.tool === "all") + '">All tools</button>';
    html += tools.map(function (t) {
      return '<button type="button" class="chip" data-f="tool" data-v="' + esc(t) +
        '" aria-pressed="' + (filters.tool === t) + '">' + esc(t) + "</button>";
    }).join("");
    toolFiltersEl.innerHTML = html;
  }

  // Filter chip handling (delegated so it covers dynamic tool chips too).
  document.querySelector("main").addEventListener("click", function (e) {
    var chip = e.target.closest ? e.target.closest(".chip") : null;
    if (!chip) return;
    var f = chip.dataset.f, v = chip.dataset.v;
    if (!f) return;
    if (f === "range") {
      visitRange = v;
      Array.prototype.forEach.call(chip.parentElement.querySelectorAll(".chip"), function (c) {
        c.setAttribute("aria-pressed", String(c.dataset.v === v));
      });
      loadVisits();
      return;
    }
    filters[f] = v;
    // Update pressed state within the same group.
    var group = chip.parentElement;
    Array.prototype.forEach.call(group.querySelectorAll(".chip"), function (c) {
      c.setAttribute("aria-pressed", String(c.dataset.v === v));
    });
    render();
  });

  function applyFilters() {
    return allRows.filter(function (r) {
      if (filters.type !== "all" && r.type !== filters.type) return false;
      if (filters.status !== "all" && (r.status || "new") !== filters.status) return false;
      if (filters.tool !== "all" && r.tool !== filters.tool) return false;
      return true;
    });
  }

  // ---- Page visits ---------------------------------------------------------

  function fmtRelative(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    if (mins < 60 * 24) return Math.round(mins / 60) + "h ago";
    var days = Math.round(mins / (60 * 24));
    if (days < 30) return days + "d ago";
    return fmtDate(iso).split(",")[0];
  }

  function loadVisits() {
    visitsBodyEl.innerHTML = '<div class="loading">Loading…</div>';
    var days = visitRange === "all" ? null : parseInt(visitRange, 10);
    loadTrend(days);
    sb.rpc("page_view_stats", { days: days }).then(function (res) {
      if (res.error) {
        // Most likely cause: the page_views migration hasn't been run yet.
        var msg = /page_view_stats|does not exist|schema cache/i.test(res.error.message || "")
          ? "Visit tracking isn't set up in Supabase yet — run the SQL in " +
            "supabase/migrations/20260820120000_create_page_views.sql. " +
            "See docs/analytics-setup.md."
          : "Error loading visits: " + esc(res.error.message);
        visitsBodyEl.innerHTML = '<div class="empty">' + msg + "</div>";
        return;
      }
      renderVisits(res.data || []);
    });
  }

  function loadTrend(days) {
    // Send the viewer's timezone so a visit at 8pm local lands on that local day.
    var tz = "UTC";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) {}
    sb.rpc("page_view_daily", { days: days, tz: tz }).then(function (res) {
      if (res.error) {
        dailyRows = [];
        trendError = /page_view_daily|does not exist|schema cache/i.test(res.error.message || "")
          ? "Trend chart needs one more migration — run supabase/migrations/" +
            "20260820140000_add_page_view_daily.sql. See docs/analytics-setup.md."
          : "Error loading trend: " + res.error.message;
        renderTrend();
        return;
      }
      trendError = "";
      dailyRows = res.data || [];
      renderTrend();
    });
  }

  function renderVisits(rows) {
    if (!rows.length) {
      visitsBodyEl.innerHTML = '<div class="empty">No visits recorded in this range yet.</div>';
      return;
    }

    var totalViews = 0, totalVisits = 0, max = 0;
    rows.forEach(function (r) {
      totalViews += Number(r.views) || 0;
      totalVisits += Number(r.visits) || 0;
      if ((Number(r.views) || 0) > max) max = Number(r.views) || 0;
    });

    var stats = [
      { num: totalViews, lbl: "Total views" },
      { num: totalVisits, lbl: "Sessions" },
      { num: rows.length, lbl: "Pages visited" }
    ];
    var html = '<div class="summary">' + stats.map(function (s) {
      return '<div class="stat"><div class="num">' + s.num + '</div><div class="lbl">' +
        s.lbl + "</div></div>";
    }).join("") + "</div>";

    html += '<div class="panel trend-panel"><div id="trendChart"></div></div>';

    html += '<p class="visit-note">Views are page loads. Sessions are distinct browser ' +
      'sessions — someone opening three tools in one tab counts once.</p>';

    html += '<div class="panel"><table class="visit-table">' +
      "<thead><tr>" +
        "<th>Tool page</th>" +
        '<th class="num">Views</th>' +
        '<th class="num">Sessions</th>' +
        "<th>Last seen</th>" +
      "</tr></thead><tbody>" +
      rows.map(function (r) {
        var views = Number(r.views) || 0;
        var pct = max ? Math.max(7, Math.round((views / max) * 100)) : 0;
        return "<tr>" +
          '<td class="visit-name">' +
            '<span class="bar" style="width:' + pct + '%"></span>' +
            '<span class="label">' + esc(r.tool) + "</span>" +
            (r.path ? '<span class="path">' + esc(r.path) + "</span>" : "") +
          "</td>" +
          '<td class="num"><span class="n">' + views + "</span></td>" +
          '<td class="num">' + (Number(r.visits) || 0) + "</td>" +
          '<td class="visit-when">' + esc(fmtRelative(r.last_seen)) + "</td>" +
        "</tr>";
      }).join("") +
      "</tbody></table></div>";

    visitsBodyEl.innerHTML = html;
    renderTrend();   // the innerHTML swap above replaced the chart's host node
  }

  // ---- Trend chart ---------------------------------------------------------
  //
  // A stacked column per day: bar height is that day's total views, segments
  // show which tool drove them. Hand-rolled SVG — the site has no build step and
  // pulls in no chart library.
  //
  // Categorical palette, validated for both themes against the panel surface
  // (CVD separation, normal-vision separation, lightness, chroma). Three light
  // hues sit under 3:1 contrast on white, which is allowed only with relief:
  // the legend, the "Show daily numbers" table, and the per-tool table below
  // all carry the values in text, so nothing is reachable by colour alone.
  var SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
  var SERIES_DARK  = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

  // Colour follows the tool, never its rank — so switching range never repaints
  // the survivors. Known pages hold fixed slots; anything new is appended in
  // sorted order, and past slot 8 folds into a neutral "Other".
  var TOOL_ORDER = [
    "WorkTools",
    "Shingle Calculator",
    "Margin & Markup Calculator",
    "Deck Board Calculator",
    "Hardie Siding Calculator"
  ];
  var OTHER_COLOR = "#8b93a1";

  var dailyRows = [];      // last loaded daily data, kept for re-render on resize
  var trendError = "";     // sticky, so a re-render can't clobber it with "no visits"
  var trendResizeBound = false;

  function isDark() {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function colorFor(tool, unknownList) {
    var i = TOOL_ORDER.indexOf(tool);
    if (i === -1) {
      var u = unknownList.indexOf(tool);
      i = u === -1 ? -1 : TOOL_ORDER.length + u;
    }
    var palette = isDark() ? SERIES_DARK : SERIES_LIGHT;
    if (i < 0 || i >= palette.length) return OTHER_COLOR;
    return palette[i];
  }

  function svgEl(tag, attrs) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    }
    return n;
  }

  // 'YYYY-MM-DD' -> UTC-anchored Date, so plain calendar dates never shift a day
  // through a local-timezone or DST conversion.
  function parseDay(s) {
    var p = String(s).split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }
  function dayKey(d) {
    return d.getUTCFullYear() + "-" +
      String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(d.getUTCDate()).padStart(2, "0");
  }
  function fmtDay(d, withYear) {
    var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return MON[d.getUTCMonth()] + " " + d.getUTCDate() + (withYear ? ", " + d.getUTCFullYear() : "");
  }

  // Whole-number axis ticks — view counts are integers, so 0/1/2 beats 0/0.5/1.
  function niceTicks(max) {
    if (max <= 0) return [0, 1];
    var steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (max / s <= 4) {
        var ticks = [], v = 0;
        while (v <= max + s - 0.0001) { ticks.push(v); v += s; }
        return ticks;
      }
    }
    var big = Math.ceil(max / 4);
    return [0, big, big * 2, big * 3, big * 4];
  }

  // Fill in days with no visits, so a gap reads as zero rather than vanishing.
  function buildDays(rows) {
    var todayKey;
    try {
      todayKey = new Date().toLocaleDateString("en-CA");  // local YYYY-MM-DD
    } catch (e) {
      todayKey = dayKey(new Date());
    }
    var end = parseDay(todayKey);
    var start;
    if (visitRange === "all") {
      start = rows.length ? parseDay(rows[0].day) : end;
      rows.forEach(function (r) {
        var d = parseDay(r.day);
        if (d < start) start = d;
        if (d > end) end = d;
      });
    } else {
      start = new Date(end.getTime() - (parseInt(visitRange, 10) - 1) * 86400000);
      rows.forEach(function (r) {
        var d = parseDay(r.day);
        if (d < start) start = d;
      });
    }
    var days = [], cur = new Date(start.getTime());
    while (cur <= end && days.length < 800) {
      days.push({ date: new Date(cur.getTime()), key: dayKey(cur), byTool: {}, total: 0 });
      cur = new Date(cur.getTime() + 86400000);
    }
    var index = {};
    days.forEach(function (d, i) { index[d.key] = i; });
    rows.forEach(function (r) {
      var i = index[r.day];
      if (i === undefined) return;
      var v = Number(r.views) || 0;
      days[i].byTool[r.tool] = (days[i].byTool[r.tool] || 0) + v;
      days[i].total += v;
    });
    return days;
  }

  function renderTrend() {
    var host = document.getElementById("trendChart");
    if (!host) return;
    host.innerHTML = "";

    if (trendError) {
      var err = document.createElement("div");
      err.className = "empty";
      err.textContent = trendError;
      host.appendChild(err);
      return;
    }

    if (!dailyRows.length) {
      var none = document.createElement("div");
      none.className = "empty";
      none.textContent = "No visits recorded in this range yet.";
      host.appendChild(none);
      return;
    }

    var days = buildDays(dailyRows);

    // Stable series order + colours.
    var tools = [];
    dailyRows.forEach(function (r) { if (tools.indexOf(r.tool) === -1) tools.push(r.tool); });
    var unknown = tools.filter(function (t) { return TOOL_ORDER.indexOf(t) === -1; }).sort();
    var ordered = TOOL_ORDER.filter(function (t) { return tools.indexOf(t) !== -1; }).concat(unknown);
    var colors = {};
    ordered.forEach(function (t) { colors[t] = colorFor(t, unknown); });

    // Geometry. Height includes the x-axis band so nothing gets clipped.
    var W = Math.max(280, host.clientWidth || 640);
    var padL = 34, padR = 10, padT = 12, padB = 24;
    var plotH = 150;
    var H = padT + plotH + padB;
    var plotW = W - padL - padR;

    var maxTotal = days.reduce(function (m, d) { return Math.max(m, d.total); }, 0);
    var ticks = niceTicks(maxTotal);
    var yMax = ticks[ticks.length - 1] || 1;
    function yOf(v) { return padT + plotH - (v / yMax) * plotH; }

    var band = plotW / days.length;
    var barW = Math.max(1, Math.min(24, band - 2));

    var svg = svgEl("svg", {
      width: W, height: H, viewBox: "0 0 " + W + " " + H,
      class: "trend-svg", role: "img",
      "aria-label": "Daily page views by tool, " +
        (visitRange === "all" ? "all time" : "last " + visitRange + " days")
    });

    // Gridlines + y ticks: solid hairlines, one step off the surface.
    ticks.forEach(function (t) {
      var y = yOf(t);
      svg.appendChild(svgEl("line", {
        x1: padL, y1: y, x2: W - padR, y2: y, class: "trend-grid"
      }));
      var lab = svgEl("text", { x: padL - 6, y: y + 3.5, class: "trend-ytick" });
      lab.textContent = String(t);
      svg.appendChild(lab);
    });

    // Stacked columns.
    var gBars = svgEl("g", {});
    days.forEach(function (d, i) {
      var g = svgEl("g", { class: "trend-day", "data-i": String(i) });
      var cx = padL + band * i + band / 2;
      var x = cx - barW / 2;
      var acc = 0;
      // Draw from the top of the stack down so the topmost segment is the data-end.
      var present = ordered.filter(function (t) { return (d.byTool[t] || 0) > 0; });
      present.forEach(function (t, idx) {
        var v = d.byTool[t];
        var yTop = yOf(acc + v);
        var yBot = yOf(acc);
        acc += v;
        var h = yBot - yTop;
        var isTop = idx === present.length - 1;
        // 2px surface gap between touching segments (never a stroke).
        var gap = idx === 0 ? 0 : 2;
        var drawH = Math.max(1, h - gap);
        var drawY = yTop;
        var node;
        if (isTop && drawH > 4) {
          // 4px rounded data-end, square at the baseline.
          var r = 4;
          node = svgEl("path", {
            d: "M" + x + "," + (drawY + drawH) +
               "L" + x + "," + (drawY + r) +
               "Q" + x + "," + drawY + " " + (x + r) + "," + drawY +
               "L" + (x + barW - r) + "," + drawY +
               "Q" + (x + barW) + "," + drawY + " " + (x + barW) + "," + (drawY + r) +
               "L" + (x + barW) + "," + (drawY + drawH) + "Z",
            fill: colors[t]
          });
        } else {
          node = svgEl("rect", { x: x, y: drawY, width: barW, height: drawH, fill: colors[t] });
        }
        g.appendChild(node);
      });
      gBars.appendChild(g);
    });
    svg.appendChild(gBars);

    // Baseline.
    svg.appendChild(svgEl("line", {
      x1: padL, y1: yOf(0), x2: W - padR, y2: yOf(0), class: "trend-axis"
    }));

    // Direct-label only the busiest day — sparing, so it still registers.
    var peak = -1, peakVal = 0;
    days.forEach(function (d, i) { if (d.total > peakVal) { peakVal = d.total; peak = i; } });
    if (peak >= 0 && peakVal > 0) {
      var text = String(peakVal);
      if (band >= text.length * 7 + 6) {
        var pl = svgEl("text", {
          x: padL + band * peak + band / 2,
          y: yOf(peakVal) - 5,
          class: "trend-peak"
        });
        pl.textContent = text;
        svg.appendChild(pl);
      }
    }

    // X labels, thinned to whatever fits without collisions.
    var maxLabels = Math.max(2, Math.floor(plotW / 58));
    var stride = Math.max(1, Math.ceil(days.length / maxLabels));
    days.forEach(function (d, i) {
      var last = i === days.length - 1;
      if (i % stride !== 0 && !last) return;
      if (last && (days.length - 1) % stride !== 0 && stride > 1 &&
          (days.length - 1) % stride < stride / 2) return;
      var tx = svgEl("text", {
        x: padL + band * i + band / 2, y: padT + plotH + 15, class: "trend-xtick"
      });
      tx.textContent = fmtDay(d.date, false);
      svg.appendChild(tx);
    });

    // Hit layer: one full-height target per day, wider than the bar and
    // keyboard-focusable, so the value never depends on landing on the mark.
    var gHit = svgEl("g", {});
    days.forEach(function (d, i) {
      var parts = ordered.filter(function (t) { return (d.byTool[t] || 0) > 0; })
        .map(function (t) { return t + " " + d.byTool[t]; }).join(", ");
      var hit = svgEl("rect", {
        x: padL + band * i, y: padT, width: band, height: plotH,
        fill: "transparent", class: "trend-hit", tabindex: "0", "data-i": String(i),
        role: "button",
        "aria-label": fmtDay(d.date, true) + ": " + d.total +
          (d.total === 1 ? " view" : " views") + (parts ? " — " + parts : "")
      });
      gHit.appendChild(hit);
    });
    svg.appendChild(gHit);
    host.appendChild(svg);

    // Legend — always present for two or more series.
    if (ordered.length > 1) {
      var leg = document.createElement("div");
      leg.className = "trend-legend";
      ordered.forEach(function (t) {
        var item = document.createElement("span");
        item.className = "trend-legend-item";
        var sw = document.createElement("span");
        sw.className = "trend-swatch";
        sw.style.background = colors[t];
        var nm = document.createElement("span");
        nm.textContent = t;               // untrusted label -> textContent
        item.appendChild(sw);
        item.appendChild(nm);
        leg.appendChild(item);
      });
      host.appendChild(leg);
    }

    // Table view of the same numbers, so the chart never gates a value.
    var det = document.createElement("details");
    det.className = "trend-table-wrap";
    var sum = document.createElement("summary");
    sum.textContent = "Show daily numbers";
    det.appendChild(sum);
    var tbl = document.createElement("table");
    tbl.className = "visit-table trend-table";
    var thead = document.createElement("thead");
    var htr = document.createElement("tr");
    ["Day"].concat(ordered).concat(["Total"]).forEach(function (h, i) {
      var th = document.createElement("th");
      th.textContent = h;
      if (i > 0) th.className = "num";
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    tbl.appendChild(thead);
    var tbody = document.createElement("tbody");
    days.slice().reverse().forEach(function (d) {
      if (!d.total) return;
      var tr = document.createElement("tr");
      var td0 = document.createElement("td");
      td0.textContent = fmtDay(d.date, true);
      tr.appendChild(td0);
      ordered.forEach(function (t) {
        var td = document.createElement("td");
        td.className = "num";
        td.textContent = d.byTool[t] ? String(d.byTool[t]) : "—";
        tr.appendChild(td);
      });
      var tdT = document.createElement("td");
      tdT.className = "num";
      tdT.textContent = String(d.total);
      tr.appendChild(tdT);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    var scroller = document.createElement("div");
    scroller.className = "trend-table-scroll";
    scroller.appendChild(tbl);
    det.appendChild(scroller);
    host.appendChild(det);

    // Tooltip — same content on hover and on keyboard focus.
    var tip = document.createElement("div");
    tip.className = "trend-tip";
    tip.hidden = true;
    host.appendChild(tip);

    function showTip(i) {
      var d = days[i];
      tip.innerHTML = "";
      var dayEl = document.createElement("div");
      dayEl.className = "trend-tip-day";
      dayEl.textContent = fmtDay(d.date, true);
      tip.appendChild(dayEl);
      var tot = document.createElement("div");
      tot.className = "trend-tip-total";
      tot.textContent = d.total + (d.total === 1 ? " view" : " views");
      tip.appendChild(tot);
      ordered.forEach(function (t) {
        if (!d.byTool[t]) return;
        var row = document.createElement("div");
        row.className = "trend-tip-row";
        var key = document.createElement("span");
        key.className = "trend-tip-key";
        key.style.background = colors[t];
        var nm = document.createElement("span");
        nm.className = "trend-tip-name";
        nm.textContent = t;
        var val = document.createElement("span");
        val.className = "trend-tip-val";
        val.textContent = String(d.byTool[t]);
        row.appendChild(key); row.appendChild(nm); row.appendChild(val);
        tip.appendChild(row);
      });
      tip.hidden = false;

      var cx = padL + band * i + band / 2;
      var tw = tip.offsetWidth;
      var left = Math.max(4, Math.min(W - tw - 4, cx - tw / 2));
      tip.style.left = left + "px";
      tip.style.top = Math.max(0, yOf(d.total) - tip.offsetHeight - 10) + "px";

      Array.prototype.forEach.call(gBars.children, function (g, gi) {
        g.classList.toggle("is-hot", gi === i);
      });
    }
    function hideTip() {
      tip.hidden = true;
      Array.prototype.forEach.call(gBars.children, function (g) { g.classList.remove("is-hot"); });
    }

    Array.prototype.forEach.call(gHit.children, function (hit) {
      var i = Number(hit.getAttribute("data-i"));
      hit.addEventListener("pointerenter", function () { showTip(i); });
      hit.addEventListener("focus", function () { showTip(i); });
      hit.addEventListener("blur", hideTip);
    });
    svg.addEventListener("pointerleave", hideTip);

    if (!trendResizeBound && window.ResizeObserver) {
      trendResizeBound = true;
      var ro = new ResizeObserver(function () { renderTrend(); });
      ro.observe(host.parentNode);
    }
  }

  // ---- Feedback summary ----------------------------------------------------

  function renderSummary() {
    var total = allRows.length;
    var newCount = allRows.filter(function (r) { return (r.status || "new") === "new"; }).length;
    var bugs = allRows.filter(function (r) { return r.type === "bug"; }).length;
    var ideas = allRows.filter(function (r) { return r.type === "idea"; }).length;
    var stats = [
      { num: total, lbl: "Total" },
      { num: newCount, lbl: "New" },
      { num: bugs, lbl: "Bugs" },
      { num: ideas, lbl: "Ideas" }
    ];
    summaryEl.innerHTML = stats.map(function (s) {
      return '<div class="stat"><div class="num">' + s.num + '</div><div class="lbl">' +
        s.lbl + "</div></div>";
    }).join("");
  }

  function render() {
    renderSummary();
    var rows = applyFilters();
    if (!rows.length) {
      listEl.innerHTML = '<div class="empty">No feedback matches these filters.</div>';
      return;
    }
    listEl.innerHTML = rows.map(itemHtml).join("");
  }

  function itemHtml(r) {
    var status = r.status || "new";
    var resolved = status === "resolved";
    var typeLabel = TYPE_LABELS[r.type] || esc(r.type);
    var meta = [];
    if (r.email) {
      meta.push('<span>✉️ <a href="mailto:' + esc(r.email) + '">' + esc(r.email) + "</a></span>");
    }
    if (r.page_url) {
      meta.push('<a href="' + esc(r.page_url) + '" target="_blank" rel="noopener">Open page ↗</a>');
    }
    var actionLabel = resolved ? "Reopen" : "Mark resolved";
    var nextStatus = resolved ? "new" : "resolved";

    return '<div class="panel item ' + (resolved ? "is-resolved" : "") + '" data-id="' + esc(r.id) + '">' +
      '<div class="item-head">' +
        '<span class="badge type-' + esc(r.type) + '">' + typeLabel + "</span>" +
        (r.tool ? '<span class="badge tool">' + esc(r.tool) + "</span>" : "") +
        (resolved ? '<span class="badge">Resolved</span>' : "") +
        '<span class="item-date">' + esc(fmtDate(r.created_at)) + "</span>" +
      "</div>" +
      '<p class="item-msg">' + esc(r.message) + "</p>" +
      '<div class="item-meta">' + meta.join("") +
        '<span class="item-actions">' +
          '<button type="button" class="btn resolve-btn" data-id="' + esc(r.id) +
            '" data-next="' + nextStatus + '">' + actionLabel + "</button>" +
        "</span>" +
      "</div>" +
    "</div>";
  }

  // Resolve / reopen.
  listEl.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(".resolve-btn") : null;
    if (!btn) return;
    var id = btn.dataset.id;
    var next = btn.dataset.next;
    btn.disabled = true;
    sb.from("feedback").update({ status: next }).eq("id", id).then(function (res) {
      if (res.error) {
        btn.disabled = false;
        alert("Could not update: " + res.error.message);
        return;
      }
      var row = allRows.filter(function (r) { return String(r.id) === String(id); })[0];
      if (row) row.status = next;
      render();
    });
  });
})();
