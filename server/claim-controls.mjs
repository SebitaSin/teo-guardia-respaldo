import { join } from "node:path";
import { readJson, writeJsonAtomic } from "./store.mjs";

export function readClaimState(dataDir) {
  const claims = readJson(join(dataDir, "mail", "reclamos.json"), {});
  const control = readJson(join(dataDir, "mail", "reclamos-control.json"), {});
  for (const [slug, info] of Object.entries(claims.services ?? {})) {
    if (Array.isArray(control.recipients?.[slug])) Object.assign(info, { to: control.recipients[slug], recipientSource: "manual" });
    if (["pendiente", "cancelado"].includes(info.status)) info.status = control.paused?.[slug] === claims.month ? "cancelado" : "pendiente";
  }
  return claims;
}

export function setClaimRecipients(dataDir, slug, input) {
  const statePath = join(dataDir, "mail", "reclamos.json");
  const claims = readJson(statePath, {});
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || !claims?.services?.[slug]) throw new Error("unknown_service");
  let recipients = null;
  if (input !== null) {
    if (!Array.isArray(input) || input.length < 1 || input.length > 2) throw new Error("invalid_recipients");
    recipients = [...new Set(input.map((item) => typeof item === "string" ? item.trim().toLowerCase() : ""))];
    if (recipients.some((item) => item.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(item))) throw new Error("invalid_recipients");
  }
  const controlPath = join(dataDir, "mail", "reclamos-control.json");
  const control = readJson(controlPath, {});
  const overrides = { ...(control.recipients ?? {}) };
  if (recipients === null) delete overrides[slug]; else overrides[slug] = recipients;
  writeJsonAtomic(controlPath, { ...control, recipients: overrides });
  const info = claims.services[slug];
  const defaultTo = info.defaultTo ?? (info.recipientSource === "manual" ? [] : info.to ?? []);
  claims.services[slug] = { ...info, defaultTo, to: recipients ?? defaultTo, recipientSource: recipients === null ? "history" : "manual", due: false };
  writeJsonAtomic(statePath, claims);
  return { slug, to: claims.services[slug].to, recipientSource: claims.services[slug].recipientSource };
}
