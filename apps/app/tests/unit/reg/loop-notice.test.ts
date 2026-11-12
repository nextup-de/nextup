// REG-C2: the loop mail builders split into one file per area change no mail (REG/D5).
import { describe, expect, it } from "vitest";
import { loopMails } from "@/features/loop/notice";
import { BASE_URL, EVENTS, PEOPLE, STATE } from "./loop-notice-fixture";

describe("REG loop notice split", () => {
  it("loopMails on the fixed events is what it was before the split, in German and English", async () => {
    const out = EVENTS.map(({ name, ev }) => {
      const args = { ev, state: STATE, people: PEOPLE, baseUrl: BASE_URL };
      return { name, de: loopMails(args, "de"), en: loopMails(args, "en") };
    });
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot("./snapshot/loop-notice-golden.json");
  });
});
