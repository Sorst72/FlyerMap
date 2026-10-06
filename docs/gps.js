const $ = id => document.getElementById(id);
const KEY = 'flyermap-gps-test-v1';
let session, watchId, timer, pending = false, running = false;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved && Array.isArray(saved.samples) && Array.isArray(saved.events)) {
    session = saved;
    if (!session.endedAt) { session.interrupted = true; $('status').textContent = 'Ett tidigare test avbröts. Senast sparade uppgifter visas; ingen inspelning pågår.'; }
    $('device').value = session.device || '';
  }
} catch { $('error').textContent = 'Det sparade testet kunde inte läsas.'; }
const seconds = ms => Math.round(ms / 1000);
const time = ms => new Date(ms).toLocaleTimeString('sv-SE');
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(session)); return true; }
  catch {
    end('Lagringen misslyckades. Inspelningen är stoppad. Exportera det som finns kvar i minnet.');
    return false;
  }
}
function event(type) { if (session) session.events.push({type,at:Date.now()}); }
function controls() {
  $('start').disabled = running || pending;
  $('stop').disabled = !(running || pending);
  $('lock').disabled = !running || session.events.some(e=>e.type==='lock-start') && !session.events.some(e=>e.type==='lock-end');
  $('back').disabled = !running || !session.events.some(e=>e.type==='lock-start') || session.events.some(e=>e.type==='lock-end');
  $('device').disabled = running || pending;
  $('export').disabled = !session;
  $('delete').disabled = !session || running || pending;
}
function render() {
  controls(); if (!session) { $('results').textContent = 'Inget test sparat ännu.'; $('timeline').replaceChildren(); return; }
  const samples = session.samples;
  const sourceGaps = samples.slice(1).map((s,i) => Math.max(0,s.positionAt-samples[i].positionAt));
  const receivedGaps = samples.slice(1).map((s,i) => Math.max(0,s.receivedAt-samples[i].receivedAt));
  const startLock = session.events.find(e=>e.type==='lock-start');
  const endLock = session.events.find(e=>e.type==='lock-end');
  const pairs = [
    ['Sparade positioner', samples.length],
    ['Största lucka mellan positionstidpunkter', samples.length > 1 ? seconds(Math.max(...sourceGaps))+' s' : 'För få positioner'],
    ['Största lucka mellan mottagna uppdateringar', samples.length > 1 ? seconds(Math.max(...receivedGaps))+' s' : 'För få positioner'],
    ['Mottagningsluckor över 20 s', receivedGaps.filter(g=>g>20000).length],
    ['Senaste noggrannhet', samples.length ? Math.round(samples.at(-1).accuracy)+' m' : 'Okänd'],
    ['Manuellt markerad låsperiod', startLock && endLock ? seconds(endLock.at-startLock.at)+' s' : startLock ? 'Ännu inte avslutad' : 'Inte markerad'],
    ['Positioner mottagna under markerad låsperiod', startLock && endLock ? samples.filter(s=>s.receivedAt>=startLock.at&&s.receivedAt<=endLock.at).length : 'Inte bedömbart'],
    ['Positionstidpunkter under markerad låsperiod', startLock && endLock ? samples.filter(s=>s.positionAt>=startLock.at&&s.positionAt<=endLock.at).length : 'Inte bedömbart']
  ];
  const dl = document.createElement('dl');
  for (const [label,value] of pairs) { const dt=document.createElement('dt'),dd=document.createElement('dd'); dt.textContent=label;dd.textContent=value;dl.append(dt,dd); }
  $('results').replaceChildren(dl);
  const messages = document.createElement('p');
  messages.textContent = !samples.length ? 'Ingen position har sparats. Testet säger inget om GPS med låst skärm.' : session.interrupted ? 'Testet avbröts när sidan stängdes eller laddades om. Endast senast sparade uppgifter finns.' : 'Låsperioden är manuellt markerad. Webbsidan kan inte avgöra exakt när telefonen låstes.';
  $('results').append(messages);
  const table=document.createElement('table');
  table.innerHTML='<thead><tr><th>Positionstid</th><th>Mottagen</th><th>Lucka i mottagning</th><th>Noggrannhet</th></tr></thead>';
  const tbody=document.createElement('tbody');
  samples.slice(-12).forEach((s,index)=>{ const originalIndex=samples.length-Math.min(12,samples.length)+index; const row=document.createElement('tr'); const vals=[time(s.positionAt),time(s.receivedAt),originalIndex ? seconds(s.receivedAt-samples[originalIndex-1].receivedAt)+' s' : '–',Math.round(s.accuracy)+' m']; vals.forEach(v=>{const td=document.createElement('td');td.textContent=v;row.append(td);});tbody.append(row);});
  table.append(tbody); $('timeline').replaceChildren(table);
}
function end(message='Testet är stoppat. Resultatet finns kvar i denna webbläsare.') {
  if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
  watchId=undefined;clearInterval(timer);timer=undefined;
  running=false;pending=false;
  if (session && !session.endedAt) { session.endedAt=Date.now();event('stop'); }
  $('status').textContent=message;render();
}
$('start').onclick=()=>{
  $('error').textContent='';
  if (!window.isSecureContext) { $('error').textContent='GPS kräver HTTPS på telefonen. En vanlig http-adress till datorn fungerar inte.';return; }
  if (!navigator.geolocation) { $('error').textContent='Webbläsaren stöder inte platsåtkomst.';return; }
  if (session && !confirm('Ersätt det tidigare testet? Exportera det först om du vill behålla det.')) return;
  session={version:1,device:$('device').value,userAgent:navigator.userAgent,startedAt:Date.now(),samples:[],events:[]};
  pending=true;event('request-permission');if (!save()) return;
  $('status').textContent='Väntar på tillåtelse och en första position. Inspelningen är ännu inte igång.';render();
  watchId=navigator.geolocation.watchPosition(position=>{
    if (!pending && !running) return;
    if (session.samples.length>=5000) { end('Testgränsen 5 000 positioner är nådd. Exportera resultatet.');save();return; }
    const c=position.coords;
    if (![position.timestamp,c.latitude,c.longitude,c.accuracy].every(Number.isFinite)) return;
    const positionAt=position.timestamp;
    if (session.samples.some(s=>s.positionAt===positionAt)) return;
    pending=false;running=true;
    session.samples.push({positionAt,receivedAt:Date.now(),lat:c.latitude,lng:c.longitude,accuracy:c.accuracy,visibility:document.visibilityState});
    if (!save()) return;
    $('status').textContent='GPS-testet är igång. Första positionen är mottagen.';render();
    if (!timer) timer=setInterval(()=>{const age=seconds(Date.now()-session.samples.at(-1).receivedAt);$('live').textContent=`Senast mottagna position: ${age} sekunder sedan. Tidsräknaren kan pausas när skärmen låses.`;},1000);
  },error=>{
    if (!pending && !running) return;
    event('gps-error-'+error.code);
    $('error').textContent=error.code===1 ? 'Platsåtkomst nekades. Tillåt plats i webbläsarens inställningar och starta igen.' : error.code===2 ? 'Position saknas. Gå utomhus och kontrollera att telefonens platstjänster är på.' : 'Ingen position kom inom tidsgränsen. Försök igen utomhus.';
    if(error.code===1) {end('Testet stoppades: platsåtkomst nekad.');save();} else {save();render();}
  },{enableHighAccuracy:true,maximumAge:0,timeout:30000});
};
$('stop').onclick=()=>{end();save();};
$('lock').onclick=()=>{event('lock-start');save();$('status').textContent='Lås skärmen nu och fortsätt gå. Återvänd till samma flik efter 5 minuter.';render();};
$('back').onclick=()=>{event('lock-end');save();$('status').textContent='Återkomst markerad. Gå vidare med skärmen tänd och stoppa sedan testet.';render();};
document.addEventListener('visibilitychange',()=>{if(running||pending){event('visibility-'+document.visibilityState);save();}});
window.addEventListener('pagehide',()=>{if(running||pending){event('pagehide');save();}});
$('export').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(session,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='flyermap-gps-test.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('delete').onclick=()=>{if(confirm('Radera det lokalt sparade GPS-testet?')){try{localStorage.removeItem(KEY);session=undefined;$('status').textContent='Testet är raderat.';$('live').textContent='';render();}catch{$('error').textContent='Testet kunde inte raderas.';}}};
render();
