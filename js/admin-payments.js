let events = [];
let paymentCounts = new Map(); // event_id -> paid count
let activeSubscribersCount = 0;
let editingEvent = null;

let currentEvent = null;
let currentSubscribers = []; // active subscribers, cached across event views
let currentPayments = new Map(); // subscriber_id -> payment row for currentEvent

function formatAmount(amount) {
  const n = Number(amount) || 0;
  return `${n.toLocaleString("fr-TN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} DT`;
}

function formatEventDate(date) {
  if (!date) return "Date non définie";
  return new Date(`${date}T12:00:00`).toLocaleDateString("fr-TN", { day: "2-digit", month: "long", year: "numeric" });
}

async function loadEvents() {
  const [eventsResult, paymentsResult, subsResult] = await Promise.all([
    sb.from("events").select("id,name,description,amount,event_date,is_active").order("event_date", { ascending: false }),
    sb.from("event_payments").select("event_id,paid").eq("paid", true),
    sb.from("subscribers").select("id", { count: "exact", head: true }).eq("status", "ACTIVE")
  ]);

  if (eventsResult.error) return showAlert("#pageAlert", eventsResult.error.message, "error");

  events = eventsResult.data || [];
  activeSubscribersCount = subsResult.count || 0;

  paymentCounts = new Map();
  for (const row of paymentsResult.data || []) {
    paymentCounts.set(row.event_id, (paymentCounts.get(row.event_id) || 0) + 1);
  }

  renderEvents();
}

function renderEvents() {
  const container = $("#eventsGrid");

  if (!events.length) {
    container.innerHTML = '<div class="empty-card">Aucun événement pour le moment. Ajoutez-en un pour commencer une collecte.</div>';
    return;
  }

  container.innerHTML = events.map(ev => {
    const paidCount = paymentCounts.get(ev.id) || 0;
    const total = activeSubscribersCount;
    const percent = total ? Math.round((paidCount / total) * 100) : 0;
    const collected = paidCount * Number(ev.amount || 0);

    return `
      <article class="panel event-card">
        <div class="panel-head">
          <div>
            <span class="mini-label">${ev.is_active ? "ACTIF" : "CLÔTURÉ"}</span>
            <h2>${escapeHtml(ev.name)}</h2>
            <p class="muted-text">${escapeHtml(formatEventDate(ev.event_date))} · ${formatAmount(ev.amount)} / abonné</p>
          </div>
          <span class="badge ${ev.is_active ? "active" : "inactive"}">${ev.is_active ? "Actif" : "Fermé"}</span>
        </div>
        ${ev.description ? `<p class="muted-text event-desc">${escapeHtml(ev.description)}</p>` : ""}
        <div class="bar-row">
          <div><span>${paidCount} / ${total} abonnés ont payé</span><strong>${formatAmount(collected)}</strong></div>
          <div class="bar-track"><i style="width:${percent}%"></i></div>
        </div>
        <div class="admin-card-actions">
          <button class="btn primary" onclick="openPayments('${ev.id}')">Gérer les paiements</button>
          <button class="btn secondary" onclick="editEvent('${ev.id}')">${ICONS.edit} Modifier</button>
          <button class="btn danger-btn" onclick="deleteEvent('${ev.id}')">${ICONS.trash} Supprimer</button>
        </div>
      </article>
    `;
  }).join("");
}

function openEventForm(event = null) {
  editingEvent = event;
  $("#eventFormTitle").textContent = event ? "Modifier un événement" : "Ajouter un événement";
  $("#eventId").value = event?.id || "";
  $("#eventName").value = event?.name || "";
  $("#eventDescription").value = event?.description || "";
  $("#eventDate").value = event?.event_date || "";
  $("#eventAmount").value = event?.amount ?? "";
  $("#eventActive").value = String(event?.is_active ?? true);
  $("#eventFormModal").classList.remove("hidden");
}

window.editEvent = id => openEventForm(events.find(e => e.id === id));

window.deleteEvent = async id => {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  if (!(await confirmDialog(`Supprimer l'événement "${ev.name}" et tous les paiements associés ?`, { confirmText: "Supprimer" }))) return;

  const { error } = await sb.from("events").delete().eq("id", id);
  if (error) return showAlert("#pageAlert", error.message, "error");

  showAlert("#pageAlert", "Événement supprimé.");
  await loadEvents();
};

$("#eventForm").addEventListener("submit", async e => {
  e.preventDefault();

  const payload = {
    name: $("#eventName").value.trim(),
    description: $("#eventDescription").value.trim() || null,
    event_date: $("#eventDate").value || null,
    amount: Number($("#eventAmount").value) || 0,
    is_active: $("#eventActive").value === "true"
  };

  if (!payload.name) return showAlert("#pageAlert", "Le nom de l'événement est obligatoire.", "error");

  const id = $("#eventId").value;
  const result = id
    ? await sb.from("events").update(payload).eq("id", id)
    : await sb.from("events").insert(payload);

  if (result.error) return showAlert("#pageAlert", result.error.message, "error");

  $("#eventFormModal").classList.add("hidden");
  showAlert("#pageAlert", "Événement enregistré avec succès.");
  await loadEvents();
});

