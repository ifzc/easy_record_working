"use client";

import { useEffect, useMemo, useState } from "react";
import { apiJson } from "./lib/api";
import { useNotice } from "./components/NoticeProvider";

type EmployeeType = "正式工" | "临时工";

type Employee = {
  id: string;
  name: string;
  type: EmployeeType;
};

type TimeEntry = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeType: EmployeeType;
  date: string;
  normalHours: number;
  overtimeHours: number;
};

type FormState = {
  employeeId: string;
  date: string;
  normalHours: number;
  overtimeHours: number;
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

function formatWorkUnits(normalHours: number, overtimeHours: number) {
  const units = normalHours / 8 + overtimeHours / 6;
  return Number.isInteger(units) ? `${units}` : units.toFixed(2);
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

function normalizeEmployee(item: Record<string, unknown>): Employee | null {
  const id = String(item.id ?? "");
  const name = String(item.name ?? "");
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    type: (item.type as EmployeeType) ?? "正式工",
  };
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
  if (!id || !employeeId || !date) {
    return null;
  }
  return {
    id,
    employeeId,
    employeeName,
    employeeType,
    date,
    normalHours: Number(item.normal_hours ?? item.normalHours ?? 0),
    overtimeHours: Number(item.overtime_hours ?? item.overtimeHours ?? 0),
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

export default function Home() {
  const [today] = useState(() => new Date());
  const todayKey = toDateKey(today);
  const monthOptions = useMemo(() => getMonthOptions(today), [today]);

  const [selectedMonth, setSelectedMonth] = useState(() => toMonthKey(today));
  const [selectedDate, setSelectedDate] = useState(() => todayKey);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [summaryMap, setSummaryMap] = useState(
    new Map<string, { hours: number; count: number }>(),
  );
  const [searchText, setSearchText] = useState("");
  const [sortOrder, setSortOrder] = useState("none");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>({
    employeeId: "",
    date: todayKey,
    normalHours: 8,
    overtimeHours: 0,
  });
  const { notify, confirm } = useNotice();

  const selectedTotals = summaryMap.get(selectedDate) ?? {
    hours: 0,
    count: 0,
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    loadSummary(selectedMonth);
  }, [selectedMonth]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadEntries();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [selectedDate, searchText, sortOrder]);

  async function loadEmployees() {
    try {
      const query = buildQuery({
        is_active: true,
        page: 1,
        page_size: 200,
      });
      const payload = await apiJson(`/api/employees${query}`);
      const list = extractList<Record<string, unknown>>(payload)
        .map(normalizeEmployee)
        .filter((item): item is Employee => Boolean(item));
      setEmployees(list);
      if (!formState.employeeId && list.length > 0) {
        setFormState((prev) => ({ ...prev, employeeId: list[0].id }));
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function loadEntries() {
    try {
      const sort =
        sortOrder === "none"
          ? undefined
          : sortOrder === "hours-asc"
            ? "hours_asc"
            : "hours_desc";
      const query = buildQuery({
        date: selectedDate,
        keyword: searchText.trim() || undefined,
        sort,
        page: 1,
        page_size: 200,
      });
      const payload = await apiJson(`/api/time-entries${query}`);
      let list = extractList<Record<string, unknown>>(payload)
        .map(normalizeEntry)
        .filter((item): item is TimeEntry => Boolean(item));

      if (sortOrder === "hours-asc") {
        list = list.sort(
          (a, b) =>
            a.normalHours + a.overtimeHours - (b.normalHours + b.overtimeHours),
        );
      }
      if (sortOrder === "hours-desc") {
        list = list.sort(
          (a, b) =>
            b.normalHours + b.overtimeHours - (a.normalHours + a.overtimeHours),
        );
      }
      setEntries(list);
    } catch (error) {
      console.error(error);
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
      employeeId: employees[0]?.id ?? "",
      date: selectedDate,
      normalHours: 8,
      overtimeHours: 0,
    });
    setIsModalOpen(true);
  }

  function openEditModal(entry: TimeEntry) {
    setEditingEntryId(entry.id);
    setFormState({
      employeeId: entry.employeeId,
      date: entry.date,
      normalHours: entry.normalHours,
      overtimeHours: entry.overtimeHours,
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
    if (!formState.employeeId || !formState.date) {
      notify("请选择员工并填写日期。", "warning");
      return;
    }

    try {
      const body = {
        employee_id: formState.employeeId,
        work_date: formState.date,
        normal_hours: formState.normalHours,
        overtime_hours: formState.overtimeHours,
      };

      if (editingEntryId) {
        await apiJson(`/api/time-entries/${editingEntryId}`, {
          method: "PUT",
          body,
        });
        notify("记工记录已更新。", "success");
      } else {
        await apiJson("/api/time-entries", {
          method: "POST",
          body,
        });
        notify("记工记录已新增。", "success");
      }

      setIsModalOpen(false);
      await loadEntries();
      await loadSummary(selectedMonth);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "保存失败，请稍后再试。";
      notify(message, "error");
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
        <h1 className="text-2xl font-semibold">工时总览</h1>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          选择日期查看记工明细，支持新增、编辑与删除记录。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
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
              <div>出勤 {selectedTotals.count}人</div>
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
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="搜索员工"
                className="h-8 w-32 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-xs text-foreground"
              />
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
                className="h-8 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-xs text-[color:var(--muted-foreground)]"
              >
                <option value="none">工时排序</option>
                <option value="hours-asc">工时升序</option>
                <option value="hours-desc">工时降序</option>
              </select>
              <button
                type="button"
                onClick={openCreateModal}
                className="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90"
              >
                记工
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[color:var(--muted-foreground)]">
                <tr>
                  <th className="pb-2 font-medium">员工姓名</th>
                  <th className="pb-2 font-medium">员工类别</th>
                  <th className="pb-2 font-medium">正常班次工时</th>
                  <th className="pb-2 font-medium">加班工时</th>
                  <th className="pb-2 font-medium">总计工</th>
                  <th className="pb-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
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
                        {formatHours(item.normalHours)}h
                      </td>
                      <td className="py-3 text-[color:var(--muted-foreground)]">
                        {formatHours(item.overtimeHours)}h
                      </td>
                      <td className="py-3 text-foreground">
                        {formatWorkUnits(item.normalHours, item.overtimeHours)}工
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
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
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
                员工
                <select
                  value={formState.employeeId}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      employeeId: event.target.value,
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
                        {employee.name}（{employee.type}）
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                日期
                <input
                  type="date"
                  value={formState.date}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      date: event.target.value,
                    }))
                  }
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                />
              </label>

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
