import { createHash, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

if(process.env.ALLOW_RACKED_TEST_SEED!=="yes")throw new Error("Set ALLOW_RACKED_TEST_SEED=yes to confirm this clearly labeled synthetic test write.");
const table=process.env.RACKED_TABLE_NAME,bucket=process.env.RACKED_UPLOAD_BUCKET,password=process.env.RACKED_TEST_PASSWORD;
if(!table||!bucket||!password)throw new Error("RACKED_TABLE_NAME, RACKED_UPLOAD_BUCKET, and RACKED_TEST_PASSWORD are required.");
if(password.length<16)throw new Error("Use a test password of at least 16 characters.");
const region=process.env.AWS_REGION??process.env.AWS_DEFAULT_REGION??"us-east-2";
const db=DynamoDBDocumentClient.from(new DynamoDBClient({region}),{marshallOptions:{removeUndefinedValues:true}}),s3=new S3Client({region}),scrypt=promisify(scryptCallback);
const createdAt="2026-08-13T12:00:00.000Z",wearPattern=[0,1,2,2,3,3,4,5,6,8];
const cohorts=[
  {key:"atelier",brand:"Racked Test Atelier",slug:"racked-test-atelier",email:"demo.apparel@racked.local",accent:"#d5f66d",base:"#394a63",prefix:"RTA",categories:["top","bottom","outerwear","top","bottom","outerwear","top","bottom","outerwear","accessory"],names:["Rotation Tee","Studio Trouser","Transit Bomber","Weekday Polo","Canvas Chino","Field Jacket","Layer Hoodie","Relaxed Short","Rain Shell","Everyday Belt"]},
  {key:"stride",brand:"Synthetic Stride Lab",slug:"synthetic-stride-lab",email:"demo.footwear@racked.local",accent:"#ff684b",base:"#292929",prefix:"SSL",categories:Array(10).fill("shoes"),names:["City Sneaker","Track Runner","Archive Loafer","Trail Boot","Court Low","Formal Derby","Summer Sandal","Studio Trainer","Chelsea Boot","Canvas Slip-On"]},
  {key:"lumen",brand:"Lumen Test Objects",slug:"lumen-test-objects",email:"demo.jewelry@racked.local",accent:"#b8a5ff",base:"#574b70",prefix:"LTO",categories:Array(10).fill("jewelry"),names:["Orbit Ring","Signal Chain","Arc Bracelet","Halo Studs","Line Pendant","Stack Ring","Drop Earring","Cuff Bracelet","Link Necklace","Signet Ring"]},
];

async function accountItem({id,email,role,displayName,brandName=null,brandSlug=null,brandDataSharing=false}){
  const salt=randomBytes(18).toString("base64url"),passwordHash=Buffer.from(await scrypt(password,salt,64)).toString("base64url");
  return {id,email,role,displayName,brandName,brandSlug,passwordHash,passwordSalt:salt,createdAt,brandDataSharing,testCohort:true,dataClassification:"DEMO",PK:`USER#${id}`,SK:"PROFILE",GSI1PK:`EMAIL#${email}`,GSI1SK:"ACCOUNT"};
}

async function imageFor(cohort,index,view){
  const productName=cohort.names[index],sku=`${cohort.prefix}-${String(index+1).padStart(3,"0")}`;
  const shape=view==="label"?`<rect x="130" y="180" width="640" height="740" rx="28" fill="#fffdf8" stroke="#171914" stroke-width="8"/>`:`<path d="M230 230 350 160h200l120 70 115 210-105 58-75-110v520H295V388l-75 110-105-58z" fill="${cohort.base}"/>`;
  const svg=`<svg width="900" height="1100" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f3efe5"/>${shape}<text x="450" y="430" text-anchor="middle" font-family="Arial" font-weight="800" font-size="42" fill="${view==="label"?"#171914":cohort.accent}">${cohort.brand}</text><text x="450" y="520" text-anchor="middle" font-family="Arial" font-size="38" fill="${view==="label"?"#171914":cohort.accent}">${productName}</text><text x="450" y="605" text-anchor="middle" font-family="Arial" font-size="34" fill="${view==="label"?"#171914":cohort.accent}">${sku}</text><text x="450" y="760" text-anchor="middle" font-family="Arial" font-weight="700" font-size="26" fill="#e94f30">SYNTHETIC DEMO · ${view.toUpperCase()}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const productSets=new Map();
for(const cohort of cohorts){
  const brandId=`demo-brand-${cohort.key}`;
  await db.send(new PutCommand({TableName:table,Item:await accountItem({id:brandId,email:cohort.email,role:"brand",displayName:`${cohort.brand} Demo Manager`,brandName:cohort.brand,brandSlug:cohort.slug})}));
  const products=[];
  for(let index=0;index<10;index++){
    const sku=`${cohort.prefix}-${String(index+1).padStart(3,"0")}`,productId=`demo-${cohort.key}-product-${String(index+1).padStart(2,"0")}`,views={};
    for(const view of ["front","back","label"]){const bytes=await imageFor(cohort,index,view),key=`brand/${brandId}/demo/${productId}-${view}.png`;await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:"image/png",ServerSideEncryption:"AES256",Metadata:{owner:brandId,synthetic:"true",classification:"demo"}}));views[view]={view,fileName:`${productId}-${view}.png`,contentType:"image/png",size:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),storageKey:key};}
    const product={id:productId,ownerSubject:brandId,name:cohort.names[index],brand:cohort.brand,brandSlug:cohort.slug,aliases:[cohort.brand,cohort.prefix],sku,gtin:null,category:cohort.categories[index],labelText:`${cohort.brand} ${sku} SYNTHETIC DEMO PRODUCT`,views,enrolledAt:createdAt,source:"brand-enrolled",availability:"unknown",testCohort:true,dataClassification:"DEMO",PK:`USER#${brandId}`,SK:`PRODUCT#${productId}`,GSI1PK:"BRAND_PRODUCTS",GSI1SK:`${cohort.slug}#${sku}`};
    await db.send(new PutCommand({TableName:table,Item:product}));products.push(product);
  }
  productSets.set(cohort.key,products);
  for(let lookIndex=0;lookIndex<2;lookIndex++){
    const lookId=`demo-${cohort.key}-look-${lookIndex+1}`,lookProducts=products.slice(lookIndex*3,lookIndex*3+3),lookCreated=new Date(Date.parse(createdAt)+((cohorts.indexOf(cohort)*2+lookIndex)*60_000)).toISOString();
    const look={id:lookId,ownerSubject:brandId,brand:cohort.brand,brandSlug:cohort.slug,title:`${cohort.brand} Demo Look ${lookIndex+1}`,caption:"Clearly labeled synthetic Brand Look for competition testing.",productIds:lookProducts.map(product=>product.id),createdAt:lookCreated,sourceType:"brand",published:true,testCohort:true,dataClassification:"DEMO",PK:`USER#${brandId}`,SK:`BRANDLOOK#${lookCreated}#${lookId}`};
    await db.send(new PutCommand({TableName:table,Item:look}));
    const postId=`demo-post-${cohort.key}-brand-${lookIndex+1}`,publishedGarments=lookProducts.map((product,itemIndex)=>({publicGarmentId:`${postId}-item-${itemIndex+1}`,name:product.name,category:product.category,imageKey:product.views.front.storageKey,resolutionState:"EXACT_VERIFIED_PRODUCT",verifiedProduct:{registryProductId:product.id,sku:product.sku,name:product.name,brand:product.brand,brandSlug:product.brandSlug,commerceState:"NO_DESTINATION"}}));
    await db.send(new PutCommand({TableName:table,Item:{id:postId,ownerId:brandId,sourceBrandLookId:lookId,sourceType:"brand",handle:`@${cohort.slug.replaceAll("-","_")}`,outfitTitle:look.title,caption:look.caption,image:"",createdAt:lookCreated,likes:6+lookIndex,publishedGarments,garments:[],products:[],fictional:true,testCohort:true,dataClassification:"DEMO",PK:"COMMUNITY",SK:`POST#${lookCreated}#${postId}`}}));
  }
}

