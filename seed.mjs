/**
 * Sanos y Salvos — Seed script
 * Crea 1 superadmin, 30 ciudadanos, 10 instituciones y 25 reportes.
 * Al finalizar aplica backdate para distribuir registros en 12 meses.
 *
 * Uso:  node seed.mjs
 * Req.: Node 18+ y los servicios corriendo (BFF en localhost:3000).
 */

import { execSync } from 'node:child_process';

const BASE = 'http://localhost:3000';

const ok   = (msg) => console.log(`  ✓ ${msg}`);
const skip = (msg) => console.log(`  · ${msg}`);
const fail = (msg) => console.error(`  ✗ ${msg}`);

/* ── Dígito verificador chileno (módulo 11) ─────────────────────────── */
function dvRUT(n) {
  let s = 0, m = 2;
  while (n > 0) {
    s += (n % 10) * m;
    n = Math.floor(n / 10);
    m = m < 7 ? m + 1 : 2;
  }
  const r = 11 - (s % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}

function formatRUT(n) {
  const d = dvRUT(n);
  const s = String(n);
  const groups = [];
  let rem = s;
  while (rem.length > 3) { groups.unshift(rem.slice(-3)); rem = rem.slice(0, -3); }
  groups.unshift(rem);
  return `${groups.join('.')}-${d}`;
}

/* ── HTTP helpers ────────────────────────────────────────────────────── */
async function postJson(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${url}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, body: json });
  return json?.data ?? json;
}

