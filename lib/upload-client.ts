const TARGET_IMAGE_BYTES = 1_200_000;
const MAX_IMAGE_DIMENSION = 1800;
const JPEG_QUALITIES = [0.86, 0.78, 0.7, 0.62];

function loadImage(url:string) {
  return new Promise<HTMLImageElement>((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error("This photo could not be opened. Try a JPG, PNG, or WebP image."));
    image.src=url;
  });
}

function canvasBlob(canvas:HTMLCanvasElement,quality:number) {
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("This photo could not be prepared for upload.")),"image/jpeg",quality));
}

export async function prepareImageForUpload(file:File) {
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Photos must be JPG, PNG, or WebP.");
  const objectUrl=URL.createObjectURL(file);
  try {
    const image=await loadImage(objectUrl);
    const scale=Math.min(1,MAX_IMAGE_DIMENSION/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext("2d",{alpha:false});
    if(!context)throw new Error("This browser could not prepare the photo.");
    context.fillStyle="#ffffff";
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    let blob=await canvasBlob(canvas,JPEG_QUALITIES[0]);
    for(const quality of JPEG_QUALITIES.slice(1)){
      if(blob.size<=TARGET_IMAGE_BYTES)break;
      blob=await canvasBlob(canvas,quality);
    }
    if(blob.size>1_800_000)throw new Error("This photo is still too large after preparation. Crop it closer to the garment and try again.");
    const name=file.name.replace(/\.[^.]+$/,"")||"garment";
    return new File([blob],`${name}-racked.jpg`,{type:"image/jpeg",lastModified:Date.now()});
  } finally { URL.revokeObjectURL(objectUrl); }
}

export async function readJsonResponse<T>(response:Response,fallback:string):Promise<T> {
  const text=await response.text();
  const type=response.headers.get("content-type")??"";
  if(!type.toLowerCase().includes("application/json")){
    if(response.status===413)throw new Error("The photos exceeded the hosting upload limit. Racked now prepares smaller copies automatically; choose the photos again and retry.");
    throw new Error(`The image service returned an unexpected ${response.status||"network"} response. Please retry; your wardrobe was not changed.`);
  }
  try{return JSON.parse(text) as T;}catch{throw new Error(fallback);}
}
