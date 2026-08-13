import type { BrandProductRegistration, CommerceDestinationState } from "./platform-types.ts";

function isPrivateIpv4(hostname:string){
  const parts=hostname.split(".").map(Number);
  if(parts.length!==4||parts.some(value=>!Number.isInteger(value)||value<0||value>255))return false;
  return parts[0]===10||parts[0]===127||parts[0]===0||parts[0]>=224||(parts[0]===169&&parts[1]===254)||(parts[0]===192&&parts[1]===168)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31);
}

export function normalizeCommerceUrl(value:string|undefined){
  const raw=value?.trim();
  if(!raw)return undefined;
  let parsed:URL;
  try{parsed=new URL(raw);}catch{throw new Error("Product destinations must be valid HTTPS URLs.");}
  const hostname=parsed.hostname.toLowerCase();
  if(parsed.protocol!=="https:"||parsed.username||parsed.password||(parsed.port&&parsed.port!=="443"))throw new Error("Product destinations must use public HTTPS without credentials or custom ports.");
  if(hostname==="localhost"||hostname.endsWith(".local")||hostname.endsWith(".internal")||hostname.includes(":")||isPrivateIpv4(hostname))throw new Error("Product destinations must use a public website host.");
  parsed.hash="";
  return parsed.toString().slice(0,2_000);
}

export function commerceDestination(product:BrandProductRegistration):{state:CommerceDestinationState;url?:string}{
  if(product.availability==="unavailable"||product.availability==="discontinued")return {state:"EXACT_UNAVAILABLE"};
  const url=normalizeCommerceUrl(product.affiliateUrl??product.productUrl);
  return url?{state:"EXACT_AVAILABLE",url}:{state:"NO_DESTINATION"};
}
