import { requireAdmin, json, options, audit } from "../_shared/security.ts";
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return options(req); if(req.method!=="POST")return json(req,{error:"Method not allowed"},405); let ctx;
 try{ctx=await requireAdmin(req);const {user_id}=await req.json();const userId=String(user_id||"");if(!userId)return json(req,{error:"user_id required"},400);if(userId===ctx.caller.id)return json(req,{error:"Vous ne pouvez pas supprimer votre propre compte."},400);
 const {data:target}=await ctx.admin.from("profiles").select("id,role,is_active").eq("id",userId).single();if(!target||target.role!=="ADMIN")return json(req,{error:"Administrateur introuvable."},404);
 const {count}=await ctx.admin.from("profiles").select("id",{count:"exact",head:true}).eq("role","ADMIN").eq("is_active",true);if((count||0)<=1 && target.is_active!==false)return json(req,{error:"Impossible de supprimer le dernier administrateur actif."},400);
 const {error}=await ctx.admin.auth.admin.deleteUser(userId);if(error)return json(req,{error:error.message},400);await audit(ctx.admin,ctx.caller.id,"DELETE_ADMIN",userId,true);return json(req,{ok:true});
 }catch(e){if(e instanceof Response)return e;if(ctx)await audit(ctx.admin,ctx.caller.id,"DELETE_ADMIN",null,false,{error:String(e)});return json(req,{error:e instanceof Error?e.message:String(e)},500)}
});
