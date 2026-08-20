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
