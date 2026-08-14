import * as XL from "./xl.js";
import * as Store from "./store.js";

const SESSION_COOKIE = "me_session";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
function err(msg, status = 400) {
  return json({ error: msg }, status);
}

// Resolve active tokens, refreshing if needed. Returns {tokens, account} or throws.
async function activeTokens(env) {
  const number = await Store.getActive(env.MEKV);
  if (number === null) throw new Error("No active account");
  const accounts = await Store.getAccounts(env.MEKV);
  const account = accounts.find((a) => a.number === number);
  if (!account) throw new Error("Active account not found");
  let tokens;
  try {
    tokens = await XL.refreshToken(env, account.refresh_token, account.subscriber_id);
  } catch (e) {
    throw new Error("Failed to refresh token: " + e.message);
  }
  // Persist rotated refresh token.
  await Store.addAccount(env.MEKV, account.number, tokens.refresh_token, account.subscriber_id, account.subscription_type);
  return { tokens, account };
}

async function handleApi(env, path, method, body) {
  // Auth-less endpoints
  if (path === "/api/login/otp" && method === "POST") {
    const sub = await XL.getOtp(env, body.contact);
    return json({ subscriber_id: sub });
  }
  if (path === "/api/login/submit" && method === "POST") {
    const tokens = await XL.submitOtp(env, "SMS", body.contact, body.code);
    await Store.addAccount(env.MEKV, parseInt(body.contact, 10), tokens.refresh_token, "", "");
    await Store.setActive(env.MEKV, parseInt(body.contact, 10));
    return json({ ok: true });
  }

  // Account + bookmark management work without an active session.
  switch (path) {
    case "/api/accounts":
      return json({ accounts: await Store.getAccounts(env.MEKV), active: await Store.getActive(env.MEKV) });
    case "/api/accounts/switch":
      await Store.setActive(env.MEKV, parseInt(body.number, 10));
      return json({ ok: true });
    case "/api/accounts/remove":
      await Store.removeAccount(env.MEKV, parseInt(body.number, 10));
      if ((await Store.getActive(env.MEKV)) === parseInt(body.number, 10)) await Store.setActive(env.MEKV, null);
      return json({ ok: true });
    case "/api/bookmarks":
      if (method === "GET") return json(await Store.getBookmarks(env.MEKV));
      if (method === "POST") return json(await Store.addBookmark(env.MEKV, body));
      if (method === "DELETE") return json(await Store.removeBookmark(env.MEKV, body.family_code, body.variant_name, body.order));
      return err("Method not allowed", 405);
  }

  // Everything below needs an active session.
  let tokens, account;
  try {
    ({ tokens, account } = await activeTokens(env));
  } catch (e) {
    return err(e.message, 401);
  }

  switch (path) {
    case "/api/profile":
      return json(await XL.getProfile(env, tokens));
    case "/api/balance":
      return json(await XL.getBalance(env, tokens));
    case "/api/tiering":
      return json(await XL.getTieringInfo(env, tokens));
    case "/api/transactions":
      return json(await XL.getTransactionHistory(env, tokens));
    case "/api/notifications":
      return json(await XL.getNotifications(env, tokens));
    case "/api/store/segments":
      return json(await XL.getSegments(env, tokens, !!body.is_enterprise));
    case "/api/store/family-list":
      return json(await XL.getFamilyList(env, tokens, body.subs_type || "PREPAID", !!body.is_enterprise));
    case "/api/store/packages":
      return json(await XL.getStorePackages(env, tokens, body.subs_type || "PREPAID", !!body.is_enterprise));
    case "/api/store/redeemables":
      return json(await XL.getRedeemables(env, tokens, !!body.is_enterprise));
    case "/api/family":
      return json(await XL.getFamily(env, tokens, body.family_code, body.is_enterprise ?? null, body.migration_type ?? null));
    case "/api/package":
      return json(await XL.getPackage(env, tokens, body.option_code));
    case "/api/package/details":
      return json(await XL.getPackageDetails(env, tokens, body.family_code, body.variant_code, body.order, body.is_enterprise ?? null, body.migration_type ?? null));
    case "/api/circle":
      return json(await XL.circleGetGroupData(env, tokens));
    case "/api/circle/members":
      return json(await XL.circleGetGroupMembers(env, tokens, body.group_id));
    case "/api/circle/validate":
      return json(await XL.circleValidateMember(env, tokens, body.msisdn));
    case "/api/circle/invite":
      return json(await XL.circleInviteMember(env, tokens, body.msisdn, body.name, body.group_id, body.member_id_parent));
    case "/api/circle/remove":
      return json(await XL.circleRemoveMember(env, tokens, body.member_id, body.group_id, body.member_id_parent, !!body.is_last_member));
    case "/api/circle/create":
      return json(await XL.circleCreate(env, tokens, body.parent_name, body.group_name, body.member_msisdn, body.member_name));
    case "/api/famplan":
      return json(await XL.famplanGetData(env, tokens));
    case "/api/famplan/validate":
      return json(await XL.famplanValidateMsisdn(env, tokens, body.msisdn));
    case "/api/dukcapil":
      return json(await XL.dukcapil(body.msisdn, body.kk, body.nik));
    case "/api/buy/balance":
      return json(await XL.settlementBalance(env, tokens, body.items, body.payment_for, body.amount, body.token_confirmation_idx ?? 0));
    case "/api/buy/qris":
      return json(await XL.settlementQris(env, tokens, body.items, body.payment_for, body.amount, body.token_confirmation_idx ?? 0));
    case "/api/buy/qris-code":
      return json({ qr_code: await XL.getQrisCode(env, tokens, body.transaction_id) });
    case "/api/buy/bounty":
      return json(await XL.settlementBounty(env, tokens, body.token_confirmation, body.ts_to_sign, body.payment_target, body.price, body.item_name));
    default:
      return err("Unknown endpoint: " + path, 404);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // API routes
    if (path.startsWith("/api/")) {
      const method = request.method;
      let body = {};
      if (method === "POST" || method === "DELETE") {
        try { body = await request.json(); } catch { body = {}; }
      } else {
        for (const [k, v] of url.searchParams) body[k] = v;
      }
      try {
        return await handleApi(env, path, method, body);
      } catch (e) {
        return err(e.message || String(e), 500);
      }
    }

    // Static UI
    if (path === "/" || path === "/index.html") {
      return new Response(UI_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (path === "/app.js") {
      return new Response(UI_JS, { headers: { "content-type": "application/javascript; charset=utf-8" } });
    }
    return new Response("Not found", { status: 404 });
  },
};

// Inlined UI to keep deployment to a single Worker file set.
import { UI_HTML } from "./ui.js";
import { UI_JS } from "./ui.js";
