"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiJson } from "./lib/api";
import { useNotice } from "./components/NoticeProvider";

type EmployeeType = "正式工" | "临时工";

type Employee = {
  id: string;
  name: string;
  type: EmployeeType;
  workType?: string;
};

type Project = {
  id: string;
  name: string;
};

type TimeEntry = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeType: EmployeeType;
  workType?: string;
  projectId?: string;
  projectName?: string;
  date: string;
  normalHours: number;
  overtimeHours: number;
  remark?: string;
  createdAt?: string;
};

type FormState = {
  employeeIds: string[];
  dates: string[];
  projectId: string;
  normalHours: number;
  overtimeHours: number;
  remark: string;
};

type SummaryItem = {
  date?: string;
  work_date?: string;
  total_hours?: number;
  totalHours?: number;
  headcount?: number;
  headCount?: number;
};

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function parseMonthKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  return { year, month };
}

function formatHours(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function formatHoursLabel(value: number) {
  if (value === 0) {
    return "-";
  }
  return `${formatHours(value)}小时`;
}

function formatWorkUnits(normalHours: number, overtimeHours: number) {
  const units = normalHours / 8 + overtimeHours / 6;
  return Number.isInteger(units) ? `${units}` : units.toFixed(2);
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
        DEFAULT_ENTRY_PAGE_SIZE,
    );
    return { total, page, pageSize };
  }
  return { total: 0, page: 1, pageSize: DEFAULT_ENTRY_PAGE_SIZE };
}

function normalizeEmployee(item: Record<string, unknown>): Employee | null {
  const id = String(item.id ?? "");
  const name = String(item.name ?? "");
  if (!id || !name) {
    return null;
  }
  const workType = item.work_type ?? item.workType ?? "";
  return {
    id,
    name,
    type: (item.type as EmployeeType) ?? "正式工",
    workType: workType ? String(workType) : "",
  };
}

function normalizeProject(item: Record<string, unknown>): Project | null {
  const id = String(item.id ?? "");
  const name = String(item.name ?? "");
  if (!id || !name) {
    return null;
  }
  return { id, name };
}

function normalizeEntry(item: Record<string, unknown>): TimeEntry | null {
  const id = String(item.id ?? "");
  const employee = item.employee as { id?: string; name?: string; type?: EmployeeType } | undefined;
  const employeeId = String(item.employee_id ?? item.employeeId ?? employee?.id ?? "");
  const employeeName = String(
    item.employee_name ?? item.employeeName ?? employee?.name ?? "",
  );
  const employeeType =
    (item.employee_type as EmployeeType) ??
    (item.employeeType as EmployeeType) ??
    employee?.type ??
    "正式工";
  const date = String(item.work_date ?? item.workDate ?? item.date ?? "");
  const workType = item.work_type ?? item.workType ?? item.employee_work_type ?? "";
  const projectId = item.project_id ?? item.projectId;
  const projectName = item.project_name ?? item.projectName ?? (item.project as { name?: string } | undefined)?.name ?? "";
  const remark = item.remark ?? item.notes ?? item.note ?? "";
  const createdAt = item.created_at ?? item.createdAt ?? "";
  if (!id || !employeeId || !date) {
    return null;
  }
  return {
    id,
    employeeId,
    employeeName,
    employeeType,
    workType: workType ? String(workType) : "",
    projectId: projectId ? String(projectId) : undefined,
    projectName: projectName ? String(projectName) : undefined,
    date,
    normalHours: Number(item.normal_hours ?? item.normalHours ?? 0),
    overtimeHours: Number(item.overtime_hours ?? item.overtimeHours ?? 0),
    remark: String(remark ?? ""),
    createdAt: createdAt ? String(createdAt) : "",
  };
}

function getMonthOptions(baseDate: Date) {
  const options = [] as Array<{ value: string; label: string }>;
  for (let i = 0; i < 12; i += 1) {
    const date = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
    const value = toMonthKey(date);
    options.push({
      value,
      label: `${date.getFullYear()}年${date.getMonth() + 1}月`,
    });
  }
  return options;
}

