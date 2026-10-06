import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { legacyGeometry, validGeometry, inside, overlaps } from './geometry.js';

const root = dirname(fileURLToPath(import.meta.url));
export function createApp({ dataFile = resolve(root, '.data/state.json') } = {}) {
  let state = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : {
    campaigns: [{ id: 'demo', name: 'Kampanj · demo', active: true, areas: [] }],
    reservations: [], passes: []
  };
  // Preserve older local demo data; legacy reservations cover their whole parent area.
  for (const c of state.campaigns) for (const a of c.areas) a.geometry ||= legacyGeometry(a.polygon);
  for (const r of state.reservations) r.geometry ||= state.campaigns.find(c => c.id === r.campaignId)?.areas.find(a => a.id === r.areaId)?.geometry;
  for (const p of state.passes) {
    p.geometry ||= state.reservations.find(r => r.id === p.reservationId)?.geometry || state.campaigns.find(c => c.id === p.campaignId)?.areas.find(a => a.id === p.areaId)?.geometry;
    p.reservationId ||= state.reservations.find(r => r.campaignId === p.campaignId && r.areaId === p.areaId && r.userId === p.userId)?.id;
  }
  function persist() {
    mkdirSync(dirname(dataFile), { recursive: true });
    writeFileSync(dataFile + '.tmp', JSON.stringify(state, null, 2));
    renameSync(dataFile + '.tmp', dataFile);
  }
  const users = [{ id: 'alex', name: 'Alex', role: 'admin' }, { id: 'sam', name: 'Sam', role: 'distributor' }];
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  const text = (value, max = 200) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  function api(method, path, body, userId) {
    const user = users.find(u => u.id === userId);
    if (!user) fail('Välj en demoprofil.', 401);
    if (method === 'GET' && path === '/api/state') return { ...state, users, user, demo: true };
    if (method !== 'POST') fail('Sidan finns inte.', 404);
    if (path === '/api/campaigns') {
      if (user.role !== 'admin') fail('Endast admin kan skapa kampanjer.', 403);
      if (!text(body.name, 80)) fail('Ange ett kampanjnamn, högst 80 tecken.');
      const campaign = { id: randomUUID(), name: body.name.trim(), active: true, areas: [] };
      state.campaigns.push(campaign); persist(); return campaign;
    }
    const campaign = state.campaigns.find(c => c.id === body.campaignId);
    if (!campaign || !campaign.active) fail('Kampanjen är inte aktiv.', 409);
    if (path === '/api/campaigns/close') {
      if (user.role !== 'admin') fail('Endast admin kan avsluta kampanjer.', 403);
      campaign.active = false; persist(); return campaign;
    }
    if (path === '/api/areas') {
      if (user.role !== 'admin') fail('Endast admin kan ange kampanjområden.', 403);
      if (!text(body.name, 100) || !validGeometry(body.geometry)) fail('Ange namn och ett giltigt område utan korsande kanter.');
      const created = { id: randomUUID(), name: body.name.trim(), geometry: body.geometry, priority: 'Normal', instructions: '', source: text(body.source, 300) ? body.source : 'Manuellt ritat kampanjområde' };
      campaign.areas.push(created); persist(); return created;
    }
    const area = campaign.areas.find(a => a.id === body.areaId);
    if (!area) fail('Området finns inte.');
    const now = Date.now();
    const activeReservations = state.reservations.filter(r => r.campaignId === campaign.id && Date.parse(r.until) > now);
    const reservation = body.reservationId
      ? activeReservations.find(r => r.id === body.reservationId && r.areaId === area.id)
      : activeReservations.find(r => r.areaId === area.id && r.userId === userId);
    if (path === '/api/areas/update') {
      if (user.role !== 'admin') fail('Endast admin kan ändra prioritet.', 403);
      if (!['Hög', 'Normal', 'Låg'].includes(body.priority) || typeof body.instructions !== 'string' || body.instructions.length > 1000) fail('Ogiltig prioritet eller instruktion.');
      area.priority = body.priority; area.instructions = body.instructions; persist(); return area;
    }
    if (path === '/api/reservations') {
      const until = Date.parse(body.until);
      if (!Number.isFinite(until) || until <= now || until > now + 31 * 86400000) fail('Välj ett slutdatum inom 31 dagar.');
      const geometry = body.geometry || area.geometry;
      if (!validGeometry(geometry)) fail('Rita en giltig polygon utan korsande kanter.');
      if (!inside(geometry, area.geometry)) fail('Din paxning måste ligga helt inom det valda kampanjområdet.');
      if (activeReservations.some(r => overlaps(geometry, r.geometry))) fail('Din polygon överlappar en aktiv paxning. Välj en annan del.', 409);
      if (state.passes.some(p => p.campaignId === campaign.id && p.complete && overlaps(geometry, p.geometry))) fail('Din polygon överlappar en del som redan är klar.', 409);
      const r = { geometry, name: text(body.name, 100) ? body.name.trim() : area.name, id: randomUUID(), campaignId: campaign.id, areaId: area.id, userId, until: new Date(until).toISOString() };
      state.reservations.push(r); persist(); return r;
    }
    if (path === '/api/reservations/release') {
      if (!reservation) fail('Ingen aktiv paxning finns.', 409);
      if (reservation.userId !== userId && user.role !== 'admin') fail('Du kan bara släppa din egen paxning.', 403);
      reservation.until = new Date(now).toISOString(); persist(); return { released: true };
    }
    if (path === '/api/passes') {
      if (!text(body.id, 100)) fail('Passet saknar ett unikt ID.');
      const previous = state.passes.find(p => p.id === body.id);
      if (previous) {
        if (previous.userId !== userId || previous.campaignId !== campaign.id || previous.areaId !== area.id) fail('Pass-ID används redan.', 409);
        return previous;
      }
      if (!reservation || reservation.userId !== userId) fail('Paxa området innan du registrerar utdelning.', 409);
      if (!Number.isInteger(body.flyers) || body.flyers < 1 || body.flyers > 100000) fail('Ange mellan 1 och 100 000 flyers.');
      if (typeof body.complete !== 'boolean' || typeof body.notes !== 'string' || body.notes.length > 1000) fail('Kontrollera passets uppgifter.');
      if (!Number.isFinite(Date.parse(body.deliveredAt)) || Date.parse(body.deliveredAt) > now) fail('Ange ett giltigt utdelningsdatum som inte ligger i framtiden.');
      const pass = { reservationId: reservation.id, geometry: reservation.geometry, id: body.id, campaignId: campaign.id, areaId: area.id, userId, flyers: body.flyers, complete: body.complete, notes: body.notes, deliveredAt: new Date(body.deliveredAt).toISOString(), uploadedAt: new Date(now).toISOString() };
      state.passes.push(pass);
      if (pass.complete) reservation.until = new Date(now).toISOString();
      persist(); return pass;
    }
    fail('Sidan finns inte.', 404);
  }
  const searchCache = new Map();
  let searchQueue = Promise.resolve(), lastSearch = 0;
  async function searchPlaces(query) {
    if (!text(query, 120)) fail('Skriv ett platsnamn.');
    const key = query.trim().toLowerCase();
    if (searchCache.has(key)) return searchCache.get(key);
    const run = searchQueue.then(async () => {
      if (searchCache.has(key)) return searchCache.get(key);
      await new Promise(r => setTimeout(r, Math.max(0, 1100 - (Date.now() - lastSearch))));
      lastSearch = Date.now();
      const url = new URL('https://nominatim.openstreetmap.org/search');
      for (const [k,v] of Object.entries({q:query, format:'jsonv2', polygon_geojson:'1', countrycodes:'se', limit:'5'})) url.searchParams.set(k,v);
      try {
        const response = await fetch(url, {headers:{'User-Agent':'FlyerMap/0.2 (https://github.com/Sorst72/FlyerMap)'}, signal:AbortSignal.timeout(15000)});
        if (!response.ok) throw new Error('Upstream error');
        const rows = await response.json();
        const results = rows.map(r => ({ name:r.name || r.display_name.split(',')[0], label:r.display_name, geometry:validGeometry(r.geojson) ? r.geojson : null, lat:Number(r.lat), lng:Number(r.lon), source:`OpenStreetMap ${r.osm_type}/${r.osm_id}` }));
        if (searchCache.size >= 100) searchCache.delete(searchCache.keys().next().value);
        searchCache.set(key,results); return results;
      } catch { fail('Platssökningen kunde inte nås. Du kan fortfarande rita kampanjområdet själv.', 502); }
    });
    searchQueue = run.catch(() => {}); return run;
  }
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/places') {
        if (!users.some(u => u.id === req.headers['x-demo-user'])) fail('Välj en demoprofil.',401);
        const results = await searchPlaces(url.searchParams.get('q'));
        res.writeHead(200, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(results)); return;
      }
      if (url.pathname.startsWith('/api/')) {
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 500000) fail('För mycket data.', 413); }
        let body = {};
        if (raw) { try { body = JSON.parse(raw); } catch { fail('Ogiltig JSON.'); } }
        const result = api(req.method, url.pathname, body, req.headers['x-demo-user']);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(result)); return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') fail('Metoden stöds inte.', 405);
      const files = { '/': 'public/index.html', '/app.js': 'public/app.js', '/style.css': 'public/style.css', '/draw/leaflet.draw.js':'node_modules/leaflet-draw/dist/leaflet.draw.js', '/draw/leaflet.draw.css':'node_modules/leaflet-draw/dist/leaflet.draw.css', '/draw/images/spritesheet.svg':'node_modules/leaflet-draw/dist/images/spritesheet.svg', '/draw/images/spritesheet.png':'node_modules/leaflet-draw/dist/images/spritesheet.png', '/draw/images/spritesheet-2x.png':'node_modules/leaflet-draw/dist/images/spritesheet-2x.png', '/leaflet/leaflet.js': 'node_modules/leaflet/dist/leaflet.js', '/leaflet/leaflet.css': 'node_modules/leaflet/dist/leaflet.css' };
      const file = files[url.pathname];
      if (!file) fail('Sidan finns inte.', 404);
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg':'image/svg+xml', '.png':'image/png' };
      res.writeHead(200, { 'Content-Type': types[extname(file)] + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : readFileSync(resolve(root, file)));
    } catch (error) {
      res.writeHead(error.status || 500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: error.status ? error.message : 'Serverfel. Försök igen.' }));
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, process.env.HOST || '127.0.0.1', () => console.log(`FlyerMap demo på port ${port}`));
}
