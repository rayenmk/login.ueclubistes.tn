let facultyChart, zoneChart, facData, zoneData;

function renderCharts(){
  if(!facData) return;
  const dark=document.documentElement.getAttribute("data-theme")==="dark";
  const ink=dark?"#f2f3f5":"#111214", grid=dark?"#2a2d34":"#e7e8ec", muted=dark?"#a2a6ae":"#6c7078";
  Chart.defaults.color=muted; Chart.defaults.font.family="Inter, system-ui, sans-serif";
  const zonePalette=["#c8102e","#111214","#e51c3f","#4a4c52","#8c0b20","#ff8ea0"];

  facultyChart?.destroy(); zoneChart?.destroy();

  facultyChart=new Chart($("#facultyChart"),{type:"bar",data:{labels:facData.map(x=>x[0]),datasets:[{label:"Abonnés",data:facData.map(x=>x[1]),borderRadius:8,backgroundColor:"#c8102e",hoverBackgroundColor:"#e51c3f",maxBarThickness:38}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:muted},grid:{display:false}},y:{beginAtZero:true,ticks:{precision:0,color:muted},grid:{color:grid}}}}});
  zoneChart=new Chart($("#zoneChart"),{type:"doughnut",data:{labels:zoneData.map(x=>x[0]),datasets:[{data:zoneData.map(x=>x[1]),backgroundColor:zonePalette,borderColor:dark?"#16181c":"#ffffff",borderWidth:3,hoverOffset:6}]},options:{responsive:true,plugins:{legend:{position:"bottom",labels:{color:ink,usePointStyle:true,padding:16}}}}});
}

window.addEventListener("ue-theme-change", renderCharts);

(async function init(){
  const ctx=await requireAdmin(); if(!ctx)return; setupShell();
  const displayName=ctx.profile.display_name||"Admin";
  $("#adminName").textContent=displayName;
  if($("#adminGreetName"))$("#adminGreetName").textContent=displayName;
  const {data: subs,error}=await sb.from("subscribers").select("id,nom,prenom,numero_abonnement,status,created_at,faculties(name),zones(name)").order("created_at",{ascending:false});
  if(error)return showAlert("#pageAlert","Erreur de chargement des statistiques.","error");
  const total=subs.length, active=subs.filter(s=>s.status==="ACTIVE").length;
  $("#total").textContent=total;$("#active").textContent=active;$("#inactive").textContent=total-active;$("#rate").textContent=total?Math.round(active/total*100)+"%":"0%";
  const countBy=(key)=>Object.entries(subs.reduce((a,s)=>{let k=s[key]?.name||"Non défini";if(key==="faculties")k=facultyShort(k);a[k]=(a[k]||0)+1;return a},{}));
  facData=countBy("faculties"); zoneData=countBy("zones");
  renderCharts();
  $("#recentRows").innerHTML=subs.slice(0,8).map(s=>`<tr><td>${escapeHtml(s.nom)}</td><td>${escapeHtml(s.prenom)}</td><td>${escapeHtml(s.numero_abonnement)}</td><td>${escapeHtml(facultyShort(s.faculties?.name)||"—")}</td><td>${escapeHtml(s.zones?.name||"—")}</td><td>${statusBadge(s.status)}</td></tr>`).join("")||`<tr><td colspan="6" class="empty">Aucun abonné</td></tr>`;
})();
