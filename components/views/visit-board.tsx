"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  VISIT_PLAN_STAGES,
  stageNeighbors,
  type BoardCard,
  type VisitPlanStage,
} from "@/lib/domain/views";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

function stageLabel(stage: VisitPlanStage) {
  switch (stage) {
    case "readerConfirmation":
      return "Reader confirmation";
    case "schoolContact":
      return "School contact";
    case "securingBooks":
      return "Securing books";
    default: {
      const unhandledStage: never = stage;
      throw new Error(`Unhandled visit plan stage: ${unhandledStage}`);
    }
  }
}

function dateInputValue(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function timestampFromDateInput(value: string) {
  if (value.trim().length === 0) {
    return undefined;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function VisitBoardFallback() {
  return (
    <section className="card stack" aria-labelledby="visit-board-heading">
      <h2 id="visit-board-heading">Visit board</h2>
      <p>
        Move school visits through confirmation, follow-up, and securing books.
      </p>
    </section>
  );
}

export function VisitBoard() {
  if (!convexConfigured) {
    return <VisitBoardFallback />;
  }
  return <VisitBoardLive />;
}

function VisitBoardLive() {
  const board = useQuery(api.views.listVisitBoard);
  const schools = useQuery(api.schools.listSchools);
  const visits = useQuery(api.visits.listVisits);
  const saveVisitPlan = useMutation(api.views.saveVisitPlan);
  const setVisitPlanStage = useMutation(api.views.setVisitPlanStage);
  const resolveVisitPlan = useMutation(api.views.resolveVisitPlan);
  const [status, setStatus] = useState("");
  const [resolvingPlanId, setResolvingPlanId] = useState<
    Id<"visitPlans"> | undefined
  >(undefined);
  const [selectedVisitId, setSelectedVisitId] = useState<
    Id<"visits"> | ""
  >("");

  if (board === undefined || schools === undefined || visits === undefined) {
    return (
      <section className="card stack" aria-labelledby="visit-board-heading">
        <h2 id="visit-board-heading">Visit board</h2>
        <p className="muted" role="status">
          Loading visit board…
        </p>
      </section>
    );
  }

  const schoolOptions = schools;
  const visitOptions = visits;
  const boardData = board;

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const school = schoolOptions.find(
      (item) => item._id === String(data.get("schoolId") ?? ""),
    );
    const stage = VISIT_PLAN_STAGES.find(
      (item) => item === String(data.get("stage") ?? ""),
    );
    if (!school || stage === undefined) {
      setStatus("Choose a school and stage.");
      return;
    }
    const plannedFor = timestampFromDateInput(
      String(data.get("plannedFor") ?? ""),
    );
    const notes = String(data.get("notes") ?? "").trim();
    setStatus("Saving visit plan…");
    try {
      await saveVisitPlan({
        schoolId: school._id,
        stage,
        ...(plannedFor === undefined ? {} : { plannedFor }),
        ...(notes.length === 0 ? {} : { notes }),
      });
      form.reset();
      setStatus("Visit plan saved.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not save visit plan.",
      );
    }
  }

  async function moveCard(card: BoardCard<Id<"visitPlans">, Id<"schools">>, direction: "previous" | "next") {
    const neighbors = stageNeighbors(card.stage);
    const stage = neighbors[direction];
    if (stage === undefined) {
      return;
    }
    setStatus(`Moving ${card.schoolName}…`);
    try {
      await setVisitPlanStage({ planId: card.planId, stage });
      setStatus(`${card.schoolName} moved to ${stageLabel(stage)}.`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not move visit plan.",
      );
    }
  }

  async function archiveCard(card: BoardCard<Id<"visitPlans">, Id<"schools">>) {
    setStatus(`Archiving ${card.schoolName}…`);
    try {
      await resolveVisitPlan({
        planId: card.planId,
        resolution: { kind: "archived" },
      });
      setStatus(`${card.schoolName} archived.`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not archive visit plan.",
      );
    }
  }

  async function markVisited(card: BoardCard<Id<"visitPlans">, Id<"schools">>) {
    if (selectedVisitId === "") {
      setStatus("Choose a visit to mark this plan visited.");
      return;
    }
    setStatus(`Marking ${card.schoolName} visited…`);
    try {
      await resolveVisitPlan({
        planId: card.planId,
        resolution: { kind: "visited", visitId: selectedVisitId },
      });
      setResolvingPlanId(undefined);
      setSelectedVisitId("");
      setStatus(`${card.schoolName} marked visited.`);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not mark visit plan visited.",
      );
    }
  }

  return (
    <section className="stack" aria-labelledby="visit-board-heading">
      <h2 id="visit-board-heading">Visit board</h2>
      <form className="card stack" onSubmit={createPlan}>
        <h3>Plan a visit</h3>
        <label>
          School
          <select required name="schoolId" defaultValue="">
            <option value="" disabled>
              Choose a school
            </option>
            {schoolOptions.map((school) => (
              <option key={school._id} value={school._id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stage
          <select required name="stage" defaultValue="readerConfirmation">
            {VISIT_PLAN_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stageLabel(stage)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Planned for
          <input name="plannedFor" type="date" />
        </label>
        <label>
          Notes
          <textarea name="notes" />
        </label>
        <button className="button">Save visit plan</button>
      </form>
      <div className="row" style={{ alignItems: "stretch" }}>
        {VISIT_PLAN_STAGES.map((stage) => (
          <section
            key={stage}
            className="card stack"
            style={{ flex: "1 1 12rem" }}
            aria-labelledby={`visit-stage-${stage}`}
          >
            <h3 id={`visit-stage-${stage}`}>{stageLabel(stage)}</h3>
            {boardData.columns[stage].length === 0 ? (
              <p className="muted">No plans in this stage.</p>
            ) : (
              boardData.columns[stage].map((card) => {
                const neighbors = stageNeighbors(card.stage);
                const schoolVisits = visitOptions.filter(
                  (visit) => visit.schoolId === card.schoolId,
                );
                return (
                  <article key={card.planId} className="stack">
                    <h4>{card.schoolName}</h4>
                    {card.plannedFor === undefined ? null : (
                      <p className="muted">
                        Planned {new Date(card.plannedFor).toLocaleDateString()}
                      </p>
                    )}
                    {card.notes === undefined ? null : <p>{card.notes}</p>}
                    <div className="row">
                      <button
                        className="button"
                        type="button"
                        disabled={neighbors.previous === undefined}
                        onClick={() => void moveCard(card, "previous")}
                      >
                        Move left
                      </button>
                      <button
                        className="button"
                        type="button"
                        disabled={neighbors.next === undefined}
                        onClick={() => void moveCard(card, "next")}
                      >
                        Move right
                      </button>
                    </div>
                    <div className="row">
                      <button
                        className="button"
                        type="button"
                        onClick={() => {
                          setResolvingPlanId(card.planId);
                          setSelectedVisitId("");
                        }}
                      >
                        Mark visited
                      </button>
                      <button
                        className="button"
                        type="button"
                        onClick={() => void archiveCard(card)}
                      >
                        Archive
                      </button>
                    </div>
                    {resolvingPlanId === card.planId ? (
                      <div className="stack">
                        <label>
                          Visit
                          <select
                            value={selectedVisitId}
                            onChange={(event) => {
                              const visit = schoolVisits.find(
                                (item) => item._id === event.target.value,
                              );
                              setSelectedVisitId(visit?._id ?? "");
                            }}
                          >
                            <option value="">Choose a visit</option>
                            {schoolVisits.map((visit) => (
                              <option key={visit._id} value={visit._id}>
                                {new Date(visit.occurredAt).toLocaleDateString()}
                                {" · "}
                                {visit.donatedQuantity} donated
                              </option>
                            ))}
                          </select>
                        </label>
                        {schoolVisits.length === 0 ? (
                          <p className="muted">
                            No visits recorded for this school.
                          </p>
                        ) : null}
                        <button
                          className="button"
                          type="button"
                          onClick={() => void markVisited(card)}
                        >
                          Save visited
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </section>
        ))}
        <section
          className="card stack"
          style={{ flex: "1 1 12rem" }}
          aria-labelledby="visit-stage-visited"
        >
          <h3 id="visit-stage-visited">Visited</h3>
          {boardData.recentlyVisited.length === 0 ? (
            <p className="muted">No recent visits linked from plans.</p>
          ) : (
            boardData.recentlyVisited.map((card) => (
              <article key={card.planId} className="stack">
                <h4>
                  <Link href={`/visits/${card.visitId}`}>{card.schoolName}</Link>
                </h4>
                <p>{new Date(card.occurredAt).toLocaleDateString()}</p>
                <p className="muted">{card.donatedQuantity} copies donated</p>
                {card.followUp === undefined ? null : <p>{card.followUp}</p>}
              </article>
            ))
          )}
        </section>
      </div>
      <p className="muted" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
