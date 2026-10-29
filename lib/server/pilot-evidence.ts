import "server-only";
import { existsSync } from "node:fs";
import { join } from "node:path";
import pilotData from "@/data/pilot-status.json";
import { pilotLine, pricingNote, type PilotStatus } from "@/lib/pilot-status";

/**
 * The pilot wording for pages. An evidence file counts only if it can be found next to the running
 * app; if the deployment does not carry it, the claim it backs is left out rather than shown.
 */
const present = (path: string) => /^docs\/pilot-evidence\/[\w.-]+$/.test(path) && existsSync(join(process.cwd(), path));
const status = pilotData as PilotStatus;

export const landingPilotLine = () => pilotLine(status, present);
export const pricingPilotNote = () => pricingNote(status, present);
