import { requireAdmin, json, options, audit } from "../_shared/security.ts";
Deno.serve(async req => {
  if (req.method === "OPTIONS") return options(req);
  if (req.method !== "POST") return json(req,{error:"Method not allowed"},405);
  let ctx;
  try {
    ctx=await requireAdmin(req); const b=await req.json(); const userId=String(b.user_id||"");
    if(!userId) return json(req,{error:"user_id required"},400);
    if(userId===ctx.caller.id && b.is_active===false) return json(req,{error:"Vous ne pouvez pas désactiver votre propre compte."},400);
    if(typeof b.display_name!="undefined" && (typeof b.display_name!=="string" || !b.display_name.trim() || b.display_name.length>100)) return json(req,{error:"Nom invalide."},400);
    if(typeof b.email!="undefined" && !/^\S+@\S+\.\S+$/.test(String(b.email).trim())) return json(req,{error:"Email invalide."},400);
    if(typeof b.is_active!="undefined" && typeof b.is_active!=="boolean") return json(req,{error:"Statut invalide."},400);
    const {data:target}=await ctx.admin.from("profiles").select("id,role,is_active").eq("id",userId).single();
    if(!target || target.role!=="ADMIN") return json(req,{error:"Administrateur introuvable."},404);
    if(b.is_active===false && target.is_active!==false){ const {count}=await ctx.admin.from("profiles").select("id",{count:"exact",head:true}).eq("role","ADMIN").eq("is_active",true); if((count||0)<=1) return json(req,{error:"Impossible de désactiver le dernier administrateur actif."},400); }
    const patch:any={}; if(typeof b.display_name!=="undefined") patch.display_name=String(b.display_name).trim(); if(typeof b.email!=="undefined") patch.email=String(b.email).trim().toLowerCase(); if(typeof b.is_active!=="undefined") patch.is_active=b.is_active;
    const {error}=await ctx.admin.from("profiles").update(patch).eq("id",userId); if(error)return json(req,{error:error.message},400);
    if(patch.email) { const {error:e}=await ctx.admin.auth.admin.updateUserById(userId,{email:patch.email,email_confirm:true}); if(e)return json(req,{error:e.message},400); }
    await audit(ctx.admin,ctx.caller.id,"UPDATE_ADMIN",userId,true,{fields:Object.keys(patch)}); return json(req,{ok:true});
  }catch(e){if(e instanceof Response)return e;if(ctx)await audit(ctx.admin,ctx.caller.id,"UPDATE_ADMIN",null,false,{error:String(e)});return json(req,{error:e instanceof Error?e.message:String(e)},500)}
});
