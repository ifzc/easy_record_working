export default function DisclaimerPage() {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">免责声明</h1>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          以下为免责声明的占位说明，后续可替换为正式条款。
        </p>
      </div>
      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-sm text-[color:var(--muted-foreground)]">
        <p>易记工对因用户操作、数据填写或第三方因素导致的业务损失不承担责任。</p>
        <div className="mt-3 space-y-2">
          <p>1. 数据准确性需由使用者自行核验。</p>
          <p>2. 因网络或设备故障导致的数据异常不承担责任。</p>
          <p>3. 平台功能更新以公告为准，最终解释权归平台所有。</p>
        </div>
      </div>
    </section>
  );
}
