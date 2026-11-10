-- The company's monthly AI budget in euros (decision Q7.3). NULL = the default of features/ai/budget.ts.
ALTER TABLE "CompanyConfig" ADD COLUMN "aiMonthlyCapEur" INTEGER;
