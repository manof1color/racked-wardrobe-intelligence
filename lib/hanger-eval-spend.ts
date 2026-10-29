import { INVENTED_OUTFIT_CORRECTION, type AgentConverse, type AgentModelResponse } from "./hanger-agent.ts";

/**
 * The spending guard for the Hanger blind evaluation (work order W7): every Bedrock call the
 * evaluation makes is counted from the tokens Bedrock reports, with a safety margin, and a call is
 * sent only if its worst case still fits under the cap. Same approach as the live-path recognition
 * benchmark (W2), applied to the agent's multi-round turns.
 *
 * This module is pure apart from the `persist` callback the runner supplies, so the cap, the
 * margin and the reservation logic are all tested without AWS.
 */

/** Never more than this, whatever is configured. The owner set $1.50 as the absolute limit. */
export const HARD_BUDGET_USD = 1.5;
/** Published on-demand prices are multiplied by this before counting, to cover regional differences. */
export const PRICE_SAFETY = 1.5;
/** US dollars per 1,000 tokens. Nova Pro $0.80 / $3.20 per million; Nova Lite $0.06 / $0.24. */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "us.amazon.nova-pro-v1:0": { input: 0.0008, output: 0.0032 },
  "amazon.nova-pro-v1:0": { input: 0.0008, output: 0.0032 },
  "us.amazon.nova-lite-v1:0": { input: 0.00006, output: 0.00024 },
  "amazon.nova-lite-v1:0": { input: 0.00006, output: 0.00024 },
};
/** The agent's output ceiling per model call (`inferenceConfig.maxTokens` in bedrockAgentConverse). */
export const AGENT_MAX_OUTPUT_TOKENS = 900;
/** Assumed input size before any call has reported one: the prompt, a 25-piece closet index, and five rounds of tool results, generously. */
export const ASSUMED_MAX_INPUT_TOKENS = 12_000;
/** For the dry-run estimate only: a typical turn is a few rounds of a few thousand tokens in, a few hundred out. */
export const TYPICAL_CALLS_PER_TURN = 3;
export const TYPICAL_INPUT_TOKENS = 3_000;
export const TYPICAL_OUTPUT_TOKENS = 350;

/** The configured cap, never above the hard one. Anything unusable falls back to the hard cap. */
export const budgetLimit = (configured: string | undefined) => {
  const value = Number(configured);
  return Number.isFinite(value) && value > 0 ? Math.min(value, HARD_BUDGET_USD) : HARD_BUDGET_USD;
};

const price = (modelId: string) => {
  const found = MODEL_PRICES[modelId];
  if (!found) throw new Error(`No price is known for ${modelId}; refusing to call it.`);
  return found;
};

/** What a finished call cost, by the tokens Bedrock reported, with the safety margin. */
export function callCostUsd(modelId: string, usage: { inputTokens?: number; outputTokens?: number }) {
  const rates = price(modelId);
  return (((usage.inputTokens ?? 0) / 1000) * rates.input + ((usage.outputTokens ?? 0) / 1000) * rates.output) * PRICE_SAFETY;
}

/**
 * The most the next call could cost. The agent may try a second model if the first id is rejected,
 * and a rejected call is not billed but cannot be told apart from outside, so the worst case is the
 * dearest candidate. A model with no known price makes the whole run refuse.
 */
export function worstCaseCallUsd(modelIds: string[], largestInputSeen: number) {
  if (!modelIds.length) throw new Error("No model is configured; refusing to call anything.");
  return Math.max(...modelIds.map((modelId) => callCostUsd(modelId, { inputTokens: Math.max(largestInputSeen, ASSUMED_MAX_INPUT_TOKENS), outputTokens: AGENT_MAX_OUTPUT_TOKENS })));
}

/** A call may start only if, at its worst, it still leaves the total within the budget. */
export const mayStartCall = (spentUsd: number, modelIds: string[], largestInputSeen: number, budgetUsd: number) =>
  spentUsd + worstCaseCallUsd(modelIds, largestInputSeen) <= budgetUsd;

export interface RunEstimate { requests: number; typicalUsd: number; worstCallUsd: number; capUsd: number }

