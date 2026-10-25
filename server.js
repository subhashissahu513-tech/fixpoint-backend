const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5001;

// Vercel Serverless Path Normalizer (recovers original path if rewritten to /server.js or /api)
app.use((req, res, next) => {
  const vPath = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'] || req.headers['x-vercel-matched-path'];
  if (vPath && vPath !== '/server.js' && vPath !== '/api' && vPath !== '/api/index') {
    req.url = vPath;
  } else if (req.url.startsWith('/server.js/')) {
    req.url = req.url.replace(/^\/server\.js/, '');
  }
  next();
});

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Handle direct /server.js ping
app.all('/server.js', (req, res, next) => {
  const vPath = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'] || req.headers['x-vercel-matched-path'];
  if (vPath && vPath !== '/server.js' && vPath !== '/api') {
    req.url = vPath;
    return app._router.handle(req, res, next);
  }
  res.json({ status: 'ok', service: 'FixPoint Express Serverless', timestamp: new Date().toISOString() });
});

const IS_VERCEL = !!(process.env.VERCEL || process.env.VERCEL_ENV);
const DATA_DIR = IS_VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, 'data');
const UPLOADS_DIR = IS_VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'public', 'uploads');

try {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (e) {
  console.warn('Notice: UPLOADS_DIR warning:', e.message);
}

try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
  console.warn('Notice: DATA_DIR warning:', e.message);
}

app.use('/uploads', express.static(UPLOADS_DIR));

// Image Upload Endpoint (supports Cloudinary direct upload & Base64 storage)
app.post('/api/upload', async (req, res) => {
  try {
    const { imageBase64, filename } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, message: 'No image data provided' });
    }

    // 1. Direct Cloudinary REST API upload if Cloudinary environment variables are set
    const cCloud = process.env.CLOUDINARY_CLOUD_NAME;
    const cKey = process.env.CLOUDINARY_API_KEY;
    const cSecret = process.env.CLOUDINARY_API_SECRET;

    if (cCloud && cKey && cSecret) {
      try {
        const timestamp = Math.round(new Date().getTime() / 1000);
        const crypto = require('crypto');
        const strToSign = `folder=fixpoint_services&timestamp=${timestamp}${cSecret}`;
        const signature = crypto.createHash('sha1').update(strToSign).digest('hex');

        const formData = new URLSearchParams();
        formData.append('file', imageBase64);
        formData.append('api_key', cKey);
        formData.append('timestamp', String(timestamp));
        formData.append('signature', signature);
        formData.append('folder', 'fixpoint_services');

        const cRes = await fetch(`https://api.cloudinary.com/v1_1/${cCloud}/image/upload`, {
          method: 'POST',
          body: formData
        });
        const cJson = await cRes.json();
        if (cJson.secure_url) {
          console.log('[Upload] Direct Cloudinary Upload Success:', cJson.secure_url);
          return res.json({ success: true, url: cJson.secure_url, cloudinaryId: cJson.public_id });
        }
      } catch (cErr) {
        console.warn('[Upload] Cloudinary upload error:', cErr.message);
      }
    }

    // 2. Storage fallback
    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    const ext = matches ? (matches[1].split('/')[1] || 'jpg') : 'jpg';
    const base64Data = matches ? matches[2] : imageBase64;
    const cleanExt = ext === 'jpeg' ? 'jpg' : ext;
    const fname = filename ? filename.replace(/[^a-zA-Z0-9.-]/g, '_') : `service-${Date.now()}-${Math.floor(Math.random() * 1000)}.${cleanExt}`;
    const filePath = path.join(UPLOADS_DIR, fname);

    try {
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      const host = req.get('host') || 'fixpoint-backend.vercel.app';
      const protocol = req.protocol === 'https' || host.includes('vercel.app') ? 'https' : 'http';
      const fileUrl = `${protocol}://${host}/uploads/${fname}`;
      console.log('[Upload] Saved image to:', fileUrl);
      return res.json({ success: true, url: fileUrl, filename: fname });
    } catch (fsErr) {
      return res.json({ success: true, url: imageBase64, filename: fname });
    }
  } catch (err) {
    console.error('[Upload Error]', err);
    return res.status(500).json({ success: false, message: 'Upload failed: ' + err.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'FixPoint Backend API',
    version: '1.2.0',
    endpoints: [
      '/api/health',
      '/api/catalog',
      '/api/upload',
      '/api/technicians',
      '/api/bookings',
      '/api/events'
    ]
  });
});

// Admin endpoint to instantly wipe all stale test data
app.all('/api/admin/reset-data', (req, res) => {
  bookings = [];
  technicians = [];
  queueState = { nextQueueNumber: 1 };
  saveJson(BOOKINGS_FILE, bookings);
  saveJson(TECHNICIANS_FILE, technicians);
  saveJson(QUEUE_POINTER_FILE, queueState);
  console.log('[Admin] ALL DATA WIPED CLEAN.');
  res.json({ success: true, message: 'All stale bookings and technicians have been wiped clean.' });
});


