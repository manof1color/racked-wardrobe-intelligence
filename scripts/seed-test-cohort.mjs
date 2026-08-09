import { createHash, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

if(process.env.ALLOW_RACKED_TEST_SEED!=="yes")throw new Error("Set ALLOW_RACKED_TEST_SEED=yes to confirm this clearly labeled synthetic test write.");
const table=process.env.RACKED_TABLE_NAME;
const bucket=process.env.RACKED_UPLOAD_BUCKET;
const password=process.env.RACKED_TEST_PASSWORD;
if(!table||!bucket||!password)throw new Error("RACKED_TABLE_NAME, RACKED_UPLOAD_BUCKET, and RACKED_TEST_PASSWORD are required.");
if(password.length<16)throw new Error("Use a test password of at least 16 characters.");
const region=process.env.AWS_REGION??process.env.AWS_DEFAULT_REGION??"us-east-2";
const db=DynamoDBDocumentClient.from(new DynamoDBClient({region}),{marshallOptions:{removeUndefinedValues:true}});
const s3=new S3Client({region});
const scrypt=promisify(scryptCallback);
const createdAt="2026-08-09T12:00:00.000Z";
const brandId="test-brand-racked-atelier";
const productId="registry-racked-test-atelier-tee-001";
const brandEmail="test.brand@racked.local";
const imageFiles={front:"public/test-cohort/rta-tee-001-front.png",back:"public/test-cohort/rta-tee-001-back.png",label:"public/test-cohort/rta-tee-001-label.png"};

async function accountItem({id,email,role,displayName,brandName=null,brandDataSharing=false}){
  const salt=randomBytes(18).toString("base64url");
  const passwordHash=Buffer.from(await scrypt(password,salt,64)).toString("base64url");
  return {id,email,role,displayName,brandName,brandSlug:brandName?"racked-test-atelier":null,passwordHash,passwordSalt:salt,createdAt,brandDataSharing,testCohort:true,PK:`USER#${id}`,SK:"PROFILE",GSI1PK:`EMAIL#${email}`,GSI1SK:"ACCOUNT"};
}

const images={};
for(const [view,path] of Object.entries(imageFiles)){
  const bytes=await readFile(path);
  const key=`brand/${brandId}/test-cohort-rta-tee-001-${view}.png`;
  await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:"image/png",ServerSideEncryption:"AES256",Metadata:{owner:brandId,synthetic:"true"}}));
  images[view]={view,fileName:path.split("/").at(-1),contentType:"image/png",size:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),storageKey:key};
}

await db.send(new PutCommand({TableName:table,Item:await accountItem({id:brandId,email:brandEmail,role:"brand",displayName:"Racked Test Brand Manager",brandName:"Racked Test Atelier"})}));
const product={id:productId,ownerSubject:brandId,name:"Test Rotation Tee",brand:"Racked Test Atelier",brandSlug:"racked-test-atelier",aliases:["Racked Test Atelier","RTA"],sku:"RTA-TEE-001",gtin:"00012345678905",category:"top",labelText:"RACKED TEST ATELIER RTA-TEE-001 00012345678905 100% TEST COTTON",views:images,enrolledAt:createdAt,source:"brand-enrolled",testCohort:true,PK:`USER#${brandId}`,SK:`PRODUCT#${productId}`,GSI1PK:"BRAND_PRODUCTS",GSI1SK:"racked-test-atelier#RTA-TEE-001"};
await db.send(new PutCommand({TableName:table,Item:product}));

const consumers=[];
for(let index=1;index<=25;index++){
  const suffix=String(index).padStart(2,"0");
  const id=`test-consumer-${suffix}`;
  const email=`test.consumer${suffix}@racked.local`;
  await db.send(new PutCommand({TableName:table,Item:await accountItem({id,email,role:"consumer",displayName:`Test Consumer ${suffix}`,brandDataSharing:true})}));
  const source=await readFile(imageFiles.front);
  const imageKey=`wardrobe/${id}/test-cohort-rta-tee-001.png`;
  await s3.send(new PutObjectCommand({Bucket:bucket,Key:imageKey,Body:source,ContentType:"image/png",ServerSideEncryption:"AES256",Metadata:{owner:id,synthetic:"true"}}));
  const garmentId=`test-rta-tee-${suffix}`;
  await db.send(new PutCommand({TableName:table,Item:{id:garmentId,name:"Test Rotation Tee",category:"top",color:"navy",style:["casual","test cohort"],season:"all-season",wearCount:(index%4)+1,lastWornDays:index%7,source:"ai-confirmed",art:"photo",imageKey,brand:"Racked Test Atelier",sku:"RTA-TEE-001",identityStatus:"verified",createdAt,testCohort:true,PK:`USER#${id}`,SK:`GARMENT#${garmentId}`,GSI1PK:`PRODUCT#${productId}`,GSI1SK:`OWNER#${id}`}}));
  const companionSource=await readFile("public/test-cohort/synthetic-companion-pant.png");
  const companionKey=`wardrobe/${id}/synthetic-companion-pant.png`;
  await s3.send(new PutObjectCommand({Bucket:bucket,Key:companionKey,Body:companionSource,ContentType:"image/png",ServerSideEncryption:"AES256",Metadata:{owner:id,synthetic:"true"}}));
  const companionId=`test-companion-pant-${suffix}`;
  await db.send(new PutCommand({TableName:table,Item:{id:companionId,name:"Synthetic Companion Pant",category:"bottom",color:"brown",style:["casual","test cohort"],season:"all-season",wearCount:index%3,lastWornDays:index%9,source:"manual",art:"photo",imageKey:companionKey,brand:null,sku:null,identityStatus:"unverified",createdAt,testCohort:true,PK:`USER#${id}`,SK:`GARMENT#${companionId}`}}));
  consumers.push(email);
}

console.log(JSON.stringify({brand:{email:brandEmail},consumers,passwordSource:"RACKED_TEST_PASSWORD",cohortSize:consumers.length,productId,clearlyLabeledSyntheticData:true},null,2));
