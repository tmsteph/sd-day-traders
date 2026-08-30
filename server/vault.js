const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function vaultPath(config = process.env) {
  return config.SDDT_GOOGLE_VAULT_FILE || path.join(os.homedir(), '.3dvr', 'sd-day-traders', 'google-oauth.enc.json');
}

function key(config = process.env) {
  const material = String(config.SDDT_CONNECTOR_MASTER_KEY || config.THREEDVR_CONNECTOR_MASTER_KEY || '').trim();
  if (!material) throw new Error('SDDT_CONNECTOR_MASTER_KEY is required.');
  return crypto.createHash('sha256').update(material).digest();
}

function load(config = process.env) {
  const file = vaultPath(config);
  if (!fs.existsSync(file)) return null;
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(config), Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  decipher.setAAD(Buffer.from('sd-day-traders-google-oauth'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext);
}

function save(value, config = process.env) {
  const file = vaultPath(config);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(config), iv);
  cipher.setAAD(Buffer.from('sd-day-traders-google-oauth'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const record = {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch {}
}

module.exports = { load, save, vaultPath };