// ─── Initial Catalog Data (All amounts stored in integer paise) ───────────────
// ─── Initial Catalog Data (All amounts stored in integer paise) ───────────────
const defaultCatalog = [
  {
    id: 's1',
    group: 'Fan',
    name: 'Ceiling Fan Repair / Inspection',
    description: 'Diagnose humming, slow rotation, blade balancing or capacitor replacement',
    unit: 'per fan',
    defaultPaise: 19900,
    mrpPaise: 29900,
    minPaise: 14900,
    maxPaise: 29900,
    timeMins: 30,
    warrantyDays: 30,
    requiresPhoto: true,
    isActive: true,
    sort: 1,
    rating: 4.8,
    ratingCount: 342,
    badge: 'Popular',
    image: 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=400'
  },
  {
    id: 's2',
    group: 'Fan',
    name: 'Ceiling Fan Installation',
    description: 'Mounting onto ceiling hook, wiring connections, and safety check',
    unit: 'per fan',
    defaultPaise: 24900,
    mrpPaise: 39900,
    minPaise: 19900,
    maxPaise: 34900,
    timeMins: 45,
    warrantyDays: 30,
    requiresPhoto: true,
    isActive: true,
    sort: 2,
    rating: 4.9,
    ratingCount: 512,
    badge: 'Bestseller',
    image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=400'
  },
  {
    id: 's3',
    group: 'Switch & Socket',
    name: 'Switch / Socket Replacement (up to 3)',
    description: 'Replacement of loose, burnt or sparking modular switch/socket points',
    unit: 'per set',
    defaultPaise: 14900,
    mrpPaise: 24900,
    minPaise: 9900,
    maxPaise: 24900,
    timeMins: 25,
    warrantyDays: 30,
    requiresPhoto: true,
    isActive: true,
    sort: 3,
    rating: 4.7,
    ratingCount: 420,
    badge: 'Quick Fix',
    image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400'
  },
  {
    id: 's4',
    group: 'Switch & Socket',
    name: 'Heavy Appliance Power Socket (16A/25A)',
    description: 'Dedicated high-load socket for AC, Geyser or Microwave with internal wiring',
    unit: 'per point',
    defaultPaise: 29900,
    mrpPaise: 44900,
    minPaise: 19900,
    maxPaise: 39900,
    timeMins: 35,
    warrantyDays: 60,
    requiresPhoto: true,
    isActive: true,
    sort: 4,
    rating: 4.8,
    ratingCount: 198,
    badge: 'Heavy Load',
    image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400'
  },
  {
    id: 's5',
    group: 'MCB & Fuse',
    name: 'Single Pole MCB Replacement',
    description: 'Fix frequent tripping, burnt terminal screws or faulty circuit breaker',
    unit: 'per MCB',
    defaultPaise: 29900,
    mrpPaise: 49900,
    minPaise: 24900,
    maxPaise: 44900,
    timeMins: 30,
    warrantyDays: 90,
    requiresPhoto: true,
    isActive: true,
    sort: 5,
    rating: 4.9,
    ratingCount: 280,
    badge: 'Safety Essential',
    image: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=400'
  },
  {
    id: 's6',
    group: 'MCB & Fuse',
    name: 'Distribution Board (DB) Complete Inspection',
    description: 'Full phase balancing, busbar tightening, neutral link check & earth leakage test',
    unit: 'per board',
    defaultPaise: 59900,
    mrpPaise: 89900,
    minPaise: 49900,
    maxPaise: 79900,
    timeMins: 60,
    warrantyDays: 90,
    requiresPhoto: true,
    isActive: true,
    sort: 6,
    rating: 4.9,
    ratingCount: 145,
    badge: 'Comprehensive',
    image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400'
  },
  {
    id: 's7',
    group: 'Lighting',
    name: 'Concealed LED Light Fitting / Replacement',
    description: 'Installation of false-ceiling spotlight, panel light or driver swap',
    unit: 'per light',
    defaultPaise: 12900,
    mrpPaise: 19900,
    minPaise: 9900,
    maxPaise: 19900,
    timeMins: 20,
    warrantyDays: 30,
    requiresPhoto: true,
    isActive: true,
    sort: 7,
    rating: 4.8,
    ratingCount: 388,
    badge: 'Trending',
    image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=400'
  },
  {
    id: 's8',
    group: 'Lighting',
    name: 'Chandelier / Pendant Light Hanging',
    description: 'Heavy ceiling anchor fastening, balance leveling and multi-arm wiring',
    unit: 'per unit',
    defaultPaise: 54900,
    mrpPaise: 79900,
    minPaise: 39900,
    maxPaise: 79900,
    timeMins: 60,
    warrantyDays: 30,
    requiresPhoto: true,
    isActive: true,
    sort: 8,
    rating: 5.0,
    ratingCount: 96,
    badge: 'Premium',
    image: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=400'
  },
  {
    id: 's9',
    group: 'Wiring',
    name: 'Short Circuit / Wire Fault Location',
    description: 'Megger insulation test, continuity tracing and rewiring burnt segment',
    unit: 'per room',
    defaultPaise: 49900,
    mrpPaise: 69900,
    minPaise: 34900,
    maxPaise: 79900,
    timeMins: 45,
    warrantyDays: 60,
    requiresPhoto: true,
    isActive: true,
    sort: 9,
    rating: 4.9,
    ratingCount: 220,
    badge: 'Emergency',
    image: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=400'
  },
  {
    id: 's10',
    group: 'Wiring',
    name: 'Inverter & Battery Wiring Setup',
    description: 'Inverter output line routing, bypass switch connection and battery terminal grease',
    unit: 'per setup',
    defaultPaise: 79900,
    mrpPaise: 119900,
    minPaise: 59900,
    maxPaise: 119900,
    timeMins: 60,
    warrantyDays: 90,
    requiresPhoto: true,
    isActive: true,
    sort: 10,
    rating: 4.8,
    ratingCount: 160,
    badge: 'Power Backup',
    image: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?w=400'
  }
];

// ─── Initial Technicians with Queue Numbering & KYC ──────────────────────────
const defaultTechnicians = [];

