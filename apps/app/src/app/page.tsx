// The app has no public pages: the marketing site is its own repo (nextup-landing, sellux.ch). The bare root goes to login.
import { redirect } from "next/navigation";

export default function Root() {
  redirect("/login");
}