const consumers=[];
for(let index=1;index<=25;index++){
  const suffix=String(index).padStart(2,"0"),id=`demo-consumer-${suffix}`,email=`demo.consumer${suffix}@racked.local`;
  await db.send(new PutCommand({TableName:table,Item:await accountItem({id,email,role:"consumer",displayName:`Synthetic Demo Consumer ${suffix}`,brandDataSharing:true})}));
  const outfitItems=[];
  for(const cohort of cohorts){
    const product=productSets.get(cohort.key)[0],imageKey=`wardrobe/${id}/demo-${cohort.key}-hero.png`,source=await imageFor(cohort,0,"front");
    await s3.send(new PutObjectCommand({Bucket:bucket,Key:imageKey,Body:source,ContentType:"image/png",ServerSideEncryption:"AES256",Metadata:{owner:id,synthetic:"true",classification:"demo"}}));
    const garmentId=`demo-${cohort.key}-hero-${suffix}`,wearCount=wearPattern[(index-1)%wearPattern.length],mostRecentWear=wearCount>0?new Date(Date.parse(createdAt)-((index%7)*86_400_000)).toISOString():null;
    await db.send(new PutCommand({TableName:table,Item:{id:garmentId,name:product.name,category:product.category,subtype:product.category==="shoes"?"sneakers":product.category==="jewelry"?"necklace":"t-shirt",color:cohort.base,pattern:"solid",material:"synthetic demo material",style:["casual","synthetic demo"],season:"all-season",wearCount,lastWornDays:wearCount>0?index%7:999,lastWornAt:mostRecentWear,source:"ai-confirmed",art:"photo",imageKey,brand:cohort.brand,sku:product.sku,registryProductId:product.id,identityStatus:"verified",createdAt,testCohort:true,dataClassification:"DEMO",PK:`USER#${id}`,SK:`GARMENT#${garmentId}`,GSI1PK:`PRODUCT#${product.id}`,GSI1SK:`OWNER#${id}`}}));
    outfitItems.push({garmentId,product,imageKey});
    for(let wearIndex=0;wearIndex<wearCount;wearIndex++){const occurredAt=new Date(Date.parse(createdAt)-(((index%7)+(wearIndex*7))*86_400_000)-(index*3_600_000)).toISOString();await db.send(new PutCommand({TableName:table,Item:{PK:`PRODUCT#${product.id}`,SK:`WEAR#${occurredAt}#${id}#${wearIndex}`,occurredAt,ownerPK:`USER#${id}`,garmentId,eventType:"confirmed-wear",testCohort:true,dataClassification:"DEMO"}}));}
  }
  const outfitId=`demo-consumer-outfit-${suffix}`,outfitCreated=new Date(Date.parse(createdAt)+(index*120_000)).toISOString();
  await db.send(new PutCommand({TableName:table,Item:{id:outfitId,name:`Synthetic Demo Rotation ${suffix}`,itemIds:outfitItems.map(item=>item.garmentId),pieces:[],createdAt:outfitCreated,wears:index%5,testCohort:true,dataClassification:"DEMO",PK:`USER#${id}`,SK:`OUTFIT#${outfitCreated}#${outfitId}`}}));
  if(index<=10){const postId=`demo-consumer-post-${suffix}`,publishedGarments=outfitItems.map((item,itemIndex)=>({publicGarmentId:`${postId}-item-${itemIndex+1}`,name:item.product.name,category:item.product.category,imageKey:item.imageKey,resolutionState:"EXACT_VERIFIED_PRODUCT",verifiedProduct:{registryProductId:item.product.id,sku:item.product.sku,name:item.product.name,brand:item.product.brand,brandSlug:item.product.brandSlug,commerceState:"NO_DESTINATION"}}));await db.send(new PutCommand({TableName:table,Item:{id:postId,ownerId:id,sourceOutfitId:outfitId,sourceType:"consumer",handle:`@synthetic_demo_${suffix}`,outfitTitle:`Synthetic Consumer Look ${suffix}`,caption:"Clearly labeled synthetic Community outfit.",image:"",createdAt:outfitCreated,likes:index%8,publishedGarments,garments:[],products:[],fictional:true,testCohort:true,dataClassification:"DEMO",PK:"COMMUNITY",SK:`POST#${outfitCreated}#${postId}`}}));for(let eventIndex=0;eventIndex<index%4;eventIndex++){const eventAt=new Date(Date.parse(outfitCreated)+eventIndex*1000).toISOString();await db.send(new PutCommand({TableName:table,Item:{PK:"COMMUNITY",SK:`EVENT#${eventAt}#demo-recreate-${suffix}-${eventIndex}`,postId,eventType:"recreate-look-request",createdAt:eventAt,dataClassification:"DEMO"}}));}}
  consumers.push(email);
}

console.log(JSON.stringify({brands:cohorts.map(cohort=>({email:cohort.email,brand:cohort.brand,products:10,looks:2})),consumerAccounts:consumers,passwordSource:"RACKED_TEST_PASSWORD",cohortSize:consumers.length,wearEventsPerHeroProduct:consumers.reduce((sum,_,index)=>sum+wearPattern[index%wearPattern.length],0),clearlyLabeledSyntheticData:true,dataClassification:"DEMO"},null,2));
