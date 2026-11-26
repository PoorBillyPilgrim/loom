import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { invites } from "@/db/schema";

// Invites are typed in by hand, so don't trust their case
export async function isInvited(db: Db, email: string): Promise<boolean> {
  const [row] = await db
    .select({ email: invites.email })
    .from(invites)
    .where(eq(sql`lower(${invites.email})`, email.toLowerCase()))
    .limit(1);
  return row !== undefined;
}
