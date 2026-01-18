"use client";

import { useEffect, useRef, useState } from "react";
import { apiBlob, apiJson, API_BASE } from "../lib/api";
import { useNotice } from "../components/NoticeProvider";
import { loadAuthToken } from "../lib/auth";

type EmployeeType = "正式工" | "临时工";

type Employee = {
  id: string;
  name: string;
  type: EmployeeType;
  is_active?: boolean;
};

type FormState = {
  name: string;
  type: EmployeeType;
};

const employeeTypes: EmployeeType[] = ["正式工", "临时工"];

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

function normalizeEmployee(item: Record<string, unknown>): Employee {
  return {
    id: String(item.id ?? ""),
    name: String(item.name ?? item.employee_name ?? ""),
    type:
      (item.type as EmployeeType) ??
      (item.employee_type as EmployeeType) ??
      "正式工",
    is_active: Boolean(item.is_active ?? item.isActive ?? true),
  };
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchText, setSearchText] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>({
    name: "",
    type: "正式工",
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { notify, confirm } = useNotice();
  const displayEmployees = searchText.trim()
    ? employees.filter((employee) => employee.name.includes(searchText.trim()))
    : employees;

  async function loadEmployees(keyword: string) {
    try {
      const query = buildQuery({
        keyword: keyword.trim(),
        is_active: true,
        page: 1,
        page_size: 200,
        sort: "name_asc",
      });
      const payload = await apiJson(`/api/employees${query}`);
      const list = extractList<Record<string, unknown>>(payload).map(
        normalizeEmployee,
      );
      setEmployees(list);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadEmployees(searchText);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  function openCreateModal() {
    setEditingEmployeeId(null);
    setFormState({ name: "", type: "正式工" });
    setIsModalOpen(true);
  }

  function openEditModal(employee: Employee) {
    setEditingEmployeeId(employee.id);
    setFormState({ name: employee.name, type: employee.type });
    setIsModalOpen(true);
  }

  async function handleDelete(employeeId: string) {
    const confirmed = await confirm("确认删除该员工吗？");
    if (!confirmed) {
      return;
    }
    try {
      await apiJson(`/api/employees/${employeeId}`, { method: "DELETE" });
      await loadEmployees(searchText);
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
    if (!name) {
      notify("请输入员工姓名。", "warning");
      return;
    }

    try {
      if (editingEmployeeId) {
        await apiJson(`/api/employees/${editingEmployeeId}`, {
          method: "PUT",
          body: {
            name,
            type: formState.type,
          },
        });
        notify("员工已更新。", "success");
      } else {
        await apiJson("/api/employees", {
          method: "POST",
          body: {
            name,
            type: formState.type,
          },
        });
        notify("员工已新增。", "success");
      }
      setIsModalOpen(false);
      await loadEmployees(searchText);
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
      await loadEmployees(searchText);
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
      const query = buildQuery({ format: "csv", is_active: true });
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
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="搜索员工"
            className="h-8 w-40 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-xs text-foreground"
          />
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
          导入字段：员工姓名、员工类型（正式工/临时工）。支持 Excel 导出为 CSV 后导入。
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[color:var(--muted-foreground)]">
              <tr>
                <th className="pb-2 font-medium">员工姓名</th>
                <th className="pb-2 font-medium">员工类型</th>
                <th className="pb-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {displayEmployees.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
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
