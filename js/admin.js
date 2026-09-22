let facultyChart, zoneChart;
(async function init(){
  const ctx=await requireAdmin(); if(!ctx)return; setupShell(); $("#adminName").textContent=ctx.profile.display_name||"Admin";
  const {data: subs,error}=await sb.from("subscribers").select("id,nom,prenom,numero_abonnement,status,created_at,faculties(name),zones(name)").order("created_at",{ascending:false});
  if(error)return showAlert("#pageAlert","Erreur de chargement des statistiques.","error");
  const total=subs.length, active=subs.filter(s=>s.status==="ACTIVE").length;
  $("#total").textContent=total;$("#active").textContent=active;$("#inactive").textContent=total-active;$("#rate").textContent=total?Math.round(active/total*100)+"%":"0%";
  const countBy=(key)=>Object.entries(subs.reduce((a,s)=>{let k=s[key]?.name||"Non défini";if(key==="faculties")k=facultyShort(k);a[k]=(a[k]||0)+1;return a},{}));
  const fac=countBy("faculties"), zones=countBy("zones");
  facultyChart=new Chart($("#facultyChart"),{type:"bar",data:{labels:fac.map(x=>x[0]),datasets:[{label:"Abonnés",data:fac.map(x=>x[1]),borderRadius:8}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}});
  zoneChart=new Chart($("#zoneChart"),{type:"doughnut",data:{labels:zones.map(x=>x[0]),datasets:[{data:zones.map(x=>x[1])}]},options:{responsive:true,plugins:{legend:{position:"bottom"}}}});
  $("#recentRows").innerHTML=subs.slice(0,8).map(s=>`<tr><td>${escapeHtml(s.nom)}</td><td>${escapeHtml(s.prenom)}</td><td>${escapeHtml(s.numero_abonnement)}</td><td>${escapeHtml(facultyShort(s.faculties?.name)||"—")}</td><td>${escapeHtml(s.zones?.name||"—")}</td><td>${statusBadge(s.status)}</td></tr>`).join("")||`<tr><td colspan="6" class="empty">Aucun abonné</td></tr>`;
})();
