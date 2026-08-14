import * as C from "./src/crypto.js";

const env = {
  XDATA_KEY: "5dccbf08920a5527b99e222789c34bb7",
  AX_API_SIG_KEY: "18b4d589826af50241177961590e6693",
  X_API_BASE_SECRET: "mU1Y4n1vBjf3M7tMnRkFU08mVyUJHed8B5En3EAniu1mXLixeuASmBmKnkyzVziOye7rG5nIekMdthensbQMcOJ6SLnrkGyfXALD7mrBC6vuWv6G01pmD3XlU5rT7Tzx",
  ENCRYPTED_FIELD_KEY: "5dccbf08920a5527",
  CIRCLE_MSISDN_KEY: "5dccbf08920a5527",
  AX_FP_KEY: "18b4d589826af50241177961590e6693",
};

const xtime = 1755000000000;
const plain = '{"hello":"world"}';
const enc = await C.encryptXdata(plain, xtime, env);
const dec = await C.decryptXdata(enc, xtime, env);
console.log("XDATA roundtrip:", dec === plain ? "OK" : "FAIL", dec);

const xSig = await C.makeXSignature("IDTOKEN", "POST", "api/v8/profile", 1755000000, env);
console.log("X-Signature (sha512 hex):", xSig.slice(0, 16), "len", xSig.length);

const axSig = await C.makeAxApiSignature("2026-01-01T00:00:00.00+0700", "6281234567890", "123456", "SMS", env);
console.log("AX-Api-Signature (b64):", axSig.slice(0, 16));

const ef = await C.buildEncryptedField(env, true);
console.log("Encrypted field len:", ef.length, "(expect 16+16=32)");

const cm = await C.encryptCircleMsisdn("6281234567890", env);
const dm = await C.decryptCircleMsisdn(cm, env);
console.log("Circle MSISDN roundtrip:", dm === "6281234567890" ? "OK" : "FAIL", dm);

const fp = await C.axFingerprint(env);
console.log("Fingerprint present:", fp.length > 0, "AX_FP_KEY bytes:", new TextEncoder().encode(env.AX_FP_KEY).length);
const did = await C.axDeviceIdHash(fp);
console.log("DeviceId (md5 hex):", did, "len", did.length);
