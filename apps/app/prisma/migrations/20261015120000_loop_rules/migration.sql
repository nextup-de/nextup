-- The company's rules after the routing: discussion rhythm, measure checks, reward rule
-- (docs/plans/2026-10-15_idea-to-project.md, src/features/loop/rules.ts). Generated with `prisma migrate diff`; add only.
-- AlterTable
ALTER TABLE "CompanyConfig" ADD COLUMN     "discussEveryDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "discussMaxRounds" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "fastLaneEur" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN     "measureDays" INTEGER[] DEFAULT ARRAY[30, 90]::INTEGER[],
ADD COLUMN     "measureTolerancePct" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "rewardAmountEur" INTEGER,
ADD COLUMN     "rewardCapEur" INTEGER,
ADD COLUMN     "rewardRule" TEXT NOT NULL DEFAULT 'thanks',
ADD COLUMN     "rewardSharePct" INTEGER;