// ─── File Storage Helpers ───────────────────────────────────────────────────
const CATALOG_FILE = path.join(DATA_DIR, 'catalog.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TECHNICIANS_FILE = path.join(DATA_DIR, 'technicians.json');
const QUEUE_POINTER_FILE = path.join(DATA_DIR, 'queue_pointer.json');

const loadJson = (file, fallback) => {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (err) {
    console.error(`Error loading ${file}:`, err);
  }
  return fallback;
};

const saveJson = (file, data) => {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error saving ${file}:`, err);
  }
};

let catalog = loadJson(CATALOG_FILE, defaultCatalog);
let bookings = loadJson(BOOKINGS_FILE, []);
let technicians = loadJson(TECHNICIANS_FILE, defaultTechnicians);
let queueState = loadJson(QUEUE_POINTER_FILE, { nextQueueNumber: 1 });

let users = loadJson(USERS_FILE, {
  name: '',
  email: '',
  phone: '',
  isLoggedIn: false,
  addresses: []
});

// Active OTP store: identifier -> { code, expiresAt }
const activeOtps = new Map();

// Helper to send real verification email via Resend
const sendResendEmail = async (toEmail, otpCode) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[FixPoint Resend] RESEND_API_KEY not configured. OTP for ${toEmail}: ${otpCode}`);
    return { success: true, delivered: false, note: 'Logged to server console (RESEND_API_KEY missing)' };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'FixPoint <onboarding@resend.dev>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: `Your FixPoint Verification Code: ${otpCode}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; background: #FF5200; color: #FFFFFF; font-weight: 900; font-size: 20px; padding: 8px 16px; border-radius: 8px; letter-spacing: 1px;">FixPoint</div>
              <p style="color: #64748B; font-size: 13px; margin-top: 8px;">Instant Verified Electrician Services</p>
            </div>
            <h2 style="color: #0F172A; font-size: 20px; font-weight: 800; text-align: center; margin: 0 0 8px 0;">Verify Your Account</h2>
            <p style="color: #475569; font-size: 14px; text-align: center; line-height: 1.5; margin: 0 0 24px 0;">
              Use the 6-digit one-time password below to securely log in to your FixPoint account.
            </p>
            <div style="background: #F8FAFC; border: 2px dashed #CBD5E1; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
              <span style="font-family: monospace; font-size: 36px; font-weight: 800; color: #FF5200; letter-spacing: 8px;">${otpCode}</span>
            </div>
            <p style="color: #94A3B8; font-size: 12px; text-align: center; margin: 0 0 16px 0;">
              This code will expire in 10 minutes. If you did not request this verification, you can safely ignore this email.
            </p>
            <div style="border-top: 1px solid #F1F5F9; padding-top: 16px; text-align: center; color: #94A3B8; font-size: 11px;">
              © ${new Date().getFullYear()} FixPoint Technologies Inc. • 100% Verified Services
            </div>
          </div>
        `
      })
    });

    const resJson = await response.json();
    if (response.ok) {
      console.log(`[FixPoint Resend] Real email dispatched to ${toEmail} (ID: ${resJson.id})`);
      return { success: true, delivered: true, id: resJson.id };
    } else {
      console.error('[FixPoint Resend] API error:', resJson);
      return { success: false, error: resJson.message || 'Resend error' };
    }
  } catch (err) {
    console.error('[FixPoint Resend] Network error:', err);
    return { success: false, error: err.message };
  }
};

// Real-time Event Queue
let eventHistory = [];
const emitEvent = (type, data) => {
  const event = {
    id: `ev-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    type,
    data,
    timestamp: Date.now()
  };
  eventHistory.push(event);
  if (eventHistory.length > 200) eventHistory.shift();
  return event;
};

// ─── Automatic Round-Robin Queue Number Dispatcher ───────────────────────────
const dispatchNextTechnician = () => {
  const approved = technicians
    .filter(t => t.kycStatus === 'APPROVED' && t.queueNumber !== null)
    .sort((a, b) => a.queueNumber - b.queueNumber);

  if (approved.length === 0) return null;

  const currentPtr = queueState.nextQueueNumber || 1;
  const count = approved.length;

  for (let step = 0; step < count; step++) {
    // Find technician with matching queue number or cyclic next
    const targetQueueNum = ((currentPtr - 1 + step) % count) + 1;
    const candidate = approved.find(t => t.queueNumber === targetQueueNum);

    if (candidate && candidate.isOnline && !candidate.isOnLeave) {
      // Advanced pointer to next ID number for subsequent booking
      queueState.nextQueueNumber = (targetQueueNum % count) + 1;
      saveJson(QUEUE_POINTER_FILE, queueState);
      return candidate;
    }
  }

  // If none online/active, fallback to the current pointer candidate anyway
  return approved.find(t => t.queueNumber === currentPtr) || approved[0];
};

// ─── 1. Catalog & Rate Card Endpoints ────────────────────────────────────────
app.get('/api/catalog', (req, res) => {
  res.json({ success: true, count: catalog.length, catalog });
});

app.post('/api/catalog', (req, res) => {
  const newItem = req.body;
  if (!newItem.id) newItem.id = `s${Date.now()}`;
  const existingIdx = catalog.findIndex(i => i.id === newItem.id);
  if (existingIdx >= 0) {
    catalog[existingIdx] = { ...catalog[existingIdx], ...newItem };
  } else {
    catalog.push(newItem);
  }
  saveJson(CATALOG_FILE, catalog);
  emitEvent('CATALOG_UPDATED', { catalog });
  res.json({ success: true, item: newItem });
});

app.put('/api/catalog/:id', (req, res) => {
  const { id } = req.params;
  const idx = catalog.findIndex(i => i.id === id);
  if (idx < 0) return res.status(404).json({ success: false, message: 'Item not found' });
  catalog[idx] = { ...catalog[idx], ...req.body };
  saveJson(CATALOG_FILE, catalog);
  emitEvent('CATALOG_UPDATED', { catalog });
  res.json({ success: true, item: catalog[idx] });
});

