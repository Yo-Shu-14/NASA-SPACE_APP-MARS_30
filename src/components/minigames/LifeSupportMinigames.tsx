import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Droplets, Flame, Gauge, Minus, Plus, RotateCw, ShieldCheck, Sparkles, Thermometer, Wind } from 'lucide-react';
import { soundFX } from '../../systems/audio';
import { MinigameSlider } from './MinigameSlider';

interface MinigameProps {
  onWin: () => void;
  paused?: boolean;
}

// ---------- 1. OXYGEN GENERATOR: PIPE CONNECTION (4x4 rotatable grid) ----------
type PipeShape = 'straight' | 'elbow' | 'tee' | 'cross';

interface PipeCell {
  shape: PipeShape;
  rot: number; // 0, 1, 2, 3 (90 deg clockwise steps)
  locked?: boolean;
}

const BASE_PORTS: Record<PipeShape, [boolean, boolean, boolean, boolean]> = {
  // [Top, Right, Bottom, Left]
  straight: [false, true, false, true],
  elbow: [false, true, true, false],
  tee: [false, true, true, true],
  cross: [true, true, true, true],
};

function getPorts(shape: PipeShape, rot: number): [boolean, boolean, boolean, boolean] {
  const base = BASE_PORTS[shape];
  const shift = ((rot % 4) + 4) % 4;
  return [
    base[(4 - shift) % 4],
    base[(5 - shift) % 4],
    base[(6 - shift) % 4],
    base[(7 - shift) % 4],
  ];
}

function buildPipePuzzle(): PipeCell[][] {
  // Guaranteed connected 4x4 layout from (0,0) Left-entry to (3,3) Right-exit
  // Solved rotations:
  const layouts: PipeCell[][][] = [
    [
      [
        { shape: 'straight', rot: 0, locked: true },
        { shape: 'elbow', rot: 1 },
        { shape: 'elbow', rot: 0 },
        { shape: 'elbow', rot: 1 },
      ],
      [
        { shape: 'elbow', rot: 0 },
        { shape: 'tee', rot: 2 },
        { shape: 'straight', rot: 1 },
        { shape: 'straight', rot: 1 },
      ],
      [
        { shape: 'straight', rot: 1 },
        { shape: 'elbow', rot: 3 },
        { shape: 'elbow', rot: 0 },
        { shape: 'elbow', rot: 2 },
      ],
      [
        { shape: 'elbow', rot: 3 },
        { shape: 'straight', rot: 0 },
        { shape: 'tee', rot: 2 },
        { shape: 'straight', rot: 0, locked: true },
      ],
    ],
    [
      [
        { shape: 'straight', rot: 0, locked: true },
        { shape: 'tee', rot: 0 },
        { shape: 'straight', rot: 0 },
        { shape: 'elbow', rot: 1 },
      ],
      [
        { shape: 'elbow', rot: 1 },
        { shape: 'straight', rot: 1 },
        { shape: 'elbow', rot: 0 },
        { shape: 'straight', rot: 1 },
      ],
      [
        { shape: 'elbow', rot: 3 },
        { shape: 'elbow', rot: 3 },
        { shape: 'tee', rot: 1 },
        { shape: 'elbow', rot: 2 },
      ],
      [
        { shape: 'straight', rot: 0 },
        { shape: 'elbow', rot: 0 },
        { shape: 'elbow', rot: 3 },
        { shape: 'straight', rot: 0, locked: true },
      ],
    ],
  ];

  // Clean guaranteed solvable path layout:
  // Path: (0,0)->(0,1)->(1,1)->(2,1)->(2,2)->(3,2)->(3,3)
  const template: PipeCell[][] = [
    [
      { shape: 'straight', rot: 0, locked: true }, // Left-Right
      { shape: 'elbow', rot: 1 }, // Bottom-Left
      { shape: 'elbow', rot: 0 },
      { shape: 'elbow', rot: 1 },
    ],
    [
      { shape: 'elbow', rot: 0 },
      { shape: 'straight', rot: 1 }, // Top-Bottom
      { shape: 'tee', rot: 1 },
      { shape: 'straight', rot: 1 },
    ],
    [
      { shape: 'straight', rot: 1 },
      { shape: 'elbow', rot: 3 }, // Top-Right
      { shape: 'elbow', rot: 1 }, // Bottom-Left
      { shape: 'elbow', rot: 2 },
    ],
    [
      { shape: 'elbow', rot: 3 },
      { shape: 'straight', rot: 0 },
      { shape: 'elbow', rot: 3 }, // Top-Right
      { shape: 'straight', rot: 0, locked: true }, // Left-Right
    ],
  ];
  void layouts;

  // Scramble non-locked tiles by +1, +2, or +3 turns so puzzle is interactive
  return template.map((row, r) =>
    row.map((cell, c) => {
      if (cell.locked) return { ...cell };
      const offset = 1 + ((r * 3 + c) % 3);
      return { ...cell, rot: (cell.rot + offset) % 4 };
    })
  );
}

function computeOxygenFlow(grid: PipeCell[][]): { powered: Set<string>; solved: boolean } {
  const powered = new Set<string>();
  const queue: Array<[number, number]> = [];
  const rows = grid.length;
  const cols = grid[0].length;

  // Start cell (0,0) must have Left port open to receive MOXIE intake
  if (getPorts(grid[0][0].shape, grid[0][0].rot)[3]) {
    powered.add('0,0');
    queue.push([0, 0]);
  }

  const dirs: Array<[number, number, number, number]> = [
    [-1, 0, 0, 2], // Top -> Neighbor Bottom
    [0, 1, 1, 3], // Right -> Neighbor Left
    [1, 0, 2, 0], // Bottom -> Neighbor Top
    [0, -1, 3, 1], // Left -> Neighbor Right
  ];

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const ports = getPorts(grid[r][c].shape, grid[r][c].rot);
    for (const [dr, dc, outPort, inPort] of dirs) {
      if (!ports[outPort]) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const key = `${nr},${nc}`;
      if (powered.has(key)) continue;
      const nPorts = getPorts(grid[nr][nc].shape, grid[nr][nc].rot);
      if (nPorts[inPort]) {
        powered.add(key);
        queue.push([nr, nc]);
      }
    }
  }

  const endPorts = getPorts(grid[3][3].shape, grid[3][3].rot);
  const solved = powered.has('3,3') && endPorts[1];
  return { powered, solved };
}

