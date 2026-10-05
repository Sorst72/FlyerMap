import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
const templates = [
  { id: 'vasaparken', name: 'Vasaparken', priority: 'Hög', instructions: 'Exempelområde. Registrera endast den del du faktiskt har delat ut.', polygon: [[59.340,18.035],[59.343,18.035],[59.343,18.043],[59.340,18.043]] },
  { id: 'odenplan', name: 'Odenplan', priority: 'Normal', instructions: 'Exempelområde runt Odenplan.', polygon: [[59.341,18.045],[59.345,18.045],[59.345,18.053],[59.341,18.053]] },
  { id: 'observatorielunden', name: 'Observatorielunden', priority: 'Hög', instructions: 'Exempelområde. Undvik överlapp med tidigare utdelning.', polygon: [[59.337,18.050],[59.340,18.050],[59.340,18.057],[59.337,18.057]] }
];
export function createApp({ dataFile = resolve(root, '.data/state.json') } = {}) {
  let state = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : {
    campaigns: [{ id: 'demo', name: 'Höstkampanj · demo', active: true, areas: structuredClone(templates) }],
    reservations: [], passes: []
  };
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
      const campaign = { id: randomUUID(), name: body.name.trim(), active: true, areas: structuredClone(templates) };
      state.campaigns.push(campaign); persist(); return campaign;
    }
    const campaign = state.campaigns.find(c => c.id === body.campaignId);
    if (!campaign || !campaign.active) fail('Kampanjen är inte aktiv.', 409);
    if (path === '/api/campaigns/close') {
      if (user.role !== 'admin') fail('Endast admin kan avsluta kampanjer.', 403);
      campaign.active = false; persist(); return campaign;
    }
    const area = campaign.areas.find(a => a.id === body.areaId);
    if (!area) fail('Området finns inte.');
    const now = Date.now();
    const reservation = state.reservations.find(r => r.campaignId === campaign.id && r.areaId === area.id && Date.parse(r.until) > now);
    if (path === '/api/areas/update') {
      if (user.role !== 'admin') fail('Endast admin kan ändra prioritet.', 403);
      if (!['Hög', 'Normal', 'Låg'].includes(body.priority) || typeof body.instructions !== 'string' || body.instructions.length > 1000) fail('Ogiltig prioritet eller instruktion.');
      area.priority = body.priority; area.instructions = body.instructions; persist(); return area;
    }
    if (path === '/api/reservations') {
      const until = Date.parse(body.until);
      if (!Number.isFinite(until) || until <= now || until > now + 31 * 86400000) fail('Välj ett slutdatum inom 31 dagar.');
      if (reservation) fail('Området är redan paxat. Uppdatera kartan.', 409);
      if (state.passes.some(p => p.campaignId === campaign.id && p.areaId === area.id && p.complete)) fail('Området är redan klart.', 409);
      const r = { id: randomUUID(), campaignId: campaign.id, areaId: area.id, userId, until: new Date(until).toISOString() };
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
      const pass = { id: body.id, campaignId: campaign.id, areaId: area.id, userId, flyers: body.flyers, complete: body.complete, notes: body.notes, deliveredAt: new Date(body.deliveredAt).toISOString(), uploadedAt: new Date(now).toISOString() };
      state.passes.push(pass);
      if (pass.complete) reservation.until = new Date(now).toISOString();
      persist(); return pass;
    }
    fail('Sidan finns inte.', 404);
  }
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 16000) fail('För mycket data.', 413); }
        let body = {};
        if (raw) { try { body = JSON.parse(raw); } catch { fail('Ogiltig JSON.'); } }
        const result = api(req.method, url.pathname, body, req.headers['x-demo-user']);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(result)); return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') fail('Metoden stöds inte.', 405);
      const files = { '/': 'public/index.html', '/app.js': 'public/app.js', '/style.css': 'public/style.css', '/leaflet/leaflet.js': 'node_modules/leaflet/dist/leaflet.js', '/leaflet/leaflet.css': 'node_modules/leaflet/dist/leaflet.css' };
      const file = files[url.pathname];
      if (!file) fail('Sidan finns inte.', 404);
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
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