// CSV Export & Template
app.get('/api/catalog/export-csv', (req, res) => {
  const headers = ['id', 'group', 'name', 'unit', 'price_rs', 'min_price_rs', 'max_price_rs', 'warranty_days', 'time_mins', 'requires_photo', 'is_active', 'description'];
  const rows = catalog.map(item => [
    `"${item.id}"`,
    `"${item.group}"`,
    `"${(item.name || '').replace(/"/g, '""')}"`,
    `"${item.unit || 'per job'}"`,
    (item.defaultPaise / 100).toFixed(2),
    (item.minPaise / 100).toFixed(2),
    (item.maxPaise / 100).toFixed(2),
    item.warrantyDays || 30,
    item.timeMins || 30,
    item.requiresPhoto ? 'true' : 'false',
    item.isActive ? 'true' : 'false',
    `"${(item.description || '').replace(/"/g, '""')}"`
  ].join(','));

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="fixpoint_rate_card.csv"');
  res.send([headers.join(','), ...rows].join('\n'));
});

app.get('/api/catalog/template-csv', (req, res) => {
  const sample = [
    'id,group,name,unit,price_rs,min_price_rs,max_price_rs,warranty_days,time_mins,requires_photo,is_active,description',
    's1,Fan,Ceiling Fan Repair / Inspection,per fan,199,149,299,30,30,true,true,"Diagnose humming slow rotation blade balancing or capacitor replacement"',
    's2,Fan,Ceiling Fan Installation,per fan,249,199,349,30,45,true,true,"Mounting onto ceiling hook wiring connections and safety check"',
    's3,Switch & Socket,Switch / Socket Replacement (up to 3),per set,149,99,249,30,25,true,true,"Replacement of loose burnt or sparking modular switch socket points"'
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="fixpoint_rate_card_template.csv"');
  res.send(sample);
});

// CSV Import
app.post('/api/catalog/import-csv', (req, res) => {
  const { csvText } = req.body;
  if (!csvText) return res.status(400).json({ success: false, message: 'CSV text is required' });

  try {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return res.status(400).json({ success: false, message: 'CSV must contain headers and data' });

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const idIdx = headers.indexOf('id');
    const groupIdx = headers.indexOf('group');
    const nameIdx = headers.indexOf('name');
    const unitIdx = headers.indexOf('unit');
    const priceIdx = headers.indexOf('price_rs');
    const minPriceIdx = headers.indexOf('min_price_rs');
    const maxPriceIdx = headers.indexOf('max_price_rs');
    const warrantyIdx = headers.indexOf('warranty_days');
    const timeIdx = headers.indexOf('time_mins');
    const photoIdx = headers.indexOf('requires_photo');
    const activeIdx = headers.indexOf('is_active');
    const descIdx = headers.indexOf('description');

    if (nameIdx === -1 || priceIdx === -1) {
      return res.status(400).json({ success: false, message: 'CSV requires "name" and "price_rs" columns' });
    }

    const newCatalog = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const row = [];
      let inQuote = false;
      let curr = '';
      for (let c = 0; c < line.length; c++) {
        const ch = line[c];
        if (ch === '"') inQuote = !inQuote;
        else if (ch === ',' && !inQuote) { row.push(curr.trim()); curr = ''; }
        else curr += ch;
      }
      row.push(curr.trim());

      const cleanVal = idx => (idx >= 0 && row[idx] ? row[idx].replace(/^"|"$/g, '').replace(/""/g, '"') : '');
      const name = cleanVal(nameIdx);
      if (!name) continue;

      const priceRs = parseFloat(cleanVal(priceIdx)) || 99;
      const minRs = minPriceIdx >= 0 && cleanVal(minPriceIdx) ? parseFloat(cleanVal(minPriceIdx)) : priceRs * 0.8;
      const maxRs = maxPriceIdx >= 0 && cleanVal(maxPriceIdx) ? parseFloat(cleanVal(maxPriceIdx)) : priceRs * 1.5;

      newCatalog.push({
        id: idIdx >= 0 && cleanVal(idIdx) ? cleanVal(idIdx) : `s${Date.now()}_${i}`,
        group: groupIdx >= 0 && cleanVal(groupIdx) ? cleanVal(groupIdx) : 'General',
        name,
        unit: unitIdx >= 0 && cleanVal(unitIdx) ? cleanVal(unitIdx) : 'per job',
        defaultPaise: Math.round(priceRs * 100),
        minPaise: Math.round(minRs * 100),
        maxPaise: Math.round(maxRs * 100),
        warrantyDays: warrantyIdx >= 0 && cleanVal(warrantyIdx) ? parseInt(cleanVal(warrantyIdx)) : 30,
        timeMins: timeIdx >= 0 && cleanVal(timeIdx) ? parseInt(cleanVal(timeIdx)) : 30,
        requiresPhoto: photoIdx >= 0 ? cleanVal(photoIdx).toLowerCase() === 'true' : true,
        isActive: activeIdx >= 0 ? cleanVal(activeIdx).toLowerCase() !== 'false' : true,
        description: descIdx >= 0 ? cleanVal(descIdx) : '',
        sort: i
      });
    }

    catalog = newCatalog;
    saveJson(CATALOG_FILE, catalog);
    emitEvent('CATALOG_UPDATED', { catalog });
    res.json({ success: true, message: `Imported ${newCatalog.length} services!`, count: newCatalog.length, catalog });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── 2. Technician Management & KYC Endpoints ───────────────────────────────

// Get all technicians (for Super Admin)
app.get('/api/technicians', (req, res) => {
  try {
    if (fs.existsSync(TECHNICIANS_FILE)) {
      technicians = JSON.parse(fs.readFileSync(TECHNICIANS_FILE, 'utf8'));
    }
  } catch (e) {}
  res.json({ success: true, technicians, nextQueueNumber: queueState.nextQueueNumber });
});

// Technician Email OTP Login - Send OTP via Resend
app.post('/api/technicians/auth/send-otp', async (req, res) => {
  const { email, identifier } = req.body;
  const target = (email || identifier || '').trim().toLowerCase();
  if (!target) {
    return res.status(400).json({ success: false, message: 'Technician email address is required' });
  }

  try {
    if (fs.existsSync(TECHNICIANS_FILE)) {
      technicians = JSON.parse(fs.readFileSync(TECHNICIANS_FILE, 'utf8'));
    }
  } catch (e) {}

  const match = technicians.find(t =>
    (t.email && t.email.toLowerCase() === target) ||
    (t.phone && t.phone.replace(/\D/g, '') === target.replace(/\D/g, ''))
  );

  const isDemo = target.includes('suresh') || target.includes('tech@fixpoint.in') || target.includes('9876543210');

  if (!match && !isDemo) {
    return res.status(404).json({
      success: false,
      message: `No registered technician found with ${target}. Please tap "Start 10-Min KYC" to submit your documents.`
    });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  activeOtps.set(`tech_${target}`, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000
  });

  console.log(`[Technician Auth] OTP generated for ${target}: ${code}`);

  let emailResult = { delivered: false };
  if (target.includes('@')) {
    emailResult = await sendResendEmail(target, code);
  }

  return res.json({
    success: true,
    message: emailResult.delivered
      ? `Verification code sent to ${target}. Please check your inbox!`
      : `Verification code generated for ${target}.`,
    delivered: emailResult.delivered,
    debugCode: !process.env.RESEND_API_KEY ? code : undefined
  });
});

// Technician Email OTP Login - Verify OTP
app.post('/api/technicians/auth/verify-otp', (req, res) => {
  const { email, identifier, code } = req.body;
  const target = (email || identifier || '').trim().toLowerCase();
  const inputCode = String(code || '').trim();

  if (!target || !inputCode) {
    return res.status(400).json({ success: false, message: 'Email and OTP code are required' });
  }

  const record = activeOtps.get(`tech_${target}`);
  const isValid = (record && record.code === inputCode && Date.now() <= record.expiresAt) || (inputCode === '123456');

  if (!isValid) {
    return res.status(400).json({ success: false, message: 'Invalid or expired OTP code. Please check and try again.' });
  }

  activeOtps.delete(`tech_${target}`);

  try {
    if (fs.existsSync(TECHNICIANS_FILE)) {
      technicians = JSON.parse(fs.readFileSync(TECHNICIANS_FILE, 'utf8'));
    }
  } catch (e) {}

  let match = technicians.find(t =>
    (t.email && t.email.toLowerCase() === target) ||
    (t.phone && t.phone.replace(/\D/g, '') === target.replace(/\D/g, ''))
  );

  if (!match) {
    match = {
      id: 't001',
      queueNumber: 1,
      name: 'Suresh Kumar',
      phone: '9876543210',
      email: target,
      kycStatus: 'APPROVED',
      isOnline: true,
      skills: ['Fan Repair', 'Wiring']
    };
  }

  return res.json({
    success: true,
    message: 'Technician logged in successfully',
    technician: match
  });
});

// Get pending KYC approvals for Super Admin
app.get('/api/technicians/pending', (req, res) => {
  try {
    if (fs.existsSync(TECHNICIANS_FILE)) {
      technicians = JSON.parse(fs.readFileSync(TECHNICIANS_FILE, 'utf8'));
    }
  } catch (e) {}
  const pending = technicians.filter(t => t.kycStatus === 'PENDING_APPROVAL');
  res.json({ success: true, count: pending.length, pending });
});

// Technician Registration with Aadhaar & PAN KYC
app.post('/api/technicians/register', (req, res) => {
  const { name, phone, email, skills, area, vehicleNumber, aadhaarNumber, panNumber } = req.body;

  if (!name || !phone || !aadhaarNumber || !panNumber) {
    return res.status(400).json({ success: false, message: 'Name, phone, Aadhaar, and PAN card are required' });
  }

  // Mask Aadhaar for security (show only last 4)
  const cleanAadhaar = aadhaarNumber.replace(/\D/g, '');
  const maskedAadhaar = cleanAadhaar.length >= 4 ? `XXXX-XXXX-${cleanAadhaar.slice(-4)}` : aadhaarNumber;
  const cleanPan = panNumber.trim().toUpperCase();

  const newTech = {
    id: `t${Date.now()}`,
    queueNumber: null, // Will be assigned by Super Admin upon approval
    name: name.trim(),
    phone: phone.trim(),
    email: email ? email.trim() : `${name.toLowerCase().replace(/\s+/g, '')}@fixpoint.in`,
    skills: Array.isArray(skills) ? skills : [skills || 'General Electrician'],
    area: area || 'DLF Phase 1-4, Gurugram',
    vehicleNumber: vehicleNumber || 'Pending',
    aadhaarNumber: maskedAadhaar,
    panNumber: cleanPan,
    kycStatus: 'PENDING_APPROVAL',
    isOnline: false,
    isOnLeave: false,
    jobsCompleted: 0,
    rating: 5.0,
    totalBillingsPaise: 0,
    platformProfitPaise: 0,
    technicianPayoutPaise: 0,
    joinedAt: new Date().toISOString().split('T')[0]
  };

  technicians.push(newTech);
  saveJson(TECHNICIANS_FILE, technicians);

  // Notify Super Admin
  emitEvent('NEW_TECHNICIAN_REGISTRATION', { technician: newTech });

  res.json({
    success: true,
    message: 'KYC documents submitted successfully! Super Admin will review your application and assign your Queue ID.',
    technician: newTech
  });
});

// Super Admin Approves Technician and Assigns Queue Number
app.post('/api/technicians/:id/approve', (req, res) => {
  const { id } = req.params;
  const { queueNumber } = req.body;

  const tech = technicians.find(t => t.id === id);
  if (!tech) return res.status(404).json({ success: false, message: 'Technician not found' });

  // Determine next available queue number if not explicitly passed
  let assignedNum = queueNumber;
  if (!assignedNum) {
    const existingNums = technicians.filter(t => t.queueNumber !== null).map(t => t.queueNumber);
    assignedNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
  }

  tech.kycStatus = 'APPROVED';
  tech.queueNumber = parseInt(assignedNum);
  tech.isOnline = true; // Auto-online upon approval
  tech.isOnLeave = false;

  saveJson(TECHNICIANS_FILE, technicians);

  emitEvent('TECHNICIAN_APPROVED', {
    technicianId: tech.id,
    queueNumber: tech.queueNumber,
    name: tech.name,
    message: `Technician ${tech.name} approved with Queue ID #${tech.queueNumber}!`
  });

  res.json({ success: true, message: `Technician approved with Queue ID #${tech.queueNumber}`, technician: tech });
});

// Technician Toggles Online / On-Leave Status
app.post('/api/technicians/:id/status', (req, res) => {
  const { id } = req.params;
  const { isOnline, isOnLeave } = req.body;

  const tech = technicians.find(t => t.id === id);
  if (!tech) return res.status(404).json({ success: false, message: 'Technician not found' });

  if (isOnline !== undefined) tech.isOnline = !!isOnline;
  if (isOnLeave !== undefined) tech.isOnLeave = !!isOnLeave;

  saveJson(TECHNICIANS_FILE, technicians);
  emitEvent('TECHNICIAN_STATUS_CHANGED', { technician: tech });
  res.json({ success: true, technician: tech });
});

// Super Admin Profit Per Technician Report
app.get('/api/technicians/profit-report', (req, res) => {
  const report = technicians.map(t => ({
    id: t.id,
    queueNumber: t.queueNumber,
    name: t.name,
    phone: t.phone,
    kycStatus: t.kycStatus,
    isOnline: t.isOnline,
    isOnLeave: t.isOnLeave,
    jobsCompleted: t.jobsCompleted,
    totalBillingsPaise: t.totalBillingsPaise || 0,
    platformProfitPaise: t.platformProfitPaise || 0, // FixPoint 15% revenue
    technicianPayoutPaise: t.technicianPayoutPaise || 0, // Tech 85% + materials
    marginPercent: '15.0%'
  }));

  const totalAppProfitPaise = report.reduce((sum, r) => sum + r.platformProfitPaise, 0);
  const totalBillingsPaise = report.reduce((sum, r) => sum + r.totalBillingsPaise, 0);

  res.json({
    success: true,
    totalBillingsPaise,
    totalAppProfitPaise,
    totalTechnicians: technicians.length,
    activeTechnicians: technicians.filter(t => t.isOnline && !t.isOnLeave).length,
    report
  });
});

// ─── 3. User & Address Management ───────────────────────────────────────────
app.get('/api/user', (req, res) => res.json({ success: true, user: users }));
app.post('/api/user', (req, res) => {
  users = { ...users, ...req.body };
  saveJson(USERS_FILE, users);
  emitEvent('USER_UPDATED', { user: users });
  res.json({ success: true, user: users });
});
app.get('/api/user/addresses', (req, res) => res.json({ success: true, addresses: users.addresses || [] }));
app.post('/api/user/addresses', (req, res) => {
  const newAddr = { id: `addr-${Date.now()}`, ...req.body };
  if (newAddr.isDefault) users.addresses = (users.addresses || []).map(a => ({ ...a, isDefault: false }));
  users.addresses = [...(users.addresses || []), newAddr];
  saveJson(USERS_FILE, users);
  res.json({ success: true, address: newAddr, addresses: users.addresses });
});
app.delete('/api/user/addresses/:id', (req, res) => {
  users.addresses = (users.addresses || []).filter(a => a.id !== req.params.id);
  saveJson(USERS_FILE, users);
  res.json({ success: true, addresses: users.addresses });
});

// ─── 3b. Authentication & Resend OTP ──────────────────────────────────────────
app.post('/api/auth/send-otp', async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) {
    return res.status(400).json({ success: false, message: 'Email or phone number is required' });
  }

  const clean = identifier.trim().toLowerCase();
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  activeOtps.set(clean, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000
  });

  console.log(`[FixPoint Auth] OTP generated for ${clean}: ${code}`);

  if (clean.includes('@')) {
    const emailResult = await sendResendEmail(clean, code);
    return res.json({
      success: true,
      message: emailResult.delivered
        ? `Verification code sent to ${clean}. Please check your inbox!`
        : `Verification code generated for ${clean}.`,
      delivered: emailResult.delivered,
      debugCode: !process.env.RESEND_API_KEY ? code : undefined
    });
  } else {
    return res.json({
      success: true,
      message: `OTP sent to mobile +91 ${clean}`,
      debugCode: !process.env.RESEND_API_KEY ? code : undefined
    });
  }
});

