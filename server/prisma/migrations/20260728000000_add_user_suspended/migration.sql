-- Admin account suspension. Defaulted so existing rows become active (false).
ALTER TABLE "User" ADD COLUMN "suspended" BOOLEAN NOT NULL DEFAULT false;
