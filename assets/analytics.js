/*
 * WorkTools visit counter.
 *
 * A dependency-free beacon: on page load it records one row in the Supabase
 * `page_views` table saying which tool page was viewed. Counts are reviewed in
 * the private report at tools/feedback-report/ — nothing is ever displayed to
 * visitors, and nothing is read back with the public anon key (Row Level
 * Security only allows INSERT).
 *
 * Include on a page with:
 *   <script src="/path/to/assets/feedback-config.js"></script>
 *   <script src="/path/to/assets/analytics.js" defer></script>
 *
 * Deliberately not included on tools/feedback-report/ — that's Matt's own admin
 * page, and counting it would inflate the numbers it reports.
 */
(function () {
  "use strict";

  // ---- Tunables -----------------------------------------------------------
  // Honour browsers that ask not to be tracked. Set to false to count everyone
  // (this beacon is anonymous either way — no cookies, no cross-site id).
  var RESPECT_DO_NOT_TRACK = true;
  // Hostnames that never count, so local testing doesn't pollute the stats.
  var IGNORED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", ""];

  var cfg = window.WORKTOOLS_SUPABASE;
  if (!cfg || !cfg.url || !cfg.anonKey) {
    // Config missing — fail quietly rather than breaking the page.
    return;
  }

  if (IGNORED_HOSTS.indexOf(location.hostname) !== -1) return;

  if (RESPECT_DO_NOT_TRACK) {
    var dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
    if (dnt === "1" || dnt === "yes") return;
  }

  // Headless browsers and most automation set this; crawlers that don't run JS
  // never get here at all.
  if (navigator.webdriver) return;

  // Same derivation as the feedback widget, so a tool's name matches across
  // both reports (e.g. "Shingle Calculator", or "WorkTools" for the landing page).
  function currentTool() {
    var t = (document.title || "").replace(/\s*[—-]\s*WorkTools\s*$/i, "").trim();
    return t || document.title || "Unknown";
  }

  // '/worktools/tools/shingles/index.html' -> '/worktools/tools/shingles/'
  function currentPath() {
    return location.pathname.replace(/index\.html$/i, "") || "/";
  }

  // A random id kept for the browser tab's session. Not tied to any identity
  // and not shared across tabs or sites — it exists only so the report can tell
  // "12 views" apart from "3 people looked 4 times each". If storage is
  // unavailable (private mode, storage disabled) we send null and the row still
  // counts as a view.
  function sessionId() {
    try {
      var key = "wt_sid";
      var id = sessionStorage.getItem(key);
      if (!id) {
        id = (Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 24);
        sessionStorage.setItem(key, id);
      }
      return id;
    } catch (e) {
      return null;
    }
  }

  // Where the visitor came from — external sites only. Internal links between
  // WorkTools pages aren't traffic sources, and the query string is dropped so
  // nothing incidental gets logged.
  function referrer() {
    var ref = document.referrer;
    if (!ref) return null;
    try {
      if (new URL(ref).origin === location.origin) return null;
    } catch (e) {
      return null;
    }
    return ref.split("?")[0].slice(0, 500);
  }

  function record() {
    var payload = {
      tool: currentTool().slice(0, 120),
      path: currentPath().slice(0, 300),
      referrer: referrer(),
      session_id: sessionId(),
      user_agent: (navigator.userAgent || "").slice(0, 500)
    };

    fetch(cfg.url.replace(/\/$/, "") + "/rest/v1/page_views", {
      method: "POST",
      headers: {
        "apikey": cfg.anonKey,
        "Authorization": "Bearer " + cfg.anonKey,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(payload),
      // Let the request finish even if the visitor navigates away immediately.
      keepalive: true
    }).catch(function () {
      // A failed count must never surface to the visitor.
    });
  }

  // Don't count a tab that was opened in the background and never looked at.
  if (document.visibilityState === "prerender") {
    document.addEventListener("visibilitychange", function onVis() {
      if (document.visibilityState !== "prerender") {
        document.removeEventListener("visibilitychange", onVis);
        record();
      }
    });
  } else {
    record();
  }
})();
