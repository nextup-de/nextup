"use client";
// Titles for the case panels, from the seed: role first, people second (D4). Labels only, never compared.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { seatsOfRole } from "@/features/auth/identity";

export function useCaseNames() {
  const { seed, f } = useDemo();
  const roleTitle = (roleId: string | null): string => {
    if (roleId === null) return "";
    const owned = seed.routes.find((r) => r.ownerRoleId === roleId);
    if (owned) return owned.owner.role;
    const deputy = seed.routes.find((r) => r.deputyRoleId === roleId);
    return (deputy && seed.people.find((p) => p.name === deputy.deputy)?.role) || "";
  };
  const peopleOf = (roleId: string | null, seatId: string | null): string[] => {
    const seat = seatId ? seed.seats.find((s) => s.id === seatId) : undefined;
    if (seat) return [seat.label];
    return roleId ? seatsOfRole(seed.seats, roleId).map((s) => s.label) : [];
  };
  const roleOfRoute = (routeId: string | null): string => {
    const r = routeId ? seed.routes.find((x) => x.id === routeId) : undefined;
    return r ? r.owner.role : "";
  };
  return { roleTitle, peopleOf, roleOfRoute, date: f };
}
