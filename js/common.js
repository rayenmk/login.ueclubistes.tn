const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

function showAlert(target, message, type="success") {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  el.innerHTML = `<div class="alert ${type}">${escapeHtml(message)}</div>`;
  if (type === "success") setTimeout(() => { el.innerHTML = ""; }, 3500);
}
function escapeHtml(v="") {
  return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function syntheticEmail(login) {
  return `${String(login).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-")}@login.ueclubiste.local`;
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
