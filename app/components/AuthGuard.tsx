"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { loadAuthToken } from "../lib/auth";

type AuthGuardProps = {
  children: React.ReactNode;
};

export default function AuthGuard({ children }: AuthGuardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const isPublic =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/privacy" ||
    pathname === "/disclaimer";

  useEffect(() => {
    if (isPublic) {
      setReady(true);
      return;
    }

    const token = loadAuthToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    setReady(true);
  }, [isPublic, pathname, router]);

  if (isPublic) {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <div className="py-12 text-center text-sm text-[color:var(--muted-foreground)]">
        正在跳转到登录页...
      </div>
    );
  }

  return <>{children}</>;
}
