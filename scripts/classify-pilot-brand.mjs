import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

if(process.env.ALLOW_RACKED_PILOT_CLASSIFICATION!=="yes")throw new Error("Set ALLOW_RACKED_PILOT_CLASSIFICATION=yes to confirm this account classification change.");
const table=process.env.RACKED_TABLE_NAME,email=process.env.RACKED_PILOT_EMAIL?.trim().toLowerCase();
if(!table||!email)throw new Error("RACKED_TABLE_NAME and RACKED_PILOT_EMAIL are required.");
const region=process.env.AWS_REGION??process.env.AWS_DEFAULT_REGION??"us-east-2",db=DynamoDBDocumentClient.from(new DynamoDBClient({region}));
const result=await db.send(new QueryCommand({TableName:table,IndexName:"GSI1",KeyConditionExpression:"GSI1PK = :pk",ExpressionAttributeValues:{":pk":`EMAIL#${email}`},Limit:1}));
const account=result.Items?.[0];
if(!account||account.role!=="brand")throw new Error("A real Brand account with that email was not found.");
if(account.testCohort===true||account.dataClassification==="DEMO")throw new Error("Synthetic DEMO accounts cannot be reclassified as PILOT.");
await db.send(new UpdateCommand({TableName:table,Key:{PK:account.PK,SK:account.SK},UpdateExpression:"SET dataClassification = :classification",ExpressionAttributeValues:{":classification":"PILOT"}}));
console.log(JSON.stringify({email,dataClassification:"PILOT",syntheticDataAdded:false},null,2));
