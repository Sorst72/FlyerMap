/* global L */
const $ = id => document.getElementById(id);
let state, campaignId, selected, selectedReservation, layers = [], drawMode, drawTool, draftLayer, draftGeometry, draftSource, searchResults = [], searchOutline;
L.drawLocal.draw.handlers.polygon.tooltip = {start:'Klicka för första hörnet.',cont:'Klicka för nästa hörn.',end:'Klicka på första hörnet för att avsluta.'};
L.drawLocal.draw.handlers.polyline.error = 'Polygonens kanter får inte korsa varandra.';
L.drawLocal.draw.handlers.simpleshape.tooltip.end = 'Släpp för att avsluta.';
const map = L.map('map').setView([58.39,15.69], 13);
const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
tiles.on('tileerror', () => { document.querySelector('.map-note').textContent = 'Bakgrundskartan kunde inte hämtas. Kontrollera internetåtkomst till OpenStreetMap. Områdena och listan fungerar fortfarande.'; });
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = value => new Date(value).toLocaleString('sv-SE', { dateStyle:'short', timeStyle:'short' });
const notice = (message, error = false) => { $('notice').textContent = message; $('notice').className = error ? 'error' : ''; };
async function api(path, body) {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type':'application/json', 'X-Demo-User':$('profile').value }, ...(body ? { body:JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
const campaign = () => state.campaigns.find(c => c.id === campaignId);
const passesFor = areaId => state.passes.filter(p => p.campaignId === campaignId && (!areaId || p.areaId === areaId));
const reservationsFor = areaId => state.reservations.filter(r => r.campaignId === campaignId && r.areaId === areaId && Date.parse(r.until) > Date.now());
const reservationFor = areaId => reservationsFor(areaId).find(r => r.id === selectedReservation) || reservationsFor(areaId).find(r => r.userId === state.user.id);
const wholeComplete = areaId => passesFor(areaId).some(p => p.complete && JSON.stringify(p.geometry) === JSON.stringify(campaign().areas.find(a => a.id === areaId).geometry));
function areaStatus(areaId) {
  const passes = passesFor(areaId);
  if (wholeComplete(areaId)) return ['Klart', '#286044'];
  if (passes.length) return ['Delvis utdelat', '#629cbb'];
  if (reservationsFor(areaId).length) return ['Paxat', '#d09a46'];
  return ['Ledigt', '#739d75'];
}
async function refresh() {
  try {
    state = await api('/api/state');
    const active = state.campaigns.filter(c => c.active);
    if (!active.some(c => c.id === campaignId)) campaignId = active[0]?.id;
    $('campaign').innerHTML = active.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('') || '<option>Inga aktiva kampanjer</option>';
    $('campaign').value = campaignId || '';
    render();
    if (!window.initialFit && campaign()?.areas.length) { map.fitBounds(L.geoJSON(campaign().areas.map(a => ({type:'Feature',properties:{},geometry:a.geometry}))).getBounds()); window.initialFit = true; }
  } catch (error) { notice(error.message, true); }
}
function render() {
  const c = campaign();
  $('admin').hidden = state.user.role !== 'admin'; $('draw-area').hidden = state.user.role !== 'admin'; $('draw-area').disabled = !c;
  $('close-campaign').disabled = !c;
  layers.forEach(layer => map.removeLayer(layer)); layers = [];
  if (!c) { $('areas').innerHTML = '<p class="empty">Skapa en kampanj för att börja.</p>'; $('detail').innerHTML = ''; $('passes').innerHTML = ''; $('stats').innerHTML = ''; $('area-count').textContent = '0'; return; }
  if (!c.areas.some(a => a.id === selected)) selected = c.areas[0]?.id;
  const passList = passesFor().filter(p => !$('date-filter').value || p.deliveredAt.slice(0,10) >= $('date-filter').value);
  const stats = [[c.areas.filter(a => areaStatus(a.id)[0] === 'Klart').length + '/' + c.areas.length, 'områden klara'], [passList.reduce((sum,p) => sum + p.flyers,0).toLocaleString('sv-SE'), 'flyers registrerade'], [passList.length, 'utdelningspass']];
  $('stats').innerHTML = stats.map(([n,label]) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`).join('');
  $('area-count').textContent = c.areas.length + ' områden';
  $('areas').innerHTML = c.areas.map(a => {
    const reservations = reservationsFor(a.id), status = areaStatus(a.id)[0];
    return `<button class="area ${selected === a.id ? 'selected' : ''}" data-area="${esc(a.id)}"><span class="area-top"><span>${esc(a.name)}</span><span class="badge">${status}</span></span><small>Prioritet: ${a.priority}${reservations.length ? ' · ' + reservations.length + ' aktiva paxningar' : ''}</small></button>`;
  }).join('');
  c.areas.forEach(a => {
    const layer = L.geoJSON(a.geometry, { color:areaStatus(a.id)[1], weight: selected === a.id ? 4 : 2, fillOpacity:selected === a.id ? .35 : .18 }).addTo(map);
    layer.bindTooltip(`${esc(a.name)} · ${areaStatus(a.id)[0]}`);
    layer.on('click', () => { if (drawMode) return; selected = a.id; selectedReservation = undefined; render(); }); layers.push(layer);
  });
  $('areas').querySelectorAll('button').forEach(b => b.onclick = () => { selected = b.dataset.area; render(); map.fitBounds(L.geoJSON(c.areas.find(a => a.id === selected).geometry).getBounds(), { maxZoom:16 }); });
  const shown = state.reservations.filter(r => r.campaignId === campaignId && Date.parse(r.until) > Date.now());
  shown.forEach(r => {
    const layer = L.geoJSON(r.geometry, {color:r.userId === state.user.id ? '#cf7928' : '#954c9a', weight:3, fillOpacity:.28, dashArray:'6 4'}).addTo(map);
    layer.bindTooltip(`${esc(r.name || 'Paxad del')} · ${esc(state.users.find(u => u.id === r.userId)?.name)}`);
    layer.on('click', () => { if (drawMode) return; selected = r.areaId; selectedReservation = r.id; render(); }); layers.push(layer);
  });
  passesFor().filter(p => p.complete).forEach(p => { const layer = L.geoJSON(p.geometry,{color:'#286044',fillOpacity:.35,weight:2}).addTo(map); layer.bindTooltip('Den här utdelningsdelen är klar'); layers.push(layer); });
  $('passes').innerHTML = passList.slice().reverse().map(p => `<article class="pass"><strong>${esc(c.areas.find(a => a.id === p.areaId).name)} · ${p.flyers} flyers</strong><small>${esc(state.users.find(u => u.id === p.userId).name)} · ${date(p.deliveredAt)} · ${p.complete ? 'Paxad del klar' : 'Delvis utdelat'}</small>${p.notes ? `<p>${esc(p.notes)}</p>` : ''}</article>`).join('') || '<p class="empty">Inga utdelningspass för det valda filtret.</p>';
  if (selected) renderDetail(); else $('detail').innerHTML = '<p>Admin lägger till områden med ritverktyget eller platssökningen.</p>';
}
function renderDetail() {
  const a = campaign().areas.find(a => a.id === selected), r = reservationFor(selected), mine = r?.userId === state.user.id;
  const done = wholeComplete(selected);
  const tomorrow = new Date(Date.now() + 86400000); tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  $('detail').innerHTML = `<h2>${esc(a.name)}</h2><p>${esc(a.instructions)}</p><p><strong>${areaStatus(selected)[0]}</strong> · Prioritet ${a.priority}${r ? `<br>Paxat av ${esc(state.users.find(u => u.id === r.userId).name)} till ${date(r.until)}` : ''}</p>
    ${!done ? `<form id="reserve-form"><label>Paxa fram till<input type="datetime-local" name="until" value="${tomorrow.toISOString().slice(0,16)}" required></label><button>Paxa hela kampanjområdet</button></form><div class="actions"><button id="draw-reservation" class="secondary">Rita och paxa en del</button></div>` : ''}
    ${r && (mine || state.user.role === 'admin') ? '<div class="actions"><button class="secondary" id="release">Släpp paxningen</button></div>' : ''}
    ${mine ? `<form id="pass-form"><h2>Registrera utdelning</h2><label>Antal flyers<input type="number" name="flyers" min="1" max="100000" required placeholder="Till exempel 100"></label><label>Utdelningstid<input type="datetime-local" name="deliveredAt" value="${now.toISOString().slice(0,16)}" required></label><label>Vad har du delat ut?<textarea name="notes" maxlength="1000" placeholder="Beskriv gatorna eller delen av området."></textarea></label><label class="check"><input type="checkbox" name="complete">Min paxade del är klar. Detta avslutar bara denna paxning.</label><button>Spara bekräftat pass</button></form>` : ''}
    ${state.user.role === 'admin' ? `<details><summary>Ändra områdets prioritet och instruktion</summary><form id="area-form"><label>Prioritet<select name="priority">${['Hög','Normal','Låg'].map(p => `<option ${p === a.priority ? 'selected' : ''}>${p}</option>`).join('')}</select></label><label>Instruktion<textarea name="instructions" maxlength="1000">${esc(a.instructions)}</textarea></label><button>Spara området</button></form></details>` : ''}`;
  const bookings = reservationsFor(selected);
  if (bookings.length) {
    const container = document.createElement('div'); container.className = 'booking-list';
    container.innerHTML = '<h3>Paxade delar</h3>' + bookings.map(b => `<button class="secondary booking" data-booking="${b.id}">${esc(b.name || a.name)} · ${esc(state.users.find(u => u.id === b.userId)?.name)} · till ${date(b.until)}</button>`).join('');
    $('detail').prepend(container);
    container.querySelectorAll('button').forEach(button => button.onclick = () => { selectedReservation = button.dataset.booking; renderDetail(); });
  }
  $('draw-reservation')?.addEventListener('click', () => startDrawing('reservation'));
  $('reserve-form')?.addEventListener('submit', e => { e.preventDefault(); mutate('/api/reservations', { until:new Date(new FormData(e.target).get('until')).toISOString() }, 'Området är paxat.', e.target); });
  $('release')?.addEventListener('click', () => mutate('/api/reservations/release', {}, 'Paxningen är släppt. Tidigare utdelning finns kvar.'));
  $('pass-form')?.addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target);
    // Keep the same ID on retry if the server saved but the response was lost.
    e.target.dataset.passId ||= crypto.randomUUID();
    mutate('/api/passes', { id:e.target.dataset.passId, flyers:Number(f.get('flyers')), deliveredAt:new Date(f.get('deliveredAt')).toISOString(), notes:f.get('notes'), complete:f.has('complete') }, 'Utdelningspasset är sparat.', e.target);
  });
  $('area-form')?.addEventListener('submit', e => { e.preventDefault(); mutate('/api/areas/update', Object.fromEntries(new FormData(e.target)), 'Området är uppdaterat.', e.target); });
}
async function mutate(path, body, message, form) {
  const button = form?.querySelector('button');
  if (button) button.disabled = true;
  try { await api(path, { campaignId, areaId:selected, reservationId:reservationFor(selected)?.id, ...body }); notice(message); await refresh(); }
  catch (error) { notice(error.message, true); if (button) button.disabled = false; }
}
$('profile').onchange = () => { cancelDrawing(); selectedReservation = undefined; notice(''); refresh(); };
$('campaign').onchange = () => { cancelDrawing(); campaignId = $('campaign').value; selected = undefined; selectedReservation = undefined; render(); if (campaign()?.areas.length) map.fitBounds(L.geoJSON(campaign().areas.map(a => ({type:'Feature',properties:{},geometry:a.geometry}))).getBounds()); };
$('date-filter').onchange = () => render();
$('refresh').onclick = () => refresh();
$('campaign-form').onsubmit = async e => {
  e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
  try { const c = await api('/api/campaigns', { name:new FormData(e.target).get('name') }); cancelDrawing(); campaignId = c.id; selected = undefined; e.target.reset(); notice('Kampanjen är skapad.'); await refresh(); }
  catch (error) { notice(error.message, true); }
  finally { button.disabled = false; }
};
$('close-campaign').onclick = () => { if (confirm('Avsluta kampanjen? Alla sparade pass finns kvar på servern.')) mutate('/api/campaigns/close', {}, 'Kampanjen är avslutad.'); };
refresh();

function cancelDrawing() {
  drawTool?.disable(); drawTool = undefined;
  if (draftLayer) map.removeLayer(draftLayer);
  draftLayer = undefined; draftGeometry = undefined; drawMode = undefined;
  $('drawing-panel').hidden = true;
}
function startDrawing(mode, geometry, name = '', source = '') {
  cancelDrawing(); draftSource = source; drawMode = mode; $('drawing-panel').hidden = false;
  $('draw-name').value = name;
  $('save-drawing').textContent = mode === 'area' ? 'Lägg till kampanjområde' : 'Paxa ritad del';
  $('save-drawing').disabled = !geometry;
  $('drawing-help').textContent = geometry ? 'Granska den föreslagna gränsen. Spara den eller avbryt och rita en egen.' : 'Klicka på kartan för att lägga hörn. Klicka på första hörnet för att stänga polygonen. Paxade delar måste ligga inom det valda kampanjområdet.';
  if (geometry) { draftGeometry = geometry; draftLayer = L.geoJSON(geometry,{color:'#e557a9',weight:4,fillOpacity:.15}).addTo(map); map.fitBounds(draftLayer.getBounds()); }
  else { drawTool = new L.Draw.Polygon(map,{allowIntersection:false,showArea:true,shapeOptions:{color:'#e557a9'}}); drawTool.enable(); }
  $('drawing-panel').scrollIntoView({block:'nearest'});
}
map.on(L.Draw.Event.CREATED, e => {
  draftLayer = e.layer.addTo(map); draftGeometry = e.layer.toGeoJSON().geometry;
  $('save-drawing').disabled = false; $('drawing-help').textContent = 'Polygonen är färdig. Ange ett namn och spara. Du kan avbryta och rita om.';
});
$('draw-area').onclick = () => startDrawing('area');
$('cancel-drawing').onclick = cancelDrawing;
$('undo-drawing').onclick = () => drawTool?.deleteLastVertex();
$('save-drawing').onclick = async () => {
  if (!draftGeometry) return;
  const button = $('save-drawing'); button.disabled = true;
  const body = {campaignId,areaId:selected,geometry:draftGeometry,source:draftSource,name:$('draw-name').value.trim() || (drawMode === 'reservation' ? campaign().areas.find(a => a.id === selected).name + ' · min del' : '')};
  if (drawMode === 'reservation') {
    const until = $('reserve-form')?.querySelector('[name=until]').value;
    if (!until) { notice('Ange slutdatum i områdets formulär.',true); button.disabled = false; return; }
    body.until = new Date(until).toISOString();
  }
  try {
    const result = await api(drawMode === 'area' ? '/api/areas' : '/api/reservations',body);
    if (drawMode === 'area') selected = result.id; else selectedReservation = result.id;
    cancelDrawing(); notice('Området är sparat.'); await refresh();
  } catch (error) { notice(error.message,true); button.disabled = false; }
};
$('search-form').onsubmit = async e => {
  e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
  try {
    searchResults = await api('/api/places?q=' + encodeURIComponent($('place-query').value));
    $('search-results').innerHTML = searchResults.map((r,i) => `<div class="search-result"><p>${esc(r.label)}<br><small>${r.geometry ? 'Områdesgräns finns i OpenStreetMap' : 'Endast platsläge – rita en egen gräns'}</small></p><button class="secondary" data-result="${i}">${r.geometry && state.user.role === 'admin' ? 'Granska och välj gräns' : 'Visa på kartan'}</button></div>`).join('') || '<p>Inga platser hittades. Prova kommunnamnet också eller rita själv.</p>';
    $('search-results').querySelectorAll('button').forEach(b => b.onclick = () => {
      const result = searchResults[Number(b.dataset.result)];
      if (searchOutline) map.removeLayer(searchOutline);
      if (result.geometry && state.user.role === 'admin' && campaign()) startDrawing('area',result.geometry,result.name,result.source);
      else if (result.geometry) { searchOutline = L.geoJSON(result.geometry,{color:'#e557a9',fillOpacity:0,weight:3}).addTo(map); map.fitBounds(searchOutline.getBounds()); }
      else { map.setView([result.lat,result.lng],14); notice('Söktjänsten har ingen områdesgräns för platsen. Admin kan rita kampanjområdet.'); }
    });
  } catch(error) { notice(error.message,true); }
  finally { button.disabled = false; }
};
