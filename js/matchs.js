let matches = [];
let filteredMatches = [];
let subscriber = null;
let currentMatch = null;
let selectedZoneId = null;
let myParticipation = new Map();

const zoneLabels = {
  PELOUSE: "Pelouse",
  ENCEINTE_INF: "Enceinte inférieure",
  ENCEINTE_SUP: "Enceinte supérieure",
  VIRAGE_1: "Virage 1",
  VIRAGE_2: "Virage 2"
};

const sportLabels = {
  FOOTBALL: "Football",
  HANDBALL: "Handball",
  BASKETBALL: "Basketball"
};

function formatMatchDate(date, time) {
  if (!date) return "Date non définie";
  const d = new Date(`${date}T${time || "12:00:00"}`);
  return d.toLocaleDateString("fr-TN", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });
}

function formatTime(time) {
  return time ? String(time).slice(0, 5) : "Heure à confirmer";
}

async function loadSubscriber() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;

  const { data, error } = await sb
    .from("subscribers")
    .select("id,nom,prenom,gender,status")
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    showAlert("#pageAlert", error?.message || "Abonné introuvable.", "error");
    return false;
  }

  subscriber = data;
  $("#userName").textContent = `${data.prenom} ${data.nom}`;
  $("#avatar").textContent = String(data.prenom || "U").charAt(0).toUpperCase();
  $("#genderBadge").textContent = data.gender === "FEMALE" ? "Femme" : data.gender === "MALE" ? "Homme" : "Sexe non renseigné";

  return true;
}

async function loadMatches() {
  const [matchesResult, participationResult] = await Promise.all([
    sb.from("matches")
      .select("id,sport,home_team,away_team,competition,stadium,match_date,match_time,description,is_active,match_zones(id,zone_key,zone_name,capacity,is_available)")
      .eq("is_active", true)
      .order("match_date", { ascending: true })
      .order("match_time", { ascending: true }),
    sb.from("match_participations")
      .select("id,match_id,zone_id")
      .eq("subscriber_id", subscriber.id)
  ]);

  if (matchesResult.error) return showAlert("#pageAlert", matchesResult.error.message, "error");
  if (participationResult.error) return showAlert("#pageAlert", participationResult.error.message, "error");

  matches = matchesResult.data || [];
  myParticipation = new Map((participationResult.data || []).map(p => [p.match_id, p]));
  applyFilter();
}

function applyFilter() {
  const sport = $("#sportFilter").value;
  filteredMatches = matches.filter(m => !sport || m.sport === sport);
  renderMatches();
}

