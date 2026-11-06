// Fictional outfits for the judge Community feed. Ordered to mix menswear and womenswear.
const rows = [
  ["street-member","streetwear","street","Street Layers",["005|Heavyweight Hoodie|128|top|hoodie|charcoal|cotton","cargo|Cargo Pants|bottom|casual-pants|olive|cotton","sneakers|Chunky Sneakers|shoe|sneakers|white|mesh"]],
  ["women-street","streetwear","city","Cropped City Layers",["023|Cropped Bomber|175|outerwear|bomber-jacket|olive|nylon","jeans|High-Waisted Jeans|bottom|jeans|indigo|cotton","sneakers|Platform Sneakers|shoe|sneakers|cream|leather"]],
  ["street-brand","streetwear","","City Layers",["006|Nylon Bomber|185|outerwear|bomber-jacket|sage|nylon","007|Oversized Tee|58|top|t-shirt|white|cotton","008|Canvas Cap|36|accessory|hat|navy|canvas"]],
  ["women-work","workwear","","Arcade Tailoring",["024|Tailored Blazer|260|outerwear|blazer|navy|wool","025|Pleated Trousers|140|bottom|dress-pants|taupe|wool"]],
  ["minimal","minimal","minimal","Quiet Neutrals",["009|Cream Crew Knit|118|top|sweater|cream|wool","trousers|Wide-Leg Trousers|bottom|dress-pants|taupe|wool","loafers|Leather Loafers|shoe|loafers|brown|leather"]],
  ["women-casual","casual","weekend","Market Weekend",["026|Linen Shirt Dress|135|dress|shirt-dress|blue|linen","sandals|Flat Sandals|shoe|sandals|tan|leather","tote|Canvas Tote|bag|tote|cream|canvas"]],
  ["casual","casual","casual","Cafe Denim",["010|Washed Denim Jacket|165|outerwear|denim-jacket|blue|cotton","011|Striped Tee|48|top|t-shirt|white|cotton","sneakers|Canvas Sneakers|shoe|sneakers|cream|canvas"]],
  ["women-athletic","athletic","studio","Studio Training",["027|Zip Training Top|78|top|other-top|mauve|polyester","028|Performance Leggings|88|bottom|leggings|charcoal|polyester","shoes|Running Shoes|shoe|running-shoes|white|mesh"]],
  ["work","workwear","","Courtyard Workwear",["012|Knit Polo|98|top|polo|green|cotton","013|Stone Chinos|110|bottom|chinos|beige|cotton"]],
  ["women-formal","formal","","Teal Formal",["029|Floor-Length Gown|480|dress|formal-dress|teal|satin","030|Pointed Pumps|220|shoe|heels|black|leather"]],
  ["athletic","athletic","active","Track Session",["014|Track Jacket|120|outerwear|other-outerwear|burgundy|polyester","sweatpants|Sweatpants|bottom|sweatpants|gray|cotton","shoes|Running Shoes|shoe|running-shoes|navy|mesh"]],
  ["evening-member","evening","evening","Gallery Evening",["017|Satin Midi Dress|210|dress|midi-dress|plum|satin","heels|Block Heels|shoe|heels|black|leather","clutch|Envelope Clutch|bag|clutch|bronze|leather"]],
  ["outdoor","outdoor","trail","Woodland Trail",["015|Technical Shell|240|outerwear|rain-jacket|rust|nylon","016|Trail Boots|190|shoe|boots|brown|leather","fleece|Zip Fleece|outerwear|other-outerwear|cream|polyester"]],
  ["evening-brand","evening","","Velvet Evening",["018|Velvet Blazer|320|outerwear|blazer|burgundy|velvet","019|Silk Shirt|140|top|dress-shirt|gray|silk"]],
  ["formal","formal","","Charcoal Formal",["020|Charcoal Suit Jacket|425|outerwear|suit-jacket|charcoal|wool","021|Charcoal Dress Trousers|195|bottom|dress-pants|charcoal|wool","022|Black Oxford|260|shoe|oxfords|black|leather"]],
];

export const JUDGE_LOOKS = rows.map(([key, style, member, title, specs], index) => ({
  key, style, member, title: `Judge ${title}`, daysAgo: 8 + index,
  id: `judge-look-${key}`, photo: `look-${key}`, brandLookId: member ? null : `judge-brand-look-${key}`,
  pieces: specs.map((spec) => {
    const [code, name, ...details] = spec.split("|");
    const priced = /^\d+$/.test(code);
    const [category, subtype, color, material] = priced ? details.slice(1) : details;
    const piece = { name: `Judge ${name}`, category, subtype, color, material, pattern: code === "011" ? "striped" : "solid", style: [style === "workwear" ? "professional" : style] };
    if (!priced) return { ...piece, photo: `closet-${key}-${code}` };
    return { ...piece, key: `jda-${code}`, id: `judge-product-jda-${code}`, sku: `JDA-${code}`, price: Number(details[0]), frontOnly: true };
  }),
}));

export const JUDGE_LOOK_PRODUCTS = JUDGE_LOOKS.flatMap((look) => look.pieces.filter((piece) => piece.sku));
