let admins=[];
const fn=(name)=>`${UE_CONFIG.SUPABASE_URL}/functions/v1/${name}`;
async function callFn(name,body){
  const {data:{session}}=await sb.auth.getSession();
  if(!session) throw new Error("Session administrateur expirée.");
  const r=await fetch(fn(name),{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,apikey:UE_CONFIG.SUPABASE_ANON_KEY,"Content-Type":"application/json"},body:JSON.stringify(body)});
  let j={};try{j=await r.json()}catch{}
  if(!r.ok)throw new Error(j.error||`Erreur ${r.status}`);return j;
}
async function loadAdmins(){
 const {data,error}=await sb.from("profiles").select("id,display_name,email,is_active,created_at").eq("role","ADMIN").order("created_at",{ascending:true});
 if(error)return showAlert("#pageAlert","Impossible de charger les administrateurs.","error");
 admins=data||[];render();
}
function render(){
 $("#adminRows").innerHTML=admins.map(a=>`<tr><td>${escapeHtml(a.display_name||"—")}</td><td>${escapeHtml(a.email||"—")}</td><td>${statusBadge(a.is_active===false?"INACTIVE":"ACTIVE")}</td><td>${escapeHtml(new Date(a.created_at).toLocaleDateString("fr-TN"))}</td><td class="actions"><button class="icon-btn" title="Modifier" onclick="editAdmin('${a.id}')">${ICONS.edit}</button><button class="icon-btn" title="Activer/Désactiver" onclick="toggleAdmin('${a.id}')">${a.is_active===false?ICONS.play:ICONS.pause}</button><button class="icon-btn" title="Réinitialiser mot de passe" onclick="resetAdmin('${a.id}')">${ICONS.refresh}</button><button class="icon-btn danger" title="Supprimer" onclick="deleteAdmin('${a.id}')">${ICONS.trash}</button></td></tr>`).join("")||'<tr><td colspan="5" class="empty">Aucun administrateur</td></tr>';
}
function openAdmin(a=null){$("#adminModal").classList.remove("hidden");$("#adminModalTitle").textContent=a?"Modifier l'administrateur":"Ajouter un administrateur";$("#adminId").value=a?.id||"";$("#adminName").value=a?.display_name||"";$("#adminEmail").value=a?.email||"";$("#adminPassword").value="";$("#adminPassword").required=!a;$("#adminForm button[type=submit]").textContent=a?"Enregistrer les modifications":"Créer l'administrateur";}
window.editAdmin=id=>openAdmin(admins.find(x=>x.id===id));
window.toggleAdmin=async id=>{try{const a=admins.find(x=>x.id===id);if(!a)return;await callFn("admin-update-admin",{user_id:id,is_active:a.is_active===false});await loadAdmins();showAlert("#pageAlert","Statut mis à jour.")}catch(e){showAlert("#pageAlert",e.message,"error")}};
window.resetAdmin=async id=>{const p=await promptDialog("Nouveau mot de passe",{input:"password",placeholder:"12 caractères min. : majuscule, minuscule, chiffre, spécial",confirmText:"Réinitialiser"});if(!p)return;try{await callFn("admin-reset-password",{user_id:id,new_password:p});showAlert("#pageAlert","Mot de passe réinitialisé.")}catch(e){showAlert("#pageAlert",e.message,"error")}};
window.deleteAdmin=async id=>{if(!(await confirmDialog("Supprimer définitivement cet administrateur ?",{confirmText:"Supprimer"})))return;try{await callFn("admin-delete-admin",{user_id:id});await loadAdmins();showAlert("#pageAlert","Administrateur supprimé.")}catch(e){showAlert("#pageAlert",e.message,"error")}};
$("#adminForm").addEventListener("submit",async e=>{e.preventDefault();const id=$("#adminId").value;try{if(id){await callFn("admin-update-admin",{user_id:id,display_name:$("#adminName").value.trim(),email:$("#adminEmail").value.trim()});showAlert("#pageAlert","Administrateur modifié.")}else{const p=$("#adminPassword").value;if(p.length<12)return showAlert("#adminFormAlert","Mot de passe trop faible.","error");await callFn("admin-create-admin",{display_name:$("#adminName").value.trim(),email:$("#adminEmail").value.trim(),password:p});showAlert("#pageAlert","Administrateur créé. Il devra changer son mot de passe à la première connexion.")}$("#adminModal").classList.add("hidden");await loadAdmins();}catch(e){showAlert("#adminFormAlert",e.message,"error")}});
$("#addAdminBtn").onclick=()=>openAdmin();$("#closeAdminModal").onclick=()=>$("#adminModal").classList.add("hidden");$("#adminModal").addEventListener("click",e=>{if(e.target===$("#adminModal"))$("#adminModal").classList.add("hidden")});
(async()=>{const ctx=await requireAdmin();if(!ctx)return;setupShell();await loadAdmins()})();
