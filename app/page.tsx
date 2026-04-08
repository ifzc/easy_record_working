"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock3 } from "lucide-react";
import { apiBlob, apiJson } from "./lib/api";
import { useNotice } from "./components/NoticeProvider";

type EmployeeType = "正式工" | "临时工";

type Employee = {
  id: string;
  name: string;
  type: EmployeeType;
  workType?: string;
  tags?: string[];
};

type EmployeeGroup = {
  key: string;
  label: string;
  employees: Employee[];
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

type ExportRange = {
  startDate: string;
  endDate: string;
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

function normalizeTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return Array.from(
      new Set(
        raw
          .map((item) => String(item ?? "").trim())
          .filter(Boolean),
      ),
    );
  }
  if (typeof raw === "string") {
    return Array.from(
      new Set(
        raw
          .split(/[，,]/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
  }
  return [];
}

function normalizeEmployee(item: Record<string, unknown>): Employee | null {
  const id = String(item.id ?? "");
  const name = String(item.name ?? "");
  if (!id || !name) {
    return null;
  }
  const workType = item.work_type ?? item.workType ?? "";
  const tags = normalizeTags(item.tags ?? item.tag ?? item.labels ?? item.label);
  return {
    id,
    name,
    type: (item.type as EmployeeType) ?? "正式工",
    workType: workType ? String(workType) : "",
    tags,
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

function getEmployeeGroupLabel(workType?: string) {
  const value = workType?.trim();
  return value ? value : "未设置工种";
}

function formatMonthLabel(key: string) {
  const { year, month } = parseMonthKey(key);
  return `${year}年${month}月`;
}

function shiftMonthKey(key: string, offset: number) {
  const { year, month } = parseMonthKey(key);
  return toMonthKey(new Date(year, month - 1 + offset, 1));
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
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [pickerMonth, setPickerMonth] = useState(() => toMonthKey(today));
  const [formState, setFormState] = useState<FormState>({
    employeeIds: [],
    dates: [],
    projectId: "",
    normalHours: 8,
    overtimeHours: 0,
    remark: "",
  });
  const [exportRange, setExportRange] = useState<ExportRange>({
    startDate: todayKey,
    endDate: todayKey,
  });
  const { notify, confirm } = useNotice();

  const selectedTotals = summaryMap.get(selectedDate) ?? {
    hours: 0,
    count: 0,
  };
  const isEditing = Boolean(editingEntryId);
  const allEmployeeIds = useMemo(
    () => employees.map((employee) => employee.id),
    [employees],
  );
  const employeeGroups = useMemo(() => {
    const groups = new Map<string, EmployeeGroup>();
    const sortedEmployees = [...employees].sort((left, right) => {
      const groupCompare = getEmployeeGroupLabel(left.workType).localeCompare(
        getEmployeeGroupLabel(right.workType),
        "zh-CN",
      );
      if (groupCompare !== 0) {
        return groupCompare;
      }
      if (left.type !== right.type) {
        return left.type === "正式工" ? -1 : 1;
      }
      return left.name.localeCompare(right.name, "zh-CN");
    });

    sortedEmployees.forEach((employee) => {
      const label = getEmployeeGroupLabel(employee.workType);
      const current = groups.get(label);
      if (current) {
        current.employees.push(employee);
        return;
      }
      groups.set(label, {
        key: label,
        label,
        employees: [employee],
      });
    });

    return Array.from(groups.values());
  }, [employees]);
  const employeeTagMap = useMemo(
    () =>
      new Map(
        employees.map((employee) => [employee.id, employee.tags ?? []] as const),
      ),
    [employees],
  );
  const selectedEmployeeSet = useMemo(
    () => new Set(formState.employeeIds),
    [formState.employeeIds],
  );
  const selectedEmployeeSummary = useMemo(() => {
    return employees
      .filter((employee) => selectedEmployeeSet.has(employee.id))
      .map((employee) => employee.name)
      .join("、");
  }, [employees, selectedEmployeeSet]);
  const selectedDateList = useMemo(
    () => [...formState.dates].sort(),
    [formState.dates],
  );
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
  const selectedProjectName = useMemo(
    () =>
      projects.find((project) => project.id === selectedProjectId)?.name ?? "",
    [projects, selectedProjectId],
  );
  const entryFiltersKey = useMemo(
    () =>
      `${selectedDate}|${selectedWorkType}|${selectedProjectId}|${entryPageSize}`,
    [selectedDate, selectedWorkType, selectedProjectId, entryPageSize],
  );
  const entryTotalPages = Math.max(1, Math.ceil(entryTotal / entryPageSize));
  const entryFiltersRef = useRef(entryFiltersKey);

  async function loadEmployees() {
    try {
      const query = buildQuery({
        page: 1,
        page_size: 200,
        sort: "name_asc",
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

  const loadEntries = useCallback(async () => {
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
      const list = extractList<Record<string, unknown>>(payload)
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
  }, [entryPage, entryPageSize, selectedDate, selectedProjectId, selectedWorkType]);

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
  }, [entryFiltersKey, entryPage, loadEntries]);

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
    setPickerMonth(selectedDate.slice(0, 7));
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

  function openExportModal() {
    setExportRange({
      startDate: selectedDate,
      endDate: selectedDate,
    });
    setIsExportModalOpen(true);
  }

  function openDatePicker(event: React.MouseEvent<HTMLInputElement>) {
    const input = event.currentTarget as HTMLInputElement & {
      showPicker?: () => void;
    };
    try {
      input.showPicker?.();
    } catch {
      // Ignore unsupported browsers and fall back to native behavior.
    }
  }

  function openEditModal(entry: TimeEntry) {
    setEditingEntryId(entry.id);
    setPickerMonth(entry.date.slice(0, 7));
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

  function toggleEmployeeSelection(employeeId: string) {
    setFormState((prev) => {
      if (isEditing) {
        const isSelected = prev.employeeIds[0] === employeeId;
        return {
          ...prev,
          employeeIds: isSelected ? [] : [employeeId],
        };
      }

      const isSelected = prev.employeeIds.includes(employeeId);
      return {
        ...prev,
        employeeIds: isSelected
          ? prev.employeeIds.filter((id) => id !== employeeId)
          : [...prev.employeeIds, employeeId],
      };
    });
  }

  function selectAllEmployees() {
    if (isEditing) {
      return;
    }
    setFormState((prev) => ({
      ...prev,
      employeeIds: allEmployeeIds,
    }));
  }

  function clearAllEmployees() {
    setFormState((prev) => ({
      ...prev,
      employeeIds: [],
    }));
  }

  function selectEmployeeGroup(employeeIds: string[]) {
    if (employeeIds.length === 0) {
      return;
    }

    if (isEditing) {
      setFormState((prev) => ({
        ...prev,
        employeeIds: [employeeIds[0]],
      }));
      return;
    }

    setFormState((prev) => ({
      ...prev,
      employeeIds: Array.from(new Set([...prev.employeeIds, ...employeeIds])),
    }));
  }

  function clearEmployeeGroup(employeeIds: string[]) {
    setFormState((prev) => ({
      ...prev,
      employeeIds: prev.employeeIds.filter((id) => !employeeIds.includes(id)),
    }));
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

  async function handleExport() {
    const startDate = exportRange.startDate;
    const endDate = exportRange.endDate;

    if (!startDate || !endDate) {
      notify("请选择开始日期和结束日期。", "warning");
      return;
    }

    if (startDate > endDate) {
      notify("开始日期不能晚于结束日期。", "warning");
      return;
    }

    try {
      setIsExporting(true);
      const query = buildQuery({
        format: "xlsx",
        start_date: startDate,
        end_date: endDate,
        work_type: selectedWorkType || undefined,
        project_id: selectedProjectId || undefined,
      });
      const blob = await apiBlob(`/api/time-entries/export${query}`);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `记工明细_${startDate}_${endDate}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);

      setIsExportModalOpen(false);
      notify("工时明细导出成功。", "success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "导出失败，请稍后再试。";
      notify(message, "error");
    } finally {
      setIsExporting(false);
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

  const { year: pickerYear, month: pickerMonthNumber } = parseMonthKey(pickerMonth);
  const pickerMonthStart = new Date(pickerYear, pickerMonthNumber - 1, 1);
  const pickerDaysInMonth = new Date(pickerYear, pickerMonthNumber, 0).getDate();
  const pickerStartIndex = (pickerMonthStart.getDay() + 6) % 7;
  const pickerTotalCells =
    Math.ceil((pickerStartIndex + pickerDaysInMonth) / 7) * 7;
  const pickerCalendarCells = Array.from(
    { length: pickerTotalCells },
    (_, index) => {
      const day = index - pickerStartIndex + 1;
      if (day < 1 || day > pickerDaysInMonth) {
        return null;
      }
      const dateKey = `${pickerYear}-${pad(pickerMonthNumber)}-${pad(day)}`;
      return { day, dateKey };
    },
  );

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
                onClick={openExportModal}
                className="h-8 rounded-md border border-[color:var(--border)] px-3 text-xs text-[color:var(--muted-foreground)] hover:text-foreground"
              >
                导出明细
              </button>
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
                    <th className="pb-1 font-medium">员工姓名</th>
                    <th className="pb-1 font-medium">工种</th>
                    <th className="pb-1 font-medium">项目</th>
                    <th className="pb-1 font-medium">记工</th>
                    <th className="pb-1 font-medium">备注</th>
                    <th className="w-[140px] min-w-[140px] pb-1 font-medium">
                      创建时间
                    </th>
                    <th className="w-[85px] min-w-[85px] pb-1 font-medium">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isEntriesLoading ? (
                    <tr>
                      <td
                        colSpan={7}
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
                        colSpan={7}
                        className="py-6 text-center text-[color:var(--muted-foreground)]"
                      >
                        暂无记录
                      </td>
                    </tr>
                  ) : (
                    entries.map((item) => {
                      const employeeTags = employeeTagMap.get(item.employeeId) ?? [];
                      return (
                        <tr
                          key={item.id}
                          className="border-t border-[color:var(--border)]"
                        >
                          <td className="whitespace-nowrap py-2 text-foreground">
                            <div className="inline-flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1.5">
                                <span>{item.employeeName || "未知"}</span>
                                {item.employeeType === "临时工" ? (
                                  <Clock3
                                    className="h-3.5 w-3.5 text-amber-500"
                                    aria-label="临时工标记"
                                    title="临时工标记"
                                  />
                                ) : null}
                              </span>
                              {employeeTags.length > 0 ? (
                                <div className="inline-flex items-center gap-1">
                                  {employeeTags.map((tag) => (
                                    <span
                                      key={`${item.employeeId}-${tag}`}
                                      className="inline-flex items-center rounded-full border border-[color:var(--border)] px-1.5 py-px text-[10px] leading-4 text-emerald-600"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-2 text-[color:var(--muted-foreground)]">
                            {item.workType || "-"}
                          </td>
                          <td className="py-2 text-[color:var(--muted-foreground)]">
                            {item.projectName || "-"}
                          </td>
                          <td className="whitespace-nowrap py-2 text-foreground">
                            <span className="text-[color:var(--muted-foreground)]">
                              常规 {formatHours(item.normalHours)}h
                              {item.overtimeHours > 0 ? (
                                <> / 加班 {formatHours(item.overtimeHours)}h</>
                              ) : null}
                            </span>
                            <span className="mx-2 text-[color:var(--muted-foreground)]">
                              -&gt;
                            </span>
                            <span>
                              {formatWorkUnits(item.normalHours, item.overtimeHours)}个工
                            </span>
                          </td>
                          <td className="py-2 text-[color:var(--muted-foreground)]">
                            {item.remark || "-"}
                          </td>
                          <td className="w-[140px] min-w-[140px] whitespace-nowrap py-2 text-[color:var(--muted-foreground)]">
                            {formatDateTime(item.createdAt)}
                          </td>
                          <td className="w-[85px] min-w-[85px] py-2">
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
                      );
                    })
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

      {isExportModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">导出工时明细</h3>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="text-xs text-[color:var(--muted-foreground)]"
                disabled={isExporting}
              >
                关闭
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                开始日期
                <input
                  type="date"
                  value={exportRange.startDate}
                  max={exportRange.endDate || undefined}
                  onClick={openDatePicker}
                  onChange={(event) =>
                    setExportRange((prev) => ({
                      ...prev,
                      startDate: event.target.value,
                    }))
                  }
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                结束日期
                <input
                  type="date"
                  value={exportRange.endDate}
                  min={exportRange.startDate || undefined}
                  onClick={openDatePicker}
                  onChange={(event) =>
                    setExportRange((prev) => ({
                      ...prev,
                      endDate: event.target.value,
                    }))
                  }
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                />
              </label>

              <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs text-[color:var(--muted-foreground)]">
                <div>
                  当前筛选：工种 {selectedWorkType || "全部"} / 项目{" "}
                  {selectedProjectName || "全部"}
                </div>
                <div className="mt-1">
                  将导出所选日期区间内的工时详细表格（Excel）。
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  className="h-9 rounded-md border border-[color:var(--border)] px-3 text-xs text-[color:var(--muted-foreground)]"
                  disabled={isExporting}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  className="h-9 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-50"
                  disabled={isExporting}
                >
                  {isExporting ? "导出中..." : "确认导出"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className={`w-full ${
              isEditing ? "max-w-5xl" : "max-w-6xl"
            } rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4`}
          >
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
              <div className="grid gap-3 md:grid-cols-3">
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
                <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                  常规班次小时
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
              <div
                className={`grid gap-4 ${
                  isEditing
                    ? "xl:grid-cols-[1.7fr_320px]"
                    : "xl:grid-cols-[2fr_1fr]"
                }`}
              >
                <div className="flex flex-col gap-1.5 text-xs text-[color:var(--muted-foreground)]">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <span>选择员工</span>
                      <p className="mt-0.5 text-[10px] text-[color:var(--muted-foreground)]">
                        {isEditing
                          ? "按工种分组展示，编辑模式仅可选择 1 位员工。"
                          : "按工种分组展示，可一次性选中整组员工。"}
                      </p>
                    </div>
                    {isEditing ? (
                      <span className="text-[10px] text-[color:var(--muted-foreground)]">
                        已选 {formState.employeeIds.length} 位员工
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllEmployees}
                          className="text-[10px] text-foreground hover:underline"
                        >
                          全选全部
                        </button>
                        <button
                          type="button"
                          onClick={clearAllEmployees}
                          className="text-[10px] text-[color:var(--muted-foreground)] hover:underline"
                        >
                          清空
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="max-h-[25rem] overflow-y-auto rounded-md border border-[color:var(--border)] bg-transparent p-2">
                    {employeeGroups.length === 0 ? (
                      <div className="py-10 text-center text-[color:var(--muted-foreground)]">
                        暂无员工
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {employeeGroups.map((group) => {
                          const groupEmployeeIds = group.employees.map(
                            (employee) => employee.id,
                          );
                          const selectedCount = groupEmployeeIds.filter((id) =>
                            selectedEmployeeSet.has(id),
                          ).length;
                          const isGroupFullySelected =
                            selectedCount === groupEmployeeIds.length &&
                            groupEmployeeIds.length > 0;

                          return (
                            <section
                              key={group.key}
                              className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border)] px-2.5 py-1.5">
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-medium text-foreground">
                                    {group.label}
                                  </p>
                                  <p className="text-[10px] text-[color:var(--muted-foreground)]">
                                    共 {group.employees.length} 位，已选 {selectedCount} 位
                                  </p>
                                </div>
                                {isEditing ? null : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      isGroupFullySelected
                                        ? clearEmployeeGroup(groupEmployeeIds)
                                        : selectEmployeeGroup(groupEmployeeIds)
                                    }
                                    className="text-[10px] text-foreground hover:underline"
                                  >
                                    {isGroupFullySelected ? "清空本组" : "全选本组"}
                                  </button>
                                )}
                              </div>
                              <div className="grid gap-1.5 p-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                                {group.employees.map((employee) => {
                                  const isSelected = selectedEmployeeSet.has(
                                    employee.id,
                                  );

                                  return (
                                    <button
                                      key={employee.id}
                                      type="button"
                                      onClick={() =>
                                        toggleEmployeeSelection(employee.id)
                                      }
                                      className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left transition ${
                                        isSelected
                                          ? "border-foreground bg-[color:var(--surface)] shadow-sm"
                                          : "border-[color:var(--border)] bg-[color:var(--surface)] hover:bg-[color:var(--surface-muted)]"
                                      }`}
                                    >
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          {employee.type === "临时工" ? (
                                            <span
                                              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-600"
                                              aria-label="临时工标记"
                                              title="临时工标记"
                                            >
                                              <Clock3 className="h-2.5 w-2.5" />
                                            </span>
                                          ) : null}
                                          {employee.tags && employee.tags.length > 0 ? (
                                            <span className="group relative inline-flex min-w-0">
                                              <span className="truncate text-[11px] font-medium text-emerald-600">
                                                {employee.name}
                                              </span>
                                              <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 w-max max-w-44 translate-y-1 rounded-md border border-emerald-200 bg-white px-2 py-1 opacity-0 shadow-sm transition duration-150 group-hover:translate-y-0 group-hover:opacity-100">
                                                <span className="block text-[9px] font-medium text-emerald-700">
                                                  标签
                                                </span>
                                                <span className="mt-1 flex flex-wrap gap-1">
                                                  {employee.tags.map((tag) => (
                                                    <span
                                                      key={tag}
                                                      className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-px text-[9px] leading-none text-emerald-700"
                                                    >
                                                      {tag}
                                                    </span>
                                                  ))}
                                                </span>
                                              </span>
                                            </span>
                                          ) : (
                                            <span className="truncate text-[11px] font-medium text-foreground">
                                              {employee.name}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <span
                                        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                                          isSelected
                                            ? "bg-foreground text-background"
                                            : "bg-transparent text-transparent"
                                        }`}
                                        aria-label={isSelected ? "已选" : undefined}
                                      >
                                        <Check className="h-2.5 w-2.5" />
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[color:var(--muted-foreground)]">
                    <span>已选 {formState.employeeIds.length} 位员工</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3 w-3 text-amber-500" />
                      临时工以图标标记
                    </span>
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-3">
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

                    <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs text-[color:var(--muted-foreground)]">
                      <div>当前员工</div>
                      <div className="mt-1 text-sm text-foreground">
                        {selectedEmployeeSummary || "未选择员工"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <span>选择日期</span>
                        <p className="mt-0.5 text-[10px] text-[color:var(--muted-foreground)]">
                          按当前月份展示，可一次性选择多个日期。
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPickerMonth((prev) => shiftMonthKey(prev, -1))}
                          className="text-[10px] text-[color:var(--muted-foreground)] hover:text-foreground"
                        >
                          上月
                        </button>
                        <span className="text-[10px] text-foreground">
                          {formatMonthLabel(pickerMonth)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPickerMonth((prev) => shiftMonthKey(prev, 1))}
                          className="text-[10px] text-[color:var(--muted-foreground)] hover:text-foreground"
                        >
                          下月
                        </button>
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
                    </div>
                    <div className="max-h-[26rem] overflow-y-auto rounded-md border border-[color:var(--border)] bg-transparent p-2">
                      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] text-[color:var(--muted-foreground)]">
                        {["一", "二", "三", "四", "五", "六", "日"].map(
                          (label) => (
                            <div key={label}>{label}</div>
                          ),
                        )}
                      </div>
                      <div className="grid grid-cols-7 gap-1 place-items-center">
                        {pickerCalendarCells.map((cell, index) => {
                          if (!cell) {
                            return (
                              <div
                                key={`empty-${index}`}
                                className="h-7 w-7"
                              />
                            );
                          }

                          const isSelected = formState.dates.includes(
                            cell.dateKey,
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
                                        (d) => d !== cell.dateKey,
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
                    {selectedDateList.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {selectedDateList.map((date) => (
                          <span
                            key={date}
                            className="inline-flex items-center rounded-full border border-[color:var(--border)] px-1.5 py-px text-[10px] text-foreground"
                          >
                            {date}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
                备注
                <input
                  value={formState.remark}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      remark: event.target.value,
                    }))
                  }
                  maxLength={100}
                  className="h-9 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
                />
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
