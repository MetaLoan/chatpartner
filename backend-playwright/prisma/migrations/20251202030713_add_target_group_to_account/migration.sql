-- AlterTable
ALTER TABLE "ai_accounts" ADD COLUMN     "target_group_id" INTEGER;

-- AddForeignKey
ALTER TABLE "ai_accounts" ADD CONSTRAINT "ai_accounts_target_group_id_fkey" FOREIGN KEY ("target_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
