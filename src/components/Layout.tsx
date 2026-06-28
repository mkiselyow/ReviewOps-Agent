"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

type HeaderUser = { displayName: string; roleTitle: string } | null;

export default function Layout({
  user,
  children,
}: {
  user: HeaderUser;
  children: ReactNode;
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            ReviewOps Agent <small>evidence-grounded reviews</small>
          </div>
          <nav className="nav">
            {user ? (
              <>
                <Link href="/manager">Dashboard</Link>
                <Link href="/manager/outbox">Outbox</Link>
                <Link href="/audit">Audit</Link>
                <span className="who">
                  {user.displayName} · {user.roleTitle}
                </span>
                <button className="btn-ghost" onClick={logout}>
                  Log out
                </button>
              </>
            ) : (
              <Link href="/login">Log in</Link>
            )}
          </nav>
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
