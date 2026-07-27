import { products as baseProducts, type Product } from './launches';
import { latestMultisource } from './latest-multisource';
import { julySeeds } from './launch-seeds-july';
import { juneSeeds } from './launch-seeds-june';

type Seed=readonly [string,string,string,string];
const accents=['#c9ff57','#7ac7ff','#ff7d66','#ffd36a','#90e0c1','#c9b7ff','#ffb7a7','#bde58d'];
const slugify=(value:string)=>value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72);
const initials=(value:string)=>value.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
const buildImportedProducts=(seeds:readonly Seed[]):Product[]=>(seeds.map(([name,tagline,category,launched],index)=>{const [monthName,dayText]=launched.split(' ');const month=monthName==='July'?7:6;const day=Number(dayText);const freshness=month===7?40+day:8+day;return{id:`${slugify(name)}-${month}-${day}`,name,initials:initials(name),category,tagline,description:`${tagline}. Featured in Product Hunt's ${launched}, 2026 daily launch lineup.`,audience:`${category} teams, founders and early adopters`,pricing:'See launch page',launched,freshness,accent:accents[index%accents.length],tags:[category,'Product Hunt','New launch'],url:`https://www.producthunt.com/leaderboard/daily/2026/${month}/${day}/all`};}));
const seen=new Set<string>();
export const products:Product[]=[...baseProducts,...latestMultisource,...buildImportedProducts(julySeeds),...buildImportedProducts(juneSeeds)].filter(product=>{const key=product.name.trim().toLowerCase().replace(/\s+/g,' ');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,383);
export const catalogStats={total:products.length,base:baseProducts.length,imported:Math.max(0,products.length-baseProducts.length),automated:true};
export type { Product };
