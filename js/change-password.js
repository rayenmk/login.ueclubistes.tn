(async()=>{
  const ctx=await requireAuthenticated();
  if(!ctx)return;

  const logoutBtn=$("#logoutBtn");
  if(logoutBtn){
    logoutBtn.onclick=async()=>{
      await sb.auth.signOut();
      location.href="index.html";
    };
  }

  const form=$("#changeForm");
  if(!form)return;

  form.onsubmit=async e=>{
    e.preventDefault();

    const p=$("#p1").value;
    const c=$("#p2").value;
    const btn=form.querySelector('button[type="submit"]');

    if(p.length<12){
      return showAlert("#alert","Minimum 12 caractères.","error");
    }

    if(!/[A-Z]/.test(p)||!/[a-z]/.test(p)||!/[0-9]/.test(p)||!/[^A-Za-z0-9]/.test(p)){
      return showAlert("#alert","Utilisez une majuscule, une minuscule, un chiffre et un caractère spécial.","error");
    }

    if(p!==c){
      return showAlert("#alert","Les mots de passe ne correspondent pas.","error");
    }

    if(btn){
      btn.disabled=true;
      btn.textContent="Enregistrement…";
    }

    try{
      // 1. Change the Supabase Auth password
      const {error:passwordError}=await sb.auth.updateUser({password:p});

      if(passwordError){
        throw new Error(passwordError.message||"Impossible de changer le mot de passe.");
      }

      // 2. Clear the first-login flag securely on the server
      const {error:rpcError}=await sb.rpc("complete_password_change");

      if(rpcError){
        console.error("complete_password_change error:",rpcError);
        throw new Error("Le mot de passe a été changé, mais la validation du compte a échoué. Vérifiez que la fonction SQL complete_password_change() est bien installée.");
      }

      // 3. Verify that the flag is really cleared before redirecting
      const {data:updatedProfile,error:profileError}=await sb
        .from("profiles")
        .select("role,must_change_password,is_active")
        .eq("id",ctx.user.id)
        .single();

      if(profileError||!updatedProfile){
        console.error("Profile verification error:",profileError);
        throw new Error("Impossible de vérifier votre profil après le changement de mot de passe.");
      }

      if(updatedProfile.is_active===false){
        await sb.auth.signOut();
        location.href="index.html";
        return;
      }

      if(updatedProfile.must_change_password===true){
        console.error("Password flag still true after RPC",updatedProfile);
        throw new Error("Le compte est toujours marqué comme nécessitant un changement de mot de passe. Vérifiez la fonction SQL complete_password_change().");
      }

      showAlert("#alert","Mot de passe changé avec succès.","success");

      // Small delay so the success message is visible
      setTimeout(()=>{
        location.href=updatedProfile.role==="ADMIN"?"dashboard.html":"subscriber.html";
      },600);

    }catch(error){
      console.error("Password change error:",error);
      if(btn){
        btn.disabled=false;
        btn.textContent="Enregistrer →";
      }
      showAlert("#alert",error?.message||"Une erreur est survenue.","error");
    }
  };
})();
