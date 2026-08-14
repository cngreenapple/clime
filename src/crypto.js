// Port of me-cli-sunset crypto (crypto_helper.py + encrypt.py) to Web Crypto.
// All secrets come from env (wrangler.jsonc vars).

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function bytesToUrlSafeB64(bytes) {
  return bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function urlSafeB64ToBytes(s) {
  let b = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  return b64ToBytes(b);
}
function utf8ToBytes(str) {
  return new TextEncoder().encode(str);
}
function bytesToUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(str) {
  const digest = await crypto.subtle.digest("SHA-256", utf8ToBytes(str));
  return bytesToHex(new Uint8Array(digest));
}

async function importAesKey(keyStr) {
  // Keys are used as raw ASCII byte strings (e.g. XDATA_KEY is 32 chars = AES-256).
  const bytes = utf8ToBytes(keyStr);
  if (bytes.length !== 16 && bytes.length !== 24 && bytes.length !== 32) {
    throw new Error("Bad AES key length: " + bytes.length + " for key '" + keyStr + "'");
  }
  return crypto.subtle.importKey("raw", bytes, { name: "AES-CBC" }, false, ["encrypt", "decrypt"]);
}

function pkcs7Pad(bytes, block = 16) {
  const padLen = block - (bytes.length % block);
  const out = new Uint8Array(bytes.length + padLen);
  out.set(bytes);
  out.fill(padLen, bytes.length);
  return out;
}
function pkcs7Unpad(bytes) {
  const padLen = bytes[bytes.length - 1];
  return bytes.slice(0, bytes.length - padLen);
}

// ---- XDATA (AES-CBC, IV = sha256(xtime)[:16]) ----
export async function encryptXdata(plaintext, xtimeMs, env) {
  const iv = utf8ToBytes((await sha256Hex(String(xtimeMs))).slice(0, 16));
  const key = await importAesKey(env.XDATA_KEY);
  const ct = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, pkcs7Pad(utf8ToBytes(plaintext)));
  return bytesToUrlSafeB64(new Uint8Array(ct));
}
export async function decryptXdata(xdata, xtimeMs, env) {
  const iv = utf8ToBytes((await sha256Hex(String(xtimeMs))).slice(0, 16));
  const key = await importAesKey(env.XDATA_KEY);
  const pt = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, urlSafeB64ToBytes(xdata));
  return bytesToUtf8(pkcs7Unpad(new Uint8Array(pt)));
}

// ---- Signatures (HMAC) ----
async function hmacSha512(keyStr, msgStr) {
  const key = await crypto.subtle.importKey("raw", utf8ToBytes(keyStr), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, utf8ToBytes(msgStr));
  return bytesToHex(new Uint8Array(sig));
}
async function hmacSha256(keyStr, msgStr) {
  const key = await crypto.subtle.importKey("raw", utf8ToBytes(keyStr), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, utf8ToBytes(msgStr));
  return bytesToB64(new Uint8Array(sig));
}

export async function makeXSignature(idToken, method, path, sigTimeSec, env) {
  const keyStr = `${env.X_API_BASE_SECRET};${idToken};${method};${path};${sigTimeSec}`;
  const msg = `${idToken};${sigTimeSec};`;
  return hmacSha512(keyStr, msg);
}
export async function makeXSignaturePayment(accessToken, sigTimeSec, packageCode, tokenPayment, paymentMethod, paymentFor, path, env) {
  const keyStr = `${env.X_API_BASE_SECRET};${sigTimeSec}#ae-hei_9Tee6he+Ik3Gais5=;POST;${path};${sigTimeSec}`;
  const msg = `${accessToken};${tokenPayment};${sigTimeSec};${paymentFor};${paymentMethod};${packageCode};`;
  return hmacSha512(keyStr, msg);
}
export async function makeAxApiSignature(tsForSign, contact, code, contactType, env) {
  const preimage = `${tsForSign}password${contactType}${contact}${code}openid`;
  return hmacSha256(env.AX_API_SIG_KEY, preimage);
}
export async function makeXSignatureBounty(accessToken, sigTimeSec, packageCode, tokenPayment, env) {
  const path = "api/v8/personalization/bounties-exchange";
  const keyStr = `${env.X_API_BASE_SECRET};${accessToken};${sigTimeSec}#ae-hei_9Tee6he+Ik3Gais5=;POST;${path};${sigTimeSec}`;
  const msg = `${accessToken};${tokenPayment};${sigTimeSec};${packageCode};`;
  return hmacSha512(keyStr, msg);
}
export async function makeXSignatureLoyalty(sigTimeSec, packageCode, tokenConfirmation, path, env) {
  const keyStr = `${env.X_API_BASE_SECRET};${sigTimeSec}#ae-hei_9Tee6he+Ik3Gais5=;POST;${path};${sigTimeSec}`;
  const msg = `${tokenConfirmation};${sigTimeSec};${packageCode};`;
  return hmacSha512(keyStr, msg);
}
export async function makeXSignatureBountyAllotment(sigTimeSec, packageCode, tokenConfirmation, path, destinationMsisdn, env) {
  const keyStr = `${env.X_API_BASE_SECRET};${sigTimeSec}#ae-hei_9Tee6he+Ik3Gais5=;${destinationMsisdn};POST;${path};${sigTimeSec}`;
  const msg = `${tokenConfirmation};${sigTimeSec};${destinationMsisdn};${packageCode};`;
  return hmacSha512(keyStr, msg);
}
export async function makeXSignatureBasic(method, path, sigTimeSec, env) {
  const keyStr = `${env.X_API_BASE_SECRET};${method};${path};${sigTimeSec}`;
  const msg = `${sigTimeSec};en;`;
  return hmacSha512(keyStr, msg);
}

