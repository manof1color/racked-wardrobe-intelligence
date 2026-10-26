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
  wearDistribution?: Array<{label:string;owners:number|null;percentage:number|null}>;
  weeklyTrend?: Array<{label:string;wears:number|null;weekStart:string}>;
  /** Figures withheld because they could single out fewer than `minimumCellSize` owners. */
  withheld?: string[];
  minimumCellSize?: number;
  /** How many more distinct products this brand account can open before the enumeration budget refuses. */
  budget?: { used:number; limit:number; remaining:number; resetsInSeconds:number };
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

/** A released figure about fewer owners than this — or one that would reveal such a figure by subtraction — is withheld. */
export const MINIMUM_CELL_SIZE = 5;

const smallCell = (count:number,total:number)=>(count>0&&count<MINIMUM_CELL_SIZE)||(total-count>0&&total-count<MINIMUM_CELL_SIZE);

/** The latest wear as a day: noon UTC, so it reads as the same date in every time zone. */
export function wearDay(value:string|null){return value?`${value.slice(0,10)}T12:00:00.000Z`:null;}

/**
 * What a brand is shown for a cohort that has passed the 25-owner threshold.
 *
 * Passing the threshold protects the cohort; it does not protect a small group inside it. "6+ wears:
 * 1 owner", or "1 wear this week", describes one person, and a brand that knows a customer owns
 * the product could learn how often they wear it. So every owner count smaller than five is
 * withheld, and so is any count whose complement is smaller than five — "23 of 25 active" says
 * exactly as much about the other two. When one distribution bucket is withheld the next smallest
 * is too, so the total cannot give it back. Weekly wear counts of one to four are withheld, the
 * total and the average are withheld while the total is under five, and the latest wear is given as
 * a day rather than an instant. Withheld figures are null and named in `withheld`; the dashboard
 * says "withheld", never zero.
 *
 * `buildWearUsageAnalytics` stays the plain calculation (the README's seeded figures are recomputed
 * with it); this is the only form that leaves the server.
 */
export function releaseWearAnalytics(ownerWearCounts:number[],eventDates:string[],now=new Date()) {
  const analytics=buildWearUsageAnalytics(ownerWearCounts,eventDates,now);
  const counts=ownerWearCounts.map(value=>Math.max(0,Number(value)||0));
  const total=counts.length;
  const withheld:string[]=[];
  const release=<T,>(field:string,value:T,hide:boolean):T|null=>{if(hide){withheld.push(field);return null;}return value;};
  const activeHidden=smallCell(analytics.activeOwners,total);
  const totalHidden=analytics.actualWears>0&&analytics.actualWears<MINIMUM_CELL_SIZE;
  const repeatHidden=smallCell(counts.filter(value=>value>=2).length,total);
  const hiddenBuckets=new Set(analytics.wearDistribution.flatMap((bucket,index)=>bucket.owners>0&&bucket.owners<MINIMUM_CELL_SIZE||(index===0&&activeHidden)?[index]:[]));
  if(hiddenBuckets.size===1){
    const next=analytics.wearDistribution.map((bucket,index)=>({bucket,index})).filter(({bucket,index})=>bucket.owners>0&&!hiddenBuckets.has(index)).sort((a,b)=>a.bucket.owners-b.bucket.owners)[0];
    if(next)hiddenBuckets.add(next.index);
  }
  const highFrequencyHidden=smallCell(analytics.highFrequencyOwners,total)||hiddenBuckets.has(analytics.wearDistribution.length-1);
  const wearDistribution=analytics.wearDistribution.map((bucket,index)=>hiddenBuckets.has(index)?{label:bucket.label,owners:null,percentage:null}:bucket);
  if(hiddenBuckets.size)withheld.push("wearDistribution");
  const weeklyTrend=analytics.weeklyTrend.map(point=>point.wears>0&&point.wears<MINIMUM_CELL_SIZE?{...point,wears:null}:point);
  if(weeklyTrend.some(point=>point.wears===null))withheld.push("weeklyTrend");
  return {
    actualWears:release("actualWears",analytics.actualWears,totalHidden),
    activeOwners:release("activeOwners",analytics.activeOwners,activeHidden),
    repeatWearRate:release("repeatWearRate",analytics.repeatWearRate,repeatHidden),
    engagementRate:release("engagementRate",analytics.engagementRate,activeHidden),
    averageWearsPerOwner:release("averageWearsPerOwner",analytics.averageWearsPerOwner,totalHidden),
    medianWearsPerOwner:analytics.medianWearsPerOwner,
    zeroWearOwners:release("zeroWearOwners",analytics.zeroWearOwners,activeHidden),
    highFrequencyOwners:release("highFrequencyOwners",analytics.highFrequencyOwners,highFrequencyHidden),
    lastWearAt:wearDay(analytics.lastWearAt),
    wearDistribution,
    weeklyTrend,
    withheld,
    minimumCellSize:MINIMUM_CELL_SIZE,
  };
}

export function calculateBrandMetrics(product: Product, liveProfile?: LiveProfile | null): BrandMetrics {
  const cohort = computeProductCohort(product, liveProfile ?? null);
  // Judge note: this is the same k-anonymity gate as the brand agent (lib/privacy.ts,
  // lib/agents.ts), applied here to the dashboard's own metric computation. A suppressed
  // result is returned before any per-profile score is aggregated — the null fields are not
  // filtered out of a computed object afterward, they are never computed at all.
  if (!canExposeAggregate(cohort.size)) {
    // The cohort size is withheld too: a count below the threshold is itself a small cell.
    return { opportunity:null, gapPrevalence:null, duplicateRisk:null, segmentSize:0, suppressed:true, minimumCohortSize:MINIMUM_COHORT_SIZE };
  }
  const results = cohort.profiles.map((profile) => scoreProduct(product, profile.wardrobe));
  const opportunity = Math.round(results.reduce((sum, result) => sum + result.score, 0) / Math.max(results.length, 1));
  const gapPrevalence = Math.round((results.filter((result) => (result.components.find((c) => c.key === "gap")?.score ?? 0) >= 70).length / Math.max(results.length, 1)) * 100);
  const duplicateRisk = Math.round((results.filter((result) => (result.components.find((c) => c.key === "duplicate")?.score ?? 100) < 50).length / Math.max(results.length, 1)) * 100);
  return { opportunity, gapPrevalence, duplicateRisk, segmentSize:cohort.size, suppressed:false, minimumCohortSize:MINIMUM_COHORT_SIZE };
}
