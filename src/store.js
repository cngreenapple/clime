// KV-backed session + bookmark store. One "account" per refresh token.
// Sessions are keyed by a random session id stored in an httpOnly cookie.

export async function getAccounts(kv) {
  const raw = await kv.get("accounts");
  return raw ? JSON.parse(raw) : [];
}
export async function saveAccounts(kv, accounts) {
  await kv.put("accounts", JSON.stringify(accounts));
}
export async function addAccount(kv, number, refreshToken, subscriberId, subscriptionType) {
  const accounts = await getAccounts(kv);
  const existing = accounts.find((a) => a.number === number);
  if (existing) {
    existing.refresh_token = refreshToken;
    if (subscriberId) existing.subscriber_id = subscriberId;
    if (subscriptionType) existing.subscription_type = subscriptionType;
  } else {
    accounts.push({ number, subscriber_id: subscriberId || "", subscription_type: subscriptionType || "", refresh_token: refreshToken });
  }
  await saveAccounts(kv, accounts);
  return accounts;
}
export async function removeAccount(kv, number) {
  const accounts = (await getAccounts(kv)).filter((a) => a.number !== number);
  await saveAccounts(kv, accounts);
  return accounts;
}
export async function getActive(kv) {
  const raw = await kv.get("active_number");
  return raw ? parseInt(raw, 10) : null;
}
export async function setActive(kv, number) {
  if (number === null) await kv.delete("active_number");
  else await kv.put("active_number", String(number));
}

export async function getBookmarks(kv) {
  const raw = await kv.get("bookmarks");
  return raw ? JSON.parse(raw) : [];
}
export async function addBookmark(kv, bm) {
  const list = await getBookmarks(kv);
  const key = (b) => `${b.family_code}|${b.variant_name}|${b.order}`;
  if (list.some((b) => key(b) === key(bm))) return list;
  list.push(bm);
  await kv.put("bookmarks", JSON.stringify(list));
  return list;
}
export async function removeBookmark(kv, familyCode, variantName, order) {
  const list = (await getBookmarks(kv)).filter((b) => !(b.family_code === familyCode && b.variant_name === variantName && b.order === order));
  await kv.put("bookmarks", JSON.stringify(list));
  return list;
}
