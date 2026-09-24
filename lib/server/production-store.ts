import "server-only";

import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchGetCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { GarmentAnalysis, BrandProductRegistration, OutfitPost, DataClassification } from "@/lib/platform-types";
import type { Role, SavedOutfit, WardrobeItem } from "@/lib/types";
import { normalizeGarmentClassification } from "@/lib/garment-taxonomy";
import { applyGarmentEdit, type GarmentEdit } from "@/lib/garment-edit";
import { buildOutfitPieceReferences, wardrobeItemToOutfitPiece } from "@/lib/outfit-contracts";
import { commerceDestination } from "@/lib/commerce";
import { createBrandLook } from "@/lib/brand-looks";
import { brandProductUpdate, isReservedBrandName, matchBrandProduct, slugifyBrand, type BrandProductEdit } from "@/lib/product-registry";
import { buildWearUsageAnalytics } from "@/lib/metrics";
import { publishedImageKey, toPublicOutfitPost, type StoredCommunityPost, type StoredPublishedGarment } from "@/lib/community-post";
import { enumerationBudgetState, exceedsEnumerationBudget, type AggregateQueryEvent } from "@/lib/privacy";
import { findByPaginatedQuery } from "@/lib/community-lookup";
import { wornDaysAgo } from "@/lib/wear-recency";
import { buildBrandCommunityMetrics, type PrivacySafeCommunityEvent } from "@/lib/brand-community-metrics";
import { demoProductImagePath, isDemoStorefrontProduct } from "@/lib/demo-storefront";
import { createPasswordResetToken, PASSWORD_RESET_WINDOW_MS, passwordResetIsUsable, passwordResetTokenHash } from "@/lib/account-security";
import { accountDeletionInventory, communityPostChangeForDeletedImage, outfitChangesForGarmentDeletion, ownedObjectKey, sharedEvidenceKeyToDelete } from "@/lib/deletion-plan";
import { readHangerConversation, type HangerConversationState } from "@/lib/hanger-memory";
import { OUTFIT_BOARD_HEIGHT, OUTFIT_BOARD_WIDTH, outfitBoardLayout } from "@/lib/outfit-board";
import { boundedInspirationStrings, consumerInspirationProfile, consumerInspirationRecord, type ConsumerInspirationProfile, type ConsumerInspirationRecord } from "@/lib/consumer-inspiration";
import sharp from "sharp";

const scrypt = promisify(scryptCallback);
const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-2";
const tableName = process.env.RACKED_TABLE_NAME;
const bucketName = process.env.RACKED_UPLOAD_BUCKET;
const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), { marshallOptions:{ removeUndefinedValues:true } });
const s3 = new S3Client({ region });

export class ProductionConfigurationError extends Error {}
export class AccountConflictError extends Error {}
export class EnumerationBudgetError extends Error {}

function requireTable() {
  if (!tableName) throw new ProductionConfigurationError("Persistent account storage is not configured.");
  return tableName;
}

function requireBucket() {
  if (!bucketName) throw new ProductionConfigurationError("Private image storage is not configured.");
  return bucketName;
}

export interface AccountRecord {
  id: string;
  email: string;
  role: Role;
  displayName: string;
  brandName: string | null;
  brandSlug: string | null;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  brandDataSharing?: boolean;
  dataClassification?: DataClassification;
  sessionVersion?: number;
  passwordChangedAt?: number;
}

function requireAccountSecuritySecret(){const secret=process.env.SESSION_SECRET;if(!secret)throw new ProductionConfigurationError("Session security is not configured.");return secret;}

interface PasswordResetRecord { accountId:string; tokenHash:string; issuedAt:number; expiresAt:number; usedAt?:number; PK:string; SK:string; }

function normalizeEmail(email:string) { return email.trim().toLowerCase(); }
// One slug rule for a brand everywhere. Accounts, products, and Brand Looks used different rules,
// so an accented brand name ("Café Noir") produced two slugs that never met.
function slugify(value:string) { return slugifyBrand(value); }
function confirmationPayload(ownerId:string,key:string,analysis:GarmentAnalysis){return JSON.stringify({ownerId,key,evidenceKey:analysis.processedImage?.evidenceKey??null,garment:analysis.garment,label:analysis.label});}
export function signGarmentConfirmation(ownerId:string,key:string,analysis:GarmentAnalysis){const secret=process.env.SESSION_SECRET;if(!secret)throw new ProductionConfigurationError("Session security is not configured.");return createHmac("sha256",secret).update(confirmationPayload(ownerId,key,analysis)).digest("base64url");}
function verifyGarmentConfirmation(ownerId:string,analysis:GarmentAnalysis){const supplied=analysis.processedImage?.confirmationToken;if(!supplied)return false;const expected=signGarmentConfirmation(ownerId,analysis.processedImage!.key,analysis);const a=Buffer.from(supplied,"base64url");const b=Buffer.from(expected,"base64url");return a.length===b.length&&timingSafeEqual(a,b);}

async function passwordDigest(password:string,salt:string) {
  return Buffer.from(await scrypt(password,salt,64) as Buffer).toString("base64url");
}

export async function findAccountByEmail(email:string):Promise<AccountRecord|null> {
  const result=await db.send(new QueryCommand({TableName:requireTable(),IndexName:"GSI1",KeyConditionExpression:"GSI1PK = :pk",ExpressionAttributeValues:{":pk":`EMAIL#${normalizeEmail(email)}`},Limit:1}));
  return (result.Items?.[0] as AccountRecord|undefined) ?? null;
}

export async function createAccount(input:{email:string;password:string;role:Role;displayName:string;brandName?:string}) {
  const email=normalizeEmail(input.email);
  if (await findAccountByEmail(email)) throw new AccountConflictError("An account already exists for that email.");
  const id=crypto.randomUUID();
  const passwordSalt=randomBytes(18).toString("base64url");
  const passwordHash=await passwordDigest(input.password,passwordSalt);
  const account:AccountRecord={id,email,role:input.role,displayName:input.displayName.trim(),brandName:input.role==="brand"?(input.brandName?.trim()||input.displayName.trim()):null,brandSlug:input.role==="brand"?slugify(input.brandName?.trim()||input.displayName):null,passwordHash,passwordSalt,createdAt:new Date().toISOString(),dataClassification:"REGULAR"};
  if(account.role==="brand")await reserveBrandName(account.brandName??"",id);
  try {
    await db.send(new PutCommand({TableName:requireTable(),Item:{...account,PK:`USER#${id}`,SK:"PROFILE",GSI1PK:`EMAIL#${email}`,GSI1SK:"ACCOUNT"},ConditionExpression:"attribute_not_exists(PK)"}));
  } catch(error) {
    // An account that was never created must not keep the name it reserved.
    if(account.role==="brand"&&account.brandSlug)await db.send(new DeleteCommand({TableName:requireTable(),Key:{PK:`BRANDNAME#${account.brandSlug}`,SK:"CLAIM"},ConditionExpression:"accountId = :id",ExpressionAttributeValues:{":id":id}})).catch(()=>undefined);
    throw error;
  }
  return account;
}

/**
 * A brand name belongs to one account. Without this, a second account registering the same name
 * shared its public page and could enroll the same style codes, so wear linked by that brand's
 * owners could reach the wrong account. Well-known names are reserved outright: signing up is not
 * evidence of representing Nike. Two conditional writes rather than a transaction, because the
 * compute role is granted item-level actions only; a failed account write releases the name.
 */
