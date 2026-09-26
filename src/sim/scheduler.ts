import type { Observation, TeamAction, TeamId } from "../contracts/types";
import { neutralAction, resolveFireTargets, validateTeamAction } from "../contracts/validation";
import { buildObservation } from "./observation";
import { stepWorld } from "./world";
import type { StepControls, WorldState } from "./types";

export interface DecisionSubmission { teamId: TeamId; receivedAtMs: number; raw: unknown; accepted: boolean; errors: string[]; }
export interface DecisionBatch {
  decisionId: number;
  observedAtTick: number;
  applyAtTick: number;
  deadlineMs: number;
  observations: Record<TeamId, Observation>;
  submissions: Partial<Record<TeamId, DecisionSubmission>>;
}
export interface CommittedDecision {
  decisionId: number;
  applyAtTick: number;
  controls: StepControls;
  fallback: Record<TeamId, boolean>;
  errors: Record<TeamId, string[]>;
}

export function createDecisionBatch(state: WorldState, decisionId: number, openedAtMs: number): DecisionBatch {
  const applyAtTick = state.tick + state.config.timing.decisionIntervalTicks * state.config.timing.actionLatencyWindows;
  return {
    decisionId,
    observedAtTick: state.tick,
    applyAtTick,
    deadlineMs: openedAtMs + state.config.timing.decisionBudgetMs,
    observations: {
      blue: buildObservation(state, "blue", decisionId, applyAtTick),
      rose: buildObservation(state, "rose", decisionId, applyAtTick),
    },
    submissions: {},
  };
}

export function submitDecision(batch: DecisionBatch, teamId: TeamId, decisionId: number, raw: unknown, receivedAtMs: number): boolean {
  if (decisionId !== batch.decisionId || receivedAtMs > batch.deadlineMs || batch.submissions[teamId]) return false;
  const ownIds = new Set(batch.observations[teamId].ships.map(ship => ship.id));
  const result = validateTeamAction(raw, ownIds);
  batch.submissions[teamId] = { teamId, receivedAtMs, raw, accepted: result.ok, errors: result.ok ? [] : result.errors };
  return result.ok;
}

export function commitDecision(batch: DecisionBatch): CommittedDecision {
  const controls = { blue: [] as TeamAction["actions"], rose: [] as TeamAction["actions"] };
  const fallback = { blue: false, rose: false };
  const errors = { blue: [] as string[], rose: [] as string[] };
  for (const teamId of ["blue", "rose"] as const) {
    const submission = batch.submissions[teamId];
    if (submission?.accepted) {
      const validated = validateTeamAction(submission.raw, new Set(batch.observations[teamId].ships.map(ship => ship.id)));
      if (validated.ok) controls[teamId] = resolveFireTargets(batch.observations[teamId], validated.value).actions;
      else { fallback[teamId] = true; errors[teamId] = validated.errors; }
    } else {
      fallback[teamId] = true;
      errors[teamId] = submission?.errors ?? ["deadline fallback"];
    }
    const supplied = new Set(controls[teamId].map(action => action.shipId));
    for (const ship of batch.observations[teamId].ships) if (!supplied.has(ship.id)) controls[teamId].push(neutralAction(ship.id));
    controls[teamId].sort((a, b) => a.shipId.localeCompare(b.shipId));
  }
  return { decisionId: batch.decisionId, applyAtTick: batch.applyAtTick, controls, fallback, errors };
}

/** Applies one committed batch for exactly one decision interval; one-shot interactions occur only on activation. */
export function advanceCommittedWindow(initial: WorldState, committed: CommittedDecision): WorldState {
  if (initial.tick !== committed.applyAtTick) throw new Error(`Decision ${committed.decisionId} applies at tick ${committed.applyAtTick}, not ${initial.tick}.`);
  let state = stepWorld(initial, committed.controls);
  for (let offset = 1; offset < initial.config.timing.decisionIntervalTicks; offset += 1) state = stepWorld(state);
  return state;
}