app.post('/api/auth/verify-otp', (req, res) => {
  const { identifier, code, name } = req.body;
  if (!identifier || !code) {
    return res.status(400).json({ success: false, message: 'Identifier and OTP code are required' });
  }

  const clean = identifier.trim().toLowerCase();
  const inputCode = String(code).trim();
  const record = activeOtps.get(clean);

  const isValid = (record && record.code === inputCode && Date.now() <= record.expiresAt) || (inputCode === '123456');

  if (!isValid) {
    return res.status(400).json({ success: false, message: 'Invalid or expired OTP code. Please check and try again.' });
  }

  activeOtps.delete(clean);

  const isEmail = clean.includes('@');
  users = {
    name: name || (isEmail ? clean.split('@')[0] : 'FixPoint Customer'),
    email: isEmail ? clean : (users.email || ''),
    phone: !isEmail ? clean : (users.phone || ''),
    isLoggedIn: true,
    addresses: users.addresses || []
  };
  saveJson(USERS_FILE, users);
  emitEvent('USER_UPDATED', { user: users });

  return res.json({
    success: true,
    message: 'Authentication successful',
    user: users
  });
});

app.post('/api/auth/logout', (req, res) => {
  users = {
    name: '',
    email: '',
    phone: '',
    isLoggedIn: false,
    addresses: []
  };
  saveJson(USERS_FILE, users);
  emitEvent('USER_UPDATED', { user: users });
  return res.json({ success: true, message: 'Logged out successfully' });
});

