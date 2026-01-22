"use client";

import { useEffect, useState } from "react";
import { apiJson } from "../lib/api";
import { useNotice } from "../components/NoticeProvider";

type ProjectStatus = "active" | "pending" | "completed";

type Project = {
  id: string;
  name: string;
  code?: string;
  status: ProjectStatus;
  planned_start_date?: string;
  planned_end_date?: string;
  remark?: string;
  createdAt?: string;
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

function getGanttBarClass(status: ProjectStatus): string {
  switch (status) {
    case "pending":
      return "bg-muted-foreground/40";
    case "completed":
      return "bg-emerald-300/70";
    default:
      return "bg-sky-300/70";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_GANTT_DAYS = 31;
const GANTT_ZOOM_STEP_DAYS = 7;
const MAX_GANTT_ZOOM_OUT = 8;
const MAX_GANTT_LABELS_OVER_31 = 15;

function parseDate(value?: string): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function diffDays(start: Date, end: Date): number {
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS);
}

function formatDateLabel(date: Date): string {
  const pad = (num: number) => num.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatMonthDay(date: Date): string {
  const pad = (num: number) => num.toString().padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getCurrentMonthRange(base: Date): { start: Date; end: Date } {
  const start = startOfDay(new Date(base.getFullYear(), base.getMonth(), 1));
  let end = startOfDay(new Date(base.getFullYear(), base.getMonth() + 1, 0));
  const rangeDays = diffDays(start, end) + 1;
  if (rangeDays < MIN_GANTT_DAYS) {
    end = addDays(end, MIN_GANTT_DAYS - rangeDays);
  }
  return { start, end };
}

function applyGanttZoom(
  range: { start: Date; end: Date },
  zoomSteps: number,
): { start: Date; end: Date } {
  if (zoomSteps === 0) {
    return range;
  }
  const offset = Math.abs(zoomSteps) * GANTT_ZOOM_STEP_DAYS;
  if (zoomSteps > 0) {
    return {
      start: addDays(range.start, offset),
      end: addDays(range.end, -offset),
    };
  }
  return {
    start: addDays(range.start, -offset),
    end: addDays(range.end, offset),
  };
}

type GanttAxisLabel = {
  offset: number;
  label: string;
};

function buildGanttAxisLabels(start: Date, end: Date): GanttAxisLabel[] {
  const totalDays = Math.max(1, diffDays(start, end) + 1);
  const labels: GanttAxisLabel[] = [];

  if (totalDays <= 31) {
    for (let index = 0; index < totalDays; index += 1) {
      const date = addDays(start, index);
      labels.push({ offset: index, label: String(date.getDate()) });
    }
    return labels;
  }

  const maxLabels = Math.min(MAX_GANTT_LABELS_OVER_31, totalDays);
  if (maxLabels <= 1) {
    labels.push({ offset: 0, label: formatMonthDay(start) });
    return labels;
  }
  let lastOffset = -1;
  for (let index = 0; index < maxLabels; index += 1) {
    const offset = Math.round((index * (totalDays - 1)) / (maxLabels - 1));
    if (offset === lastOffset) {
      continue;
    }
    lastOffset = offset;
    labels.push({
      offset,
      label: formatMonthDay(addDays(start, offset)),
    });
  }
  return labels;
}

export default function ProjectsPage() {
  const [today] = useState(() => new Date());
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchText, setSearchText] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ganttZoom, setGanttZoom] = useState(0);
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
  const baseGanttRange = getCurrentMonthRange(today);
  const baseGanttDays = Math.max(1, diffDays(baseGanttRange.start, baseGanttRange.end) + 1);
  const maxZoomInSteps = Math.max(
    0,
    Math.floor((baseGanttDays - MIN_GANTT_DAYS) / (2 * GANTT_ZOOM_STEP_DAYS)),
  );
  const ganttZoomSteps = Math.max(
    -MAX_GANTT_ZOOM_OUT,
    Math.min(ganttZoom, maxZoomInSteps),
  );
  const ganttRange = applyGanttZoom(baseGanttRange, ganttZoomSteps);
  const ganttAxisLabels = buildGanttAxisLabels(ganttRange.start, ganttRange.end);
  const ganttTotalDays = Math.max(1, diffDays(ganttRange.start, ganttRange.end) + 1);
  const canZoomIn = ganttZoomSteps < maxZoomInSteps;
  const canZoomOut = ganttZoomSteps > -MAX_GANTT_ZOOM_OUT;

  async function loadProjects(keyword: string) {
    try {
      const query = buildQuery({
        keyword: keyword.trim(),
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
        <div className="mt-4 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">项目甘特图</p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[color:var(--muted-foreground)]">
                范围 {formatDateLabel(ganttRange.start)} ~ {formatDateLabel(ganttRange.end)}（展示{ganttTotalDays}天）
              </span>
              <div className="flex items-center gap-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-1 py-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setGanttZoom((prev) =>
                      Math.max(prev - 1, -MAX_GANTT_ZOOM_OUT),
                    )
                  }
                  disabled={!canZoomOut}
                  className="h-6 w-6 rounded text-xs text-foreground hover:bg-[color:var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="缩小日期轴"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setGanttZoom((prev) => Math.min(prev + 1, maxZoomInSteps))
                  }
                  disabled={!canZoomIn}
                  className="h-6 w-6 rounded text-xs text-foreground hover:bg-[color:var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="放大日期轴"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setGanttZoom(0)}
                  disabled={ganttZoomSteps === 0}
                  className="h-6 rounded px-2 text-[10px] text-foreground hover:bg-[color:var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="重置日期轴"
                >
                  重置
                </button>
              </div>
            </div>
          </div>
          <div className="mt-3 overflow-x-hidden">
            <div className="w-full space-y-2">
              <div className="grid grid-cols-[200px_1fr] gap-3 text-[10px] text-[color:var(--muted-foreground)]">
                <div>项目</div>
                <div className="relative h-4">
                  {ganttAxisLabels.map((axisLabel, index) => {
                    const position = (axisLabel.offset + 0.5) / ganttTotalDays;
                    const isFirst = index === 0;
                    const isLast = index === ganttAxisLabels.length - 1;
                    const translateX = isFirst ? "0%" : isLast ? "-100%" : "-50%";
                    return (
                      <span
                        key={`${axisLabel.offset}-${axisLabel.label}`}
                        className="absolute top-0 whitespace-nowrap"
                        style={{
                          left: `${position * 100}%`,
                          transform: `translateX(${translateX})`,
                        }}
                      >
                        {axisLabel.label}
                      </span>
                    );
                  })}
                </div>
              </div>
              {displayProjects.length === 0 ? (
                <div className="py-4 text-center text-xs text-[color:var(--muted-foreground)]">
                  暂无项目
                </div>
              ) : (
                displayProjects.map((project) => {
                  const rawStart = parseDate(project.planned_start_date);
                  const rawEnd = parseDate(project.planned_end_date);
                  const fallback = rawStart ?? rawEnd;
                  let barStart = rawStart ?? fallback;
                  let barEnd = rawEnd ?? fallback;
                  if (barStart && barEnd && barEnd < barStart) {
                    const temp = barStart;
                    barStart = barEnd;
                    barEnd = temp;
                  }
                  const hasRange = Boolean(barStart && barEnd);
                  const visibleStart = hasRange
                    ? barStart! < ganttRange.start
                      ? ganttRange.start
                      : barStart!
                    : null;
                  const visibleEnd = hasRange
                    ? barEnd! > ganttRange.end
                      ? ganttRange.end
                      : barEnd!
                    : null;
                  const isClippedLeft = hasRange && barStart! < ganttRange.start;
                  const isClippedRight = hasRange && barEnd! > ganttRange.end;
                  const isVisible =
                    Boolean(visibleStart && visibleEnd) &&
                    (visibleEnd as Date) >= (visibleStart as Date);
                  const offsetDays = isVisible
                    ? diffDays(ganttRange.start, visibleStart as Date)
                    : 0;
                  const barDays = isVisible
                    ? Math.max(
                        1,
                        diffDays(visibleStart as Date, visibleEnd as Date) + 1,
                      )
                    : 0;
                  const left = isVisible ? (offsetDays / ganttTotalDays) * 100 : 0;
                  const width = isVisible ? (barDays / ganttTotalDays) * 100 : 0;

                  return (
                    <div
                      key={project.id}
                      className="grid grid-cols-[200px_1fr] items-center gap-3"
                    >
                      <div className="truncate text-xs text-foreground">
                        {project.name}
                      </div>
                      <div className="relative h-7 rounded-md bg-[color:var(--surface)]">
                        <div
                          className="absolute inset-0 pointer-events-none opacity-60"
                          style={{
                            backgroundImage:
                              "linear-gradient(to right, var(--border) 1px, transparent 1px)",
                            backgroundSize: `${100 / ganttTotalDays}% 100%`,
                            boxShadow: "inset -1px 0 0 var(--border)",
                          }}
                        />
                        {hasRange ? (
                          isVisible ? (
                          <div
                            className={`absolute top-1/2 h-2 -translate-y-1/2 z-10 ${getGanttBarClass(
                              project.status,
                            )} ${
                              isClippedLeft && isClippedRight
                                ? "rounded-none"
                                : isClippedLeft
                                  ? "rounded-r-full"
                                  : isClippedRight
                                    ? "rounded-l-full"
                                    : "rounded-full"
                            } relative`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={`${formatDateLabel(barStart!)} ~ ${formatDateLabel(barEnd!)}`}
                          >
                            {isClippedLeft ? (
                              <span className="absolute left-0 top-0 h-full w-0.5 bg-foreground/90" />
                            ) : null}
                            {isClippedRight ? (
                              <span className="absolute right-0 top-0 h-full w-0.5 bg-foreground/90" />
                            ) : null}
                          </div>
                          ) : (
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-[color:var(--muted-foreground)] z-10">
                              不在当前月份
                            </span>
                          )
                        ) : (
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-[color:var(--muted-foreground)] z-10">
                            未设置日期
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
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
