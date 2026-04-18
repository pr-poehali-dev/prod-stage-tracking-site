import { useState, useMemo } from "react";
import Icon from "@/components/ui/icon";

// ─── Types ───────────────────────────────────────────────────────────────────

type Status = "new" | "in-progress" | "completed" | "paused" | "rejected";
type OperationType = "Токарная" | "Фрезерная" | "Сварка" | "Сборка" | "Контроль" | "Покраска";

interface Part {
  id: string;
  name: string;
  article: string;
  status: Status;
  operation: OperationType;
  stage: number;
  startDate: string;
  deadline: string;
  quantity: number;
  executor: string;
}

interface Stage {
  id: number;
  name: string;
  icon: string;
  totalParts: number;
  completed: number;
  inProgress: number;
  avgTime: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_PARTS: Part[] = [
  { id: "П-001", name: "Вал приводной", article: "15-ВАЛ-К88", status: "in-progress", operation: "Токарная", stage: 2, startDate: "15.04.2026", deadline: "20.04.2026", quantity: 12, executor: "Петров А.Н." },
  { id: "П-002", name: "Корпус редуктора", article: "22-КОР-М44", status: "new", operation: "Фрезерная", stage: 1, startDate: "18.04.2026", deadline: "25.04.2026", quantity: 4, executor: "Иванов К.С." },
  { id: "П-003", name: "Фланец стальной", article: "08-ФЛ-А21", status: "completed", operation: "Контроль", stage: 5, startDate: "10.04.2026", deadline: "17.04.2026", quantity: 30, executor: "Сидоров П.В." },
  { id: "П-004", name: "Шестерня коническая", article: "33-ШЕС-В07", status: "paused", operation: "Фрезерная", stage: 2, startDate: "12.04.2026", deadline: "22.04.2026", quantity: 8, executor: "Козлов Д.Е." },
  { id: "П-005", name: "Втулка направляющая", article: "11-ВТУ-Л59", status: "in-progress", operation: "Токарная", stage: 3, startDate: "14.04.2026", deadline: "19.04.2026", quantity: 50, executor: "Новиков Р.А." },
  { id: "П-006", name: "Крышка подшипника", article: "17-КРЫ-П33", status: "rejected", operation: "Сборка", stage: 4, startDate: "11.04.2026", deadline: "16.04.2026", quantity: 6, executor: "Морозов Е.В." },
  { id: "П-007", name: "Болт крепёжный М16", article: "04-БОЛ-М16", status: "completed", operation: "Покраска", stage: 6, startDate: "08.04.2026", deadline: "15.04.2026", quantity: 200, executor: "Соколов И.Н." },
  { id: "П-008", name: "Плита опорная", article: "55-ПЛИ-О99", status: "in-progress", operation: "Сварка", stage: 2, startDate: "16.04.2026", deadline: "23.04.2026", quantity: 2, executor: "Волков М.Д." },
  { id: "П-009", name: "Зубчатое колесо", article: "28-ЗУБ-К44", status: "new", operation: "Фрезерная", stage: 1, startDate: "18.04.2026", deadline: "28.04.2026", quantity: 3, executor: "Алексеев С.Г." },
  { id: "П-010", name: "Муфта соединительная", article: "41-МУФ-С22", status: "in-progress", operation: "Сборка", stage: 4, startDate: "13.04.2026", deadline: "21.04.2026", quantity: 7, executor: "Лебедев Д.К." },
];

const MOCK_STAGES: Stage[] = [
  { id: 1, name: "Заготовка", icon: "Package", totalParts: 28, completed: 18, inProgress: 10, avgTime: "1.5 дн" },
  { id: 2, name: "Механообработка", icon: "Settings2", totalParts: 42, completed: 25, inProgress: 17, avgTime: "3.2 дн" },
  { id: 3, name: "Термообработка", icon: "Flame", totalParts: 19, completed: 14, inProgress: 5, avgTime: "2.1 дн" },
  { id: 4, name: "Сборка", icon: "Layers", totalParts: 31, completed: 20, inProgress: 11, avgTime: "4.7 дн" },
  { id: 5, name: "ОТК контроль", icon: "ShieldCheck", totalParts: 25, completed: 23, inProgress: 2, avgTime: "0.8 дн" },
  { id: 6, name: "Покраска / упаковка", icon: "Paintbrush", totalParts: 22, completed: 20, inProgress: 2, avgTime: "1.2 дн" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<Status, { label: string; cls: string; bg: string }> = {
  new: { label: "Новая", cls: "status-new", bg: "bg-status-new" },
  "in-progress": { label: "В работе", cls: "status-in-progress", bg: "bg-status-in-progress" },
  completed: { label: "Завершена", cls: "status-completed", bg: "bg-status-completed" },
  paused: { label: "Приостановлена", cls: "status-paused", bg: "bg-status-paused" },
  rejected: { label: "Отклонена", cls: "status-rejected", bg: "bg-status-rejected" },
};

const OPERATIONS: OperationType[] = ["Токарная", "Фрезерная", "Сварка", "Сборка", "Контроль", "Покраска"];

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${cfg.cls} ${cfg.bg}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {cfg.label}
    </span>
  );
}

function StatCard({ value, label, icon, accent }: { value: string | number; label: string; icon: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 flex items-center gap-4 ${accent ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
      <div className={`w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 ${accent ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
        <Icon name={icon} size={20} />
      </div>
      <div>
        <div className={`text-2xl font-semibold font-mono-data ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function PartsTracker() {
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [filterOp, setFilterOp] = useState<OperationType | "all">("all");
  const [filterDate, setFilterDate] = useState<"all" | "today" | "week">("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<keyof Part>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const today = "18.04.2026";

  const filtered = useMemo(() => {
    return MOCK_PARTS
      .filter(p => {
        if (filterStatus !== "all" && p.status !== filterStatus) return false;
        if (filterOp !== "all" && p.operation !== filterOp) return false;
        if (filterDate === "today" && p.deadline !== today) return false;
        if (filterDate === "week") {
          const day = parseInt(p.deadline.split(".")[0]);
          if (day < 18 || day > 25) return false;
        }
        if (search) {
          const q = search.toLowerCase();
          if (!p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q) && !p.article.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const va = String(a[sortField]);
        const vb = String(b[sortField]);
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
  }, [filterStatus, filterOp, filterDate, search, sortField, sortDir]);

  function toggleSort(field: keyof Part) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  function SortIcon({ field }: { field: keyof Part }) {
    if (sortField !== field) return <Icon name="ChevronsUpDown" size={12} className="opacity-30" />;
    return <Icon name={sortDir === "asc" ? "ChevronUp" : "ChevronDown"} size={12} className="text-primary" />;
  }

  const activeFiltersCount = [filterStatus !== "all", filterOp !== "all", filterDate !== "all", search !== ""].filter(Boolean).length;

  return (
    <div className="animate-slide-up">
      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="SlidersHorizontal" size={15} className="text-muted-foreground" />
          <span className="text-sm font-medium">Фильтры</span>
          {activeFiltersCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-primary/20 text-primary text-xs rounded font-mono-data">{activeFiltersCount}</span>
          )}
          {activeFiltersCount > 0 && (
            <button onClick={() => { setFilterStatus("all"); setFilterOp("all"); setFilterDate("all"); setSearch(""); }}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <Icon name="X" size={12} /> Сбросить
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Поиск</label>
            <div className="relative">
              <Icon name="Search" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="ID, название, артикул..."
                className="w-full bg-background border border-border rounded pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Статус</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as Status | "all")}
              className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-primary transition-colors appearance-none cursor-pointer">
              <option value="all">Все статусы</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Тип операции</label>
            <select value={filterOp} onChange={e => setFilterOp(e.target.value as OperationType | "all")}
              className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-primary transition-colors appearance-none cursor-pointer">
              <option value="all">Все операции</option>
              {OPERATIONS.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Срок</label>
            <div className="flex gap-1">
              {[["all", "Все"], ["today", "Сегодня"], ["week", "Неделя"]].map(([v, l]) => (
                <button key={v} onClick={() => setFilterDate(v as "all" | "today" | "week")}
                  className={`flex-1 py-1.5 text-xs rounded border transition-colors ${filterDate === v
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-border/80"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">
            Найдено: <span className="font-mono-data text-foreground font-medium">{filtered.length}</span> из {MOCK_PARTS.length}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-muted-foreground">Обновлено: 18.04 14:32</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {([
                  ["id", "ID"], ["name", "Наименование"], ["article", "Артикул"],
                  ["status", "Статус"], ["operation", "Операция"], ["stage", "Этап"],
                  ["deadline", "Срок"], ["quantity", "Кол-во"], ["executor", "Исполнитель"]
                ] as [keyof Part, string][]).map(([f, l]) => (
                  <th key={f} onClick={() => toggleSort(f)}
                    className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap">
                    <span className="flex items-center gap-1">{l} <SortIcon field={f} /></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground">
                    <Icon name="SearchX" size={32} className="mx-auto mb-2 opacity-30" />
                    <div className="text-sm">Ничего не найдено</div>
                  </td>
                </tr>
              ) : filtered.map((part, i) => (
                <tr key={part.id}
                  className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${i % 2 === 0 ? "" : "bg-secondary/10"}`}
                  style={{ animationDelay: `${i * 30}ms` }}>
                  <td className="px-4 py-3 font-mono-data text-xs text-primary font-medium">{part.id}</td>
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{part.name}</td>
                  <td className="px-4 py-3 font-mono-data text-xs text-muted-foreground">{part.article}</td>
                  <td className="px-4 py-3"><StatusBadge status={part.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{part.operation}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${(part.stage / 6) * 100}%` }} />
                      </div>
                      <span className="font-mono-data text-xs text-muted-foreground">{part.stage}/6</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono-data text-xs text-muted-foreground whitespace-nowrap">{part.deadline}</td>
                  <td className="px-4 py-3 font-mono-data text-center">{part.quantity}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{part.executor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProductionStages() {
  return (
    <div className="animate-slide-up space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {MOCK_STAGES.map((stage, i) => {
          const pct = Math.round((stage.completed / stage.totalParts) * 100);
          return (
            <div key={stage.id} className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-colors"
              style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <Icon name={stage.icon} fallback="Layers" size={18} />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Этап {stage.id}</div>
                    <div className="font-semibold text-sm">{stage.name}</div>
                  </div>
                </div>
                <div className={`text-xl font-semibold font-mono-data ${pct >= 80 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-primary"}`}>
                  {pct}%
                </div>
              </div>
              <div className="w-full h-1.5 bg-secondary rounded-full mb-4 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: pct >= 80 ? "hsl(142,72%,40%)" : pct >= 50 ? "hsl(38,92%,50%)" : "hsl(var(--primary))"
                  }} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div className="font-mono-data text-sm font-medium text-foreground">{stage.totalParts}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Всего</div>
                </div>
                <div className="text-center border-x border-border">
                  <div className="font-mono-data text-sm font-medium status-in-progress">{stage.inProgress}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">В работе</div>
                </div>
                <div className="text-center">
                  <div className="font-mono-data text-sm font-medium status-completed">{stage.completed}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Готово</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Icon name="Clock" size={12} /> Среднее время
                </span>
                <span className="font-mono-data text-xs text-foreground">{stage.avgTime}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pipeline flow */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Поток производства</div>
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          {MOCK_STAGES.map((stage, i) => {
            const pct = Math.round((stage.completed / stage.totalParts) * 100);
            return (
              <div key={stage.id} className="flex items-center flex-shrink-0">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="font-mono-data text-xs text-muted-foreground">{pct}%</div>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2
                    ${pct >= 80 ? "border-green-400/60 bg-green-400/10 text-green-400" :
                      pct >= 50 ? "border-yellow-400/60 bg-yellow-400/10 text-yellow-400" :
                      "border-primary/60 bg-primary/10 text-primary"}`}>
                    {stage.id}
                  </div>
                  <div className="text-xs text-muted-foreground max-w-[72px] text-center leading-tight">{stage.name.split(" ")[0]}</div>
                </div>
                {i < MOCK_STAGES.length - 1 && (
                  <div className="w-8 h-px bg-border mx-1 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Analytics() {
  const statusCounts = useMemo(() => {
    const counts: Record<Status, number> = { new: 0, "in-progress": 0, completed: 0, paused: 0, rejected: 0 };
    MOCK_PARTS.forEach(p => counts[p.status]++);
    return counts;
  }, []);

  const opCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    MOCK_PARTS.forEach(p => { counts[p.operation] = (counts[p.operation] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, []);

  const totalParts = MOCK_PARTS.length;
  const completedRate = Math.round((statusCounts.completed / totalParts) * 100);

  const weekData = [
    { day: "Пн 14", completed: 8, started: 12 },
    { day: "Вт 15", completed: 11, started: 9 },
    { day: "Ср 16", completed: 7, started: 14 },
    { day: "Чт 17", completed: 13, started: 10 },
    { day: "Пт 18", completed: 6, started: 8 },
  ];
  const maxBar = Math.max(...weekData.map(d => Math.max(d.completed, d.started)));

  return (
    <div className="animate-slide-up space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard value={totalParts} label="Всего деталей" icon="Package" />
        <StatCard value={statusCounts["in-progress"]} label="В производстве" icon="Cpu" accent />
        <StatCard value={`${completedRate}%`} label="Выполнено" icon="TrendingUp" />
        <StatCard value={statusCounts.rejected} label="Отклонено" icon="AlertCircle" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bar chart — weekly */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold">Операции за неделю</div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" /> Завершено</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-secondary inline-block border border-border" /> Начато</span>
            </div>
          </div>
          <div className="flex items-end gap-3 h-36">
            {weekData.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end gap-0.5 h-28">
                  <div className="flex-1 bg-primary/80 rounded-t transition-all"
                    style={{ height: `${(d.completed / maxBar) * 100}%` }} />
                  <div className="flex-1 bg-secondary border border-border rounded-t transition-all"
                    style={{ height: `${(d.started / maxBar) * 100}%` }} />
                </div>
                <div className="text-xs text-muted-foreground font-mono-data whitespace-nowrap">{d.day}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Status distribution */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-sm font-semibold mb-4">Распределение по статусам</div>
          <div className="space-y-2.5">
            {Object.entries(STATUS_CONFIG).map(([k, v]) => {
              const count = statusCounts[k as Status];
              const pct = Math.round((count / totalParts) * 100);
              return (
                <div key={k}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${v.cls}`}>{v.label}</span>
                    <span className="font-mono-data text-xs text-muted-foreground">{count} / {pct}%</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${v.cls.replace("status-", "bg-[hsl(var(--status-")}`}
                      style={{ width: `${pct}%`, background: "currentColor", color: "currentColor" }}>
                      <div className={`h-full w-full rounded-full ${v.cls}`}
                        style={{ background: "currentColor", opacity: 0.7 }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Operations breakdown */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-sm font-semibold mb-4">Операции по типам</div>
          <div className="space-y-2">
            {opCounts.map(([op, count]) => {
              const pct = Math.round((count / totalParts) * 100);
              return (
                <div key={op} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-muted-foreground truncate">{op}</div>
                  <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="font-mono-data text-xs text-foreground w-8 text-right">{count}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Deadlines */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-sm font-semibold mb-4">Ближайшие дедлайны</div>
          <div className="space-y-2">
            {MOCK_PARTS
              .filter(p => p.status !== "completed")
              .sort((a, b) => a.deadline.localeCompare(b.deadline))
              .slice(0, 6)
              .map(part => (
                <div key={part.id} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono-data text-xs text-primary flex-shrink-0">{part.id}</span>
                    <span className="text-xs text-foreground truncate">{part.name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <StatusBadge status={part.status} />
                    <span className="font-mono-data text-xs text-muted-foreground">{part.deadline}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = "tracker" | "stages" | "analytics";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "tracker", label: "Отслеживание деталей", icon: "ScanSearch" },
  { id: "stages", label: "Этапы производства", icon: "Workflow" },
  { id: "analytics", label: "Аналитика", icon: "BarChart3" },
];

export default function Index() {
  const [tab, setTab] = useState<Tab>("tracker");

  const summary = useMemo(() => ({
    total: MOCK_PARTS.length,
    inProgress: MOCK_PARTS.filter(p => p.status === "in-progress").length,
    completed: MOCK_PARTS.filter(p => p.status === "completed").length,
    overdue: MOCK_PARTS.filter(p => p.status !== "completed" && p.deadline <= "18.04.2026").length,
  }), []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
                <Icon name="Factory" size={15} className="text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold leading-tight">ПроизводствоМонитор</div>
                <div className="text-xs text-muted-foreground leading-tight">Система управления деталями</div>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Онлайн
              </span>
              <span className="font-mono-data">18.04.2026 · 14:32</span>
              <div className="flex items-center gap-1.5 bg-secondary rounded px-2 py-1">
                <Icon name="Package2" size={12} />
                <span className="font-mono-data font-medium text-foreground">{summary.inProgress}</span>
                <span>в работе</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-5">
        {/* Quick stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { v: summary.total, l: "Деталей всего", i: "Database", a: false },
            { v: summary.inProgress, l: "В производстве", i: "Zap", a: true },
            { v: summary.completed, l: "Завершено", i: "CheckCircle2", a: false },
            { v: summary.overdue, l: "Требуют внимания", i: "AlertTriangle", a: false },
          ].map(({ v, l, i, a }) => (
            <StatCard key={l} value={v} label={l} icon={i} accent={a} />
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-card border border-border rounded-lg w-fit mb-5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-all ${
                tab === t.id
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}>
              <Icon name={t.icon} size={15} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === "tracker" && <PartsTracker />}
        {tab === "stages" && <ProductionStages />}
        {tab === "analytics" && <Analytics />}
      </div>
    </div>
  );
}