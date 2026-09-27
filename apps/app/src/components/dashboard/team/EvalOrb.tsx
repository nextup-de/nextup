"use client";
// The evaluating orb, drawn with thinking-orbs' engine on our own canvas. The <ThinkingOrb> component only
// renders its three tuned sizes (20 / 32 / 64), so anything larger is an upscaled canvas and goes soft;
// here the 64 preset's geometry is laid out at the real size and painted at the device's pixel ratio.
// The ink ramp is flattened so the constellation reads jet black rather than fading to grey at the back.
import { useEffect, useRef } from "react";
import { MODE_FRAMES, paintFrame, resolvePreset, STATE_TO_MODE, type OrbFrame, type OrbState } from "thinking-orbs/engine";

const DEPTH = 0.3; // 0 = flat black; 1 = the library's full near-to-far ramp

export function EvalOrb({ state, size, paused }: { state: OrbState; size: number; paused: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);
    const { mode, speed, opts } = resolvePreset(state, 64);
    const geometry = MODE_FRAMES[mode], drawOpts = { ...opts, spread: 1.15 }; // fill the box, as on the page before
    const inked = (f: OrbFrame): OrbFrame => ({ dots: f.dots.map((d) => ({ ...d, white: d.white * DEPTH })), lines: f.lines.map((l) => ({ ...l, white: l.white * DEPTH })) });
    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
      paintFrame(ctx, inked(geometry(size, t, drawOpts)), false);
    };
    draw(paused ? 0.6 : (performance.now() / 1000) * speed);
    if (paused) return;
    let raf = 0;
    const loop = () => { draw((performance.now() / 1000) * speed); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state, size, paused]);

  return <canvas ref={ref} role="img" aria-label={STATE_TO_MODE[state] === "web" ? "Connecting the dots" : "Thinking"} style={{ width: size, height: size, display: "block" }} />;
}
