import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** GitHub user id (JWT subject). */
      id: string;
    } & DefaultSession["user"];
  }
}
