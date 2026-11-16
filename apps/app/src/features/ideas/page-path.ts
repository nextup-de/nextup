// The address of an idea's (or a problem's) one page, relative to the company (Kevin, 16 Nov 2026). /cases/<id> still
// works and moves on here, for links in mails, Teams and stored notices.
export const ideaPath = (id: string): string => "/idea?id=" + encodeURIComponent(id);