function renderMatches() {
  const container = $("#matchesGrid");

  if (!filteredMatches.length) {
    container.innerHTML = '<div class="empty-card">Aucun match programmé pour le moment.</div>';
    return;
  }

  container.innerHTML = filteredMatches.map(match => {
    const participation = myParticipation.get(match.id);
    const zone = participation ? (match.match_zones || []).find(z => z.id === participation.zone_id) : null;

    return `
      <article class="match-card">
        <div class="match-card-top">
          <span class="sport-pill">${escapeHtml(sportLabels[match.sport] || match.sport)}</span>
          ${match.competition ? `<span class="competition">${escapeHtml(match.competition)}</span>` : ""}
        </div>
        <div class="match-teams"><strong>${escapeHtml(match.home_team)}</strong><span>VS</span><strong>${escapeHtml(match.away_team)}</strong></div>
        <div class="match-info"><span>📅 ${escapeHtml(formatMatchDate(match.match_date, match.match_time))}</span><span>🕐 ${escapeHtml(formatTime(match.match_time))}</span>${match.stadium ? `<span>📍 ${escapeHtml(match.stadium)}</span>` : ""}</div>
        <div class="match-card-bottom">
          ${zone ? `<span class="choice-pill">✓ ${escapeHtml(zone.zone_name || zoneLabels[zone.zone_key] || "Place choisie")}</span>` : `<span class="muted-text">Aucune place choisie</span>`}
          <button class="btn primary" onclick="openMatch('${match.id}')">${zone ? "Modifier" : "Choisir une place"}</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderZones(zones) {
  const container = $("#zones");
  const current = myParticipation.get(currentMatch.id);

  // Une femme ne voit jamais les deux virages.
  const visibleZones = (zones || []).filter(zone => {
    if (subscriber.gender === "FEMALE" && ["VIRAGE_1", "VIRAGE_2"].includes(zone.zone_key)) return false;
    return true;
  });

  container.innerHTML = visibleZones.map(zone => {
    const unavailable = zone.is_available === false;
    const selected = current?.zone_id === zone.id;
    const label = zone.zone_name || zoneLabels[zone.zone_key] || zone.zone_key;

    return `
      <button type="button" class="match-zone ${unavailable ? "disabled" : ""} ${selected ? "selected" : ""}" data-zone-id="${zone.id}" ${unavailable ? "disabled" : ""}>
        <span class="zone-icon">${zone.zone_key.includes("VIRAGE") ? "🏟️" : "🎟️"}</span>
        <span><strong>${escapeHtml(label)}</strong><small>${unavailable ? "Indisponible" : "Disponible"}</small></span>
        ${selected ? '<span class="zone-check">✓</span>' : ""}
      </button>
    `;
  }).join("");

  $$(".match-zone:not(.disabled)", container).forEach(button => {
    button.addEventListener("click", () => {
      selectedZoneId = button.dataset.zoneId;
      $$(".match-zone", container).forEach(x => x.classList.remove("selected"));
      button.classList.add("selected");
    });
  });

  if (!visibleZones.length) {
    container.innerHTML = '<div class="empty-card">Aucune zone disponible.</div>';
  }
}

window.openMatch = matchId => {
  currentMatch = matches.find(m => m.id === matchId);
  if (!currentMatch) return;

  selectedZoneId = myParticipation.get(matchId)?.zone_id || null;

  $("#modalMatchTitle").textContent = `${currentMatch.home_team} — ${currentMatch.away_team}`;
  $("#modalMatchMeta").textContent = `${sportLabels[currentMatch.sport] || currentMatch.sport} • ${formatMatchDate(currentMatch.match_date, currentMatch.match_time)} • ${formatTime(currentMatch.match_time)}${currentMatch.stadium ? ` • ${currentMatch.stadium}` : ""}`;

  if (!subscriber.gender) {
    $("#zones").innerHTML = '<div class="gender-warning">Votre sexe n’est pas renseigné. Demandez à un administrateur de compléter votre profil avant de choisir une place.</div>';
    $("#confirmZoneBtn").disabled = true;
  } else {
    $("#confirmZoneBtn").disabled = false;
    renderZones(currentMatch.match_zones || []);
  }

  const current = myParticipation.get(matchId);
  const currentZone = current ? (currentMatch.match_zones || []).find(z => z.id === current.zone_id) : null;
  if (currentZone) {
    $("#currentChoice").classList.remove("hidden");
    $("#currentChoice").textContent = `Votre choix actuel : ${currentZone.zone_name || zoneLabels[currentZone.zone_key]}`;
  } else {
    $("#currentChoice").classList.add("hidden");
  }

  $("#matchModal").classList.remove("hidden");
};

async function saveChoice() {
  if (!subscriber || !currentMatch || !selectedZoneId) {
    return showAlert("#pageAlert", "Veuillez choisir une place.", "error");
  }

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return showAlert("#pageAlert", "Session expirée.", "error");

  const { error } = await sb.rpc("set_match_participation", {
    p_match_id: currentMatch.id,
    p_zone_id: selectedZoneId
  });

  if (error) {
    return showAlert("#pageAlert", result.error.message || "Impossible d'enregistrer votre choix.", "error");
  }

  $("#matchModal").classList.add("hidden");
  showAlert("#pageAlert", "Votre place a été enregistrée.");
  await loadMatches();
}

async function removeChoice() {
  if (!currentMatch) return;

  const existing = myParticipation.get(currentMatch.id);
  if (!existing) {
    $("#matchModal").classList.add("hidden");
    return;
  }

  if (!confirm("Confirmer que vous ne participez pas à ce match ?")) return;

  const { error } = await sb.rpc("remove_match_participation", {
    p_match_id: currentMatch.id
  });

  if (error) return showAlert("#pageAlert", error.message, "error");

  $("#matchModal").classList.add("hidden");
  showAlert("#pageAlert", "Votre participation a été retirée.");
  await loadMatches();
}

async function init() {
  const ctx = await requireSubscriber();
  if (!ctx) return;
  setupShell();
  if (!(await loadSubscriber())) return;
  await loadMatches();

  $("#sportFilter").onchange = applyFilter;
  $("#closeMatchModal").onclick = () => $("#matchModal").classList.add("hidden");
  $("#confirmZoneBtn").onclick = saveChoice;
  $("#notParticipateBtn").onclick = removeChoice;

  $("#matchModal").addEventListener("click", e => {
    if (e.target === $("#matchModal")) $("#matchModal").classList.add("hidden");
  });
}

init();
