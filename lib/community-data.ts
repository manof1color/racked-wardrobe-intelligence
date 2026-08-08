import type { OutfitPost, PartnerDashboardData, PartnerVertical } from "./platform-types.ts";

// Kept as an empty compatibility export for historical unit tests. The application reads
// community posts from DynamoDB and never serves seeded posts.
export const seedCommunityPosts:OutfitPost[]=[];

const base=(vertical:PartnerVertical,title:string,description:string):PartnerDashboardData=>({vertical,title,description,metrics:[{label:"Registered products",value:"—",detail:"Sign in to view your catalog"},{label:"Eligible owners",value:"—",detail:"Released only at k ≥ 25"},{label:"Confirmed wears",value:"—",detail:"Account data required"},{label:"Repeat wear",value:"—",detail:"Account data required"}],inventory:[],agentBrief:"Sign in to the Brand workspace and enroll an authorized product before wear intelligence can be calculated."});
export const partnerDashboards:Record<PartnerVertical,PartnerDashboardData>={
  vintage:base("vintage","Vintage reseller intelligence","Track verified second-life pieces, provenance, and repeat wear from your own catalog."),
  clothing:base("clothing","Apparel brand intelligence","Connect enrolled garments to privacy-safe actual-wear signals."),
  shoes:base("shoes","Footwear wear intelligence","Measure rotation frequency and repeat use for verified footwear SKUs."),
  jewelry:base("jewelry","Jewelry rotation intelligence","Understand repeat styling for enrolled jewelry without exposing individual wardrobes."),
};
