// Which language a question is in, German or English, so the assistant answers in it. Pure.
//
// The prompt always said "answer in the language the employee writes in", and the model still answered
// 5 of 6 English questions in German on Musterwerk (AIT live run 2026-11-08): the roles, routing rows and
// documents it reads are German. Naming the language outright, per question, is what the model follows.
// Counting short function words is enough for a question of a few words; anything unclear is null and
// the prompt keeps its general rule.

export type QuestionLanguage = "de" | "en";

const DE = new Set(
  ("der die das den dem des ein eine einen einem einer und oder ist sind nicht ich wir sie wie was wer wann wo warum " +
    "welche welcher welches welchen mit für auf bei zu zum zur von vom im am bis über darf dürfen muss müssen kann " +
    "können soll sollte gibt es bitte habe hat mein meine unser unsere laut nach ohne noch auch nur").split(" "),
);
const EN = new Set(
  ("the a an and or is are not i we you they how what who when where why which with for on at to of in from by " +
    "until about may must can could should there please have has my our do does did this that without").split(" "),
);

export function questionLanguage(text: string): QuestionLanguage | null {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  let de = /[äöüß]/i.test(text) ? 1 : 0;
  let en = 0;
  for (const w of words) {
    if (DE.has(w)) de++;
    if (EN.has(w)) en++;
  }
  if (de === en) return null;
  return de > en ? "de" : "en";
}
