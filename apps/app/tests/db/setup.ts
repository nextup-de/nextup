// Guard rail: these tests truncate tables. Refuse to run against anything that is not obviously a
// throwaway database, so a stray DATABASE_URL cannot wipe the demo.
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is not set. Run these through ops/test-db.sh, not `npm test`.");
}
if (!/_test(\b|$|\?)/.test(url)) {
  throw new Error(
    `Refusing to run: DATABASE_URL does not name a *_test database (got ${url.replace(/:[^:@/]*@/, ":***@")}).`,
  );
}
