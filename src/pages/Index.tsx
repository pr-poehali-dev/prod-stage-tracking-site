import { useState, useMemo, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import Icon from "@/components/ui/icon";

// ─── Types ───────────────────────────────────────────────────────────────────

type CellStatus = "planned" | "in-progress" | "completed" | "delayed" | "empty";

// Один станок с иерархией заголовков
interface EquipCol {
  key: string;        // уникальный ключ колонки
  category: string;   // строка 1 (напр. "Токарная")
  subcategory: string;// строка 2 (напр. "DK7765")
  machine: string;    // строка 3 (напр. "WRU SERVO 130") — может совпадать с subcategory
  colIndex: number;   // индекс в исходном массиве
}

interface ExcelRow {
  id: string;
  client: string;     // Заказчик (col 0)
  name: string;       // Наименование (col 1)
  cipher: string;     // Шифр (col 2)
  position: string;   // Позиция (col 3)
  qty: string;        // Кол-во (col 4)
  dateFrom: string;   // Дата план 1 (col 5)
  dateTo: string;     // Дата план 2 (col 6)
  equipment: Record<string, string>;    // key -> дата
  statuses: Record<string, CellStatus>; // key -> статус
}

interface GroupedName {
  name: string;
  rows: ExcelRow[];
}

interface GroupedClient {
  client: string;
  names: GroupedName[];
}

interface ExcelData {
  rows: ExcelRow[];
  equipCols: EquipCol[];
  // Уникальные категории для группировки заголовков
  categories: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FIXED_COLS = 7; // Заказчик, Наименование, Шифр, Позиция, Кол-во, Дата1, Дата2
const HEADER_ROWS = 3; // три строки заголовков оборудования

const STATUS_CONFIG: Record<CellStatus, { label: string; cls: string; bg: string; dot: string }> = {
  planned:       { label: "По плану",   cls: "text-blue-400",   bg: "bg-blue-400/10",   dot: "bg-blue-400" },
  "in-progress": { label: "В работе",   cls: "text-yellow-400", bg: "bg-yellow-400/10", dot: "bg-yellow-400" },
  completed:     { label: "Выполнено",  cls: "text-green-400",  bg: "bg-green-400/10",  dot: "bg-green-400" },
  delayed:       { label: "Просрочено", cls: "text-red-400",    bg: "bg-red-400/10",    dot: "bg-red-400" },
  empty:         { label: "—",          cls: "text-muted-foreground", bg: "", dot: "bg-muted" },
};

// ─── Parser ───────────────────────────────────────────────────────────────────

function cellToDate(cell: unknown): string {
  if (!cell && cell !== 0) return "";
  if (cell instanceof Date) return cell.toLocaleDateString("ru-RU");
  const str = String(cell).trim();
  if (!str) return "";
  if (/^\d{5}$/.test(str)) {
    const d = XLSX.SSF.parse_date_code(Number(str));
    if (d) return `${String(d.d).padStart(2, "0")}.${String(d.m).padStart(2, "0")}.${d.y}`;
  }
  return str;
}

function cellStr(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  return String(cell).trim();
}

function parseExcel(file: File): Promise<ExcelData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        if (raw.length < HEADER_ROWS + 1) {
          reject(new Error("Файл слишком короткий — нужно минимум 4 строки (3 заголовка + данные)"));
          return;
        }

        const h1 = raw[0] as unknown[]; // категории (Токарная, Фрезерная...)
        const h2 = raw[1] as unknown[]; // подкатегории / модели
        const h3 = raw[2] as unknown[]; // конкретные станки

        // Строим список колонок оборудования
        // Пропускаем первые FIXED_COLS колонок
        const equipCols: EquipCol[] = [];
        let lastCat = "";
        let lastSub = "";

        const maxCols = Math.max(h1.length, h2.length, h3.length);
        for (let c = FIXED_COLS; c < maxCols; c++) {
          const cat = cellStr(h1[c]) || lastCat;
          const sub = cellStr(h2[c]) || lastSub;
          const machine = cellStr(h3[c]) || sub;

          if (!machine && !sub && !cat) continue;

          if (cellStr(h1[c])) lastCat = cellStr(h1[c]);
          if (cellStr(h2[c])) lastSub = cellStr(h2[c]);

          const key = `col_${c}`;
          equipCols.push({ key, category: cat, subcategory: sub, machine, colIndex: c });
        }

        const categories = [...new Set(equipCols.map(e => e.category).filter(Boolean))];

        // Парсим строки данных
        const rows: ExcelRow[] = [];
        let lastClient = "";

        for (let i = HEADER_ROWS; i < raw.length; i++) {
          const row = raw[i] as unknown[];
          const rawClient = cellStr(row[0]);
          const name      = cellStr(row[1]);
          const cipher    = cellStr(row[2]);
          const position  = cellStr(row[3]);
          const qty       = cellStr(row[4]);
          const dateFrom  = cellToDate(row[5]);
          const dateTo    = cellToDate(row[6]);

          if (rawClient) lastClient = rawClient;

          // Пропускаем пустые строки и строки-заголовки групп (только заказчик, нет остального)
          if (!name && !cipher && !position) continue;

          const equipment: Record<string, string> = {};
          const statuses: Record<string, CellStatus> = {};

          for (const ec of equipCols) {
            const val = cellToDate(row[ec.colIndex]);
            equipment[ec.key] = val;
            statuses[ec.key] = val ? "planned" : "empty";
          }

          rows.push({
            id: `row-${i}`,
            client: lastClient,
            name,
            cipher,
            position,
            qty,
            dateFrom,
            dateTo,
            equipment,
            statuses,
          });
        }

        if (rows.length === 0) {
          reject(new Error("Не найдено строк с данными. Проверьте структуру файла."));
          return;
        }

        resolve({ rows, equipCols, categories });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Ошибка чтения файла"));
    reader.readAsArrayBuffer(file);
  });
}

