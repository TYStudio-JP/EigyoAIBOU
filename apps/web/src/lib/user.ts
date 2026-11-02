import "server-only";
import { cookies } from "next/headers";
import { listUsers, type Db, type User } from "@eigyo/core";

export const USER_COOKIE = "eigyo_user";

/** 現在のユーザー（Cookie で切替。未設定なら最初の在籍ユーザー）。会社導入時は SSO 等に差し替える前提。 */
export async function currentUser(d: Db): Promise<User | null> {
  const users = listUsers(d);
  if (!users.length) return null;
  const c = (await cookies()).get(USER_COOKIE)?.value;
  const id = c ? Number(c) : NaN;
  return users.find((u) => u.id === id) ?? users[0];
}
