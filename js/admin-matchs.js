let adminMatches = [];
let editingMatch = null;

const sports = {
  FOOTBALL: "Football",
  HANDBALL: "Handball",
  BASKETBALL: "Basketball"
};

const defaultZones = [
  { key: "PELOUSE", name: "Pelouse" },
  { key: "ENCEINTE_INF", name: "Enceinte inférieure" },
  { key: "ENCEINTE_SUP", name: "Enceinte supérieure" },
  { key: "VIRAGE_1", name: "Virage 1" },
  { key: "VIRAGE_2", name: "Virage 2" }
];

function getTeamLogo(teamName, fallbackLabel, customUrl) {
  if (customUrl && String(customUrl).trim()) return customUrl;

  const team = (teamName || fallbackLabel || "TEAM").trim();
  const initials = team
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join("") || "T";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#c8102e"/>
          <stop offset="100%" stop-color="#3b0b16"/>
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="28" fill="#0f1012"/>
      <circle cx="60" cy="60" r="38" fill="url(#g)" opacity="0.95"/>
      <text x="60" y="69" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff">${initials}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function formatDate(date) {
  if (!date) return "—";
  return new Date(`${date}T12:00:00`).toLocaleDateString("fr-TN", { day: "2-digit", month: "long", year: "numeric" });
}

function formatMatchTime(time) {
  return time ? String(time).slice(0, 5) : "Heure à confirmer";
}

async function ensureMatchStorageAndSchema() {
  if (!window.sb) {
    throw new Error("Supabase n'est pas initialisé. Vérifiez la configuration dans js/config.js.");
  }

  const { error: schemaError } = await sb
    .from("matches")
    .select("id,home_logo_url,away_logo_url")
    .limit(1);

  if (schemaError) {
    const message = schemaError.message || "";
    if (/home_logo_url|away_logo_url|column.*matches|does not exist|missing/i.test(message)) {
      throw new Error("Les colonnes 'home_logo_url' et 'away_logo_url' manquent dans la table 'matches'. Exécutez la migration SQL avant d'enregistrer.");
    }

    throw new Error(`Erreur de schéma Supabase: ${schemaError.message}`);
  }
}