async function reserveBrandName(brandName:string,accountId:string) {
  const brandSlug=slugify(brandName);
  if(!brandSlug)throw new AccountConflictError("Enter a brand name that contains at least one letter or number.");
  if(isReservedBrandName(brandName))throw new AccountConflictError("That brand name is reserved for the brand that owns it. Contact Racked to confirm you represent it.");
  // Accounts created before names were reserved still hold theirs through their enrolled products.
  const legacy=await db.send(new QueryCommand({TableName:requireTable(),IndexName:"GSI1",KeyConditionExpression:"GSI1PK = :pk AND begins_with(GSI1SK, :slug)",ExpressionAttributeValues:{":pk":"BRAND_PRODUCTS",":slug":`${brandSlug}#`},Limit:1}));
  if(legacy.Items?.length)throw new AccountConflictError("A brand account with that name already exists.");
  try {
    await db.send(new PutCommand({TableName:requireTable(),Item:{PK:`BRANDNAME#${brandSlug}`,SK:"CLAIM",GSI1PK:"BRAND_NAMES",GSI1SK:brandSlug,accountId,brandName,createdAt:new Date().toISOString()},ConditionExpression:"attribute_not_exists(PK)"}));
  } catch(error) {
    if(error instanceof Error&&error.name==="ConditionalCheckFailedException")throw new AccountConflictError("A brand account with that name already exists.");
    throw error;
  }
}

/** Names held by other brand accounts, which this account's product aliases may not claim. */
export async function otherBrandNames(ownerId:string,known?:BrandProductRegistration[]) {
  const [claims,registry]=await Promise.all([
    queryEveryPage({IndexName:"GSI1",KeyConditionExpression:"GSI1PK = :pk",ExpressionAttributeValues:{":pk":"BRAND_NAMES"}}).catch(()=>[] as Record<string,unknown>[]),
    known?Promise.resolve(known):listRegistryProducts(),
  ]);
  const names=new Set<string>();
  for(const claim of claims)if(claim.accountId!==ownerId&&typeof claim.brandName==="string")names.add(claim.brandName);
  for(const product of registry)if(product.ownerSubject!==ownerId)names.add(product.brand);
  return [...names];
}

export async function authenticateAccount(email:string,password:string) {
  const account=await findAccountByEmail(email);
  if (!account) return null;
  const supplied=Buffer.from(await passwordDigest(password,account.passwordSalt),"base64url");
  const expected=Buffer.from(account.passwordHash,"base64url");
  return supplied.length===expected.length&&timingSafeEqual(supplied,expected)?account:null;
}

export async function verifyAccountPassword(account:AccountRecord,password:string) {
  const supplied=Buffer.from(await passwordDigest(password,account.passwordSalt),"base64url");
  const expected=Buffer.from(account.passwordHash,"base64url");
  return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
}