const DEFAULT_ENTRY_PAGE_SIZE = 15;

export default function Home() {
  const [today] = useState(() => new Date());
  const todayKey = toDateKey(today);
  const monthOptions = useMemo(() => getMonthOptions(today), [today]);

  const [selectedMonth, setSelectedMonth] = useState(() => toMonthKey(today));
  const [selectedDate, setSelectedDate] = useState(() => todayKey);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedWorkType, setSelectedWorkType] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [entryPage, setEntryPage] = useState(1);
  const [entryTotal, setEntryTotal] = useState(0);
  const [entryPageSize, setEntryPageSize] = useState(DEFAULT_ENTRY_PAGE_SIZE);
  const [summaryMap, setSummaryMap] = useState(
    new Map<string, { hours: number; count: number }>(),
  );
  const [isEntriesLoading, setIsEntriesLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>({
    employeeIds: [],
    dates: [],
    projectId: "",
    normalHours: 8,
    overtimeHours: 0,
    remark: "",
  });
  const { notify, confirm } = useNotice();

  const selectedTotals = summaryMap.get(selectedDate) ?? {
    hours: 0,
    count: 0,
  };
  const workTypeOptions = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((employee) => {
      if (employee.workType) {
        set.add(employee.workType);
      }
    });
    if (selectedWorkType) {
      set.add(selectedWorkType);
    }
    return Array.from(set);
  }, [employees, selectedWorkType]);
  const entryFiltersKey = useMemo(
    () =>
      `${selectedDate}|${selectedWorkType}|${selectedProjectId}|${entryPageSize}`,
    [selectedDate, selectedWorkType, selectedProjectId, entryPageSize],
  );
  const entryTotalPages = Math.max(1, Math.ceil(entryTotal / entryPageSize));
  const entryFiltersRef = useRef(entryFiltersKey);

  useEffect(() => {
    loadEmployees();
    loadProjects();
  }, []);

  useEffect(() => {
    loadSummary(selectedMonth);
  }, [selectedMonth]);

  useEffect(() => {
    if (entryFiltersRef.current !== entryFiltersKey) {
      entryFiltersRef.current = entryFiltersKey;
      if (entryPage !== 1) {
        setEntryPage(1);
        return;
      }
    }
    const timer = window.setTimeout(() => {
      loadEntries();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [entryFiltersKey, entryPage]);

  async function loadEmployees() {
    try {
      const query = buildQuery({
        page: 1,
        page_size: 200,
      });
      const payload = await apiJson(`/api/employees${query}`);
      const list = extractList<Record<string, unknown>>(payload)
        .map(normalizeEmployee)
        .filter((item): item is Employee => Boolean(item));
      setEmployees(list);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadProjects() {
    try {
      const query = buildQuery({
        page: 1,
        page_size: 200,
        sort: "name_asc",
      });
      const payload = await apiJson(`/api/projects${query}`);
      const list = extractList<Record<string, unknown>>(payload)
        .map(normalizeProject)
        .filter((item): item is Project => Boolean(item));
      setProjects(list);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadEntries() {
    try {
      setIsEntriesLoading(true);
      const query = buildQuery({
        date: selectedDate,
        work_type: selectedWorkType || undefined,
        project_id: selectedProjectId || undefined,
        page: entryPage,
        page_size: entryPageSize,
      });
      const payload = await apiJson(`/api/time-entries${query}`);
      const meta = extractPagedMeta(payload);
      let list = extractList<Record<string, unknown>>(payload)
        .map(normalizeEntry)
        .filter((item): item is TimeEntry => Boolean(item));
      setEntryTotal(meta.total);
      const nextTotalPages = Math.max(1, Math.ceil(meta.total / entryPageSize));
      if (meta.total > 0 && entryPage > nextTotalPages) {
        setEntryPage(nextTotalPages);
        return;
      }
      setEntries(list);
    } catch (error) {
      console.error(error);
      setEntries([]);
      setEntryTotal(0);
    } finally {
      setIsEntriesLoading(false);
    }
  }

  async function loadSummary(month: string) {
    try {
      const payload = await apiJson(
        `/api/time-entries/summary?month=${month}`,
      );
      const list = extractList<SummaryItem>(payload);
      const nextMap = new Map<string, { hours: number; count: number }>();
      list.forEach((item) => {
        const date = item.date ?? item.work_date;
        if (!date) {
          return;
        }
        const hours = Number(item.total_hours ?? item.totalHours ?? 0);
        const count = Number(item.headcount ?? item.headCount ?? 0);
        nextMap.set(date, { hours, count });
      });
      setSummaryMap(nextMap);
    } catch (error) {
      console.error(error);
      setSummaryMap(new Map());
    }
  }

  function handleMonthChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    setSelectedMonth(next);
    setSelectedDate(`${next}-01`);
  }

  function handleDayClick(dateKey: string) {
    setSelectedDate(dateKey);
  }

  function openCreateModal() {
    setEditingEntryId(null);
    setFormState({
      employeeIds: [],
      dates: [selectedDate],
      projectId: "",
      normalHours: 8,
      overtimeHours: 0,
      remark: "",
    });
    setIsModalOpen(true);
  }

  function openEditModal(entry: TimeEntry) {
    setEditingEntryId(entry.id);
    setFormState({
      employeeIds: [entry.employeeId],
      dates: [entry.date],
      projectId: entry.projectId ?? "",
      normalHours: entry.normalHours,
      overtimeHours: entry.overtimeHours,
      remark: entry.remark ?? "",
    });
    setIsModalOpen(true);
  }

  async function handleDelete(entryId: string) {
    const confirmed = await confirm("确认删除该条记工记录吗？");
    if (!confirmed) {
      return;
    }
    try {
      await apiJson(`/api/time-entries/${entryId}`, { method: "DELETE" });
      await loadEntries();
      await loadSummary(selectedMonth);
      notify("记工记录已删除。", "success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "删除失败，请稍后再试。";
      notify(message, "error");
    }
  }

  async function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const projectId = formState.projectId;
    if (projects.length > 0 && !projectId) {
      notify("请选择项目。", "warning");
      return;
    }

    if (editingEntryId) {
      // 编辑模式：单条记录编辑
      if (formState.employeeIds.length === 0 || formState.dates.length === 0) {
        notify("请选择员工并填写日期。", "warning");
        return;
      }

      try {
        const body = {
          employee_id: formState.employeeIds[0],
          project_id: projectId || null,
          work_date: formState.dates[0],
          normal_hours: formState.normalHours,
          overtime_hours: formState.overtimeHours,
          remark: formState.remark.trim(),
        };

        await apiJson(`/api/time-entries/${editingEntryId}`, {
          method: "PUT",
          body,
        });
        notify("记工记录已更新。", "success");
        setIsModalOpen(false);
        await loadEntries();
        await loadSummary(selectedMonth);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "保存失败，请稍后再试。";
        notify(message, "error");
      }
    } else {
      // 新增模式：批量创建
      if (formState.employeeIds.length === 0) {
        notify("请至少选择一位员工。", "warning");
        return;
      }
      if (formState.dates.length === 0) {
        notify("请至少选择一个日期。", "warning");
        return;
      }

      try {
        const body = {
          employee_ids: formState.employeeIds,
          work_dates: formState.dates,
          project_id: projectId || null,
          normal_hours: formState.normalHours,
          overtime_hours: formState.overtimeHours,
          remark: formState.remark.trim(),
        };

        const payload = await apiJson("/api/time-entries/batch", {
          method: "POST",
          body,
        });

        const result = (payload as { data?: unknown }).data ?? payload;
        const created = Number((result as { created?: number }).created ?? 0);
        const skipped = Number((result as { skipped?: number }).skipped ?? 0);
        const total = Number((result as { total?: number }).total ?? 0);

        setIsModalOpen(false);
        await loadEntries();
        await loadSummary(selectedMonth);

        if (skipped === 0) {
          notify(`批量记工成功，共创建 ${created} 条记录。`, "success");
        } else if (created === 0) {
          notify(`批量记工失败，${skipped} 条记录被跳过（可能已存在）。`, "error");
        } else {
          notify(
            `批量记工部分成功，成功 ${created} 条，跳过 ${skipped} 条。`,
            "warning"
          );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "保存失败，请稍后再试。";
        notify(message, "error");
      }
    }
  }

  const { year, month } = parseMonthKey(selectedMonth);
  const monthStart = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startIndex = (monthStart.getDay() + 6) % 7;
  const totalCells = Math.ceil((startIndex + daysInMonth) / 7) * 7;

  const calendarCells = Array.from({ length: totalCells }, (_, index) => {
    const day = index - startIndex + 1;
    if (day < 1 || day > daysInMonth) {
      return null;
    }
    const dateKey = `${year}-${pad(month)}-${pad(day)}`;
    return { day, dateKey };
  });

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">每日记工</h1>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          选择日期查看记工明细，每日记工，支持新增、编辑与删除记录。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="self-start rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">月份</span>
            <select
              value={selectedMonth}
              onChange={handleMonthChange}
              className="rounded-md border border-[color:var(--border)] bg-transparent px-2 py-1 text-xs text-[color:var(--muted-foreground)]"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs text-[color:var(--muted-foreground)]">
            {["一", "二", "三", "四", "五", "六", "日"].map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-2">
            {calendarCells.map((cell, index) => {
              if (!cell) {
                return (
                  <div key={`empty-${index}`} className="aspect-square w-full" />
                );
              }

              const isSelected = cell.dateKey === selectedDate;
              const isToday = cell.dateKey === todayKey;

              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  onClick={() => handleDayClick(cell.dateKey)}
                  className={`flex aspect-square w-full items-center justify-center rounded-lg border text-sm transition ${
                    isSelected
                      ? "border-[color:var(--foreground)] bg-[color:var(--surface-muted)]"
                      : "border-transparent hover:border-[color:var(--border)]"
                  } ${
                    isToday ? "ring-1 ring-[color:var(--foreground)]/20" : ""
                  }`}
                >
                  <span className="text-sm font-semibold text-foreground">
                    {cell.day}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs text-[color:var(--muted-foreground)]">
            <div className="flex items-center justify-between">
              <span>统计信息</span>
              <span>{selectedDate}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-foreground">
              <div>总工时 {formatHours(selectedTotals.hours)}h</div>
              <div className="text-right">出勤 {selectedTotals.count}人</div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">记工明细</p>
              <p className="text-xs text-[color:var(--muted-foreground)]">
                已选日期：{selectedDate}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-[color:var(--muted-foreground)]">
                工种
                <select
                  value={selectedWorkType}
                  onChange={(event) => setSelectedWorkType(event.target.value)}
                  className="h-8 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-xs text-foreground"
                >
                  <option value="">全部工种</option>
                  {workTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-[color:var(--muted-foreground)]">
                项目
                <select
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className="h-8 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-xs text-foreground"
                  disabled={projects.length === 0}
                >
                  {projects.length === 0 ? (
                    <option value="">暂无项目</option>
                  ) : (
                    <>
                      <option value="">全部项目</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </label>
              <button
                type="button"
                onClick={openCreateModal}
                className="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90"
              >
                记工
              </button>
            </div>
          </div>

          <div className="mt-4 flex min-h-[360px] flex-col">
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[color:var(--muted-foreground)]">
                  <tr>
                    <th className="pb-2 font-medium">员工姓名</th>
                    <th className="pb-2 font-medium">员工类别</th>
                    <th className="pb-2 font-medium">工种</th>
                    <th className="pb-2 font-medium">项目</th>
                    <th className="pb-2 font-medium">正常班次工时</th>
                    <th className="pb-2 font-medium">加班工时</th>
                    <th className="pb-2 font-medium">总计工</th>
                    <th className="pb-2 font-medium">备注</th>
                    <th className="pb-2 font-medium">创建时间</th>
                    <th className="pb-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {isEntriesLoading ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="py-6 text-center text-[color:var(--muted-foreground)]"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-foreground" />
                          <span>加载中</span>
                        </div>
                      </td>
                    </tr>
                  ) : entries.length === 0 ? (
                    <tr>
                      <td
                      colSpan={10}
                        className="py-6 text-center text-[color:var(--muted-foreground)]"
                      >
                        暂无记录
                      </td>
                    </tr>
                  ) : (
                    entries.map((item) => (
                      <tr
                        key={item.id}
                        className="border-t border-[color:var(--border)]"
                      >
                        <td className="py-3 text-foreground">
                          {item.employeeName || "未知"}
                        </td>
                        <td className="py-3 text-[color:var(--muted-foreground)]">
                        {item.employeeType || "-"}
                      </td>
                      <td className="py-3 text-[color:var(--muted-foreground)]">
                        {item.workType || "-"}
                      </td>
                      <td className="py-3 text-[color:var(--muted-foreground)]">
                        {item.projectName || "-"}
                      </td>
                        <td className="py-3 text-[color:var(--muted-foreground)]">
                          {formatHoursLabel(item.normalHours)}
                        </td>
                        <td className="py-3 text-[color:var(--muted-foreground)]">
                          {formatHoursLabel(item.overtimeHours)}
                        </td>
                        <td className="py-3 text-foreground">
                          {formatWorkUnits(item.normalHours, item.overtimeHours)}工
                        </td>
                        <td className="py-3 text-[color:var(--muted-foreground)]">
                          {item.remark || "-"}
                        </td>
                        <td className="py-3 text-[color:var(--muted-foreground)]">
                          {formatDateTime(item.createdAt)}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              className="text-xs text-foreground hover:underline"
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
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
              <span>共 {entryTotal} 条</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2">
                  每页
                  <select
                    value={entryPageSize}
                    onChange={(event) => {
                      const nextSize = Number(event.target.value);
                      setEntryPageSize(nextSize);
                      setEntryPage(1);
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
                  onClick={() => setEntryPage((prev) => Math.max(1, prev - 1))}
                  disabled={entryPage <= 1 || isEntriesLoading}
                  className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs text-foreground disabled:opacity-50"
                >
                  上一页
                </button>
                <span>
                  {entryTotal === 0 ? 0 : entryPage} / {entryTotal === 0 ? 0 : entryTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setEntryPage((prev) => Math.min(entryTotalPages, prev + 1))
                  }
                  disabled={entryPage >= entryTotalPages || isEntriesLoading}
                  className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs text-foreground disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">
                {editingEntryId ? "编辑记工" : "新增记工"}
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
                项目
                <select
                  value={formState.projectId}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      projectId: event.target.value,
                    }))
                  }
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                  disabled={projects.length === 0}
                >
                  {projects.length === 0 ? (
                    <option value="">暂无项目</option>
                  ) : (
                    <>
                      <option value="">请选择项目</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </label>
              {editingEntryId ? (
                <>
                  <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                    员工
                    <select
                      value={formState.employeeIds[0] ?? ""}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          employeeIds: [event.target.value],
                        }))
                      }
                      className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                      disabled={employees.length === 0}
                    >
                    {employees.length === 0 ? (
                      <option value="">暂无员工</option>
                    ) : (
                      employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name} - {employee.workType || ""} -{" "}
                          {employee.type}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                  <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                    日期
                    <input
                      type="date"
                      value={formState.dates[0] ?? ""}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          dates: [event.target.value],
                        }))
                      }
                      className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                      <div className="flex items-center justify-between">
                        <span>选择员工</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setFormState((prev) => ({
                                ...prev,
                                employeeIds: employees.map((e) => e.id),
                              }))
                            }
                            className="text-[10px] text-foreground hover:underline"
                          >
                            全选
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setFormState((prev) => ({
                                ...prev,
                                employeeIds: [],
                              }))
                            }
                            className="text-[10px] text-[color:var(--muted-foreground)] hover:underline"
                          >
                            清空
                          </button>
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto rounded-md border border-[color:var(--border)] bg-transparent p-2">
                        {employees.length === 0 ? (
                          <div className="py-2 text-center text-[color:var(--muted-foreground)]">
                            暂无员工
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {employees.map((employee) => (
                              <label
                                key={employee.id}
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-[color:var(--surface-muted)]"
                              >
                                <input
                                  type="checkbox"
                                  checked={formState.employeeIds.includes(
                                    employee.id
                                  )}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    setFormState((prev) => ({
                                      ...prev,
                                      employeeIds: checked
                                        ? [...prev.employeeIds, employee.id]
                                        : prev.employeeIds.filter(
                                            (id) => id !== employee.id
                                          ),
                                    }));
                                  }}
                                  className="h-4 w-4"
                                />
                                <span className="text-sm text-foreground">
                                  {employee.name} - {employee.workType || ""} -{" "}
                                  {employee.type}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-[color:var(--muted-foreground)]">
                        已选 {formState.employeeIds.length} 位员工
                      </span>
                    </div>

                    <div className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                      <div className="flex items-center justify-between">
                        <span>选择日期</span>
                        <button
                          type="button"
                          onClick={() =>
                            setFormState((prev) => ({
                              ...prev,
                              dates: [],
                            }))
                          }
                          className="text-[10px] text-[color:var(--muted-foreground)] hover:underline"
                        >
                          清空
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto rounded-md border border-[color:var(--border)] bg-transparent p-2">
                        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] text-[color:var(--muted-foreground)]">
                          {["一", "二", "三", "四", "五", "六", "日"].map(
                            (label) => (
                              <div key={label}>{label}</div>
                            )
                          )}
                        </div>
                        <div className="grid grid-cols-7 gap-1 place-items-center">
                          {calendarCells.map((cell, index) => {
                            if (!cell) {
                              return (
                                <div
                                  key={`empty-${index}`}
                                  className="h-7 w-7"
                                />
                              );
                            }

                            const isSelected = formState.dates.includes(
                              cell.dateKey
                            );
                            const isToday = cell.dateKey === todayKey;

                            return (
                              <button
                                key={cell.dateKey}
                                type="button"
                                onClick={() => {
                                  setFormState((prev) => ({
                                    ...prev,
                                    dates: isSelected
                                      ? prev.dates.filter(
                                          (d) => d !== cell.dateKey
                                        )
                                      : [...prev.dates, cell.dateKey],
                                  }));
                                }}
                                className={`flex h-7 w-7 items-center justify-center rounded text-[11px] transition ${
                                  isSelected
                                    ? "bg-foreground text-background"
                                    : "hover:bg-[color:var(--surface-muted)]"
                                } ${
                                  isToday
                                    ? "ring-1 ring-[color:var(--foreground)]/40"
                                    : ""
                                }`}
                              >
                                {cell.day}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <span className="text-[10px] text-[color:var(--muted-foreground)]">
                        已选 {formState.dates.length} 个日期
                      </span>
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                  正常班次小时
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={formState.normalHours}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        normalHours: Number(event.target.value),
                      }))
                    }
                    className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                  加班小时
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={formState.overtimeHours}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        overtimeHours: Number(event.target.value),
                      }))
                    }
                    className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                  />
                </label>
              </div>

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

              <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs text-[color:var(--muted-foreground)]">
                总计工：{formatWorkUnits(formState.normalHours, formState.overtimeHours)}工（正常班次 8 小时=1 工，加班 6 小时=1 工）
              </div>

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
