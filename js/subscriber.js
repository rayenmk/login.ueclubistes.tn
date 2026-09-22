let original = {};

function formatMatchDate(date, time) {
  if (!date) return "Date non définie";
  const d = new Date(`${date}T${time || "12:00:00"}`);
  return d.toLocaleDateString("fr-TN", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });
}

function formatMatchTime(time) {
  return time ? String(time).slice(0, 5) : "Heure à confirmer";
}

function isMatchUpcoming(match) {
  if (!match || !match.match_date) return false;
  const now = new Date();
  const matchDate = new Date(`${match.match_date}T${match.match_time || "23:59:00"}`);
  return matchDate > now;
}

function renderMemberCard(subscriber) {
  const card = document.getElementById("subscriberMemberCard");
  if (!card) return;

  const fullName = `${subscriber.prenom || ""} ${subscriber.nom || ""}`.trim() || "Abonné";
  const initials = (subscriber.prenom || subscriber.nom || "A").charAt(0).toUpperCase();
  const photo = subscriber.photo_url ? `<img src="${escapeHtml(subscriber.photo_url)}" alt="Photo du membre" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : "";

  card.innerHTML = `
    <div class="member-card premium-card">
      <div class="member-card-topbar">
        <div class="member-brand">
          <img src="assets/logo.png" alt="UE Clubiste">
          <div>
            <span>UE CLUBISTE</span>
            <strong>Carte membre</strong>
          </div>
        </div>
        <span class="member-card-status ${subscriber.status === "ACTIVE" ? "active" : "inactive"}">${subscriber.status === "ACTIVE" ? "Actif" : "Désactivé"}</span>
      </div>
      <div class="member-card-main">
        <div class="member-photo-wrap">
          ${photo}
          <span class="member-photo-fallback" ${subscriber.photo_url ? 'style="display:none;"' : ''}>${escapeHtml(initials)}</span>
        </div>
        <div class="member-card-meta">
          <div class="member-card-name">${escapeHtml(fullName)}</div>
          <div class="member-card-row"><span>N° abonnement</span><strong>${escapeHtml(subscriber.numero_abonnement || "—")}</strong></div>
          <div class="member-card-row"><span>CIN</span><strong>${escapeHtml(subscriber.cin || "—")}</strong></div>
          <div class="member-card-row"><span>Faculté</span><strong>${escapeHtml(subscriber.faculties?.name || "—")}</strong></div>
          <div class="member-card-row"><span>Zone</span><strong>${escapeHtml(subscriber.zones?.name || "—")}</strong></div>
        </div>
      </div>
      <div class="member-card-grid">
        <div><span>Téléphone</span><strong>${escapeHtml(subscriber.phone || "—")}</strong></div>
        <div><span>Email</span><strong>${escapeHtml(subscriber.email || "—")}</strong></div>
        <div><span>Adresse</span><strong>${escapeHtml(subscriber.adresse || "—")}</strong></div>
        <div><span>Sexe</span><strong>${subscriber.gender === "FEMALE" ? "Femme" : subscriber.gender === "MALE" ? "Homme" : "Non renseigné"}</strong></div>
      </div>
    </div>
  `;
}

async function loadUpcomingMatches() {
  const container = $("#upcomingMatches");
  if (!container) return;

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("matches")
    .select("id,sport,home_team,away_team,home_logo_url,away_logo_url,competition,stadium,match_date,match_time")
    .eq("is_active", true)
    .gte("match_date", today)
    .order("match_date", { ascending: true })
    .order("match_time", { ascending: true })
    .limit(3);

  if (error) {
    container.innerHTML = '<div class="empty-card">Impossible de charger les matchs à venir.</div>';
    return;
  }

  const upcomingMatches = (data || []).filter(isMatchUpcoming);

  if (!upcomingMatches.length) {
    container.innerHTML = '<div class="empty-card">Aucun match programmé prochainement.</div>';
    return;
  }

  container.innerHTML = upcomingMatches.map(match => {
    const homeTeam = match.home_team || "Équipe domicile";
    const awayTeam = match.away_team || "Équipe visiteuse";
    const matchDate = new Date(`${match.match_date}T${match.match_time || "12:00:00"}`);
    const day = matchDate.toLocaleDateString("fr-TN", { day: "2-digit" });
    const month = matchDate.toLocaleDateString("fr-TN", { month: "short" }).replace(".", "").replace(".", "");
    const weekday = matchDate.toLocaleDateString("fr-TN", { weekday: "short" }).replace(".", "");

    return `
      <article class="match-card agenda-match-card">
        <div class="agenda-date">
          <span>${escapeHtml(weekday)}</span>
          <strong>${escapeHtml(day)}</strong>
          <small>${escapeHtml(month)}</small>
        </div>
        <div class="agenda-content">
          <div class="match-card-top">
            <span class="sport-pill">${escapeHtml(match.sport || "Match")}</span>
            ${match.competition ? `<span class="competition">${escapeHtml(match.competition)}</span>` : ""}
          </div>
          <div class="agenda-teams">
            <div class="team-side">
              <img src="${getTeamLogo(homeTeam, "HOME", match.home_logo_url)}" alt="Logo ${escapeHtml(homeTeam)}" />
              <span>${escapeHtml(homeTeam)}</span>
            </div>
            <div class="vs-badge">VS</div>
            <div class="team-side">
              <img src="${getTeamLogo(awayTeam, "AWAY", match.away_logo_url)}" alt="Logo ${escapeHtml(awayTeam)}" />
              <span>${escapeHtml(awayTeam)}</span>
            </div>
          </div>
          <div class="match-info">
            <span>🕐 ${escapeHtml(formatMatchTime(match.match_time))}</span>
            ${match.stadium ? `<span>📍 ${escapeHtml(match.stadium)}</span>` : ""}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

(async function init() {
  const ctx = await requireSubscriber(); if (!ctx) return;
  setupShell();
  const { data: s, error } = await sb.from("subscribers").select("*,faculties(name),zones(name)").eq("user_id", ctx.user.id).single();
  if (error || !s) { showAlert("#pageAlert","Impossible de charger votre profil.","error"); return; }
  original = s;
  $("#welcomeName").textContent = `Bienvenue ${s.prenom || ""} ${s.nom || ""}`.trim();
  $("#userName").textContent = `${s.prenom || ""} ${s.nom || ""}`.trim();
  $("#avatar").textContent = (s.prenom || s.nom || "U").charAt(0).toUpperCase();
  $("#statusBadge").outerHTML = `<span id="statusBadge" class="badge ${s.status === "ACTIVE" ? "active" : "inactive"}">${s.status === "ACTIVE" ? "Abonnement actif" : "Abonnement désactivé"}</span>`;
  $("#nom").value=s.nom||""; $("#prenom").value=s.prenom||""; $("#numero").value=s.numero_abonnement||"";
  $("#phone").value=s.phone||""; $("#email").value=s.email||""; $("#faculte").value=facultyShort(s.faculties?.name)||"";
  $("#adresse").value=s.adresse||""; $("#zone").value=s.zones?.name||""; $("#cin").value=s.cin||"";
  if ($("#gender")) $("#gender").value = s.gender === "FEMALE" ? "Femme" : s.gender === "MALE" ? "Homme" : "Non renseigné";
  $("#editBtn").onclick=()=>{ ["phone","email","adresse"].forEach(id=>$( "#"+id).disabled=false); $("#saveRow").classList.remove("hidden"); $("#editBtn").classList.add("hidden"); };
  $("#cancelBtn").onclick=()=>location.reload();
  renderMemberCard(s);
  const cardPanel = document.querySelector("#subscriberMemberCard")?.closest(".panel");
  $("#printMemberCardBtn").onclick = () => {
    if (cardPanel) cardPanel.classList.add("print-card-section");
    document.body.classList.add("print-card-mode");
    window.print();
  };
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("print-card-mode");
    if (cardPanel) cardPanel.classList.remove("print-card-section");
  });
  await loadUpcomingMatches();
})();
$("#profileForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const { error } = await sb.from("subscribers").update({phone:$("#phone").value.trim(),email:$("#email").value.trim(),adresse:$("#adresse").value.trim()}).eq("user_id", original.user_id);
  if (error) { showAlert("#pageAlert",error.message,"error"); return; }
  showAlert("#pageAlert","Informations mises à jour."); $("#saveRow").classList.add("hidden"); $("#editBtn").classList.remove("hidden");
});
$("#passwordForm").addEventListener("submit", async e=>{
  e.preventDefault(); const p=$("#newPassword").value, c=$("#confirmPassword").value;
  if(p!==c) return showAlert("#passwordAlert","Les mots de passe ne correspondent pas.","error");
  if(p.length<12) return showAlert("#passwordAlert","Minimum 12 caractères.","error");
  if(!/[A-Z]/.test(p)||!/[a-z]/.test(p)||!/[0-9]/.test(p)||!/[^A-Za-z0-9]/.test(p)) return showAlert("#passwordAlert","Utilisez une majuscule, une minuscule, un chiffre et un caractère spécial.","error");
  const { error }=await sb.auth.updateUser({password:p});
  if(error) return showAlert("#passwordAlert",error.message,"error");
  const {error:rpcError}=await sb.rpc("complete_password_change");
  if(rpcError)return showAlert("#passwordAlert","Le mot de passe a été changé mais la validation a échoué.","error");
  showAlert("#passwordAlert","Mot de passe changé avec succès.");
  setTimeout(()=>location.href="subscriber.html",800);
});