// ---- Circle MSISDN (AES-CBC, IV appended) ----
export async function encryptCircleMsisdn(msisdn, env) {
  const key = await importAesKey(env.CIRCLE_MSISDN_KEY);
  const ivHex = bytesToHex(crypto.getRandomValues(new Uint8Array(8)));
  const iv = utf8ToBytes(ivHex);
  const ct = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, pkcs7Pad(utf8ToBytes(msisdn)));
  return bytesToUrlSafeB64(new Uint8Array(ct)) + ivHex;
}
export async function decryptCircleMsisdn(encryptedB64, env) {
  const ivAscii = encryptedB64.slice(-16);
  const b64Part = encryptedB64.slice(0, -16);
  const key = await importAesKey(env.CIRCLE_MSISDN_KEY);
  const iv = utf8ToBytes(ivAscii);
  const pt = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, urlSafeB64ToBytes(b64Part));
  return bytesToUtf8(pkcs7Unpad(new Uint8Array(pt)));
}

// ---- Encrypted field (empty plaintext, IV appended) ----
export async function buildEncryptedField(env, urlSafe = true) {
  const key = await importAesKey(env.ENCRYPTED_FIELD_KEY);
  const ivHex = bytesToHex(crypto.getRandomValues(new Uint8Array(8)));
  const iv = utf8ToBytes(ivHex);
  const ct = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, pkcs7Pad(new Uint8Array(0)));
  const ctB64 = urlSafe ? bytesToUrlSafeB64(new Uint8Array(ct)) : bytesToB64(new Uint8Array(ct));
  return ctB64 + ivHex;
}

// ---- Fingerprint (AES-CBC, zero IV) ----
export async function axFingerprint(env) {
  const plain = "samsung|SM-N935F|en|720x1540|GMT07:00|192.169.69.69|1.0|Android 13|6281398370564";
  const key = await importAesKey(env.AX_FP_KEY);
  const iv = new Uint8Array(16);
  const ct = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, pkcs7Pad(utf8ToBytes(plain)));
  return bytesToB64(new Uint8Array(ct));
}
export async function axDeviceIdHash(fp) {
  // MD5 is not in Web Crypto; use Node's crypto when available, else SubtleCrypto-free fallback.
  const { createHash } = await import("node:crypto");
  return createHash("md5").update(fp).digest("hex");
}

// ---- Helpers ----
export function javaLikeTimestamp(now) {
  const ms2 = String(Math.floor(now.getMilliseconds() / 10)).padStart(2, "0");
  let tz = now.getTimezoneOffset();
  const sign = tz <= 0 ? "+" : "-";
  tz = Math.abs(tz);
  const hh = String(Math.floor(tz / 60)).padStart(2, "0");
  const mm = String(tz % 60).padStart(2, "0");
  // XL/CIAM expects offset WITHOUT colon, e.g. +0700 (not +07:00).
  return now.toISOString().slice(0, 19) + "." + ms2 + sign + hh + mm;
}
export function tsGmt7WithoutColon(dt) {
  const gmt7 = new Date(dt.getTime() + 7 * 3600 * 1000);
  const millis = String(gmt7.getMilliseconds()).padStart(3, "0");
  const tz = "+0700";
  return gmt7.toISOString().slice(0, 19).replace("T", "T") + "." + millis + tz;
}
