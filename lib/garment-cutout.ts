import sharp from "sharp";

export interface GarmentCutout {
  buffer:Buffer;
  width:number;
  height:number;
  backgroundRemoved:boolean;
  removedPixelRatio:number;
  method:"edge-fallback"|"none";
}

const MAX_WIDTH=700;
const MAX_HEIGHT=900;
const MAX_BACKGROUND_SPREAD=58;

function median(values:number[]) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)]??0;
}

function colorDistance(data:Buffer,index:number,color:[number,number,number]) {
  const offset=index*4;
  return Math.hypot(data[offset]-color[0],data[offset+1]-color[1],data[offset+2]-color[2]);
}

function borderIndexes(width:number,height:number) {
  const indexes:number[]=[];
  const step=Math.max(1,Math.floor(Math.min(width,height)/120));
  for(let x=0;x<width;x+=step){indexes.push(x,(height-1)*width+x);}
  for(let y=step;y<height-1;y+=step){indexes.push(y*width,(y*width)+width-1);}
  return indexes;
}

/**
 * Removes only background-like pixels connected to a crop edge. This is deliberately
 * conservative: a busy or inconsistent edge stays opaque instead of erasing part of
 * the garment. AI supplies the per-item bounds; this deterministic step prepares the
 * resulting crop for a white card or transparent outfit canvas.
 */
export async function prepareDetectedGarmentCutout(input:Buffer):Promise<GarmentCutout>{
  const raster=await sharp(input).resize({width:MAX_WIDTH,height:MAX_HEIGHT,fit:"inside",withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const width=raster.info.width;
  const height=raster.info.height;
  const pixels=Buffer.from(raster.data);
  const edge=borderIndexes(width,height);
  const background:[number,number,number]=[
    median(edge.map(index=>pixels[index*4])),
    median(edge.map(index=>pixels[(index*4)+1])),
    median(edge.map(index=>pixels[(index*4)+2])),
  ];
  const spread=median(edge.map(index=>colorDistance(pixels,index,background)));
  if(spread>MAX_BACKGROUND_SPREAD){
    const buffer=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer();
    return {buffer,width,height,backgroundRemoved:false,removedPixelRatio:0,method:"none"};
  }

  const tolerance=Math.max(30,Math.min(74,Math.round(34+(spread*1.35))));
  const visited=new Uint8Array(width*height);
  const queue=new Int32Array(width*height);
  let head=0,tail=0;
  for(const index of edge){
    if(!visited[index]&&colorDistance(pixels,index,background)<=tolerance){visited[index]=1;queue[tail++]=index;}
  }
  while(head<tail){
    const index=queue[head++];
    const x=index%width;
    const neighbors=[index-width,index+width,index-1,index+1];
    for(let position=0;position<4;position++){
      const next=neighbors[position];
      if(next<0||next>=visited.length||visited[next])continue;
      if((position===2&&x===0)||(position===3&&x===width-1))continue;
      if(colorDistance(pixels,next,background)<=tolerance){visited[next]=1;queue[tail++]=next;}
    }
  }
  const removedPixelRatio=tail/(width*height);
  if(removedPixelRatio<0.03||removedPixelRatio>0.92){
    const buffer=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer();
    return {buffer,width,height,backgroundRemoved:false,removedPixelRatio:0,method:"none"};
  }
  for(let index=0;index<visited.length;index++)if(visited[index])pixels[(index*4)+3]=0;
  const buffer=await sharp(pixels,{raw:{width,height,channels:4}}).png({compressionLevel:9}).toBuffer();
  return {buffer,width,height,backgroundRemoved:true,removedPixelRatio:Number(removedPixelRatio.toFixed(4)),method:"edge-fallback"};
}
