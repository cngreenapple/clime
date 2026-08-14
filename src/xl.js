// Port of me-cli-sunset XL API client to fetch-based Worker code.
import * as C from "./crypto.js";

function hostOf(url) {
  return url.replace("https://", "");
}

// ---- Low-level signed request (engsel.send_api_request) ----
export async function sendApiRequest(env, path, payload, idToken, method = "POST") {
  const xtime = Date.now();
  const xdata = await C.encryptXdata(JSON.stringify(payload), xtime, env);
  const sigTimeSec = Math.floor(xtime / 1000);
  const xSig = await C.makeXSignature(idToken, method, path, sigTimeSec, env);

  const headers = {
    host: hostOf(env.BASE_API_URL),
    "content-type": "application/json; charset=utf-8",
    "user-agent": env.UA,
    "x-api-key": env.API_KEY,
    authorization: `Bearer ${idToken}`,
    "x-hv": "v3",
    "x-signature-time": String(sigTimeSec),
    "x-signature": xSig,
    "x-request-id": crypto.randomUUID(),
    "x-request-at": C.javaLikeTimestamp(new Date()),
    "x-version-app": "8.9.0",
  };

  const resp = await fetch(`${env.BASE_API_URL}/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ xdata, xtime }),
  });
  const text = await resp.text();
  try {
    return JSON.parse(await C.decryptXdata(JSON.parse(text), xtime, env));
  } catch (e) {
    return { raw: text, error: String(e) };
  }
}

// ---- CIAM (login) ----
async function ciamHeaders(env, fp, deviceId) {
  return {
    "Accept-Encoding": "gzip, deflate, br",
    Authorization: `Basic ${env.BASIC_AUTH}`,
    "Ax-Device-Id": deviceId,
    "Ax-Fingerprint": fp,
    "Ax-Request-Device": "samsung",
    "Ax-Request-Device-Model": "SM-N935F",
    "Ax-Substype": "PREPAID",
    "Content-Type": "application/json",
    "User-Agent": env.UA,
  };
}

export async function getOtp(env, contact) {
  if (!contact.startsWith("628") || contact.length > 14) throw new Error("Invalid number");
  const fp = await C.axFingerprint(env);
  const deviceId = await C.axDeviceIdHash(fp);
  const url = `${env.BASE_CIAM_URL}/realms/xl-ciam/auth/otp`;
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const headers = {
    ...(await ciamHeaders(env, fp, deviceId)),
    "Ax-Request-At": C.javaLikeTimestamp(now),
    "Ax-Request-Id": crypto.randomUUID(),
    Host: hostOf(env.BASE_CIAM_URL),
  };
  const resp = await fetch(url, {
    method: "GET",
    headers,
    params: { contact, contactType: "SMS", alternateContact: "false" },
  });
  const body = await resp.json();
  if (!body.subscriber_id) throw new Error(body.error || "No subscriber_id");
  return body.subscriber_id;
}

export async function submitOtp(env, contactType, contact, code) {
  const fp = await C.axFingerprint(env);
  const deviceId = await C.axDeviceIdHash(fp);
  const url = `${env.BASE_CIAM_URL}/realms/xl-ciam/protocol/openid-connect/token`;
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const tsForSign = C.tsGmt7WithoutColon(now);
  const tsHeader = C.tsGmt7WithoutColon(new Date(now.getTime() - 5 * 60 * 1000));
  const signature = await C.makeAxApiSignature(tsForSign, contact, code, contactType, env);
  const payload = `contactType=${contactType}&code=${code}&grant_type=password&contact=${contact}&scope=openid`;
  const headers = {
    ...(await ciamHeaders(env, fp, deviceId)),
    "Ax-Api-Signature": signature,
    "Ax-Request-At": tsHeader,
    "Ax-Request-Id": crypto.randomUUID(),
    Host: hostOf(env.BASE_CIAM_URL),
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const resp = await fetch(url, { method: "POST", headers, body: payload });
  const body = await resp.json();
  if (body.error) throw new Error(JSON.stringify(body));
  return body;
}

export async function refreshToken(env, refreshToken, subscriberId) {
  const fp = await C.axFingerprint(env);
  const deviceId = await C.axDeviceIdHash(fp);
  const url = `${env.BASE_CIAM_URL}/realms/xl-ciam/protocol/openid-connect/token`;
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const headers = {
    host: hostOf(env.BASE_CIAM_URL),
    "ax-request-at": now.toISOString().slice(0, 19) + "+0700",
    "ax-device-id": deviceId,
    "ax-request-id": crypto.randomUUID(),
    "ax-request-device": "samsung",
    "ax-request-device-model": "SM-N935F",
    "ax-fingerprint": fp,
    authorization: `Basic ${env.BASIC_AUTH}`,
    "user-agent": env.UA,
    "ax-substype": "PREPAID",
    "content-type": "application/x-www-form-urlencoded",
  };
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  });
  const body = await resp.json();
  if (body.error) throw new Error(body.error_description || body.error);
  return body;
}

// ---- Profile / balance ----
export async function getProfile(env, tokens) {
  const res = await sendApiRequest(env, "api/v8/profile", { access_token: tokens.access_token, app_version: "8.9.0", is_enterprise: false, lang: "en" }, tokens.id_token);
  return res.data;
}
export async function getBalance(env, tokens) {
  const res = await sendApiRequest(env, "api/v8/packages/balance-and-credit", { is_enterprise: false, lang: "en" }, tokens.id_token);
  return res.data?.balance;
}
export async function getTieringInfo(env, tokens) {
  const res = await sendApiRequest(env, "gamification/api/v8/loyalties/tiering/info", { is_enterprise: false, lang: "en" }, tokens.id_token);
  return res.data || {};
}

// ---- Store / packages ----
export async function getFamily(env, tokens, familyCode, isEnterprise = null, migrationType = null) {
  const ieList = isEnterprise === null ? [false, true] : [isEnterprise];
  const mtList = migrationType === null ? ["NONE", "PRE_TO_PRIOH", "PRIOH_TO_PRIO", "PRIO_TO_PRIOH"] : [migrationType];
  for (const mt of mtList) {
    for (const ie of ieList) {
      const res = await sendApiRequest(env, "api/v8/xl-stores/options/list", {
        is_show_tagging_tab: true, is_dedicated_event: true, is_transaction_routine: false,
        migration_type: mt, package_family_code: familyCode, is_autobuy: false, is_enterprise: ie,
        is_pdlp: true, referral_code: "", is_migration: false, lang: "en",
      }, tokens.id_token);
      if (res.status === "SUCCESS" && res.data?.package_family?.name) return res.data;
    }
  }
  return null;
}
export async function getPackage(env, tokens, optionCode) {
  const res = await sendApiRequest(env, "api/v8/xl-stores/options/detail", {
    is_transaction_routine: false, migration_type: "NONE", package_family_code: "", family_role_hub: "",
    is_autobuy: false, is_enterprise: false, is_shareable: false, is_migration: false, lang: "en",
    package_option_code: optionCode, is_upsell_pdp: false, package_variant_code: "",
  }, tokens.id_token);
  return res.data;
}
export async function getPackageDetails(env, tokens, familyCode, variantCode, order, isEnterprise = null, migrationType = null) {
  const family = await getFamily(env, tokens, familyCode, isEnterprise, migrationType);
  if (!family) return null;
  let optionCode = null;
  for (const v of family.package_variants) {
    if (v.package_variant_code === variantCode) {
      for (const o of v.package_options) if (o.order === order) optionCode = o.package_option_code;
    }
  }
  if (!optionCode) return null;
  return getPackage(env, tokens, optionCode);
}
export async function getFamilyList(env, tokens, subsType = "PREPAID", isEnterprise = false) {
  return sendApiRequest(env, "api/v8/xl-stores/options/search/family-list", { is_enterprise: isEnterprise, subs_type: subsType, lang: "en" }, tokens.id_token);
}
export async function getStorePackages(env, tokens, subsType = "PREPAID", isEnterprise = false) {
  return sendApiRequest(env, "api/v9/xl-stores/options/search", {
    is_enterprise: isEnterprise,
    filters: [
      { unit: "THOUSAND", id: "FIL_SEL_P", type: "PRICE", items: [] },
      { unit: "GB", id: "FIL_SEL_MQ", type: "DATA_TYPE", items: [] },
      { unit: "PACKAGE_NAME", id: "FIL_PKG_N", type: "PACKAGE_NAME", items: [{ id: "", label: "" }] },
      { unit: "DAY", id: "FIL_SEL_V", type: "VALIDITY", items: [] },
    ],
    substype: subsType, text_search: "", lang: "en",
  }, tokens.id_token);
}
export async function getSegments(env, tokens, isEnterprise = false) {
  return sendApiRequest(env, "api/v8/configs/store/segments", { is_enterprise: isEnterprise, lang: "en" }, tokens.id_token);
}
export async function getRedeemables(env, tokens, isEnterprise = false) {
  return sendApiRequest(env, "api/v8/personalization/redeemables", { is_enterprise: isEnterprise, lang: "en" }, tokens.id_token);
}
export async function getTransactionHistory(env, tokens) {
  return sendApiRequest(env, "payments/api/v8/transaction-history", { is_enterprise: false, lang: "en" }, tokens.id_token);
}
export async function getNotifications(env, tokens) {
  return sendApiRequest(env, "dashboard/api/v8/segments", { access_token: tokens.access_token }, tokens.id_token);
}
export async function getNotificationDetail(env, tokens, id) {
  return sendApiRequest(env, "api/v8/notification/detail", { is_enterprise: false, lang: "en", notification_id: id }, tokens.id_token);
}

// ---- Circle / Family plan ----
export async function circleGetGroupData(env, tokens) {
  return sendApiRequest(env, "family-hub/api/v8/groups/status", { is_enterprise: false, lang: "en" }, tokens.id_token);
}
export async function circleGetGroupMembers(env, tokens, groupId) {
  return sendApiRequest(env, "family-hub/api/v8/members/info", { group_id: groupId, is_enterprise: false, lang: "en" }, tokens.id_token);
}
export async function circleValidateMember(env, tokens, msisdn) {
  const enc = await C.encryptCircleMsisdn(msisdn, env);
  return sendApiRequest(env, "family-hub/api/v8/members/validate", { msisdn: enc, is_enterprise: false, lang: "en" }, tokens.id_token);
}
export async function circleInviteMember(env, tokens, msisdn, name, groupId, memberIdParent) {
  const enc = await C.encryptCircleMsisdn(msisdn, env);
  return sendApiRequest(env, "family-hub/api/v8/members/invite", {
    access_token: tokens.access_token, group_id: groupId, is_enterprise: false,
    members: [{ msisdn: enc, name }], lang: "en", member_id_parent: memberIdParent,
  }, tokens.id_token);
}
export async function circleRemoveMember(env, tokens, memberId, groupId, memberIdParent, isLast = false) {
  return sendApiRequest(env, "family-hub/api/v8/members/remove", {
    member_id: memberId, group_id: groupId, is_enterprise: false, is_last_member: isLast, lang: "en", member_id_parent: memberIdParent,
  }, tokens.id_token);
}
export async function circleCreate(env, tokens, parentName, groupName, memberMsisdn, memberName) {
  const enc = await C.encryptCircleMsisdn(memberMsisdn, env);
  return sendApiRequest(env, "family-hub/api/v8/groups/create", {
    access_token: tokens.access_token, parent_name: parentName, group_name: groupName,
    is_enterprise: false, members: [{ msisdn: enc, name: memberName }], lang: "en",
  }, tokens.id_token);
}
export async function famplanGetData(env, tokens) {
  return sendApiRequest(env, "sharings/api/v8/family-plan/member-info", { group_id: 0, is_enterprise: false, lang: "en" }, tokens.id_token);
}
export async function famplanValidateMsisdn(env, tokens, msisdn) {
  return sendApiRequest(env, "api/v8/auth/check-dukcapil", {
    with_bizon: true, with_family_plan: true, is_enterprise: false, with_optimus: true, lang: "en",
    msisdn, with_regist_status: true, with_enterprise: true,
  }, tokens.id_token);
}
export async function dukcapil(env, msisdn, kk, nik) {
  return sendApiRequest(env, "api/v8/auth/regist/dukcapil", { msisdn, kk, nik, lang: "en" }, "");
}

// ---- Purchase (settlement) ----
async function paymentMethods(env, tokens, tokenConfirmation, paymentTarget) {
  const res = await sendApiRequest(env, "payments/api/v8/payment-methods-option", {
    payment_type: "PURCHASE", is_enterprise: false, payment_target: paymentTarget, lang: "en",
    is_referral: false, token_confirmation: tokenConfirmation,
  }, tokens.id_token);
  if (res.status !== "SUCCESS") throw new Error(JSON.stringify(res));
  return res.data;
}

export async function settlementBalance(env, tokens, items, paymentFor, amount, tokenConfirmationIdx = 0) {
  const tokenConfirmation = items[tokenConfirmationIdx].token_confirmation;
  const paymentTargets = items.map((i) => i.item_code).join(";");
  const pm = await paymentMethods(env, tokens, tokenConfirmation, items[tokenConfirmationIdx].item_code);
  const tsToSign = pm.timestamp;
  const xtime = Date.now();
  const sigTimeSec = Math.floor(xtime / 1000);
  const payload = {
    total_discount: 0, is_enterprise: false, payment_token: "", token_payment: pm.token_payment,
    activated_autobuy_code: "", cc_payment_type: "", is_myxl_wallet: false, pin: "", ewallet_promo_id: "",
    members: [], total_fee: 0, fingerprint: "", autobuy_threshold_setting: { label: "", type: "", value: 0 },
    is_use_point: false, lang: "en", payment_method: "BALANCE", timestamp: Math.floor(Date.now() / 1000),
    points_gained: 0, can_trigger_rating: false, akrab_members: [], akrab_parent_alias: "",
    referral_unique_code: "", coupon: "", payment_for: paymentFor, with_upsell: false, topup_number: "",
    stage_token: "", authentication_id: "", encrypted_payment_token: await C.buildEncryptedField(env, true),
    token: "", token_confirmation: "", access_token: tokens.access_token, wallet_number: "",
    encrypted_authentication_id: await C.buildEncryptedField(env, true),
    additional_data: { original_price: items[items.length - 1].item_price, is_spend_limit_temporary: false, migration_type: "", akrab_m2m_group_id: "false", spend_limit_amount: 0, is_spend_limit: false, mission_id: "", tax: 0, quota_bonus: 0, cashtag: "", is_family_plan: false, combo_details: [], is_switch_plan: false, discount_recurring: 0, is_akrab_m2m: false, balance_type: "PREPAID_BALANCE", has_bonus: false, discount_promo: 0 },
    total_amount: amount, is_using_autobuy: false, items,
  };
  return signedSettlement(env, tokens, "payments/api/v8/settlement-multipayment", payload, xtime, sigTimeSec, tsToSign, "BALANCE", paymentFor, paymentTargets, pm.token_payment);
}

export async function settlementQris(env, tokens, items, paymentFor, amount, tokenConfirmationIdx = 0) {
  const tokenConfirmation = items[tokenConfirmationIdx].token_confirmation;
  const paymentTargets = items.map((i) => i.item_code).join(";");
  const pm = await paymentMethods(env, tokens, tokenConfirmation, items[tokenConfirmationIdx].item_code);
  const tsToSign = pm.timestamp;
  const xtime = Date.now();
  const sigTimeSec = Math.floor(xtime / 1000);
  const payload = {
    akrab: { akrab_members: [], akrab_parent_alias: "", members: [] }, can_trigger_rating: false, total_discount: 0,
    coupon: "", payment_for: paymentFor, topup_number: "", stage_token: "", is_enterprise: false,
    autobuy: { is_using_autobuy: false, activated_autobuy_code: "", autobuy_threshold_setting: { label: "", type: "", value: 0 } },
    access_token: tokens.access_token, is_myxl_wallet: false,
    additional_data: { original_price: items[0].item_price, is_spend_limit_temporary: false, migration_type: "", spend_limit_amount: 0, is_spend_limit: false, tax: 0, benefit_type: "", quota_bonus: 0, cashtag: "", is_family_plan: false, combo_details: [], is_switch_plan: false, discount_recurring: 0, has_bonus: false, discount_promo: 0 },
    total_amount: amount, total_fee: 0, is_use_point: false, lang: "en", items,
    verification_token: pm.token_payment, payment_method: "QRIS", timestamp: Math.floor(Date.now() / 1000),
  };
  return signedSettlement(env, tokens, "payments/api/v8/settlement-multipayment/qris", payload, xtime, sigTimeSec, tsToSign, "QRIS", paymentFor, paymentTargets, pm.token_payment);
}

export async function getQrisCode(env, tokens, transactionId) {
  const res = await sendApiRequest(env, "payments/api/v8/pending-detail", { transaction_id: transactionId, is_enterprise: false, lang: "en", status: "" }, tokens.id_token);
  return res.data?.qr_code;
}

async function signedSettlement(env, tokens, path, payload, xtime, sigTimeSec, tsToSign, paymentMethod, paymentFor, paymentTargets, tokenPayment) {
  const xdata = await C.encryptXdata(JSON.stringify(payload), xtime, env);
  const xSig = await C.makeXSignaturePayment(tokens.access_token, tsToSign, paymentTargets, tokenPayment, paymentMethod, paymentFor, path, env);
  const headers = {
    host: hostOf(env.BASE_API_URL), "content-type": "application/json; charset=utf-8", "user-agent": env.UA,
    "x-api-key": env.API_KEY, authorization: `Bearer ${tokens.id_token}`, "x-hv": "v3",
    "x-signature-time": String(sigTimeSec), "x-signature": xSig, "x-request-id": crypto.randomUUID(),
    "x-request-at": C.javaLikeTimestamp(new Date()), "x-version-app": "8.9.0",
  };
  const resp = await fetch(`${env.BASE_API_URL}/${path}`, { method: "POST", headers, body: JSON.stringify({ xdata, xtime }) });
  const text = await resp.text();
  try {
    return JSON.parse(await C.decryptXdata(JSON.parse(text), xtime, env));
  } catch (e) {
    return { raw: text, error: String(e) };
  }
}

export async function settlementBounty(env, tokens, tokenConfirmation, tsToSign, paymentTarget, price, itemName = "") {
  const xtime = Date.now();
  const sigTimeSec = Math.floor(xtime / 1000);
  const payload = {
    total_discount: 0, is_enterprise: false, payment_token: "", token_payment: "", activated_autobuy_code: "",
    cc_payment_type: "", is_myxl_wallet: false, pin: "", ewallet_promo_id: "", members: [], total_fee: 0,
    fingerprint: "", autobuy_threshold_setting: { label: "", type: "", value: 0 }, is_use_point: false, lang: "en",
    payment_method: "BALANCE", timestamp: tsToSign, points_gained: 0, can_trigger_rating: false, akrab_members: [],
    akrab_parent_alias: "", referral_unique_code: "", coupon: "", payment_for: "REDEEM_VOUCHER", with_upsell: false,
    topup_number: "", stage_token: "", authentication_id: "", encrypted_payment_token: await C.buildEncryptedField(env, true),
    token: "", token_confirmation: tokenConfirmation, access_token: tokens.access_token, wallet_number: "",
    encrypted_authentication_id: await C.buildEncryptedField(env, true),
    additional_data: { original_price: 0, is_spend_limit_temporary: false, migration_type: "", akrab_m2m_group_id: "", spend_limit_amount: 0, is_spend_limit: false, mission_id: "", tax: 0, benefit_type: "", quota_bonus: 0, cashtag: "", is_family_plan: false, combo_details: [], is_switch_plan: false, discount_recurring: 0, is_akrab_m2m: false, balance_type: "", has_bonus: false, discount_promo: 0 },
    total_amount: 0, is_using_autobuy: false, items: [{ item_code: paymentTarget, product_type: "", item_price: price, item_name: itemName, tax: 0 }],
  };
  const xdata = await C.encryptXdata(JSON.stringify(payload), xtime, env);
  const xSig = await C.makeXSignatureBounty(tokens.access_token, tsToSign, paymentTarget, tokenConfirmation, env);
  const headers = {
    host: hostOf(env.BASE_API_URL), "content-type": "application/json; charset=utf-8", "user-agent": env.UA,
    "x-api-key": env.API_KEY, authorization: `Bearer ${tokens.id_token}`, "x-hv": "v3",
    "x-signature-time": String(sigTimeSec), "x-signature": xSig, "x-request-id": crypto.randomUUID(),
    "x-request-at": C.javaLikeTimestamp(new Date()), "x-version-app": "8.9.0",
  };
  const resp = await fetch(`${env.BASE_API_URL}/api/v8/personalization/bounties-exchange`, { method: "POST", headers, body: JSON.stringify({ xdata, xtime }) });
  const text = await resp.text();
  try { return JSON.parse(await C.decryptXdata(JSON.parse(text), xtime, env)); } catch (e) { return { raw: text, error: String(e) }; }
}
