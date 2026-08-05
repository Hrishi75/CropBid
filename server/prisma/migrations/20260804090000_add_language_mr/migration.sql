-- Marathi. EN and HI shipped in the initial migration, but the web and mobile
-- language switchers have offered मराठी since i18n landed, so User.language
-- could not represent what a Marathi user had actually selected.
--
-- ⚠️ THIS MIGRATION MUST CONTAIN NOTHING ELSE.
-- Postgres forbids using a value added by ALTER TYPE ... ADD VALUE later in
-- the same transaction, and Prisma wraps each migration file in one. Any
-- statement here that reads or writes 'MR' would fail at deploy time.
ALTER TYPE "Language" ADD VALUE 'MR';
