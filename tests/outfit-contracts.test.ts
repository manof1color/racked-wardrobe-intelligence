import test from "node:test";
import assert from "node:assert/strict";
import { buildOutfitPieceReferences, wardrobeItemToOutfitPiece } from "../lib/outfit-contracts.ts";
import type { WardrobeItem } from "../lib/types.ts";

const base:WardrobeItem={id:"garment-1",name:"White tee",category:"top",subtype:"t-shirt",color:"white",style:["casual"],season:"all-season",wearCount:2,lastWornDays:1,source:"ai-confirmed",art:"photo"};

test("an exact outfit product requires persisted registry evidence",()=>{
  const exact=wardrobeItemToOutfitPiece({...base,identityStatus:"verified",registryProductId:"product-1",brand:"Test Brand",sku:"TB-1"});
  assert.equal(exact.resolution.state,"EXACT_VERIFIED_PRODUCT");
  assert.equal(exact.resolution.registryProductId,"product-1");
  const labelOnly=wardrobeItemToOutfitPiece({...base,identityStatus:"suggested",brand:"Test Brand",sku:"TB-1"});
  assert.equal(labelOnly.resolution.state,"GENERIC_UNVERIFIED");
  assert.equal(labelOnly.resolution.registryProductId,undefined);
});

test("saved outfit references preserve every piece and reject cross-wardrobe IDs",()=>{
  const second={...base,id:"garment-2",name:"Black trousers",category:"bottom",subtype:"dress-pants" as const};
  const pieces=buildOutfitPieceReferences([base.id,second.id,base.id],[base,second]);
  assert.deepEqual(pieces.map(piece=>piece.wardrobeItemId),["garment-1","garment-2"]);
  assert.throws(()=>buildOutfitPieceReferences(["another-account-item"],[base]),/must belong/i);
});
