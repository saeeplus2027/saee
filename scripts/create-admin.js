// Create the first administrator interactively: npm run create-admin
const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../db');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(resolve => rl.question(q, resolve));
(async () => {
  try {
    const name = (await ask('Admin name: ')).trim();
    const email = (await ask('Admin email: ')).trim().toLowerCase();
    const password = await ask('Password (12+ characters): ');
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) throw new Error('Invalid name/email or password shorter than 12 characters.');
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) throw new Error('This email already exists. Promote it manually after verifying identity.');
    const hash = await bcrypt.hash(password, 12);
    const unusablePinHash = await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 12);
    db.prepare("INSERT INTO users (name,email,password_hash,security_pin_hash,role) VALUES (?,?,?,?,'admin')").run(name,email,hash,unusablePinHash);
    console.log('Administrator created. Keep credentials private.');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
  finally { rl.close(); db.close(); }
})();