function groupByClient(rows: ExcelRow[]): GroupedClient[] {
  const clientMap = new Map<string, Map<string, ExcelRow[]>>();
  for (const row of rows) {
    const clientKey = row.client || "—";
    const nameKey = row.name || "—";
    if (!clientMap.has(clientKey)) clientMap.set(clientKey, new Map());
    const nameMap = clientMap.get(clientKey)!;
    if (!nameMap.has(nameKey)) nameMap.set(nameKey, []);
    nameMap.get(nameKey)!.push(row);
  }
  return Array.from(clientMap.entries()).map(([client, nameMap]) => ({
    client,
    names: Array.from(nameMap.entries()).map(([name, rows]) => ({ name, rows })),
  }));
}

// ─── Status Dropdown ─────────────────────────────────────────────────────────

function StatusDropdown({ value, onChange }: { value: CellStatus; onChange: (s: CellStatus) => void }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[value];
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium w-full justify-between transition-colors hover:opacity-80 ${cfg.bg} ${cfg.cls}`}>
        <span className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
          {cfg.label}
        </span>
        <Icon name="ChevronDown" size={9} className="flex-shrink-0 opacity-50" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[130px]">
          {(Object.entries(STATUS_CONFIG) as [CellStatus, typeof STATUS_CONFIG[CellStatus]][])
            .filter(([k]) => k !== "empty")
            .map(([k, v]) => (
              <button key={k} onClick={() => { onChange(k); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary/50 transition-colors ${value === k ? v.cls : "text-muted-foreground"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />
                {v.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ─── Upload Zone ─────────────────────────────────────────────────────────────

function UploadZone({ onLoad }: { onLoad: (data: ExcelData, name: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.xlsx?$/i)) { setError("Поддерживаются только файлы .xlsx"); return; }
    setLoading(true); setError(null);
    try {
      const data = await parseExcel(file);
      onLoad(data, file.name);
    } catch (e) {
      setError((e as Error).message ?? "Ошибка при чтении файла");
    }
    setLoading(false);
  }, [onLoad]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <Icon name="Factory" size={16} className="text-white" />
          </div>
          <div>
            <div className="font-semibold">ПроизводствоМонитор</div>
            <div className="text-xs text-muted-foreground">Система управления деталями</div>
          </div>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
            ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-card"}`}>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <div className="text-sm text-muted-foreground">Читаю файл...</div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors
                ${dragging ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>
                <Icon name="FileSpreadsheet" size={32} />
              </div>
              <div>
                <div className="font-semibold text-base mb-1">{dragging ? "Отпустите файл" : "Загрузите Excel-файл"}</div>
                <div className="text-sm text-muted-foreground">Перетащите .xlsx или нажмите для выбора</div>
              </div>
              <div className="bg-secondary/60 rounded-lg px-4 py-3 text-xs text-muted-foreground text-left space-y-1.5 w-full">
                <div className="font-medium text-foreground mb-2">Ожидаемая структура:</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div><span className="font-mono-data text-primary">Строка 1:</span> Категории оборудования</div>
                  <div><span className="font-mono-data text-primary">Кол. A:</span> Заказчик</div>
                  <div><span className="font-mono-data text-primary">Строка 2:</span> Модели / подкатегории</div>
                  <div><span className="font-mono-data text-primary">Кол. B:</span> Наименование</div>
                  <div><span className="font-mono-data text-primary">Строка 3:</span> Названия станков</div>
                  <div><span className="font-mono-data text-primary">Кол. C:</span> Шифр</div>
                  <div><span className="font-mono-data text-primary">Данные:</span> Плановые даты</div>
                  <div><span className="font-mono-data text-primary">Кол. D–G:</span> Позиция, Кол-во, Даты</div>
                </div>
              </div>
            </div>
          )}
        </div>
        {error && (
          <div className="mt-3 flex items-center gap-2 px-4 py-3 bg-red-400/10 border border-red-400/20 rounded-lg text-sm text-red-400">
            <Icon name="AlertCircle" size={15} />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Production Table ─────────────────────────────────────────────────────────

function ProductionTable({ data, onUpdate }: { data: ExcelData; onUpdate: (rows: ExcelRow[]) => void }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<CellStatus | "all">("all");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterDay, setFilterDay] = useState<string>("");
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(new Set());
  const [collapsedNames, setCollapsedNames] = useState<Set<string>>(new Set());

  // Видимые колонки оборудования (с учётом фильтра категории)
  const visibleCols = useMemo(() =>
    filterCat === "all" ? data.equipCols : data.equipCols.filter(c => c.category === filterCat),
    [data.equipCols, filterCat]
  );

  const filteredRows = useMemo(() => {
    return data.rows.filter(row => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !row.client.toLowerCase().includes(q) &&
          !row.name.toLowerCase().includes(q) &&
          !row.cipher.toLowerCase().includes(q)
        ) return false;
      }
      if (filterStatus !== "all") {
        if (!Object.values(row.statuses).some(s => s === filterStatus)) return false;
      }
      if (filterDay) {
        const day = filterDay.padStart(2, "0");
        const allDates = [
          row.dateFrom,
          row.dateTo,
          ...Object.values(row.equipment),
        ];
        if (!allDates.some(d => d && d.startsWith(day + "."))) return false;
      }
      return true;
    });
  }, [data.rows, search, filterStatus, filterDay]);

  const groups = useMemo(() => groupByClient(filteredRows), [filteredRows]);

  const stats = useMemo(() => {
    const counts: Record<CellStatus, number> = { planned: 0, "in-progress": 0, completed: 0, delayed: 0, empty: 0 };
    data.rows.forEach(r => Object.values(r.statuses).forEach(s => counts[s]++));
    return counts;
  }, [data.rows]);

  function updateStatus(rowId: string, key: string, status: CellStatus) {
    onUpdate(data.rows.map(r =>
      r.id === rowId ? { ...r, statuses: { ...r.statuses, [key]: status } } : r
    ));
  }

  function toggleClient(client: string) {
    setCollapsedClients(prev => {
      const next = new Set(prev);
      if (next.has(client)) next.delete(client); else next.add(client);
      return next;
    });
  }

  function toggleName(key: string) {
    setCollapsedNames(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleAll(collapse: boolean) {
    if (collapse) {
      setCollapsedClients(new Set(groups.map(g => g.client)));
      setCollapsedNames(new Set(groups.flatMap(g => g.names.map(n => `${g.client}__${n.name}`))));
    } else {
      setCollapsedClients(new Set());
      setCollapsedNames(new Set());
    }
  }

  // Группировка заголовков по категориям для colspan
  const categoryGroups = useMemo(() => {
    const result: { category: string; cols: EquipCol[] }[] = [];
    for (const col of visibleCols) {
      const last = result[result.length - 1];
      if (last && last.category === col.category) last.cols.push(col);
      else result.push({ category: col.category, cols: [col] });
    }
    return result;
  }, [visibleCols]);

  const activeFilters = [search !== "", filterStatus !== "all", filterCat !== "all", filterDay !== ""].filter(Boolean).length;

  return (
    <div className="animate-slide-up">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {([
          { key: "planned",      icon: "Calendar",      label: "По плану" },
          { key: "in-progress",  icon: "Zap",           label: "В работе" },
          { key: "completed",    icon: "CheckCircle2",   label: "Выполнено" },
          { key: "delayed",      icon: "AlertTriangle",  label: "Просрочено" },
        ] as { key: CellStatus; icon: string; label: string }[]).map(({ key, icon, label }) => {
          const cfg = STATUS_CONFIG[key];
          return (
            <div key={key} onClick={() => setFilterStatus(f => f === key ? "all" : key)}
              className={`rounded-lg border p-3 flex items-center gap-3 cursor-pointer transition-all
                ${filterStatus === key ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:border-border/60"}`}>
              <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${cfg.bg} ${cfg.cls}`}>
                <Icon name={icon} size={16} />
              </div>
              <div>
                <div className={`text-xl font-semibold font-mono-data ${cfg.cls}`}>{stats[key]}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-3 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs text-muted-foreground mb-1.5 block">Поиск</label>
          <div className="relative">
            <Icon name="Search" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Заказчик, наименование, шифр..."
              className="w-full bg-background border border-border rounded pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors" />
          </div>
        </div>
        <div className="min-w-[180px]">
          <label className="text-xs text-muted-foreground mb-1.5 block">Категория оборудования</label>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-primary transition-colors appearance-none cursor-pointer">
            <option value="all">Все ({data.equipCols.length} станков)</option>
            {data.categories.map(cat => (
              <option key={cat} value={cat}>{cat} ({data.equipCols.filter(c => c.category === cat).length})</option>
            ))}
          </select>
        </div>
        <div className="min-w-[130px]">
          <label className="text-xs text-muted-foreground mb-1.5 block">День месяца</label>
          <div className="relative">
            <Icon name="CalendarDays" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="number" min={1} max={31}
              value={filterDay}
              onChange={e => setFilterDay(e.target.value)}
              placeholder="напр. 17"
              className="w-full bg-background border border-border rounded pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {filterDay && (
              <button onClick={() => setFilterDay("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <Icon name="X" size={11} />
              </button>
            )}
          </div>
        </div>
        {activeFilters > 0 && (
          <button onClick={() => { setSearch(""); setFilterStatus("all"); setFilterCat("all"); setFilterDay(""); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded transition-colors bg-background">
            <Icon name="X" size={12} /> Сбросить ({activeFilters})
          </button>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => toggleAll(false)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded transition-colors bg-background">
            <Icon name="ChevronsDown" size={12} /> Раскрыть
          </button>
          <button onClick={() => toggleAll(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded transition-colors bg-background">
            <Icon name="ChevronsUp" size={12} /> Свернуть
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-280px)]">
          <table className="text-xs border-collapse" style={{ minWidth: "100%" }}>
            <thead className="sticky top-0 z-20">
              {/* Row 1: фиксированные + категории оборудования */}
              <tr className="border-b border-border bg-[hsl(220_14%_9%)]">
                <th rowSpan={3} className="text-left px-3 py-2 font-medium text-muted-foreground uppercase tracking-wider border-r border-border sticky left-0 bg-[hsl(220_14%_9%)] z-30 min-w-[160px] whitespace-nowrap">
                  Заказчик
                </th>
                <th rowSpan={3} className="text-left px-3 py-2 font-medium text-muted-foreground uppercase tracking-wider border-r border-border sticky left-[160px] bg-[hsl(220_14%_9%)] z-30 min-w-[200px]">
                  Наименование
                </th>
                <th rowSpan={3} className="text-left px-3 py-2 font-medium text-muted-foreground uppercase tracking-wider border-r border-border min-w-[110px] whitespace-nowrap">
                  Шифр
                </th>
                <th rowSpan={3} className="text-center px-2 py-2 font-medium text-muted-foreground uppercase tracking-wider border-r border-border min-w-[50px]">
                  Поз.
                </th>
                <th rowSpan={3} className="text-center px-2 py-2 font-medium text-muted-foreground uppercase tracking-wider border-r border-border min-w-[50px]">
                  Кол.
                </th>
                <th rowSpan={3} className="text-center px-2 py-2 font-medium text-muted-foreground uppercase tracking-wider border-r border-border min-w-[85px] whitespace-nowrap">
                  Дата нач.
                </th>
                <th rowSpan={3} className="text-center px-2 py-2 font-medium text-muted-foreground uppercase tracking-wider border-r border-border min-w-[85px] whitespace-nowrap">
                  Дата оконч.
                </th>
                {categoryGroups.map(cg => (
                  <th key={cg.category} colSpan={cg.cols.length}
                    className="text-center px-2 py-1.5 font-semibold text-foreground border-r border-b border-border bg-primary/10 whitespace-nowrap">
                    {cg.category}
                  </th>
                ))}
              </tr>
              {/* Row 2: подкатегории */}
              <tr className="border-b border-border bg-[hsl(220_14%_9%)]">
                {visibleCols.map((col, i) => {
                  // Показываем подкатегорию только при смене
                  const prev = visibleCols[i - 1];
                  const showBorder = !prev || prev.category !== col.category;
                  return (
                    <th key={col.key}
                      className={`text-center px-2 py-1 font-medium text-muted-foreground border-b border-border whitespace-nowrap min-w-[90px] ${showBorder ? "border-l border-border" : ""}`}>
                      {col.subcategory}
                    </th>
                  );
                })}
              </tr>
              {/* Row 3: названия станков */}
              <tr className="border-b border-border bg-[hsl(220_14%_9%)]">
                {visibleCols.map((col, i) => {
                  const prev = visibleCols[i - 1];
                  const showBorder = !prev || prev.category !== col.category;
                  return (
                    <th key={col.key}
                      className={`text-center px-2 py-1.5 font-medium text-primary/80 border-b border-border whitespace-nowrap ${showBorder ? "border-l border-border" : ""}`}>
                      {col.machine !== col.subcategory ? col.machine : ""}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={7 + visibleCols.length} className="text-center py-14 text-muted-foreground">
                    <Icon name="SearchX" size={28} className="mx-auto mb-2 opacity-30" />
                    <div>Ничего не найдено</div>
                  </td>
                </tr>
              ) : groups.map(group => {
                const isClientCollapsed = collapsedClients.has(group.client);
                const allRows = group.names.flatMap(n => n.rows);
                const done = allRows.flatMap(r => Object.values(r.statuses)).filter(s => s === "completed").length;
                const total = allRows.flatMap(r => Object.values(r.statuses)).filter(s => s !== "empty").length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;

                return (
                  <>
                    {/* Заказчик */}
                    <tr key={`g-${group.client}`}
                      className="border-b border-border bg-secondary/50 hover:bg-secondary/70 cursor-pointer transition-colors"
                      onClick={() => toggleClient(group.client)}>
                      <td className="px-3 py-2 sticky left-0 bg-secondary/50 border-r border-border z-10" colSpan={2}>
                        <div className="flex items-center gap-2">
                          <Icon name={isClientCollapsed ? "ChevronRight" : "ChevronDown"} size={13} className="text-muted-foreground flex-shrink-0" />
                          <Icon name="Building2" size={12} className="text-primary flex-shrink-0" />
                          <span className="font-semibold text-sm text-foreground">{group.client}</span>
                          <span className="text-muted-foreground font-mono-data">({group.names.length} изд.)</span>
                          {total > 0 && (
                            <div className="flex items-center gap-2 ml-3">
                              <div className="w-16 h-1 bg-border rounded-full overflow-hidden">
                                <div className="h-full bg-green-400/70 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="font-mono-data text-muted-foreground">{pct}%</span>
                            </div>
                          )}
                        </div>
                      </td>
                      {Array.from({ length: 5 + visibleCols.length }).map((_, i) => (
                        <td key={i} className="border-r border-border/30" />
                      ))}
                    </tr>

                    {/* Наименования */}
                    {!isClientCollapsed && group.names.map(nameGroup => {
                      const nameKey = `${group.client}__${nameGroup.name}`;
                      const isNameCollapsed = collapsedNames.has(nameKey);
                      const nameDone = nameGroup.rows.flatMap(r => Object.values(r.statuses)).filter(s => s === "completed").length;
                      const nameTotal = nameGroup.rows.flatMap(r => Object.values(r.statuses)).filter(s => s !== "empty").length;
                      const namePct = nameTotal > 0 ? Math.round((nameDone / nameTotal) * 100) : 0;

                      return (
                        <>
                          {/* Наименование — строка-подзаголовок */}
                          <tr key={`n-${nameKey}`}
                            className="border-b border-border/60 bg-card hover:bg-secondary/30 cursor-pointer transition-colors"
                            onClick={() => toggleName(nameKey)}>
                            <td className="px-3 py-1.5 sticky left-0 border-r border-border z-10 bg-card" />
                            <td className="px-3 py-1.5 sticky left-[160px] border-r border-border z-10 bg-card">
                              <div className="flex items-center gap-2">
                                <Icon name={isNameCollapsed ? "ChevronRight" : "ChevronDown"} size={12} className="text-muted-foreground/60 flex-shrink-0" />
                                <Icon name="Layers" size={11} className="text-muted-foreground flex-shrink-0" />
                                <span className="font-medium text-foreground">{nameGroup.name}</span>
                                <span className="text-muted-foreground/60 font-mono-data text-xs">({nameGroup.rows.length} поз.)</span>
                                {nameTotal > 0 && (
                                  <div className="flex items-center gap-1.5 ml-2">
                                    <div className="w-12 h-1 bg-border rounded-full overflow-hidden">
                                      <div className="h-full bg-blue-400/60 rounded-full" style={{ width: `${namePct}%` }} />
                                    </div>
                                    <span className="font-mono-data text-muted-foreground/60 text-xs">{namePct}%</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            {Array.from({ length: 5 + visibleCols.length }).map((_, i) => (
                              <td key={i} className="border-r border-border/20" />
                            ))}
                          </tr>

                          {/* Позиции */}
                          {!isNameCollapsed && nameGroup.rows.map((row, ri) => (
                            <tr key={row.id}
                              className={`border-b border-border/30 hover:bg-secondary/20 transition-colors ${ri % 2 === 0 ? "" : "bg-secondary/5"}`}>
                              <td className="px-3 py-1.5 sticky left-0 border-r border-border z-10"
                                style={{ background: ri % 2 === 0 ? "hsl(220 16% 9%)" : "hsl(220 14% 11%)" }} />
                              <td className="px-3 py-1.5 sticky left-[160px] border-r border-border z-10 text-muted-foreground/50 text-xs"
                                style={{ background: ri % 2 === 0 ? "hsl(220 16% 9%)" : "hsl(220 14% 11%)" }}>
                                <div className="pl-7 flex items-center gap-1.5">
                                  <span className="w-1 h-1 rounded-full bg-border/40 flex-shrink-0" />
                                  поз. {row.position || (ri + 1)}
                                </div>
                              </td>
                              <td className="px-3 py-1.5 border-r border-border font-mono-data text-primary/70 whitespace-nowrap text-xs">{row.cipher}</td>
                              <td className="px-2 py-1.5 border-r border-border text-center text-muted-foreground">{row.position}</td>
                              <td className="px-2 py-1.5 border-r border-border text-center font-mono-data">{row.qty}</td>
                              <td className="px-2 py-1.5 border-r border-border text-center font-mono-data text-muted-foreground whitespace-nowrap">{row.dateFrom || "—"}</td>
                              <td className="px-2 py-1.5 border-r border-border text-center font-mono-data text-muted-foreground whitespace-nowrap">{row.dateTo || "—"}</td>
                              {visibleCols.map((col, ci) => {
                                const prev = visibleCols[ci - 1];
                                const showBorder = !prev || prev.category !== col.category;
                                const date = row.equipment[col.key];
                                const status = row.statuses[col.key];
                                return (
                                  <td key={col.key}
                                    className={`px-2 py-1.5 border-r border-border/30 ${showBorder ? "border-l border-border/50" : ""}`}>
                                    {date ? (
                                      <div className="space-y-0.5">
                                        <div className={`font-mono-data ${STATUS_CONFIG[status].cls} whitespace-nowrap`}>{date}</div>
                                        <StatusDropdown value={status} onChange={s => updateStatus(row.id, col.key, s)} />
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground/20">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Заказчиков: <span className="font-mono-data text-foreground">{groups.length}</span>
            &nbsp;·&nbsp;
            Изделий: <span className="font-mono-data text-foreground">{groups.reduce((s, g) => s + g.names.length, 0)}</span>
            &nbsp;·&nbsp;
            Позиций: <span className="font-mono-data text-foreground">{filteredRows.length}</span>
            {filteredRows.length !== data.rows.length && <span> из {data.rows.length}</span>}
            &nbsp;·&nbsp;
            Станков: <span className="font-mono-data text-foreground">{visibleCols.length}</span>
            {visibleCols.length !== data.equipCols.length && <span> из {data.equipCols.length}</span>}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Данные загружены
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Index() {
  const [excelData, setExcelData] = useState<ExcelData | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleLoad(data: ExcelData, name?: string) {
    setExcelData(data);
    if (name) setFileName(name);
  }

  function handleReplace(file: File) {
    parseExcel(file).then(data => handleLoad(data, file.name)).catch(() => {});
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
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
            {excelData && (
              <div className="flex items-center gap-2">
                {fileName && (
                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/50 px-2.5 py-1.5 rounded border border-border">
                    <Icon name="FileSpreadsheet" size={12} className="text-green-400" />
                    <span className="max-w-[200px] truncate">{fileName}</span>
                  </div>
                )}
                <button onClick={() => inputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors bg-background">
                  <Icon name="RefreshCw" size={12} /> Заменить файл
                </button>
                <button onClick={() => { setExcelData(null); setFileName(""); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded text-muted-foreground hover:text-red-400 hover:border-red-400/30 transition-colors bg-background">
                  <Icon name="X" size={12} /> Очистить
                </button>
                <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleReplace(f); e.target.value = ""; }} />
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-5">
        {!excelData
          ? <UploadZone onLoad={(data, name) => handleLoad(data, name)} />
          : <ProductionTable data={excelData} onUpdate={rows => setExcelData(prev => prev ? { ...prev, rows } : prev)} />
        }
      </div>
    </div>
  );
}