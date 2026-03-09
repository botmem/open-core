ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "firebase_uid" text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_firebase_uid_unique') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_firebase_uid_unique" UNIQUE("firebase_uid");
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_firebase_uid" ON "users" USING btree ("firebase_uid");
