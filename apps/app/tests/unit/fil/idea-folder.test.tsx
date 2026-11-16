// The Files page of an idea: the files raised with it, and its own SharePoint folder once the folder job made it.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IdeaFilesView } from "@/components/projects/files/IdeaFilesView";
import { I18nProvider } from "@/i18n/client";

const URL = "https://nextup.sharepoint.com/sites/ideas/Shared%20Documents/acme/Shorter%20changeover";
const render = (folder: string | null, items = [{ name: "sheet.xlsx", meta: "12 KB" }]) =>
  renderToStaticMarkup(h(I18nProvider, { locale: "en", children: h(IdeaFilesView, { items, folder }) }));

describe("IdeaFilesView", () => {
  it("says the folder comes with the yes while the idea has none", () => {
    const html = render(null);
    expect(html).toContain("Raised with the idea");
    expect(html).not.toContain("Open in SharePoint");
  });

  it("opens the idea's own folder once it has one", () => {
    const html = render(URL);
    expect(html).toContain("SharePoint folder");
    expect(html).toContain("This idea has its own SharePoint folder");
    expect(html).toContain(`href="${URL}"`);
    expect(html).toContain("Open in SharePoint");
  });

  it("offers the folder when nothing was raised with the idea", () => {
    const html = render(URL, []);
    expect(html).toContain('data-testid="idea-folder-open"');
  });
});
