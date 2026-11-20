import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../domicilios.js',import.meta.url),'utf8');
const sync=source.slice(source.indexOf('async function loadCloudVisits('),source.indexOf('async function persistVisit('));
const invitation={id:'12345678-1234-4123-8123-123456789abc',assignedUserId:'self',assignmentId:'a',assignmentStatus:'invited',scheduledDate:'2026-11-20',scheduledTime:'09:00'};

async function refresh({role='admin',visits=[],query='',changes=[],details=[],previews=[]}){
 const chain={select(){return this},eq(){return this},gt(){return this},order(){return this}};
 const ctx={visits,cloud:{role,user:{id:'self'},client:{from:()=>chain}},homeVisitSyncCursor:17,
  homeVisitCacheActive:false,ensureHomeVisitCursorFresh:async()=>{},saveHomeVisitCache:()=>{},
  fetchAllPages:async()=>changes,fetchInvitationPreviewRows:async()=>previews,dbVisit:v=>v,
  fetchHomeVisitRows:async ids=>{ctx.requestedIds=Array.from(ids);return details},
  asUuid:v=>v,URL,URLSearchParams,location:new URL('https://example.test/'+query),
  history:{replaceState(){}},selected:'',detailOpen:false,dismissedInvitationId:invitation.id,$:()=>null};
 await runInNewContext(sync+';loadCloudVisits()',ctx);
 return ctx;
}
test('Una autoasignación pendiente sigue en la agenda después de sincronizar otro cambio',async()=>{
 for(const changes of [[],[{record_id:'other',seq:18}]]){
  const ctx=await refresh({visits:[invitation],changes});
  assert.equal(ctx.visits[0]?.id,invitation.id);
 }
});
test('El aviso recupera el domicilio ausente y abre la invitación aunque el cursor esté al día',async()=>{
 const ctx=await refresh({query:'?view=domicilios&visit='+invitation.id,details:[invitation]});
 assert.deepEqual(ctx.requestedIds,[invitation.id]);
 assert.equal(ctx.selected,invitation.id);
 assert.equal(ctx.detailOpen,true);
 assert.equal(ctx.dismissedInvitationId,'');
 assert.equal(ctx.homeVisitSyncCursor,17);
});
test('Al retirar la invitación de un técnico desaparece su vista previa aunque no haya cambios de agenda',async()=>{
 const ctx=await refresh({role:'technician',visits:[invitation]});
 assert.equal(ctx.visits.length,0);
 assert.equal(ctx.homeVisitSyncCursor,17);
});
