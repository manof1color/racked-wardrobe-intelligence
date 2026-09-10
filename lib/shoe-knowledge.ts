/**
 * Repository-owned footwear reference data used to ground AI estimates and normalize
 * provider vocabulary. This is not a product catalog, training corpus, or identity
 * source: it contains only generic shoe classes, aliases, and visible construction cues.
 */
export const SHOE_KNOWLEDGE = [
  { subtype:"sneakers", label:"Sneakers", singularLabel:"Sneaker", aliases:["sneaker","sneakers","trainer","trainers","tennis shoe","tennis shoes","athletic shoe","athletic shoes"], visibleCues:["casual or athletic upper","flexible rubber sole","laces or casual closure"] },
  { subtype:"low-top-sneakers", label:"Low-Top Sneakers", singularLabel:"Low-Top Sneaker", aliases:["low top","low tops","low-top sneaker","low-top sneakers"], visibleCues:["collar ends below ankle","rubber sneaker sole"] },
  { subtype:"high-top-sneakers", label:"High-Top Sneakers", singularLabel:"High-Top Sneaker", aliases:["high top","high tops","high-top sneaker","high-top sneakers"], visibleCues:["sneaker collar covers or reaches ankle","rubber sneaker sole"] },
  { subtype:"running-shoes", label:"Running Shoes", singularLabel:"Running Shoe", aliases:["running shoe","running shoes","runner","runners","jogging shoe","jogging shoes"], visibleCues:["cushioned shaped midsole","breathable athletic upper","heel-to-toe running geometry"] },
  { subtype:"basketball-shoes", label:"Basketball Shoes", singularLabel:"Basketball Shoe", aliases:["basketball shoe","basketball shoes","basketball sneaker","basketball sneakers","hoop shoe","hoop shoes"], visibleCues:["court outsole","supportive athletic upper","ankle or lateral support"] },
  { subtype:"skate-shoes", label:"Skate Shoes", singularLabel:"Skate Shoe", aliases:["skate shoe","skate shoes","skate sneaker","skate sneakers"], visibleCues:["flat grippy sole","reinforced toe or side panels","padded low or mid collar"] },
  { subtype:"slip-on-sneakers", label:"Slip-On Sneakers", singularLabel:"Slip-On Sneaker", aliases:["slip-on sneaker","slip-on sneakers","slip on sneaker","slip on sneakers"], visibleCues:["sneaker sole","no laces","elastic side gussets or open instep"] },
  { subtype:"dress-shoes", label:"Dress Shoes", singularLabel:"Dress Shoe", aliases:["dress shoe","dress shoes","formal shoe","formal shoes"], visibleCues:["structured polished upper","low profile formal sole"] },
  { subtype:"oxfords", label:"Oxfords", singularLabel:"Oxford", aliases:["oxford","oxfords","oxford shoe","oxford shoes"], visibleCues:["closed lacing quarters","structured dress-shoe upper"] },
  { subtype:"derbies", label:"Derbies", singularLabel:"Derby", aliases:["derby","derbies","derby shoe","derby shoes","blucher","bluchers"], visibleCues:["open lacing quarters","structured dress-shoe upper"] },
  { subtype:"loafers", label:"Loafers", singularLabel:"Loafer", aliases:["loafer","loafers","penny loafer","penny loafers","tassel loafer","tassel loafers"], visibleCues:["low slip-on profile","defined heel","moccasin or apron seam"] },
  { subtype:"boots", label:"Boots", singularLabel:"Boot", aliases:["boot","boots"], visibleCues:["upper extends to or above ankle","substantial sole"] },
  { subtype:"ankle-boots", label:"Ankle Boots", singularLabel:"Ankle Boot", aliases:["ankle boot","ankle boots","bootie","booties"], visibleCues:["boot shaft ends near ankle","zip, lace, or pull-on closure"] },
  { subtype:"chelsea-boots", label:"Chelsea Boots", singularLabel:"Chelsea Boot", aliases:["chelsea boot","chelsea boots"], visibleCues:["ankle-height pull-on boot","elastic side gussets","heel pull tab often visible"] },
  { subtype:"work-boots", label:"Work Boots", singularLabel:"Work Boot", aliases:["work boot","work boots","utility boot","utility boots"], visibleCues:["rugged lug sole","reinforced leather or synthetic upper","durable ankle shaft"] },
  { subtype:"hiking-boots", label:"Hiking Boots", singularLabel:"Hiking Boot", aliases:["hiking boot","hiking boots","trail boot","trail boots"], visibleCues:["deep trail lugs","supportive outdoor upper","protective toe and hiking lacing"] },
  { subtype:"sandals", label:"Sandals", singularLabel:"Sandal", aliases:["sandal","sandals","strappy sandal","strappy sandals"], visibleCues:["open upper","straps expose much of foot","separate sole"] },
  { subtype:"slides", label:"Slides", singularLabel:"Slide", aliases:["slide","slides","slide sandal","slide sandals"], visibleCues:["open heel","single or divided forefoot strap","no ankle fastening"] },
  { subtype:"heels", label:"Heels", singularLabel:"Heel", aliases:["heel","heels","high heel","high heels","pump","pumps","stiletto","stilettos"], visibleCues:["heel visibly raised above forefoot","formal or dress upper"] },
  { subtype:"flats", label:"Flats", singularLabel:"Flat", aliases:["flat","flats","ballet flat","ballet flats"], visibleCues:["low-cut upper","minimal heel","thin dress sole"] },
  { subtype:"mules", label:"Mules", singularLabel:"Mule", aliases:["mule","mules"], visibleCues:["backless upper","closed or open toe","no rear strap"] },
  { subtype:"clogs", label:"Clogs", singularLabel:"Clog", aliases:["clog","clogs"], visibleCues:["backless or slingback form","substantial rigid-looking sole","roomy closed toe"] },
  { subtype:"other-shoes", label:"Other Shoes", singularLabel:"Other Shoe", aliases:["shoe","shoes","footwear","other shoe","other shoes"], visibleCues:["wearable footwear is visible but evidence does not support a narrower class"] },
] as const;

export type ShoeKnowledgeEntry = (typeof SHOE_KNOWLEDGE)[number];

export function shoeKnowledgePrompt() {
  return SHOE_KNOWLEDGE.map((entry) => `${entry.subtype} (${entry.aliases.join(", ")}): ${entry.visibleCues.join("; ")}`).join(" | ");
}

export function shoeKnowledgeForSubtype(subtype:string):ShoeKnowledgeEntry {
  return SHOE_KNOWLEDGE.find((entry)=>entry.subtype===subtype)??SHOE_KNOWLEDGE.at(-1)!;
}
