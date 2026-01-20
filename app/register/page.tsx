"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ThemeToggle from "../components/ThemeToggle";
import { apiJson } from "../lib/api";
import { useNotice } from "../components/NoticeProvider";
import { AuthSession, saveAuthSession } from "../lib/auth";

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

export default function RegisterPage() {
  const router = useRouter();
  const { notify } = useNotice();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedAccount = account.trim();
    const trimmedPassword = password.trim();
    const trimmedTenantName = tenantName.trim();

    if (!trimmedAccount || !trimmedPassword) {
      notify("请填写账号和密码。", "warning");
      return;
    }
    if (trimmedAccount.includes("/") || trimmedAccount.includes("@")) {
      notify("账号不能包含 / 或 @。", "warning");
      return;
    }
    if (trimmedPassword.length < 6) {
      notify("密码长度需至少 6 位。", "warning");
      return;
    }
    if (!agreed) {
      notify("请先勾选隐私协议和免责声明。", "warning");
      return;
    }
    if (trimmedTenantName.length > 100) {
      notify("所在公司长度不能超过 100。", "warning");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        account: trimmedAccount,
        password: trimmedPassword,
      };
      if (trimmedTenantName) {
        body.tenant_name = trimmedTenantName;
      }
      const payload = await apiJson<AuthSession | { data?: AuthSession }>(
        "/api/auth/register",
        {
          method: "POST",
          body,
        },
      );
      const data = (payload as { data?: AuthSession }).data ?? payload;
      const token =
        (data as { token?: string }).token ??
        (data as { access_token?: string }).access_token ??
        (data as { jwt?: string }).jwt;

      if (!token) {
        notify("注册失败，请稍后再试。", "error");
        return;
      }

      saveAuthSession({
        token,
        user: (data as AuthSession).user ?? {
          account: trimmedAccount,
        },
        tenant: (data as AuthSession).tenant,
      });
      notify("注册成功。", "success");
      router.replace("/");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "注册失败，请稍后再试。";
      notify(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="relative flex min-h-[calc(100vh-120px)] flex-col gap-6 px-4 py-6 lg:flex-row lg:items-stretch lg:gap-10">
      <div className="absolute right-6 top-6 z-20 flex items-center gap-2">
        <ThemeToggle />
        <a
          href="https://github.com/ifzc/easy_record_working"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--border)] text-[color:var(--muted-foreground)] transition hover:text-foreground"
          aria-label="GitHub"
          title="GitHub"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
            <path d="M12 2C6.477 2 2 6.484 2 12.019c0 4.424 2.865 8.182 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.004.071 1.532 1.037 1.532 1.037.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.114-4.555-4.956 0-1.094.39-1.988 1.03-2.688-.103-.254-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.748-1.026 2.748-1.026.546 1.378.203 2.396.1 2.65.64.7 1.028 1.594 1.028 2.688 0 3.852-2.339 4.7-4.566 4.948.359.31.678.921.678 1.856 0 1.338-.012 2.418-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.019C22 6.484 17.523 2 12 2Z" />
          </svg>
        </a>
      </div>
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
        <div className="w-full max-w-md space-y-6">
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-sm">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">注册个人账号</h1>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              创建个人账号，免费使用易记工，开启便捷方便的记工填报新体验！
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
                placeholder="密码至少6位"
                className="h-10 rounded-md border border-[color:var(--border)] bg-transparent px-3 text-sm text-foreground"
              />
            </label>

            <label className="flex flex-col gap-2 text-xs text-[color:var(--muted-foreground)]">
              所在公司（选填）
              <input
                value={tenantName}
                onChange={(event) => setTenantName(event.target.value)}
                placeholder="请输入公司名称"
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
              {submitting ? "注册中..." : "注册"}
            </button>
          </form>

          <div className="mt-4 text-center text-xs text-[color:var(--muted-foreground)]">
            已有账号前往
            <Link
              href="/login"
              className="ml-1 text-foreground underline underline-offset-2"
            >
              登录
            </Link>
          </div>
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
