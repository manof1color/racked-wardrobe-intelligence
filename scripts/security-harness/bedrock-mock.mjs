// A scripted stand-in for Bedrock's Converse API, for the Hanger replay (hanger-replay.mjs).
// It listens on 127.0.0.1 only and never reaches AWS. The local production build is pointed at it
// with AWS_ENDPOINT_URL_BEDROCK_RUNTIME, so the real route, the real agent loop and the real tools
// run; only the model's side of the conversation is played from a script.
//
//   node scripts/security-harness/bedrock-mock.mjs            (port 4571, or HARNESS_BEDROCK_PORT)
//
// The AWS SDK speaks HTTP/2 to Bedrock, so the model port is HTTP/2 without TLS. The replay script
// steers it over plain HTTP on the next port up:
//
// POST /__script  { steps: [{ tool, args }], reply }   sets what the "model" does next
// GET  /__calls                                       what the server sent since the last script
//
// A script is the tool calls the model makes, one per model call, then its final reply. Asked again
// after its reply (a correction from the agent), it repeats the reply: a model that does not take
// the hint, which is the case a guarantee has to hold for. A call without tools — the plain reply of
// the grounded pipeline — is refused, so the grounded text answers and nothing is left to chance.
import http from "node:http";
import http2 from "node:http2";

const PORT = Number(process.env.HARNESS_BEDROCK_PORT ?? 4571);
let script = { steps: [], reply: "" };
let position = 0;
let calls = [];

const readBody = (request) => new Promise((resolve) => { let body = ""; request.on("data", (chunk) => { body += chunk; }); request.on("end", () => resolve(body)); });
const send = (response, status, json, headers = {}) => { response.writeHead(status, { "content-type": "application/json", ...headers }); response.end(JSON.stringify(json)); };

http.createServer(async (request, response) => {
  const body = await readBody(request);
  if (request.method === "POST" && request.url === "/__script") {
    script = JSON.parse(body);
    position = 0;
    calls = [];
    return send(response, 200, { ok: true });
  }
  if (request.method === "GET" && request.url === "/__calls") return send(response, 200, { calls });
  return send(response, 404, { message: "Not a replay control." });
}).listen(PORT + 1, "127.0.0.1");

http2.createServer(async (request, response) => {
  const body = await readBody(request);
  if (request.method === "POST" && /^\/model\/[^/]+\/converse$/.test(request.url ?? "")) {
    const sent = JSON.parse(body || "{}");
    if (!sent.toolConfig) {
      calls.push({ kind: "plain" });
      return send(response, 400, { message: "The replay model answers tool-using calls only." }, { "x-amzn-errortype": "ValidationException" });
    }
    const last = sent.messages?.at(-1)?.content ?? [];
    calls.push({
      kind: "agent",
      toolResults: last.flatMap((block) => (block.toolResult ? [JSON.parse(block.toolResult.content?.[0]?.text ?? "null")] : [])),
      correction: position > 0 ? (last.find((block) => typeof block.text === "string")?.text ?? null) : null,
    });
    const step = script.steps?.[position];
    position += 1;
    const content = step
      ? [{ toolUse: { toolUseId: `replay-${position}`, name: step.tool, input: step.args ?? {} } }]
      : [{ text: script.reply || "Here you go." }];
    return send(response, 200, { output: { message: { role: "assistant", content } }, stopReason: step ? "tool_use" : "end_turn", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 } });
  }
  return send(response, 404, { message: "Not part of the replay model." });
}).listen(PORT, "127.0.0.1", () => console.log(`Replay model listening on http://127.0.0.1:${PORT} (HTTP/2, scripted; no AWS); control on ${PORT + 1}.`));
