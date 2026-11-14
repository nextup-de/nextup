import { expect, it } from "vitest";
import { projectHub } from "@/i18n/messages/projectHub";

const groups = {
  overview: [
    "Title", "AriaLabel", "StepsDone", "Waiting", "Late", "NextDue", "WhereStepsAre",
    "WhoHasWhat", "Empty", "BaselineHint", "BaselineRequired", "RangeLabel",
    "Range7Days", "Range14Days", "Range30Days", "RangeSinceStart", "RangePickDates",
    "RangeFrom", "RangeTo", "RangeApply", "RangeInvalid", "Share", "ShareTitle",
    "CopyLink", "LinkCopied", "CopyFailed", "ShareAccessHint", "StepsDonePerWeek",
    "WeeklyEmpty", "WeeklyChartAriaLabel", "WhereWaitingGoes", "WaitingTeamOnly",
    "WaitingEmpty", "WaitingChartAriaLabel",
  ],
  results: [
    "Title", "AriaLabel", "Open", "Empty", "Baseline", "Target", "Actual",
    "MeasureChecks", "CheckAfterDays", "CheckEmpty", "Verdict", "VerdictBetter",
    "VerdictSame", "VerdictWorse", "VerdictPending", "Confirmation",
    "AwaitingConfirmation", "ConfirmedBy", "Questioned", "EnterMeasure", "Confirm",
    "Question", "Reenter", "Reward", "RewardClaim", "RewardEmpty", "ColumnTime",
    "MedianDays", "ColumnTimeEmpty", "ColumnChartAriaLabel",
  ],
  files: [
    "Title", "AriaLabel", "Search", "FilterAll", "FilterMine", "FilterLinked",
    "FilterEditedToday", "Docs", "Attachments", "ConnectedTools", "Origin",
    "NewDoc", "Empty", "NoMatches", "AttachmentsEmpty", "ToolsEmpty", "OpenFile",
  ],
  doc: [
    "Title", "Body", "Back", "LinkStep", "Publish", "Published", "Saving",
    "Saved", "SavedJustNow", "SaveFailed", "Retry", "Empty", "InsertHint",
    "TextStyle", "Bold", "Italic", "BulletList", "NumberedList", "Checklist", "Table",
  ],
  checklist: ["Title", "AriaLabel", "Empty", "AddItem", "MarkDone", "MarkOpen", "RemoveItem", "Progress", "Saved"],
  table: ["Title", "AriaLabel", "Empty", "AddRow", "AddColumn", "CellLabel", "RemoveRow", "RemoveColumn", "Saved"],
  links: ["Title", "AriaLabel", "Add", "Address", "Name", "NameHint", "Cancel", "Save", "Saved", "Empty", "InvalidAddress", "Open"],
  team: ["Title", "AriaLabel", "Lead", "Sponsor", "Members", "NoLead", "Empty", "Search", "OpenSteps"],
  activity: ["Title", "AriaLabel", "Empty", "RangeEmpty", "LoadMore", "Filter", "StepAdded", "StepMoved", "StepDone", "ResultConfirmed"],
};

it("HUB strings: German and English cover every page and content tool", () => {
  for (const catalog of [projectHub.en, projectHub.de]) {
    for (const [prefix, suffixes] of Object.entries(groups)) {
      for (const suffix of suffixes) {
        expect(catalog, `${prefix}${suffix}`).toHaveProperty(`${prefix}${suffix}`);
      }
    }
  }
});

it("HUB strings: locales have identical keys and nonempty messages in the named groups", () => {
  expect(Object.keys(projectHub.de).sort()).toEqual(Object.keys(projectHub.en).sort());
  for (const catalog of [projectHub.en, projectHub.de]) {
    for (const [key, value] of Object.entries(catalog)) {
      expect(Object.keys(groups).some((prefix) => key.startsWith(prefix)), key).toBe(true);
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  }
});

it("HUB strings: interpolations and plural pairs agree across languages", () => {
  const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const key of Object.keys(projectHub.en) as (keyof typeof projectHub.en)[]) {
    expect(placeholders(projectHub.de[key]), key).toEqual(placeholders(projectHub.en[key]));
  }
  expect(placeholders(projectHub.en.checklistProgress)).toEqual(["done", "total"]);
  expect(placeholders(projectHub.en.resultsConfirmedBy)).toEqual(["date", "name"]);
  expect(placeholders(projectHub.en.activityStepMoved)).toEqual(["from", "name", "step", "to"]);
  for (const catalog of [projectHub.en, projectHub.de]) {
    expect(placeholders(catalog.teamSteps_one)).toEqual(["count"]);
    expect(placeholders(catalog.teamSteps_other)).toEqual(["count"]);
  }
});

it("HUB strings: approved Paper wording describes NextUp results, source files and copying a link", () => {
  expect(projectHub.en.overviewStepsDonePerWeek).toBe("Steps done per week");
  expect(projectHub.en.overviewWhereWaitingGoes).toBe("Where the waiting goes");
  expect(projectHub.en.resultsColumnTime).toBe("How long a step sits in each column");
  expect(projectHub.en.overviewCopyLink).toBe("Copy link");
  expect(projectHub.en.filesOrigin).toBe("Where it came from");
  expect(projectHub.en.filesAttachments).toBe("Files from source ideas");
  for (const catalog of [projectHub.en, projectHub.de]) {
    expect(catalog).not.toHaveProperty("resultsAdd");
    expect(catalog).not.toHaveProperty("filesUpload");
    expect(catalog).not.toHaveProperty("overviewShareSend");
    expect(Object.values(catalog).join(" ")).not.toMatch(/Jira goals|Jira-Ziele/);
  }
});
