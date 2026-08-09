export function parseModelJson<T>(text:string):T {
  const stripped=text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
  try { return JSON.parse(stripped) as T; } catch {}
  const start=stripped.indexOf("{");
  const end=stripped.lastIndexOf("}");
  if(start<0||end<=start) throw new Error("The model response did not contain a JSON object.");
  return JSON.parse(stripped.slice(start,end+1)) as T;
}
