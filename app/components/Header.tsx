"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { apiJson } from "../lib/api";
import { useNotice } from "./NoticeProvider";
import {
  AuthTenant,
  AuthUser,
  clearAuthSession,
  loadAuthToken,
  loadAuthTenant,
  loadAuthUser,
  saveAuthSession,
} from "../lib/auth";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isDisplayNameModalOpen, setIsDisplayNameModalOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const { notify } = useNotice();

  function isAuthUser(value: unknown): value is AuthUser {
    return (
      typeof value === "object" &&
      value !== null &&
      "account" in value &&
      typeof (value as { account?: unknown }).account === "string"
    );
  }

  useEffect(() => {
    const token = loadAuthToken();
    if (!token) {
      setUser(null);
      setTenant(null);
      setMenuOpen(false);
      return;
    }

    const cachedUser = loadAuthUser();
    if (cachedUser) {
      setUser(cachedUser);
    }
    const cachedTenant = loadAuthTenant();
    if (cachedTenant) {
      setTenant(cachedTenant);
    }

    apiJson("/api/auth/me")
      .then((payload) => {
        const data =
          (payload as { data?: { user?: AuthUser; tenant?: AuthTenant } })
            .data ?? payload;
        const nextUser = (data as { user?: AuthUser }).user ?? data;
        if (isAuthUser(nextUser)) {
          const nextTenant = (data as { tenant?: AuthTenant }).tenant ?? null;
          setUser(nextUser);
          setTenant(nextTenant);
          saveAuthSession({
            token,
            user: nextUser,
            tenant: nextTenant ?? undefined,
          });
        }
      })
      .catch(() => {
        clearAuthSession();
        setUser(null);
        router.replace("/login");
      })
      .finally(() => {
        setMenuOpen(false);
      });
  }, [pathname, router]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [menuOpen]);

  if (pathname === "/login" || pathname === "/register") {
    return null;
  }

  function handleLogout() {
    apiJson("/api/auth/logout", { method: "POST" }).catch(() => null);
    clearAuthSession();
    setUser(null);
    setTenant(null);
    setMenuOpen(false);
    notify("已退出登录。", "success");
    router.replace("/login");
  }

  function openPasswordModal() {
    setMenuOpen(false);
    setIsPasswordModalOpen(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  function openDisplayNameModal() {
    setMenuOpen(false);
    setIsDisplayNameModalOpen(true);
    setDisplayName(user?.display_name ?? "");
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !currentPassword.trim() ||
      !newPassword.trim() ||
      !confirmPassword.trim()
    ) {
      notify("请填写完整的密码信息。", "warning");
      return;
    }
    if (newPassword !== confirmPassword) {
      notify("两次输入的新密码不一致。", "warning");
      return;
    }

    try {
      await apiJson("/api/auth/change-password", {
        method: "POST",
        body: {
          current_password: currentPassword.trim(),
          new_password: newPassword.trim(),
        },
      });
      notify("密码修改成功。", "success");
      setIsPasswordModalOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "密码修改失败";
      notify(message, "error");
    }
  }

  async function handleDisplayNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      notify("用户信息不可用，请重新登录。", "warning");
      return;
    }
    const nextDisplayName = displayName.trim();
    if (nextDisplayName.length > 10) {
      notify("昵称不能超过 10 个字符。", "warning");
      return;
    }

    try {
      await apiJson("/api/auth/change-display-name", {
        method: "POST",
        body: {
          display_name: nextDisplayName,
        },
      });
      const nextUser = {
        ...user,
        display_name: nextDisplayName || undefined,
      };
      setUser(nextUser);
      const token = loadAuthToken();
      if (token) {
        saveAuthSession({
          token,
          user: nextUser,
          tenant: loadAuthTenant() ?? undefined,
        });
      }
      notify("昵称已更新。", "success");
      setIsDisplayNameModalOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "昵称修改失败";
      notify(message, "error");
    }
  }

  return (
    <>
      <header className="border-b border-[color:var(--border)] bg-[color:var(--surface)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-semibold text-foreground">
            易记工
          </Link>
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-6 text-sm font-medium text-[color:var(--muted-foreground)]">
              <Link className="transition hover:text-foreground" href="/">
                每日记工
              </Link>
              <Link className="transition hover:text-foreground" href="/employees">
                员工管理
              </Link>
              <Link className="transition hover:text-foreground" href="/projects">
                项目管理
              </Link>
              <Link className="transition hover:text-foreground" href="/reports">
                月度总览
              </Link>
            </nav>
            {user ? (
              <div className="flex items-center gap-2">
                <div ref={menuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((prev) => !prev)}
                    className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-medium text-foreground"
                  >
                    {user.display_name ?? user.account}
                  </button>
                  {menuOpen ? (
                    <div className="absolute right-0 mt-2 w-max min-w-[100px] rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-2 text-xs text-foreground shadow-sm">
                      <div className="px-2 py-1">
                        <div className="text-[color:var(--muted-foreground)]">
                          登录账号
                        </div>
                        <div className="mt-1 text-foreground">
                          {user.account}
                        </div>
                        {tenant?.name && tenant.name !== user.account ? (
                          <div className="mt-2">
                            <div className="text-[color:var(--muted-foreground)]">
                              所属公司
                            </div>
                            <div className="mt-1 text-foreground">
                              {tenant.name}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="my-1 h-px bg-[color:var(--border)]" />
                      <button
                        type="button"
                        onClick={openPasswordModal}
                        className="mt-1 w-full rounded-md px-2 py-1 text-left text-foreground hover:bg-[color:var(--surface-muted)]"
                      >
                        修改密码
                      </button>
                      <button
                        type="button"
                        onClick={openDisplayNameModal}
                        className="mt-1 w-full rounded-md px-2 py-1 text-left text-foreground hover:bg-[color:var(--surface-muted)]"
                      >
                        修改昵称
                      </button>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="mt-1 w-full rounded-md px-2 py-1 text-left text-foreground hover:bg-[color:var(--surface-muted)]"
                      >
                        退出登录
                      </button>
                    </div>
                  ) : null}
                </div>
                <ThemeToggle />
              </div>
            ) : null}
          </div>
        </div>
      </header>
      {isPasswordModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">修改密码</h2>
              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(false)}
                className="text-xs text-[color:var(--muted-foreground)]"
              >
                关闭
              </button>
            </div>
            <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-3">
              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                当前密码
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                新密码
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                确认新密码
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                />
              </label>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="h-9 rounded-md border border-[color:var(--border)] px-3 text-xs text-[color:var(--muted-foreground)]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-md bg-foreground px-3 text-xs font-medium text-background"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {isDisplayNameModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">修改昵称</h2>
              <button
                type="button"
                onClick={() => setIsDisplayNameModalOpen(false)}
                className="text-xs text-[color:var(--muted-foreground)]"
              >
                关闭
              </button>
            </div>
            <form onSubmit={handleDisplayNameSubmit} className="mt-4 space-y-3">
              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                昵称
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={10}
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                />
              </label>
              <div className="text-right text-[10px] text-[color:var(--muted-foreground)]">
                {displayName.trim().length}/10
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDisplayNameModalOpen(false)}
                  className="h-9 rounded-md border border-[color:var(--border)] px-3 text-xs text-[color:var(--muted-foreground)]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-md bg-foreground px-3 text-xs font-medium text-background"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
