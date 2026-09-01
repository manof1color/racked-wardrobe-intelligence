import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { analyzeGarmentImages } from "../lib/garment-analysis.ts";
import { deterministicEvaluationSample, scoreGarmentEvaluation } from "../lib/evaluation-dataset.ts";
import { evaluationPredictionFromAnalysis } from "../lib/garment-evaluation-runner.ts";

const [manifestArgument,outputArgument,limitArgument]=process.argv.slice(2);
if(!manifestArgument||!outputArgument){
  console.error("Usage: pnpm eval:run <manifest.json> <predictions.json> [maximum-cases]");
  process.exitCode=1;
}else{
  const manifestPath=resolve(manifestArgument);
  const outputPath=resolve(outputArgument);
  const manifest=JSON.parse(await readFile(manifestPath,"utf8"));
  if(!Array.isArray(manifest))throw new TypeError("The evaluation manifest must contain a JSON array.");
  const requested=limitArgument===undefined?manifest.length:Number(limitArgument);
  if(!Number.isSafeInteger(requested)||requested<1)throw new TypeError("maximum-cases must be a positive integer.");
  const cases=deterministicEvaluationSample(manifest,requested);
  let predictions=[];
  try{
    const existing=JSON.parse(await readFile(outputPath,"utf8"));
    if(Array.isArray(existing))predictions=existing;
  }catch(error){
    if(error?.code!=="ENOENT")throw error;
  }
  const completedIds=new Set(predictions.map(prediction=>prediction?.externalId).filter(Boolean));
  const manifestDirectory=dirname(manifestPath);

  for(const [index,evaluationCase] of cases.entries()){
    if(completedIds.has(evaluationCase.externalId))continue;
    const images=[];
    const parts=[];
    for(const view of ["front","back","label"]){
      const imagePath=resolve(manifestDirectory,evaluationCase.views[view]);
      const extension=extname(imagePath).toLowerCase();
      const contentType=extension===".png"?"image/png":extension===".webp"?"image/webp":"image/jpeg";
      const bytes=await readFile(imagePath);
      const metadata=await stat(imagePath);
      images.push({view,contentType,base64:bytes.toString("base64")});
      parts.push({view,fileName:`${evaluationCase.externalId}-${view}${extension||".jpg"}`,contentType,size:metadata.size,sha256:createHash("sha256").update(bytes).digest("hex")});
    }
    const analysis=await analyzeGarmentImages(parts,images,{provider:"bedrock",registry:[]});
    const prediction=evaluationPredictionFromAnalysis(evaluationCase.externalId,analysis);
    predictions.push(prediction);
    completedIds.add(evaluationCase.externalId);
    const temporaryPath=`${outputPath}.tmp`;
    await writeFile(temporaryPath,`${JSON.stringify(predictions,null,2)}\n`,"utf8");
    await rename(temporaryPath,outputPath);
    console.log(`[${index+1}/${cases.length}] ${evaluationCase.externalId}: ${prediction.providerStatus}`);
  }

  console.log(JSON.stringify(scoreGarmentEvaluation(cases,predictions),null,2));
}