export function OxygenPipeGame({ onWin }: MinigameProps) {
  const [grid, setGrid] = useState<PipeCell[][]>(() => buildPipePuzzle());
  const wonRef = useRef(false);

  const { powered, solved } = useMemo(() => computeOxygenFlow(grid), [grid]);

  const rotateCell = (r: number, c: number) => {
    if (wonRef.current || grid[r][c].locked) return;
    soundFX.playTick();
    setGrid((prev) => {
      const next = prev.map((row, ri) =>
        row.map((cell, ci) =>
          ri === r && ci === c ? { ...cell, rot: (cell.rot + 1) % 4 } : cell
        )
      );
      const check = computeOxygenFlow(next);
      if (check.solved && !wonRef.current) {
        wonRef.current = true;
        soundFX.playRepair();
        window.setTimeout(onWin, 320);
      }
      return next;
    });
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Tap pipe pieces to rotate them and connect fresh Oxygen from Intake to Tank!
      </div>

      <div className="flex items-center justify-between text-[11px] font-extrabold text-[#292C2B] px-1">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#477C9B] text-[#FAF0DC] border-2 border-[#292C2B]">
          <Wind className="w-3.5 h-3.5" aria-hidden="true" />
          Intake IN →
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#718B78] text-[#FAF0DC] border-2 border-[#292C2B]">
          → O2 Tank OUT
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 bg-[#313638] p-2.5 rounded-2xl border-2 border-[#292C2B] max-w-[272px] sm:max-w-[300px] mx-auto">
        {grid.map((row, r) =>
          row.map((cell, c) => {
            const isFlowing = powered.has(`${r},${c}`);
            const pipeColor = isFlowing ? '#7BE0D6' : '#C9C0B5';
            const ports = getPorts(cell.shape, cell.rot);
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                disabled={cell.locked}
                onClick={() => rotateCell(r, c)}
                aria-label={`Rotate pipe row ${r + 1} column ${c + 1}`}
                className={`aspect-square rounded-xl border-2 border-[#292C2B] relative flex items-center justify-center transition-colors ${
                  cell.locked
                    ? 'bg-[#465154] cursor-default'
                    : 'bg-[#51595D] hover:bg-[#5E676C] cursor-pointer active:scale-95'
                }`}
              >
                <svg viewBox="0 0 60 60" className="w-full h-full">
                  {ports[0] && (
                    <rect x={22} y={0} width={16} height={34} fill={pipeColor} stroke="#292C2B" strokeWidth={2.2} />
                  )}
                  {ports[1] && (
                    <rect x={26} y={22} width={34} height={16} fill={pipeColor} stroke="#292C2B" strokeWidth={2.2} />
                  )}
                  {ports[2] && (
                    <rect x={22} y={26} width={16} height={34} fill={pipeColor} stroke="#292C2B" strokeWidth={2.2} />
                  )}
                  {ports[3] && (
                    <rect x={0} y={22} width={34} height={16} fill={pipeColor} stroke="#292C2B" strokeWidth={2.2} />
                  )}
                  <circle cx={30} cy={30} r={10} fill={pipeColor} stroke="#292C2B" strokeWidth={2.2} />
                  {cell.locked && (
                    <circle cx={30} cy={30} r={3.5} fill="#292C2B" />
                  )}
                </svg>
              </button>
            );
          })
        )}
      </div>

      <div className="text-center text-xs font-extrabold text-[#396344]">
        {solved ? 'Oxygen Flowing to Tanks!' : 'Tap any gray/teal pipe to turn it 90°'}
      </div>
    </div>
  );
}

// ---------- 2. WATER RECYCLING: MATCH COLORED FILTERS TO OUTLINED SLOTS ----------
interface ColoredFilter {
  id: 'blue' | 'green' | 'amber' | 'coral';
  label: string;
  symbol: string;
  color: string;
  lightBg: string;
}

const COLORED_FILTERS: ColoredFilter[] = [
  { id: 'blue', label: 'Blue', symbol: '●', color: '#477C9B', lightBg: '#DCEEF8' },
  { id: 'green', label: 'Green', symbol: '▲', color: '#5E8C6A', lightBg: '#E1F0E4' },
  { id: 'amber', label: 'Amber', symbol: '■', color: '#D9932B', lightBg: '#FDF0D5' },
  { id: 'coral', label: 'Coral', symbol: '★', color: '#C85A3F', lightBg: '#FADFD7' },
];

const SHUFFLED_FILTERS: ColoredFilter[] = [
  COLORED_FILTERS[3], // Coral
  COLORED_FILTERS[0], // Blue
  COLORED_FILTERS[2], // Amber
  COLORED_FILTERS[1], // Green
];

