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
  workType?: string;
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
  projectName?: string;
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

type WorkUnitSummaryItem = {
  project_id?: string;
  projectId?: string;
  project_name?: string;
  projectName?: string;
  employee_id?: string;
  employeeId?: string;
  employee_name?: string;
  employeeName?: string;
  work_units?: number;
  workUnits?: number;
  work_type?: string;
  workType?: string;
  tag?: string;
};

type WorkUnitSummary = {
  id: string;
  name: string;
  workUnits: number;
};

const CHART_WIDTH = 140;
const CHART_HEIGHT = 72;
const CHART_PADDING = 4;
const CHART_LABEL_SPACE = 10;
const CHART_PLOT_HEIGHT = CHART_HEIGHT - CHART_LABEL_SPACE;
const PIE_COLORS = [
  "#2563eb",
  "#f97316",
  "#16a34a",
  "#a855f7",
  "#eab308",
  "#ef4444",
  "#0ea5e9",
  "#14b8a6",
];

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
  const projectName = item.project_name ?? item.projectName ?? "";
  return {
    id,
    employeeName,
    employeeType: String(item.employee_type ?? item.employeeType ?? ""),
    workType: String(item.work_type ?? item.workType ?? item.employee_work_type ?? ""),
    projectName: projectName ? String(projectName) : undefined,
    normalHours,
    overtimeHours,
    totalHours,
    workUnits,
    remark: item.remark ? String(item.remark) : undefined,
  };
}

function normalizeProjectWorkUnits(item: WorkUnitSummaryItem): WorkUnitSummary | null {
  const projectId = item.project_id ?? item.projectId;
  const workUnits = Number(item.work_units ?? item.workUnits ?? 0);
  const name = String(item.project_name ?? item.projectName ?? "未关联项目");
  return {
    id: projectId ? String(projectId) : "unassigned",
    name,
    workUnits,
  };
}

function normalizeEmployeeWorkUnits(item: WorkUnitSummaryItem): WorkUnitSummary | null {
  const employeeId = item.employee_id ?? item.employeeId;
  const employeeName = String(item.employee_name ?? item.employeeName ?? "");
  if (!employeeId || !employeeName) {
    return null;
  }
  return {
    id: String(employeeId),
    name: employeeName,
    workUnits: Number(item.work_units ?? item.workUnits ?? 0),
  };
}

function normalizeWorkTypeWorkUnits(item: WorkUnitSummaryItem): WorkUnitSummary | null {
  const workType = String(item.work_type ?? item.workType ?? "未设置工种");
  return {
    id: workType,
    name: workType,
    workUnits: Number(item.work_units ?? item.workUnits ?? 0),
  };
}