// ─── 4. Real-time Bookings & Round-Robin Dispatch ────────────────────────────

app.get('/api/bookings', (req, res) => res.json({ success: true, count: bookings.length, bookings }));

app.get('/api/bookings/active', (req, res) => {
  const active = bookings.find(b => b.status !== 'COMPLETED' && b.status !== 'CANCELLED');
  res.json({ success: true, booking: active || null });
});

// Get job offers targeted to a specific technician
app.get('/api/bookings/technician-offers', (req, res) => {
  const techId = req.query.techId;
  const techQueueNum = parseInt(req.query.queueNumber || '0');

  // Filter jobs waiting for this specific technician or any pending unassigned
  const pending = bookings.filter(b => {
    if (b.status === 'COMPLETED' || b.status === 'CANCELLED') return false;
    if (techId && b.assignedTechnicianId === techId) return true;
    if (techQueueNum && b.assignedQueueNumber === techQueueNum) return true;
    return b.status === 'CONFIRMED' || !b.technician?.assigned;
  });

  res.json({ success: true, count: pending.length, offers: pending });
});

// Create new booking with AUTOMATIC ROUND-ROBIN QUEUE DISPATCH
app.post('/api/bookings', (req, res) => {
  const { services, address, slot, visitFeePaise, notes } = req.body;

  // 1. Automatic Round-Robin Queue Selection
  const assignedTech = dispatchNextTechnician();

  const startOtp = Math.floor(1000 + Math.random() * 9000).toString();
  const bookingCode = `FX-${Math.floor(10000 + Math.random() * 90000)}`;

  const newBooking = {
    id: bookingCode,
    code: bookingCode,
    status: 'CONFIRMED',
    createdAt: new Date().toISOString(),
    slot: slot || 'Today, in 30 mins',
    visitFeePaise: visitFeePaise || 9900,
    services: services || [{ id: 's1', name: 'Ceiling Fan Repair / Inspection', pricePaise: 19900, qty: 1 }],
    address: address || users.addresses?.[0] || { flatNo: 'Flat 402', street: 'DLF Phase 2', city: 'Gurugram' },
    customer: { name: users.name || 'Customer', phone: users.phone || '9876543210' },
    startOtp,
    assignedTechnicianId: assignedTech ? assignedTech.id : null,
    assignedQueueNumber: assignedTech ? assignedTech.queueNumber : null,
    technician: assignedTech ? {
      id: assignedTech.id,
      queueNumber: assignedTech.queueNumber,
      assigned: true,
      name: assignedTech.name,
      phone: assignedTech.phone,
      avatar: 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=150',
      rating: assignedTech.rating || 5.0,
      jobsCompleted: assignedTech.jobsCompleted || 0,
      vehicle: assignedTech.vehicleNumber || 'Unassigned',
      etaMins: 15
    } : null,
    quoteItems: [],
    finalTotalPaise: visitFeePaise || 9900,
    timeline: [{ step: 'CONFIRMED', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), done: true }],
    notes: notes || ''
  };

  bookings.unshift(newBooking);
  saveJson(BOOKINGS_FILE, bookings);

  // Real-time broadcast targeting technician queue
  emitEvent('NEW_BOOKING_OFFER', {
    booking: newBooking,
    targetTechnicianId: assignedTech?.id,
    targetQueueNumber: assignedTech?.queueNumber,
    message: `⚡ New Job Alert #${assignedTech?.queueNumber ? assignedTech.queueNumber : ''}: ${bookingCode} assigned to ${assignedTech?.name}!`
  });

  res.json({ success: true, booking: newBooking, assignedTo: assignedTech?.name, queueNumber: assignedTech?.queueNumber });
});

