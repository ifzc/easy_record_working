"use client";

import { useEffect, useState } from "react";
import { apiJson } from "../lib/api";
import { useNotice } from "../components/NoticeProvider";

type ProjectStatus = "active" | "pending" | "completed" | "archived";

type Project = {
  id: string;
  name: string;
  code?: string;
  status: ProjectStatus;
  planned_start_date?: string;
  planned_end_date?: string;
  remark?: string;
  createdAt?: string;
  is_active?: boolean;
};

type FormState = {
  name: string;
  code: string;
  status: ProjectStatus;
  plannedStartDate: string;
  plannedEndDate: string;
  remark: string;
};

const projectStatuses: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "进行中" },
  { value: "pending", label: "待开始" },
  { value: "completed", label: "已完成" },
  { value: "archived", label: "已归档" },
];

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

function normalizeProject(item: Record<string, unknown>): Project {
  const createdAt = item.created_at ?? item.createdAt ?? "";
  const remark = item.remark ?? item.notes ?? "";
  const plannedStartDate = item.planned_start_date ?? item.plannedStartDate ?? "";
  const plannedEndDate = item.planned_end_date ?? item.plannedEndDate ?? "";
  return {
    id: String(item.id ?? ""),
    name: String(item.name ?? item.project_name ?? ""),
    code: item.code ? String(item.code) : undefined,
    status: (item.status as ProjectStatus) ?? "active",
    planned_start_date: plannedStartDate ? String(plannedStartDate) : undefined,
    planned_end_date: plannedEndDate ? String(plannedEndDate) : undefined,
    remark: String(remark ?? ""),
    createdAt: createdAt ? String(createdAt) : "",
    is_active: Boolean(item.is_active ?? item.isActive ?? true),
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

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (num: number) => num.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toDateInputValue(value?: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (num: number) => num.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getStatusLabel(status: ProjectStatus): string {
  const item = projectStatuses.find((s) => s.value === status);
  return item?.label ?? status;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchText, setSearchText] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>({
    name: "",
    code: "",
    status: "active",
    plannedStartDate: "",
    plannedEndDate: "",
    remark: "",
  });
  const { notify, confirm } = useNotice();
  const displayProjects = searchText.trim()
    ? projects.filter((project) =>
        project.name.includes(searchText.trim()) ||
        (project.code && project.code.includes(searchText.trim()))
      )
    : projects;

  async function loadProjects(keyword: string) {
    try {
      const query = buildQuery({
        keyword: keyword.trim(),
        is_active: true,
        page: 1,
        page_size: 200,
        sort: "name_asc",
      });
      const payload = await apiJson(`/api/projects${query}`);
      const list = extractList<Record<string, unknown>>(payload).map(
        normalizeProject,
      );
      setProjects(list);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadProjects(searchText);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  function openCreateModal() {
    setEditingProjectId(null);
    setFormState({
      name: "",
      code: "",
      status: "active",
      plannedStartDate: "",
      plannedEndDate: "",
      remark: ""
    });
    setIsModalOpen(true);
  }

  function openEditModal(project: Project) {
    setEditingProjectId(project.id);
    setFormState({
      name: project.name,
      code: project.code ?? "",
      status: project.status,
      plannedStartDate: toDateInputValue(project.planned_start_date),
      plannedEndDate: toDateInputValue(project.planned_end_date),
      remark: project.remark ?? "",
    });
    setIsModalOpen(true);
  }

  async function handleDelete(projectId: string) {
    const confirmed = await confirm("确认删除该项目吗？");
    if (!confirmed) {
      return;
    }
    try {
      await apiJson(`/api/projects/${projectId}`, { method: "DELETE" });
      await loadProjects(searchText);
      notify("项目已删除。", "success");
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
      notify("请输入项目名称。", "warning");
      return;
    }

    try {
      if (editingProjectId) {
        await apiJson(`/api/projects/${editingProjectId}`, {
          method: "PUT",
          body: {
            name,
            code: formState.code.trim() || null,
            status: formState.status,
            planned_start_date: formState.plannedStartDate || null,
            planned_end_date: formState.plannedEndDate || null,
            remark: formState.remark.trim(),
          },
        });
        notify("项目已更新。", "success");
      } else {
        await apiJson("/api/projects", {
          method: "POST",
          body: {
            name,
            code: formState.code.trim() || null,
            status: formState.status,
            planned_start_date: formState.plannedStartDate || null,
            planned_end_date: formState.plannedEndDate || null,
            remark: formState.remark.trim(),
          },
        });
        notify("项目已新增。", "success");
      }
      setIsModalOpen(false);
      await loadProjects(searchText);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "保存失败，请稍后再试。";
      notify(message, "error");
    }
  }

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">项目管理</h1>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          维护项目基础信息。
        </p>
      </div>

      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="搜索项目"
            className="h-8 w-40 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-xs text-foreground"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openCreateModal}
              className="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background"
            >
              新增项目
            </button>
          </div>
        </div>
      </div>
          <table className="w-full text-left text-xs">
            <thead className="text-[color:var(--muted-foreground)]">
              <tr>
                <th className="pb-2 font-medium">项目名称</th>
                <th className="pb-2 font-medium">项目代码</th>
                <th className="pb-2 font-medium">项目状态</th>
                <th className="pb-2 font-medium">计划开始</th>
                <th className="pb-2 font-medium">计划结束</th>
                <th className="pb-2 font-medium">备注</th>
                <th className="pb-2 font-medium">创建时间</th>
                <th className="pb-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {displayProjects.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-6 text-center text-[color:var(--muted-foreground)]"
                  >
                    暂无项目
                  </td>
                </tr>
              ) : (
                displayProjects.map((project) => (
                  <tr
                    key={project.id}
                    className="border-t border-[color:var(--border)]"
                  >
                    <td className="py-3 text-foreground">{project.name}</td>
                    <td className="py-3 text-[color:var(--muted-foreground)]">
                      {project.code || "-"}
                    </td>
                    <td className="py-3 text-[color:var(--muted-foreground)]">
                      {getStatusLabel(project.status)}
                    </td>
                    <td className="py-3 text-[color:var(--muted-foreground)]">
                      {formatDate(project.planned_start_date)}
                    </td>
                    <td className="py-3 text-[color:var(--muted-foreground)]">
                      {formatDate(project.planned_end_date)}
                    </td>
                    <td className="py-3 text-[color:var(--muted-foreground)]">
                      {project.remark || "-"}
                    </td>
                    <td className="py-3 text-[color:var(--muted-foreground)]">
                      {formatDateTime(project.createdAt)}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(project)}
                          className="text-xs text-foreground hover:underline"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(project.id)}
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
                {editingProjectId ? "编辑项目" : "新增项目"}
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
                项目名称
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
                项目代码
                <input
                  value={formState.code}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      code: event.target.value,
                    }))
                  }
                  placeholder="可选"
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                项目状态
                <select
                  value={formState.status}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      status: event.target.value as ProjectStatus,
                    }))
                  }
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                >
                  {projectStatuses.map((statusOption) => (
                    <option key={statusOption.value} value={statusOption.value}>
                      {statusOption.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                计划开始时间
                <input
                  type="date"
                  value={formState.plannedStartDate}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      plannedStartDate: event.target.value,
                    }))
                  }
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                计划结束时间
                <input
                  type="date"
                  value={formState.plannedEndDate}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      plannedEndDate: event.target.value,
                    }))
                  }
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                />
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
                  maxLength={500}
                  rows={3}
                  className="resize-none rounded-md border border-[color:var(--border)] bg-transparent px-2 py-2 text-sm text-foreground"
                />
                <span className="text-[10px] text-[color:var(--muted-foreground)]">
                  {formState.remark.length}/500
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
