/*
 * WorkTools feedback widget.
 *
 * A dependency-free, self-injecting widget: it adds a floating "Feedback"
 * button and a native <dialog> to any page that includes this script. On
 * submit it POSTs the feedback straight to Supabase's REST API using the
 * public anon key (safe to expose — Row Level Security only allows INSERT).
 *
 * Include on a page with:
 *   <script src="/path/to/assets/feedback-config.js"></script>
 *   <script src="/path/to/assets/feedback.js" defer></script>
 *
 * The mirroring native-<dialog> + showModal()/close() pattern matches the
 * tax-preset dialog in tools/margin-markup/.
 */
(function () {
  "use strict";

  var cfg = window.WORKTOOLS_SUPABASE;
  if (!cfg || !cfg.url || !cfg.anonKey) {
    // Config missing — fail quietly rather than breaking the page.
    console.warn("[feedback] Missing WORKTOOLS_SUPABASE config; widget disabled.");
    return;
  }

  var TYPES = [
    { value: "bug", label: "🐞 Bug" },
    { value: "idea", label: "💡 Idea" },
    { value: "feedback", label: "💬 Feedback" }
  ];

  // Derive which tool the feedback came from, from the page title.
  function currentTool() {
    var t = (document.title || "").replace(/\s*[—-]\s*WorkTools\s*$/i, "").trim();
    return t || document.title || "Unknown";
  }

  // Scoped styles. Reuses the site's CSS custom properties so it matches the
  // existing design system and light/dark mode automatically, with fallbacks
  // in case the widget is ever used on a page without style.css.
  var css = [
    ".wt-fb-btn{position:fixed;right:16px;bottom:16px;z-index:2147483000;",
    "display:inline-flex;align-items:center;gap:6px;padding:10px 14px;",
    "font:inherit;font-size:0.9rem;font-weight:600;cursor:pointer;",
    "color:var(--accent-text,#fff);background:var(--accent,#2f6fed);",
    "border:1px solid var(--accent,#2f6fed);border-radius:999px;",
    "box-shadow:0 2px 8px rgba(16,24,40,0.18),0 8px 24px rgba(16,24,40,0.16);}",
    ".wt-fb-btn:hover{filter:brightness(1.05);}",
    ".wt-fb-dialog{border:1px solid var(--border,#d9dee6);",
    "border-radius:var(--radius,12px);background:var(--surface,#fff);",
    "color:var(--text,#1a2230);padding:20px;width:min(420px,92vw);",
    "box-shadow:var(--shadow,0 4px 16px rgba(16,24,40,0.12));}",
    ".wt-fb-dialog::backdrop{background:rgba(0,0,0,0.4);}",
    ".wt-fb-dialog h2{margin:0 0 4px;font-size:1.15rem;}",
    ".wt-fb-sub{margin:0 0 14px;color:var(--text-muted,#5b6675);font-size:0.88rem;}",
    ".wt-fb-types{display:flex;gap:8px;margin-bottom:14px;}",
    ".wt-fb-type{flex:1;text-align:center;padding:9px 6px;font:inherit;",
    "font-size:0.9rem;cursor:pointer;border:1px solid var(--border,#d9dee6);",
    "border-radius:8px;background:var(--surface-2,#eef1f5);color:var(--text,#1a2230);}",
    ".wt-fb-type[aria-pressed=\"true\"]{background:var(--accent,#2f6fed);",
    "border-color:var(--accent,#2f6fed);color:var(--accent-text,#fff);}",
    ".wt-fb-label{display:block;font-size:0.85rem;color:var(--text-muted,#5b6675);",
    "margin:0 0 5px;}",
    ".wt-fb-field{width:100%;font:inherit;padding:10px 12px;",
    "border:1px solid var(--border,#d9dee6);border-radius:8px;",
    "background:var(--surface-2,#eef1f5);color:var(--text,#1a2230);",
    "margin-bottom:14px;resize:vertical;}",
    ".wt-fb-field:focus{outline:none;border-color:var(--accent,#2f6fed);}",
    "textarea.wt-fb-field{min-height:96px;}",
    ".wt-fb-actions{display:flex;justify-content:flex-end;gap:8px;}",
    ".wt-fb-actions .wt-fb-cancel{border:1px solid var(--border,#d9dee6);",
    "background:var(--surface-2,#eef1f5);color:var(--text,#1a2230);",
    "border-radius:8px;padding:8px 14px;cursor:pointer;font:inherit;}",
    ".wt-fb-actions .wt-fb-send{border:1px solid var(--accent,#2f6fed);",
    "background:var(--accent,#2f6fed);color:var(--accent-text,#fff);",
    "border-radius:8px;padding:8px 14px;cursor:pointer;font:inherit;font-weight:600;}",
    ".wt-fb-actions .wt-fb-send:disabled{opacity:0.6;cursor:default;}",
    ".wt-fb-note{margin:12px 0 0;font-size:0.85rem;min-height:1.2em;}",
    ".wt-fb-note.err{color:var(--danger,#d64545);}",
    ".wt-fb-note.ok{color:var(--accent,#2f6fed);}"
  ].join("");

  function injectStyle() {
    var s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  }

  var dialog, typeButtons, messageEl, emailEl, sendBtn, noteEl, selectedType;

  function selectType(value) {
    selectedType = value;
    typeButtons.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.type === value));
    });
  }

  function buildWidget() {
    // Floating trigger button.
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wt-fb-btn";
    btn.innerHTML = "<span aria-hidden=\"true\">💬</span><span>Feedback</span>";
    btn.setAttribute("aria-label", "Send feedback");

    // Dialog.
    dialog = document.createElement("dialog");
    dialog.className = "wt-fb-dialog";

    var typesHtml = TYPES.map(function (t, i) {
      return "<button type=\"button\" class=\"wt-fb-type\" data-type=\"" + t.value +
        "\" aria-pressed=\"" + (i === 0 ? "true" : "false") + "\">" + t.label + "</button>";
    }).join("");

    dialog.innerHTML =
      "<h2>Send feedback</h2>" +
      "<p class=\"wt-fb-sub\">Found a bug or have an idea? Let me know.</p>" +
      "<form method=\"dialog\" class=\"wt-fb-form\">" +
        "<div class=\"wt-fb-types\">" + typesHtml + "</div>" +
        "<label class=\"wt-fb-label\" for=\"wt-fb-message\">Message</label>" +
        "<textarea id=\"wt-fb-message\" class=\"wt-fb-field\" maxlength=\"5000\" " +
          "placeholder=\"What happened, or what would make this better?\"></textarea>" +
        "<label class=\"wt-fb-label\" for=\"wt-fb-email\">Email <span style=\"font-weight:400\">(optional, if you'd like a reply)</span></label>" +
        "<input id=\"wt-fb-email\" class=\"wt-fb-field\" type=\"email\" placeholder=\"you@example.com\">" +
        "<div class=\"wt-fb-actions\">" +
          "<button type=\"button\" class=\"wt-fb-cancel\">Cancel</button>" +
          "<button type=\"submit\" class=\"wt-fb-send\">Send</button>" +
        "</div>" +
        "<p class=\"wt-fb-note\" role=\"status\" aria-live=\"polite\"></p>" +
      "</form>";

    document.body.appendChild(btn);
    document.body.appendChild(dialog);

    typeButtons = Array.prototype.slice.call(dialog.querySelectorAll(".wt-fb-type"));
    messageEl = dialog.querySelector("#wt-fb-message");
    emailEl = dialog.querySelector("#wt-fb-email");
    sendBtn = dialog.querySelector(".wt-fb-send");
    noteEl = dialog.querySelector(".wt-fb-note");
    selectedType = TYPES[0].value;

    typeButtons.forEach(function (b) {
      b.addEventListener("click", function () { selectType(b.dataset.type); });
    });

    btn.addEventListener("click", openDialog);
    dialog.querySelector(".wt-fb-cancel").addEventListener("click", function () {
      dialog.close();
    });
    dialog.querySelector(".wt-fb-form").addEventListener("submit", onSubmit);
  }

  function setNote(text, kind) {
    noteEl.textContent = text || "";
    noteEl.className = "wt-fb-note" + (kind ? " " + kind : "");
  }

  function openDialog() {
    setNote("", "");
    selectType(TYPES[0].value);
    messageEl.value = "";
    emailEl.value = "";
    sendBtn.disabled = false;
    dialog.showModal();
    messageEl.focus();
  }

  function onSubmit(e) {
    e.preventDefault();
    var message = messageEl.value.trim();
    if (!message) {
      setNote("Please enter a message.", "err");
      messageEl.focus();
      return;
    }

    sendBtn.disabled = true;
    setNote("Sending…", "");

    var payload = {
      tool: currentTool(),
      type: selectedType,
      message: message,
      email: emailEl.value.trim() || null,
      page_url: location.href,
      user_agent: navigator.userAgent
    };

    fetch(cfg.url.replace(/\/$/, "") + "/rest/v1/feedback", {
      method: "POST",
      headers: {
        "apikey": cfg.anonKey,
        "Authorization": "Bearer " + cfg.anonKey,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (res.ok) {
        setNote("Thanks! Your feedback was sent. ✅", "ok");
        setTimeout(function () {
          if (dialog.open) dialog.close();
        }, 1200);
      } else {
        return res.text().then(function (t) {
          console.error("[feedback] submit failed", res.status, t);
          setNote("Sorry, something went wrong. Please try again.", "err");
          sendBtn.disabled = false;
        });
      }
    }).catch(function (err) {
      console.error("[feedback] network error", err);
      setNote("Network error. Please check your connection and try again.", "err");
      sendBtn.disabled = false;
    });
  }

  function init() {
    injectStyle();
    buildWidget();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