async function postForm(url, fields, token) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${url}`, { method: 'POST', headers, body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, body: json });
  return json?.data ?? json;
}

/* ── Datos — Ciudadanos (30) ─────────────────────────────────────────
   Formato: [runBase, email, primer_nombre, segundo_nombre,
             apellido_paterno, apellido_materno, region, comuna,
             direccion, telefono]
   El RUN se formatea automáticamente con dvRUT.
   ─────────────────────────────────────────────────────────────────── */
const CIUDADANOS_RAW = [
  // ── Región del Biobío (08) ──
  [12345678, 'felipe.ruiz@example.cl',       'Felipe',    'Andrés',    'Ruiz',      'Muñoz',     '08', 'Concepción',   "Av. O'Higgins 123",         '912345001'],
  [18901234, 'javiera.nunez@example.cl',     'Javiera',   'Alejandra', 'Núñez',     'Pinto',     '08', 'Concepción',   'Chacabuco 800',             '912345014'],
  [10987654, 'matias.castillo@example.cl',   'Matías',    'Alejandro', 'Castillo',  'Medina',    '08', 'Los Ángeles',  'Colo Colo 300',             '912345009'],
  [11098765, 'francisco.meza@example.cl',    'Francisco', 'Javier',    'Meza',      'Figueroa',  '08', 'Talcahuano',   'Av. Los Carrera 1700',      '912345023'],
  [11234567, 'gonzalo.fernandez@example.cl', 'Gonzalo',   'Esteban',   'Fernández', 'Morales',   '08', 'Chillán',      'Av. O\'Higgins 500',        '912345013'],
  // ── Región Metropolitana (13) ──
  [ 9876543, 'maria.gonzalez@example.cl',    'María',     'José',      'González',  'Vega',      '13', 'Santiago',     'Calle Nueva 456',           '912345002'],
  [10111213, 'ana.martinez@example.cl',      'Ana',       'Luisa',     'Martínez',  'Silva',     '13', 'Las Condes',   'Av. Apoquindo 500',         '912345006'],
  [14567890, 'sofia.reyes@example.cl',       'Sofía',     'Andrea',    'Reyes',     'Díaz',      '13', 'Providencia',  'Pedro de Valdivia 400',     '912345010'],
  [19012345, 'isabela.jimenez@example.cl',   'Isabela',   'Fernanda',  'Jiménez',   'Castro',    '13', 'Maipú',        'Américo Vespucio 600',      '912345012'],
  [12468024, 'catalina.morales@example.cl',  'Catalina',  'Rosa',      'Morales',   'Lagos',     '13', 'Pudahuel',     'Los Libertadores 1000',     '912345016'],
  [10246802, 'tomas.ramirez@example.cl',     'Tomás',     'Ignacio',   'Ramírez',   'Quiroz',    '13', 'Ñuñoa',        'Av. Irarrázaval 1300',      '912345019'],
  [19876543, 'nicole.rojas@example.cl',      'Nicole',    'Andrea',    'Rojas',     'Contreras', '13', 'Vitacura',     'Av. Bicentenario 1600',     '912345022'],
  [12987654, 'marco.pizarro@example.cl',     'Marco',     'Antonio',   'Pizarro',   'Alvarado',  '13', 'Puente Alto',  'Av. Concha y Toro 2100',   '912345027'],
  [16321098, 'florencia.caro@example.cl',    'Florencia', 'Isabella',  'Caro',      'Guzmán',    '13', 'La Florida',   'Av. Vicuña Mackenna 2300',  '912345029'],
  // ── Región de Valparaíso (05) ──
  [ 8123456, 'carlos.soto@example.cl',       'Carlos',    'Eduardo',   'Soto',      'Pérez',     '05', 'Valparaíso',   'Los Carrera 789',           '912345003'],
  [17890123, 'pablo.munoz@example.cl',       'Pablo',     'Antonio',   'Muñoz',     'Herrera',   '05', 'Viña del Mar', 'San Martín 500',            '912345011'],
  [16420864, 'paula.iglesias@example.cl',    'Paula',     'Constanza', 'Iglesias',  'Ramos',     '05', 'San Antonio',  'Puerto 1200',               '912345018'],
  [14109876, 'camilo.araya@example.cl',      'Camilo',    'Esteban',   'Araya',     'Soto',      '05', 'Viña del Mar', 'Av. Libertad 2200',         '912345028'],
  // ── Región de La Araucanía (09) ──
  [15678901, 'valentina.mora@example.cl',    'Valentina', 'Isabel',    'Mora',      'Campos',    '09', 'Temuco',       'Arturo Prat 321',           '912345004'],
  [14802468, 'sebastian.torres@example.cl',  'Sebastián', 'Miguel',    'Torres',    'Vega',      '09', 'Temuco',       'Lautaro 1100',              '912345017'],
  [ 7890123, 'ignacio.lara@example.cl',      'Ignacio',   'Rodrigo',   'Lara',      'Benítez',   '09', 'Pucón',        "Av. O'Higgins 2400",        '912345030'],
  // ── Región de Tarapacá (01) ──
  [ 7654321, 'diego.lopez@example.cl',       'Diego',     'Sebastián', 'López',     'Torres',    '01', 'Iquique',      'Baquedano 654',             '912345005'],
  [ 8567890, 'amalia.bravo@example.cl',      'Amalia',    'Cristina',  'Bravo',     'Cerda',     '01', 'Alto Hospicio','Villa Primavera 200',       '912345031'],
  // ── Región de Coquimbo (04) ──
  [13456789, 'roberto.herrera@example.cl',   'Roberto',   'Carlos',    'Herrera',   'Fuentes',   '04', 'La Serena',    'Av. del Mar 100',           '912345007'],
  [15432109, 'daniela.fuentes@example.cl',   'Daniela',   'Paz',       'Fuentes',   'Aguilera',  '04', 'Coquimbo',     'Av. Costanera 1800',        '912345024'],
  // ── Región del Maule (07) ──
  [16789012, 'camila.vargas@example.cl',     'Camila',    'Patricia',  'Vargas',    'Rojas',     '07', 'Talca',        'Norte 4 Poniente 200',      '912345008'],
  [13121110, 'gabriela.espinoza@example.cl', 'Gabriela',  'Nicole',    'Espinoza',  'Tapia',     '07', 'Curicó',       'Av. Manso de Velasco 1400', '912345020'],
  // ── Otras regiones ──
  [13579135, 'andres.castro@example.cl',     'Andrés',    'Felipe',    'Castro',    'Navarro',   '02', 'Antofagasta',  'Av. Grecia 900',            '912345015'],
  [17123456, 'jose.contreras@example.cl',    'José',      'Manuel',    'Contreras', 'Ríos',      '03', 'Copiapó',      'Atacama 1900',              '912345025'],
  [17654321, 'rodrigo.valdes@example.cl',    'Rodrigo',   'Mauricio',  'Valdés',    'Saavedra',  '10', 'Puerto Montt', 'Costanera 1500',            '912345021'],
];

/* ── Datos — Instituciones (10) ──────────────────────────────────────
   Formato: [rutBase, email, nombre_institucion, razon_social,
             tipo_institucion, region, comuna, direccion, telefono]
   ─────────────────────────────────────────────────────────────────── */
const INSTITUCIONES_RAW = [
  [76354771, 'vet.sanjorge@example.cl',    'Veterinaria San Jorge',       'San Jorge Limitada',             'veterinaria',   '08', 'Concepción',   'Av. Los Carrera 100',              '912346001'],
  [77654321, 'muni.concepcion@example.cl', 'Municipalidad de Concepción', 'Ilustre Municipalidad de Concepcion', 'municipalidad', '08', 'Concepción',   'Plaza de Armas s/n',               '912346002'],
  [65432198, 'vet.losandes@example.cl',    'Clínica Vet Los Andes',       'Los Andes Vet SpA',                  'veterinaria',   '13', 'Las Condes',   'Av. Apoquindo 2000',               '912346003'],
  [78901234, 'muni.valparaiso@example.cl', 'Municipalidad de Valparaíso', 'Ilustre Municipalidad de Valparaiso', 'municipalidad', '05', 'Valparaíso',   'Condell 1490',                     '912346004'],
  [79123456, 'vet.sur@example.cl',         'Veterinaria Sur',             'Vet Sur SpA',                        'veterinaria',   '09', 'Temuco',       'Manuel Montt 500',                 '912346005'],
  [69123456, 'muni.santiago@example.cl',   'Municipalidad de Santiago',   'Ilustre Municipalidad de Santiago',  'municipalidad', '13', 'Santiago',     'Plaza de Armas s/n',               '912346006'],
  [72345678, 'vet.norte@example.cl',       'Veterinaria del Norte',       'Veterinaria Norte Limitada',         'veterinaria',   '01', 'Iquique',      'Héroes de la Concepción 300',      '912346007'],
  [73456789, 'muni.temuco@example.cl',     'Municipalidad de Temuco',     'Ilustre Municipalidad de Temuco',    'municipalidad', '09', 'Temuco',       'Av. Alemania 600',                 '912346008'],
  [74567890, 'vet.poniente@example.cl',    'Clínica Vet Poniente',        'Vet Poniente SpA',                   'veterinaria',   '13', 'Pudahuel',     'Av. Las Industrias 700',           '912346009'],
  [75678901, 'muni.serena@example.cl',     'Municipalidad de La Serena',  'Ilustre Municipalidad de La Serena', 'municipalidad', '04', 'La Serena',    'Prat 446',                         '912346010'],
];

/* ── Construir arrays finales ────────────────────────────────────────── */
const fmtTel = (t) => t.startsWith('+') ? t : `+56${t}`;

const CIUDADANOS = CIUDADANOS_RAW.map(
  ([runBase, email, primer_nombre, segundo_nombre, apellido_paterno, apellido_materno, region, comuna, direccion, telefono]) => ({
    run: formatRUT(runBase), email, primer_nombre, segundo_nombre,
    apellido_paterno, apellido_materno, region, comuna, direccion,
    telefono: fmtTel(telefono), password: 'Test1234!',
  })
);

const INSTITUCIONES = INSTITUCIONES_RAW.map(
  ([rutBase, email, nombre_institucion, razon_social, tipo_institucion, region, comuna, direccion, telefono]) => ({
    rut: formatRUT(rutBase), email, nombre_institucion, razon_social,
    tipo_institucion, region, comuna, direccion, telefono: fmtTel(telefono), password: 'Test1234!',
  })
);

/* ── Datos — Reportes (25) ───────────────────────────────────────────── */
const REPORTES = [
  // ── Perros perdidos ──
  { nombreMascota: 'Firulais', especie: 'PERRO', color: 'Café',          tamanio: 'MEDIANO', tipo: 'PERDIDA',    ubicacionLatitud: '-36.8261', ubicacionLongitud: '-73.0528', direccionReferencia: 'Parque Ecuador, Concepción',          descripcion: 'Muy amigable, se perdió cerca del parque' },
  { nombreMascota: 'Toby',     especie: 'PERRO', color: 'Dorado',        tamanio: 'GRANDE',  tipo: 'PERDIDA',    ubicacionLatitud: '-20.2123', ubicacionLongitud: '-70.1500', direccionReferencia: 'Centro, Iquique',                     descripcion: 'Labrador dorado, collar rojo con placa de identificación' },
  { nombreMascota: 'Cleo',     especie: 'PERRO', color: 'Negro y café',  tamanio: 'PEQUEÑO', tipo: 'PERDIDA',    ubicacionLatitud: '-38.7400', ubicacionLongitud: '-72.5800', direccionReferencia: 'Villa Centinela, Temuco',             descripcion: 'Yorkshire terrier, lleva moño rosa y chip' },
  { nombreMascota: 'Bruno',    especie: 'PERRO', color: 'Marrón',        tamanio: 'GRANDE',  tipo: 'PERDIDA',    ubicacionLatitud: '-29.9045', ubicacionLongitud: '-71.2490', direccionReferencia: 'La Serena centro',                    descripcion: 'Dogo Argentino, lleva collar GPS' },
  { nombreMascota: 'Thor',     especie: 'PERRO', color: 'Negro',         tamanio: 'GRANDE',  tipo: 'PERDIDA',    ubicacionLatitud: '-30.2653', ubicacionLongitud: '-71.2161', direccionReferencia: 'Barrio La Herradura, Coquimbo',       descripcion: 'Rottweiler con antifaz café, muy obediente' },
  { nombreMascota: 'Manchas',  especie: 'PERRO', color: 'Blanco y negro',tamanio: 'MEDIANO', tipo: 'PERDIDA',    ubicacionLatitud: '-34.1703', ubicacionLongitud: '-70.7447', descripcion: 'Dálmata joven sin collar, se perdió durante un sismo' },
  { nombreMascota: 'Kaiser',   especie: 'PERRO', color: 'Café oscuro',   tamanio: 'GRANDE',  tipo: 'PERDIDA',    ubicacionLatitud: '-33.4600', ubicacionLongitud: '-70.6600', direccionReferencia: 'Vitacura, Santiago',                  descripcion: 'Pastor alemán, collar verde con placa "Kaiser"' },
  { nombreMascota: 'Lola',     especie: 'PERRO', color: 'Blanco y negro',tamanio: 'MEDIANO', tipo: 'PERDIDA',    ubicacionLatitud: '-27.3668', ubicacionLongitud: '-70.3323', direccionReferencia: 'Sector El Palomar, Copiapó',          descripcion: 'Border Collie muy activa' },
  // ── Perros encontrados ──
  { nombreMascota: 'Rocky',    especie: 'PERRO', color: 'Negro',         tamanio: 'GRANDE',  tipo: 'ENCONTRADA', ubicacionLatitud: '-33.0472', ubicacionLongitud: '-71.6127', direccionReferencia: 'Cerro Alegre, Valparaíso',            descripcion: 'Bien cuidado y dócil, sin collar' },
  { nombreMascota: 'Max',      especie: 'PERRO', color: 'Café y blanco', tamanio: 'MEDIANO', tipo: 'ENCONTRADA', ubicacionLatitud: '-33.0500', ubicacionLongitud: '-71.6200', descripcion: 'Beagle sin collar, muy sociable y bien alimentado' },
  { nombreMascota: 'Bella',    especie: 'PERRO', color: 'Dorado y blanco',tamanio:'MEDIANO', tipo: 'ENCONTRADA', ubicacionLatitud: '-35.4264', ubicacionLongitud: '-71.6554', direccionReferencia: 'Villa Los Tilos, Talca',              descripcion: 'Cocker spaniel, collar azul sin placa' },
  { nombreMascota: 'Dulce',    especie: 'PERRO', color: 'Beige',         tamanio: 'PEQUEÑO', tipo: 'ENCONTRADA', ubicacionLatitud: '-36.8300', ubicacionLongitud: '-73.0400', descripcion: 'Caniche beige muy limpia y cuidada' },
  // ── Gatos perdidos ──
  { nombreMascota: 'Misi',     especie: 'GATO',  color: 'Gris',          tamanio: 'PEQUEÑO', tipo: 'PERDIDA',    ubicacionLatitud: '-33.4489', ubicacionLongitud: '-70.6693', direccionReferencia: 'Providencia, Santiago',               descripcion: 'Collar azul con cascabel, ojos verdes' },
  { nombreMascota: 'Luna',     especie: 'GATO',  color: 'Blanca',        tamanio: 'PEQUEÑO', tipo: 'PERDIDA',    ubicacionLatitud: '-38.7359', ubicacionLongitud: '-72.5904', direccionReferencia: 'Barrio Pueblo Nuevo, Temuco',         descripcion: 'Mancha negra en la cabeza, muy tímida' },
  { nombreMascota: 'Simba',    especie: 'GATO',  color: 'Naranja',       tamanio: 'MEDIANO', tipo: 'PERDIDA',    ubicacionLatitud: '-33.4700', ubicacionLongitud: '-70.6500', descripcion: 'Gato atigrado muy cariñoso, acostumbrado a estar adentro' },
  { nombreMascota: 'Garfield', especie: 'GATO',  color: 'Naranja rayado',tamanio: 'GRANDE',  tipo: 'PERDIDA',    ubicacionLatitud: '-33.0400', ubicacionLongitud: '-71.6100', direccionReferencia: 'Cerro Barón, Valparaíso',             descripcion: 'Gato gordo muy conocido en el barrio' },
  { nombreMascota: 'León',     especie: 'GATO',  color: 'Negro',         tamanio: 'MEDIANO', tipo: 'PERDIDA',    ubicacionLatitud: '-33.4500', ubicacionLongitud: '-70.6800', direccionReferencia: 'Ñuñoa, Santiago',                    descripcion: 'Castrado, chip N° 900-182-001' },
  { nombreMascota: 'Mochi',    especie: 'GATO',  color: 'Tricolor',      tamanio: 'PEQUEÑO', tipo: 'PERDIDA',    ubicacionLatitud: '-41.4693', ubicacionLongitud: '-72.9424', descripcion: 'Blanco, negro y naranja, muy miedosa' },
  // ── Gatos encontrados ──
  { nombreMascota: 'Nieve',    especie: 'GATO',  color: 'Blanco',        tamanio: 'MEDIANO', tipo: 'ENCONTRADA', ubicacionLatitud: '-33.4800', ubicacionLongitud: '-70.6900', direccionReferencia: 'Maipú, Santiago',                    descripcion: 'Ojos azules, muy tranquilo' },
  // ── Aves ──
  { nombreMascota: 'Periquito',especie: 'AVE',   color: 'Verde y amarillo',tamanio:'PEQUEÑO',tipo: 'PERDIDA',    ubicacionLatitud: '-33.4600', ubicacionLongitud: '-70.6800', descripcion: 'Sabe decir algunas palabras' },
  { nombreMascota: 'Piolín',   especie: 'AVE',   color: 'Amarillo',      tamanio: 'PEQUEÑO', tipo: 'PERDIDA',    ubicacionLatitud: '-23.6509', ubicacionLongitud: '-70.3975', direccionReferencia: 'Antofagasta centro',                 descripcion: 'Canario cantor, escapó por ventana abierta' },
  { nombreMascota: 'Kiwi',     especie: 'AVE',   color: 'Verde',         tamanio: 'PEQUEÑO', tipo: 'PERDIDA',    ubicacionLatitud: '-45.5752', ubicacionLongitud: '-72.0662', direccionReferencia: 'Villa Río Simpson, Coyhaique',       descripcion: 'Cotorra entrenada, responde al nombre' },
  // ── Conejos ──
  { nombreMascota: 'Conchita', especie: 'CONEJO',color: 'Blanca',        tamanio: 'PEQUEÑO', tipo: 'ENCONTRADA', ubicacionLatitud: '-36.8200', ubicacionLongitud: '-73.0600', direccionReferencia: 'Los Presidentes, Concepción',        descripcion: 'Conejo blanco muy manso, encontrado en el jardín' },
  { nombreMascota: 'Pelusa',   especie: 'CONEJO',color: 'Gris',          tamanio: 'PEQUEÑO', tipo: 'PERDIDA',    ubicacionLatitud: '-39.8196', ubicacionLongitud: '-73.2452', direccionReferencia: 'Puerto Montt centro',                descripcion: 'Conejo gris enano, muy cariñoso' },
  { nombreMascota: 'Copito',   especie: 'CONEJO',color: 'Blanco',        tamanio: 'PEQUEÑO', tipo: 'ENCONTRADA', ubicacionLatitud: '-38.7300', ubicacionLongitud: '-72.5900', direccionReferencia: 'Sector Labranza, Temuco',            descripcion: 'Orejas largas, encontrado en jardín de vecino' },
];


/* ── Main ────────────────────────────────────────────────────────────── */
async function main() {
  console.log('🌱  Sanos y Salvos — Seed\n');

  // 1. Ciudadanos
  console.log(`👤  Ciudadanos (${CIUDADANOS.length})`);
  for (const c of CIUDADANOS) {
    try {
      await postForm('/api/users/register/ciudadano', c);
      ok(`${c.primer_nombre} ${c.apellido_paterno} — ${c.region}/${c.comuna}`);
    } catch (e) {
      const msg = JSON.stringify(e.body ?? {});
      if (e.status === 409 || /registrado|already|exist/.test(msg)) {
        skip(`ya existe → ${c.email}`);
      } else {
        fail(`${c.email}: ${e.message} — ${msg}`);
      }
    }
  }

  // 2. Instituciones
  console.log(`\n🏢  Instituciones (${INSTITUCIONES.length})`);
  for (const i of INSTITUCIONES) {
    try {
      await postForm('/api/users/register/institucion', i);
      ok(`${i.nombre_institucion} (${i.tipo_institucion}) — ${i.region}/${i.comuna}`);
    } catch (e) {
      const msg = JSON.stringify(e.body ?? {});
      if (e.status === 409 || /registrado|already|exist/.test(msg)) {
        skip(`ya existe → ${i.email}`);
      } else {
        fail(`${i.email}: ${e.message} — ${msg}`);
      }
    }
  }

  // 3. Login (esperar que ms-auth sincronice las credenciales via RabbitMQ)
  console.log('\n⏳  Esperando sincronización ms-auth (4 s)...');
  await new Promise(r => setTimeout(r, 4000));
  console.log('🔑  Login');
  let token;
  try {
    const auth = await postJson('/api/auth/login', {
      email: CIUDADANOS[0].email,
      password: CIUDADANOS[0].password,
    });
    token = auth.accessToken;
    ok(`Sesión iniciada como ${CIUDADANOS[0].email}`);
  } catch (e) {
    fail(`Login fallido: ${e.message} — ${JSON.stringify(e.body ?? {})}`);
    console.error('\n  ⚠  Asegúrate de que ms-auth haya sincronizado las credenciales (puede tardar unos segundos).');
    process.exit(1);
  }

  // 4. Reportes
  console.log(`\n🐾  Reportes (${REPORTES.length})`);
  for (const r of REPORTES) {
    try {
      await postForm('/api/mascotas/reportes', r, token);
      ok(`${r.tipo.padEnd(11)} ${r.especie.padEnd(8)} "${r.nombreMascota}"`);
    } catch (e) {
      fail(`${r.nombreMascota}: ${e.message} — ${JSON.stringify(e.body ?? {})}`);
    }
  }

  // 5. Backdate — distribuir registros en los últimos 12 meses
  console.log('\n📅  Backdateando registros en los últimos 12 meses...');

  const SQL_USERS = `WITH ranked AS (SELECT id, (row_number() OVER (ORDER BY created_at, id) - 1) AS rn, COUNT(*) OVER ()::float AS total FROM users WHERE email LIKE '%@example.cl') UPDATE users SET created_at = DATE_TRUNC('month', NOW()) - (FLOOR(rn * 12.0 / total) * INTERVAL '1 month') + ((rn % 4) * INTERVAL '6 days') FROM ranked WHERE users.id = ranked.id;`;

  const SQL_REPORTES = `WITH ranked AS (SELECT id, (row_number() OVER (ORDER BY fecha_publicacion, id) - 1) AS rn, COUNT(*) OVER ()::float AS total FROM reportes) UPDATE reportes SET fecha_publicacion = DATE_TRUNC('month', NOW()) - (FLOOR(rn * 12.0 / total) * INTERVAL '1 month') + ((rn % 4) * INTERVAL '6 days') FROM ranked WHERE reportes.id = ranked.id;`;

  try {
    const r1 = execSync(`docker exec ms-users-db psql -U postgres -d ms_users -c "${SQL_USERS}"`, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    const m1 = r1.match(/UPDATE (\d+)/);
    ok(`users.created_at backdateado — ${m1?.[1] ?? '?'} filas`);
  } catch (e) {
    fail(`Backdate ms-users: ${e.stderr?.trim() || e.message}`);
  }

  try {
    const r2 = execSync(`docker exec postgres-mascotas psql -U postgres -d ms_mascotas -c "${SQL_REPORTES}"`, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    const m2 = r2.match(/UPDATE (\d+)/);
    ok(`reportes.fecha_publicacion backdateado — ${m2?.[1] ?? '?'} filas`);
  } catch (e) {
    fail(`Backdate ms-mascotas: ${e.stderr?.trim() || e.message}`);
  }

  // 6. Superadmin
  console.log('\n👑  Creando superadmin...');

  const SUPER_EMAIL = 'superadmin@sanos.cl';
  const SUPER_PASS  = 'Admin1234!';
  const SUPER_RUN_BASE = 20000001;
  const SUPER_RUN = `${SUPER_RUN_BASE}-${dvRUT(SUPER_RUN_BASE)}`;

  // Registrar como ciudadano (único endpoint público)
  const fdSuper = new FormData();
  for (const [k, v] of Object.entries({
    email: SUPER_EMAIL, password: SUPER_PASS,
    primer_nombre: 'Super', segundo_nombre: '',
    apellido_paterno: 'Admin', apellido_materno: '',
    run: SUPER_RUN, telefono: '+56920000000',
    region: '13', comuna: 'Santiago', direccion: 'Plaza de Armas s/n',
  })) fdSuper.append(k, v);

  try {
    const res = await fetch(`${BASE}/api/users/register/ciudadano`, { method: 'POST', body: fdSuper });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      ok(`Superadmin registrado (${SUPER_EMAIL})`);
    } else if (res.status === 409 || JSON.stringify(json).match(/registrado|already|exist/i)) {
      skip(`Superadmin ya existe — actualizando rol de todas formas`);
    } else {
      fail(`Registro superadmin: HTTP ${res.status} — ${JSON.stringify(json)}`);
    }
  } catch (e) {
    fail(`Registro superadmin: ${e.message}`);
  }

  // Esperar sync RabbitMQ → ms-auth
  await new Promise(r => setTimeout(r, 3000));

  // Actualizar rol en ambas BDs
  const sqlSuperUsers = `UPDATE users SET rol='superadmin' WHERE email='${SUPER_EMAIL}';`;
  const sqlSuperAuth  = `UPDATE credentials SET role='superadmin' WHERE email='${SUPER_EMAIL}';`;

  try {
    const out = execSync(`docker exec ms-users-db psql -U postgres -d ms_users -c "${sqlSuperUsers}"`, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    if (out.includes('UPDATE 1')) ok('Rol superadmin aplicado en ms-users');
    else fail(`ms-users: ${out.trim()}`);
  } catch (e) { fail(`ms-users rol: ${e.stderr?.trim() || e.message}`); }

  try {
    const out = execSync(`docker exec ms-auth-db psql -U postgres -d ms_auth -c "${sqlSuperAuth}"`, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    if (out.includes('UPDATE 1')) ok('Role superadmin aplicado en ms-auth');
    else if (out.includes('UPDATE 0')) fail('Credencial aún no sincronizada en ms-auth — corre "node seed-superadmin.mjs" si persiste');
    else fail(`ms-auth: ${out.trim()}`);
  } catch (e) { fail(`ms-auth rol: ${e.stderr?.trim() || e.message}`); }

  // ── Resumen final ─────────────────────────────────────────────────
  console.log('\n✅  Seed completado.');
  console.log(`   1 superadmin · ${CIUDADANOS.length} ciudadanos · ${INSTITUCIONES.length} instituciones · ${REPORTES.length} reportes · backdate aplicado`);

  console.log('\n' + '─'.repeat(62));
  console.log('  USUARIOS CREADOS');
  console.log('─'.repeat(62));

  console.log('\n  👑 Superadmin');
  console.log(`     ${SUPER_EMAIL.padEnd(38)} Admin1234!`);

  console.log('\n  👤 Ciudadanos');
  for (const c of CIUDADANOS) {
    console.log(`     ${c.email.padEnd(38)} ${c.password}`);
  }

  console.log('\n  🏢 Instituciones');
  for (const i of INSTITUCIONES) {
    console.log(`     ${i.email.padEnd(38)} ${i.password}`);
  }

  console.log('\n' + '─'.repeat(62) + '\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
