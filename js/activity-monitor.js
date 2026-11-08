// v0.1.293 - display name in monitoring (based on v0.1.272). Does not block login, grading, or exam operations.
export function createActivityMonitor({state}) {
  let timer=null, refreshTimer=null, active=false, lastInteraction=Date.now(), lastPing=0, inFlight=false;
  const sessionKey='exam_monitor_session_v1';
  let sessionId=null;
  const byId=id=>document.getElementById(id);
  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function getSessionId(){try{let id=sessionStorage.getItem(sessionKey);if(!/^[0-9a-f-]{36}$/i.test(id||'')){id=crypto.randomUUID();sessionStorage.setItem(sessionKey,id)}return id}catch{return crypto.randomUUID()}}
  function section(){const visible=[...document.querySelectorAll('#app-screen .tab.active')][0];if(state.role==='admin')return visible?.dataset.tab||'admin';return 'nhap-diem'}
  async function ping(force=false){if(!active||!state.client||!state.session?.user||inFlight)return;if(!force&&Date.now()-lastPing<15000)return;
    inFlight=true;lastPing=Date.now();try{const {error}=await state.client.rpc('exam_monitor_ping',{p_session_id:sessionId,p_activity:section(),p_interacted_at:new Date(lastInteraction).toISOString()});if(error)throw error}catch(e){console.debug('Giám sát chưa hoạt động:',e.message)}finally{inFlight=false}}
  function interaction(){lastInteraction=Date.now();void ping()}
  async function refresh(){if(!active||state.role!=='admin')return;const status=byId('activity-monitor-status');try{const {data,error}=await state.client.rpc('exam_monitor_summary');if(error)throw error;
    const info=data||{};const stat=byId('activity-monitor-stats');if(stat)stat.innerHTML=`<span><b>${Number(info.online_users)||0}</b> tài khoản trực tuyến</span><span><b>${Number(info.recently_active_users)||0}</b> vừa tương tác (2 phút)</span><span><b>${Number(info.visits_today)||0}</b> lượt truy cập hôm nay</span>`;
    const body=byId('activity-monitor-users');if(body){const rows=Array.isArray(info.users)?info.users:[];body.innerHTML=rows.length?rows.map(r=>`<tr><td>${safe(r.display_name||'Chưa cập nhật họ tên')}</td><td>${safe(r.role)}</td><td>${safe(r.activity)}</td><td>${safe(r.last_seen_at?new Date(r.last_seen_at).toLocaleString('vi-VN'):'')}</td></tr>`).join(''):'<tr><td colspan="4">Không có tài khoản trực tuyến được ghi nhận</td></tr>'}
    if(status)status.textContent='Online: có tín hiệu trong 90 giây · Vừa tương tác: trong 2 phút · Lượt truy cập: phiên mới trong ngày (giờ Việt Nam).';
  }catch(e){if(status)status.textContent='Chưa tải được thống kê. Cần chạy SQL giám sát v0.1.272 trên Supabase. '+e.message}}
  function stop(){active=false;clearInterval(timer);clearInterval(refreshTimer);timer=null;refreshTimer=null;document.removeEventListener('pointerdown',interaction);document.removeEventListener('keydown',interaction);document.removeEventListener('visibilitychange',onVisibility)}
  function onVisibility(){if(!document.hidden){lastInteraction=Date.now();void ping(true);if(state.role==='admin')void refresh()}}
  async function start(role){stop();active=true;sessionId=getSessionId();lastInteraction=Date.now();document.addEventListener('pointerdown',interaction,{passive:true});document.addEventListener('keydown',interaction);document.addEventListener('visibilitychange',onVisibility);
    timer=setInterval(()=>{if(!document.hidden)void ping(true)},30000);await ping(true);
    const panel=byId('activity-monitor-panel');if(panel)panel.hidden=role!=='admin';
    if(role==='admin'){byId('activity-monitor-refresh')?.addEventListener('click',refresh,{once:false});void refresh();refreshTimer=setInterval(()=>{if(!document.hidden)void refresh()},30000)}
  }
  return {start,stop};
}
