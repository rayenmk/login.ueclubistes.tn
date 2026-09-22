const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

/* ============================================================
   UE CLUBISTE — ICON SET (inline SVG, replaces raw unicode glyphs)
   ============================================================ */
const ICONS = {
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l.9-3.9L16.6 4.4a1.8 1.8 0 012.6 0l.4.4a1.8 1.8 0 010 2.6L8 19l-4 1z"/><path d="M14.5 6.5l3 3"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14"/><path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2"/><path d="M7 7l1 12.5A1.5 1.5 0 009.5 21h5a1.5 1.5 0 001.5-1.5L17 7"/><path d="M10 11v6M14 11v6"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5.5v13l11-6.5z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="5" width="4.5" height="14" rx="1"/><rect x="13.5" y="5" width="4.5" height="14" rx="1"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 10-2.6 5.9"/><path d="M20 7v5h-5"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 4H18a2 2 0 012 2v12a2 2 0 01-2 2h-4.5"/><path d="M3 12h11.5"/><path d="M11 8l4 4-4 4"/></svg>`
};
window.ICONS = ICONS;

/* ============================================================
   UE CLUBISTE — SWEETALERT2 HELPERS
   Every popup, confirmation and status message on the site goes
   through these so styling/theme stays consistent everywhere.
   ============================================================ */
function swalBase() {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    background: dark ? "#15171b" : "#ffffff",
    color: dark ? "#f2f3f5" : "#111214",
    confirmButtonColor: "#c8102e",
    cancelButtonColor: dark ? "#24272e" : "#f1f1f3",
    buttonsStyling: true
  };
}

function showAlert(target, message, type="success") {
  if (!window.Swal) return;
  Swal.fire({
    ...swalBase(),
    toast: true,
    position: "top-end",
    icon: type === "error" ? "error" : "success",
    title: message,
    showConfirmButton: false,
    timer: type === "error" ? 4500 : 3000,
    timerProgressBar: true
  });
}

async function confirmDialog(message, opts = {}) {
  if (!window.Swal) return confirm(message);
  const result = await Swal.fire({
    ...swalBase(),
    title: opts.title || "Confirmer",
    text: message,
    icon: opts.icon || "warning",
    showCancelButton: true,
    confirmButtonText: opts.confirmText || "Oui, confirmer",
    cancelButtonText: "Annuler",
    reverseButtons: true,
    focusCancel: true
  });
  return result.isConfirmed;
}

async function promptDialog(message, opts = {}) {
  if (!window.Swal) {
    const value = prompt(message);
    return value || null;
  }
  const result = await Swal.fire({
    ...swalBase(),
    title: message,
    input: opts.input || "text",
    inputPlaceholder: opts.placeholder || "",
    inputValue: opts.value || "",
    showCancelButton: true,
    confirmButtonText: opts.confirmText || "Valider",
    cancelButtonText: "Annuler",
    reverseButtons: true,
    inputValidator: opts.validator
  });
  return result.isConfirmed ? result.value : null;
}

function escapeHtml(v="") {
  return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function syntheticEmail(login) {
  return `${String(login).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-")}@login.ueclubiste.local`;
}
function facultyShort(name) {
  if (!name) return name;
  const i = name.indexOf(" — ");
  return i === -1 ? name : name.slice(0, i);
}
function statusBadge(status) {
  return `<span class="badge ${status === "ACTIVE" ? "active" : "inactive"}">${status === "ACTIVE" ? "Actif" : "Désactivé"}</span>`;
}
async function getCurrentContext() {
  if (!window.sb) return null;
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await sb.from("profiles")
    .select("role,display_name,must_change_password,is_active")
    .eq("id", user.id).single();
  if (!profile || profile.is_active === false) {
    await sb.auth.signOut();
    return null;
  }
  return { user, profile };
}

async function requireAdmin() {
  const ctx = await getCurrentContext();
  if (!ctx) { location.href = "index.html"; return null; }
  if (ctx.profile.role !== "ADMIN") { location.href = "subscriber.html"; return null; }
  if (ctx.profile.must_change_password && !location.pathname.endsWith("change-password.html")) {
    location.href = "change-password.html"; return null;
  }
  return ctx;
}

async function requireSubscriber() {
  const ctx = await getCurrentContext();
  if (!ctx) { location.href = "index.html"; return null; }
  if (ctx.profile.role !== "SUBSCRIBER") { location.href = "dashboard.html"; return null; }
  if (ctx.profile.must_change_password && !location.pathname.endsWith("change-password.html")) {
    location.href = "change-password.html"; return null;
  }
  return ctx;
}

async function requireAuthenticated() {
  const ctx = await getCurrentContext();
  if (!ctx) { location.href = "index.html"; return null; }
  if (ctx.profile.must_change_password && !location.pathname.endsWith("change-password.html")) {
    location.href = "change-password.html"; return null;
  }
  return ctx;
}
function setupShell() {
  $("#logoutBtn")?.addEventListener("click", async () => { await sb.auth.signOut(); location.href = "index.html"; });
  $("#menuBtn")?.addEventListener("click", () => $(".sidebar")?.classList.toggle("open"));
}


/* ============================================================
   UE CLUBISTE — THEME MANAGER
   Persists light/dark preference locally and works on every page.
   ============================================================ */
(function initTheme(){
  const storageKey = "ueclubiste-theme";
  const saved = localStorage.getItem(storageKey);
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initial = saved === "dark" || saved === "light" ? saved : (prefersDark ? "dark" : "light");

  function applyTheme(theme){
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem(storageKey, theme);

    const buttons = document.querySelectorAll(".theme-toggle");
    buttons.forEach(button => {
      const dark = theme === "dark";
      button.textContent = dark ? "☀" : "☾";
      button.setAttribute("aria-label", dark ? "Activer le mode clair" : "Activer le mode sombre");
      button.setAttribute("title", dark ? "Mode clair" : "Mode sombre");
    });

    window.dispatchEvent(new CustomEvent("ue-theme-change", { detail: { theme } }));
  }

  function addToggle(){
    if (document.querySelector(".theme-toggle")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";
    button.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      applyTheme(current === "dark" ? "light" : "dark");
    });

    const topbar = document.querySelector(".topbar");
    if (topbar) {
      const user = topbar.querySelector(".top-user");
      if (user) {
        topbar.insertBefore(button, user);
      } else {
        topbar.appendChild(button);
      }
    } else {
      document.body.appendChild(button);
    }

    applyTheme(document.documentElement.getAttribute("data-theme") || initial);
  }

  document.documentElement.setAttribute("data-theme", initial);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addToggle, { once:true });
  } else {
    addToggle();
  }
})();
