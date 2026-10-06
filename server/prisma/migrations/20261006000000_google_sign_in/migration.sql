-- Sign in with Google (CLAUDE.md section 4). A nullable column, and a unique
-- index over a column every existing row holds NULL in, so nothing the old API
-- writes while this applies can fail it.
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
