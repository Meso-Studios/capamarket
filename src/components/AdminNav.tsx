"use client";

import Link from "next/link";

export function AdminNav({ active }: { active: "markets" | "users" }) {
  return (
    <div className="subnav">
      <Link href="/admin" className={active === "markets" ? "on" : ""}>Markets &amp; reports</Link>
      <Link href="/admin/users" className={active === "users" ? "on" : ""}>Users</Link>
    </div>
  );
}
