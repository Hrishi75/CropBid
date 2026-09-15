-- One enquiry per account per product. A repeat hands back the lead already on
-- file (agriInput.service.ts createEnquiry) instead of inserting another, so one
-- account cannot fill the table with copies of the same lead.
-- CreateIndex
CREATE UNIQUE INDEX "AgriInputEnquiry_userId_agriInputId_key" ON "AgriInputEnquiry"("userId", "agriInputId");
