import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { prepareDetectedGarmentCutout } from "../lib/garment-cutout.ts";

test("a detected item on a plain background becomes a transparent PNG cutout",async()=>{
  const garment=await sharp({create:{width:180,height:280,channels:3,background:{r:55,g:30,b:35}}}).png().toBuffer();
  const photo=await sharp({create:{width:420,height:520,channels:3,background:{r:252,g:251,b:248}}}).composite([{input:garment,left:120,top:120}]).png().toBuffer();
  const result=await prepareDetectedGarmentCutout(photo);
  assert.equal(result.backgroundRemoved,true);
  assert.ok(result.removedPixelRatio>0.4);
  const raw=await sharp(result.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(raw.data[3],0,"corner background is transparent");
  const center=((Math.floor(raw.info.height/2)*raw.info.width)+Math.floor(raw.info.width/2))*4;
  assert.equal(raw.data[center+3],255,"garment center remains opaque");
});

test("a busy crop fails safely without erasing pixels",async()=>{
  const width=240,height=240,data=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const offset=(y*width+x)*3;data[offset]=(x*17+y*31)%256;data[offset+1]=(x*43+y*7)%256;data[offset+2]=(x*5+y*61)%256;}
  const input=await sharp(data,{raw:{width,height,channels:3}}).png().toBuffer();
  const result=await prepareDetectedGarmentCutout(input);
  assert.equal(result.backgroundRemoved,false);
  assert.equal(result.removedPixelRatio,0);
});
