import { requireAdmin, json, options, audit, validateStrongPassword } from "../_shared/security.ts";
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return options(req);if(req.method!=="POST")return json(req,{error:"Method not allowed"},405);let ctx;
 try{ctx=await requireAdmin(req);const {user_id,new_password}=await req.json();const userId=String(user_id||"");const password=String(new_password||"");if(!userId)return json(req,{error:"user_id required"},400);const pe=validateStrongPassword(password);if(pe)return json(req,{error:pe},400);
 const {data:target}=await ctx.admin.from("profiles").select("id,role,is_active").eq("id",userId).single();if(!target)return json(req,{error:"Utilisateur introuvable."},404);
 const {error}=await ctx.admin.auth.admin.updateUserById(userId,{password});if(error)return json(req,{error:error.message},400);await ctx.admin.from("profiles").update({must_change_password:true}).eq("id",userId);await audit(ctx.admin,ctx.caller.id,"RESET_PASSWORD",userId,true);return json(req,{ok:true});
 }catch(e){if(e instanceof Response)return e;if(ctx)await audit(ctx.admin,ctx.caller.id,"RESET_PASSWORD",null,false,{error:String(e)});return json(req,{error:e instanceof Error?e.message:String(e)},500)}
});
