let allSubs = [];
let filtered = [];
let page = 1;
const pageSize = 10;

let allFaculties = [];

function stripAccents(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function splitFacultyName(name) {
  const i = name.indexOf(" — ");
  return i === -1 ? { short: name, full: "" } : { short: name.slice(0, i), full: name.slice(i + 3) };
}

function renderFacultyOptions(query) {
  const q = stripAccents(query.trim().toLowerCase());
  const matches = q ? allFaculties.filter(f => stripAccents(f.name).toLowerCase().includes(q)) : allFaculties;
  const list = $("#fFaculteList");

  list.innerHTML = matches.length
    ? matches.map(f => {
        const { short, full } = splitFacultyName(f.name);
        return `<div class="combo-option" data-id="${f.id}" data-name="${escapeHtml(f.name)}"><b>${escapeHtml(short)}</b>${full ? `<small>${escapeHtml(full)}</small>` : ""}</div>`;
      }).join("")
    : '<div class="combo-empty">Aucun résultat</div>';
}

function selectFaculty(id, name) {
  $("#fFaculte").value = id || "";
  $("#fFaculteSearch").value = id ? splitFacultyName(name).short : "";
  $("#fFaculteList").classList.add("hidden");
}

function setupFacultyCombo() {
  const search = $("#fFaculteSearch");
  const list = $("#fFaculteList");

  search.addEventListener("input", () => {
    $("#fFaculte").value = "";
    renderFacultyOptions(search.value);
    list.classList.remove("hidden");
  });

  search.addEventListener("focus", () => {
    renderFacultyOptions(search.value);
    list.classList.remove("hidden");
  });

  list.addEventListener("mousedown", e => {
    const option = e.target.closest(".combo-option");
    if (!option) return;
    e.preventDefault();
    selectFaculty(option.dataset.id, option.dataset.name);
  });

  document.addEventListener("click", e => {
    if (!e.target.closest(".combo-field")) list.classList.add("hidden");
  });
}

async function loadRefs() {
  const [facultiesResult, zonesResult] = await Promise.all([
    sb.from("faculties").select("id,name").order("name"),
    sb.from("zones").select("id,name").order("name")
  ]);

  if (facultiesResult.error) return showAlert("#pageAlert", facultiesResult.error.message, "error");
  if (zonesResult.error) return showAlert("#pageAlert", zonesResult.error.message, "error");

  allFaculties = facultiesResult.data || [];

  $("#fZone").innerHTML = '<option value="">Non définie</option>' +
    (zonesResult.data || []).map(x => `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join("");
}

async function loadSubs() {
  const { data, error } = await sb
    .from("subscribers")
    .select("*,faculties(name),zones(name)")
    .order("nom", { ascending: true });

  if (error) return showAlert("#pageAlert", error.message, "error");
  allSubs = data || [];
  apply();
}

function apply() {
  const q = $("#search").value.toLowerCase().trim();
  const status = $("#statusFilter").value;
  const gender = $("#genderFilter").value;

  filtered = allSubs.filter(s => {
    const text = [
      s.nom, s.prenom, s.cin, s.numero_abonnement,
      s.phone, s.email, s.login_name,
      s.faculties?.name, s.zones?.name
    ].join(" ").toLowerCase();

    return (!q || text.includes(q)) &&
      (!status || s.status === status) &&
      (!gender || s.gender === gender);
  });

  page = 1;
  render();
}

function genderLabel(gender) {
  if (gender === "FEMALE") return '<span class="gender-badge female">Femme</span>';
  if (gender === "MALE") return '<span class="gender-badge male">Homme</span>';
  return '<span class="gender-badge missing">Non défini</span>';
}

function render() {
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (page > totalPages) page = totalPages;

  const start = (page - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);

  $("#rows").innerHTML = rows.map(s => `
    <tr>
      <td class="member-thumb-cell">
        ${s.photo_url ? `<img src="${escapeHtml(s.photo_url)}" alt="Photo" class="member-thumb" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';">` : ""}
        <span class="member-thumb-fallback" ${s.photo_url ? 'style="display:none;"' : ''}>${escapeHtml((s.prenom || "A").charAt(0).toUpperCase())}</span>
      </td>
      <td>${escapeHtml(s.nom)}</td>
      <td>${escapeHtml(s.prenom)}</td>
      <td>${genderLabel(s.gender)}</td>
      <td>${escapeHtml(s.numero_abonnement)}</td>
      <td>${escapeHtml(s.cin)}</td>
      <td>${escapeHtml(facultyShort(s.faculties?.name) || "—")}</td>
      <td>${escapeHtml(s.zones?.name || "—")}</td>
      <td>${statusBadge(s.status)}</td>
      <td class="actions">
        <button class="icon-btn" title="Voir la carte membre" onclick="showMemberCard('${s.id}')">▣</button>
        <button class="icon-btn" title="Modifier" onclick="editSub('${s.id}')">${ICONS.edit}</button>
        <button class="icon-btn" title="Activer/Désactiver" onclick="toggleSub('${s.id}')">${s.status === "ACTIVE" ? ICONS.pause : ICONS.play}</button>
        <button class="icon-btn" title="Réinitialiser mot de passe" onclick="resetPassword('${s.user_id}')">${ICONS.refresh}</button>
        <button class="icon-btn danger" title="Supprimer" onclick="deleteSub('${s.id}')">${ICONS.trash}</button>
      </td>
    </tr>
  `).join("") || '<tr><td colspan="10" class="empty">Aucun résultat</td></tr>';

  $("#pageInfo").textContent = `Page ${page} / ${totalPages}`;
  $("#prev").disabled = page <= 1;
  $("#next").disabled = page >= totalPages;
}

function openMemberCard(subscriber) {
  const user = subscriber || {};
  const card = `
    <div class="member-card-wrap">
      <div class="member-card-header">
        <div class="member-card-avatar">
          ${user.photo_url ? `<img src="${escapeHtml(user.photo_url)}" alt="Photo membre" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : ""}
          <span class="member-card-avatar-fallback" ${user.photo_url ? 'style="display:none;"' : ''}>${escapeHtml((user.prenom || "A").charAt(0).toUpperCase())}</span>
        </div>
        <div>
          <div class="member-card-name">${escapeHtml(`${user.prenom || ""} ${user.nom || ""}`.trim() || "Abonné")}</div>
          <div class="member-card-status">${statusBadge(user.status)}</div>
        </div>
      </div>
      <div class="member-card-grid">
        <div><span>N° abonnement</span><strong>${escapeHtml(user.numero_abonnement || "—")}</strong></div>
        <div><span>CIN</span><strong>${escapeHtml(user.cin || "—")}</strong></div>
        <div><span>Téléphone</span><strong>${escapeHtml(user.phone || "—")}</strong></div>
        <div><span>Email</span><strong>${escapeHtml(user.email || "—")}</strong></div>
        <div><span>Faculté</span><strong>${escapeHtml(user.faculties?.name || "—")}</strong></div>
        <div><span>Zone</span><strong>${escapeHtml(user.zones?.name || "—")}</strong></div>
        <div><span>Sexe</span><strong>${escapeHtml(user.gender === "FEMALE" ? "Femme" : user.gender === "MALE" ? "Homme" : "Non défini")}</strong></div>
        <div><span>Adresse</span><strong>${escapeHtml(user.adresse || "—")}</strong></div>
      </div>
    </div>
  `;

  $("#memberCardContent").innerHTML = card;
  $("#memberCardModal").classList.remove("hidden");
}

window.showMemberCard = id => {
  const s = allSubs.find(x => x.id === id);
  if (!s) return;
  openMemberCard(s);
};

function openModal(s = null) {
  $("#modal").classList.remove("hidden");
  $("#modalTitle").textContent = s ? "Modifier un abonné" : "Ajouter un abonné";
  $("#editId").value = s?.id || "";

  const fields = {
    fNom: s?.nom || "",
    fPrenom: s?.prenom || "",
    fNumero: s?.numero_abonnement || "",
    fLogin: s?.login_name || "DHIASOUDA",
    fCin: s?.cin || "",
    fPhone: s?.phone || "",
    fEmail: s?.email || "",
    fPhotoUrl: s?.photo_url || "",
    fAdresse: s?.adresse || ""
  };

  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });

  $("#fGender").value = s?.gender || "";
  selectFaculty(s?.faculty_id || "", s?.faculties?.name || "");
  $("#fZone").value = s?.zone_id || "";
  $("#fStatus").value = s?.status || "ACTIVE";
}

window.editSub = id => openModal(allSubs.find(s => s.id === id));

window.toggleSub = async id => {
  const s = allSubs.find(x => x.id === id);
  if (!s) return;

  const { error } = await sb
    .from("subscribers")
    .update({ status: s.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })
    .eq("id", id);

  if (error) return showAlert("#pageAlert", error.message, "error");
  await loadSubs();
};

window.resetPassword = async userId => {
  const password = await promptDialog("Nouveau mot de passe", {
    input: "password",
    placeholder: "12 caractères min. : majuscule, minuscule, chiffre, spécial",
    confirmText: "Réinitialiser"
  });
  if (!password) return;
  if (password.length < 12) return showAlert("#pageAlert", "Le mot de passe doit contenir au moins 12 caractères.", "error");
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) return showAlert("#pageAlert", "Utilisez une majuscule, une minuscule, un chiffre et un caractère spécial.", "error");

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showAlert("#pageAlert", "Session administrateur expirée.", "error");

  const response = await fetch(`${UE_CONFIG.SUPABASE_URL}/functions/v1/admin-reset-password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ user_id: userId, new_password: password })
  });

  let result = {};
  try { result = await response.json(); } catch (_) {}

  if (!response.ok) {
    return showAlert("#pageAlert", result.error || "Réinitialisation impossible.", "error");
  }

  showAlert("#pageAlert", "Mot de passe réinitialisé. Le changement sera demandé à la prochaine connexion.");
};

window.deleteSub = async id => {
  if (!(await confirmDialog("Supprimer cet abonné et son compte ? Cette action est irréversible.", { confirmText: "Supprimer" }))) return;

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showAlert("#pageAlert", "Session administrateur expirée.", "error");

  const response = await fetch(`${UE_CONFIG.SUPABASE_URL}/functions/v1/admin-delete-user`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ subscriber_id: id })
  });

  let result = {};
  try { result = await response.json(); } catch (_) {}

  if (!response.ok) return showAlert("#pageAlert", result.error || "Suppression impossible.", "error");
  await loadSubs();
};

async function init() {
  const ctx = await requireAdmin();
  if (!ctx) return;

  setupShell();
  setupFacultyCombo();
  await loadRefs();
  await loadSubs();

  $("#search").oninput = apply;
  $("#statusFilter").onchange = apply;
  $("#genderFilter").onchange = apply;

  $("#prev").onclick = () => {
    if (page > 1) { page--; render(); }
  };

  $("#next").onclick = () => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page < totalPages) { page++; render(); }
  };

  $("#addBtn").onclick = () => openModal();
  $("#closeModal").onclick = () => $("#modal").classList.add("hidden");
  $("#cancelModal").onclick = () => $("#modal").classList.add("hidden");
  $("#closeMemberCardModal").onclick = () => $("#memberCardModal").classList.add("hidden");
}

$("#subscriberForm").addEventListener("submit", async e => {
  e.preventDefault();

  const id = $("#editId").value;
  const gender = $("#fGender").value;

  if (!gender) {
    return showAlert("#pageAlert", "Veuillez sélectionner le sexe : Homme ou Femme.", "error");
  }

  const payload = {
    nom: $("#fNom").value.trim(),
    prenom: $("#fPrenom").value.trim(),
    numero_abonnement: $("#fNumero").value.trim(),
    login_name: $("#fLogin").value.trim().toUpperCase(),
    cin: $("#fCin").value.trim(),
    gender,
    phone: $("#fPhone").value.trim(),
    email: $("#fEmail").value.trim(),
    photo_url: $("#fPhotoUrl").value.trim() || null,
    adresse: $("#fAdresse").value.trim(),
    faculty_id: $("#fFaculte").value || null,
    zone_id: $("#fZone").value || null,
    status: $("#fStatus").value
  };

  if (!payload.nom || !payload.prenom || !payload.numero_abonnement || !payload.login_name || !payload.cin) {
    return showAlert("#pageAlert", "Veuillez remplir tous les champs obligatoires.", "error");
  }

  if (id) {
    const { error } = await sb.from("subscribers").update(payload).eq("id", id);
    if (error) return showAlert("#pageAlert", error.message, "error");
    showAlert("#pageAlert", "Abonné modifié avec succès.");
  } else {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return showAlert("#pageAlert", "Session administrateur expirée.", "error");

    const response = await fetch(`${UE_CONFIG.SUPABASE_URL}/functions/v1/admin-create-user`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    let result = {};
    try { result = await response.json(); } catch (_) {}

    if (!response.ok) return showAlert("#pageAlert", result.error || "Création impossible.", "error");
    showAlert("#pageAlert", "Abonné créé avec succès.");
  }

  $("#modal").classList.add("hidden");
  await loadSubs();
});

init();
