(() => {
 const socket=io(); let state=null,token=localStorage.getItem('cb_player_token')||'',selected=null,deckCounts={};
 const $=id=>document.getElementById(id), names={fire:'火焰',water:'水',thunder:'雷電'};
 if(typeof customDeckCounts!=='undefined')deckCounts={...customDeckCounts};else (window.CARD_DATABASE||[]).forEach(c=>deckCounts[c.key]=5);
 const overlay=document.createElement('div');overlay.id='mpLobby';overlay.innerHTML=`<div class="mp-box"><h2>卡牌對戰｜多人連線</h2><p>建立房間，或輸入朋友提供的六位代碼加入。</p><label>玩家名稱<input id="mpName" maxlength="16" placeholder="玩家名稱"></label><div class="mp-row"><button id="mpCreate">建立房間</button><input id="mpCode" maxlength="6" placeholder="房間代碼"><button id="mpJoin">加入房間</button></div><p id="mpMessage">請先建立或加入房間。</p><div id="mpRoomInfo"></div><button id="mpReady" disabled>準備</button><button id="mpStart" disabled>房主開始</button><small>雙方需要使用各自的 60 張牌組。房間代碼可分享給朋友。</small></div>`;
 const css=document.createElement('style');css.textContent=`#mpLobby{position:fixed;inset:0;background:#0b111beF;z-index:100;display:flex;align-items:center;justify-content:center;padding:14px;font-family:system-ui;color:#edf2f7}#mpLobby .mp-box{width:min(520px,96vw);background:#202d3c;border:1px solid #d9b66f;border-radius:12px;padding:20px;box-shadow:0 15px 55px #000b}#mpLobby h2{margin:0 0 8px;color:#f1d48c}#mpLobby p,#mpLobby small{color:#cbd5e1;font-size:13px}#mpLobby label{display:block;font-size:12px;color:#e8d6a9}#mpLobby input{background:#111b27;border:1px solid #65788d;color:white;padding:9px;border-radius:6px;min-width:0;width:100%;margin:5px 0 10px}#mpLobby button{background:#806b45;color:white;border:1px solid #d9b66f;border-radius:6px;padding:9px 12px;margin:4px;cursor:pointer}#mpLobby button:disabled{opacity:.4}#mpLobby .mp-row{display:flex;gap:5px;align-items:center}#mpLobby .mp-row input{flex:1;margin:4px}#mpRoomInfo{padding:10px;background:#111b27;border-radius:7px;margin:8px 0;line-height:1.8}#mpMessage{min-height:22px}#mpLobby small{display:block;margin-top:12px}`;
 document.head.append(css);document.body.append(overlay);
 $('battleStartBtn').style.display='none';$('resetBtn').style.display='none';$('battleLogBtn').textContent='查看戰鬥紀錄';
 $('battleLogBtn').onclick=()=>{if(!state)return;const area=$('modalChoices');area.innerHTML='';state.logs.forEach((line,i)=>{const row=document.createElement('div');row.className='choice';row.textContent=`${i+1}. ${line}`;area.append(row);});$('modalTitle').textContent='伺服器戰鬥紀錄';$('modalText').textContent=`共 ${state.logs.length} 筆紀錄`; $('modalWrap').style.display='flex';};
 const say=m=>{$('mpMessage').textContent=m;};
 const getCounts=()=>{if(typeof customDeckCounts!=='undefined')return {...customDeckCounts};return deckCounts;};
 function create(){socket.emit('room:create',{name:$('mpName').value||'玩家',counts:getCounts(),token:token||undefined});}
 function join(){socket.emit('room:join',{roomId:$('mpCode').value,name:$('mpName').value||'玩家',counts:getCounts(),token:token||undefined});}
 $('mpCreate').onclick=create;$('mpJoin').onclick=join;$('mpReady').onclick=()=>socket.emit('room:ready',{ready:true});$('mpStart').onclick=()=>socket.emit('room:start');
 socket.on('connect',()=>{const oldRoom=localStorage.getItem('cb_room_id');if(token&&oldRoom){socket.emit('room:join',{roomId:oldRoom,name:$('mpName').value||'玩家',counts:getCounts(),token});say('正在恢復房間連線…');}else say('已連線，請建立或加入房間。');});
 socket.on('room:joined',d=>{token=d.token;localStorage.setItem('cb_player_token',token);localStorage.setItem('cb_room_id',d.roomId);$('deckBtn').disabled=true;say(`已加入房間 ${d.roomId}`);});
 socket.on('app:error',d=>{say(d.message);if(d.message==='找不到房間')localStorage.removeItem('cb_room_id');});
 function render(){if(!state)return;
  const localIndex=state.myIndex??0;
  let my=state.players[localIndex],enemy=state.players[1-localIndex];
  if(!my){my=state.players[0];enemy=state.players[1];}
  $('mpRoomInfo').innerHTML=`房間代碼：<b style="font-size:22px;color:#f1d48c;letter-spacing:3px">${state.roomId}</b><br>狀態：${phaseName(state.phase)}<br>${state.players.map((p,i)=>`${i===localIndex?'你':'對手'}：${escapeHtml(p.name)}（${p.ready?'已準備':'未準備'}）`).join('<br>')}<br>${state.phase==='configuration'?`我方手牌 ${my.handCount} 張｜牌庫 ${my.deckCount} 張｜棄牌 ${my.discardCount} 張`:''}`;
  $('mpReady').disabled=state.phase!=='waiting';$('mpStart').disabled=!state.isHost||state.phase!=='waiting'||state.players.length!==2||state.players.some(p=>!p.ready);
  if(state.phase!=='waiting')overlay.style.display='none';
  if(state.phase==='waiting'){overlay.style.display='flex';return;}
  if(!my||!enemy)return;
  document.querySelector('.player-strip.enemy .name-row span').textContent=enemy.name;$('enemyHpText').textContent=`${enemy.hp} / ${enemy.maxHp}`;$('enemyHpBar').style.width=`${enemy.hp}%`;$('enemySideHp').textContent=enemy.hp;$('enemyHandCount').textContent=`${enemy.handCount} 張`;
  document.querySelector('.player-strip:not(.enemy) .name-row span').textContent=my.name;$('myHpText').textContent=`${my.hp} / ${my.maxHp}`;$('myHpTop').textContent=`${my.hp} / ${my.maxHp}`;$('myHpBar').style.width=`${my.hp}%`;
  $('myDeck').textContent=my.deckCount;$('myHandNum').textContent=my.handCount;$('handCount').textContent=`${my.handCount} 張`;$('discardCount').textContent=my.discardCount;$('round').textContent=String(state.round).padStart(2,'0');$('phase').textContent=phaseName(state.phase);
  renderHand(my);renderEnemyHand(enemy);renderSlots(my,enemy);$('log').textContent='戰鬥紀錄：'+(state.logs.slice(-1)[0]||'等待行動');
  const canAct=state.phase==='configuration'&&!my.submitted;$('resolveBtn').disabled=!canAct;$('clearBtn').disabled=!canAct;$('nextRoundBtn').disabled=state.phase!=='round-complete';$('nextRoundBtn').textContent=state.phase==='round-complete'?'準備進入下一輪':'進入下一回合';
  if(state.phase==='round-complete')$('nextRoundBtn').onclick=()=>socket.emit('game:next');
  if(state.phase==='ended'){overlay.style.display='flex';say(state.winner==='draw'?'雙方同時戰敗，平手。':(state.winner===state.myToken?'你獲勝！':'你落敗了。'));}
 }
 function phaseName(p){return ({waiting:'等待玩家',configuration:'配置行動',resolving:'結算中', 'round-complete':'等待雙方進入下一輪',ended:'對戰結束'})[p]||p;}
 function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function localPlayers(){return state.players;}
 function localIndex(){return state.myIndex??0;}
 function renderHand(my){const area=$('myHand');area.innerHTML='';my.hand.forEach(c=>{const b=document.createElement('button');b.className='card'+(selected===c.id?' selected':'');b.innerHTML=`<span class="ct">${escapeHtml(c.name)}</span><span class="cost">消耗 ${c.cost} 行動</span>`;b.onclick=()=>{selected=selected===c.id?null:c.id;renderHand(my);};area.append(b);});}
 function renderEnemyHand(enemy){const area=$('enemyHand');area.innerHTML='';enemy.hand.forEach(c=>{const el=document.createElement('div');el.className='card';el.style.cursor='default';el.innerHTML=`<span class="ct">${escapeHtml(c.name)}</span><span class="cost">消耗 ${c.cost} 行動</span>`;area.append(el);});}
 function renderSlots(my,enemy){const mine=$('mySlots');mine.innerHTML='';my.slots?.forEach((c,i)=>{const el=document.createElement('div');el.className='slot'+(c?' filled':'');el.innerHTML=c?`<span class="slot-num">我方 ${i+1}</span><span class="placed">${escapeHtml(c.name)}</span><span class="slot-label">${c.effect==='attribute_shield'?`抵擋：${names[c.selectedElement]}`:`消耗 ${c.cost} 行動`}</span><button data-remove="${i}" ${my.submitted?'disabled':''}>移除</button>`:`<span class="slot-num">我方 ${i+1}</span><span class="slot-label">點選手牌後放置</span>`;el.onclick=()=>{if(!selected||my.submitted||c)return;const card=my.hand.find(x=>x.id===selected);if(!card)return;let element=null;if(card.effect==='attribute_shield'){showShieldElementPicker(card,()=>socket.emit('game:place',{slot:i,cardId:selected,element:card.selectedElement}));selected=null;return;}socket.emit('game:place',{slot:i,cardId:selected,element});selected=null;};el.querySelector('button')?.addEventListener('click',e=>{e.stopPropagation();socket.emit('game:remove',{slot:i});});mine.append(el);});
  const theirs=$('enemySlots');theirs.innerHTML='';(enemy.slots||Array(5).fill(null)).forEach((c,i)=>{const el=document.createElement('div');el.className='slot'+(c?' filled':'');el.innerHTML=c?`<span class="slot-num">敵方 ${i+1}</span><span class="placed">${escapeHtml(c.name)}</span><span class="slot-label">消耗 ${c.cost} 行動</span>`:`<span class="slot-num">敵方 ${i+1}</span><span class="slot-label">${my.submitted?'等待揭示':'等待對手提交'}</span>`;theirs.append(el);});
 }
 $('resolveBtn').onclick=()=>socket.emit('game:submit');$('clearBtn').onclick=()=>socket.emit('game:clear');
 socket.on('game:state',s=>{state=s;render();});
})();
