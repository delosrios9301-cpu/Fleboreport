import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const allowedRoles=["admin","clinician","technician","reception","viewer","role_custom"];
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Método no permitido"},405);
 try{
  const body=await req.json(),action=String(body.action||""),username=String(body.username||"").trim().toLowerCase();
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminHeaders={"apikey":service,"Authorization":"Bearer "+service,"Content-Type":"application/json"};
  const validUsername=(v:string)=>/^[a-z0-9._-]{3,30}$/.test(v);
  if(action==="registration-status"){const countRes=await fetch(url+"/rest/v1/profiles?select=user_id&limit=1",{headers:adminHeaders});if(!countRes.ok)throw new Error("No se pudo consultar el estado del registro.");const rows=await countRes.json();return json({available:rows.length===0});}
  if(action==="signup"){
   const existing=await fetch(url+"/rest/v1/profiles?select=user_id&limit=1",{headers:adminHeaders});if(!existing.ok)throw new Error("No se pudo validar el registro inicial.");if((await existing.json()).length)return json({error:"El registro público está cerrado. Solicita al administrador que cree tu usuario."},403);
   if(!validUsername(username))return json({error:"El usuario debe tener entre 3 y 30 caracteres (letras, números, punto, guion o guion bajo)."},400);
   const email=String(body.email||"").trim().toLowerCase(),password=String(body.password||""),displayName=String(body.display_name||"").trim();
   if(!email||password.length<8||!displayName)return json({error:"Completa nombre, correo y contraseña de al menos 8 caracteres."},400);
   const check=await fetch(url+"/rest/v1/profiles?select=user_id&username=eq."+encodeURIComponent(username),{headers:adminHeaders});
   if(!check.ok)throw new Error("No se pudo validar el nombre de usuario.");
   if((await check.json()).length)return json({error:"Ese nombre de usuario ya está ocupado."},409);
   const created=await fetch(url+"/auth/v1/signup",{method:"POST",headers:{"apikey":anon,"Content-Type":"application/json"},body:JSON.stringify({email,password,data:{username,display_name:displayName,name:displayName}})});
   const auth=await created.json();if(!created.ok)return json({error:auth.msg||auth.message||auth.error_description||"No se pudo crear la cuenta."},created.status);
   if(auth.user?.id){const saved=await fetch(url+"/rest/v1/profiles?on_conflict=user_id",{method:"POST",headers:{...adminHeaders,"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:auth.user.id,username,display_name:displayName,active:true})});if(!saved.ok)throw new Error("La cuenta se creó, pero no se pudo guardar el nombre de usuario.");}
   return json({user:auth.user,session:auth.session||null,needs_email_confirmation:!auth.session});
  }
  if(action==="login"){
   const password=String(body.password||"");if(!password)return json({error:"Escribe tu contraseña."},400);
   let userId="",email="";
   if(username.includes("@")){email=username;const signed=await fetch(url+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"apikey":anon,"Content-Type":"application/json"},body:JSON.stringify({email,password})});const session=await signed.json();if(!signed.ok)return json({error:"Usuario o contraseña incorrectos."},401);userId=session.user?.id;return json({user:session.user,session,username_setup_required:false});}
   if(!validUsername(username))return json({error:"Escribe un usuario válido o el correo de tu cuenta."},400);
   const found=await fetch(url+"/rest/v1/profiles?select=user_id&username=eq."+encodeURIComponent(username)+"&limit=1",{headers:adminHeaders});
   if(!found.ok)throw new Error("No se pudo consultar el usuario.");
   const rows=await found.json();if(!rows.length)return json({error:"Usuario o contraseña incorrectos."},401);
   const userRes=await fetch(url+"/auth/v1/admin/users/"+rows[0].user_id,{headers:adminHeaders});if(!userRes.ok)return json({error:"Usuario o contraseña incorrectos."},401);
   const authUser=await userRes.json();email=authUser.email||authUser.user?.email;if(!email)return json({error:"La cuenta no tiene un correo de acceso válido."},401);
   const signed=await fetch(url+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"apikey":anon,"Content-Type":"application/json"},body:JSON.stringify({email,password})});
   const session=await signed.json();if(!signed.ok)return json({error:"Usuario o contraseña incorrectos."},401);
   return json({user:session.user,session});
  }
  if(["get-membership","admin-list-users","admin-list-roles","admin-create-role","admin-set-user-roles","admin-create-user","admin-update-user"].includes(action)){
   const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
   if(!token)return json({error:"Se requiere una sesión autenticada."},401);
   const who=await fetch(url+"/auth/v1/user",{headers:{"apikey":anon,"Authorization":"Bearer "+token}});
   if(!who.ok)return json({error:"La sesión no es válida o expiró."},401);
   const actor=await who.json();
   if(action==="get-membership"){
    const mr=await fetch(url+"/rest/v1/workspace_members?select=workspace_id,role,active&user_id=eq."+encodeURIComponent(actor.id),{headers:adminHeaders});
    const rows=await mr.json();if(!mr.ok)throw new Error("No se pudo verificar la membresía.");
    if(!rows.length)return json({membership:null});
    const membership=rows.find((row:any)=>row.active===true)||rows[0];
    const wr=await fetch(url+"/rest/v1/workspaces?select=name,owner_user_id&id=eq."+encodeURIComponent(membership.workspace_id)+"&limit=1",{headers:adminHeaders});
    if(!wr.ok)throw new Error("No se pudo recuperar el espacio de trabajo vinculado.");
    const workspaces=await wr.json();
    if(!workspaces.length)throw new Error("La vinculación existe, pero el espacio de trabajo no está disponible.");
    const [assignedRes,roleCatalogRes]=await Promise.all([
     fetch(url+"/rest/v1/workspace_member_roles?select=role_key,is_primary&workspace_id=eq."+encodeURIComponent(membership.workspace_id)+"&user_id=eq."+encodeURIComponent(actor.id),{headers:adminHeaders}),
     fetch(url+"/rest/v1/workspace_roles?select=role_key,display_name,area_key,description&workspace_id=eq."+encodeURIComponent(membership.workspace_id)+"&active=eq.true",{headers:adminHeaders})
    ]);
    const assigned=assignedRes.ok?await assignedRes.json():[];
    const roleCatalog=roleCatalogRes.ok?await roleCatalogRes.json():[];
    const catalogMap=new Map(roleCatalog.map((r:any)=>[r.role_key,r]));
    const assignedRoles=assigned.map((r:any)=>({role_key:r.role_key,is_primary:!!r.is_primary,...(catalogMap.get(r.role_key)||{})}));
    return json({membership:{...membership,roles:assigned.map((r:any)=>r.role_key),assigned_roles:assignedRoles,is_primary_admin:workspaces[0].owner_user_id===actor.id,workspaces:{name:workspaces[0].name}}});
   }
   const workspaceId=String(body.workspace_id||"");
   if(!workspaceId)return json({error:"Falta el espacio de trabajo."},400);
   const membership=await fetch(url+"/rest/v1/workspace_members?select=role,active&workspace_id=eq."+encodeURIComponent(workspaceId)+"&user_id=eq."+encodeURIComponent(actor.id)+"&limit=1",{headers:adminHeaders});
   const memberships=await membership.json();
   const assignedAdmin=await fetch(url+"/rest/v1/workspace_member_roles?select=role_key&workspace_id=eq."+encodeURIComponent(workspaceId)+"&user_id=eq."+encodeURIComponent(actor.id)+"&role_key=eq.admin&limit=1",{headers:adminHeaders});
   const adminAssignments=assignedAdmin.ok?await assignedAdmin.json():[];
   if(!membership.ok||!memberships[0]?.active||(memberships[0].role!=="admin"&&!adminAssignments.length))return json({error:"Solo un administrador activo puede gestionar usuarios."},403);
   if(action==="admin-list-users"){
    const res=await fetch(url+"/rest/v1/workspace_members?select=user_id,role,active,created_at&workspace_id=eq."+encodeURIComponent(workspaceId)+"&order=created_at.asc",{headers:adminHeaders});
    const rows=await res.json();if(!res.ok)throw new Error("No se pudo cargar la lista de usuarios.");
    const [ownerRes,assignmentRes,catalogRes]=await Promise.all([
     fetch(url+"/rest/v1/workspaces?select=owner_user_id&id=eq."+encodeURIComponent(workspaceId)+"&limit=1",{headers:adminHeaders}),
     fetch(url+"/rest/v1/workspace_member_roles?select=user_id,role_key,is_primary&workspace_id=eq."+encodeURIComponent(workspaceId),{headers:adminHeaders}),
     fetch(url+"/rest/v1/workspace_roles?select=role_key,display_name,area_key,description,is_system,active&workspace_id=eq."+encodeURIComponent(workspaceId)+"&order=display_name.asc",{headers:adminHeaders})
    ]);
    const ownerRows=ownerRes.ok?await ownerRes.json():[],assignments=assignmentRes.ok?await assignmentRes.json():[],catalog=catalogRes.ok?await catalogRes.json():[];
    if(!assignmentRes.ok||!catalogRes.ok)throw new Error("No se pudieron consultar los cargos asignados.");
    const ownerId=ownerRows[0]?.owner_user_id||"",catalogMap=new Map(catalog.map((r:any)=>[r.role_key,r]));
    const users=await Promise.all(rows.map(async(m:any)=>{
     const [pr,ur]=await Promise.all([fetch(url+"/rest/v1/profiles?select=display_name,username&user_id=eq."+encodeURIComponent(m.user_id)+"&limit=1",{headers:adminHeaders}),fetch(url+"/auth/v1/admin/users/"+m.user_id,{headers:adminHeaders})]);
     const profiles=pr.ok?await pr.json():[],u=ur.ok?await ur.json():{},metadata=u.user_metadata||u.user?.user_metadata||{};
     const assigned=assignments.filter((a:any)=>a.user_id===m.user_id);
     return{user_id:m.user_id,role:m.role,roles:assigned.map((a:any)=>a.role_key),assigned_roles:assigned.map((a:any)=>({role_key:a.role_key,is_primary:!!a.is_primary,...(catalogMap.get(a.role_key)||{})})),active:m.active,is_primary_admin:m.user_id===ownerId,display_name:profiles[0]?.display_name||metadata.display_name||"",username:profiles[0]?.username||metadata.username||"",email:u.email||u.user?.email||""};
    }));
    return json({users,roles:catalog});
   }
   if(action==="admin-list-roles"){
    const res=await fetch(url+"/rest/v1/workspace_roles?select=role_key,display_name,description,area_key,is_system,active&workspace_id=eq."+encodeURIComponent(workspaceId)+"&active=eq.true&order=display_name.asc",{headers:adminHeaders});
    const roles=await res.json();if(!res.ok)throw new Error("No se pudo cargar el catálogo de cargos.");return json({roles});
   }
   if(action==="admin-create-role"){
    const displayName=String(body.display_name||"").trim(),description=String(body.description||"").trim(),areaKey=String(body.area_key||"general").trim().toLowerCase(),roleKey=String(body.role_key||"").trim().toLowerCase();
    if(displayName.length<3||displayName.length>100||! /^[a-z][a-z0-9_]{1,63}$/.test(roleKey)||! /^[a-z][a-z0-9_]{1,39}$/.test(areaKey))return json({error:"Verifica el nombre y el identificador del cargo."},400);
    const reserved=["admin","clinician","reception","technician","viewer","role_custom"];if(reserved.includes(roleKey))return json({error:"Ese identificador está reservado para un perfil del sistema."},409);
    const res=await fetch(url+"/rest/v1/workspace_roles",{method:"POST",headers:{...adminHeaders,"Prefer":"return=representation"},body:JSON.stringify({workspace_id:workspaceId,role_key:roleKey,display_name:displayName,description,area_key:areaKey,is_system:false,active:true,created_by:actor.id})});
    const rows=await res.json();if(!res.ok)return json({error:rows.message||"No se pudo crear el cargo."},res.status);return json({ok:true,role:rows[0]});
   }
   if(action==="admin-set-user-roles"){
    const target=String(body.target_user_id||"");if(!target||target===actor.id)return json({error:"No puedes modificar los cargos de tu propia cuenta desde esta pantalla."},400);
    const keys=Array.isArray(body.additional_role_keys)?body.additional_role_keys.map((x:any)=>String(x)):null;if(!keys)return json({error:"La lista de cargos adicionales no es válida."},400);
    const ownerCheck=await fetch(url+"/rest/v1/workspaces?select=owner_user_id&id=eq."+encodeURIComponent(workspaceId)+"&limit=1",{headers:adminHeaders});const ownerRows=ownerCheck.ok?await ownerCheck.json():[];if(ownerRows[0]?.owner_user_id===target)return json({error:"La cuenta del administrador principal está protegida."},403);
    const result=await fetch(url+"/rest/v1/rpc/admin_set_member_roles",{method:"POST",headers:adminHeaders,body:JSON.stringify({p_workspace_id:workspaceId,p_actor_id:actor.id,p_user_id:target,p_additional_role_keys:keys})});
    const data=await result.json();if(!result.ok)throw new Error(data.message||data.error||"No se pudieron guardar los cargos adicionales.");return json(data);
   }
   if(action==="admin-create-user"){
    const name=String(body.display_name||"").trim(),newUsername=String(body.username||"").trim().toLowerCase(),newEmail=String(body.email||"").trim().toLowerCase(),password=String(body.password||""),role=String(body.role||"technician");
    if(!name||!validUsername(newUsername)||!newEmail||password.length<8||!allowedRoles.includes(role))return json({error:"Verifica nombre, usuario, correo, contraseña (mínimo 8 caracteres) y rol."},400);
    const dup=await fetch(url+"/rest/v1/profiles?select=user_id&username=eq."+encodeURIComponent(newUsername),{headers:adminHeaders});if(!dup.ok)throw new Error("No se pudo validar el usuario.");if((await dup.json()).length)return json({error:"Ese nombre de usuario ya existe."},409);
    const created=await fetch(url+"/auth/v1/admin/users",{method:"POST",headers:adminHeaders,body:JSON.stringify({email:newEmail,password,email_confirm:true,user_metadata:{username:newUsername,display_name:name,name}})});
    const auth=await created.json();if(!created.ok)return json({error:auth.msg||auth.message||"No se pudo crear la cuenta."},created.status);
    const userId=auth.user?.id||auth.id;if(!userId)throw new Error("Supabase no devolvió el identificador de la cuenta.");
    const profile=await fetch(url+"/rest/v1/profiles?on_conflict=user_id",{method:"POST",headers:{...adminHeaders,"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:userId,username:newUsername,display_name:name,active:true})});
    if(!profile.ok)throw new Error("La cuenta se creó, pero no se pudo guardar su perfil.");
    const member=await fetch(url+"/rest/v1/workspace_members",{method:"POST",headers:{...adminHeaders,"Prefer":"return=minimal"},body:JSON.stringify({workspace_id:workspaceId,user_id:userId,role,active:true})});
    if(!member.ok){await fetch(url+"/auth/v1/admin/users/"+userId,{method:"DELETE",headers:adminHeaders});throw new Error("No se pudo asignar el usuario al espacio de trabajo.");}
    return json({ok:true,user_id:userId});
   }
   if(action==="admin-update-user"){
    const target=String(body.target_user_id||"");if(!target||target===actor.id)return json({error:"No puedes modificar tu propia cuenta desde esta pantalla."},400);const ownerCheck=await fetch(url+"/rest/v1/workspaces?select=owner_user_id&id=eq."+encodeURIComponent(workspaceId)+"&limit=1",{headers:adminHeaders});const ownerRows=ownerCheck.ok?await ownerCheck.json():[];if(ownerRows[0]?.owner_user_id===target)return json({error:"La cuenta del administrador principal está protegida y no puede modificarse desde esta pantalla."},403);
    const changes:any={};if(body.role!==undefined){if(!allowedRoles.includes(String(body.role)))return json({error:"Rol no válido."},400);changes.role=String(body.role)}
    if(body.active!==undefined)changes.active=!!body.active;if(!Object.keys(changes).length)return json({error:"No hay cambios que guardar."},400);
    const updated=await fetch(url+"/rest/v1/workspace_members?workspace_id=eq."+encodeURIComponent(workspaceId)+"&user_id=eq."+encodeURIComponent(target),{method:"PATCH",headers:{...adminHeaders,"Prefer":"return=minimal"},body:JSON.stringify(changes)});
    if(!updated.ok)throw new Error("No se pudieron actualizar los permisos.");return json({ok:true});
   }
  }
  return json({error:"Acción no válida."},400);
 }catch(e){return json({error:e instanceof Error?e.message:"Error interno."},500)}
});