/** The dry-run figures: what a typical run counts for, and the most any single call may count for. */
export function estimateRun(requests: number, modelIds: string[], budgetUsd: number): RunEstimate {
  const [primary] = modelIds;
  const perCall = callCostUsd(primary, { inputTokens: TYPICAL_INPUT_TOKENS, outputTokens: TYPICAL_OUTPUT_TOKENS });
  return { requests, typicalUsd: requests * TYPICAL_CALLS_PER_TURN * perCall, worstCallUsd: worstCaseCallUsd(modelIds, 0), capUsd: budgetUsd };
}

/** Thrown, with this name, when a call is refused: the agent reads the name and falls back, ending the turn. */
export class BudgetReachedError extends Error {
  constructor() {
    super("Evaluation budget reached");
    this.name = "AiBudgetExhausted";
  }
}

export interface SpendState { spentUsd: number; largestInput: number; callsSent: number }

const round = (value: number) => Number(value.toFixed(6));

/**
 * Counts spending and keeps it on disk. A call is *reserved* at its worst case and the reservation
 * is saved before the call is sent; the real cost replaces it afterwards. If the process dies mid-call,
 * the saved state still counts that call at its worst, so a rerun can never spend the same money twice.
 */
export class SpendGuard {
  readonly state: SpendState;
  readonly budgetUsd: number;
  readonly modelIds: string[];
  private readonly persist: (state: SpendState) => void | Promise<void>;

  constructor(state: SpendState, budgetUsd: number, modelIds: string[], persist: (state: SpendState) => void | Promise<void>) {
    this.state = state;
    // Whatever the caller passes, the cap can only go down.
    this.budgetUsd = Math.min(budgetUsd, HARD_BUDGET_USD);
    this.modelIds = modelIds;
    this.persist = persist;
  }

  /** The call's worst case, now counted; throws BudgetReachedError, and counts nothing, if it would not fit. */
  async reserve() {
    if (!mayStartCall(this.state.spentUsd, this.modelIds, this.state.largestInput, this.budgetUsd)) throw new BudgetReachedError();
    const worst = worstCaseCallUsd(this.modelIds, this.state.largestInput);
    this.state.spentUsd = round(this.state.spentUsd + worst);
    this.state.callsSent += 1;
    await this.persist(this.state);
    return worst;
  }

  /** Swaps a reservation for the real cost. With no usage reported there is no way to know, so the worst case stands. */
  async settle(reserved: number, response: Pick<AgentModelResponse, "usage" | "modelId"> | null) {
    if (!response?.usage || !response.modelId || !MODEL_PRICES[response.modelId]) return;
    this.state.spentUsd = round(this.state.spentUsd - reserved + callCostUsd(response.modelId, response.usage));
    this.state.largestInput = Math.max(this.state.largestInput, response.usage.inputTokens ?? 0);
    await this.persist(this.state);
  }
}

/** What one Hanger turn did, counted from the calls the evaluation actually sent. */
export interface TurnTally { modelCalls: number; toolUses: number; corrections: number; refused: boolean }
export const newTally = (): TurnTally => ({ modelCalls: 0, toolUses: 0, corrections: 0, refused: false });

const lastUserText = (request: Parameters<AgentConverse>[0]) => {
  const last = request.messages.at(-1);
  return last?.role === "user" ? (last.content ?? []).map((block) => block.text ?? "").join("") : "";
};

/**
 * Wraps the agent's model call: reserves before sending, settles after, and tallies tool calls and
 * the agent's one-per-turn correction of an invented outfit list. A refused call is never sent.
 * An error after sending keeps the reservation: that call may still have been billed.
 */
export function meteredAgentCall(send: AgentConverse, guard: SpendGuard, tally: TurnTally): AgentConverse {
  return async (request) => {
    let reserved: number;
    try {
      reserved = await guard.reserve();
    } catch (error) {
      if (error instanceof BudgetReachedError) tally.refused = true;
      throw error;
    }
    if (lastUserText(request) === INVENTED_OUTFIT_CORRECTION) tally.corrections += 1;
    tally.modelCalls += 1;
    const response = await send(request);
    await guard.settle(reserved, response);
    tally.toolUses += (response?.content ?? []).filter((block) => block.toolUse).length;
    return response;
  };
}
