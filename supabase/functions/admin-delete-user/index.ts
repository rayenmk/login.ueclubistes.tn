import { requireAdmin, json, options, audit } from "../_shared/security.ts";
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return options(req);if(req.method!=="POST")return json(req,{error:"Method not allowed"},405);let ctx;
 try{ctx=await requireAdmin(req);const b=await req.json();const subscriberId=String(b.subscriber_id||"");if(!subscriberId)return json(req,{error:"subscriber_id required"},400);
 const {data:sub,error:subError}=await ctx.admin.from("subscribers").select("id,user_id").eq("id",subscriberId).single();if(subError||!sub)return json(req,{error:"Subscriber not found"},404);
 const {error}=await ctx.admin.auth.admin.deleteUser(sub.user_id);if(error)return json(req,{error:error.message},400);await audit(ctx.admin,ctx.caller.id,"DELETE_SUBSCRIBER",sub.user_id,true);return json(req,{ok:true});
 }catch(e){if(e instanceof Response)return e;if(ctx)await audit(ctx.admin,ctx.caller.id,"DELETE_SUBSCRIBER",null,false,{error:String(e)});return json(req,{error:e instanceof Error?e.message:String(e)},500)}
});
