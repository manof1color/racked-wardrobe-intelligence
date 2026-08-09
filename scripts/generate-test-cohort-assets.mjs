import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const output="public/test-cohort";
await mkdir(output,{recursive:true});
const canvas=(body)=>`<svg width="900" height="1100" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f3efe5"/>${body}</svg>`;
const front=canvas(`<path d="M250 235 350 170h200l100 65 120 190-105 65-65-92v500H300V398l-65 92-105-65z" fill="#394a63"/><path d="M350 170q100 100 200 0" fill="none" stroke="#f3efe5" stroke-width="28"/><text x="450" y="530" text-anchor="middle" font-family="Arial" font-weight="700" font-size="58" fill="#d5f66d">RTA</text><text x="450" y="1020" text-anchor="middle" font-family="Arial" font-size="28" fill="#171914">RACKED TEST ATELIER · FRONT</text>`);
const back=canvas(`<path d="M250 235 350 170h200l100 65 120 190-105 65-65-92v500H300V398l-65 92-105-65z" fill="#394a63"/><path d="M365 175q85 58 170 0" fill="none" stroke="#f3efe5" stroke-width="22"/><path d="M305 390h290" stroke="#26364d" stroke-width="8"/><text x="450" y="1020" text-anchor="middle" font-family="Arial" font-size="28" fill="#171914">RACKED TEST ATELIER · BACK</text>`);
const label=canvas(`<rect x="190" y="250" width="520" height="600" rx="22" fill="#fffdf8" stroke="#171914" stroke-width="8"/><text x="450" y="370" text-anchor="middle" font-family="Arial" font-weight="800" font-size="34" fill="#171914">RACKED TEST ATELIER</text><text x="450" y="470" text-anchor="middle" font-family="Arial" font-size="38" fill="#171914">RTA-TEE-001</text><text x="450" y="555" text-anchor="middle" font-family="Arial" font-size="32" fill="#171914">GTIN 00012345678905</text><text x="450" y="640" text-anchor="middle" font-family="Arial" font-size="30" fill="#171914">100% TEST COTTON</text><text x="450" y="760" text-anchor="middle" font-family="Arial" font-weight="700" font-size="26" fill="#e94f30">SYNTHETIC TEST PRODUCT</text>`);
await Promise.all([["front",front],["back",back],["label",label]].map(([name,svg])=>sharp(Buffer.from(svg)).png().toFile(`${output}/rta-tee-001-${name}.png`)));
console.log(`Generated three clearly labeled test-cohort images in ${output}.`);
