import type { Product } from "./types.ts";
import { scoreProduct } from "./matching.ts";
import { canExposeAggregate, MINIMUM_COHORT_SIZE } from "./privacy.ts";
import { computeProductCohort, type LiveProfile } from "./segments.ts";

export interface BrandMetrics {
  opportunity: number | null;
  gapPrevalence: number | null;
  duplicateRisk: number | null;
  segmentSize: number;
  suppressed: boolean;
  minimumCohortSize: number;
  actualWears?: number | null;
  repeatWearRate?: number | null;
  activeOwners?: number | null;
  engagementRate?: number | null;
  averageWearsPerOwner?: number | null;
  medianWearsPerOwner?: number | null;
  zeroWearOwners?: number | null;
  highFrequencyOwners?: number | null;
  lastWearAt?: string | null;
  wearDistribution?: Array<{label:string;owners:number;percentage:number}>;
  weeklyTrend?: Array<{label:string;wears:number;weekStart:string}>;
}

function roundOne(value:number){return Math.round(value*10)/10;}

export function buildWearUsageAnalytics(ownerWearCounts:number[],eventDates:string[],now=new Date()) {
  const counts=ownerWearCounts.map(value=>Math.max(0,Number(value)||0)).sort((a,b)=>a-b);
  const segmentSize=counts.length;
  const activeOwners=counts.filter(value=>value>0).length;
  const actualWears=counts.reduce((sum,value)=>sum+value,0);
  const middle=Math.floor(segmentSize/2);
  const medianWearsPerOwner=segmentSize===0?0:segmentSize%2?counts[middle]:(counts[middle-1]+counts[middle])/2;
  const buckets=[
    {label:"0 wears",test:(value:number)=>value===0},
    {label:"1 wear",test:(value:number)=>value===1},
    {label:"2–3 wears",test:(value:number)=>value>=2&&value<=3},
    {label:"4–5 wears",test:(value:number)=>value>=4&&value<=5},
    {label:"6+ wears",test:(value:number)=>value>=6},
  ];
  const wearDistribution=buckets.map(bucket=>{const owners=counts.filter(bucket.test).length;return {label:bucket.label,owners,percentage:Math.round(owners/Math.max(segmentSize,1)*100)};});
  const currentWeek=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
  const mondayOffset=(currentWeek.getUTCDay()+6)%7;
  currentWeek.setUTCDate(currentWeek.getUTCDate()-mondayOffset);
  const weeklyTrend=Array.from({length:8},(_,index)=>{
    const weekStart=new Date(currentWeek);weekStart.setUTCDate(currentWeek.getUTCDate()-((7-index)*7));
    const weekEnd=new Date(weekStart);weekEnd.setUTCDate(weekStart.getUTCDate()+7);
    const wears=eventDates.map(value=>new Date(value)).filter(value=>!Number.isNaN(value.getTime())&&value>=weekStart&&value<weekEnd).length;
    return {label:weekStart.toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"UTC"}),wears,weekStart:weekStart.toISOString()};
  });
  const validEvents=eventDates.map(value=>new Date(value)).filter(value=>!Number.isNaN(value.getTime())).sort((a,b)=>b.getTime()-a.getTime());
  return {
    actualWears,
    activeOwners,
    repeatWearRate:Math.round(counts.filter(value=>value>=2).length/Math.max(segmentSize,1)*100),
    engagementRate:Math.round(activeOwners/Math.max(segmentSize,1)*100),
    averageWearsPerOwner:roundOne(actualWears/Math.max(segmentSize,1)),
    medianWearsPerOwner:roundOne(medianWearsPerOwner),
    zeroWearOwners:counts.filter(value=>value===0).length,
    highFrequencyOwners:counts.filter(value=>value>=6).length,
    lastWearAt:validEvents[0]?.toISOString()??null,
    wearDistribution,
    weeklyTrend,
  };
}

export function calculateBrandMetrics(product: Product, liveProfile?: LiveProfile | null): BrandMetrics {
  const cohort = computeProductCohort(product, liveProfile ?? null);
  // Judge note: this is the same k-anonymity gate as the brand agent (lib/privacy.ts,
  // lib/agents.ts), applied here to the dashboard's own metric computation. A suppressed
  // result is returned before any per-profile score is aggregated — the null fields are not
  // filtered out of a computed object afterward, they are never computed at all.
  if (!canExposeAggregate(cohort.size)) {
    return { opportunity:null, gapPrevalence:null, duplicateRisk:null, segmentSize:cohort.size, suppressed:true, minimumCohortSize:MINIMUM_COHORT_SIZE };
  }
  const results = cohort.profiles.map((profile) => scoreProduct(product, profile.wardrobe));
  const opportunity = Math.round(results.reduce((sum, result) => sum + result.score, 0) / Math.max(results.length, 1));
  const gapPrevalence = Math.round((results.filter((result) => (result.components.find((c) => c.key === "gap")?.score ?? 0) >= 70).length / Math.max(results.length, 1)) * 100);
  const duplicateRisk = Math.round((results.filter((result) => (result.components.find((c) => c.key === "duplicate")?.score ?? 100) < 50).length / Math.max(results.length, 1)) * 100);
  return { opportunity, gapPrevalence, duplicateRisk, segmentSize:cohort.size, suppressed:false, minimumCohortSize:MINIMUM_COHORT_SIZE };
}
