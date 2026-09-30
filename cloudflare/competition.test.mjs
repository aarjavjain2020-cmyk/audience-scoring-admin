import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from './worker.js';
import {qualificationPlan} from './competition.js';

const db=new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
// Verify migration preserves pre-existing performance data.
db.exec("INSERT INTO songs(number,performer,status,total,vote_count) VALUES(1,'Existing performer','closed',18,1)");
db.exec(readFileSync(new URL('./migrate_competition.sql',import.meta.url),'utf8'));
assert.equal(db.prepare('SELECT day FROM songs WHERE id=1').get().day,1);
db.exec('DELETE FROM songs');
class Statement {
 constructor(sql,args=[]){this.sql=sql;this.args=args;}
 bind(...args){return new Statement(this.sql,args)}
 async first(){return db.prepare(this.sql).get(...this.args)||null}
 async all(){return {results:db.prepare(this.sql).all(...this.args)}}
 async run(){const r=db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}}}
}
const env={DB:{prepare:s=>new Statement(s),async batch(statements){db.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}}},ADMIN_PASSWORD:'local-test-only',SESSION_SECRET:'session-test-only',VOTE_SECRET:'vote-test-only',AUDIENCE_ORIGIN:'https://audience.test'};
let cookie='';
async function api(path,body,expected=200){const r=await worker.fetch(new Request('https://admin.test/api/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'https://admin.test',Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env);const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return data;}
await api('admin/start',{performer:'Unauthorised',day:1},401);
await api('admin/login',{password:'wrong'},401);
await api('admin/login',{password:env.ADMIN_PASSWORD});
const device=crypto.randomUUID();let state,firstId;
for(let day=1;day<=4;day++){
 for(let i=0;i<4;i++){
  state=await api('admin/start',{performer:i===0?'Same Name':`Day ${day} singer ${i}`,day});const song=state.open;
  if(!firstId)firstId=song.id;
  assert.equal(song.day,day);assert.equal(song.contestantId,song.id);
  await api('admin/advance',{fromDay:day},day===4?409:409);
  await api('admin/start',{performer:'Concurrent performer',day},409);
  await api('public/vote',{songId:song.id,score:21,deviceId:device},400);
  const score=day<=2?18:15;
  await api('public/vote',{songId:song.id,score,deviceId:device});
  await api('public/vote',{songId:song.id,score,deviceId:device},409);
  state=await api('admin/close',{songId:song.id});
  await api('public/vote',{songId:song.id,score,deviceId:crypto.randomUUID()},400);
 }
 if(day<4){state=await api('admin/advance',{fromDay:day});await api('admin/advance',{fromDay:day},409);}
}
assert.equal(state.results.filter(r=>r.performer==='Same Name').length,4);
assert.equal(new Set(state.results.filter(r=>r.performer==='Same Name').map(r=>r.contestantId)).size,4);
const plan=qualificationPlan(state.results,10);assert.equal(plan.above.length,8);assert.equal(plan.slots,2);assert.equal(plan.tied.length,8);assert.equal(plan.needsBallot,true);
const plan15=qualificationPlan(state.results,15);assert.equal(plan15.slots,7);
assert.equal(qualificationPlan([{id:1,number:1,total:10,votes:3},...Array.from({length:9},(_,i)=>({id:i+2,number:i+2,total:20,votes:6}))],10).needsBallot,false);
await api('admin/qualify',{places:10,ballotIds:[]},400);
await api('admin/qualify',{places:10,ballotIds:[firstId,firstId]},400);
await api('admin/advance',{fromDay:4},409);
state=await api('admin/qualify',{places:10,ballotIds:plan.tied.slice(0,2).map(r=>r.id)});
assert.equal(state.finalists.length,10);assert.equal(state.finalists.filter(f=>f.ballot).length,2);
await api('admin/qualify',{places:10,ballotIds:[]},409);
await api('admin/start',{day:4,performer:'Late audition'},409);
state=await api('admin/advance',{fromDay:4});assert.equal(state.competition.day,5);
await api('admin/start',{day:5,contestantId:plan.tied.at(-1).id},409);
state=await api('admin/start',{day:5,contestantId:firstId});assert.deepEqual(state.live,{total:0,votes:0});assert.equal(state.open.contestantId,firstId);assert.notEqual(state.open.id,firstId);
await api('public/vote',{songId:state.open.id,score:12,deviceId:device});
state=await api('admin/close',{songId:state.open.id});assert.equal(state.results.find(r=>r.day===5).total,12);assert.equal(state.results.find(r=>r.id===firstId).total,18);
await api('admin/start',{day:5,contestantId:firstId},409);
assert.equal((await api('public/state')).results.length,17);
console.log('PASS: migration preservation, authentication, four days, duplicate names, exact-average ranking, 10/15 cutoff ties, ballot validation, selection lock, fresh final, duplicate vote/performance rejection.');
