// A change an editor saves can finish a setup step, so the setup pages read it again. Not a "use
// server" module: a helper the settings actions call. The route pattern, because the address differs
// by tenant mode (a rewrite takes the destination path) and every company's setup may refresh.
import { revalidatePath } from "next/cache";

export function revalidateSetup(): void {
  revalidatePath("/[company]/setup", "layout");
}
