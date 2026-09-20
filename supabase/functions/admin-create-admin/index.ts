import { createClient } from "npm:@supabase/supabase-js@2";

export const allowedOrigins = new Set([
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://login.ueclubiste.tn",
  "https://ueclubiste.tn",
  "https://www.ueclubiste.tn"
]);

export function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = allowedOrigins.has(origin) ? origin : "";
  return {
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

export function options(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function getSecretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const values = Object.values(parsed).filter((v): v is string => typeof v === "string" && v.length > 20);
    return values[0] || null;
  } catch {
    return null;
  }
}

export function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = getSecretKey();
  if (!url || !key) throw new Error("Server Supabase secret key is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function requireAdmin(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders(req) });

  const admin = createAdminClient();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders(req) });

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "ADMIN" || profile?.is_active === false) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders(req) });
  }

  return { admin, caller: user, profile };
}

export function validateStrongPassword(password: unknown) {
  const p = String(password ?? "");
  if (p.length < 12) return "Le mot de passe doit contenir au moins 12 caractères.";
  if (!/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/[0-9]/.test(p) || !/[^A-Za-z0-9]/.test(p)) {
    return "Le mot de passe doit contenir une majuscule, une minuscule, un chiffre et un caractère spécial.";
  }
  return null;
}

export async function rateLimit(admin: ReturnType<typeof createClient>, callerId: string, action: string, max: number, minutes: number) {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { count, error } = await admin
    .from("security_audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", callerId)
    .eq("action", action)
    .gte("created_at", since);
  if (error) return;
  if ((count || 0) >= max) throw new Error("Trop de requêtes. Réessayez plus tard.");
}

export async function audit(admin: ReturnType<typeof createClient>, actorId: string, action: string, targetId: string | null, success: boolean, metadata: Record<string, unknown> = {}) {
  await admin.from("security_audit_logs").insert({
    actor_id: actorId,
    action,
    target_id: targetId,
    success,
    metadata,
  });
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  let ctx;
  try {
    ctx = await requireAdmin(req);
    await rateLimit(ctx.admin, ctx.caller.id, "CREATE_ADMIN", 10, 60);
    const b = await req.json();
    const email = String(b.email || "").trim().toLowerCase();
    const displayName = String(b.display_name || "").trim();
    const password = String(b.password || "");
    if (!/^\S+@\S+\.\S+$/.test(email)) return json(req, { error: "Email invalide." }, 400);
    if (!displayName || displayName.length > 100) return json(req, { error: "Nom invalide." }, 400);
    const passwordError = validateStrongPassword(password);
    if (passwordError) return json(req, { error: passwordError }, 400);
    const { data: newUser, error } = await ctx.admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: displayName } });
    if (error || !newUser?.user) return json(req, { error: error?.message || "Création impossible." }, 400);
    const { error: profileError } = await ctx.admin.from("profiles").update({ role: "ADMIN", display_name: displayName, email, must_change_password: true, is_active: true }).eq("id", newUser.user.id);
    if (profileError) { await ctx.admin.auth.admin.deleteUser(newUser.user.id); return json(req, { error: profileError.message }, 400); }
    await audit(ctx.admin, ctx.caller.id, "CREATE_ADMIN", newUser.user.id, true);
    return json(req, { ok: true, user_id: newUser.user.id });
  } catch (e) {
    if (e instanceof Response) return e;
    if (ctx) await audit(ctx.admin, ctx.caller.id, "CREATE_ADMIN", null, false, { error: String(e) });
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
