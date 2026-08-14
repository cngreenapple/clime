export const UI_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MYnyak Engsel WebUI</title>
<style>
  :root { --bg:#0f1115; --card:#1a1d24; --accent:#ff6a00; --txt:#e6e6e6; --mut:#9aa0a6; --ok:#3ec46d; --err:#ff5c5c; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:system-ui,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--txt); }
  header { padding:14px 18px; background:var(--card); border-bottom:1px solid #2a2e37; display:flex; align-items:center; gap:12px; }
  header h1 { font-size:18px; margin:0; flex:1; }
  .wrap { max-width:880px; margin:0 auto; padding:18px; }
  .card { background:var(--card); border:1px solid #2a2e37; border-radius:10px; padding:16px; margin-bottom:16px; }
  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  input,select,button { background:#11141a; color:var(--txt); border:1px solid #2a2e37; border-radius:8px; padding:9px 11px; font-size:14px; }
  input,select { flex:1; min-width:140px; }
  button { background:var(--accent); color:#fff; border:none; cursor:pointer; font-weight:600; }
  button.sec { background:#2a2e37; }
  button:hover { filter:brightness(1.08); }
  .tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px; }
  .tab { padding:8px 12px; border-radius:8px; background:#1a1d24; border:1px solid #2a2e37; cursor:pointer; font-size:13px; }
  .tab.active { background:var(--accent); color:#fff; border-color:var(--accent); }
  .hidden { display:none; }
  pre { background:#0b0d11; padding:12px; border-radius:8px; overflow:auto; max-height:340px; font-size:12px; }
  .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:12px; background:#2a2e37; margin:2px; }
  .ok { color:var(--ok); } .err { color:var(--err); } .mut { color:var(--mut); }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th,td { text-align:left; padding:7px 8px; border-bottom:1px solid #2a2e37; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px; }
  .pkg { background:#11141a; border:1px solid #2a2e37; border-radius:8px; padding:10px; }
  .pkg b { color:var(--accent); }
</style>
</head>
<body>
<header><h1>🔥 MYnyak Engsel WebUI</h1><span id="who" class="mut"></span></header>
<div class="wrap">
  <div id="login" class="card hidden">
    <h3>Login (OTP)</h3>
    <div class="row">
      <input id="contact" placeholder="628xxxx (nomor XL)" />
      <button id="reqOtp">Kirim OTP</button>
    </div>
    <div class="row" style="margin-top:8px">
      <input id="otp" placeholder="6 digit OTP" />
      <button id="subOtp">Submit</button>
    </div>
    <div id="loginMsg" class="mut" style="margin-top:8px"></div>
  </div>

  <div id="app" class="hidden">
    <div class="tabs" id="tabs"></div>
    <div id="views"></div>
  </div>
</div>
<script src="/app.js"></script>
</body>
</html>`;

export const UI_JS = `
const $ = (s) => document.querySelector(s);
const api = async (path, opts = {}) => {
  const r = await fetch(path, { headers: { "content-type": "application/json" }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
  return data;
};
const fmt = (n) => new Intl.NumberFormat("id-ID").format(n || 0);
const qb = (o) => ({ method: "POST", body: JSON.stringify(o) });

const TABS = [
  ["profile", "Profil & Saldo"],
  ["store", "Store"],
  ["buy", "Beli Paket"],
  ["circle", "Circle"],
  ["famplan", "Family Plan"],
  ["trx", "Riwayat"],
  ["bookmarks", "Bookmark"],
  ["accounts", "Akun"],
];

async function boot() {
  try {
    const acc = await api("/api/accounts");
    if (acc.active != null) { $("#login").classList.add("hidden"); $("#app").classList.remove("hidden"); renderTabs(); await showProfile(); }
    else { $("#login").classList.remove("hidden"); }
  } catch { $("#login").classList.remove("hidden"); }
  bindLogin();
}

function bindLogin() {
  $("#reqOtp").onclick = async () => {
    try { await api("/api/login/otp", qb({ contact: $("#contact").value })); $("#loginMsg").textContent = "OTP terkirim."; }
    catch (e) { $("#loginMsg").textContent = e.message; }
  };
  $("#subOtp").onclick = async () => {
    try {
      await api("/api/login/submit", qb({ contact: $("#contact").value, code: $("#otp").value }));
      location.reload();
    } catch (e) { $("#loginMsg").textContent = e.message; }
  };
}

function renderTabs() {
  const t = $("#tabs"); t.innerHTML = "";
  TABS.forEach(([id, label]) => {
    const el = document.createElement("div");
    el.className = "tab"; el.textContent = label; el.dataset.id = id;
    el.onclick = () => selectTab(id);
    t.appendChild(el);
  });
}
function selectTab(id) {
  document.querySelectorAll(".tab").forEach((e) => e.classList.toggle("active", e.dataset.id === id));
  const v = $("#views"); v.innerHTML = "";
  ({ profile: showProfile, store: showStore, buy: showBuy, circle: showCircle, famplan: showFamplan, trx: showTrx, bookmarks: showBookmarks, accounts: showAccounts }[id] || showProfile)();
}

async function showProfile() {
  const v = $("#views");
  try {
    const [p, b, t] = await Promise.all([api("/api/profile"), api("/api/balance"), api("/api/tiering")]);
    $("#who").textContent = p?.profile?.msisdn || "";
    v.innerHTML = \`<div class="card">
      <div class="row"><div><b>\${p?.profile?.msisdn || "-"}</b> <span class="mut">(\${p?.profile?.subscription_type || ""})</span></div></div>
      <div class="row" style="margin-top:8px">
        <div class="pill">Pulsa: Rp \${fmt(b?.remaining)}</div>
        <div class="pill">Aktif: \${b?.expired_at ? new Date(b.expired_at*1000).toLocaleDateString("id-ID") : "-"}</div>
        <div class="pill">Tier: \${t?.tier ?? "N/A"}</div>
        <div class="pill">Poin: \${fmt(t?.current_point)}</div>
      </div></div>\`;
  } catch (e) { v.innerHTML = \`<div class="err">\${e.message}</div>\`; }
}

async function showStore() {
  const v = $("#views");
  v.innerHTML = \`<div class="card"><div class="row">
    <select id="segType"><option value="segments">Segments</option><option value="family-list">Family List</option><option value="packages">Packages</option><option value="redeemables">Redeemables</option></select>
    <label><input type="checkbox" id="ent"/> Enterprise</label>
    <button id="loadSeg">Load</button></div><div id="segOut"></div></div>\`;
  $("#loadSeg").onclick = async () => {
    const type = $("#segType").value; const ent = $("#ent").checked;
    try {
      let res;
      if (type === "segments") res = await api("/api/store/segments", qb({ is_enterprise: ent }));
      else if (type === "family-list") res = await api("/api/store/family-list", qb({ is_enterprise: ent }));
      else if (type === "packages") res = await api("/api/store/packages", qb({ is_enterprise: ent }));
      else res = await api("/api/store/redeemables", qb({ is_enterprise: ent }));
      $("#segOut").innerHTML = \`<pre>\${JSON.stringify(res, null, 2)}</pre>\`;
    } catch (e) { $("#segOut").innerHTML = \`<div class="err">\${e.message}</div>\`; }
  };
}

async function showBuy() {
  const v = $("#views");
  v.innerHTML = \`<div class="card">
    <h3>Cari & Beli</h3>
    <div class="row"><input id="fc" placeholder="Family code (UUID)"/><button id="findFam">Cari Family</button></div>
    <div id="famOut"></div>
    <hr/>
    <div class="row"><input id="oc" placeholder="Option code"/><button id="findPkg">Detail Paket</button></div>
    <div id="pkgOut"></div>
  </div>\`;
  $("#findFam").onclick = async () => {
    try { const r = await api("/api/family", qb({ family_code: $("#fc").value }));
      $("#famOut").innerHTML = \`<pre>\${JSON.stringify(r, null, 2)}</pre>\`; } catch (e) { $("#famOut").innerHTML = \`<div class="err">\${e.message}</div>\`; }
  };
  $("#findPkg").onclick = async () => {
    try { const r = await api("/api/package", qb({ option_code: $("#oc").value }));
      const po = r?.package_option || {};
      $("#pkgOut").innerHTML = \`<div class="card"><b>\${po.name||""}</b> - Rp \${fmt(po.price)}<br/>
        <span class="mut">payment_for: \${r?.package_family?.payment_for||""}</span><br/>
        <div class="row" style="margin-top:8px">
          <input id="amt" placeholder="Amount (default harga)" value="\${po.price||0}"/>
          <select id="pm"><option value="balance">Pulsa</option><option value="qris">QRIS</option></select>
          <button id="doBuy">Beli</button>
        </div><div id="buyOut"></div></div>\`;
      $("#doBuy").onclick = async () => {
        const items = [{ item_code: po.package_option_code, product_type: "", item_price: po.price, item_name: po.name, tax: 0, token_confirmation: r.token_confirmation }];
        const amt = parseInt($("#amt").value, 10) || po.price;
        const pm = $("#pm").value;
        try {
          const res = pm === "qris"
            ? await api("/api/buy/qris", qb({ items, payment_for: r.package_family.payment_for, amount: amt }))
            : await api("/api/buy/balance", qb({ items, payment_for: r.package_family.payment_for, amount: amt }));
          $("#buyOut").innerHTML = \`<pre>\${JSON.stringify(res, null, 2)}</pre>\`;
        } catch (e) { $("#buyOut").innerHTML = \`<div class="err">\${e.message}</div>\`; }
      };
    } catch (e) { $("#pkgOut").innerHTML = \`<div class="err">\${e.message}</div>\`; }
  };
}

async function showCircle() {
  const v = $("#views");
  v.innerHTML = \`<div class="card"><button id="cg">Status Group</button> <button id="cc" class="sec">Create</button>
    <div id="cOut"></div></div>\`;
  $("#cg").onclick = async () => { try { const r = await api("/api/circle"); $("#cOut").innerHTML = \`<pre>\${JSON.stringify(r,null,2)}</pre>\`; } catch(e){ $("#cOut").innerHTML=\`<div class="err">\${e.message}</div>\`; } };
  $("#cc").onclick = async () => {
    const pn = prompt("Nama parent:"), gn = prompt("Nama circle:"), ms = prompt("MSISDN member:"), nm = prompt("Nama member:");
    try { const r = await api("/api/circle/create", qb({ parent_name: pn, group_name: gn, member_msisdn: ms, member_name: nm })); $("#cOut").innerHTML = \`<pre>\${JSON.stringify(r,null,2)}</pre>\`; } catch(e){ $("#cOut").innerHTML=\`<div class="err">\${e.message}</div>\`; }
  };
}

async function showFamplan() {
  const v = $("#views");
  v.innerHTML = \`<div class="card"><button id="fg">Data Family Plan</button>
    <div class="row" style="margin-top:8px"><input id="vms" placeholder="Validate MSISDN"/><button id="fv">Validate</button></div>
    <div id="fOut"></div></div>\`;
  $("#fg").onclick = async () => { try { const r = await api("/api/famplan"); $("#fOut").innerHTML = \`<pre>\${JSON.stringify(r,null,2)}</pre>\`; } catch(e){ $("#fOut").innerHTML=\`<div class="err">\${e.message}</div>\`; } };
  $("#fv").onclick = async () => { try { const r = await api("/api/famplan/validate", qb({ msisdn: $("#vms").value })); $("#fOut").innerHTML = \`<pre>\${JSON.stringify(r,null,2)}</pre>\`; } catch(e){ $("#fOut").innerHTML=\`<div class="err">\${e.message}</div>\`; } };
}

async function showTrx() {
  const v = $("#views");
  try { const r = await api("/api/transactions"); const list = r.list || [];
    v.innerHTML = \`<div class="card"><table><tr><th>#</th><th>Title</th><th>Harga</th><th>Status</th></tr>\${list.map((t,i)=>\`<tr><td>\${i+1}</td><td>\${t.title}</td><td>\${t.price}</td><td>\${t.status}</td></tr>\`).join("")}</table></div>\`;
  } catch (e) { v.innerHTML = \`<div class="err">\${e.message}</div>\`; }
}

async function showBookmarks() {
  const v = $("#views");
  try { const list = await api("/api/bookmarks");
    v.innerHTML = \`<div class="card">\${list.length ? list.map((b,i)=>\`<div class="pkg"><b>\${b.family_name}</b> - \${b.variant_name} - \${b.option_name} <button class="sec" data-i="\${i}">x</button></div>\`).join("") : '<span class="mut">Kosong</span>'}</div>\`;
    v.querySelectorAll("button[data-i]").forEach((btn) => btn.onclick = async () => {
      const b = list[btn.dataset.i];
      await api("/api/bookmarks", { method: "DELETE", headers:{"content-type":"application/json"}, body: JSON.stringify(b) });
      showBookmarks();
    });
  } catch (e) { v.innerHTML = \`<div class="err">\${e.message}</div>\`; }
}

async function showAccounts() {
  const v = $("#views");
  try { const r = await api("/api/accounts");
    v.innerHTML = \`<div class="card">\${r.accounts.map((a)=>\`<div class="row"><span>\${a.number} <span class="mut">[\${a.subscription_type}]</span></span>
      <button class="sec" data-sw="\${a.number}">Aktifkan</button><button class="sec" data-rm="\${a.number}">Hapus</button>
      \${a.number===r.active?'<span class="ok">● aktif</span>':''}</div>\`).join("")}</div>\`;
    v.querySelectorAll("[data-sw]").forEach((b)=>b.onclick=async()=>{ await api("/api/accounts/switch", qb({number:b.dataset.sw})); location.reload(); });
    v.querySelectorAll("[data-rm]").forEach((b)=>b.onclick=async()=>{ await api("/api/accounts/remove", qb({number:b.dataset.rm})); location.reload(); });
  } catch (e) { v.innerHTML = \`<div class="err">\${e.message}</div>\`; }
}

boot();
`;
