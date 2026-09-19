import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
  redirectForRequiredRole,
  resolveAuthenticatedSession,
  sessionForAccount,
  verifySessionToken,
  type SessionPayload,
} from "../lib/session.ts";

const secret = "a-test-only-session-secret-with-more-than-32-characters";
const otherSecret = "a-different-test-session-secret-with-more-than-32-characters";
const payload: SessionPayload = { subject:"account-123",role:"consumer",expiresAt:10_000,sessionVersion:3 };

test("a valid token round-trips every authorization claim",async()=>{
  const token=await createSessionToken(payload,secret);
  assert.deepEqual(await verifySessionToken(token,secret,9_999),payload);
  await assert.rejects(()=>createSessionToken(payload,"too-short"),/at least 32 characters/);
});

test("payload or signature tampering is rejected",async()=>{
  const token=await createSessionToken(payload,secret);
  const [body,signature]=token.split(".");
  const changedBody=`${body.slice(0,-1)}${body.endsWith("A")?"B":"A"}`;
  const changedSignature=`${signature.slice(0,-1)}${signature.endsWith("A")?"B":"A"}`;
  assert.equal(await verifySessionToken(`${changedBody}.${signature}`,secret,9_999),null);
  assert.equal(await verifySessionToken(`${body}.${changedSignature}`,secret,9_999),null);
  assert.equal(await verifySessionToken(`${body}.${signature.slice(0,-4)}`,secret,9_999),null);
  assert.equal(await verifySessionToken(token,otherSecret,9_999),null);
});

test("expiry is exclusive, including exactly at the boundary",async()=>{
  const token=await createSessionToken(payload,secret);
  assert.deepEqual(await verifySessionToken(token,secret,payload.expiresAt-1),payload);
  assert.equal(await verifySessionToken(token,secret,payload.expiresAt),null);
  assert.equal(await verifySessionToken(token,secret,payload.expiresAt+1),null);
});

test("malformed tokens are rejected rather than thrown",async()=>{
  const valid=await createSessionToken(payload,secret);
  for(const token of ["","one-segment","a.b.c",".","%%%.$$$",`${valid}.extra`]){
    await assert.doesNotReject(async()=>assert.equal(await verifySessionToken(token,secret,9_999),null));
  }
});

test("missing and unknown roles cannot become sessions",async()=>{
  const missingRole=await createSessionToken({...payload,role:undefined} as unknown as SessionPayload,secret);
  const unknownRole=await createSessionToken({...payload,role:"administrator"} as unknown as SessionPayload,secret);
  const negativeVersion=await createSessionToken({...payload,sessionVersion:-1},secret);
  const fractionalVersion=await createSessionToken({...payload,sessionVersion:1.5},secret);
  assert.equal(await verifySessionToken(missingRole,secret,9_999),null);
  assert.equal(await verifySessionToken(unknownRole,secret,9_999),null);
  assert.equal(await verifySessionToken(negativeVersion,secret,9_999),null);
  assert.equal(await verifySessionToken(fractionalVersion,secret,9_999),null);
});

test("account role and session-version claims must still match live account state",()=>{
  assert.deepEqual(sessionForAccount(payload,{role:"consumer",sessionVersion:3}),payload);
  assert.equal(sessionForAccount(payload,{role:"brand",sessionVersion:3}),null);
  assert.equal(sessionForAccount(payload,{role:"consumer",sessionVersion:4}),null);
  assert.equal(sessionForAccount(payload,null),null);

  const legacy={...payload,sessionVersion:undefined};
  assert.deepEqual(sessionForAccount(legacy,{role:"consumer"}),legacy);
  assert.equal(sessionForAccount(legacy,{role:"consumer",sessionVersion:1}),null);
});

test("a session issued before a password change stops resolving",async()=>{
  const token=await createSessionToken(payload,secret);
  const beforeChange=await resolveAuthenticatedSession({token,secret,now:9_999,getAccount:async()=>({role:"consumer",sessionVersion:3})});
  const afterChange=await resolveAuthenticatedSession({token,secret,now:9_999,getAccount:async()=>({role:"consumer",sessionVersion:4})});
  assert.deepEqual(beforeChange,payload);
  assert.equal(afterChange,null);
});

test("deleted accounts and unusable cookies resolve to no session without an AWS lookup",async()=>{
  const token=await createSessionToken(payload,secret);
  assert.equal(await resolveAuthenticatedSession({token,secret,now:9_999,getAccount:async()=>null}),null);

  let lookups=0;
  const getAccount=async()=>{lookups++;return {role:"consumer" as const,sessionVersion:3};};
  assert.equal(await resolveAuthenticatedSession({token:undefined,secret,getAccount}),null);
  assert.equal(await resolveAuthenticatedSession({token,secret:undefined,getAccount}),null);
  assert.equal(await resolveAuthenticatedSession({token:"malformed",secret,getAccount}),null);
  assert.equal(lookups,0);
});

test("role guards send each signed-in role back to its own workspace",()=>{
  assert.equal(redirectForRequiredRole("consumer","brand"),"/consumer");
  assert.equal(redirectForRequiredRole("brand","consumer"),"/brand");
  assert.equal(redirectForRequiredRole("consumer","consumer"),null);
  assert.equal(redirectForRequiredRole("brand","brand"),null);
});