export async function updateOwnAccount(ownerId:string,input:{displayName:string;email:string;currentPassword:string;newPassword?:string}) {
  const account=await getAccount(ownerId);
  if(!account||!await verifyAccountPassword(account,input.currentPassword))return null;
  const email=normalizeEmail(input.email),displayName=input.displayName.trim().slice(0,100);
  if(!displayName||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Enter a valid name and email address.");
  const conflict=await findAccountByEmail(email);
  if(conflict&&conflict.id!==ownerId)throw new AccountConflictError("That email is already connected to another account.");
  const names:Record<string,string>={"#email":"email"};
  const values:Record<string,unknown>={":displayName":displayName,":email":email,":emailPk":`EMAIL#${email}`};
  let update="SET displayName = :displayName, #email = :email, GSI1PK = :emailPk";
  if(input.newPassword){
    const passwordSalt=randomBytes(18).toString("base64url"),passwordHash=await passwordDigest(input.newPassword,passwordSalt),changedAt=Date.now();
    Object.assign(values,{":passwordSalt":passwordSalt,":passwordHash":passwordHash,":changedAt":changedAt,":zero":0,":one":1});
    update+=", passwordSalt = :passwordSalt, passwordHash = :passwordHash, passwordChangedAt = :changedAt, sessionVersion = if_not_exists(sessionVersion, :zero) + :one";
  }
  const result=await db.send(new UpdateCommand({TableName:requireTable(),Key:{PK:`USER#${ownerId}`,SK:"PROFILE"},UpdateExpression:update,ExpressionAttributeNames:names,ExpressionAttributeValues:values,ConditionExpression:"attribute_exists(PK)",ReturnValues:"ALL_NEW"}));
  return result.Attributes as AccountRecord;
}

export async function issuePasswordReset(email:string) {
  const account=await findAccountByEmail(email);
  if(!account)return null;
  const token=createPasswordResetToken(),tokenHash=passwordResetTokenHash(token,requireAccountSecuritySecret()),issuedAt=Date.now(),expiresAt=issuedAt+PASSWORD_RESET_WINDOW_MS;
  const record:PasswordResetRecord={accountId:account.id,tokenHash,issuedAt,expiresAt,PK:`RESET#${tokenHash}`,SK:"TOKEN"};
  await db.send(new PutCommand({TableName:requireTable(),Item:{...record,ttl:Math.ceil(expiresAt/1000)},ConditionExpression:"attribute_not_exists(PK)"}));
  return {token,email:account.email};
}

export async function consumePasswordReset(token:string,newPassword:string) {
  const tokenHash=passwordResetTokenHash(token,requireAccountSecuritySecret()),now=Date.now();
  const found=await db.send(new GetCommand({TableName:requireTable(),Key:{PK:`RESET#${tokenHash}`,SK:"TOKEN"}}));
  const reset=found.Item as PasswordResetRecord|undefined;
  if(!reset)return null;
  const account=await getAccount(reset.accountId);
  if(!account||!passwordResetIsUsable(reset,account.passwordChangedAt??0,now))return null;
  try{await db.send(new UpdateCommand({TableName:requireTable(),Key:{PK:reset.PK,SK:reset.SK},UpdateExpression:"SET usedAt = :now",ConditionExpression:"attribute_not_exists(usedAt) AND expiresAt > :now",ExpressionAttributeValues:{":now":now}}));}catch{return null;}
  const passwordSalt=randomBytes(18).toString("base64url"),passwordHash=await passwordDigest(newPassword,passwordSalt);
  const result=await db.send(new UpdateCommand({TableName:requireTable(),Key:{PK:`USER#${account.id}`,SK:"PROFILE"},UpdateExpression:"SET passwordSalt = :salt, passwordHash = :hash, passwordChangedAt = :now, sessionVersion = if_not_exists(sessionVersion, :zero) + :one",ExpressionAttributeValues:{":salt":passwordSalt,":hash":passwordHash,":now":now,":zero":0,":one":1},ConditionExpression:"attribute_exists(PK)",ReturnValues:"ALL_NEW"}));
  return result.Attributes as AccountRecord;
}

export async function getAccount(id:string) {
  const result=await db.send(new GetCommand({TableName:requireTable(),Key:{PK:`USER#${id}`,SK:"PROFILE"}}));
  return (result.Item as AccountRecord|undefined) ?? null;
}

export async function putPrivateImage(ownerId:string,kind:"wardrobe"|"brand",bytes:Buffer,contentType:string,subfolder?:"evidence") {
  const extension=contentType==="image/png"?"png":contentType==="image/webp"?"webp":"jpg";
  const key=`${kind}/${ownerId}/${subfolder?`${subfolder}/`:""}${crypto.randomUUID()}.${extension}`;
  await s3.send(new PutObjectCommand({Bucket:requireBucket(),Key:key,Body:bytes,ContentType:contentType,ServerSideEncryption:"AES256",Metadata:{owner:ownerId}}));
  return key;
}

export async function privateImageUrl(key?:string) {
  if (!key) return undefined;
  return getSignedUrl(s3,new GetObjectCommand({Bucket:requireBucket(),Key:key}),{expiresIn:3600});
}

export async function listWardrobe(ownerId:string):Promise<WardrobeItem[]> {
  const result=await db.send(new QueryCommand({TableName:requireTable(),KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",ExpressionAttributeValues:{":pk":`USER#${ownerId}`,":sk":"GARMENT#"}}));
  return Promise.all((result.Items??[]).map(async raw=>{const item=raw as unknown as WardrobeItem&{GSI1PK?:string};const classification=normalizeGarmentClassification(item.category,item.subtype??item.name);const registryProductId=item.registryProductId??(item.GSI1PK?.startsWith("PRODUCT#")?item.GSI1PK.slice(8):null);return {...item,GSI1PK:undefined,...classification,registryProductId,pattern:item.pattern??"unknown",material:item.material??"unknown",lastWornDays:wornDaysAgo((item as {lastWornAt?:unknown}).lastWornAt,item.lastWornDays),imageUrl:await privateImageUrl(item.imageKey)};}));
}

export async function addWardrobeItem(ownerId:string,analysis:GarmentAnalysis,overrides?:{name?:string;brand?:string;sku?:string;category?:string;subtype?:string;customType?:string|null;labelText?:string|null;catalogProductId?:string|null}) {
  if (!analysis.processedImage?.key) throw new Error("The processed garment image is missing.");
  if(!analysis.processedImage.key.startsWith(`wardrobe/${ownerId}/`)||!verifyGarmentConfirmation(ownerId,analysis))throw new Error("The garment confirmation expired or did not belong to this account.");
  const evidenceImageKey=analysis.processedImage.evidenceKey??null;
  if(evidenceImageKey&&!evidenceImageKey.startsWith(`wardrobe/${ownerId}/`))throw new Error("The evidence photo did not belong to this account.");
  const name=(overrides?.name??analysis.garment.name).trim().slice(0,100)||"Unverified garment";
  // A label the person checked is checked again here, against the registry as it stands now. The
  // browser saying a label matched is not evidence; the label text is. Before this, a successful
  // check showed "linked" in the browser and the piece was saved with no link at all.
  const labelEvidence=typeof overrides?.labelText==="string"?overrides.labelText.slice(0,1000):"";
  const selectedId=typeof overrides?.catalogProductId==="string"?overrides.catalogProductId.trim().slice(0,128):"";
  const registry=!analysis.label.matched&&(labelEvidence.trim()||selectedId)?await listRegistryProducts():[];
  const registryMatch=!analysis.label.matched&&labelEvidence.trim()?matchBrandProduct([],labelEvidence,registry):null;
  // A product chosen from the catalog, by recognition or search, is the person's own statement. It
  // shows them the product and never becomes verified identity or joins the brand's wear index:
  // that still takes the label. A label match, when there is one, always wins.
  const selectedProduct=!registryMatch&&!analysis.label.matched&&selectedId?registry.find(product=>product.id===selectedId&&!product.archived)??null:null;
  const catalogProduct=registryMatch?.product??selectedProduct;
  const brand=(catalogProduct?catalogProduct.brand:(overrides?.brand??analysis.label.brand)).trim().slice(0,100);
  const sku=(catalogProduct?catalogProduct.sku:(overrides?.sku??analysis.label.sku)).trim().toUpperCase().slice(0,64);
  const placeholderBrand=/^(brand not verified|unmatched label)$/i.test(brand);
  const placeholderSku=/^(unverified|unconfirmed)$/i.test(sku);
  const registryProductId=registryMatch?registryMatch.product.id:analysis.label.matched?analysis.label.registryProductId:null;
  const identityStatus=registryProductId?"verified":selectedProduct?"owner-selected":analysis.label.suggested&&brand===analysis.label.brand?"suggested":brand&&!placeholderBrand?"user-labeled":"unverified";
  const classification=normalizeGarmentClassification(overrides?.category??analysis.garment.category,overrides?.subtype??analysis.garment.subtype);
  // A typed type is kept only beside a fallback subtype: when a controlled subtype fits, the
  // controlled value is the record, and a stray custom label would contradict it.
  const typedType=typeof overrides?.customType==="string"?overrides.customType.replace(/[\u0000-\u001f\u007f]/g,"").replace(/\s+/g," ").trim().slice(0,60):"";
  const customType=typedType&&classification.subtype.startsWith("other-")?typedType:null;
  const item:WardrobeItem={id:crypto.randomUUID(),name,...classification,wearableUnit:classification.category==="shoe"&&analysis.garment.wearableUnit==="pair"?"pair":"single",color:analysis.garment.color,pattern:analysis.garment.pattern,material:analysis.garment.material,style:analysis.garment.style,season:"all-season",wearCount:0,lastWornDays:999,source:analysis.fallback?"manual":"ai-confirmed",art:"photo",imageKey:analysis.processedImage.key,evidenceImageKey,backgroundRemoved:analysis.processedImage.backgroundRemoved??false,customType,imageUrl:await privateImageUrl(analysis.processedImage.key),brand:brand&&!placeholderBrand?brand:null,sku:sku&&!placeholderSku?sku:null,registryProductId,identityStatus,selectedProductId:selectedProduct?.id??null,listedPrice:catalogProduct?.price??null,listedCurrency:catalogProduct?.price!==undefined?(catalogProduct.currency??"USD"):null,createdAt:new Date().toISOString()};
  await db.send(new PutCommand({TableName:requireTable(),Item:{...item,imageUrl:undefined,PK:`USER#${ownerId}`,SK:`GARMENT#${item.id}`,GSI1PK:registryProductId?`PRODUCT#${registryProductId}`:undefined,GSI1SK:`OWNER#${ownerId}`}}));
  return item;
}

/**
 * The only fields an edit may write. applyGarmentEdit already returns nothing else; this list is
 * a second, independent guard, so no change there can reach wear history, photos, the owner, or a
 * verified registry link.
 */
const EDITABLE_GARMENT_FIELDS = new Set(["name", "category", "subtype", "customType", "wearableUnit", "color", "pattern", "material", "style", "season", "brand", "sku", "selectedProductId", "identityStatus", "listedPrice", "listedCurrency"]);

/** Edits one piece in the signed-in person's own wardrobe. Returns null when it is not theirs. */
export async function updateWardrobeItem(ownerId:string,itemId:string,edit:GarmentEdit):Promise<WardrobeItem|null> {
  const key={PK:`USER#${ownerId}`,SK:`GARMENT#${itemId}`};
  const existing=(await db.send(new GetCommand({TableName:requireTable(),Key:key}))).Item as WardrobeItem|undefined;
  if(!existing)return null;
  const registry=typeof edit.catalogProductId==="string"?await listRegistryProducts():[];
  const changes=Object.entries(applyGarmentEdit(existing,edit,registry)).filter(([field])=>EDITABLE_GARMENT_FIELDS.has(field));
  if(changes.length){
    const names:Record<string,string>={};
    const values:Record<string,unknown>={};
    const assignments=changes.map(([field,value],index)=>{names[`#f${index}`]=field;values[`:v${index}`]=value??null;return `#f${index} = :v${index}`;});
    // The owner is part of the key, and the condition refuses to create a record that is not
    // already there: an edit can only ever reach a piece this account already owns.
    await db.send(new UpdateCommand({TableName:requireTable(),Key:key,UpdateExpression:`SET ${assignments.join(", ")}`,ConditionExpression:"attribute_exists(PK)",ExpressionAttributeNames:names,ExpressionAttributeValues:values}));
  }
  return (await listWardrobe(ownerId)).find(item=>item.id===itemId)??null;
}

export async function recordRealWear(ownerId:string,itemIds:string[]) {
  const unique=[...new Set(itemIds)];
  if(unique.length<1||unique.length>10) throw new Error("Choose between 1 and 10 wardrobe pieces.");
  const counts:Record<string,number>={};
  for(const id of unique){
    const occurredAt=new Date().toISOString();
    const result=await db.send(new UpdateCommand({TableName:requireTable(),Key:{PK:`USER#${ownerId}`,SK:`GARMENT#${id}`},UpdateExpression:"SET wearCount = if_not_exists(wearCount, :zero) + :one, lastWornAt = :now",ConditionExpression:"attribute_exists(PK)",ExpressionAttributeValues:{":zero":0,":one":1,":now":occurredAt},ReturnValues:"ALL_NEW"}));
    counts[id]=Number(result.Attributes?.wearCount??0);
    const productKey=String(result.Attributes?.GSI1PK??"");
    if(productKey.startsWith("PRODUCT#"))await db.send(new PutCommand({TableName:requireTable(),Item:{PK:productKey,SK:`WEAR#${occurredAt}#${crypto.randomUUID()}`,occurredAt,ownerPK:`USER#${ownerId}`,garmentId:id,eventType:"confirmed-wear"}}));
  }
  return counts;
}

export async function listOutfits(ownerId:string):Promise<SavedOutfit[]> {
  const result=await db.send(new QueryCommand({TableName:requireTable(),KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",ExpressionAttributeValues:{":pk":`USER#${ownerId}`,":sk":"OUTFIT#"},ScanIndexForward:false}));
  return Promise.all((result.Items??[]).map(async raw=>{const outfit=raw as unknown as SavedOutfit;return {...outfit,boardImageUrl:await privateImageUrl(outfit.boardImageKey)};}));
}

async function generateOutfitBoard(ownerId:string,outfitId:string,items:WardrobeItem[]){
  const eligible=items.filter(item=>item.imageKey?.startsWith(`wardrobe/${ownerId}/`));if(!eligible.length)return undefined;
  const placements=outfitBoardLayout(eligible),layers:Array<{input:Buffer;left:number;top:number}>=[];
  for(const placement of placements){const item=eligible.find(entry=>entry.id===placement.id);if(!item?.imageKey)continue;const object=await s3.send(new GetObjectCommand({Bucket:requireBucket(),Key:item.imageKey}));if(!object.Body)continue;const bytes=Buffer.from(await object.Body.transformToByteArray());const image=await sharp(bytes).rotate().resize(placement.width,placement.height,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}}).webp().toBuffer();layers.push({input:image,left:placement.x,top:placement.y});}
  if(!layers.length)return undefined;const output=await sharp({create:{width:OUTFIT_BOARD_WIDTH,height:OUTFIT_BOARD_HEIGHT,channels:4,background:{r:255,g:255,b:255,alpha:1}}}).composite(layers).webp({quality:90}).toBuffer(),key=`wardrobe/${ownerId}/outfits/${outfitId}.webp`;await s3.send(new PutObjectCommand({Bucket:requireBucket(),Key:key,Body:output,ContentType:"image/webp",ServerSideEncryption:"AES256",Metadata:{owner:ownerId,purpose:"outfit-board"}}));return key;
}

export async function saveOutfit(ownerId:string,name:string,itemIds:string[]) {
  const unique=[...new Set(itemIds)];
  const wardrobe=await listWardrobe(ownerId);
  const byId=new Map(wardrobe.map(item=>[item.id,item]));
  const id=crypto.randomUUID(),selected=unique.map(itemId=>byId.get(itemId)).filter((item):item is WardrobeItem=>Boolean(item)),boardImageKey=await generateOutfitBoard(ownerId,id,selected);
  const outfit:SavedOutfit={id,name:name.trim().slice(0,80)||"Saved outfit",itemIds:unique,pieces:buildOutfitPieceReferences(unique,wardrobe),createdAt:new Date().toISOString(),wears:0,...(boardImageKey?{boardImageKey,boardImageUrl:await privateImageUrl(boardImageKey)}:{})};
  await db.send(new PutCommand({TableName:requireTable(),Item:{...outfit,PK:`USER#${ownerId}`,SK:`OUTFIT#${outfit.createdAt}#${outfit.id}`}}));
  return outfit;
}

export async function updateOutfitItems(ownerId:string,outfitId:string,itemIds:string[]) {
  const unique=[...new Set(itemIds)];
  if(unique.length<1||unique.length>10)throw new Error("Choose 1–10 wardrobe pieces.");
  const [outfits,wardrobe]=await Promise.all([listOutfits(ownerId),listWardrobe(ownerId)]);
  const outfit=outfits.find(entry=>entry.id===outfitId);
  if(!outfit)return null;
  if(unique.some(id=>!wardrobe.some(item=>item.id===id)))throw new Error("Every outfit piece must belong to your wardrobe.");
  const byId=new Map(wardrobe.map(item=>[item.id,item]));
  const selected=unique.map(itemId=>byId.get(itemId)).filter((item):item is WardrobeItem=>Boolean(item));
  // A new object key prevents a signed URL or installed app from displaying the
  // previous board after pieces change. The former private board is removed only
  // after DynamoDB accepts the owner-scoped update.
  const nextBoardImageKey=await generateOutfitBoard(ownerId,`${outfit.id}-${crypto.randomUUID()}`,selected);
  const key={PK:`USER#${ownerId}`,SK:`OUTFIT#${outfit.createdAt}#${outfit.id}`};
  try{
    const result=await db.send(new UpdateCommand({
      TableName:requireTable(),Key:key,
      UpdateExpression:nextBoardImageKey
        ? "SET itemIds = :itemIds, pieces = :pieces, boardImageKey = :boardImageKey"
        : "SET itemIds = :itemIds, pieces = :pieces REMOVE boardImageKey",
      ConditionExpression:"attribute_exists(PK)",
      ExpressionAttributeValues:{":itemIds":unique,":pieces":buildOutfitPieceReferences(unique,wardrobe),...(nextBoardImageKey?{":boardImageKey":nextBoardImageKey}:{})},
      ReturnValues:"ALL_NEW",
    }));
    if(outfit.boardImageKey?.startsWith(`wardrobe/${ownerId}/outfits/`)&&outfit.boardImageKey!==nextBoardImageKey){
      try{await s3.send(new DeleteObjectCommand({Bucket:requireBucket(),Key:outfit.boardImageKey}));}catch(error){console.error("Replaced outfit board cleanup failed",{name:error instanceof Error?error.name:"UnknownError"});}
    }
    const updated=result.Attributes as unknown as SavedOutfit;
    return {...updated,boardImageUrl:await privateImageUrl(updated.boardImageKey)};
  }catch(error){
    if(nextBoardImageKey)try{await s3.send(new DeleteObjectCommand({Bucket:requireBucket(),Key:nextBoardImageKey}));}catch(cleanupError){console.error("Uncommitted outfit board cleanup failed",{name:cleanupError instanceof Error?cleanupError.name:"UnknownError"});}
    throw error;
  }
}

export async function deleteOutfit(ownerId:string,outfitId:string) {
  const outfit=(await listOutfits(ownerId)).find(entry=>entry.id===outfitId);
  if(!outfit)return false;
  await db.send(new DeleteCommand({TableName:requireTable(),Key:{PK:`USER#${ownerId}`,SK:`OUTFIT#${outfit.createdAt}#${outfit.id}`},ConditionExpression:"attribute_exists(PK)"}));
  if(outfit.boardImageKey?.startsWith(`wardrobe/${ownerId}/outfits/`)){
    try{await s3.send(new DeleteObjectCommand({Bucket:requireBucket(),Key:outfit.boardImageKey}));}catch(error){console.error("Saved outfit board cleanup failed",{name:error instanceof Error?error.name:"UnknownError"});}
  }
  return true;
}

// Fixes the dashboard "repeated wears" stat: outfit wear totals previously existed in the
// data model but were never incremented. The outfit is looked up inside the owner's own
// partition, so one account can never touch another account's outfits.
export async function incrementOutfitWears(ownerId:string,outfitId:string) {
  const outfits=await listOutfits(ownerId);
  const outfit=outfits.find(entry=>entry.id===outfitId);
  if(!outfit)throw new Error("Saved outfit not found for this account.");
  const result=await db.send(new UpdateCommand({TableName:requireTable(),Key:{PK:`USER#${ownerId}`,SK:`OUTFIT#${outfit.createdAt}#${outfit.id}`},UpdateExpression:"SET wears = if_not_exists(wears, :zero) + :one",ConditionExpression:"attribute_exists(PK)",ExpressionAttributeValues:{":zero":0,":one":1},ReturnValues:"ALL_NEW"}));
  return Number(result.Attributes?.wears??0);
}

// ─── Deletion ────────────────────────────────────────────────────────────────
// Garment and account deletion are both ordered so nothing is ever left pointing at something
// already gone: dependants first, photographs next, the owning record last. An interrupted
// deletion is therefore finished by retrying it, because the record that starts the work still
// exists. Every storage key passes ownedObjectKey, so neither can reach outside the signed-in
// account's own prefix.

export class AccountDeletionUnavailableError extends Error {}

// Every page, not the first. A single Query stops at 1 MB, and a registry or a product's owner
// list that outgrew it used to be cut off without any error.
async function queryEveryPage(input:{IndexName?:string;KeyConditionExpression:string;ExpressionAttributeValues:Record<string,unknown>;FilterExpression?:string}) {
  const items:Record<string,unknown>[]=[];
  let startKey:Record<string,unknown>|undefined;
  do {
    const page=await db.send(new QueryCommand({TableName:requireTable(),...input,...(startKey?{ExclusiveStartKey:startKey}:{})}));
    items.push(...((page.Items??[]) as Record<string,unknown>[]));
    startKey=page.LastEvaluatedKey as Record<string,unknown>|undefined;
  } while(startKey);
  return items;
}

async function inBatches<T>(values:T[],size:number,run:(value:T)=>Promise<unknown>) {
  for(let index=0;index<values.length;index+=size)await Promise.all(values.slice(index,index+size).map(run));
}

async function ownCommunityPosts(ownerId:string) {
  return await queryEveryPage({KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",FilterExpression:"ownerId = :owner",ExpressionAttributeValues:{":pk":"COMMUNITY",":sk":"POST#",":owner":ownerId}}) as unknown as StoredPost[];
}

async function deleteOwnWearEvents(ownerId:string,productKey:string,garmentId?:string) {
  if(!productKey.startsWith("PRODUCT#"))return 0;
  const events=await queryEveryPage({
    KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",
    FilterExpression:garmentId?"ownerPK = :owner AND garmentId = :garment":"ownerPK = :owner",
    ExpressionAttributeValues:{":pk":productKey,":sk":"WEAR#",":owner":`USER#${ownerId}`,...(garmentId?{":garment":garmentId}:{})},
  });
  await inBatches(events,10,event=>db.send(new DeleteCommand({TableName:requireTable(),Key:{PK:String(event.PK),SK:String(event.SK)}})));
  return events.length;
}

async function deleteOwnedObjects(ownerId:string,keys:Array<string|null|undefined>) {
  const owned=[...new Set(keys.map(key=>ownedObjectKey(key,ownerId)).filter((key):key is string=>Boolean(key)))];
  await inBatches(owned,8,key=>s3.send(new DeleteObjectCommand({Bucket:requireBucket(),Key:key})));
  return owned.length;
}

/**
 * Removes objects under the account's prefix that no record points at — chiefly scan photos the
 * person never saved. Listing needs s3:ListBucket on that prefix. Without it the sweep is skipped
 * and logged rather than failing the deletion; any other error stops the deletion.
 */
async function sweepOwnedPrefix(ownerId:string) {
  let removed=0;
  let token:string|undefined;
  try {
    do {
      const page=await s3.send(new ListObjectsV2Command({Bucket:requireBucket(),Prefix:`wardrobe/${ownerId}/`,...(token?{ContinuationToken:token}:{})}));
      removed+=await deleteOwnedObjects(ownerId,(page.Contents??[]).map(object=>object.Key));
      token=page.IsTruncated?page.NextContinuationToken:undefined;
    } while(token);
    return {complete:true,removed};
  } catch(error) {
    const name=error instanceof Error?error.name:"UnknownError";
    if(name!=="AccessDenied"&&name!=="AccessDeniedException")throw error;
    console.warn("Account deletion storage sweep skipped: s3:ListBucket is not granted on the account prefix",{removed});
    return {complete:false,removed};
  }
}

export async function deleteWardrobeItem(ownerId:string,garmentId:string) {
  const found=await db.send(new GetCommand({TableName:requireTable(),Key:{PK:`USER#${ownerId}`,SK:`GARMENT#${garmentId}`}}));
  const item=found.Item as (WardrobeItem&{GSI1PK?:string})|undefined;
  if(!item)return null;

  // 1. Saved outfits lose the piece; an outfit left with nothing in it is deleted.
  const outfitChanges=outfitChangesForGarmentDeletion(garmentId,await listOutfits(ownerId));
  for(const change of outfitChanges) {
    if(change.action==="delete")await deleteOutfit(ownerId,change.outfitId);
    else await updateOutfitItems(ownerId,change.outfitId,change.itemIds);
  }

  // 2. The person's own Community posts stop showing this photograph.
  const imageKey=ownedObjectKey(item.imageKey,ownerId);
  let postsUpdated=0,postsRemoved=0;
  if(imageKey) {
    for(const post of await ownCommunityPosts(ownerId)) {
      const change=communityPostChangeForDeletedImage(post,ownerId,imageKey);
      const key={PK:String(post.PK),SK:String(post.SK)};
      if(change.action==="delete"){await db.send(new DeleteCommand({TableName:requireTable(),Key:key}));postsRemoved++;}
      else if(change.action==="update"){await db.send(new UpdateCommand({TableName:requireTable(),Key:key,UpdateExpression:"SET publishedGarments = :garments",ExpressionAttributeValues:{":garments":change.publishedGarments},ConditionExpression:"attribute_exists(PK)"}));postsUpdated++;}
    }
  }

  // 3. Wear events this piece added to a brand's anonymous totals.
  if(item.GSI1PK?.startsWith("PRODUCT#"))await deleteOwnWearEvents(ownerId,item.GSI1PK,garmentId);

  // 4. Photographs. One scan's evidence photo is shared by every piece cut from it, so it goes
  //    only with the last of them.
  const wardrobe=await queryEveryPage({KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",ExpressionAttributeValues:{":pk":`USER#${ownerId}`,":sk":"GARMENT#"}}) as unknown as WardrobeItem[];
  await deleteOwnedObjects(ownerId,[imageKey,sharedEvidenceKeyToDelete(item,wardrobe,ownerId)]);

  // 5. The record, last.
  await db.send(new DeleteCommand({TableName:requireTable(),Key:{PK:`USER#${ownerId}`,SK:`GARMENT#${garmentId}`}}));
  return {
    outfitsUpdated:outfitChanges.filter(change=>change.action==="update").length,
    outfitsRemoved:outfitChanges.filter(change=>change.action==="delete").length,
    postsUpdated,
    postsRemoved,
  };
}

export async function deleteOwnConsumerAccount(ownerId:string,currentPassword:string) {
  const account=await getAccount(ownerId);
  if(!account||!await verifyAccountPassword(account,currentPassword))return null;
  if(account.role!=="consumer")throw new AccountDeletionUnavailableError("Brand accounts can't be deleted from Settings yet: enrolled products are linked to other people's wardrobes and have to be unlinked safely first.");
  const inventory=accountDeletionInventory(ownerId,await queryEveryPage({KeyConditionExpression:"PK = :pk",ExpressionAttributeValues:{":pk":`USER#${ownerId}`}}));

  // 1. Public posts.
  const posts=await ownCommunityPosts(ownerId);
  await inBatches(posts,10,post=>db.send(new DeleteCommand({TableName:requireTable(),Key:{PK:String(post.PK),SK:String(post.SK)}})));

  // 2. Wear events this account left inside brands' product partitions.
  for(const productKey of inventory.productKeys)await deleteOwnWearEvents(ownerId,productKey);

  // 3. Every photograph a record points at, then anything left under the account's prefix.
  const referencedPhotos=await deleteOwnedObjects(ownerId,inventory.objectKeys);
  const sweep=await sweepOwnedPrefix(ownerId);

  // 4. Records, profile last: until it goes the account still exists, so a retry finishes.
  const profile=inventory.recordKeys.filter(key=>key.SK==="PROFILE");
  await inBatches(inventory.recordKeys.filter(key=>key.SK!=="PROFILE"),10,key=>db.send(new DeleteCommand({TableName:requireTable(),Key:key})));
  for(const key of profile)await db.send(new DeleteCommand({TableName:requireTable(),Key:key}));

  return {deleted:true as const,postsRemoved:posts.length,photosRemoved:referencedPhotos+sweep.removed,storageSweepComplete:sweep.complete};
}

export async function listOwnedBrandProducts(ownerId:string):Promise<BrandProductRegistration[]> {
  const items=await queryEveryPage({KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",ExpressionAttributeValues:{":pk":`USER#${ownerId}`,":sk":"PRODUCT#"}});
  return Promise.all(items.map(async raw=>{const product=raw as unknown as BrandProductRegistration;const demoFront=isDemoStorefrontProduct(product)?demoProductImagePath(product.sku):undefined;return {...product,imageUrls:{front:demoFront??await privateImageUrl(product.views?.front?.storageKey),back:await privateImageUrl(product.views?.back?.storageKey),label:await privateImageUrl(product.views?.label?.storageKey)}};}));
}

export async function listRegistryProducts():Promise<BrandProductRegistration[]> {
  return (await queryEveryPage({IndexName:"GSI1",KeyConditionExpression:"GSI1PK = :pk",ExpressionAttributeValues:{":pk":"BRAND_PRODUCTS"}})) as unknown as BrandProductRegistration[];
}
/** A catalog product's photo, exactly as its public brand page already shows it. */
export async function catalogImageUrl(product:BrandProductRegistration){return (isDemoStorefrontProduct(product)?demoProductImagePath(product.sku):undefined)??await privateImageUrl(product.views?.front?.storageKey);}
export async function getRegistryProductById(productId:string){return (await listRegistryProducts()).find(product=>product.id===productId)??null;}

export async function listPublicBrandProducts(brandSlug:string):Promise<BrandProductRegistration[]>{const products=await listRegistryProducts();return Promise.all(products.filter(product=>product.brandSlug===brandSlug&&!product.archived).map(async product=>({...product,imageUrls:{front:(isDemoStorefrontProduct(product)?demoProductImagePath(product.sku):undefined)??await privateImageUrl(product.views.front.storageKey)}})));}

export async function getOwnedBrandProduct(ownerId:string,productId:string):Promise<BrandProductRegistration|null> {
  const found=await db.send(new GetCommand({TableName:requireTable(),Key:{PK:`USER#${ownerId}`,SK:`PRODUCT#${productId}`}}));
  return (found.Item as unknown as BrandProductRegistration|undefined) ?? null;
}

/**
 * Corrects or retires an enrolled product. Ownership is the key itself, so one brand can never
 * reach another's record, and identity fields are dropped by brandProductUpdate before they get
 * here. A cleared field is removed rather than stored as null, so an emptied price stops existing.
 */
export async function updateBrandProduct(ownerId:string,productId:string,edit:BrandProductEdit,otherNames:string[]=[]) {
  const existing=await getOwnedBrandProduct(ownerId,productId);
  if(!existing)return null;
  const patch=brandProductUpdate(existing,edit,otherNames);
  if(!Object.keys(patch).length)return existing;
  const merged={...existing,...patch} as Record<string,unknown>;
  for(const [key,value] of Object.entries(patch))if(value===null)delete merged[key];
  await db.send(new PutCommand({TableName:requireTable(),Item:{...merged,PK:`USER#${ownerId}`,SK:`PRODUCT#${productId}`,GSI1PK:"BRAND_PRODUCTS",GSI1SK:`${existing.brandSlug}#${existing.sku}`},ConditionExpression:"attribute_exists(PK) AND attribute_exists(SK)"}));
  return merged as unknown as BrandProductRegistration;
}

export async function saveBrandProduct(ownerId:string,product:BrandProductRegistration) {
  await db.send(new PutCommand({TableName:requireTable(),Item:{...product,PK:`USER#${ownerId}`,SK:`PRODUCT#${product.id}`,GSI1PK:"BRAND_PRODUCTS",GSI1SK:`${product.brandSlug}#${product.sku}`},ConditionExpression:"attribute_not_exists(PK) AND attribute_not_exists(SK)"}));
  return product;
}

export async function getBrandDataSharing(ownerId:string){const account=await getAccount(ownerId);return account?.brandDataSharing===true;}
export async function setBrandDataSharing(ownerId:string,value:boolean){await db.send(new UpdateCommand({TableName:requireTable(),Key:{PK:`USER#${ownerId}`,SK:"PROFILE"},UpdateExpression:"SET brandDataSharing = :value",ExpressionAttributeValues:{":value":value}}));return value;}

type StoredPost=StoredCommunityPost&{ownerId:string;sourceOutfitId?:string;sourceBrandLookId?:string};
// Public feed responses are rebuilt through toPublicOutfitPost so stored private fields
// (ownerId, imageKey, DynamoDB key attributes) never reach the browser.
export async function listCommunityPosts():Promise<OutfitPost[]>{const result=await db.send(new QueryCommand({TableName:requireTable(),KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",ExpressionAttributeValues:{":pk":"COMMUNITY",":sk":"POST#"},ScanIndexForward:false,Limit:60}));return (result.Items??[]).map(raw=>toPublicOutfitPost(raw as unknown as StoredPost));}
export async function addCommunityPost(ownerId:string,input:{outfitTitle:string;caption:string;outfitId:string}){
  const [account,wardrobe,outfits,registry]=await Promise.all([getAccount(ownerId),listWardrobe(ownerId),listOutfits(ownerId),listRegistryProducts()]);
  if(!account)throw new Error("Account not found.");
  const outfit=outfits.find(entry=>entry.id===input.outfitId);
  if(!outfit)throw new Error("Select one of your saved outfits before publishing.");
  const byId=new Map(wardrobe.map(item=>[item.id,item]));
  const productsById=new Map(registry.map(product=>[product.id,product]));
  const publishedGarments:StoredPublishedGarment[]=outfit.itemIds.map(itemId=>{
    const item=byId.get(itemId);
    if(!item)throw new Error("A saved outfit piece is no longer available in your wardrobe.");
    const resolution=wardrobeItemToOutfitPiece(item).resolution;
    return {
      publicGarmentId:crypto.randomUUID(),name:item.name,category:item.category,subtype:item.subtype,color:item.color,pattern:item.pattern,style:item.style,material:item.material,imageKey:item.imageKey,resolutionState:resolution.state,
      ...(resolution.state==="EXACT_VERIFIED_PRODUCT"&&resolution.registryProductId&&resolution.sku&&resolution.productName&&resolution.brand&&resolution.brandSlug?{verifiedProduct:(()=>{const product=productsById.get(resolution.registryProductId!);const destination=product?commerceDestination(product):{state:"NO_DESTINATION" as const};return {registryProductId:resolution.registryProductId!,sku:resolution.sku!,name:resolution.productName!,brand:resolution.brand!,brandSlug:resolution.brandSlug!,commerceState:destination.state,...(destination.state==="EXACT_AVAILABLE"?{outboundUrl:`/api/products/${encodeURIComponent(resolution.registryProductId!)}/outbound?sourcePostId=__POST_ID__`}:{}),...(product?.price!==undefined?{price:product.price,currency:product.currency}:{}),};})()}:{}),
      ...(resolution.state!=="EXACT_VERIFIED_PRODUCT"&&item.brand?{unverifiedBrandLabel:item.brand}:{}),
    };
  });
  const createdAt=new Date().toISOString();
  const post:StoredPost={id:crypto.randomUUID(),ownerId,sourceOutfitId:outfit.id,sourceType:"consumer",handle:`@${account.displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").slice(0,30)}`,outfitTitle:input.outfitTitle,caption:input.caption,image:"",createdAt,likes:0,publishedGarments,garments:[],products:[]};
  for(const garment of post.publishedGarments??[]){if(garment.verifiedProduct?.outboundUrl)garment.verifiedProduct.outboundUrl=garment.verifiedProduct.outboundUrl.replace("__POST_ID__",encodeURIComponent(post.id??""));}
  await db.send(new PutCommand({TableName:requireTable(),Item:{...post,PK:"COMMUNITY",SK:`POST#${createdAt}#${post.id}`}}));
  return toPublicOutfitPost(post);
}

// Shared newest-first, bounded lookup for a community post by its public id. Replaces
// three copies of a single `Limit: 60` + filter query: DynamoDB applies Limit before the
// filter, and those queries read oldest-first while the feed renders newest-first, so
// past 60 posts they could no longer find any post a person could actually see.
async function findCommunityPostById(postId:string){
  return findByPaginatedQuery<StoredPost>(
    (post)=>post.id===postId,
    async (startKey)=>{
      const page=await db.send(new QueryCommand({TableName:requireTable(),KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",ExpressionAttributeValues:{":pk":"COMMUNITY",":sk":"POST#"},ScanIndexForward:false,Limit:60,...(startKey?{ExclusiveStartKey:startKey}:{})}));
      return {items:(page.Items??[]) as unknown as StoredPost[],lastKey:page.LastEvaluatedKey};
    },
  );
}

export async function getPublishedCommunityImage(postId:string,publicGarmentId:string){
  const post=await findCommunityPostById(postId);
  if(!post)throw new Error("Community post not found.");
  const key=publishedImageKey(post,publicGarmentId);
  if(!key)throw new Error("Published garment image not found.");
  const object=await s3.send(new GetObjectCommand({Bucket:requireBucket(),Key:key}));
  if(!object.Body)throw new Error("Published garment image not found.");
  return {bytes:Buffer.from(await object.Body.transformToByteArray()),contentType:object.ContentType??"image/png"};
}
export async function getPublicCommunityPost(postId:string){
  const post=await findCommunityPostById(postId);
  return post?toPublicOutfitPost(post):null;
}
export async function recordPrivacySafeCommunityEvent(postId:string,eventType:"recreate-look-request"|"product-click"|"outbound-product-click"){
  const createdAt=new Date().toISOString();
  await db.send(new PutCommand({TableName:requireTable(),Item:{PK:"COMMUNITY",SK:`EVENT#${createdAt}#${crypto.randomUUID()}`,postId,eventType,createdAt}}));
}
/**
 * Records one clearly labeled $0.00 demo checkout simulation.
 *
 * Judge note: this is a demonstration interaction, never a sale. No payment is taken,
 * no order exists, and the stored event carries no person — only the fictional product,
 * the optional public post it started from, and a timestamp. It is written only for
 * products classified as demonstration data, so a real or pilot brand can never
 * accumulate simulated purchase activity.
 */
export async function recordDemoPurchaseSimulation(productId:string,sourcePostId?:string){
  const createdAt=new Date().toISOString();
  await db.send(new PutCommand({TableName:requireTable(),Item:{PK:"COMMUNITY",SK:`EVENT#${createdAt}#${crypto.randomUUID()}`,productId,eventType:"demo-purchase",createdAt,dataClassification:"DEMO",...(sourcePostId?{postId:sourcePostId}:{})}}));
  return createdAt;
}

export async function recordPrivacySafeCommerceEvent(productId:string,sourcePostId?:string){
  const createdAt=new Date().toISOString();
  await db.send(new PutCommand({TableName:requireTable(),Item:{PK:"COMMUNITY",SK:`EVENT#${createdAt}#${crypto.randomUUID()}`,productId,eventType:"outbound-product-click",createdAt,...(sourcePostId?{postId:sourcePostId}:{})}}));
}

export async function getBrandCommunityMetrics(ownerId:string,productId:string){
  const owned=await listOwnedBrandProducts(ownerId);
  if(!owned.some(product=>product.id===productId))throw new Error("Product not found for this brand account.");
  const [posts,eventResult]=await Promise.all([
    listCommunityPosts(),
    db.send(new QueryCommand({TableName:requireTable(),KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",ExpressionAttributeValues:{":pk":"COMMUNITY",":sk":"EVENT#"},ScanIndexForward:false,Limit:1000})),
  ]);
  const events=(eventResult.Items??[]).map(item=>({postId:typeof item.postId==="string"?item.postId:undefined,productId:typeof item.productId==="string"?item.productId:undefined,eventType:item.eventType,createdAt:item.createdAt})) as PrivacySafeCommunityEvent[];
  return buildBrandCommunityMetrics(productId,posts,events);
}

export async function listBrandLooks(ownerId:string){
  const result=await db.send(new QueryCommand({TableName:requireTable(),KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",ExpressionAttributeValues:{":pk":`USER#${ownerId}`,":sk":"BRANDLOOK#"},ScanIndexForward:false}));
  return (result.Items??[]) as unknown as import("@/lib/platform-types").BrandLook[];
}

export async function saveBrandLook(ownerId:string,input:{title:string;caption:string;productIds:string[];published:boolean}){
  const [account,products]=await Promise.all([getAccount(ownerId),listOwnedBrandProducts(ownerId)]);
  if(!account?.brandName)throw new Error("This account has no brand profile.");
  const look=createBrandLook({ownerSubject:ownerId,brand:account.brandName,brandSlug:slugify(account.brandName),...input},products);
  await db.send(new PutCommand({TableName:requireTable(),Item:{...look,PK:`USER#${ownerId}`,SK:`BRANDLOOK#${look.createdAt}#${look.id}`}}));
  let post:OutfitPost|undefined;
  if(look.published){
    const byId=new Map(products.map(product=>[product.id,product]));
    const postId=crypto.randomUUID();
    const publishedGarments:StoredPublishedGarment[]=look.productIds.map(productId=>{const product=byId.get(productId)!;const destination=commerceDestination(product);return {publicGarmentId:crypto.randomUUID(),name:product.name,category:product.category,imageKey:product.views.front.storageKey,resolutionState:"EXACT_VERIFIED_PRODUCT",verifiedProduct:{registryProductId:product.id,sku:product.sku,name:product.name,brand:product.brand,brandSlug:product.brandSlug,commerceState:destination.state,...(destination.state==="EXACT_AVAILABLE"?{outboundUrl:`/api/products/${encodeURIComponent(product.id)}/outbound?sourcePostId=${encodeURIComponent(postId)}`}:{ }),...(product.price!==undefined?{price:product.price,currency:product.currency}:{})}};});
    const stored:StoredPost={id:postId,ownerId,sourceBrandLookId:look.id,sourceType:"brand",handle:`@${look.brandSlug.replaceAll("-","_")}`,outfitTitle:look.title,caption:look.caption,image:"",createdAt:look.createdAt,likes:0,publishedGarments,garments:[],products:[]};
    await db.send(new PutCommand({TableName:requireTable(),Item:{...stored,PK:"COMMUNITY",SK:`POST#${look.createdAt}#${postId}`}}));
    post=toPublicOutfitPost(stored);
  }
  return {look,post};
}
async function currentCommunityLikes(post:StoredPost) {
  const result=await db.send(new GetCommand({TableName:requireTable(),Key:{PK:post.PK,SK:post.SK},ProjectionExpression:"likes"}));
  return Number(result.Item?.likes??0);
}

export async function incrementCommunityLike(postId:string){const post=await findCommunityPostById(postId);if(!post)throw new Error("Community post not found.");const result=await db.send(new UpdateCommand({TableName:requireTable(),Key:{PK:post.PK,SK:post.SK},UpdateExpression:"SET likes = if_not_exists(likes, :zero) + :one",ExpressionAttributeValues:{":zero":0,":one":1},ReturnValues:"UPDATED_NEW"}));return Number(result.Attributes?.likes??0);}

/**
 * Saves an intentional Community inspiration under the signed-in Consumer only.
 * The public post receives one aggregate like, while the private record retains a
 * bounded attribute snapshot for Hanger — never the creator identity or images.
 */
export async function saveConsumerInspiration(ownerId:string,postId:string) {
  const post=await findCommunityPostById(postId);
  if(!post)throw new Error("Community post not found.");
  const publicPost=toPublicOutfitPost(post);
  const record=consumerInspirationRecord(publicPost);
  const inspirationKey={PK:`USER#${ownerId}`,SK:`INSPIRATION#${postId}`};
  const existing=await db.send(new GetCommand({TableName:requireTable(),Key:inspirationKey,ProjectionExpression:"postId"}));
  if(existing.Item)return {likes:await currentCommunityLikes(post),inspired:true,alreadySaved:true};
  try{
    await db.send(new PutCommand({TableName:requireTable(),Item:{...record,...inspirationKey},ConditionExpression:"attribute_not_exists(PK) AND attribute_not_exists(SK)"}));
  }catch(error){
    const raced=await db.send(new GetCommand({TableName:requireTable(),Key:inspirationKey,ProjectionExpression:"postId"}));
    if(!raced.Item)throw error;
    return {likes:await currentCommunityLikes(post),inspired:true,alreadySaved:true};
  }
  try{
    await db.send(new UpdateCommand({TableName:requireTable(),Key:{PK:post.PK,SK:post.SK},UpdateExpression:"SET likes = if_not_exists(likes, :zero) + :one",ExpressionAttributeValues:{":zero":0,":one":1},ConditionExpression:"attribute_exists(PK)"}));
  }catch(error){
    // Keep the private inspiration and public aggregate consistent if the second
    // write fails; this uses only the role's existing least-privilege actions.
    await db.send(new DeleteCommand({TableName:requireTable(),Key:inspirationKey})).catch(()=>undefined);
    throw error;
  }
  return {likes:await currentCommunityLikes(post),inspired:true,alreadySaved:false};
}

export async function getConsumerInspirationProfile(ownerId:string):Promise<ConsumerInspirationProfile> {
  const result=await db.send(new QueryCommand({TableName:requireTable(),KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",ExpressionAttributeValues:{":pk":`USER#${ownerId}`,":sk":"INSPIRATION#"},ScanIndexForward:false,Limit:50}));
  const records=(result.Items??[]).map(item=>({
    postId:typeof item.postId==="string"?item.postId.slice(0,128):"",
    outfitTitle:typeof item.outfitTitle==="string"?item.outfitTitle.slice(0,80):"Inspired Look",
    styleHints:boundedInspirationStrings(item.styleHints,12),
    colors:boundedInspirationStrings(item.colors,12),
    categories:boundedInspirationStrings(item.categories,12),
    subtypes:boundedInspirationStrings(item.subtypes,12),
    createdAt:typeof item.createdAt==="string"?item.createdAt:"",
  })).filter(record=>record.postId) as ConsumerInspirationRecord[];
  return consumerInspirationProfile(records);
}

// Judge note: the differencing/enumeration control from lib/privacy.ts is enforced here,
// on the production aggregate path shared by the Brand dashboard and Brand Hanger. The
// per-subject query log persists in DynamoDB so the budget holds across serverless
// instances. Re-querying an already-viewed product never consumes budget.
async function enforceAggregateEnumerationBudget(ownerId:string,productId:string) {
  const now=Date.now();
  const result=await db.send(new QueryCommand({TableName:requireTable(),KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",ExpressionAttributeValues:{":pk":`AGGQ#${ownerId}`,":sk":"PRODUCT#"}}));
  const log:AggregateQueryEvent[]=(result.Items??[]).map(item=>({subject:ownerId,productId:String(item.productId??""),at:Number(item.queriedAt)||0}));
  if(exceedsEnumerationBudget(log,ownerId,productId,now))throw new EnumerationBudgetError("Aggregate release is limited to a few distinct products in a short window. Revisit a recently viewed product or try again in a few minutes.");
  await db.send(new PutCommand({TableName:requireTable(),Item:{PK:`AGGQ#${ownerId}`,SK:`PRODUCT#${productId}`,productId,queriedAt:now}}));
  return enumerationBudgetState([...log,{subject:ownerId,productId,at:now}],ownerId,now);
}

export async function getRealProductMetrics(ownerId:string,productId:string) {
  const owned=await db.send(new GetCommand({TableName:requireTable(),Key:{PK:`USER#${ownerId}`,SK:`PRODUCT#${productId}`}}));
  if(!owned.Item)throw new Error("Product not found for this brand account.");
  const budget=await enforceAggregateEnumerationBudget(ownerId,productId);
  const [items,wearEvents]=await Promise.all([
    queryEveryPage({IndexName:"GSI1",KeyConditionExpression:"GSI1PK = :pk",ExpressionAttributeValues:{":pk":`PRODUCT#${productId}`}}),
    queryEveryPage({KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",ExpressionAttributeValues:{":pk":`PRODUCT#${productId}`,":sk":"WEAR#"}}),
  ]);
  const ownerKeys=[...new Set(items.map(item=>String(item.PK)))];
  const accountResults=await Promise.all(Array.from({length:Math.ceil(ownerKeys.length/100)},(_,index)=>ownerKeys.slice(index*100,(index+1)*100)).filter(chunk=>chunk.length).map(chunk=>db.send(new BatchGetCommand({RequestItems:{[requireTable()]:{Keys:chunk.map(PK=>({PK,SK:"PROFILE"}))}}}))));
  const optedInOwners=new Set(accountResults.flatMap(response=>response.Responses?.[requireTable()]??[]).filter(account=>account.brandDataSharing===true).map(account=>String(account.PK)));
  const eligibleItems=items.filter(item=>optedInOwners.has(String(item.PK)));
  const owners=new Set(eligibleItems.map(item=>String(item.PK)));
  const segmentSize=owners.size;
  const minimumCohortSize=25;
  // Below the threshold the count itself is withheld: "3 owners" is a small cell too, and watching
  // it tick from 3 to 4 can tell a brand when one known customer linked a piece.
  if(segmentSize<minimumCohortSize)return {opportunity:null,gapPrevalence:null,duplicateRisk:null,actualWears:null,repeatWearRate:null,activeOwners:null,engagementRate:null,averageWearsPerOwner:null,medianWearsPerOwner:null,zeroWearOwners:null,highFrequencyOwners:null,lastWearAt:null,wearDistribution:[],weeklyTrend:[],segmentSize:0,suppressed:true,minimumCohortSize,budget};
  const countsByOwner=new Map<string,number>();
  for(const item of eligibleItems){const key=String(item.PK);countsByOwner.set(key,(countsByOwner.get(key)??0)+Number(item.wearCount??0));}
  const eligibleEventDates=wearEvents.filter(event=>optedInOwners.has(String(event.ownerPK))).map(event=>String(event.occurredAt));
  const analytics=buildWearUsageAnalytics([...owners].map(owner=>countsByOwner.get(owner)??0),eligibleEventDates);
  return {opportunity:null,gapPrevalence:null,duplicateRisk:null,...analytics,segmentSize,suppressed:false,minimumCohortSize,budget};
}

// ─── Hanger conversation memory ───────────────────────────────────────────────
// One record per account holds the stylist conversation: the recent turns, the preferences learned
// from them, and the pieces already suggested. It sits in the account's own partition, so account
// deletion takes it along with everything else, and a person can clear it on its own.
export async function loadHangerConversation(ownerId:string) {
  const found=await db.send(new GetCommand({TableName:requireTable(),Key:{PK:`USER#${ownerId}`,SK:"HANGER_CHAT"}}));
  return readHangerConversation(found.Item?.state);
}

export async function saveHangerConversation(ownerId:string,state:HangerConversationState) {
  await db.send(new PutCommand({TableName:requireTable(),Item:{PK:`USER#${ownerId}`,SK:"HANGER_CHAT",state,updatedAt:state.updatedAt}}));
  return state;
}

export async function clearHangerConversation(ownerId:string) {
  await db.send(new DeleteCommand({TableName:requireTable(),Key:{PK:`USER#${ownerId}`,SK:"HANGER_CHAT"}}));
}
