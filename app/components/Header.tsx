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
  loadAuthUser,
  saveAuthSession,
} from "../lib/auth";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
      setMenuOpen(false);
      return;
    }

    const cachedUser = loadAuthUser();
    if (cachedUser) {
      setUser(cachedUser);
    }

    apiJson("/api/auth/me")
      .then((payload) => {
        const data =
          (payload as { data?: { user?: AuthUser; tenant?: AuthTenant } })
            .data ?? payload;
        const nextUser = (data as { user?: AuthUser }).user ?? data;
        if (isAuthUser(nextUser)) {
          setUser(nextUser);
          saveAuthSession({
            token,
            user: nextUser,
            tenant: (data as { tenant?: AuthTenant }).tenant,
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

  if (pathname === "/login") {
    return null;
  }

  function handleLogout() {
    apiJson("/api/auth/logout", { method: "POST" }).catch(() => null);
    clearAuthSession();
    setUser(null);
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
                工时总览
              </Link>
              <Link className="transition hover:text-foreground" href="/employees">
                员工管理
              </Link>
              <span className="cursor-not-allowed select-none opacity-60">
                工时报表
              </span>
              <span className="cursor-not-allowed select-none opacity-60">
                工程管理
              </span>
              <span className="cursor-not-allowed select-none opacity-60">
                工程预算
              </span>
            </nav>
            {user ? (
              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-medium text-foreground"
                >
                {user.display_name ?? user.account}
                </button>
                {menuOpen ? (
                  <div className="absolute right-0 mt-2 w-48 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-2 text-xs text-foreground shadow-sm">
                    <div className="flex items-center justify-between gap-2 px-2 py-1">
                      <span className="text-[color:var(--muted-foreground)]">
                        免费用户
                      </span>
                      <button
                        type="button"
                        onClick={() => notify("升级功能即将开放。", "info")}
                        className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs text-foreground hover:bg-[color:var(--surface-muted)]"
                      >
                        升级高级版
                      </button>
                    </div>
                    <div className="px-2 py-1">
                      <ThemeToggle
                        label="主题模式"
                        className="flex items-center justify-between gap-2"
                        labelClassName="whitespace-nowrap text-[color:var(--muted-foreground)]"
                        selectClassName="w-24 rounded-md px-2 py-1 text-xs text-foreground"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={openPasswordModal}
                      className="mt-1 w-full rounded-md px-2 py-1 text-left text-foreground hover:bg-[color:var(--surface-muted)]"
                    >
                      修改密码
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
    </>
  );
}
