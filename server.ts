import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Initialize SQLite Database
const db = new Database('logins.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT,
    ip TEXT
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    badge_type TEXT DEFAULT 'info',
    is_active INTEGER DEFAULT 1,
    created_by TEXT DEFAULT 'cjw',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS announcement_acks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    announcement_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    acked_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS governance_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    updated_by TEXT DEFAULT 'cjw',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default governance content if empty
const govCount = (db.prepare('SELECT COUNT(*) as count FROM governance_content').get() as { count: number }).count;
if (govCount === 0) {
  const defaultGov = `<p style="font-weight: 600; color: var(--ios-blue); margin-bottom: 12px; font-size: 0.9rem;">Please verify the test profile before finalizing the request</p>
<p style="font-size: 0.8rem; margin-bottom: 16px; opacity: 0.9;">To maintain clinical safety and optimize resource allocation, staff must validate that this request is both comprehensive and necessary.</p>
<div style="margin-bottom: 20px;">
    <h4 style="font-size: 0.85rem; color: #64D2FF; border-bottom: 0.5px solid var(--ios-separator); padding-bottom: 4px; margin-bottom: 8px; font-weight: 500;">1. Clinical Monitoring and Omissions</h4>
    <div style="display: flex; flex-direction: column; gap: 10px;">
        <div>
            <strong style="font-size: 0.85rem; display: block;">High-Risk Medication</strong>
            <span style="font-size: 0.82rem; color: var(--ios-label-secondary);">Have you cross-referenced the medication profile for drug-specific safety bloods such as Shared Care protocols, DMARDs, or renal/liver monitoring?</span>
        </div>
        <div>
            <strong style="font-size: 0.85rem; display: block;">High-Risk and Chronic Disease</strong>
            <span style="font-size: 0.82rem; color: var(--ios-label-secondary);">Are all relevant CVD, Diabetes High-Risk, and Thyroid (TFT) monitoring markers included?</span>
        </div>
        <div style="background: rgba(255, 69, 58, 0.1); padding: 8px; border-radius: 8px; border-left: 3px solid var(--ios-red);">
            <strong style="font-size: 0.8rem; color: var(--ios-red); display: block; margin-bottom: 4px;">IMPORTANT: QOF Compliance</strong>
            <span style="font-size: 0.8rem;">Have you checked the Quality and Outcomes Framework box to close any outstanding care gaps? (annual review, cvd/diabetes high risk, etc)</span>
        </div>
    </div>
</div>
<div style="margin-bottom: 20px;">
    <h4 style="font-size: 0.95rem; color: #64D2FF; border-bottom: 0.5px solid var(--ios-separator); padding-bottom: 4px; margin-bottom: 8px;">2. Duplicate Prevention</h4>
    <div>
        <strong style="font-size: 0.85rem; display: block;">Secondary Care Review</strong>
        <span style="font-size: 0.82rem; color: var(--ios-label-secondary);">Have you checked for recent hospital or specialist bloods? If tests were recently performed in secondary care and remain within the valid clinical window, do not duplicate them.</span>
    </div>
</div>
<div style="margin-bottom: 20px;">
    <h4 style="font-size: 0.95rem; color: #64D2FF; border-bottom: 0.5px solid var(--ios-separator); padding-bottom: 4px; margin-bottom: 8px;">3. Integrated Diagnostics</h4>
    <div style="display: flex; flex-direction: column; gap: 10px;">
        <div>
            <strong style="font-size: 0.85rem; display: block;">Annual Review Preparation</strong>
            <span style="font-size: 0.82rem; color: var(--ios-label-secondary);">If a urine test is required, ensure the phlebotomist is alerted to provide the patient with a specimen pot.</span>
        </div>
        <div style="background: rgba(10, 132, 255, 0.1); padding: 10px; border-radius: 8px; border: 1px dashed var(--ios-blue);">
            <strong style="font-size: 0.85rem; display: block; margin-bottom: 4px;">Urine request protocol:</strong>
            <p style="font-size: 0.82rem; margin-bottom: 4px;">Please add a screen comment underneath the patient’s blood appointment slot:</p>
            <em style="font-size: 0.85rem; color: white; display: block; text-align: center;">"Please provide urine pot for annual review"</em>
        </div>
    </div>
</div>`;
  db.prepare('INSERT INTO governance_content (content, updated_by) VALUES (?, ?)').run(defaultGov, 'cjw');
}

// API: Get Governance content
app.get('/api/governance', (_req, res) => {
  try {
    const row = db.prepare('SELECT content, updated_by, updated_at FROM governance_content ORDER BY id DESC LIMIT 1').get() as any;
    res.json({ success: true, content: row ? row.content : '', updatedAt: row ? row.updated_at : null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch governance content' });
  }
});

// API: Update Governance content (Admin cjw only)
app.post('/api/governance', (req, res) => {
  try {
    const { username, content } = req.body;
    if (!username || username.trim().toLowerCase() !== 'cjw') {
      return res.status(403).json({ error: 'Unauthorized: Only cjw can edit clinical governance text' });
    }
    if (!content) {
      return res.status(400).json({ error: 'Content cannot be empty' });
    }
    db.prepare('INSERT INTO governance_content (content, updated_by) VALUES (?, ?)').run(content, username.trim().toLowerCase());
    res.json({ success: true, message: 'Clinical Governance text updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update governance content' });
  }
});

// API: Get current active announcement
app.get('/api/announcement', (_req, res) => {
  try {
    const active = db.prepare('SELECT id, title, message, badge_type, is_active, created_by, updated_at FROM announcements WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get() as any;
    if (!active) {
      return res.json({ active: false });
    }
    res.json({
      active: true,
      announcement: {
        id: active.id,
        title: active.title,
        message: active.message,
        badgeType: active.badge_type || 'info',
        createdBy: active.created_by,
        updatedAt: active.updated_at
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch announcement' });
  }
});

// API: Create or update announcement (Admin cjw only)
app.post('/api/announcement', (req, res) => {
  try {
    const { username, title, message, badgeType, isActive } = req.body;
    if (!username || username.trim().toLowerCase() !== 'cjw') {
      return res.status(403).json({ error: 'Unauthorized: Only admin account cjw can manage announcements' });
    }

    if (isActive === false) {
      db.prepare('UPDATE announcements SET is_active = 0 WHERE is_active = 1').run();
      return res.json({ success: true, message: 'Broadcast disabled', active: false });
    }

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    // Deactivate previous active announcements
    db.prepare('UPDATE announcements SET is_active = 0 WHERE is_active = 1').run();

    // Insert new announcement
    const stmt = db.prepare('INSERT INTO announcements (title, message, badge_type, is_active, created_by) VALUES (?, ?, ?, 1, ?)');
    const result = stmt.run(title, message, badgeType || 'info', username.trim().toLowerCase());

    res.json({
      success: true,
      message: 'Announcement published successfully',
      announcement: {
        id: result.lastInsertRowid,
        title,
        message,
        badgeType: badgeType || 'info',
        createdBy: username,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Error publishing announcement:', err);
    res.status(500).json({ error: 'Failed to publish announcement' });
  }
});

// API: Record user acknowledgment
app.post('/api/announcement/ack', (req, res) => {
  try {
    const { username, announcementId } = req.body;
    if (username && announcementId) {
      const stmt = db.prepare('INSERT INTO announcement_acks (announcement_id, username) VALUES (?, ?)');
      stmt.run(announcementId, username);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record acknowledgment' });
  }
});

// API: Log a user login
app.post('/api/logins', (req, res) => {
  try {
    const { username, userAgent } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    const stmt = db.prepare('INSERT INTO login_logs (username, user_agent, ip) VALUES (?, ?, ?)');
    stmt.run(username, userAgent || req.headers['user-agent'] || '', req.ip || '');

    // Get login count for user
    const countStmt = db.prepare('SELECT COUNT(*) as userCount FROM login_logs WHERE LOWER(username) = LOWER(?)');
    const userCount = (countStmt.get(username) as { userCount: number }).userCount;

    // Get total logins overall
    const totalStmt = db.prepare('SELECT COUNT(*) as totalCount FROM login_logs');
    const totalCount = (totalStmt.get() as { totalCount: number }).totalCount;

    res.json({
      success: true,
      username,
      userLoginCount: userCount,
      totalLogins: totalCount
    });
  } catch (err) {
    console.error('Error logging login:', err);
    res.status(500).json({ error: 'Failed to record login' });
  }
});

// API: Get login logs & summary
app.get('/api/logins', (_req, res) => {
  try {
    const logs = db.prepare('SELECT id, username, timestamp, user_agent FROM login_logs ORDER BY id DESC LIMIT 100').all();
    const summary = db.prepare('SELECT username, COUNT(*) as login_count, MAX(timestamp) as last_login FROM login_logs GROUP BY LOWER(username) ORDER BY login_count DESC').all();
    const totalCount = (db.prepare('SELECT COUNT(*) as total FROM login_logs').get() as { total: number }).total;

    res.json({ logs, summary, totalCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

// API: Download CSV of all logs
app.get('/api/logins/csv', (_req, res) => {
  try {
    const logs = db.prepare('SELECT id, timestamp, username, user_agent FROM login_logs ORDER BY id ASC').all() as any[];
    let csv = 'ID,Timestamp,Username,User Agent\n';
    for (const log of logs) {
      const cleanUser = `"${(log.username || '').replace(/"/g, '""')}"`;
      const cleanAgent = `"${(log.user_agent || '').replace(/"/g, '""')}"`;
      csv += `${log.id},"${log.timestamp}",${cleanUser},${cleanAgent}\n`;
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="hgp_login_logs.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).send('Error generating CSV');
  }
});

// Development vs Production serving
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
    appType: 'custom',
  });
  app.use(vite.middlewares);
  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const indexPath = path.resolve(__dirname, 'index.html');
      let template = fs.readFileSync(indexPath, 'utf-8');
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