export function WaterFilterGame({ onWin }: MinigameProps) {
  const [matchedIds, setMatchedIds] = useState<ColoredFilter['id'][]>([]);
  const [selectedFilter, setSelectedFilter] = useState<ColoredFilter['id'] | null>(null);
  const [wrongSlot, setWrongSlot] = useState<ColoredFilter['id'] | null>(null);
  const wonRef = useRef(false);

  const tryPlace = (slotId: ColoredFilter['id'], filterId: ColoredFilter['id']) => {
    if (matchedIds.includes(slotId) || wonRef.current) return;
    if (slotId === filterId) {
      soundFX.playTick();
      const next = [...matchedIds, slotId];
      setMatchedIds(next);
      setSelectedFilter(null);
      if (next.length === COLORED_FILTERS.length && !wonRef.current) {
        wonRef.current = true;
        soundFX.playRepair();
        window.setTimeout(onWin, 280);
      }
    } else {
      soundFX.playError();
      setWrongSlot(slotId);
      window.setTimeout(() => setWrongSlot(null), 420);
    }
  };

  const progressPct = Math.round((matchedIds.length / COLORED_FILTERS.length) * 100);

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Tap or drag each colored filter into its matching outlined slot in the Water Recovery System!
      </div>

      {/* Water Recovery System Colored Outlined Slots */}
      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#313C42] p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          {COLORED_FILTERS.map((slot) => {
            const isFilled = matchedIds.includes(slot.id);
            const isWrong = wrongSlot === slot.id;
            return (
              <button
                key={slot.id}
                type="button"
                disabled={isFilled}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = e.dataTransfer.getData('text/plain') as ColoredFilter['id'];
                  if (dropped) tryPlace(slot.id, dropped);
                }}
                onClick={() => {
                  if (selectedFilter) tryPlace(slot.id, selectedFilter);
                }}
                style={{
                  borderColor: isWrong ? '#C94B43' : slot.color,
                  backgroundColor: isFilled ? slot.color : isWrong ? '#5A2B28' : '#263035',
                }}
                className={`h-20 rounded-xl border-3 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  isFilled
                    ? 'border-solid text-[#FAF0DC] shadow-inner cursor-default'
                    : selectedFilter
                    ? 'border-dashed hover:scale-[1.03]'
                    : 'border-dashed'
                }`}
              >
                {isFilled ? (
                  <>
                    <Check className="w-6 h-6 text-[#FAF0DC]" aria-hidden="true" />
                    <span className="text-xs font-extrabold text-[#FAF0DC]">
                      {slot.symbol} {slot.label} Filter
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className="text-xl font-black leading-none"
                      style={{ color: slot.color }}
                      aria-hidden="true"
                    >
                      {slot.symbol}
                    </span>
                    <span className="text-[11px] font-extrabold text-[#FAF0DC]/85">
                      {slot.label} Slot
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* Water Clarity Progress Bar */}
        <div className="h-3 w-full bg-[#20272B] border border-[#FAF0DC]/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#6BE0FF] transition-all duration-200"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Shuffled Colored Filters Tray */}
      <div className="grid grid-cols-4 gap-2">
        {SHUFFLED_FILTERS.map((filter) => {
          const isUsed = matchedIds.includes(filter.id);
          const isSelected = selectedFilter === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              disabled={isUsed}
              draggable={!isUsed}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', filter.id);
                setSelectedFilter(filter.id);
              }}
              onClick={() => {
                soundFX.playSelect();
                setSelectedFilter((cur) => (cur === filter.id ? null : filter.id));
              }}
              style={{
                backgroundColor: isUsed ? '#D7D1C8' : filter.color,
              }}
              className={`mars-btn py-3 px-1.5 rounded-xl flex flex-col items-center gap-1 text-[#FAF0DC] cursor-pointer transition-transform ${
                isUsed
                  ? 'opacity-40 cursor-not-allowed'
                  : isSelected
                  ? 'ring-3 ring-[#292C2B] scale-105'
                  : 'hover:-translate-y-0.5'
              }`}
            >
              <Droplets className="w-5 h-5" aria-hidden="true" />
              <span className="text-[11px] font-extrabold leading-none">
                {filter.symbol} {filter.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- 3. WATER STORAGE: STOP THE LEAKS ----------
const LEAK_SPOTS = [
  { id: 0, x: 24, y: 34 },
  { id: 1, x: 68, y: 28 },
  { id: 2, x: 46, y: 52 },
  { id: 3, x: 22, y: 70 },
  { id: 4, x: 74, y: 66 },
  { id: 5, x: 50, y: 80 },
];

export function WaterLeakGame({ onWin, paused = false }: MinigameProps) {
  const [sealed, setSealed] = useState<number[]>([]);
  const [waterLeft, setWaterLeft] = useState(100);
  const [failed, setFailed] = useState(false);
  const wonRef = useRef(false);

  useEffect(() => {
    if (paused || failed || wonRef.current) return;
    const timer = window.setInterval(() => {
      const openCount = LEAK_SPOTS.length - sealed.length;
      if (openCount <= 0) return;
      setWaterLeft((prev) => {
        const next = Math.max(0, prev - openCount * 0.22);
        if (next <= 0) {
          soundFX.playError();
          setFailed(true);
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [paused, failed, sealed.length]);

  const patchLeak = (id: number) => {
    if (failed || sealed.includes(id) || wonRef.current) return;
    soundFX.playTick();
    const next = [...sealed, id];
    setSealed(next);
    if (next.length === LEAK_SPOTS.length && !wonRef.current) {
      wonRef.current = true;
      soundFX.playRepair();
      window.setTimeout(onWin, 240);
    }
  };

  const reset = () => {
    soundFX.playSelect();
    setSealed([]);
    setWaterLeft(100);
    setFailed(false);
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Tap every spraying water leak to slap a patch seal on the Water Tank!
      </div>

      {/* Water Tank */}
      <div className="relative h-48 sm:h-56 rounded-2xl border-3 border-[#292C2B] bg-[#477C9B] overflow-hidden">
        {/* Water Level Background */}
        <div
          className="absolute inset-x-0 bottom-0 bg-[#7BD8F8]/70 transition-all duration-100"
          style={{ height: `${waterLeft}%` }}
        />
        {/* Tank Rib Bands */}
        <div className="absolute inset-x-0 top-1/3 h-2 bg-[#F1D8A8]/70 border-y border-[#292C2B]" />
        <div className="absolute inset-x-0 top-2/3 h-2 bg-[#F1D8A8]/70 border-y border-[#292C2B]" />

        {/* Leak Targets */}
        {LEAK_SPOTS.map((spot) => {
          const isPatched = sealed.includes(spot.id);
          return (
            <button
              key={spot.id}
              type="button"
              disabled={isPatched || failed}
              onClick={() => patchLeak(spot.id)}
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
              aria-label={isPatched ? 'Patched leak' : 'Tap to patch water leak'}
              className={`absolute -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-[#292C2B] flex items-center justify-center transition-transform cursor-pointer ${
                isPatched
                  ? 'bg-[#718B78] text-[#FAF0DC] scale-95 cursor-default'
                  : 'bg-[#FFF4C7] hover:scale-110 active:scale-95 text-[#297194] animate-pulse'
              }`}
            >
              {isPatched ? (
                <ShieldCheck className="w-6 h-6" aria-hidden="true" />
              ) : (
                <Droplets className="w-6 h-6" aria-hidden="true" />
              )}
            </button>
          );
        })}

        {failed && (
          <div className="absolute inset-0 bg-[#292C2B]/80 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <div className="text-sm font-extrabold text-[#FAF0DC]">Tank Drained!</div>
            <button
              type="button"
              onClick={reset}
              className="mars-btn px-4 py-2 bg-[#E9B77B] text-[#292C2B] text-xs font-extrabold cursor-pointer"
            >
              Try Again!
            </button>
          </div>
        )}
      </div>

      <div className="mars-panel-light p-2.5 space-y-1">
        <div className="flex justify-between text-xs font-extrabold text-[#292C2B]">
          <span>Leaks Patched: {sealed.length}/{LEAK_SPOTS.length}</span>
          <span className="font-mono-tabular">Tank Water: {Math.round(waterLeft)}%</span>
        </div>
        <div className="h-3 w-full bg-[#F1D8A8] border-2 border-[#292C2B] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#477C9B] transition-all duration-100"
            style={{ width: `${waterLeft}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- 4. OXYGEN STORAGE: PRESSURE CONTROL ----------
export function OxygenPressureGame({ onWin, paused = false }: MinigameProps) {
  const [valve, setValve] = useState(25);
  const [drift, setDrift] = useState(0);
  const [holdPct, setHoldPct] = useState(0);
  const wonRef = useRef(false);

  useEffect(() => {
    if (paused || wonRef.current) return;
    let tick = 0;
    const timer = window.setInterval(() => {
      tick += 0.12;
      setDrift(Math.sin(tick) * 4.5);
    }, 100);
    return () => window.clearInterval(timer);
  }, [paused]);

  const psi = Math.round(Math.max(10, Math.min(115, 22 + valve * 0.85 + drift)));
  const inSafeZone = psi >= 55 && psi <= 75;

  useEffect(() => {
    if (paused || wonRef.current) return;
    if (!inSafeZone) {
      setHoldPct(0);
      return;
    }
    const timer = window.setInterval(() => {
      setHoldPct((prev) => {
        const next = Math.min(100, prev + 14);
        if (next >= 100 && !wonRef.current) {
          wonRef.current = true;
          soundFX.playRepair();
          window.setTimeout(onWin, 220);
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [inSafeZone, paused, onWin]);

  const needleDeg = -85 + ((psi - 10) / 105) * 170;

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Turn the Oxygen Valve until the gauge needle stays inside the green SAFE ZONE (55–75 PSI)!
      </div>

      {/* Pressure Gauge */}
      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#313638] p-2.5 sm:p-3 flex flex-col items-center">
        <svg viewBox="0 0 240 135" className="w-52 h-28 sm:w-60 sm:h-32 block">
          {/* Gauge Arc Background */}
          <path
            d="M 30 115 A 90 90 0 0 1 210 115"
            fill="none"
            stroke="#5C524C"
            strokeWidth={18}
            strokeLinecap="round"
          />
          {/* Safe Green Zone Arc (55-75 PSI) */}
          <path
            d="M 103 27 A 90 90 0 0 1 142 28"
            fill="none"
            stroke="#718B78"
            strokeWidth={20}
            strokeLinecap="round"
          />
          {/* Needle */}
          <g transform={`translate(120, 115) rotate(${needleDeg})`}>
            <line x1={0} y1={0} x2={0} y2={-78} stroke="#FAF0DC" strokeWidth={4.5} strokeLinecap="round" />
            <circle cx={0} cy={0} r={9} fill="#E9B77B" stroke="#292C2B" strokeWidth={2.5} />
          </g>
        </svg>

        <div
          className={`mt-1 px-3 py-1 rounded-full border-2 border-[#292C2B] text-xs font-extrabold tabular-nums flex items-center gap-1.5 ${
            inSafeZone ? 'bg-[#718B78] text-[#FAF0DC]' : 'bg-[#F1D8A8] text-[#292C2B]'
          }`}
        >
          <Gauge className="w-4 h-4" aria-hidden="true" />
          <span>{psi} PSI {inSafeZone ? '· SAFE!' : '(Aim 55–75)'}</span>
        </div>
      </div>

      {/* Valve Controls */}
      <div className="mars-panel-light p-3.5 space-y-3">
        <MinigameSlider
          ariaLabel="Oxygen pressure valve"
          min={0}
          max={100}
          value={valve}
          onChange={setValve}
          accentColor="#477C9B"
          inTarget={inSafeZone}
          minLabel="0% Closed"
          targetLabel="Adjust Valve for 55–75 PSI"
          maxLabel="100% Open"
          leftControl={
            <button
              type="button"
              onClick={() => {
                soundFX.playTick();
                setValve((v) => Math.max(0, v - 6));
              }}
              aria-label="Decrease pressure valve"
              className="mars-btn w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B] cursor-pointer"
            >
              <Minus className="w-4 h-4" aria-hidden="true" />
            </button>
          }
          rightControl={
            <button
              type="button"
              onClick={() => {
                soundFX.playTick();
                setValve((v) => Math.min(100, v + 6));
              }}
              aria-label="Increase pressure valve"
              className="mars-btn w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B] cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
            </button>
          }
        />

        <div className="pt-2.5 border-t border-[#292C2B]/15 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-extrabold text-[#292C2B]">
            <span>Pressure Hold</span>
            <span className="font-mono-tabular text-[#396344]">
              {inSafeZone ? `${holdPct}%` : 'Hold needle in green'}
            </span>
          </div>
          <div className="h-3.5 w-full bg-[#F1D8A8] border-2 border-[#292C2B] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#718B78] transition-all duration-100"
              style={{ width: `${inSafeZone ? Math.max(12, holdPct) : 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- 5. OXYGEN GENERATOR MAINTENANCE: AIR FILTER DUST CLEAN ----------
const FAN_CLUMPS = [
  { id: 0, label: 'Upper Left' },
  { id: 1, label: 'Intake Rim' },
  { id: 2, label: 'Center Mesh' },
  { id: 3, label: 'Lower Vent' },
  { id: 4, label: 'Exhaust Lip' },
];

export function AirFilterCleanGame({ onWin }: MinigameProps) {
  const [cleared, setCleared] = useState<number[]>([]);
  const [fansStarted, setFansStarted] = useState(false);
  const wonRef = useRef(false);

  const allClear = cleared.length >= FAN_CLUMPS.length;

  const tapClump = (id: number) => {
    if (cleared.includes(id) || wonRef.current) return;
    soundFX.playTick();
    setCleared((prev) => [...prev, id]);
  };

  const restartFans = () => {
    if (!allClear || fansStarted || wonRef.current) return;
    setFansStarted(true);
    wonRef.current = true;
    soundFX.playRepair();
    window.setTimeout(onWin, 250);
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Tap all 5 red dust clumps clogging the O2 Intake Filters, then tap Restart Fans!
      </div>

      <div className="rounded-2xl border-3 border-[#292C2B] bg-[#313C42] p-3 space-y-2.5">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-1.5">
          {FAN_CLUMPS.map((clump) => {
            const isClean = cleared.includes(clump.id);
            return (
              <button
                key={clump.id}
                type="button"
                disabled={isClean}
                onClick={() => tapClump(clump.id)}
                aria-label={isClean ? `${clump.label} clean` : `Clean ${clump.label}`}
                className={`min-h-[72px] sm:min-h-[82px] p-1.5 rounded-xl border-2 border-[#292C2B] flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  isClean
                    ? 'bg-[#6CA4C4] text-[#FAF0DC] cursor-default'
                    : 'bg-[#B94F32] hover:bg-[#C85A3F] text-[#FAF0DC]'
                }`}
              >
                {isClean ? (
                  <Sparkles className="w-5 h-5 text-[#FAF0DC]" aria-hidden="true" />
                ) : (
                  <Wind className="w-5 h-5 text-[#F1D8A8]" aria-hidden="true" />
                )}
                <span className="text-[10px] font-extrabold leading-tight text-center">
                  {isClean ? 'Clean' : 'Dust!'}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={!allClear || fansStarted}
          onClick={restartFans}
          className={`mars-btn w-full min-h-[46px] py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm font-extrabold ${
            !allClear
              ? 'bg-[#51595D] text-[#FAF0DC]/50 cursor-not-allowed'
              : fansStarted
              ? 'bg-[#396344] text-[#FAF0DC]'
              : 'bg-[#718B78] hover:bg-[#5E7865] text-[#FAF0DC] cursor-pointer'
          }`}
        >
          <Wind className="w-4 h-4" aria-hidden="true" />
          <span>
            {fansStarted
              ? 'MOXIE Fans Spinning Clean!'
              : allClear
              ? 'Restart O2 Fans!'
              : `Clear ${FAN_CLUMPS.length - cleared.length} more dust clump(s)`}
          </span>
        </button>
      </div>
    </div>
  );
}

// ---------- 6. WATER RECOVERY MAINTENANCE: FLUSH VALVES IN ORDER ----------
const FLUSH_VALVES = [
  { id: 1, label: 'Intake Valve' },
  { id: 2, label: 'Sediment Pump' },
  { id: 3, label: 'UV Membrane' },
  { id: 4, label: 'Clean Return' },
];

export function WaterValveFlushGame({ onWin }: MinigameProps) {
  const [nextStep, setNextStep] = useState(1);
  const [wrongId, setWrongId] = useState<number | null>(null);
  const wonRef = useRef(false);

  const openValve = (id: number) => {
    if (wonRef.current || id < nextStep) return;
    if (id === nextStep) {
      soundFX.playTick();
      const updated = nextStep + 1;
      setNextStep(updated);
      if (updated > FLUSH_VALVES.length && !wonRef.current) {
        wonRef.current = true;
        soundFX.playRepair();
        window.setTimeout(onWin, 250);
      }
    } else {
      soundFX.playError();
      setWrongId(id);
      window.setTimeout(() => setWrongId(null), 400);
    }
  };

  const clarityPct = Math.round(((nextStep - 1) / FLUSH_VALVES.length) * 100);

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Open the 4 Water Flush Valves in order (#1 → #2 → #3 → #4) to flush silt out of the pipes!
      </div>

      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#313C42] p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          {FLUSH_VALVES.map((valve) => {
            const flushed = valve.id < nextStep;
            const isNext = valve.id === nextStep;
            const isWrong = wrongId === valve.id;
            return (
              <button
                key={valve.id}
                type="button"
                disabled={flushed}
                onClick={() => openValve(valve.id)}
                className={`mars-btn min-h-[72px] p-2.5 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-all ${
                  flushed
                    ? 'bg-[#477C9B] text-[#FAF0DC] cursor-default'
                    : isWrong
                    ? 'bg-[#C94B43] text-[#FAF0DC]'
                    : isNext
                    ? 'bg-[#FAF0DC] hover:bg-[#F1D8A8] text-[#292C2B] ring-3 ring-[#6BE0FF]'
                    : 'bg-[#465154] text-[#FAF0DC]'
                }`}
              >
                <div className="text-left min-w-0">
                  <div className="text-[11px] font-black opacity-80">#{valve.id}</div>
                  <div className="text-xs font-extrabold truncate">{valve.label}</div>
                </div>
                <Droplets
                  className={`w-5 h-5 shrink-0 ${flushed ? 'text-[#89E5FF]' : 'text-[#E9B77B]'}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs font-extrabold text-[#FAF0DC]">
            <span>Pipe Water Clarity</span>
            <span className="font-mono-tabular">{clarityPct}%</span>
          </div>
          <div className="h-3 w-full bg-[#20272B] border border-[#FAF0DC]/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#6BE0FF] transition-all duration-200"
              style={{ width: `${clarityPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- 7. WATER STORAGE MAINTENANCE: HEATER COIL THAW ----------
export function WaterHeaterCoilGame({ onWin }: MinigameProps) {
  const [upperTemp, setUpperTemp] = useState(-10);
  const [lowerTemp, setLowerTemp] = useState(-6);
  const wonRef = useRef(false);

  const isWarm = (t: number) => t >= 15 && t <= 25;
  const bothWarm = isWarm(upperTemp) && isWarm(lowerTemp);

  const checkWarmth = (u: number, l: number) => {
    if (isWarm(u) && isWarm(l) && !wonRef.current) {
      wonRef.current = true;
      soundFX.playRepair();
      window.setTimeout(onWin, 250);
    }
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Warm both Water Tank Heater Coils into the 15°C–25°C safe zone to thaw frost and stop freezing!
      </div>

      {[
        {
          label: 'Upper Tank Coil',
          value: upperTemp,
          setVal: (v: number) => {
            setUpperTemp(v);
            checkWarmth(v, lowerTemp);
          },
        },
        {
          label: 'Lower Pipe Coil',
          value: lowerTemp,
          setVal: (v: number) => {
            setLowerTemp(v);
            checkWarmth(upperTemp, v);
          },
        },
      ].map((coil) => {
        const ok = isWarm(coil.value);
        return (
          <div key={coil.label} className="mars-panel-light p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-extrabold">
              <span className="flex items-center gap-1.5">
                <Flame
                  className={`w-4 h-4 ${ok ? 'text-[#396344]' : 'text-[#D77B4A]'}`}
                  aria-hidden="true"
                />
                <span>{coil.label}</span>
              </span>
              <span className={`font-mono-tabular ${ok ? 'text-[#396344]' : 'text-[#477C9B]'}`}>
                {coil.value}°C {ok ? '· Thawed' : '(Aim 15–25°C)'}
              </span>
            </div>

            <MinigameSlider
              ariaLabel={coil.label}
              min={-15}
              max={35}
              value={coil.value}
              onChange={coil.setVal}
              accentColor="#D77B4A"
              targetRange={{ min: 15, max: 25 }}
              inTarget={ok}
              minLabel="-15°C"
              targetLabel="Green Zone: 15–25°C"
              maxLabel="35°C"
            />
          </div>
        );
      })}

      <div className="text-center text-xs font-extrabold text-[#396344]">
        {bothWarm ? 'Heater Coils Warm & Frost-Free!' : 'Keep both coils steady in green zone'}
      </div>
    </div>
  );
}

// ---------- 8. OXYGEN STORAGE MAINTENANCE: VALVE SEAM CHECK ----------
const O2_VALVES = [
  { id: 0, label: 'Tank A Crown' },
  { id: 1, label: 'Tank A Collar' },
  { id: 2, label: 'Tank B Crown' },
  { id: 3, label: 'Tank B Collar' },
];

export function OxygenValveCheckGame({ onWin }: MinigameProps) {
  const [checks, setChecks] = useState<number[]>([0, 0, 0, 0]);
  const wonRef = useRef(false);

  const inspectValve = (idx: number) => {
    if (wonRef.current || checks[idx] >= 2) return;
    soundFX.playTick();
    setChecks((prev) => {
      const next = prev.map((v, i) => (i === idx ? Math.min(2, v + 1) : v));
      if (next.every((v) => v >= 2) && !wonRef.current) {
        wonRef.current = true;
        soundFX.playRepair();
        window.setTimeout(onWin, 250);
      }
      return next;
    });
  };

  const sealedCount = checks.filter((c) => c >= 2).length;

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Tap each O2 Tank Valve twice to inspect the gasket and lock the high-pressure seal!
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {O2_VALVES.map((valve) => {
          const lvl = checks[valve.id];
          const sealed = lvl >= 2;
          const tested = lvl === 1;
          return (
            <button
              key={valve.id}
              type="button"
              disabled={sealed}
              onClick={() => inspectValve(valve.id)}
              className={`mars-btn min-h-[82px] p-3 rounded-2xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                sealed
                  ? 'bg-[#718B78] text-[#FAF0DC] cursor-default'
                  : tested
                  ? 'bg-[#6CA4C4] text-[#FAF0DC]'
                  : 'bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B]'
              }`}
            >
              {sealed ? (
                <ShieldCheck className="w-6 h-6" aria-hidden="true" />
              ) : (
                <Gauge className="w-6 h-6" aria-hidden="true" />
              )}
              <span className="text-xs font-extrabold">{valve.label}</span>
              <span className="text-[10px] font-bold opacity-90">
                {sealed ? 'Airtight ✓' : tested ? '1 more tap to lock' : 'Hissing — Tap 2×'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mars-panel-light p-2.5 flex items-center justify-between text-xs font-extrabold text-[#292C2B]">
        <span>Valves Sealed</span>
        <span className="font-mono-tabular">
          {sealedCount} / {O2_VALVES.length}
        </span>
      </div>
    </div>
  );
}

// ---------- 9. OXYGEN GENERATOR #3: CO2 SIEVE CARTRIDGE PURGE ----------
const SIEVE_CELLS = [
  { id: 0, label: 'Zeolite Bed A' },
  { id: 1, label: 'Zirconia Stack' },
  { id: 2, label: 'Zeolite Bed B' },
  { id: 3, label: 'CO2 Exhaust' },
];

export function OxygenSievePurgeGame({ onWin }: MinigameProps) {
  const [purged, setPurged] = useState<number[]>([]);
  const [heaterC, setHeaterC] = useState(420);
  const wonRef = useRef(false);

  const tempReady = heaterC >= 760 && heaterC <= 840;

  const checkWin = (nextPurged: number[], nextTemp: number) => {
    if (
      nextPurged.length === SIEVE_CELLS.length &&
      nextTemp >= 760 &&
      nextTemp <= 840 &&
      !wonRef.current
    ) {
      wonRef.current = true;
      soundFX.playRepair();
      window.setTimeout(onWin, 250);
    }
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Purge all 4 CO2 Scrubber Chambers and warm the MOXIE Electrolyzer to 760°C–840°C!
      </div>

      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#313C42] p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          {SIEVE_CELLS.map((cell) => {
            const clean = purged.includes(cell.id);
            return (
              <button
                key={cell.id}
                type="button"
                disabled={clean}
                onClick={() => {
                  if (clean || wonRef.current) return;
                  soundFX.playTick();
                  const next = [...purged, cell.id];
                  setPurged(next);
                  checkWin(next, heaterC);
                }}
                className={`mars-btn min-h-[68px] p-2.5 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                  clean
                    ? 'bg-[#718B78] text-[#FAF0DC] cursor-default'
                    : 'bg-[#FAF0DC] hover:bg-[#F1D8A8] text-[#292C2B]'
                }`}
              >
                <div className="text-left min-w-0">
                  <div className="text-xs font-extrabold truncate">{cell.label}</div>
                  <div className="text-[10px] font-bold opacity-85">
                    {clean ? 'Purged ✓' : 'CO2 Clogged'}
                  </div>
                </div>
                {clean ? (
                  <Check className="w-5 h-5 text-[#FAF0DC] shrink-0" aria-hidden="true" />
                ) : (
                  <Wind className="w-5 h-5 text-[#B94F32] shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-3 rounded-xl bg-[#242C30] border border-[#FAF0DC]/25 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-extrabold text-[#FAF0DC]">
            <span className="flex items-center gap-1.5">
              <Thermometer className={`w-4 h-4 ${tempReady ? 'text-[#9BF08E]' : 'text-[#F4C552]'}`} aria-hidden="true" />
              <span>MOXIE Stack Temp</span>
            </span>
            <span className={`font-mono-tabular ${tempReady ? 'text-[#9BF08E]' : 'text-[#F4C552]'}`}>
              {heaterC}°C {tempReady ? '· Active' : '(Aim 760–840°C)'}
            </span>
          </div>
          <MinigameSlider
            ariaLabel="MOXIE stack temperature"
            min={400}
            max={900}
            step={10}
            value={heaterC}
            onChange={(v) => {
              setHeaterC(v);
              checkWin(purged, v);
            }}
            theme="dark"
            accentColor="#D77B4A"
            targetRange={{ min: 760, max: 840 }}
            inTarget={tempReady}
            minLabel="400°C"
            targetLabel="Green Zone: 760–840°C"
            maxLabel="900°C"
          />
        </div>
      </div>

      <div className="text-center text-xs font-extrabold text-[#292C2B]">
        Chambers Purged: {purged.length} / {SIEVE_CELLS.length}
      </div>
    </div>
  );
}

// ---------- 10. OXYGEN STORAGE #3: TWIN TANK BALANCE ----------
export function OxygenCryoMixGame({ onWin }: MinigameProps) {
  const [tankA, setTankA] = useState(40);
  const [tankB, setTankB] = useState(90);
  const wonRef = useRef(false);

  const okA = tankA >= 65 && tankA <= 78;
  const okB = tankB >= 65 && tankB <= 78;

  const adjustTank = (which: 'A' | 'B', delta: number) => {
    if (wonRef.current) return;
    soundFX.playTick();
    const nextA = which === 'A' ? Math.max(20, Math.min(100, tankA + delta)) : tankA;
    const nextB = which === 'B' ? Math.max(20, Math.min(100, tankB + delta)) : tankB;
    setTankA(nextA);
    setTankB(nextB);
    if (nextA >= 65 && nextA <= 78 && nextB >= 65 && nextB <= 78 && !wonRef.current) {
      wonRef.current = true;
      soundFX.playRepair();
      window.setTimeout(onWin, 250);
    }
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Equalize both O2 Reserve Tanks so each holds 65–78 bar steady pressure!
      </div>

      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#313C42] p-3 space-y-2.5">
        {[
          { label: 'North O2 Reserve', val: tankA, ok: okA, which: 'A' as const },
          { label: 'South O2 Reserve', val: tankB, ok: okB, which: 'B' as const },
        ].map((tank) => (
          <div key={tank.which} className="p-2.5 rounded-xl bg-[#242C30] border border-[#FAF0DC]/20 space-y-2">
            <div className="flex items-center justify-between text-xs font-extrabold text-[#FAF0DC]">
              <span>{tank.label}</span>
              <span className={`font-mono-tabular ${tank.ok ? 'text-[#9BF08E]' : 'text-[#F4C552]'}`}>
                {tank.val} bar {tank.ok ? '· Balanced ✓' : '(Aim 65–78)'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => adjustTank(tank.which, -8)}
                aria-label={`Vent ${tank.label}`}
                className="mars-btn w-11 h-11 rounded-xl bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B] flex items-center justify-center cursor-pointer shrink-0"
              >
                <Minus className="w-4 h-4" aria-hidden="true" />
              </button>
              <div className="relative flex-1 h-5 bg-[#1B2226] border-2 border-[#FAF0DC]/30 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 bg-[#718B78]/35 border-x border-[#9BF08E]"
                  style={{ left: '56.25%', width: '16.25%' }}
                />
                <div
                  className="h-full transition-all duration-150"
                  style={{
                    width: `${((tank.val - 20) / 80) * 100}%`,
                    backgroundColor: tank.ok ? '#718B78' : tank.val > 78 ? '#C94B43' : '#6CA4C4',
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => adjustTank(tank.which, 8)}
                aria-label={`Fill ${tank.label}`}
                className="mars-btn w-11 h-11 rounded-xl bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B] flex items-center justify-center cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center text-xs font-extrabold text-[#396344]">
        {okA && okB ? 'O2 Reserves Balanced!' : 'Adjust both tanks into the green band'}
      </div>
    </div>
  );
}

// ---------- 11. WATER RECYCLING #3: SENSOR CALIBRATION ----------
const TDS_SENSORS = [
  { id: 0, label: 'Brine Probe' },
  { id: 1, label: 'RO Membrane' },
  { id: 2, label: 'UV Sensor' },
];

export function WaterSensorCalibrateGame({ onWin }: MinigameProps) {
  const [rinsed, setRinsed] = useState<number[]>([]);
  const [phValue, setPhValue] = useState(52); // represents 5.2 pH
  const wonRef = useRef(false);

  const phOk = phValue >= 68 && phValue <= 74;

  const checkDone = (nextRinsed: number[], nextPh: number) => {
    if (
      nextRinsed.length === TDS_SENSORS.length &&
      nextPh >= 68 &&
      nextPh <= 74 &&
      !wonRef.current
    ) {
      wonRef.current = true;
      soundFX.playRepair();
      window.setTimeout(onWin, 250);
    }
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Rinse all 3 Water Quality Sensors and calibrate Drinking Water pH between 6.8 and 7.4!
      </div>

      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#313C42] p-3 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {TDS_SENSORS.map((sensor) => {
            const clean = rinsed.includes(sensor.id);
            return (
              <button
                key={sensor.id}
                type="button"
                disabled={clean}
                onClick={() => {
                  if (clean || wonRef.current) return;
                  soundFX.playTick();
                  const next = [...rinsed, sensor.id];
                  setRinsed(next);
                  checkDone(next, phValue);
                }}
                className={`mars-btn min-h-[72px] p-2 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  clean
                    ? 'bg-[#477C9B] text-[#FAF0DC] cursor-default'
                    : 'bg-[#FAF0DC] hover:bg-[#DCEEF8] text-[#292C2B]'
                }`}
              >
                {clean ? (
                  <Sparkles className="w-5 h-5 text-[#89E5FF]" aria-hidden="true" />
                ) : (
                  <Droplets className="w-5 h-5 text-[#B94F32]" aria-hidden="true" />
                )}
                <span className="text-[11px] font-extrabold text-center leading-tight">
                  {sensor.label}
                </span>
                <span className="text-[10px] font-bold opacity-80">
                  {clean ? 'Clean ✓' : 'Rinse'}
                </span>
              </button>
            );
          })}
        </div>

        <div className="p-3 rounded-xl bg-[#242C30] border border-[#FAF0DC]/25 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-extrabold text-[#FAF0DC]">
            <span>Output Water pH</span>
            <span className={`font-mono-tabular ${phOk ? 'text-[#9BF08E]' : 'text-[#F4C552]'}`}>
              {(phValue / 10).toFixed(1)} pH {phOk ? '· Pure' : '(Aim 6.8–7.4)'}
            </span>
          </div>
          <MinigameSlider
            ariaLabel="Output water pH"
            min={45}
            max={90}
            value={phValue}
            onChange={(v) => {
              setPhValue(v);
              checkDone(rinsed, v);
            }}
            theme="dark"
            accentColor="#6CA4C4"
            targetRange={{ min: 68, max: 74 }}
            inTarget={phOk}
            minLabel="4.5 pH"
            targetLabel="Green Zone: 6.8–7.4 pH"
            maxLabel="9.0 pH"
          />
        </div>
      </div>

      <div className="text-center text-xs font-extrabold text-[#292C2B]">
        Sensors Rinsed: {rinsed.length} / {TDS_SENSORS.length}
      </div>
    </div>
  );
}

// ---------- 12. WATER STORAGE #3: BLEED AIR & PRIME BOOSTER PUMP ----------
const BLEED_STEPS = [
  { id: 1, label: 'Bleed Air Vent' },
  { id: 2, label: 'Flood Impeller' },
  { id: 3, label: 'Spin Booster' },
  { id: 4, label: 'Lock Flow Valve' },
];

export function WaterPumpPrimeGame({ onWin }: MinigameProps) {
  const [nextStep, setNextStep] = useState(1);
  const [wrongId, setWrongId] = useState<number | null>(null);
  const wonRef = useRef(false);

  const runStep = (id: number) => {
    if (wonRef.current || id < nextStep) return;
    if (id === nextStep) {
      soundFX.playTick();
      const updated = nextStep + 1;
      setNextStep(updated);
      if (updated > BLEED_STEPS.length && !wonRef.current) {
        wonRef.current = true;
        soundFX.playRepair();
        window.setTimeout(onWin, 250);
      }
    } else {
      soundFX.playError();
      setWrongId(id);
      window.setTimeout(() => setWrongId(null), 400);
    }
  };

  const pct = Math.round(((nextStep - 1) / BLEED_STEPS.length) * 100);

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Prime the Water Tank Booster Pump in sequence (#1 → #2 → #3 → #4) to restore tank flow!
      </div>

      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#313C42] p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          {BLEED_STEPS.map((step) => {
            const done = step.id < nextStep;
            const isNext = step.id === nextStep;
            const isWrong = wrongId === step.id;
            return (
              <button
                key={step.id}
                type="button"
                disabled={done}
                onClick={() => runStep(step.id)}
                className={`mars-btn min-h-[72px] p-2.5 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-all ${
                  done
                    ? 'bg-[#718B78] text-[#FAF0DC] cursor-default'
                    : isWrong
                    ? 'bg-[#C94B43] text-[#FAF0DC]'
                    : isNext
                    ? 'bg-[#FAF0DC] hover:bg-[#DCEEF8] text-[#292C2B] ring-3 ring-[#6BE0FF]'
                    : 'bg-[#465154] text-[#FAF0DC]'
                }`}
              >
                <div className="text-left min-w-0">
                  <div className="text-[11px] font-black opacity-80">#{step.id}</div>
                  <div className="text-xs font-extrabold truncate">{step.label}</div>
                </div>
                {done ? (
                  <Check className="w-5 h-5 text-[#FAF0DC] shrink-0" aria-hidden="true" />
                ) : (
                  <RotateCw className="w-5 h-5 text-[#6BE0FF] shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs font-extrabold text-[#FAF0DC]">
            <span>Booster Prime</span>
            <span className="font-mono-tabular">{pct}%</span>
          </div>
          <div className="h-3 w-full bg-[#20272B] border border-[#FAF0DC]/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#6BE0FF] transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

