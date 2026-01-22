"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import { apiJson } from "../lib/api";
import { useNotice } from "../components/NoticeProvider";

type EmployeeType = "正式工" | "临时工";

type Employee = {
  id: string;
  name: string;
  type: EmployeeType;
};

type SummaryItem = {
  date?: string;
  work_date?: string;
  headcount?: number;
  headCount?: number;
  normal_hours?: number;
  normalHours?: number;
  overtime_hours?: number;
  overtimeHours?: number;
  total_hours?: number;
  totalHours?: number;
  total_work_units?: number;
  totalWorkUnits?: number;
};

type SummaryDaily = {
  date: string;
  headcount: number;
  normalHours: number;
  overtimeHours: number;
  totalHours: number;
  totalWorkUnits: number;
};

type TimeEntry = {
  id: string;
  employeeName: string;
  employeeType: string;
  workType?: string;
  normalHours: number;
  overtimeHours: number;
  totalHours: number;
  workUnits: number;
  remark?: string;
};

type Project = {
  id: string;
  name: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
};

const CHART_WIDTH = 140;
const CHART_HEIGHT = 72;
const CHART_PADDING = 4;
const CHART_LABEL_SPACE = 10;
const CHART_PLOT_HEIGHT = CHART_HEIGHT - CHART_LABEL_SPACE;

const employeeTypes: EmployeeType[] = ["正式工", "临时工"];

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

