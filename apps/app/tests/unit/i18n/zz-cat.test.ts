import { it } from "vitest";
import { catalogIssues } from "./inline";
it("c", () => { console.log("ISSUES", JSON.stringify([...catalogIssues("auth"), ...catalogIssues("demo")])); });
