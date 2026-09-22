const tableName=location.pathname.toLowerCase().includes("zones")?"zones":"faculties";
let allRefs=[];
(async()=>{const ctx=await requireAdmin();if(!ctx)return;setupShell();await loadRefs();$("#refSearch")?.addEventListener("input",renderRefs);})();
function stripAccents(s){return String(s).normalize("NFD").replace(/[̀-ͯ]/g,"");}
async function loadRefs(){const {data,error}=await sb.from(tableName).select("id,name,created_at").order("name");if(error)return showAlert("#pageAlert",error.message,"error");allRefs=data||[];renderRefs();}
function renderRefs(){
  const q=stripAccents(($("#refSearch")?.value||"").trim().toLowerCase());
  const list=q?allRefs.filter(x=>stripAccents(x.name).toLowerCase().includes(q)):allRefs;
  $("#refGrid").innerHTML=list.map(x=>`<article class="ref-card"><div><span class="ref-dot"></span><strong>${escapeHtml(x.name)}</strong></div><div class="actions"><button class="icon-btn" onclick="editRef('${x.id}','${escapeHtml(x.name).replace(/'/g,"&#039;")}')">${ICONS.edit}</button><button class="icon-btn danger" onclick="deleteRef('${x.id}')">${ICONS.trash}</button></div></article>`).join("")||`<div class="empty">Aucune donnée</div>`;
}
function editRef(id,name){$("#refModal").classList.remove("hidden");$("#refTitle").textContent="Modifier";$("#refId").value=id;$("#refName").value=name;}
$("#addRef").onclick=()=>{$("#refModal").classList.remove("hidden");$("#refTitle").textContent="Ajouter";$("#refId").value="";$("#refName").value=""};
$("#closeRef").onclick=()=>$("#refModal").classList.add("hidden");
$("#refForm").onsubmit=async e=>{e.preventDefault();const id=$("#refId").value,name=$("#refName").value.trim();const q=id?sb.from(tableName).update({name}).eq("id",id):sb.from(tableName).insert({name});const {error}=await q;if(error)return showAlert(null,error.message,"error");$("#refModal").classList.add("hidden");loadRefs();showAlert(null,id?"Élément modifié.":"Élément ajouté.");};
window.editRef=editRef;window.deleteRef=async id=>{if(!(await confirmDialog("Supprimer cet élément ?",{confirmText:"Supprimer"})))return;const {error}=await sb.from(tableName).delete().eq("id",id);if(error)showAlert(null,error.message,"error");else{loadRefs();showAlert(null,"Élément supprimé.");}};
