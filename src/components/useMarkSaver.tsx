"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MarkChange, SaveMarksResult } from "@/app/merchant/employees/actions";

type Result = { ok: boolean; message: string };
export type SaveMarks = (changes: MarkChange[]) => Promise<SaveMarksResult>;
export type SaverState = "idle" | "waiting" | "saving" | "error";

// Taps are collected and sent together once the user pauses (IDLE_MS) or after
// MAX_WAIT_MS of continuous tapping, so one round of marking is one request and
// one edit-log entry. Anything waiting is sent at once when the page is hidden,
// closed or left.
const IDLE_MS = 2500;
const MAX_WAIT_MS = 15000;

type Pending = { change: MarkChange; resolvers: ((r: Result) => void)[] };

export function useMarkSaver(save: SaveMarks) {
  const queue = useRef(new Map<string, Pending>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstQueuedAt = useRef<number | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve()); // one request at a time, in order
  const inFlight = useRef(0);
  const [state, setState] = useState<SaverState>("idle");

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    firstQueuedAt.current = null;
    const batch = [...queue.current.values()];
    queue.current.clear();
    if (batch.length === 0) return chain.current;
    inFlight.current++;
    setState("saving");
    chain.current = chain.current.then(async () => {
      let res: SaveMarksResult;
      try {
        res = await save(batch.map((p) => p.change));
      } catch {
        const message = "Couldn't save. Check your internet connection and try again.";
        res = { ok: false, message, failed: batch.map((p) => ({ ...p.change, message })) };
      }
      inFlight.current--;
      for (const p of batch) {
        const f = res.failed.find((x) => x.employeeId === p.change.employeeId && x.date === p.change.date);
        const outcome = f ? { ok: false, message: f.message } : { ok: true, message: "Saved" };
        // Newest tap first, so each one's undo restores the state before it.
        for (const resolve of [...p.resolvers].reverse()) resolve(outcome);
      }
      setState(queue.current.size > 0 ? "waiting" : inFlight.current > 0 ? "saving" : res.ok ? "idle" : "error");
    });
    return chain.current;
  }, [save]);

  /** Queues one change; resolves once it has been saved (or refused). */
  const mark = useCallback((employeeId: string, date: string, status: string | null) => {
    return new Promise<Result>((resolve) => {
      const key = `${employeeId}|${date}`;
      const existing = queue.current.get(key);
      queue.current.set(key, { change: { employeeId, date, status }, resolvers: [...(existing?.resolvers ?? []), resolve] });
      setState("waiting");
      const now = Date.now();
      firstQueuedAt.current ??= now;
      if (timer.current) clearTimeout(timer.current);
      if (now - firstQueuedAt.current >= MAX_WAIT_MS) void flush();
      else timer.current = setTimeout(() => void flush(), IDLE_MS);
    });
  }, [flush]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") void flush(); };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (queue.current.size === 0 && inFlight.current === 0) return;
      void flush();
      e.preventDefault(); // asks "Leave site?" so the last marks aren't lost
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      void flush(); // leaving the screen inside the app
    };
  }, [flush]);

  return { mark, flush, state };
}

export function SaveStatus({ state }: { state: SaverState }) {
  const text = { idle: "✓ All changes saved", waiting: "Saving shortly…", saving: "Saving…", error: "Some changes were not saved" }[state];
  const tone = state === "error" ? "text-red-600" : state === "idle" ? "text-green-700" : "text-gray-500";
  return <span className={`text-xs ${tone}`} role="status" aria-live="polite">{text}</span>;
}
