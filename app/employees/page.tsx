"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiBlob, apiJson, API_BASE } from "../lib/api";
import { useNotice } from "../components/NoticeProvider";
import { loadAuthToken } from "../lib/auth";

type EmployeeType = "正式工" | "临时工";

type Employee = {
  id: string;
  name: string;
  type: EmployeeType;
  workType?: string;
  phone?: string;
  idCardNumber?: string;
  remark?: string;
  tags?: string[];
  createdAt?: string;
};

type FormState = {
  name: string;
  type: EmployeeType;
  workType: string;
  phone: string;
  idCardNumber: string;
  remark: string;
  tags: string[];
};

const employeeTypes: EmployeeType[] = ["正式工", "临时工"];
const DEFAULT_EMPLOYEE_PAGE_SIZE = 15;

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") {
      return;
    }
    search.append(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

function extractList<T>(payload: unknown): T[] {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  const data = (payload as { data?: unknown }).data ?? payload;
  if (Array.isArray(data)) {
    return data as T[];
  }
  if (data && typeof data === "object") {
    const items = (data as { items?: T[] }).items;
    if (Array.isArray(items)) {
      return items;
    }
    const list = (data as { list?: T[] }).list;
    if (Array.isArray(list)) {
      return list;
    }
  }
  return [];
}

function extractPagedMeta(payload: unknown) {
  const data = (payload as { data?: unknown }).data ?? payload;
  if (data && typeof data === "object") {
    const total = Number((data as { total?: number }).total ?? 0);
    const page = Number((data as { page?: number }).page ?? 1);
    const pageSize = Number(
      (data as { page_size?: number; pageSize?: number }).page_size ??
        (data as { page_size?: number; pageSize?: number }).pageSize ??
        DEFAULT_EMPLOYEE_PAGE_SIZE,
    );
    return { total, page, pageSize };
  }
  return { total: 0, page: 1, pageSize: DEFAULT_EMPLOYEE_PAGE_SIZE };
}

function normalizeTags(raw: unknown): string[] {
  if (!raw) {
    return [];
  }
  if (Array.isArray(raw)) {
    const tags = raw
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    return Array.from(new Set(tags));
  }
  if (typeof raw === "string") {
    const tags = raw
      .split(/[|,]/)
      .map((item) => item.trim())
      .filter(Boolean);
    return Array.from(new Set(tags));
  }
  return [];
}

function normalizeEmployee(item: Record<string, unknown>): Employee {
  const createdAt = item.created_at ?? item.createdAt ?? "";
  const remark = item.remark ?? item.notes ?? "";
  const tags = normalizeTags(item.tags ?? item.tag ?? item.labels ?? item.label);
  const workType = item.work_type ?? item.workType ?? "";
  const phone = item.phone ?? item.phone_number ?? item.mobile ?? "";
  const idCardNumber = item.id_card_number ?? item.idCardNumber ?? item.id_card ?? "";
  return {
    id: String(item.id ?? ""),
    name: String(item.name ?? item.employee_name ?? ""),
    type:
      (item.type as EmployeeType) ??
      (item.employee_type as EmployeeType) ??
      "正式工",
    workType: workType ? String(workType) : "",
    phone: phone ? String(phone) : "",
    idCardNumber: idCardNumber ? String(idCardNumber) : "",
    remark: String(remark ?? ""),
    tags,
    createdAt: createdAt ? String(createdAt) : "",
  };
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (num: number) => num.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterWorkType, setFilterWorkType] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_EMPLOYEE_PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>({
    name: "",
    type: "正式工",
    workType: "",
    phone: "",
    idCardNumber: "",
    remark: "",
    tags: [],
  });
  const [tagInput, setTagInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { notify, confirm } = useNotice();
  const displayEmployees = employees;
  const filtersKey = useMemo(
    () =>
      `${searchText.trim()}|${filterType}|${filterTag}|${filterWorkType}|${pageSize}`,
    [searchText, filterType, filterTag, filterWorkType, pageSize],
  );
  const filtersRef = useRef(filtersKey);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((employee) => {
      employee.tags?.forEach((tag) => set.add(tag));
    });
    if (filterTag) {
      set.add(filterTag);
    }
    return Array.from(set);
  }, [employees, filterTag]);
  const workTypeOptions = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((employee) => {
      if (employee.workType) {
        set.add(employee.workType);
      }
    });
    if (filterWorkType) {
      set.add(filterWorkType);
    }
    return Array.from(set);
  }, [employees, filterWorkType]);

  async function loadEmployees(overrides?: {
    keyword?: string;
    type?: string;
    tag?: string;
    workType?: string;
    page?: number;
  }) {
    try {
      setIsLoading(true);
      const keyword = overrides?.keyword ?? searchText;
      const type = overrides?.type ?? filterType;
      const tag = overrides?.tag ?? filterTag;
      const workType = overrides?.workType ?? filterWorkType;
      const page = overrides?.page ?? currentPage;
      const query = buildQuery({
        keyword: keyword.trim(),
        type: type || undefined,
        tag: tag.trim() || undefined,
        work_type: workType.trim() || undefined,
        page,
        page_size: pageSize,
        sort: "name_asc",
      });
      const payload = await apiJson(`/api/employees${query}`);
      const meta = extractPagedMeta(payload);
      const list = extractList<Record<string, unknown>>(payload).map(
        normalizeEmployee,
      );
      setEmployees(list);
      setTotal(meta.total);
      const nextTotalPages = Math.max(1, Math.ceil(meta.total / pageSize));
      if (meta.total > 0 && currentPage > nextTotalPages) {
        setCurrentPage(nextTotalPages);
      }
    } catch (error) {
      console.error(error);
      setEmployees([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (filtersRef.current !== filtersKey) {
      filtersRef.current = filtersKey;
      if (currentPage !== 1) {
        setCurrentPage(1);
        return;
      }
    }
    const timer = window.setTimeout(() => {
      loadEmployees();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [filtersKey, currentPage]);

  function openCreateModal() {
    setEditingEmployeeId(null);
    setFormState({
      name: "",
      type: "正式工",
      workType: "",
      phone: "",
      idCardNumber: "",
      remark: "",
      tags: [],
    });
    setTagInput("");
    setIsModalOpen(true);
  }

  function openEditModal(employee: Employee) {
    setEditingEmployeeId(employee.id);
    setFormState({
      name: employee.name,
      type: employee.type,
      workType: employee.workType ?? "",
      phone: employee.phone ?? "",
      idCardNumber: employee.idCardNumber ?? "",
      remark: employee.remark ?? "",
      tags: employee.tags ?? [],
    });
    setTagInput("");
    setIsModalOpen(true);
  }

  function addTag(value: string) {
    const next = value.trim();
    if (!next) {
      return;
    }
    setFormState((prev) => {
      if (prev.tags.includes(next)) {
        return prev;
      }
      return {
        ...prev,
        tags: [...prev.tags, next],
      };
    });
    setTagInput("");
  }

  function removeTag(tag: string) {
    setFormState((prev) => ({
      ...prev,
      tags: prev.tags.filter((item) => item !== tag),
    }));
  }

  async function handleDelete(employeeId: string) {
    const confirmed = await confirm("确认删除该员工吗？");
    if (!confirmed) {
      return;
    }
    try {
      await apiJson(`/api/employees/${employeeId}`, { method: "DELETE" });
      await loadEmployees();
      notify("员工已删除。", "success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "删除失败，请稍后再试。";
      notify(message, "error");
    }
  }

  async function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = formState.name.trim();
    const workType = formState.workType.trim();
    const phone = formState.phone.trim();
    const idCardNumber = formState.idCardNumber.trim();
    if (!name) {
      notify("请输入员工姓名。", "warning");
      return;
    }

    const pendingTag = tagInput.trim();
    const tagsToSave = pendingTag
      ? Array.from(new Set([...formState.tags, pendingTag]))
      : formState.tags;
    if (pendingTag) {
      setFormState((prev) => ({ ...prev, tags: tagsToSave }));
      setTagInput("");
    }

    try {
      if (editingEmployeeId) {
        await apiJson(`/api/employees/${editingEmployeeId}`, {
          method: "PUT",
          body: {
            name,
            type: formState.type,
            work_type: workType,
            phone: phone || null,
            id_card_number: idCardNumber || null,
            remark: formState.remark.trim(),
            tags: tagsToSave,
          },
        });
        notify("员工已更新。", "success");
      } else {
        await apiJson("/api/employees", {
          method: "POST",
          body: {
            name,
            type: formState.type,
            work_type: workType,
            phone: phone || null,
            id_card_number: idCardNumber || null,
            remark: formState.remark.trim(),
            tags: tagsToSave,
          },
        });
        notify("员工已新增。", "success");
      }
      setIsModalOpen(false);
      await loadEmployees();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "保存失败，请稍后再试。";
      notify(message, "error");
    }
  }

  async function handleImportChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const isCsv =
      file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
    if (!isCsv) {
      notify("暂仅支持 CSV 导入，请先在 Excel 中另存为 CSV。", "warning");
      event.target.value = "";
      return;
    }

    try {
      const token = loadAuthToken();
      const formData = new FormData();
      formData.append("File", file);
      const response = await fetch(`${API_BASE}/api/employees/import`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`导入失败(${response.status})`);
      }
      await loadEmployees();
      notify("员工导入成功。", "success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "导入失败，请稍后再试。";
      notify(message, "error");
    } finally {
      event.target.value = "";
    }
  }

  async function handleExport() {
    try {
      const query = buildQuery({ format: "csv" });
      const blob = await apiBlob(`/api/employees/export${query}`);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const date = new Date();
      const fileName = `员工管理_${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}.csv`;

      link.href = url;
      link.download = fileName;
      link.click();
      window.URL.revokeObjectURL(url);
      notify("员工导出成功。", "success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "导出失败，请稍后再试。";
      notify(message, "error");
    }
  }

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">员工管理</h1>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          维护员工基础信息，支持 Excel 导入与批量导出。
        </p>
      </div>

      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索员工"
              className="h-8 w-36 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-xs text-foreground"
            />
            <select
              value={filterType}
              onChange={(event) => setFilterType(event.target.value)}
              className="h-8 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-xs text-foreground"
            >
              <option value="">全部类型</option>
              {employeeTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <select
              value={filterWorkType}
              onChange={(event) => setFilterWorkType(event.target.value)}
              className="h-8 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-xs text-foreground"
            >
              <option value="">全部工种</option>
              {workTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <select
              value={filterTag}
              onChange={(event) => setFilterTag(event.target.value)}
              className="h-8 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-xs text-foreground"
            >
              <option value="">全部标签</option>
              {tagOptions.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleImportChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 rounded-md border border-[color:var(--border)] px-3 text-xs text-[color:var(--muted-foreground)] hover:text-foreground"
            >
              Excel导入
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="h-8 rounded-md border border-[color:var(--border)] px-3 text-xs text-[color:var(--muted-foreground)] hover:text-foreground"
            >
              批量导出
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background"
            >
              新增员工
            </button>
          </div>
        </div>

        <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
          导入字段：员工姓名、员工类型（正式工/临时工）、工种、手机号、身份证号。支持 Excel 导出为 CSV 后导入。
        </p>

        <div className="mt-4 flex min-h-[360px] flex-col">
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[color:var(--muted-foreground)]">
                <tr>
                  <th className="pb-2 font-medium">员工姓名</th>
                  <th className="pb-2 font-medium">员工类型</th>
                  <th className="pb-2 font-medium">工种</th>
                  <th className="pb-2 font-medium">手机号</th>
                  <th className="pb-2 font-medium">身份证号</th>
                  <th className="pb-2 font-medium">标签</th>
                  <th className="pb-2 font-medium">备注</th>
                  <th className="pb-2 font-medium">创建时间</th>
                  <th className="pb-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="py-6 text-center text-[color:var(--muted-foreground)]"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-foreground" />
                        <span>加载中</span>
                      </div>
                    </td>
                  </tr>
                ) : displayEmployees.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="py-6 text-center text-[color:var(--muted-foreground)]"
                    >
                      暂无员工
                    </td>
                  </tr>
                ) : (
                  displayEmployees.map((employee) => (
                    <tr
                      key={employee.id}
                      className="border-t border-[color:var(--border)]"
                    >
                      <td className="py-3 text-foreground">{employee.name}</td>
                      <td className="py-3 text-[color:var(--muted-foreground)]">
                        {employee.type}
                      </td>
                      <td className="py-3 text-[color:var(--muted-foreground)]">
                        {employee.workType || "-"}
                      </td>
                      <td className="py-3 text-[color:var(--muted-foreground)]">
                        {employee.phone || "-"}
                      </td>
                      <td className="py-3 text-[color:var(--muted-foreground)]">
                        {employee.idCardNumber || "-"}
                      </td>
                      <td className="py-3 text-[color:var(--muted-foreground)]">
                        {employee.tags && employee.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {employee.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[10px] text-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-3 text-[color:var(--muted-foreground)]">
                        {employee.remark || "-"}
                      </td>
                      <td className="py-3 text-[color:var(--muted-foreground)]">
                        {formatDateTime(employee.createdAt)}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(employee)}
                            className="text-xs text-foreground hover:underline"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(employee.id)}
                            className="text-xs text-[color:var(--muted-foreground)] hover:text-foreground"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3 text-xs text-[color:var(--muted-foreground)]">
          <span>共 {total} 条</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              每页
              <select
                value={pageSize}
                onChange={(event) => {
                  const nextSize = Number(event.target.value);
                  setPageSize(nextSize);
                  setCurrentPage(1);
                }}
                className="h-7 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-xs text-foreground"
              >
                {[10, 15, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1 || isLoading}
              className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs text-foreground disabled:opacity-50"
            >
                上一页
              </button>
              <span>
                {total === 0 ? 0 : currentPage} / {total === 0 ? 0 : totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={currentPage >= totalPages || isLoading}
                className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs text-foreground disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">
                {editingEmployeeId ? "编辑员工" : "新增员工"}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-xs text-[color:var(--muted-foreground)]"
              >
                关闭
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-3">
              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                员工姓名
                <input
                  value={formState.name}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                员工类型
                <select
                  value={formState.type}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      type: event.target.value as EmployeeType,
                    }))
                  }
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                >
                  {employeeTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                工种
                <input
                  value={formState.workType}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      workType: event.target.value,
                    }))
                  }
                  placeholder="例如：钢筋、木工、安装"
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                手机号
                <input
                  value={formState.phone}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      phone: event.target.value,
                    }))
                  }
                  placeholder="选填"
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                身份证号
                <input
                  value={formState.idCardNumber}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      idCardNumber: event.target.value,
                    }))
                  }
                  placeholder="选填"
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                标签
                <div className="flex gap-2">
                  <input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addTag(tagInput);
                      }
                    }}
                    placeholder="输入标签后回车"
                    className="h-9 flex-1 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => addTag(tagInput)}
                    className="h-9 rounded-md border border-[color:var(--border)] px-3 text-xs text-[color:var(--muted-foreground)] hover:text-foreground"
                  >
                    添加
                  </button>
                </div>
                {formState.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {formState.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[10px] text-foreground"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="text-[10px] text-[color:var(--muted-foreground)] hover:text-foreground"
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <span className="text-[10px] text-[color:var(--muted-foreground)]">
                  回车添加，可多选
                </span>
              </label>

              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                备注
                <textarea
                  value={formState.remark}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      remark: event.target.value,
                    }))
                  }
                  maxLength={100}
                  rows={3}
                  className="resize-none rounded-md border border-[color:var(--border)] bg-transparent px-2 py-2 text-sm text-foreground"
                />
                <span className="text-[10px] text-[color:var(--muted-foreground)]">
                  {formState.remark.length}/100
                </span>
              </label>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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
    </section>
  );
}
