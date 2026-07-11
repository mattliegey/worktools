/*
 * WorkTools feedback report.
 *
 * Private admin view of submitted feedback. Uses supabase-js for magic-link
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

  var allRows = [];
  var filters = { type: "all", status: "all", tool: "all" };

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
