// Small formatting helpers shared by features and components. Pure.
import type { Dept } from "@/features/demo/types";

// 1234 -> "1,234"
export const fmt = (n: number | string) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// "T. Vogel" -> "TV"; anonymous handles and "—" -> "?"
export const ini = (name: string | null | undefined) =>
  !name || name.startsWith("Anonymous") || name === "—" ? "?" : name.split(" ").map((w) => w[0]).join("").slice(0, 2);

export const days = (n: number) => n + (n === 1 ? " day" : " days");

export const deptName = (depts: readonly Dept[], id: string) => depts.find((d) => d.id === id)?.name ?? id;

// "1 team" / "3 teams"
export const plural = (n: number, one: string, many = one + "s") => n + " " + (n === 1 ? one : many);
