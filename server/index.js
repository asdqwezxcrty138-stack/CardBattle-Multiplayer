import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomInt, randomUUID } from 'node:crypto';

const app=express(), httpServer=createServer(app), io=new Server(httpServer);
const PORT=Number(process.env.PORT||3000), rooms=new Map();
app.use(express.static('public'));
app.get('/health',(_q,r)=>r.json({ok:true,service:'CardBattle Multiplayer'}));
const CARDS=[
 ['attribute_shield','屬性盾','防禦','attribute_shield',0],['dodge','閃避','防禦','dodge',0],['defense','防禦','防禦','defense',0],['heal','治療','治療','heal',2],['armor_break','破甲','控制','armor_break',1],['bind','禁錮','控制','bind',1],['purify','淨化','輔助','purify',1],['basic_sword','基礎劍招','攻擊','sword',3],['fire_enchant','火焰附魔','附魔','enchant_fire',2],['water_enchant','流水附魔','附魔','enchant_water',1],['lightning_enchant','雷電附魔','附魔','enchant_lightning',1],['sharp','鋒利','輔助','sharp',2]
].map(([key,name,type,effect,value])=>({key,name,type,effect,value,cost:1}));
const byKey=Object.fromEntries(CARDS.map(c=>[c.key,c]));
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const makeCode=()=>{const s='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let x;do{x=Array.from({length:6},()=>s[randomInt(s.length)]).join('')}while(rooms.has(x));return x;};
const freshPlayer=(token,name,counts)=>{const deck=[];for(const [key,n] of Object.entries(counts))for(let i=0;i<n;i++)deck.push({...byKey[key],id:randomUUID(),selectedElement:null});return {token,name,hp:100,maxHp:100,deck:shuffle(deck),hand:[],discard:[],slots:Array(5).fill(null),ready:false,submitted:false,nextReady:false,armorBreak:false,cannotDodge:false,enchant:{fire:0,water:0,lightning:0,sharp:0}};};
function refill(p,n){let got=0;while(got<n){if(!p.deck.length){if(!p.discard.length)break;p.deck=shuffle(p.discard.splice(0));}p.hand.push(p.deck.pop());got++;}return got;}
function pubPlayer(p,showSlots=false){return {name:p.name,ready:p.ready,hp:p.hp,maxHp:p.maxHp,hand:p.hand.map(c=>({...c})),handCount:p.hand.length,deckCount:p.deck.length,discardCount:p.discard.length,slots:showSlots?p.slots.map(c=>c?({...c}):null):null,submitted:p.submitted};}
function snapshot(r,showSlots=false,myToken=null){const players=[...r.players.values()];return {roomId:r.id,phase:r.phase,round:r.round,isHost:r.hostToken===myToken,myToken,myIndex:players.findIndex(p=>p.token===myToken),players:players.map((p,i)=>pubPlayer(p,showSlots||i===players.findIndex(x=>x.token===myToken))),logs:r.logs.slice(-40),winner:r.winner||null};}
function broadcast(r,showSlots=false){for(const [token,sid] of r.sockets){const s=io.sockets.sockets.get(sid);if(s)s.emit('game:state',snapshot(r,showSlots,token));}}
function err(s,msg){s.emit('app:error',{message:msg});}
function getRoom(s){const r=rooms.get(s.data.roomId);return r&&r.players.has(s.data.token)&&r.sockets.get(s.data.token)===s.id?r:null;}
function validateDeck(counts){if(!counts||typeof counts!=='object')return false;const keys=Object.keys(counts);return keys.every(k=>byKey[k]&&Number.isInteger(counts[k])&&counts[k]>=0&&counts[k]<=60)&&CARDS.reduce((n,c)=>n+(counts[c.key]||0),0)===60;}
function log(r,msg){r.logs.push(msg);}
function applyDamage(target,amount,type,def,dodge,flags,attacker,rline){let multiplier=1,reflect=0;if(flags.armorBroken&&def==='defense')def=null;if(type==='physical'&&def==='defense')multiplier*=.2;if(dodge)multiplier*=.2;if(flags.shield&&((flags.shield==='thunder'&&type==='lightning')||flags.shield===type)){multiplier=0;reflect=Math.floor(amount*.1);}const dealt=Math.max(0,Math.ceil(amount*multiplier));target.hp=Math.max(0,target.hp-dealt);if(reflect){attacker.hp=Math.max(0,attacker.hp-reflect);rline.push(`${target.name} 反射 ${reflect} 點傷害`);}return dealt;}
function resolveRound(r){const ps=[...r.players.values()],lines=[];for(let i=0;i<5;i++){const [a,b]=ps,ca=a.slots[i],cb=b.slots[i];if(!ca&&!cb)continue;const line=[`位置 ${i+1}`],oldA={armorBroken:a.armorBreak,cannotDodge:a.cannotDodge},oldB={armorBroken:b.armorBreak,cannotDodge:b.cannotDodge};if(ca){a.armorBreak=false;a.cannotDodge=false;}if(cb){b.armorBreak=false;b.cannotDodge=false;}
 const da=ca?.effect==='defense'?'defense':null,db=cb?.effect==='defense'?'defense':null,sa=ca?.effect==='attribute_shield'?ca.selectedElement:null,sb=cb?.effect==='attribute_shield'?cb.selectedElement:null;
 const purA=ca?.effect==='purify',purB=cb?.effect==='purify';
 const atkA={physical:0,fire:0,water:0,lightning:0},atkB={physical:0,fire:0,water:0,lightning:0};let healA=0,healB=0;
 const process=(c,p,opp,atk,ownPur,oppPur)=>{if(!c)return;if(c.effect==='sword'){atk.physical+=c.value+p.enchant.sharp;p.enchant.sharp=0;const waterStacks=p.enchant.water;for(const t of ['fire','water','lightning']){atk[t]+=p.enchant[t];p.enchant[t]=0;}if(waterStacks) {if(p===a)healA+=waterStacks;else healB+=waterStacks;}}else if(c.effect==='enchant_fire')p.enchant.fire+=2;else if(c.effect==='enchant_water')p.enchant.water+=1;else if(c.effect==='enchant_lightning')p.enchant.lightning+=1;else if(c.effect==='sharp')p.enchant.sharp+=2;else if(c.effect==='heal'){if(p===a)healA+=2;else healB+=2;}else if(c.effect==='armor_break'){if(!oppPur)opp.armorBreak=true;else line.push(`${p.name} 的淨化抵抗本次破甲`);}else if(c.effect==='bind'){if(!oppPur)opp.cannotDodge=true;else line.push(`${p.name} 的淨化抵抗本次禁錮`);}};
 process(ca,a,b,atkA,purA,purB);process(cb,b,a,atkB,purB,purA);
 const dodgeA=ca?.effect==='dodge'&&!oldA.cannotDodge&&Math.random()<.5,dodgeB=cb?.effect==='dodge'&&!oldB.cannotDodge&&Math.random()<.5;
 let toB=0,toA=0;for(const [t,n] of Object.entries(atkA))if(n)toB+=applyDamage(b,n,t,db,dodgeB,{armorBroken:oldB.armorBroken,shield:sb},a,line);for(const [t,n] of Object.entries(atkB))if(n)toA+=applyDamage(a,n,t,da,dodgeA,{armorBroken:oldA.armorBroken,shield:sa},b,line);
 if(toB)line.push(`${a.name} 對 ${b.name} 造成 ${toB} 傷害`);if(toA)line.push(`${b.name} 對 ${a.name} 造成 ${toA} 傷害`);
 if(healA){const h=ca?.effect==='heal'&&toA>0?1:healA;a.hp=Math.min(a.maxHp,a.hp+h);line.push(`${a.name} 治療 ${h}`);}if(healB){const h=cb?.effect==='heal'&&toB>0?1:healB;b.hp=Math.min(b.maxHp,b.hp+h);line.push(`${b.name} 治療 ${h}`);}
 if(ca)line.push(`${a.name} 使用「${ca.name}」`);if(cb)line.push(`${b.name} 使用「${cb.name}」`);lines.push(line.join('；'));if(a.hp<=0||b.hp<=0)break;
 }
 for(const p of ps){p.discard.push(...p.hand,...p.slots.filter(Boolean));p.hand=[];p.slots=Array(5).fill(null);p.submitted=false;p.nextReady=false;}
 r.logs.push(...lines.map(x=>`第 ${r.round} 輪｜${x}`));if(ps.every(p=>p.hp<=0))r.winner='draw';else if(ps[0].hp<=0)r.winner=ps[1].token;else if(ps[1].hp<=0)r.winner=ps[0].token;
 r.phase=r.winner?'ended':'round-complete';}
io.on('connection',socket=>{
 socket.on('room:create',({name,counts,token})=>{if(!validateDeck(counts))return err(socket,'牌組必須剛好 60 張，且只能使用資料庫中的卡牌');const t=token||randomUUID(),id=makeCode(),p=freshPlayer(t,String(name||'玩家').slice(0,16),counts),r={id,hostToken:t,players:new Map([[t,p]]),sockets:new Map(),phase:'waiting',round:1,logs:[],winner:null};rooms.set(id,r);socket.data.roomId=id;socket.data.token=t;socket.join(id);r.sockets.set(t,socket.id);socket.emit('room:joined',{roomId:id,token:t});broadcast(r);});
 socket.on('room:join',({roomId,name,counts,token})=>{const r=rooms.get(String(roomId||'').toUpperCase());if(!r)return err(socket,'找不到房間');if(!validateDeck(counts))return err(socket,'牌組必須剛好 60 張');const t=token||randomUUID();if(!r.players.has(t)&&(r.phase!=='waiting'||r.players.size>=2))return err(socket,'房間已滿或遊戲已開始');if(!r.players.has(t))r.players.set(t,freshPlayer(t,String(name||'玩家').slice(0,16),counts));socket.data.roomId=r.id;socket.data.token=t;socket.join(r.id);r.sockets.set(t,socket.id);socket.emit('room:joined',{roomId:r.id,token:t});broadcast(r,r.phase!=='configuration');});
 socket.on('room:ready',({ready})=>{const r=getRoom(socket);if(!r||r.phase!=='waiting')return;const p=r.players.get(socket.data.token);p.ready=!!ready;broadcast(r);});
 socket.on('room:start',()=>{const r=getRoom(socket);if(!r||r.hostToken!==socket.data.token)return err(socket,'只有房主能開始');if(r.players.size!==2||[...r.players.values()].some(p=>!p.ready))return err(socket,'需要兩位玩家都準備完成');r.phase='configuration';for(const p of r.players.values())refill(p,10);log(r,'遊戲開始，雙方各抽取 10 張牌');broadcast(r);});
 socket.on('game:place',({slot,cardId,element})=>{const r=getRoom(socket),p=r?.players.get(socket.data.token);if(!p||r.phase!=='configuration'||p.submitted)return;if(!Number.isInteger(slot)||slot<0||slot>4)return err(socket,'行動位置錯誤');if(p.slots[slot])return err(socket,'此行動位置已有卡牌');const idx=p.hand.findIndex(c=>c.id===cardId);if(idx<0)return err(socket,'找不到這張手牌');const c=p.hand[idx];if(c.effect==='attribute_shield'&&!['fire','water','thunder'].includes(element))return err(socket,'屬性盾必須選擇屬性');c.selectedElement=element||null;p.slots[slot]=p.hand.splice(idx,1)[0];broadcast(r);});
 socket.on('game:remove',({slot})=>{const r=getRoom(socket),p=r?.players.get(socket.data.token);if(!p||r.phase!=='configuration'||p.submitted)return;if(!Number.isInteger(slot)||slot<0||slot>4||!p.slots[slot])return;const c=p.slots[slot];c.selectedElement=null;p.hand.push(c);p.slots[slot]=null;broadcast(r);});
 socket.on('game:clear',()=>{const r=getRoom(socket),p=r?.players.get(socket.data.token);if(!p||r.phase!=='configuration'||p.submitted)return;p.hand.push(...p.slots.filter(Boolean).map(c=>({...c,selectedElement:null})));p.slots=Array(5).fill(null);broadcast(r);});
 socket.on('game:submit',()=>{const r=getRoom(socket),p=r?.players.get(socket.data.token);if(!p||r.phase!=='configuration'||p.submitted)return;p.submitted=true;broadcast(r);if([...r.players.values()].every(x=>x.submitted)){r.phase='resolving';broadcast(r,true);setTimeout(()=>{if(r.phase!=='resolving')return;resolveRound(r);broadcast(r,true);},900);}});
 socket.on('game:next',()=>{const r=getRoom(socket),p=r?.players.get(socket.data.token);if(!p||r.phase!=='round-complete')return;p.nextReady=true;if([...r.players.values()].every(x=>x.nextReady)){r.round++;for(const q of r.players.values()){refill(q,10);q.nextReady=false;}r.phase='configuration';log(r,`進入第 ${r.round} 輪，雙方各抽取最多 10 張牌`);broadcast(r);}else broadcast(r);});
 socket.on('disconnect',()=>{const r=rooms.get(socket.data.roomId);if(!r)return;const t=socket.data.token;if(r.sockets.get(t)===socket.id){r.sockets.delete(t);log(r,`${r.players.get(t)?.name||'玩家'} 暫時斷線；可使用相同瀏覽器重新連線`);broadcast(r,r.phase!=='configuration');}});
});
httpServer.listen(PORT,'0.0.0.0',()=>console.log(`CardBattle listening on ${PORT}`));