// ------------------------------------------------------------
// Per-event payment collection
// ------------------------------------------------------------
async function loadSubscribersOnce() {
  if (currentSubscribers.length) return;
  const { data, error } = await sb.from("subscribers")
    .select("id,nom,prenom,numero_abonnement,status,faculties(name)")
    .eq("status", "ACTIVE")
    .order("nom", { ascending: true });
  if (error) return showAlert("#pageAlert", error.message, "error");
  currentSubscribers = data || [];
}

window.openPayments = async eventId => {
  currentEvent = events.find(e => e.id === eventId);
  if (!currentEvent) return;

  $("#payEventTitle").textContent = currentEvent.name;
  $("#payEventMeta").textContent = `${formatEventDate(currentEvent.event_date)} · ${formatAmount(currentEvent.amount)} / abonné`;
  $("#payRows").innerHTML = '<tr><td colspan="6" class="empty">Chargement…</td></tr>';
  $("#eventPayModal").classList.remove("hidden");

  await loadSubscribersOnce();

  const { data, error } = await sb.from("event_payments").select("subscriber_id,paid,paid_at").eq("event_id", eventId);
  if (error) return showAlert("#pageAlert", error.message, "error");

  currentPayments = new Map((data || []).map(p => [p.subscriber_id, p]));
  renderPayRows();
  renderPayStats();
};

function renderPayStats() {
  const total = currentSubscribers.length;
  const paidCount = [...currentPayments.values()].filter(p => p.paid).length;
  const collected = paidCount * Number(currentEvent.amount || 0);
  const remaining = (total - paidCount) * Number(currentEvent.amount || 0);

  $("#payStats").innerHTML = `
    <article class="stat-card accent-card"><span>Collecté</span><strong>${formatAmount(collected)}</strong></article>
    <article class="stat-card"><span>Ont payé</span><strong>${paidCount} / ${total}</strong></article>
    <article class="stat-card"><span>Reste à collecter</span><strong>${formatAmount(remaining)}</strong></article>
  `;
}

function renderPayRows() {
  const q = $("#paySearch").value.toLowerCase().trim();
  const filter = $("#payFilter").value;

  const rows = currentSubscribers.filter(s => {
    const payment = currentPayments.get(s.id);
    const paid = payment?.paid === true;
    const text = `${s.nom} ${s.prenom} ${s.numero_abonnement}`.toLowerCase();
    return (!q || text.includes(q)) && (!filter || (filter === "paid" ? paid : !paid));
  });

  $("#payRows").innerHTML = rows.map(s => {
    const payment = currentPayments.get(s.id);
    const paid = payment?.paid === true;
    return `
      <tr>
        <td>${escapeHtml(s.nom)}</td>
        <td>${escapeHtml(s.prenom)}</td>
        <td>${escapeHtml(s.numero_abonnement)}</td>
        <td>${escapeHtml(facultyShort(s.faculties?.name) || "—")}</td>
        <td>${paid ? '<span class="badge active">Payé</span>' : '<span class="badge inactive">Non payé</span>'}</td>
        <td class="actions"><button class="icon-btn" title="${paid ? "Marquer non payé" : "Marquer payé"}" onclick="togglePayment('${s.id}')">${paid ? ICONS.close : ICONS.refresh}</button></td>
      </tr>
    `;
  }).join("") || '<tr><td colspan="6" class="empty">Aucun abonné trouvé.</td></tr>';
}

window.togglePayment = async subscriberId => {
  if (!currentEvent) return;
  const existing = currentPayments.get(subscriberId);
  const nextPaid = !existing?.paid;

  const { data, error } = await sb.from("event_payments")
    .upsert({
      event_id: currentEvent.id,
      subscriber_id: subscriberId,
      paid: nextPaid,
      paid_at: nextPaid ? new Date().toISOString() : null
    }, { onConflict: "event_id,subscriber_id" })
    .select("subscriber_id,paid,paid_at")
    .single();

  if (error) return showAlert("#pageAlert", error.message, "error");

  currentPayments.set(subscriberId, data);
  renderPayRows();
  renderPayStats();
  paymentCounts.set(currentEvent.id, [...currentPayments.values()].filter(p => p.paid).length);
};

async function init() {
  const ctx = await requireAdmin();
  if (!ctx) return;
  setupShell();
  await loadEvents();

  $("#addEventBtn").onclick = () => openEventForm();
  $("#closeEventFormModal").onclick = () => $("#eventFormModal").classList.add("hidden");
  $("#cancelEventForm").onclick = () => $("#eventFormModal").classList.add("hidden");
  $("#closePayModal").onclick = () => {
    $("#eventPayModal").classList.add("hidden");
    renderEvents();
  };
  $("#paySearch").oninput = renderPayRows;
  $("#payFilter").onchange = renderPayRows;

  [$("#eventFormModal"), $("#eventPayModal")].forEach(modal => {
    modal.addEventListener("click", e => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  });
}

init();