function normalizeTagWorkUnits(item: WorkUnitSummaryItem): WorkUnitSummary | null {
  const tag = String(item.tag ?? "未设置标签");
  return {
    id: tag,
    name: tag,
    workUnits: Number(item.work_units ?? item.workUnits ?? 0),
  };
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const safeEndAngle = Math.min(endAngle, startAngle + 359.9);
  const start = polarToCartesian(cx, cy, radius, safeEndAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = safeEndAngle - startAngle <= 180 ? "0" : "1";
  return [
    `M ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    `L ${cx} ${cy} Z`,
  ].join(" ");
}

function buildPieSlices(items: WorkUnitSummary[]) {
  const total = items.reduce((sum, item) => sum + item.workUnits, 0);
  if (total <= 0) {
    return [];
  }
  let cursor = 0;
  return items.map((item, index) => {
    const startAngle = (cursor / total) * 360;
    cursor += item.workUnits;
    const endAngle = (cursor / total) * 360;
    const midAngle = (startAngle + endAngle) / 2;
    return {
      id: item.id,
      name: item.name,
      workUnits: item.workUnits,
      color: PIE_COLORS[index % PIE_COLORS.length],
      path: describeArc(60, 60, 52, startAngle, endAngle),
      midAngle,
      percent: (item.workUnits / total) * 100,
    };
  });
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
  const [selectedWorkType, setSelectedWorkType] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectWorkUnits, setProjectWorkUnits] = useState<WorkUnitSummary[]>([]);
  const [employeeWorkUnits, setEmployeeWorkUnits] = useState<WorkUnitSummary[]>([]);
  const [workTypeWorkUnits, setWorkTypeWorkUnits] = useState<WorkUnitSummary[]>([]);
  const [tagWorkUnits, setTagWorkUnits] = useState<WorkUnitSummary[]>([]);
  const [isProjectUnitsLoading, setIsProjectUnitsLoading] = useState(false);
  const [isEmployeeUnitsLoading, setIsEmployeeUnitsLoading] = useState(false);
  const [isWorkTypeUnitsLoading, setIsWorkTypeUnitsLoading] = useState(false);
  const [isTagUnitsLoading, setIsTagUnitsLoading] = useState(false);
  const [pieHover, setPieHover] = useState<{
    chart: string;
    slice: { id: string; name: string; workUnits: number; color: string; percent: number };
  } | null>(null);
  const pieTooltipRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    loadSummary();
  }, [
    selectedMonth,
    selectedEmployeeId,
    selectedEmployeeType,
    selectedWorkType,
    selectedProjectId,
  ]);

  useEffect(() => {
    loadProjectWorkUnits();
    loadEmployeeWorkUnits();
    loadWorkTypeWorkUnits();
    loadTagWorkUnits();
  }, [
    selectedMonth,
    selectedEmployeeId,
    selectedEmployeeType,
    selectedWorkType,
    selectedProjectId,
  ]);

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
        work_type: selectedWorkType || undefined,
        project_id: selectedProjectId || undefined,
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

  async function loadProjectWorkUnits() {
    try {
      setIsProjectUnitsLoading(true);
      const query = buildQuery({
        month: selectedMonth,
        employee_id: selectedEmployeeId || undefined,
        employee_type: selectedEmployeeType || undefined,
        work_type: selectedWorkType || undefined,
        project_id: selectedProjectId || undefined,
      });
      const payload = await apiJson(`/api/time-entries/summary/project-units${query}`);
      const list = extractList<WorkUnitSummaryItem>(payload)
        .map(normalizeProjectWorkUnits)
        .filter((item): item is WorkUnitSummary => Boolean(item));
      setProjectWorkUnits(list);
    } catch (error) {
      console.error(error);
      setProjectWorkUnits([]);
    } finally {
      setIsProjectUnitsLoading(false);
    }
  }

  async function loadEmployeeWorkUnits() {
    try {
      setIsEmployeeUnitsLoading(true);
      const query = buildQuery({
        month: selectedMonth,
        employee_id: selectedEmployeeId || undefined,
        employee_type: selectedEmployeeType || undefined,
        work_type: selectedWorkType || undefined,
        project_id: selectedProjectId || undefined,
      });
      const payload = await apiJson(`/api/time-entries/summary/employee-units${query}`);
      const list = extractList<WorkUnitSummaryItem>(payload)
        .map(normalizeEmployeeWorkUnits)
        .filter((item): item is WorkUnitSummary => Boolean(item));
      setEmployeeWorkUnits(list);
    } catch (error) {
      console.error(error);
      setEmployeeWorkUnits([]);
    } finally {
      setIsEmployeeUnitsLoading(false);
    }
  }

  async function loadWorkTypeWorkUnits() {
    try {
      setIsWorkTypeUnitsLoading(true);
      const query = buildQuery({
        month: selectedMonth,
        employee_id: selectedEmployeeId || undefined,
        employee_type: selectedEmployeeType || undefined,
        work_type: selectedWorkType || undefined,
        project_id: selectedProjectId || undefined,
      });
      const payload = await apiJson(`/api/time-entries/summary/worktype-units${query}`);
      const list = extractList<WorkUnitSummaryItem>(payload)
        .map(normalizeWorkTypeWorkUnits)
        .filter((item): item is WorkUnitSummary => Boolean(item));
      setWorkTypeWorkUnits(list);
    } catch (error) {
      console.error(error);
      setWorkTypeWorkUnits([]);
    } finally {
      setIsWorkTypeUnitsLoading(false);
    }
  }

  async function loadTagWorkUnits() {
    try {
      setIsTagUnitsLoading(true);
      const query = buildQuery({
        month: selectedMonth,
        employee_id: selectedEmployeeId || undefined,
        employee_type: selectedEmployeeType || undefined,
        work_type: selectedWorkType || undefined,
        project_id: selectedProjectId || undefined,
      });
      const payload = await apiJson(`/api/time-entries/summary/tag-units${query}`);
      const list = extractList<WorkUnitSummaryItem>(payload)
        .map(normalizeTagWorkUnits)
        .filter((item): item is WorkUnitSummary => Boolean(item));
      setTagWorkUnits(list);
    } catch (error) {
      console.error(error);
      setTagWorkUnits([]);
    } finally {
      setIsTagUnitsLoading(false);
    }
  }

  async function openDayDetail(date: string) {
    setDayDetail({ date, entries: [], loading: true });
    try {
      const query = buildQuery({
        date,
        employee_id: selectedEmployeeId || undefined,
        employee_type: selectedEmployeeType || undefined,
        work_type: selectedWorkType || undefined,
        project_id: selectedProjectId || undefined,
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

  const projectMap = useMemo(() => {
    const filtered =
      selectedProjectId === ""
        ? projects
        : projects.filter((project) => project.id === selectedProjectId);
    return buildProjectDateMap(filtered, year, month);
  }, [projects, selectedProjectId, year, month]);

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
  const projectPieSlices = useMemo(
    () => buildPieSlices(projectWorkUnits),
    [projectWorkUnits],
  );
  const employeePieSlices = useMemo(
    () => buildPieSlices(employeeWorkUnits),
    [employeeWorkUnits],
  );
  const workTypePieSlices = useMemo(
    () => buildPieSlices(workTypeWorkUnits),
    [workTypeWorkUnits],
  );
  const tagPieSlices = useMemo(
    () => buildPieSlices(tagWorkUnits),
    [tagWorkUnits],
  );
  const projectTotalWorkUnits = useMemo(
    () => projectWorkUnits.reduce((sum, item) => sum + item.workUnits, 0),
    [projectWorkUnits],
  );
  const employeeTotalWorkUnits = useMemo(
    () => employeeWorkUnits.reduce((sum, item) => sum + item.workUnits, 0),
    [employeeWorkUnits],
  );
  const workTypeTotalWorkUnits = useMemo(
    () => workTypeWorkUnits.reduce((sum, item) => sum + item.workUnits, 0),
    [workTypeWorkUnits],
  );
  const tagTotalWorkUnits = useMemo(
    () => tagWorkUnits.reduce((sum, item) => sum + item.workUnits, 0),
    [tagWorkUnits],
  );

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
        <h1 className="text-2xl font-semibold">月度总览</h1>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          一页掌握当月工时结构与出勤趋势，支持按员工与类型筛选。
          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className="ml-2 inline-flex items-center gap-1 rounded-md border border-[color:var(--border)] px-2 py-0.5 text-[11px] text-foreground hover:bg-[color:var(--surface-muted)]"
          >
            高级筛选
          </button>
        </p>
      </div>

      {showFilters ? (
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
            <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
              工种
              <select
                value={selectedWorkType}
                onChange={(event) => setSelectedWorkType(event.target.value)}
                className="h-8 rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
              >
                <option value="">全部工种</option>
                {workTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
              项目
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                className="h-8 min-w-[180px] rounded-md border border-[color:var(--border)] bg-transparent px-2 text-sm text-foreground"
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
          </div>
        </div>
      ) : null}

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
          <div className="mt-4 flex min-h-[190px] items-center justify-center text-xs text-[color:var(--muted-foreground)]">
            <div className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-foreground" />
              <span>加载中</span>
            </div>
          </div>
        ) : (
          <div
            ref={chartRef}
            className="relative mt-4 min-h-[190px]"
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
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">项目</p>
            <span className="rounded-full bg-[color:var(--surface-muted)] px-2 py-0.5 text-[10px] text-[color:var(--muted-foreground)]">
              {projectWorkUnits.length} 个项目
            </span>
          </div>
          {isProjectUnitsLoading ? (
            <div className="mt-4 flex items-center justify-center py-8 text-xs text-[color:var(--muted-foreground)]">
              <div className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-foreground" />
                <span>加载中</span>
              </div>
            </div>
          ) : projectPieSlices.length === 0 ? (
            <div className="mt-4 py-8 text-center text-xs text-[color:var(--muted-foreground)]">
              暂无数据
            </div>
          ) : (
            <div
              className="mt-4 flex items-center justify-center"
              onMouseMove={(e) => {
                if (pieTooltipRef.current) {
                  pieTooltipRef.current.style.left = `${e.clientX + 12}px`;
                  pieTooltipRef.current.style.top = `${e.clientY + 12}px`;
                }
              }}
            >
              <svg viewBox="0 0 240 140" className="h-44 w-full max-w-[280px]" role="img" aria-label="项目工数饼图">
                <g transform="translate(70, 10)">
                  {projectPieSlices.map((slice, index) => {
                    const isHovered = pieHover?.chart === "project" && pieHover?.slice.id === slice.id;
                    return (
                      <path
                        key={slice.id}
                        d={slice.path}
                        fill={slice.color}
                        className="cursor-pointer transition-transform duration-150"
                        style={{
                          transform: isHovered ? "scale(1.06)" : "scale(1)",
                          transformOrigin: "60px 60px",
                        }}
                        onMouseEnter={() => {
                          setPieHover({
                            chart: "project",
                            slice: { id: slice.id, name: slice.name, workUnits: slice.workUnits, color: slice.color, percent: slice.percent },
                          });
                        }}
                        onMouseLeave={() => setPieHover(null)}
                      />
                    );
                  })}
                  {projectPieSlices.slice(0, 10).map((slice) => {
                    const rad = ((slice.midAngle - 90) * Math.PI) / 180;
                    const innerX = 60 + 54 * Math.cos(rad);
                    const innerY = 60 + 54 * Math.sin(rad);
                    const outerX = 60 + 68 * Math.cos(rad);
                    const outerY = 60 + 68 * Math.sin(rad);
                    const isRight = outerX > 60;
                    const labelX = isRight ? outerX + 4 : outerX - 4;
                    return (
                      <g key={`label-${slice.id}`}>
                        <line x1={innerX} y1={innerY} x2={outerX} y2={outerY} stroke={slice.color} strokeWidth="1" />
                        <line x1={outerX} y1={outerY} x2={labelX} y2={outerY} stroke={slice.color} strokeWidth="1" />
                        <text x={labelX + (isRight ? 2 : -2)} y={outerY - 2} fontSize="9" fill="currentColor" textAnchor={isRight ? "start" : "end"}>
                          {slice.name.length > 5 ? slice.name.slice(0, 5) + "…" : slice.name}
                        </text>
                        <text x={labelX + (isRight ? 2 : -2)} y={outerY + 8} fontSize="8" fill="currentColor" opacity="0.6" textAnchor={isRight ? "start" : "end"}>
                          {slice.percent.toFixed(0)}%
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">员工</p>
            <span className="rounded-full bg-[color:var(--surface-muted)] px-2 py-0.5 text-[10px] text-[color:var(--muted-foreground)]">
              {employeeWorkUnits.length} 人
            </span>
          </div>
          {isEmployeeUnitsLoading ? (
            <div className="mt-4 flex items-center justify-center py-8 text-xs text-[color:var(--muted-foreground)]">
              <div className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-foreground" />
                <span>加载中</span>
              </div>
            </div>
          ) : employeePieSlices.length === 0 ? (
            <div className="mt-4 py-8 text-center text-xs text-[color:var(--muted-foreground)]">
              暂无数据
            </div>
          ) : (
            <div
              className="mt-4 flex items-center justify-center"
              onMouseMove={(e) => {
                if (pieTooltipRef.current) {
                  pieTooltipRef.current.style.left = `${e.clientX + 12}px`;
                  pieTooltipRef.current.style.top = `${e.clientY + 12}px`;
                }
              }}
            >
              <svg viewBox="0 0 240 140" className="h-44 w-full max-w-[280px]" role="img" aria-label="员工工数饼图">
                <g transform="translate(70, 10)">
                  {employeePieSlices.map((slice) => {
                    const isHovered = pieHover?.chart === "employee" && pieHover?.slice.id === slice.id;
                    return (
                      <path
                        key={slice.id}
                        d={slice.path}
                        fill={slice.color}
                        className="cursor-pointer transition-transform duration-150"
                        style={{
                          transform: isHovered ? "scale(1.06)" : "scale(1)",
                          transformOrigin: "60px 60px",
                        }}
                        onMouseEnter={() => {
                          setPieHover({
                            chart: "employee",
                            slice: { id: slice.id, name: slice.name, workUnits: slice.workUnits, color: slice.color, percent: slice.percent },
                          });
                        }}
                        onMouseLeave={() => setPieHover(null)}
                      />
                    );
                  })}
                  {employeePieSlices.slice(0, 10).map((slice) => {
                    const rad = ((slice.midAngle - 90) * Math.PI) / 180;
                    const innerX = 60 + 54 * Math.cos(rad);
                    const innerY = 60 + 54 * Math.sin(rad);
                    const outerX = 60 + 68 * Math.cos(rad);
                    const outerY = 60 + 68 * Math.sin(rad);
                    const isRight = outerX > 60;
                    const labelX = isRight ? outerX + 4 : outerX - 4;
                    return (
                      <g key={`label-${slice.id}`}>
                        <line x1={innerX} y1={innerY} x2={outerX} y2={outerY} stroke={slice.color} strokeWidth="1" />
                        <line x1={outerX} y1={outerY} x2={labelX} y2={outerY} stroke={slice.color} strokeWidth="1" />
                        <text x={labelX + (isRight ? 2 : -2)} y={outerY - 2} fontSize="9" fill="currentColor" textAnchor={isRight ? "start" : "end"}>
                          {slice.name.length > 5 ? slice.name.slice(0, 5) + "…" : slice.name}
                        </text>
                        <text x={labelX + (isRight ? 2 : -2)} y={outerY + 8} fontSize="8" fill="currentColor" opacity="0.6" textAnchor={isRight ? "start" : "end"}>
                          {slice.percent.toFixed(0)}%
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">工种</p>
            <span className="rounded-full bg-[color:var(--surface-muted)] px-2 py-0.5 text-[10px] text-[color:var(--muted-foreground)]">
              {workTypeWorkUnits.length} 个工种
            </span>
          </div>
          {isWorkTypeUnitsLoading ? (
            <div className="mt-4 flex items-center justify-center py-8 text-xs text-[color:var(--muted-foreground)]">
              <div className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-foreground" />
                <span>加载中</span>
              </div>
            </div>
          ) : workTypePieSlices.length === 0 ? (
            <div className="mt-4 py-8 text-center text-xs text-[color:var(--muted-foreground)]">
              暂无数据
            </div>
          ) : (
            <div
              className="mt-4 flex items-center justify-center"
              onMouseMove={(e) => {
                if (pieTooltipRef.current) {
                  pieTooltipRef.current.style.left = `${e.clientX + 12}px`;
                  pieTooltipRef.current.style.top = `${e.clientY + 12}px`;
                }
              }}
            >
              <svg viewBox="0 0 240 140" className="h-44 w-full max-w-[280px]" role="img" aria-label="工种工数饼图">
                <g transform="translate(70, 10)">
                  {workTypePieSlices.map((slice) => {
                    const isHovered = pieHover?.chart === "workType" && pieHover?.slice.id === slice.id;
                    return (
                      <path
                        key={slice.id}
                        d={slice.path}
                        fill={slice.color}
                        className="cursor-pointer transition-transform duration-150"
                        style={{
                          transform: isHovered ? "scale(1.06)" : "scale(1)",
                          transformOrigin: "60px 60px",
                        }}
                        onMouseEnter={() => {
                          setPieHover({
                            chart: "workType",
                            slice: { id: slice.id, name: slice.name, workUnits: slice.workUnits, color: slice.color, percent: slice.percent },
                          });
                        }}
                        onMouseLeave={() => setPieHover(null)}
                      />
                    );
                  })}
                  {workTypePieSlices.slice(0, 10).map((slice) => {
                    const rad = ((slice.midAngle - 90) * Math.PI) / 180;
                    const innerX = 60 + 54 * Math.cos(rad);
                    const innerY = 60 + 54 * Math.sin(rad);
                    const outerX = 60 + 68 * Math.cos(rad);
                    const outerY = 60 + 68 * Math.sin(rad);
                    const isRight = outerX > 60;
                    const labelX = isRight ? outerX + 4 : outerX - 4;
                    return (
                      <g key={`label-${slice.id}`}>
                        <line x1={innerX} y1={innerY} x2={outerX} y2={outerY} stroke={slice.color} strokeWidth="1" />
                        <line x1={outerX} y1={outerY} x2={labelX} y2={outerY} stroke={slice.color} strokeWidth="1" />
                        <text x={labelX + (isRight ? 2 : -2)} y={outerY - 2} fontSize="9" fill="currentColor" textAnchor={isRight ? "start" : "end"}>
                          {slice.name.length > 5 ? slice.name.slice(0, 5) + "…" : slice.name}
                        </text>
                        <text x={labelX + (isRight ? 2 : -2)} y={outerY + 8} fontSize="8" fill="currentColor" opacity="0.6" textAnchor={isRight ? "start" : "end"}>
                          {slice.percent.toFixed(0)}%
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">标签</p>
            <span className="rounded-full bg-[color:var(--surface-muted)] px-2 py-0.5 text-[10px] text-[color:var(--muted-foreground)]">
              {tagWorkUnits.length} 个标签
            </span>
          </div>
          {isTagUnitsLoading ? (
            <div className="mt-4 flex items-center justify-center py-8 text-xs text-[color:var(--muted-foreground)]">
              <div className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-foreground" />
                <span>加载中</span>
              </div>
            </div>
          ) : tagPieSlices.length === 0 ? (
            <div className="mt-4 py-8 text-center text-xs text-[color:var(--muted-foreground)]">
              暂无数据
            </div>
          ) : (
            <div
              className="mt-4 flex items-center justify-center"
              onMouseMove={(e) => {
                if (pieTooltipRef.current) {
                  pieTooltipRef.current.style.left = `${e.clientX + 12}px`;
                  pieTooltipRef.current.style.top = `${e.clientY + 12}px`;
                }
              }}
            >
              <svg viewBox="0 0 240 140" className="h-44 w-full max-w-[280px]" role="img" aria-label="标签工数饼图">
                <g transform="translate(70, 10)">
                  {tagPieSlices.map((slice) => {
                    const isHovered = pieHover?.chart === "tag" && pieHover?.slice.id === slice.id;
                    return (
                      <path
                        key={slice.id}
                        d={slice.path}
                        fill={slice.color}
                        className="cursor-pointer transition-transform duration-150"
                        style={{
                          transform: isHovered ? "scale(1.06)" : "scale(1)",
                          transformOrigin: "60px 60px",
                        }}
                        onMouseEnter={() => {
                          setPieHover({
                            chart: "tag",
                            slice: { id: slice.id, name: slice.name, workUnits: slice.workUnits, color: slice.color, percent: slice.percent },
                          });
                        }}
                        onMouseLeave={() => setPieHover(null)}
                      />
                    );
                  })}
                  {tagPieSlices.slice(0, 10).map((slice) => {
                    const rad = ((slice.midAngle - 90) * Math.PI) / 180;
                    const innerX = 60 + 54 * Math.cos(rad);
                    const innerY = 60 + 54 * Math.sin(rad);
                    const outerX = 60 + 68 * Math.cos(rad);
                    const outerY = 60 + 68 * Math.sin(rad);
                    const isRight = outerX > 60;
                    const labelX = isRight ? outerX + 4 : outerX - 4;
                    return (
                      <g key={`label-${slice.id}`}>
                        <line x1={innerX} y1={innerY} x2={outerX} y2={outerY} stroke={slice.color} strokeWidth="1" />
                        <line x1={outerX} y1={outerY} x2={labelX} y2={outerY} stroke={slice.color} strokeWidth="1" />
                        <text x={labelX + (isRight ? 2 : -2)} y={outerY - 2} fontSize="9" fill="currentColor" textAnchor={isRight ? "start" : "end"}>
                          {slice.name.length > 5 ? slice.name.slice(0, 5) + "…" : slice.name}
                        </text>
                        <text x={labelX + (isRight ? 2 : -2)} y={outerY + 8} fontSize="8" fill="currentColor" opacity="0.6" textAnchor={isRight ? "start" : "end"}>
                          {slice.percent.toFixed(0)}%
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>
          )}
        </div>
      </div>

      {pieHover ? (
        <div
          ref={pieTooltipRef}
          className="pointer-events-none fixed z-[100] rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs shadow-lg"
          style={{ left: 0, top: 0 }}
        >
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: pieHover.slice.color }} />
            <span className="font-medium text-foreground">{pieHover.slice.name}</span>
          </div>
          <div className="mt-1 text-[color:var(--muted-foreground)]">
            工数: {formatWorkUnits(pieHover.slice.workUnits)} 工 · {pieHover.slice.percent.toFixed(1)}%
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">日历看板</p>
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
                  {dayDetail.loading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-foreground" />
                      <span>加载中</span>
                    </span>
                  ) : (
                    `${dayDetailSummary?.headcount ?? 0}人`
                  )}
                </div>
              </div>
              <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2">
                <div className="text-[10px] text-[color:var(--muted-foreground)]">
                  工数
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {dayDetail.loading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-foreground" />
                      <span>加载中</span>
                    </span>
                  ) : (
                    `${formatWorkUnits(dayDetailSummary?.totalWorkUnits ?? 0)}工`
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 max-h-72 overflow-y-auto">
              {dayDetail.loading ? (
                <div className="py-8 text-center text-xs text-[color:var(--muted-foreground)]">
                  <div className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-foreground" />
                    <span>加载中</span>
                  </div>
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
                          {entry.projectName ? ` - ${entry.projectName}` : ""}
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
