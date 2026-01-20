"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiJson } from "../lib/api";
import { useNotice } from "../components/NoticeProvider";
import { AuthSession, loadAuthSession, saveAuthSession } from "../lib/auth";

type ModalType = "privacy" | "disclaimer";

const modalContent: Record<ModalType, { title: string; items: string[] }> = {
  privacy: {
    title: "隐私协议",
    items: [
      "我们会收集账号、租户、记工等必要信息，用于提供服务与问题排查。",
      "数据仅用于平台内部使用，不会向无关第三方披露。",
      "你可通过管理员申请更正或删除账号相关信息。",
    ],
  },
  disclaimer: {
    title: "免责声明",
    items: [
      "平台提供的记工数据以用户输入为准，请确保填写准确。",
      "因网络、设备或第三方原因导致的数据异常不承担责任。",
      "平台保留对功能与条款进行更新的权利。",
    ],
  },
};

export default function LoginPage() {
  const router = useRouter();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { notify } = useNotice();

  useEffect(() => {
    const session = loadAuthSession();
    if (session) {
      router.replace("/");
    }
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedAccount = account.trim();
    if (!trimmedAccount || !password.trim()) {
      notify("请输入账号和密码。", "warning");
      return;
    }
    if (!agreed) {
      notify("请先勾选隐私协议和免责声明。", "warning");
      return;
    }
    setSubmitting(true);

    try {
      const payload = await apiJson<AuthSession | { data?: AuthSession }>(
        "/api/auth/login",
        {
          method: "POST",
          body: {
            account: trimmedAccount,
            password: password.trim(),
          },
        },
      );
      const data = (payload as { data?: AuthSession }).data ?? payload;
      const token =
        (data as { token?: string }).token ??
        (data as { access_token?: string }).access_token ??
        (data as { jwt?: string }).jwt;

      if (!token) {
        notify("登录失败，请检查账号或密码。", "error");
        return;
      }

      saveAuthSession({
        token,
        user: (data as AuthSession).user ?? {
          account: trimmedAccount,
        },
        tenant: (data as AuthSession).tenant,
      });
      notify("登录成功。", "success");
      router.replace("/");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "登录失败，请稍后再试。";
      notify(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex min-h-[calc(100vh-120px)] flex-col gap-6 px-4 py-6 lg:flex-row lg:items-stretch lg:gap-10">
      <div className="relative w-full overflow-hidden rounded-2xl lg:w-1/2">
        <div className="absolute left-6 top-6 z-10">
          <p className="text-lg font-semibold text-foreground">易记工</p>
          <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
            简单好用的记工平台
          </p>
        </div>
        <div
          className="min-h-[220px] w-full bg-center bg-no-repeat lg:min-h-full"
          style={{
            backgroundImage: "var(--auth-bg-image)",
            backgroundSize: "420px auto",
          }}
          aria-hidden="true"
        />
      </div>
      <div className="flex w-full items-center justify-center lg:w-1/2">
        <div className="w-full max-w-md rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-sm">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">登录</h1>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              输入账号与密码登录，系统将进入对应的加密数据空间。
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="flex flex-col gap-2 text-xs text-[color:var(--muted-foreground)]">
              账号
              <input
                value={account}
                onChange={(event) => setAccount(event.target.value)}
                placeholder="请输入账号"
                className="h-10 rounded-md border border-[color:var(--border)] bg-transparent px-3 text-sm text-foreground"
              />
            </label>

            <label className="flex flex-col gap-2 text-xs text-[color:var(--muted-foreground)]">
              密码
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
                className="h-10 rounded-md border border-[color:var(--border)] bg-transparent px-3 text-sm text-foreground"
              />
            </label>

            <label className="flex items-center gap-2 text-xs text-[color:var(--muted-foreground)]">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                className="h-4 w-4 rounded border border-[color:var(--border)]"
              />
              <span>
                我已阅读并同意
                <button
                  type="button"
                  onClick={() => setActiveModal("privacy")}
                  className="mx-1 text-foreground underline underline-offset-2"
                >
                  隐私协议
                </button>
                和
                <button
                  type="button"
                  onClick={() => setActiveModal("disclaimer")}
                  className="mx-1 text-foreground underline underline-offset-2"
                >
                  免责声明
                </button>
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="h-10 w-full rounded-md bg-foreground text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "登录中..." : "登录"}
            </button>
          </form>

          <div className="mt-4 text-center text-xs text-[color:var(--muted-foreground)]">
            没有账号：
            <Link
              href="/register"
              className="ml-1 text-foreground underline underline-offset-2"
            >
              前往注册
            </Link>
          </div>
        </div>
      </div>

      {activeModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {modalContent[activeModal].title}
              </h2>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-xs text-[color:var(--muted-foreground)]"
              >
                关闭
              </button>
            </div>
            <div className="mt-3 space-y-2 text-sm text-[color:var(--muted-foreground)]">
              {modalContent[activeModal].items.map((item, index) => (
                <p key={item}>
                  {index + 1}. {item}
                </p>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