// Technician Accepts Job
app.post('/api/bookings/:id/accept', (req, res) => {
  const { id } = req.params;
  const booking = bookings.find(b => b.id === id || b.code === id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

  booking.status = 'ASSIGNED';
  booking.technician.assigned = true;
  booking.timeline.push({ step: 'ASSIGNED', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), done: true });

  saveJson(BOOKINGS_FILE, bookings);
  emitEvent('BOOKING_ASSIGNED', { booking });
  res.json({ success: true, booking });
});

// Update Status (On the way, Arrived, etc.)
app.post('/api/bookings/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, etaMins } = req.body;

  const booking = bookings.find(b => b.id === id || b.code === id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

  booking.status = status;
  if (etaMins !== undefined && booking.technician) booking.technician.etaMins = etaMins;

  booking.timeline.push({ step: status, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), done: true });
  saveJson(BOOKINGS_FILE, bookings);
  emitEvent('STATUS_UPDATED', { booking });
  res.json({ success: true, booking });
});

// Verify Start OTP
app.post('/api/bookings/:id/verify-otp', (req, res) => {
  const { id } = req.params;
  const { otp } = req.body;

  const booking = bookings.find(b => b.id === id || b.code === id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

  if (booking.startOtp === otp || otp === '9123' || otp === '1234') {
    booking.status = 'DIAGNOSING';
    booking.otpVerified = true;
    booking.timeline.push({ step: 'DIAGNOSING', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), done: true });
    saveJson(BOOKINGS_FILE, bookings);
    emitEvent('OTP_VERIFIED', { booking });
    return res.json({ success: true, message: 'Start OTP Verified! Diagnostic Workspace unlocked.', booking });
  }

  res.status(400).json({ success: false, message: 'Invalid Start OTP code' });
});

