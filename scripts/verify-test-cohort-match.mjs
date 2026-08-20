import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient,QueryCommand} from "@aws-sdk/lib-dynamodb";
import {matchBrandProduct} from "../lib/product-registry.ts";

const table=process.env.RACKED_TABLE_NAME;if(!table)throw new Error("RACKED_TABLE_NAME is required.");
const region=process.env.AWS_REGION??process.env.AWS_DEFAULT_REGION??"us-east-2",targetSku=(process.env.RACKED_MATCH_TEST_SKU??"RTA-001").toUpperCase();
const db=DynamoDBDocumentClient.from(new DynamoDBClient({region})),result=await db.send(new QueryCommand({TableName:table,IndexName:"GSI1",KeyConditionExpression:"GSI1PK = :pk",ExpressionAttributeValues:{":pk":"BRAND_PRODUCTS"}})),registry=(result.Items??[]).filter(item=>item.dataClassification==="DEMO"&&item.testCohort===true),target=registry.find(item=>item.sku===targetSku);
if(!target)throw new Error(`Synthetic registry target ${targetSku} was not found.`);
const parts=["front","back","label"].map(view=>({view,fileName:`consumer-${view}.jpg`,contentType:"image/jpeg",size:1200})),match=matchBrandProduct(parts,`${target.brand} ${target.sku}`,registry);
if(!match||match.product.id!==target.id||match.product.brand!==target.brand)throw new Error(`Expected ${target.brand} ${target.sku}; received ${match?.product.brand??"no match"} ${match?.product.sku??""}.`);
console.log(JSON.stringify({classification:"DEMO",registryProducts:registry.length,target:{id:target.id,brand:target.brand,sku:target.sku},resolved:{id:match.product.id,brand:match.product.brand,sku:match.product.sku,method:match.method},rightBrand:true},null,2));