async function uploadMatchLogo(file) {
  if (!file) return null;

  await ensureMatchStorageAndSchema();

  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'png';
  const fileName = `match-logos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await sb.storage.from('match-logos').upload(fileName, file, {
    cacheControl: '3600',
    upsert: true
  });

  if (error) {
    if (/bucket.*not found|not found/i.test(error.message || "")) {
      throw new Error("Le bucket 'match-logos' n'est pas accessible. Vérifiez qu'il existe dans Storage et que Public bucket est activé.");
    }
    throw new Error(`Erreur upload du logo: ${error.message}`);
  }

  const { data } = sb.storage.from('match-logos').getPublicUrl(fileName);
  return data?.publicUrl || null;
}

function isMatchUpcoming(match) {
  if (!match || !match.match_date) return false;
  const now = new Date();
  const matchDate = new Date(`${match.match_date}T${match.match_time || "23:59:00"}`);
  return matchDate > now;
}

async function loadMatches() {
  const { data, error } = await sb
    .from("matches")
    .select("id,sport,home_team,away_team,home_logo_url,away_logo_url,competition,stadium,match_date,match_time,description,is_active,match_zones(id,zone_key,zone_name,capacity,is_available)")
    .order("match_date", { ascending: true })
    .order("match_time", { ascending: true });

  if (error) return showAlert("#pageAlert", error.message, "error");

  adminMatches = (data || [])
    .filter(isMatchUpcoming)
    .sort((a, b) => new Date(a.match_date || "2100-01-01") - new Date(b.match_date || "2100-01-01"));

  renderMatches();
}

function renderMatches() {
  const container = $("#adminMatchesGrid");

  if (!adminMatches.length) {
    container.innerHTML = '<div class="empty-card">Aucun match à venir.</div>';
    return;
  }

  container.innerHTML = adminMatches.map(m => {
    const homeTeam = m.home_team || "Équipe domicile";
    const awayTeam = m.away_team || "Équipe visiteuse";
    const matchDate = m.match_date ? new Date(`${m.match_date}T${m.match_time || "12:00:00"}`) : new Date();
    const day = matchDate.toLocaleDateString("fr-TN", { day: "2-digit" });
    const month = matchDate.toLocaleDateString("fr-TN", { month: "short" }).replace(".", "").replace(".", "");
    const weekday = matchDate.toLocaleDateString("fr-TN", { weekday: "short" }).replace(".", "");

    return `
      <article class="admin-match-card agenda-match-card">
        <div class="agenda-date">
          <span>${escapeHtml(weekday)}</span>
          <strong>${escapeHtml(day)}</strong>
          <small>${escapeHtml(month)}</small>
        </div>
        <div class="agenda-content">
          <div class="admin-match-header">
            <span class="sport-pill">${escapeHtml(sports[m.sport] || m.sport)}</span>
            ${m.is_active ? '<span class="badge active">Actif</span>' : '<span class="badge inactive">Fermé</span>'}
          </div>
          <div class="agenda-teams">
            <div class="team-side">
              <img src="${getTeamLogo(homeTeam, "HOME", m.home_logo_url)}" alt="Logo ${escapeHtml(homeTeam)}" />
              <span>${escapeHtml(homeTeam)}</span>
            </div>
            <div class="vs-badge">VS</div>
            <div class="team-side">
              <img src="${getTeamLogo(awayTeam, "AWAY", m.away_logo_url)}" alt="Logo ${escapeHtml(awayTeam)}" />
              <span>${escapeHtml(awayTeam)}</span>
            </div>
          </div>
          <div class="admin-match-meta">
            <span>🕐 ${escapeHtml(formatMatchTime(m.match_time))}</span>
            ${m.stadium ? `<span>📍 ${escapeHtml(m.stadium)}</span>` : ""}
            ${m.competition ? `<span>🏆 ${escapeHtml(m.competition)}</span>` : ""}
          </div>
          <div class="admin-zone-mini">${(m.match_zones || []).map(z => `<span class="${z.is_available ? "on" : "off"}">${escapeHtml(z.zone_name)}</span>`).join("")}</div>
          <div class="admin-card-actions">
            <button class="btn secondary" onclick="showStats('${m.id}')">📊 Statistiques</button>
            <button class="btn secondary" onclick="editMatch('${m.id}')">${ICONS.edit} Modifier</button>
            <button class="btn danger-btn" onclick="deleteMatch('${m.id}')">${ICONS.trash} Supprimer</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderZoneSettings(match) {
  const zones = match?.match_zones?.length ? match.match_zones : defaultZones.map(z => ({ zone_key: z.key, zone_name: z.name, is_available: true, capacity: "" }));

  $("#zoneSettings").innerHTML = `
    <div class="zone-settings-head"><span class="mini-label">ZONES DE PLACEMENT</span><h3>Disponibilité et capacité</h3><p>Pour une femme, Virage 1 et Virage 2 restent automatiquement invisibles côté abonné.</p></div>
    <div class="zone-admin-grid">
      ${zones.map(z => `
        <div class="zone-admin-row">
          <strong>${escapeHtml(z.zone_name)}</strong>
          <label class="switch-label"><input type="checkbox" class="zone-available" data-zone-id="${z.id || ""}" data-zone-key="${z.zone_key}" ${z.is_available !== false ? "checked" : ""}> Disponible</label>
          <label>Capacité<input type="number" min="0" class="zone-capacity" data-zone-id="${z.id || ""}" value="${z.capacity ?? ""}" placeholder="Illimitée"></label>
        </div>
      `).join("")}
    </div>
  `;
}

function openForm(match = null) {
  editingMatch = match;
  $("#formTitle").textContent = match ? "Modifier un match" : "Ajouter un match";
  $("#matchId").value = match?.id || "";
  $("#matchSport").value = match?.sport || "FOOTBALL";
  $("#homeTeam").value = match?.home_team || "Club Africain";
  $("#awayTeam").value = match?.away_team || "";
  $("#homeLogoUrl").value = match?.home_logo_url || "";
  $("#awayLogoUrl").value = match?.away_logo_url || "";
  $("#homeLogoFile").value = "";
  $("#awayLogoFile").value = "";
  $("#competition").value = match?.competition || "";
  $("#stadium").value = match?.stadium || "";
  $("#matchDate").value = match?.match_date || "";
  $("#matchTime").value = match?.match_time ? String(match.match_time).slice(0,5) : "";
  $("#matchActive").value = String(match?.is_active ?? true);
  $("#matchDescription").value = match?.description || "";
  renderZoneSettings(match);
  $("#matchFormModal").classList.remove("hidden");
}

window.editMatch = id => openForm(adminMatches.find(m => m.id === id));

async function saveZones(matchId) {
  const availableInputs = $$(".zone-available");
  const capacityInputs = $$(".zone-capacity");

  for (const input of availableInputs) {
    const zoneId = input.dataset.zoneId;
    if (!zoneId) continue;

    const capacityInput = capacityInputs.find(x => x.dataset.zoneId === zoneId);
    const capacityValue = capacityInput?.value === "" ? null : Number(capacityInput.value);

    const { error } = await sb.from("match_zones")
      .update({ is_available: input.checked, capacity: capacityValue })
      .eq("id", zoneId)
      .eq("match_id", matchId);

    if (error) throw new Error(error.message);
  }
}

$("#matchForm").addEventListener("submit", async e => {
  e.preventDefault();

  try {
    await ensureMatchStorageAndSchema();
  } catch (error) {
    return showAlert("#pageAlert", error.message, "error");
  }

  let homeLogoUrl = $("#homeLogoUrl").value.trim() || null;
  let awayLogoUrl = $("#awayLogoUrl").value.trim() || null;

  const homeLogoFile = $("#homeLogoFile").files[0];
  const awayLogoFile = $("#awayLogoFile").files[0];

  if (homeLogoFile) homeLogoUrl = await uploadMatchLogo(homeLogoFile);
  if (awayLogoFile) awayLogoUrl = await uploadMatchLogo(awayLogoFile);

  const payload = {
    sport: $("#matchSport").value,
    home_team: $("#homeTeam").value.trim() || "Club Africain",
    away_team: $("#awayTeam").value.trim(),
    home_logo_url: homeLogoUrl,
    away_logo_url: awayLogoUrl,
    competition: $("#competition").value.trim() || null,
    stadium: $("#stadium").value.trim() || null,
    match_date: $("#matchDate").value,
    match_time: $("#matchTime").value || null,
    description: $("#matchDescription").value.trim() || null,
    is_active: $("#matchActive").value === "true"
  };

  if (!payload.away_team || !payload.match_date) {
    return showAlert("#pageAlert", "Équipe visiteuse et date sont obligatoires.", "error");
  }

  let matchId = $("#matchId").value;
  let result;

  if (matchId) {
    result = await sb.from("matches").update(payload).eq("id", matchId).select("id").single();
  } else {
    result = await sb.from("matches").insert(payload).select("id").single();
  }

  if (result.error) return showAlert("#pageAlert", result.error.message, "error");
  matchId = result.data.id;

  try {
    await saveZones(matchId);
  } catch (error) {
    return showAlert("#pageAlert", error.message, "error");
  }

  $("#matchFormModal").classList.add("hidden");
  showAlert("#pageAlert", "Match enregistré avec succès.");
  await loadMatches();
});

window.showStats = async matchId => {
  const match = adminMatches.find(m => m.id === matchId);
  if (!match) return;

  $("#statsTitle").textContent = `${match.home_team} — ${match.away_team}`;
  $("#statsContent").innerHTML = '<div class="loading-state">Chargement des statistiques…</div>';
  $("#statsModal").classList.remove("hidden");

  const { data, error } = await sb.from("match_participations")
    .select("id,zone_id,subscribers(gender),match_zones(zone_key,zone_name)")
    .eq("match_id", matchId);

  if (error) {
    return $("#statsContent").innerHTML = `<div class="gender-warning">${escapeHtml(error.message)}</div>`;
  }

  const rows = data || [];
  const total = rows.length;
  const men = rows.filter(x => x.subscribers?.gender === "MALE").length;
  const women = rows.filter(x => x.subscribers?.gender === "FEMALE").length;
  const unknown = total - men - women;

  const zoneCounts = {};
  for (const row of rows) {
    const key = row.match_zones?.zone_key || "UNKNOWN";
    const name = row.match_zones?.zone_name || key;
    if (!zoneCounts[key]) zoneCounts[key] = { name, count: 0 };
    zoneCounts[key].count++;
  }

  $("#statsContent").innerHTML = `
    <div class="stats-grid match-stats-grid">
      <article class="stat-card accent-card"><span>Total participants</span><strong>${total}</strong></article>
      <article class="stat-card"><span>Hommes</span><strong>${men}</strong></article>
      <article class="stat-card"><span>Femmes</span><strong>${women}</strong></article>
      <article class="stat-card"><span>Non renseigné</span><strong>${unknown}</strong></article>
    </div>
    <div class="panel inner-panel"><div class="panel-head"><div><span class="mini-label">PLACEMENT</span><h2>Participants par zone</h2></div></div>
      <div class="stats-bars">${defaultZones.map(z => {
        const item = zoneCounts[z.key] || { name: z.name, count: 0 };
        const percent = total ? Math.round(item.count / total * 100) : 0;
        return `<div class="bar-row"><div><span>${escapeHtml(item.name)}</span><strong>${item.count}</strong></div><div class="bar-track"><i style="width:${percent}%"></i></div></div>`;
      }).join("")}</div>
    </div>
  `;
};

window.deleteMatch = async id => {
  const match = adminMatches.find(m => m.id === id);
  if (!match) return;
  if (!(await confirmDialog(`Supprimer le match ${match.home_team} - ${match.away_team} et toutes les participations ?`, { confirmText: "Supprimer" }))) return;

  const { error } = await sb.from("matches").delete().eq("id", id);
  if (error) return showAlert("#pageAlert", error.message, "error");

  showAlert("#pageAlert", "Match supprimé.");
  await loadMatches();
};

async function init() {
  const ctx = await requireAdmin();
  if (!ctx) return;
  setupShell();
  await loadMatches();

  $("#addMatchBtn").onclick = () => openForm();
  $("#closeFormModal").onclick = () => $("#matchFormModal").classList.add("hidden");
  $("#cancelForm").onclick = () => $("#matchFormModal").classList.add("hidden");
  $("#closeStatsModal").onclick = () => $("#statsModal").classList.add("hidden");

  [$("#matchFormModal"), $("#statsModal")].forEach(modal => {
    modal.addEventListener("click", e => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  });
}

init();
