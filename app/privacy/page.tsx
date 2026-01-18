export default function PrivacyPage() {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">隐私协议</h1>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          以下为隐私协议的占位说明，后续可替换为正式条款。
        </p>
      </div>
      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-sm text-[color:var(--muted-foreground)]">
        <p>易记工将根据业务需要收集与使用必要的账户与记工数据，并采取合理的安全措施进行保护。</p>
        <div className="mt-3 space-y-2">
          <p>1. 收集范围：账号、租户、记工记录与操作日志。</p>
          <p>2. 使用目的：提供记工服务、统计分析与问题排查。</p>
          <p>3. 数据保护：采用访问控制与定期备份策略。</p>
          <p>4. 变更与删除：可通过管理员申请更正或删除信息。</p>
        </div>
      </div>
    </section>
  );
}
