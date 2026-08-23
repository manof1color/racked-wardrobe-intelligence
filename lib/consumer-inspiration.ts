import type { OutfitPost } from "./platform-types.ts";

export interface ConsumerInspirationRecord {
  postId:string;
  outfitTitle:string;
  styleHints:string[];
  colors:string[];
  categories:string[];
  subtypes:string[];
  createdAt:string;
}

export interface ConsumerInspirationProfile {
  postIds:string[];
  lookCount:number;
  styleHints:string[];
  colors:string[];
  categories:string[];
  subtypes:string[];
  recentLookTitles:string[];
}

export function boundedInspirationStrings(values:unknown,maximum:number,maximumLength=60) {
  return [...new Set((Array.isArray(values)?values:[])
    .filter((value):value is string=>typeof value==="string")
    .map(value=>value.trim().toLowerCase().slice(0,maximumLength))
    .filter(Boolean))].slice(0,maximum);
}

export function consumerInspirationRecord(post:OutfitPost,createdAt=new Date().toISOString()):ConsumerInspirationRecord {
  return {
    postId:post.id.slice(0,128),
    outfitTitle:post.outfitTitle.slice(0,80),
    styleHints:boundedInspirationStrings(post.garments.flatMap(garment=>garment.style??[]),12),
    colors:boundedInspirationStrings(post.garments.map(garment=>garment.color),12),
    categories:boundedInspirationStrings(post.garments.map(garment=>garment.category),12),
    subtypes:boundedInspirationStrings(post.garments.map(garment=>garment.subtype),12),
    createdAt,
  };
}

function rankedValues(records:ConsumerInspirationRecord[],field:"styleHints"|"colors"|"categories"|"subtypes",maximum:number) {
  const counts=new Map<string,number>();
  for(const record of records)for(const value of boundedInspirationStrings(record[field],12))counts.set(value,(counts.get(value)??0)+1);
  return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,maximum).map(([value])=>value);
}

export function consumerInspirationProfile(records:ConsumerInspirationRecord[]):ConsumerInspirationProfile {
  const bounded=records.slice(0,50);
  return {
    postIds:bounded.map(record=>record.postId),
    lookCount:bounded.length,
    styleHints:rankedValues(bounded,"styleHints",8),
    colors:rankedValues(bounded,"colors",8),
    categories:rankedValues(bounded,"categories",8),
    subtypes:rankedValues(bounded,"subtypes",8),
    recentLookTitles:bounded.slice(0,5).map(record=>record.outfitTitle),
  };
}
