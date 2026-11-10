-- Tokens of models without a price, per month (decision Q7.5). NULL = the default of features/ai/budget.ts.
ALTER TABLE "CompanyConfig" ADD COLUMN "aiMonthlyTokenCap" INTEGER;
