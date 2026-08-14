// Validate the Worker router + store logic without miniflare (Windows EFTYPE workaround).
import worker from "./src/index.js";
import * as Store from "./src/store.js";

const env = {
  BASE_API_URL: "https://api.myxl.xlaxiata.co.id",
  BASE_CIAM_URL: "https://gede.ciam.xlaxiata.co.id",
  BASIC_AUTH: "x",
  AX_FP_KEY: "18b4d589826af50241177961590e6693",
  UA: "myXL",
  API_KEY: "vT8tINqHaOxXbGE7eOWAhA==",
  ENCRYPTED_FIELD_KEY: "5dccbf08920a5527",
  XDATA_KEY: "5dccbf08920a5527b99e222789c34bb7",
  AX_API_SIG_KEY: "18b4d589826af50241177961590e6693",
  X_API_BASE_SECRET: "secret",
  CIRCLE_MSISDN_KEY: "5dccbf08920a5527",
  // In-memory KV mock
  MEKV: (() => {
    const m = new Map();
    return {
      get: (k) => Promise.resolve(m.has(k) ? m.get(k) : null),
      put: (k, v) => { m.set(k, v); return Promise.resolve(); },
      delete: (k) => { m.delete(k); return Promise.resolve(); },
    };
  })(),
};

const req = (url, method = "GET", body) =>
  worker.fetch(new Request("http://localhost" + url, { method, body: body ? JSON.stringify(body) : undefined, headers: { "content-type": "application/json" } }), env, {});

const main = async () => {
  // UI
  let r = await req("/");
  console.log("GET / ->", r.status, (await r.text()).includes("MYnyak") ? "UI ok" : "UI FAIL");
  r = await req("/app.js");
  console.log("GET /app.js ->", r.status, (await r.text()).includes("boot()") ? "JS ok" : "JS FAIL");

  // Accounts empty
  r = await req("/api/accounts");
  console.log("GET /api/accounts ->", r.status, JSON.stringify(await r.json()));

  // Bookmarks add/list/remove
  await req("/api/bookmarks", "POST", { family_code: "fc1", family_name: "X", is_enterprise: false, variant_name: "V", option_name: "O", order: 1 });
  r = await req("/api/bookmarks");
  let bms = await r.json();
  console.log("bookmarks count ->", bms.length, bms[0]?.family_code);
  await req("/api/bookmarks", "DELETE", { family_code: "fc1", variant_name: "V", order: 1 });
  r = await req("/api/bookmarks");
  console.log("bookmarks after delete ->", (await r.json()).length);

  // Unknown endpoint
  r = await req("/api/nope");
  console.log("unknown ->", r.status, (await r.json()).error);

  // Auth-required without session
  r = await req("/api/profile");
  console.log("profile no session ->", r.status, (await r.json()).error);
};

main().catch((e) => { console.error("TEST ERROR", e); process.exit(1); });
