import { useState, useMemo, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import Icon from "@/components/ui/icon";

// ─── Types ───────────────────────────────────────────────────────────────────

type CellStatus = "planned" | "in-progress" | "completed" | "delayed" | "empty";

interface ExcelRow {
  id: string;
  cipher: string;   // заказчик (может быть пустым — тогда берём из предыдущей строки)
  name: string;
  equipment: Record<string, string>;
  statuses: Record<string, CellStatus>;
}

interface GroupedClient {
  client: string;
  rows: ExcelRow[];
  collapsed: boolean;
}

interface ExcelData {
  rows: ExcelRow[];
  equipmentColumns: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CellStatus, { label: string; cls: string; bg: string; dot: string }> = {
  planned:       { label: "По плану",   cls: "text-blue-400",   bg: "bg-blue-400/10",   dot: "bg-blue-400" },
  "in-progress": { label: "В работе",   cls: "text-yellow-400", bg: "bg-yellow-400/10", dot: "bg-yellow-400" },
  completed:     { label: "Выполнено",  cls: "text-green-400",  bg: "bg-green-400/10",  dot: "bg-green-400" },
  delayed:       { label: "Просрочено", cls: "text-red-400",    bg: "bg-red-400/10",    dot: "bg-red-400" },
  empty:         { label: "—",          cls: "text-muted-foreground", bg: "", dot: "bg-muted" },
};

function parseExcel(file: File): Promise<ExcelData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        if (raw.length < 2) { reject(new Error("Файл пустой или не содержит данных")); return; }

        const headers = (raw[0] as unknown[]).map(h => String(h ?? "").trim());
        const equipmentColumns = headers.slice(2).filter(h => h !== "");

        const rows: ExcelRow[] = [];
        let lastCipher = "";

        for (let i = 1; i < raw.length; i++) {
          const row = raw[i] as unknown[];
          const rawCipher = String(row[0] ?? "").trim();
          const name = String(row[1] ?? "").trim();

          // Если в колонке заказчика есть значение — запоминаем его
          if (rawCipher) lastCipher = rawCipher;

          // Пропускаем полностью пустые строки
          if (!rawCipher && !name) continue;

          // Строка-заголовок группы (только заказчик, нет наименования) — не добавляем как позицию
          if (rawCipher && !name) continue;

          const equipment: Record<string, string> = {};
          equipmentColumns.forEach((col, idx) => {
            const cell = row[idx + 2];
            if (cell instanceof Date) {
              equipment[col] = cell.toLocaleDateString("ru-RU");
            } else if (cell !== "" && cell !== null && cell !== undefined) {
              const str = String(cell).trim();
              if (/^\d{5}$/.test(str)) {
                const d = XLSX.SSF.parse_date_code(Number(str));
                if (d) equipment[col] = `${String(d.d).padStart(2, "0")}.${String(d.m).padStart(2, "0")}.${d.y}`;
                else equipment[col] = str;
              } else {
                equipment[col] = str;
              }
            }
          });

          const statuses: Record<string, CellStatus> = {};
          equipmentColumns.forEach(col => {
            statuses[col] = equipment[col] ? "planned" : "empty";
          });

          rows.push({
            id: `row-${i}`,
            cipher: lastCipher,
            name,
            equipment,
            statuses,
          });
        }

        resolve({ rows, equipmentColumns });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Ошибка чтения файла"));
    reader.readAsArrayBuffer(file);
  });
}

