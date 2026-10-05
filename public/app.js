/* global L */
const $ = id => document.getElementById(id);
let state, campaignId, selected, layers = [];
const map = L.map('map').setView([59.341,18.046], 14);
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
const reservationFor = areaId => state.reservations.find(r => r.campaignId === campaignId && r.areaId === areaId && Date.parse(r.until) > Date.now());
function areaStatus(areaId) {
  const passes = passesFor(areaId);
  if (passes.some(p => p.complete)) return ['Klart', '#286044'];
  if (passes.length) return ['Delvis utdelat', '#629cbb'];
  if (reservationFor(areaId)) return ['Paxat', '#d09a46'];
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
  } catch (error) { notice(error.message, true); }
}
function render() {
  const c = campaign();
  $('admin').hidden = state.user.role !== 'admin';
  $('close-campaign').disabled = !c;
  layers.forEach(layer => map.removeLayer(layer)); layers = [];
  if (!c) { $('areas').innerHTML = '<p class="empty">Skapa en kampanj för att börja.</p>'; $('detail').innerHTML = ''; $('passes').innerHTML = ''; $('stats').innerHTML = ''; $('area-count').textContent = '0'; return; }
  if (!c.areas.some(a => a.id === selected)) selected = c.areas[0]?.id;
  const passList = passesFor().filter(p => !$('date-filter').value || p.deliveredAt.slice(0,10) >= $('date-filter').value);
  const stats = [[c.areas.filter(a => areaStatus(a.id)[0] === 'Klart').length + '/' + c.areas.length, 'områden klara'], [passList.reduce((sum,p) => sum + p.flyers,0).toLocaleString('sv-SE'), 'flyers registrerade'], [passList.length, 'utdelningspass']];
  $('stats').innerHTML = stats.map(([n,label]) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`).join('');
  $('area-count').textContent = c.areas.length + ' områden';
  $('areas').innerHTML = c.areas.map(a => {
    const r = reservationFor(a.id), status = areaStatus(a.id)[0];
    return `<button class="area ${selected === a.id ? 'selected' : ''}" data-area="${esc(a.id)}"><span class="area-top"><span>${esc(a.name)}</span><span class="badge">${status}</span></span><small>Prioritet: ${a.priority}${r ? ' · Paxat av ' + esc(state.users.find(u => u.id === r.userId).name) : ''}</small></button>`;
  }).join('');
  c.areas.forEach(a => {
    const layer = L.polygon(a.polygon, { color:areaStatus(a.id)[1], weight: selected === a.id ? 4 : 2, fillOpacity:selected === a.id ? .35 : .18 }).addTo(map);
    layer.bindTooltip(`${esc(a.name)} · ${areaStatus(a.id)[0]}`);
    layer.on('click', () => { selected = a.id; render(); }); layers.push(layer);
  });
  $('areas').querySelectorAll('button').forEach(b => b.onclick = () => { selected = b.dataset.area; render(); map.fitBounds(c.areas.find(a => a.id === selected).polygon, { maxZoom:16 }); });
  $('passes').innerHTML = passList.slice().reverse().map(p => `<article class="pass"><strong>${esc(c.areas.find(a => a.id === p.areaId).name)} · ${p.flyers} flyers</strong><small>${esc(state.users.find(u => u.id === p.userId).name)} · ${date(p.deliveredAt)} · ${p.complete ? 'Området klart' : 'Delvis utdelat'}</small>${p.notes ? `<p>${esc(p.notes)}</p>` : ''}</article>`).join('') || '<p class="empty">Inga utdelningspass för det valda filtret.</p>';
  renderDetail();
}
function renderDetail() {
  const a = campaign().areas.find(a => a.id === selected), r = reservationFor(selected), mine = r?.userId === state.user.id;
  const done = areaStatus(selected)[0] === 'Klart';
  const tomorrow = new Date(Date.now() + 86400000); tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  $('detail').innerHTML = `<h2>${esc(a.name)}</h2><p>${esc(a.instructions)}</p><p><strong>${areaStatus(selected)[0]}</strong> · Prioritet ${a.priority}${r ? `<br>Paxat av ${esc(state.users.find(u => u.id === r.userId).name)} till ${date(r.until)}` : ''}</p>
    ${!r && !done ? `<form id="reserve-form"><label>Paxa fram till<input type="datetime-local" name="until" value="${tomorrow.toISOString().slice(0,16)}" required></label><button>Paxa området</button></form>` : ''}
    ${r && (mine || state.user.role === 'admin') ? '<div class="actions"><button class="secondary" id="release">Släpp paxningen</button></div>' : ''}
    ${mine ? `<form id="pass-form"><h2>Registrera utdelning</h2><label>Antal flyers<input type="number" name="flyers" min="1" max="100000" required placeholder="Till exempel 100"></label><label>Utdelningstid<input type="datetime-local" name="deliveredAt" value="${now.toISOString().slice(0,16)}" required></label><label>Vad har du delat ut?<textarea name="notes" maxlength="1000" placeholder="Beskriv gatorna eller delen av området."></textarea></label><label class="check"><input type="checkbox" name="complete">Hela området är klart. Detta avslutar paxningen.</label><button>Spara bekräftat pass</button></form>` : ''}
    ${state.user.role === 'admin' ? `<details><summary>Ändra områdets prioritet och instruktion</summary><form id="area-form"><label>Prioritet<select name="priority">${['Hög','Normal','Låg'].map(p => `<option ${p === a.priority ? 'selected' : ''}>${p}</option>`).join('')}</select></label><label>Instruktion<textarea name="instructions" maxlength="1000">${esc(a.instructions)}</textarea></label><button>Spara området</button></form></details>` : ''}`;
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
  try { await api(path, { campaignId, areaId:selected, ...body }); notice(message); await refresh(); }
  catch (error) { notice(error.message, true); if (button) button.disabled = false; }
}
$('profile').onchange = () => { notice(''); refresh(); };
$('campaign').onchange = () => { campaignId = $('campaign').value; selected = undefined; render(); };
$('date-filter').onchange = () => render();
$('refresh').onclick = () => refresh();
$('campaign-form').onsubmit = async e => {
  e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
  try { const c = await api('/api/campaigns', { name:new FormData(e.target).get('name') }); campaignId = c.id; e.target.reset(); notice('Kampanjen är skapad.'); await refresh(); }
  catch (error) { notice(error.message, true); }
  finally { button.disabled = false; }
};
$('close-campaign').onclick = () => { if (confirm('Avsluta kampanjen? Alla sparade pass finns kvar på servern.')) mutate('/api/campaigns/close', {}, 'Kampanjen är avslutad.'); };
refresh();
