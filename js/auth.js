document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    const { data: profile } = await sb.from("profiles").select("role,must_change_password,is_active").eq("id", session.user.id).single();
    if (!profile || profile.is_active === false) { await sb.auth.signOut(); return; }
    if (profile?.must_change_password) location.href = "change-password.html";
    else if (profile?.role === "ADMIN") location.href = "dashboard.html";
    else if (profile?.role === "SUBSCRIBER") location.href = "subscriber.html";
  }

  const form = document.querySelector("#loginForm");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const err = document.querySelector("#loginError");
    const button = form.querySelector("button[type=submit]");
    err.classList.add("hidden");
    err.textContent = "";

    const login = document.querySelector("#login").value.trim();
    const password = document.querySelector("#password").value;
    if (!login || !password) return;

    button.disabled = true;
    const original = button.innerHTML;
    button.innerHTML = "Connexion…";

    // Admins can use their normal email. Subscribers may use their login_name
    // (for example DHIASOUDA), which is mapped to the internal Auth email.
    const authEmail = login.includes("@") ? login.toLowerCase() : syntheticEmail(login);
    const { data, error } = await sb.auth.signInWithPassword({ email: authEmail, password });

    if (error) {
      console.error("Supabase login error:", error);
      err.textContent = error.message || "Login ou mot de passe incorrect.";
      err.classList.remove("hidden");
      button.disabled = false;
      button.innerHTML = original;
      return;
    }

    const { data: profile, error: profileError } = await sb.from("profiles")
      .select("role,must_change_password,display_name,is_active")
      .eq("id", data.user.id).single();

    if (profileError || !profile) {
      await sb.auth.signOut();
      err.textContent = "Profil utilisateur introuvable.";
      err.classList.remove("hidden");
      button.disabled = false;
      button.innerHTML = original;
      return;
    }

    if (profile.is_active === false) {
      await sb.auth.signOut();
      err.textContent = "Ce compte est désactivé. Contactez l’administration.";
      err.classList.remove("hidden");
      button.disabled = false;
      button.innerHTML = original;
      return;
    }

    if (profile.role === "ADMIN") {
      location.href = profile.must_change_password ? "change-password.html" : "dashboard.html";
      return;
    }

    if (profile.role === "SUBSCRIBER") {
      const { data: subscriber } = await sb.from("subscribers")
        .select("status").eq("user_id", data.user.id).maybeSingle();

      if (subscriber?.status === "INACTIVE") {
        await sb.auth.signOut();
        err.textContent = "Votre abonnement est désactivé. Contactez l’administration.";
        err.classList.remove("hidden");
        button.disabled = false;
        button.innerHTML = original;
        return;
      }

      location.href = profile.must_change_password ? "change-password.html" : "subscriber.html";
      return;
    }

    await sb.auth.signOut();
    err.textContent = "Rôle utilisateur non autorisé.";
    err.classList.remove("hidden");
    button.disabled = false;
    button.innerHTML = original;
  });
});