// Группировка строк по заказчику
function groupByClient(rows: ExcelRow[]): GroupedClient[] {
  const map = new Map<string, ExcelRow[]>();
  for (const row of rows) {
    const key = row.cipher || "—";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return Array.from(map.entries()).map(([client, rows]) => ({ client, rows, collapsed: false }));
}

// ─── Status Dropdown ─────────────────────────────────────────────────────────

function StatusDropdown({ value, onChange }: { value: CellStatus; onChange: (s: CellStatus) => void }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[value];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium w-full justify-between transition-colors hover:opacity-80 ${cfg.bg} ${cfg.cls}`}
      >
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
          {cfg.label}
        </span>
        <Icon name="ChevronDown" size={10} className="flex-shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[140px]">
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
      if (data.rows.length === 0) { setError("Не найдено строк с данными"); setLoading(false); return; }
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
            ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-card"}`}
        >
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
              <div className="bg-secondary/60 rounded-lg px-4 py-2.5 text-xs text-muted-foreground text-left space-y-1">
                <div className="font-medium text-foreground mb-1.5">Ожидаемая структура файла:</div>
                <div className="flex items-center gap-2"><span className="font-mono-data bg-background px-1.5 py-0.5 rounded text-primary">A</span> Заказчик (группировка)</div>
                <div className="flex items-center gap-2"><span className="font-mono-data bg-background px-1.5 py-0.5 rounded text-primary">B</span> Наименование изделия</div>
                <div className="flex items-center gap-2"><span className="font-mono-data bg-background px-1.5 py-0.5 rounded text-primary">C+</span> Оборудование → плановые даты</div>
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
  const [filterEquip, setFilterEquip] = useState<string>("all");
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(new Set());

  // Фильтрация
  const filteredRows = useMemo(() => {
    return data.rows.filter(row => {
      if (search) {
        const q = search.toLowerCase();
        if (!row.cipher.toLowerCase().includes(q) && !row.name.toLowerCase().includes(q)) return false;
      }
      if (filterStatus !== "all") {
        if (!Object.values(row.statuses).some(s => s === filterStatus)) return false;
      }
      if (filterEquip !== "all") {
        if (!row.equipment[filterEquip]) return false;
      }
      return true;
    });
  }, [data.rows, search, filterStatus, filterEquip]);

  // Группировка отфильтрованных строк
  const groups = useMemo(() => groupByClient(filteredRows), [filteredRows]);

  const stats = useMemo(() => {
    const all = data.rows.flatMap(r => Object.values(r.statuses));
    const counts: Record<CellStatus, number> = { planned: 0, "in-progress": 0, completed: 0, delayed: 0, empty: 0 };
    all.forEach(s => counts[s]++);
    return counts;
  }, [data.rows]);

  function updateStatus(rowId: string, equip: string, status: CellStatus) {
    const updated = data.rows.map(r =>
      r.id === rowId ? { ...r, statuses: { ...r.statuses, [equip]: status } } : r
    );
    onUpdate(updated);
  }

  function toggleClient(client: string) {
    setCollapsedClients(prev => {
      const next = new Set(prev);
      if (next.has(client)) next.delete(client); else next.add(client);
      return next;
    });
  }

  function toggleAll(collapse: boolean) {
    if (collapse) setCollapsedClients(new Set(groups.map(g => g.client)));
    else setCollapsedClients(new Set());
  }

  const activeFilters = [search !== "", filterStatus !== "all", filterEquip !== "all"].filter(Boolean).length;
  const totalCols = 2 + data.equipmentColumns.length;

  return (
    <div className="animate-slide-up">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {([
          { key: "planned",      icon: "Calendar",     label: "По плану" },
          { key: "in-progress",  icon: "Zap",          label: "В работе" },
          { key: "completed",    icon: "CheckCircle2",  label: "Выполнено" },
          { key: "delayed",      icon: "AlertTriangle", label: "Просрочено" },
        ] as { key: CellStatus; icon: string; label: string }[]).map(({ key, icon, label }) => {
          const cfg = STATUS_CONFIG[key];
          return (
            <div key={key}
              onClick={() => setFilterStatus(f => f === key ? "all" : key)}
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
              placeholder="Заказчик или наименование..."
              className="w-full bg-background border border-border rounded pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors" />
          </div>
        </div>
        <div className="min-w-[160px]">
          <label className="text-xs text-muted-foreground mb-1.5 block">Оборудование</label>
          <select value={filterEquip} onChange={e => setFilterEquip(e.target.value)}
            className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-primary transition-colors appearance-none cursor-pointer">
            <option value="all">Все</option>
            {data.equipmentColumns.map(col => <option key={col} value={col}>{col}</option>)}
          </select>
        </div>
        {activeFilters > 0 && (
          <button onClick={() => { setSearch(""); setFilterStatus("all"); setFilterEquip("all"); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded transition-colors bg-background">
            <Icon name="X" size={12} /> Сбросить ({activeFilters})
          </button>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => toggleAll(false)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded transition-colors bg-background">
            <Icon name="ChevronsDown" size={12} /> Раскрыть все
          </button>
          <button onClick={() => toggleAll(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded transition-colors bg-background">
            <Icon name="ChevronsUp" size={12} /> Свернуть все
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap sticky left-0 bg-[hsl(220_14%_11%)] z-10 border-r border-border min-w-[200px]">
                  Наименование
                </th>
                {data.equipmentColumns.map(col => (
                  <th key={col} className="text-left px-3 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[160px]">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} className="text-center py-14 text-muted-foreground">
                    <Icon name="SearchX" size={28} className="mx-auto mb-2 opacity-30" />
                    <div className="text-sm">Ничего не найдено</div>
                  </td>
                </tr>
              ) : groups.map((group) => {
                const isCollapsed = collapsedClients.has(group.client);
                const groupCompleted = group.rows.flatMap(r => Object.values(r.statuses)).filter(s => s === "completed").length;
                const groupTotal = group.rows.flatMap(r => Object.values(r.statuses)).filter(s => s !== "empty").length;
                const groupPct = groupTotal > 0 ? Math.round((groupCompleted / groupTotal) * 100) : 0;

                return (
                  <>
                    {/* Group header row */}
                    <tr key={`group-${group.client}`}
                      className="border-b border-border bg-secondary/40 hover:bg-secondary/60 cursor-pointer transition-colors"
                      onClick={() => toggleClient(group.client)}>
                      <td className="px-4 py-2.5 sticky left-0 bg-secondary/40 border-r border-border z-[1]">
                        <div className="flex items-center gap-2">
                          <Icon name={isCollapsed ? "ChevronRight" : "ChevronDown"} size={14} className="text-muted-foreground flex-shrink-0" />
                          <Icon name="Building2" size={13} className="text-primary flex-shrink-0" />
                          <span className="font-semibold text-sm text-foreground">{group.client}</span>
                          <span className="ml-1 text-xs text-muted-foreground font-mono-data">({group.rows.length} поз.)</span>
                          {groupTotal > 0 && (
                            <div className="ml-auto flex items-center gap-2 pl-2">
                              <div className="w-20 h-1 bg-border rounded-full overflow-hidden">
                                <div className="h-full bg-green-400/70 rounded-full" style={{ width: `${groupPct}%` }} />
                              </div>
                              <span className="text-xs font-mono-data text-muted-foreground">{groupPct}%</span>
                            </div>
                          )}
                        </div>
                      </td>
                      {data.equipmentColumns.map(col => (
                        <td key={col} className="px-3 py-2.5" />
                      ))}
                    </tr>

                    {/* Group rows */}
                    {!isCollapsed && group.rows.map((row, i) => (
                      <tr key={row.id}
                        className={`border-b border-border/40 hover:bg-secondary/20 transition-colors ${i % 2 === 0 ? "bg-background/30" : ""}`}>
                        <td className="px-4 py-2.5 sticky left-0 border-r border-border z-[1]"
                          style={{ background: i % 2 === 0 ? "hsl(220 16% 9%)" : "hsl(220 14% 11%)" }}>
                          <div className="flex items-center gap-2 pl-5">
                            <span className="w-1 h-1 rounded-full bg-border flex-shrink-0" />
                            <span className="font-medium text-sm">{row.name}</span>
                          </div>
                        </td>
                        {data.equipmentColumns.map(col => {
                          const date = row.equipment[col];
                          const status = row.statuses[col];
                          return (
                            <td key={col} className="px-3 py-2">
                              {date ? (
                                <div className="space-y-1">
                                  <div className={`font-mono-data text-xs ${STATUS_CONFIG[status].cls}`}>{date}</div>
                                  <StatusDropdown value={status} onChange={s => updateStatus(row.id, col, s)} />
                                </div>
                              ) : (
                                <span className="text-muted-foreground/25 text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Заказчиков: <span className="font-mono-data text-foreground">{groups.length}</span>
            &nbsp;·&nbsp;
            Позиций: <span className="font-mono-data text-foreground">{filteredRows.length}</span>
            {filteredRows.length !== data.rows.length && <span> из {data.rows.length}</span>}
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
            {excelData && (
              <div className="flex items-center gap-3">
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