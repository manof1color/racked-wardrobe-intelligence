import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const route=read("app/api/consumer/outfits/route.ts");
const store=read("lib/server/production-store.ts");
const dashboard=read("components/consumer-dashboard.tsx");
const dock=read("components/hanger-dock.tsx");
const agent=read("components/agent-panels.tsx");

test("saved outfit deletion is scoped to the authenticated consumer",()=>{assert.match(route,/session\.role\s*!==\s*"consumer"/);assert.match(route,/deleteOutfit\(session\.subject,outfitId\)/);assert.doesNotMatch(route,/body\?\.(ownerId|accountId|subject)/);});

test("deletion removes the owned outfit and private board without erasing wear history",()=>{const start=store.indexOf("export async function deleteOutfit");const end=store.indexOf("export async function incrementOutfitWears",start);const implementation=store.slice(start,end);assert.match(implementation,/PK:`USER#\$\{ownerId\}`/);assert.match(implementation,/DeleteCommand/);assert.match(implementation,/boardImageKey\?\.startsWith\(`wardrobe\/\$\{ownerId\}\/outfits\//);assert.match(implementation,/DeleteObjectCommand/);assert.doesNotMatch(implementation,/WEAR#|COMMUNITY#|GARMENT#/);});

test("the outfit screen requires an explicit second delete confirmation",()=>{assert.match(dashboard,/confirmDeleteId!==outfit\.id/);assert.match(dashboard,/Confirm delete/);assert.match(dashboard,/method:"DELETE"/);assert.match(dashboard,/Historical wear records were kept/);});

test("Hanger's successful save immediately reaches the dashboard outfit state",()=>{assert.match(agent,/onOutfitSaved\?\.\(data\.outfit as SavedOutfit\)/);assert.match(dock,/onOutfitSaved=\{onOutfitSaved\}/);assert.match(dashboard,/onOutfitSaved=\{outfit=>/);assert.match(dashboard,/\[outfit,\.\.\.current\]/);});

test("the client returns the latest Hanger action ids for a genuine alternative",()=>{assert.match(agent,/previousSuggestionItemIds/);assert.match(agent,/action\.type === "save-outfit"/);assert.match(agent,/JSON\.stringify\(\{ message, history, previousSuggestionItemIds \}\)/);});
