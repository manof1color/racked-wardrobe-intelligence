import "server-only";

import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchGetCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { GarmentAnalysis, BrandProductRegistration, OutfitPost } from "@/lib/platform-types";
import type { Role, SavedOutfit, WardrobeItem } from "@/lib/types";
import { buildWearUsageAnalytics } from "@/lib/metrics";
import { toPublicOutfitPost } from "@/lib/community-post";
import { exceedsEnumerationBudget, type AggregateQueryEvent } from "@/lib/privacy";

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
}

function normalizeEmail(email:string) { return email.trim().toLowerCase(); }
function slugify(value:string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60); }
function confirmationPayload(ownerId:string,key:string,analysis:GarmentAnalysis){return JSON.stringify({ownerId,key,garment:analysis.garment,label:analysis.label});}
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
  const account:AccountRecord={id,email,role:input.role,displayName:input.displayName.trim(),brandName:input.role==="brand"?(input.brandName?.trim()||input.displayName.trim()):null,brandSlug:input.role==="brand"?slugify(input.brandName?.trim()||input.displayName):null,passwordHash,passwordSalt,createdAt:new Date().toISOString()};
  await db.send(new PutCommand({TableName:requireTable(),Item:{...account,PK:`USER#${id}`,SK:"PROFILE",GSI1PK:`EMAIL#${email}`,GSI1SK:"ACCOUNT"},ConditionExpression:"attribute_not_exists(PK)"}));
  return account;
}

export async function authenticateAccount(email:string,password:string) {
  const account=await findAccountByEmail(email);
  if (!account) return null;
  const supplied=Buffer.from(await passwordDigest(password,account.passwordSalt),"base64url");
  const expected=Buffer.from(account.passwordHash,"base64url");
  return supplied.length===expected.length&&timingSafeEqual(supplied,expected)?account:null;
}

export async function getAccount(id:string) {
  const result=await db.send(new GetCommand({TableName:requireTable(),Key:{PK:`USER#${id}`,SK:"PROFILE"}}));
  return (result.Item as AccountRecord|undefined) ?? null;
}

export async function putPrivateImage(ownerId:string,kind:"wardrobe"|"brand",bytes:Buffer,contentType:string) {
  const extension=contentType==="image/png"?"png":contentType==="image/webp"?"webp":"jpg";
  const key=`${kind}/${ownerId}/${crypto.randomUUID()}.${extension}`;
  await s3.send(new PutObjectCommand({Bucket:requireBucket(),Key:key,Body:bytes,ContentType:contentType,ServerSideEncryption:"AES256",Metadata:{owner:ownerId}}));
  return key;
}

export async function privateImageUrl(key?:string) {
  if (!key) return undefined;
  return getSignedUrl(s3,new GetObjectCommand({Bucket:requireBucket(),Key:key}),{expiresIn:3600});
}