function formatWorkUnits(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
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

function normalizeProject(item: Record<string, unknown>): Project | null {
  const id = String(item.id ?? "");
  const name = String(item.name ?? "");
  if (!id || !name) {
    return null;
  }
  const plannedStartDate = item.planned_start_date ?? item.plannedStartDate ?? "";
  const plannedEndDate = item.planned_end_date ?? item.plannedEndDate ?? "";
  return {
    id,
    name,
    plannedStartDate: plannedStartDate ? String(plannedStartDate) : undefined,
    plannedEndDate: plannedEndDate ? String(plannedEndDate) : undefined,
  };
}

function normalizeSummary(item: SummaryItem): SummaryDaily | null {
  const date = item.date ?? item.work_date;
  if (!date) {
    return null;
  }
  const normalHours = Number(item.normal_hours ?? item.normalHours ?? 0);
  const overtimeHours = Number(item.overtime_hours ?? item.overtimeHours ?? 0);
  const totalHours = Number(
    item.total_hours ?? item.totalHours ?? normalHours + overtimeHours,
  );
  const headcount = Number(item.headcount ?? item.headCount ?? 0);
  const totalWorkUnitsRaw = item.total_work_units ?? item.totalWorkUnits;
  const totalWorkUnits =
    totalWorkUnitsRaw === undefined || totalWorkUnitsRaw === null
      ? normalHours / 8 + overtimeHours / 6
      : Number(totalWorkUnitsRaw);
  return {
    date,
    headcount,
    normalHours,
    overtimeHours,
    totalHours,
    totalWorkUnits,
  };
}

function normalizeTimeEntry(item: Record<string, unknown>): TimeEntry | null {
  const id = String(item.id ?? "");
  const employeeName = String(
    item.employee_name ?? item.employeeName ?? "",
  );
  if (!id || !employeeName) {
    return null;
  }
  const normalHours = Number(item.normal_hours ?? item.normalHours ?? 0);
  const overtimeHours = Number(item.overtime_hours ?? item.overtimeHours ?? 0);
  const totalHours = Number(
    item.total_hours ?? item.totalHours ?? normalHours + overtimeHours,
  );
  const workUnitsRaw = item.work_units ?? item.workUnits;
  const workUnits =
    workUnitsRaw === undefined || workUnitsRaw === null
      ? normalHours / 8 + overtimeHours / 6
      : Number(workUnitsRaw);
  return {
    id,
    employeeName,
    employeeType: String(item.employee_type ?? item.employeeType ?? ""),
    workType: String(item.work_type ?? item.workType ?? item.employee_work_type ?? ""),
    normalHours,
    overtimeHours,
    totalHours,
    workUnits,
    remark: item.remark ? String(item.remark) : undefined,
  };
}

function getMonthOptions(baseDate: Date, count = 24) {
  const options = [] as Array<{ value: string; label: string }>;
  for (let i = 0; i < count; i += 1) {
    const date = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
    const value = toMonthKey(date);
    options.push({
      value,
      label: `${date.getFullYear()}年${date.getMonth() + 1}月`,
    });
  }
  return options;
}

function buildLinePoints(
  values: number[],
  maxValue: number,
  chartWidth: number,
  plotHeight: number,
  padding: number,
) {
  const count = values.length;
  if (count === 0) {
    return "";
  }
  const usableWidth = Math.max(1, chartWidth - padding * 2);
  const bandWidth = usableWidth / count;
  const safeMax = Math.max(1, maxValue);
  return values
    .map((value, index) => {
      const x =
        count === 1
          ? chartWidth / 2
          : padding + index * bandWidth + bandWidth / 2;
      const ratio = value / safeMax;
      const y = plotHeight - padding - ratio * (plotHeight - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
}

function buildBarRects(
  values: number[],
  maxValue: number,
  chartWidth: number,
  plotHeight: number,
  padding: number,
) {
  const count = values.length;
  if (count === 0) {
    return [];
  }
  const usableWidth = Math.max(1, chartWidth - padding * 2);
  const bandWidth = usableWidth / count;
  const barWidth = Math.max(0.6, bandWidth * 0.6);
  const safeMax = Math.max(1, maxValue);
  return values.map((value, index) => {
    const ratio = value / safeMax;
    const height = ratio * (plotHeight - padding * 2);
    const x = padding + index * bandWidth + (bandWidth - barWidth) / 2;
    const y = plotHeight - padding - height;
    return {
      x,
      y,
      width: barWidth,
      height,
    };
  });
}

function createEmptySummary(date: string): SummaryDaily {
  return {
    date,
    headcount: 0,
    normalHours: 0,
    overtimeHours: 0,
    totalHours: 0,
    totalWorkUnits: 0,
  };
}

function parseDateOnly(value?: string): Date | null {
  if (!value) {
    return null;
  }
  const parts = value.split("-").map(Number);
  if (parts.length !== 3) {
    return null;
  }
  const [year, month, day] = parts;
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
}

function buildProjectDateMap(
  projects: Project[],
  year: number,
  month: number,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  projects.forEach((project) => {
    const startRaw = parseDateOnly(project.plannedStartDate);
    const endRaw = parseDateOnly(project.plannedEndDate);
    const fallback = startRaw ?? endRaw;
    let start = startRaw ?? fallback;
    let end = endRaw ?? fallback;
    if (!start || !end) {
      return;
    }
    if (end < start) {
      const temp = start;
      start = end;
      end = temp;
    }

    const rangeStart = start < monthStart ? monthStart : start;
    const rangeEnd = end > monthEnd ? monthEnd : end;
    if (rangeEnd < rangeStart) {
      return;
    }

    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      const dateKey = toDateKey(cursor);
      const existing = map.get(dateKey);
      if (existing) {
        existing.push(project.name);
      } else {
        map.set(dateKey, [project.name]);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  return map;
}

export default function ReportsPage() {
  const [today] = useState(() => new Date());
  const todayKey = toDateKey(today);
  const monthOptions = useMemo(() => getMonthOptions(today), [today]);

  const [selectedMonth, setSelectedMonth] = useState(() => toMonthKey(today));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedEmployeeType, setSelectedEmployeeType] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [summaryList, setSummaryList] = useState<SummaryDaily[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [projectTooltip, setProjectTooltip] = useState<{
    names: string[];
    x: number;
    y: number;
  } | null>(null);
  const [dayDetail, setDayDetail] = useState<{
    date: string;
    entries: TimeEntry[];
    loading: boolean;
  } | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const { notify } = useNotice();

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    loadSummary();
  }, [selectedMonth, selectedEmployeeId, selectedEmployeeType]);

  useEffect(() => {
    loadProjects();
  }, [selectedMonth]);

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

  async function loadSummary() {
    try {
      setIsLoading(true);
      const query = buildQuery({
        month: selectedMonth,
        employee_id: selectedEmployeeId || undefined,
        employee_type: selectedEmployeeType || undefined,
      });
      const payload = await apiJson(`/api/time-entries/summary${query}`);
      const list = extractList<SummaryItem>(payload)
        .map(normalizeSummary)
        .filter((item): item is SummaryDaily => Boolean(item));
      setSummaryList(list);
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "加载报表失败，请稍后再试。";
      notify(message, "error");
      setSummaryList([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function openDayDetail(date: string) {
    setDayDetail({ date, entries: [], loading: true });
    try {
      const query = buildQuery({
        date,
        page: 1,
        page_size: 200,
        sort: "hours_desc",
      });
      const payload = await apiJson(`/api/time-entries${query}`);
      const list = extractList<Record<string, unknown>>(payload)
        .map(normalizeTimeEntry)
        .filter((item): item is TimeEntry => Boolean(item));
      setDayDetail({ date, entries: list, loading: false });
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "加载当日记工失败。";
      notify(message, "error");
      setDayDetail({ date, entries: [], loading: false });
    }
  }

  const { year, month } = parseMonthKey(selectedMonth);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = new Date(year, month - 1, 1);
  const startIndex = (monthStart.getDay() + 6) % 7;
  const totalCells = Math.ceil((startIndex + daysInMonth) / 7) * 7;

  const summaryMap = useMemo(() => {
    const map = new Map<string, SummaryDaily>();
    summaryList.forEach((item) => {
      map.set(item.date, item);
    });
    return map;
  }, [summaryList]);

  const projectMap = useMemo(
    () => buildProjectDateMap(projects, year, month),
    [projects, year, month],
  );

  const dailySummaries = useMemo(() => {
    const list = [] as SummaryDaily[];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = `${year}-${pad(month)}-${pad(day)}`;
      list.push(summaryMap.get(dateKey) ?? createEmptySummary(dateKey));
    }
    return list;
  }, [daysInMonth, month, summaryMap, year]);

  const headcountValues = useMemo(
    () => dailySummaries.map((item) => item.headcount),
    [dailySummaries],
  );
  const normalValues = useMemo(
    () => dailySummaries.map((item) => item.normalHours),
    [dailySummaries],
  );
  const overtimeValues = useMemo(
    () => dailySummaries.map((item) => item.overtimeHours),
    [dailySummaries],
  );
  const maxHours = useMemo(
    () =>
      Math.max(
        1,
        ...normalValues,
        ...overtimeValues,
      ),
    [normalValues, overtimeValues],
  );
  const maxHeadcount = useMemo(
    () => Math.max(1, ...headcountValues),
    [headcountValues],
  );
  const normalLinePoints = useMemo(
    () =>
      buildLinePoints(
        normalValues,
        maxHours,
        CHART_WIDTH,
        CHART_PLOT_HEIGHT,
        CHART_PADDING,
      ),
    [maxHours, normalValues],
  );
  const overtimeLinePoints = useMemo(
    () =>
      buildLinePoints(
        overtimeValues,
        maxHours,
        CHART_WIDTH,
        CHART_PLOT_HEIGHT,
        CHART_PADDING,
      ),
    [maxHours, overtimeValues],
  );
  const headcountBars = useMemo(
    () =>
      buildBarRects(
        headcountValues,
        maxHeadcount,
        CHART_WIDTH,
        CHART_PLOT_HEIGHT,
        CHART_PADDING,
      ),
    [headcountValues, maxHeadcount],
  );
  const dayLabels = useMemo(
    () => Array.from({ length: daysInMonth }, (_, index) => String(index + 1)),
    [daysInMonth],
  );
  const chartBandWidth = useMemo(() => {
    if (daysInMonth === 0) {
      return 0;
    }
    return (CHART_WIDTH - CHART_PADDING * 2) / daysInMonth;
  }, [daysInMonth]);
  const hoverLineX =
    hoverIndex === null
      ? null
      : CHART_PADDING + hoverIndex * chartBandWidth + chartBandWidth / 2;
  const hoverLeftPercent =
    hoverIndex === null || daysInMonth === 0
      ? null
      : ((CHART_PADDING +
          (hoverIndex + 0.5) * ((CHART_WIDTH - CHART_PADDING * 2) / daysInMonth)) /
          CHART_WIDTH) *
        100;
  const hoverSummary =
    hoverIndex === null ? null : dailySummaries[hoverIndex] ?? null;
  const currentMonthLabel =
    monthOptions.find((option) => option.value === selectedMonth)?.label ??
    selectedMonth;
  const dayDetailSummary = useMemo(() => {
    if (!dayDetail) {
      return null;
    }
    const uniqueEmployees = new Set(
      dayDetail.entries.map((entry) => entry.employeeName).filter(Boolean),
    );
    const totalWorkUnits = dayDetail.entries.reduce(
      (sum, entry) => sum + entry.workUnits,
      0,
    );
    return {
      headcount: uniqueEmployees.size,
      totalWorkUnits,
    };
  }, [dayDetail]);

  const calendarCells = Array.from({ length: totalCells }, (_, index) => {
    const day = index - startIndex + 1;
    if (day < 1 || day > daysInMonth) {
      return null;
    }
    const dateKey = `${year}-${pad(month)}-${pad(day)}`;
    return { day, dateKey };
  });

  function handleChartMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!chartRef.current || daysInMonth === 0) {
      return;
    }
    const rect = chartRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const paddingPx = (CHART_PADDING / CHART_WIDTH) * rect.width;
    const usableWidth = rect.width - paddingPx * 2;
    if (usableWidth <= 0) {
      setHoverIndex(null);
      return;
    }
    if (x < paddingPx || x > rect.width - paddingPx) {
      setHoverIndex(null);
      return;
    }
    const index = Math.min(
      daysInMonth - 1,
      Math.max(0, Math.floor((x - paddingPx) / (usableWidth / daysInMonth))),
    );
    setHoverIndex(index);
  }

  function handleChartLeave() {
    setHoverIndex(null);
  }

  function handleCellHover(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const overlay = target.querySelector(".raster-sweep");
    if (!overlay) {
      return;
    }
    target.classList.remove("is-sweeping");
    void target.offsetWidth;
    target.classList.add("is-sweeping");
    overlay.addEventListener(
      "animationend",
      () => {
        target.classList.remove("is-sweeping");
      },
      { once: true },
    );
  }

  function showProjectTooltip(
    event: React.MouseEvent<HTMLSpanElement>,
    names: string[],
  ) {
    const rect = event.currentTarget.getBoundingClientRect();
    const tooltipWidth = 192;
    const gap = 6;
    const maxLeft = window.innerWidth - tooltipWidth - 8;
    const left = Math.max(8, Math.min(rect.left, maxLeft));
    const top = rect.bottom + gap;
    setProjectTooltip({ names, x: left, y: top });
  }

  function hideProjectTooltip() {
    setProjectTooltip(null);
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">工时总览</h1>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          一页掌握当月工时结构与出勤趋势，支持按员工与类型筛选。
        </p>
      </div>

      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
            月份
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="h-8 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
            员工
            <select
              value={selectedEmployeeId}
              onChange={(event) => setSelectedEmployeeId(event.target.value)}
              className="h-8 min-w-[180px] rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
              disabled={employees.length === 0}
            >
              {employees.length === 0 ? (
                <option value="">暂无员工</option>
              ) : (
                <>
                  <option value="">全部员工</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
            员工类型
            <select
              value={selectedEmployeeType}
              onChange={(event) => setSelectedEmployeeType(event.target.value)}
              className="h-8 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
            >
              <option value="">全部类型</option>
              {employeeTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">工时趋势图</p>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              {currentMonthLabel} · 人数/小时
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--muted-foreground)]">
            <span className="flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: "#94a3b8" }}
              />
              人数
            </span>
            <span className="flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: "#2563eb" }}
              />
              正常班次
            </span>
            <span className="flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: "#f97316" }}
              />
              加班班次
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-xs text-[color:var(--muted-foreground)]">
            数据加载中...
          </div>
        ) : (
          <div
            ref={chartRef}
            className="relative mt-4"
            onMouseMove={handleChartMove}
            onMouseLeave={handleChartLeave}
          >
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              className="h-36 w-full text-foreground"
              preserveAspectRatio="none"
              role="img"
              aria-label="当月工时与人数趋势图"
            >
              <line
                x1={CHART_PADDING}
                y1={CHART_PLOT_HEIGHT - CHART_PADDING}
                x2={CHART_WIDTH - CHART_PADDING}
                y2={CHART_PLOT_HEIGHT - CHART_PADDING}
                stroke="currentColor"
                strokeOpacity="0.15"
                strokeWidth="0.6"
                vectorEffect="non-scaling-stroke"
              />
              {headcountBars.map((bar, index) => (
                <rect
                  key={`bar-${index}`}
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  fill="#94a3b8"
                  fillOpacity="0.35"
                />
              ))}
              <polyline
                fill="none"
                stroke="#2563eb"
                strokeWidth="1.6"
                vectorEffect="non-scaling-stroke"
                points={normalLinePoints}
              />
              <polyline
                fill="none"
                stroke="#f97316"
                strokeWidth="1.6"
                vectorEffect="non-scaling-stroke"
                points={overtimeLinePoints}
              />
              {hoverLineX !== null ? (
                <line
                  x1={hoverLineX}
                  y1={CHART_PADDING}
                  x2={hoverLineX}
                  y2={CHART_PLOT_HEIGHT - CHART_PADDING}
                  stroke="currentColor"
                  strokeOpacity="0.25"
                  strokeWidth="0.6"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
            {hoverSummary && hoverLeftPercent !== null ? (
              <div
                className="pointer-events-none absolute top-0 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-[10px] text-foreground shadow-sm"
                style={{
                  left: `${hoverLeftPercent}%`,
                  transform: "translate(-50%, -110%)",
                  minWidth: "120px",
                }}
              >
                <div className="text-[11px] font-semibold">
                  {hoverSummary.date}
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-[color:var(--muted-foreground)]">
                  <span>人数 {hoverSummary.headcount}人</span>
                  <span>总工时 {formatHours(hoverSummary.totalHours)}h</span>
                  <span>正常 {formatHours(hoverSummary.normalHours)}h</span>
                  <span>加班 {formatHours(hoverSummary.overtimeHours)}h</span>
                  <span>工数 {formatWorkUnits(hoverSummary.totalWorkUnits)}工</span>
                </div>
              </div>
            ) : null}
            <div
              className="mt-1 grid text-center text-[10px] leading-none text-[color:var(--muted-foreground)]"
              style={{
                gridTemplateColumns: `repeat(${dayLabels.length}, minmax(0, 1fr))`,
                paddingLeft: `${(CHART_PADDING / CHART_WIDTH) * 100}%`,
                paddingRight: `${(CHART_PADDING / CHART_WIDTH) * 100}%`,
              }}
            >
              {dayLabels.map((label) => (
                <span key={`day-${label}`}>{label}</span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[color:var(--muted-foreground)]">
              <span>最大人数 {maxHeadcount}人</span>
              <span>最大小时 {formatHours(maxHours)}h</span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">当月日历</p>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              每天展示项目与工数，超过两个项目可通过 ... 查看更多。
            </p>
          </div>
          <span className="text-xs text-[color:var(--muted-foreground)]">
            共 {daysInMonth} 天
          </span>
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
                <div key={`empty-${index}`} className="min-h-[96px]" />
              );
            }
            const summary =
              summaryMap.get(cell.dateKey) ?? createEmptySummary(cell.dateKey);
            const projectNames = projectMap.get(cell.dateKey) ?? [];
            const visibleProjects = projectNames.slice(0, 2);
            const remainingProjects = projectNames.slice(2);
            const isToday = cell.dateKey === todayKey;
            const isEmpty =
              summary.headcount === 0 && summary.totalWorkUnits === 0;
            return (
              <div
                key={cell.dateKey}
                className={`calendar-cell relative min-h-[96px] overflow-hidden rounded-lg border border-[color:var(--border)] p-2 text-xs transition hover:-translate-y-0.5 hover:shadow-md ${
                  isEmpty
                    ? "bg-[color:var(--empty-cell-bg)] text-[color:var(--muted-foreground)]"
                    : "text-foreground"
                } ${isToday ? "ring-1 ring-[color:var(--foreground)]/20" : ""}`}
                onMouseEnter={handleCellHover}
              >
                <div className="raster-sweep pointer-events-none absolute inset-0 opacity-0" />
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm font-semibold ${
                      isEmpty
                        ? "text-[color:var(--muted-foreground)]"
                        : "text-foreground"
                    }`}
                  >
                    {cell.day}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[color:var(--muted-foreground)]">
                      {summary.headcount}人 / {formatWorkUnits(summary.totalWorkUnits)}工
                    </span>
                    <button
                      type="button"
                      onClick={() => openDayDetail(cell.dateKey)}
                      className="flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--border)] text-[10px] text-[color:var(--muted-foreground)] hover:text-foreground"
                      aria-label="查看当日记工详情"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="mt-1 space-y-1 text-[10px] text-[color:var(--muted-foreground)]">
                  {visibleProjects.map((name, index) => {
                    const isLast = index === visibleProjects.length - 1;
                    return (
                      <div key={name} className="flex items-center gap-1">
                        <span className="truncate">{name}</span>
                        {isLast && remainingProjects.length > 0 ? (
                          <span
                            className="shrink-0 whitespace-nowrap text-[10px] text-[color:var(--muted-foreground)]"
                            onMouseEnter={(event) =>
                              showProjectTooltip(event, projectNames)
                            }
                            onMouseLeave={hideProjectTooltip}
                          >
                            ...+{remainingProjects.length}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {projectTooltip ? (
          <div
            className="pointer-events-none fixed z-50 w-48 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-2 text-[10px] text-foreground shadow-sm"
            style={{ left: projectTooltip.x, top: projectTooltip.y }}
          >
            <div className="text-[10px] text-[color:var(--muted-foreground)]">
              全部项目
            </div>
            <div className="mt-1 space-y-1 text-[10px] text-foreground">
              {projectTooltip.names.map((projectName, idx) => (
                <div key={`${projectName}-${idx}`} className="truncate">
                  {projectName}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {dayDetail ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">当日记工详情</h3>
                <p className="text-xs text-[color:var(--muted-foreground)]">
                  {dayDetail.date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDayDetail(null)}
                className="text-xs text-[color:var(--muted-foreground)]"
              >
                关闭
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2">
                <div className="text-[10px] text-[color:var(--muted-foreground)]">
                  人员
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {dayDetail.loading
                    ? "加载中..."
                    : `${dayDetailSummary?.headcount ?? 0}人`}
                </div>
              </div>
              <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2">
                <div className="text-[10px] text-[color:var(--muted-foreground)]">
                  工数
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {dayDetail.loading
                    ? "加载中..."
                    : `${formatWorkUnits(dayDetailSummary?.totalWorkUnits ?? 0)}工`}
                </div>
              </div>
            </div>

            <div className="mt-3 max-h-72 overflow-y-auto">
              {dayDetail.loading ? (
                <div className="py-8 text-center text-xs text-[color:var(--muted-foreground)]">
                  正在加载当日记工数据...
                </div>
              ) : dayDetail.entries.length === 0 ? (
                <div className="py-8 text-center text-xs text-[color:var(--muted-foreground)]">
                  暂无记工记录
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  {dayDetail.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start justify-between gap-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">
                          {entry.employeeName} - {entry.workType || ""} -{" "}
                          {entry.employeeType || ""}
                        </div>
                        <div className="text-[10px] text-[color:var(--muted-foreground)]">
                          正常 {formatHours(entry.normalHours)}小时
                          {entry.overtimeHours > 0 ? (
                            <>
                              {" "}
                              · 加班 {formatHours(entry.overtimeHours)}小时
                            </>
                          ) : null}
                        </div>
                        {entry.remark ? (
                          <div className="mt-1 text-[10px] text-[color:var(--muted-foreground)]">
                            备注：{entry.remark}
                          </div>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-[color:var(--muted-foreground)]">
                          工数
                        </div>
                        <div className="text-sm font-semibold text-foreground">
                          {formatWorkUnits(entry.workUnits)}工
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