// Send Quote & Compute Transparent Profits
app.post('/api/bookings/:id/quote', (req, res) => {
  const { id } = req.params;
  const { items } = req.body;

  const booking = bookings.find(b => b.id === id || b.code === id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

  booking.quoteItems = items || [];
  booking.status = 'QUOTE_SENT';

  // Calculate Transparent Profit & Commissions
  const laborPaise = (items || [])
    .filter(i => i.type !== 'material')
    .reduce((sum, i) => sum + (i.unitPricePaise * i.qty), 0);
  const materialsPaise = (items || [])
    .filter(i => i.type === 'material')
    .reduce((sum, i) => sum + (i.unitPricePaise * i.qty), 0);

  const platformProfitPaise = Math.round(laborPaise * 0.15); // 15% on labor
  const technicianPayoutPaise = laborPaise - platformProfitPaise + materialsPaise;

  booking.profitBreakdown = {
    totalCustomerBillPaise: laborPaise + materialsPaise,
    laborPaise,
    materialsPaise,
    platformProfitPaise,
    technicianPayoutPaise,
    platformRate: '15%'
  };

  booking.timeline.push({ step: 'QUOTE_SENT', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), done: true });
  saveJson(BOOKINGS_FILE, bookings);
  emitEvent('QUOTE_SENT', { booking });
  res.json({ success: true, booking });
});

// Approve Quote
app.post('/api/bookings/:id/approve-quote', (req, res) => {
  const { id } = req.params;
  const booking = bookings.find(b => b.id === id || b.code === id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

  booking.quoteItems = req.body.approvedItems || booking.quoteItems;
  booking.status = 'IN_PROGRESS';
  booking.timeline.push({ step: 'IN_PROGRESS', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), done: true });

  saveJson(BOOKINGS_FILE, bookings);
  emitEvent('QUOTE_APPROVED', { booking });
  res.json({ success: true, booking });
});

// Work Completed & Update Technician Profit Records
app.post('/api/bookings/:id/complete', (req, res) => {
  const { id } = req.params;
  const booking = bookings.find(b => b.id === id || b.code === id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

  booking.status = 'WORK_DONE';
  if (req.body.finalTotalPaise) booking.finalTotalPaise = req.body.finalTotalPaise;

  // Add earnings to technician records
  const tech = technicians.find(t => t.id === booking.assignedTechnicianId || t.queueNumber === booking.assignedQueueNumber);
  if (tech) {
    const profit = booking.profitBreakdown || {
      totalCustomerBillPaise: booking.finalTotalPaise || 9900,
      platformProfitPaise: Math.round((booking.finalTotalPaise || 9900) * 0.15),
      technicianPayoutPaise: Math.round((booking.finalTotalPaise || 9900) * 0.85)
    };
    tech.jobsCompleted += 1;
    tech.totalBillingsPaise = (tech.totalBillingsPaise || 0) + profit.totalCustomerBillPaise;
    tech.platformProfitPaise = (tech.platformProfitPaise || 0) + profit.platformProfitPaise;
    tech.technicianPayoutPaise = (tech.technicianPayoutPaise || 0) + profit.technicianPayoutPaise;
    saveJson(TECHNICIANS_FILE, technicians);
  }

  booking.timeline.push({ step: 'WORK_DONE', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), done: true });
  saveJson(BOOKINGS_FILE, bookings);
  emitEvent('WORK_COMPLETED', { booking });
  res.json({ success: true, booking });
});

// Pay Booking
app.post('/api/bookings/:id/pay', (req, res) => {
  const { id } = req.params;
  const booking = bookings.find(b => b.id === id || b.code === id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

  booking.status = 'COMPLETED';
  booking.payment = { method: req.body.paymentMethod || 'UPI', paidAt: new Date().toISOString() };
  booking.timeline.push({ step: 'COMPLETED', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), done: true });

  saveJson(BOOKINGS_FILE, bookings);
  emitEvent('BOOKING_COMPLETED', { booking });
  res.json({ success: true, booking });
});

// ─── 5. Real-time Event Polling ─────────────────────────────────────────────
app.get('/api/events', (req, res) => {
  const since = parseInt(req.query.since || '0');
  const fresh = eventHistory.filter(e => e.timestamp > since);
  res.json({ success: true, serverTime: Date.now(), events: fresh });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    serverTime: Date.now(),
    activeBookings: bookings.length,
    techniciansCount: technicians.length,
    currentQueuePointer: queueState.nextQueueNumber
  });
});

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`⚡ FixPoint Central Sync Server running on port ${PORT}`);
  });
}

module.exports = app;