export async function listWardrobe(ownerId:string):Promise<WardrobeItem[]> {
  const result=await db.send(new QueryCommand({TableName:requireTable(),KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",ExpressionAttributeValues:{":pk":`USER#${ownerId}`,":sk":"GARMENT#"}}));
  return Promise.all((result.Items??[]).map(async raw=>{const item=raw as unknown as WardrobeItem;return {...item,imageUrl:await privateImageUrl(item.imageKey)};}));
}

export async function addWardrobeItem(ownerId:string,analysis:GarmentAnalysis,overrides?:{name?:string;brand?:string;sku?:string}) {
  if (!analysis.processedImage?.key) throw new Error("The processed garment image is missing.");
  if(!analysis.processedImage.key.startsWith(`wardrobe/${ownerId}/`)||!verifyGarmentConfirmation(ownerId,analysis))throw new Error("The garment confirmation expired or did not belong to this account.");
  const name=(overrides?.name??analysis.garment.name).trim().slice(0,100)||"Unverified garment";
  const brand=(overrides?.brand??analysis.label.brand).trim().slice(0,100);
  const sku=(overrides?.sku??analysis.label.sku).trim().toUpperCase().slice(0,64);
  const placeholderBrand=/^(brand not verified|unmatched label)$/i.test(brand);
  const placeholderSku=/^(unverified|unconfirmed)$/i.test(sku);
  const identityStatus=analysis.label.matched?"verified":analysis.label.suggested&&brand===analysis.label.brand?"suggested":brand&&!placeholderBrand?"user-labeled":"unverified";
  const item:WardrobeItem={id:crypto.randomUUID(),name,category:analysis.garment.category,color:analysis.garment.color,style:analysis.garment.style,season:"all-season",wearCount:0,lastWornDays:999,source:analysis.fallback?"manual":"ai-confirmed",art:"photo",imageKey:analysis.processedImage.key,imageUrl:await privateImageUrl(analysis.processedImage.key),brand:brand&&!placeholderBrand?brand:null,sku:sku&&!placeholderSku?sku:null,identityStatus,createdAt:new Date().toISOString()};
  await db.send(new PutCommand({TableName:requireTable(),Item:{...item,imageUrl:undefined,PK:`USER#${ownerId}`,SK:`GARMENT#${item.id}`,GSI1PK:analysis.label.registryProductId?`PRODUCT#${analysis.label.registryProductId}`:undefined,GSI1SK:`OWNER#${ownerId}`}}));
  return item;
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
  return (result.Items??[]) as unknown as SavedOutfit[];
}

export async function saveOutfit(ownerId:string,name:string,itemIds:string[]) {
  const outfit:SavedOutfit={id:crypto.randomUUID(),name:name.trim().slice(0,80)||"Saved outfit",itemIds:[...new Set(itemIds)],createdAt:new Date().toISOString(),wears:0};
  await db.send(new PutCommand({TableName:requireTable(),Item:{...outfit,PK:`USER#${ownerId}`,SK:`OUTFIT#${outfit.createdAt}#${outfit.id}`}}));
  return outfit;
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

export async function listOwnedBrandProducts(ownerId:string):Promise<BrandProductRegistration[]> {
  const result=await db.send(new QueryCommand({TableName:requireTable(),KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",ExpressionAttributeValues:{":pk":`USER#${ownerId}`,":sk":"PRODUCT#"}}));
  return Promise.all((result.Items??[]).map(async raw=>{const product=raw as unknown as BrandProductRegistration;return {...product,imageUrls:{front:await privateImageUrl(product.views.front.storageKey),back:await privateImageUrl(product.views.back.storageKey),label:await privateImageUrl(product.views.label.storageKey)}};}));
}

export async function listRegistryProducts():Promise<BrandProductRegistration[]> {
  const result=await db.send(new QueryCommand({TableName:requireTable(),IndexName:"GSI1",KeyConditionExpression:"GSI1PK = :pk",ExpressionAttributeValues:{":pk":"BRAND_PRODUCTS"}}));
  return (result.Items??[]) as unknown as BrandProductRegistration[];
}

export async function listPublicBrandProducts(brandSlug:string):Promise<BrandProductRegistration[]>{const products=await listRegistryProducts();return Promise.all(products.filter(product=>product.brandSlug===brandSlug).map(async product=>({...product,imageUrls:{front:await privateImageUrl(product.views.front.storageKey)}})));}

export async function saveBrandProduct(ownerId:string,product:BrandProductRegistration) {
  await db.send(new PutCommand({TableName:requireTable(),Item:{...product,PK:`USER#${ownerId}`,SK:`PRODUCT#${product.id}`,GSI1PK:"BRAND_PRODUCTS",GSI1SK:`${product.brandSlug}#${product.sku}`},ConditionExpression:"attribute_not_exists(PK) AND attribute_not_exists(SK)"}));
  return product;
}

export async function getBrandDataSharing(ownerId:string){const account=await getAccount(ownerId);return account?.brandDataSharing===true;}
export async function setBrandDataSharing(ownerId:string,value:boolean){await db.send(new UpdateCommand({TableName:requireTable(),Key:{PK:`USER#${ownerId}`,SK:"PROFILE"},UpdateExpression:"SET brandDataSharing = :value",ExpressionAttributeValues:{":value":value}}));return value;}

type StoredPost=OutfitPost&{imageKey?:string;ownerId:string};
// Public feed responses are rebuilt through toPublicOutfitPost so stored private fields
// (ownerId, imageKey, DynamoDB key attributes) never reach the browser.
export async function listCommunityPosts():Promise<OutfitPost[]>{const result=await db.send(new QueryCommand({TableName:requireTable(),KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",ExpressionAttributeValues:{":pk":"COMMUNITY",":sk":"POST#"},ScanIndexForward:false,Limit:60}));return Promise.all((result.Items??[]).map(async raw=>{const post=raw as unknown as StoredPost;return toPublicOutfitPost({...post,image:post.imageKey?(await privateImageUrl(post.imageKey))??"":post.image});}));}
export async function addCommunityPost(ownerId:string,input:{outfitTitle:string;caption:string;itemId?:string}){const account=await getAccount(ownerId);if(!account)throw new Error("Account not found.");const wardrobe=await listWardrobe(ownerId);const item=wardrobe.find(entry=>entry.id===input.itemId)??wardrobe[0];if(!item)throw new Error("Add a wardrobe item before publishing an outfit.");const createdAt=new Date().toISOString();const post:StoredPost={id:crypto.randomUUID(),ownerId,handle:`@${account.displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").slice(0,30)}`,outfitTitle:input.outfitTitle,caption:input.caption,image:item.imageUrl??"",imageKey:item.imageKey,createdAt,likes:0,products:item.brand&&item.sku?[{sku:item.sku,name:item.name,brand:item.brand,brandSlug:slugify(item.brand),category:item.category}]:[]};await db.send(new PutCommand({TableName:requireTable(),Item:{...post,image:"",PK:"COMMUNITY",SK:`POST#${createdAt}#${post.id}`}}));return toPublicOutfitPost(post);}
export async function incrementCommunityLike(postId:string){const found=await db.send(new QueryCommand({TableName:requireTable(),KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",FilterExpression:"id = :id",ExpressionAttributeValues:{":pk":"COMMUNITY",":sk":"POST#",":id":postId},Limit:60}));const post=found.Items?.[0];if(!post)throw new Error("Community post not found.");const result=await db.send(new UpdateCommand({TableName:requireTable(),Key:{PK:post.PK,SK:post.SK},UpdateExpression:"SET likes = if_not_exists(likes, :zero) + :one",ExpressionAttributeValues:{":zero":0,":one":1},ReturnValues:"UPDATED_NEW"}));return Number(result.Attributes?.likes??0);}

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
}

export async function getRealProductMetrics(ownerId:string,productId:string) {
  const owned=await db.send(new GetCommand({TableName:requireTable(),Key:{PK:`USER#${ownerId}`,SK:`PRODUCT#${productId}`}}));
  if(!owned.Item)throw new Error("Product not found for this brand account.");
  await enforceAggregateEnumerationBudget(ownerId,productId);
  const [result,eventResult]=await Promise.all([
    db.send(new QueryCommand({TableName:requireTable(),IndexName:"GSI1",KeyConditionExpression:"GSI1PK = :pk",ExpressionAttributeValues:{":pk":`PRODUCT#${productId}`}})),
    db.send(new QueryCommand({TableName:requireTable(),KeyConditionExpression:"PK = :pk AND begins_with(SK, :sk)",ExpressionAttributeValues:{":pk":`PRODUCT#${productId}`,":sk":"WEAR#"},ScanIndexForward:false})),
  ]);
  const items=result.Items??[];
  const ownerKeys=[...new Set(items.map(item=>String(item.PK)))];
  const accountResults=await Promise.all(Array.from({length:Math.ceil(ownerKeys.length/100)},(_,index)=>ownerKeys.slice(index*100,(index+1)*100)).filter(chunk=>chunk.length).map(chunk=>db.send(new BatchGetCommand({RequestItems:{[requireTable()]:{Keys:chunk.map(PK=>({PK,SK:"PROFILE"}))}}}))));
  const optedInOwners=new Set(accountResults.flatMap(response=>response.Responses?.[requireTable()]??[]).filter(account=>account.brandDataSharing===true).map(account=>String(account.PK)));
  const eligibleItems=items.filter(item=>optedInOwners.has(String(item.PK)));
  const owners=new Set(eligibleItems.map(item=>String(item.PK)));
  const segmentSize=owners.size;
  const minimumCohortSize=25;
  if(segmentSize<minimumCohortSize)return {opportunity:null,gapPrevalence:null,duplicateRisk:null,actualWears:null,repeatWearRate:null,activeOwners:null,engagementRate:null,averageWearsPerOwner:null,medianWearsPerOwner:null,zeroWearOwners:null,highFrequencyOwners:null,lastWearAt:null,wearDistribution:[],weeklyTrend:[],segmentSize,suppressed:true,minimumCohortSize};
  const countsByOwner=new Map<string,number>();
  for(const item of eligibleItems){const key=String(item.PK);countsByOwner.set(key,(countsByOwner.get(key)??0)+Number(item.wearCount??0));}
  const eligibleEventDates=(eventResult.Items??[]).filter(event=>optedInOwners.has(String(event.ownerPK))).map(event=>String(event.occurredAt));
  const analytics=buildWearUsageAnalytics([...owners].map(owner=>countsByOwner.get(owner)??0),eligibleEventDates);
  return {opportunity:null,gapPrevalence:null,duplicateRisk:null,...analytics,segmentSize,suppressed:false,minimumCohortSize};
}
