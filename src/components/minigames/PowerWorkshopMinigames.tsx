import { useMemo, useRef, useState } from 'react';
import { BatteryCharging, Bolt, Check, Fan, Flame, Hammer, Minus, Paintbrush, Plus, Thermometer, Wrench, Zap } from 'lucide-react';
import { soundFX } from '../../systems/audio';
import { MinigameSlider } from './MinigameSlider';

interface MinigameProps {
  onWin: () => void;
  paused?: boolean;
}

interface WireNode {
  id: string;
  label: string;
  symbol: string;
  color: string;
}

const WIRE_NODES: WireNode[] = [
  { id: 'solar', label: 'Solar', symbol: '★', color: '#E29833' },
  { id: 'grid', label: 'Grid', symbol: '▲', color: '#477C9B' },
  { id: 'backup', label: 'Backup', symbol: '●', color: '#5A8F69' },
  { id: 'heater', label: 'Heater', symbol: '■', color: '#B94F32' },
];

export function BatteryWiresGame({ onWin }: MinigameProps) {
  const rightOrder = useMemo(() => {
    const shuffled = [...WIRE_NODES];
    // Deterministic-safe swap so right column isn't identically aligned top-to-bottom
    return [shuffled[2], shuffled[0], shuffled[3], shuffled[1]];
  }, []);

  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [errorPair, setErrorPair] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wonRef = useRef(false);

  const leftY = (idx: number) => 36 + idx * 54;
  const rightY = (idx: number) => 36 + idx * 54;

  const tryConnect = (leftId: string, rightId: string) => {
    if (connectedIds.includes(leftId) || wonRef.current) return;
    if (leftId === rightId) {
      soundFX.playTick();
      const next = [...connectedIds, leftId];
      setConnectedIds(next);
      setSelectedLeft(null);
      setDragPos(null);
      if (next.length === WIRE_NODES.length && !wonRef.current) {
        wonRef.current = true;
        soundFX.playRepair();
        window.setTimeout(onWin, 250);
      }
    } else {
      soundFX.playError();
      setErrorPair(rightId);
      setSelectedLeft(null);
      setDragPos(null);
      window.setTimeout(() => setErrorPair(null), 450);
    }
  };

  const toSvgCoords = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(1, rect.width)) * 340,
      y: ((clientY - rect.top) / Math.max(1, rect.height)) * 234,
    };
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Drag or tap each battery plug on the left to its matching symbol & color on the right!
      </div>

      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#313638] p-2.5">
        <svg
          ref={svgRef}
          viewBox="0 0 340 234"
          className="w-full h-48 sm:h-56 block touch-none"
          onPointerMove={(e) => {
            if (!selectedLeft) return;
            const pt = toSvgCoords(e.clientX, e.clientY);
            if (pt) setDragPos(pt);
          }}
          onPointerUp={(e) => {
            if (svgRef.current?.hasPointerCapture?.(e.pointerId)) {
              svgRef.current.releasePointerCapture(e.pointerId);
            }
            if (!selectedLeft) return;
            const pt = toSvgCoords(e.clientX, e.clientY);
            if (pt && pt.x > 205) {
              const nearestIdx = rightOrder.findIndex((_, idx) => Math.abs(rightY(idx) - pt.y) < 28);
              if (nearestIdx >= 0) {
                tryConnect(selectedLeft, rightOrder[nearestIdx].id);
                return;
              }
            }
            setDragPos(null);
          }}
          onPointerCancel={(e) => {
            if (svgRef.current?.hasPointerCapture?.(e.pointerId)) {
              svgRef.current.releasePointerCapture(e.pointerId);
            }
            setDragPos(null);
          }}
        >
          {/* Connected Wires */}
          {connectedIds.map((id) => {
            const lIdx = WIRE_NODES.findIndex((n) => n.id === id);
            const rIdx = rightOrder.findIndex((n) => n.id === id);
            const node = WIRE_NODES[lIdx];
            const y1 = leftY(lIdx);
            const y2 = rightY(rIdx);
            return (
              <path
                key={id}
                d={`M 98 ${y1} C 165 ${y1}, 175 ${y2}, 242 ${y2}`}
                fill="none"
                stroke={node.color}
                strokeWidth={7}
                strokeLinecap="round"
              />
            );
          })}

          {/* Live Drag Wire Preview */}
          {selectedLeft && dragPos && (
            <path
              d={`M 98 ${leftY(WIRE_NODES.findIndex((n) => n.id === selectedLeft))} C 155 ${leftY(
                WIRE_NODES.findIndex((n) => n.id === selectedLeft)
              )}, ${dragPos.x - 45} ${dragPos.y}, ${dragPos.x} ${dragPos.y}`}
              fill="none"
              stroke={WIRE_NODES.find((n) => n.id === selectedLeft)?.color ?? '#FAF0DC'}
              strokeWidth={6}
              strokeDasharray="6 5"
              strokeLinecap="round"
            />
          )}

          {/* Left Battery Terminals */}
          {WIRE_NODES.map((node, idx) => {
            const y = leftY(idx);
            const isConnected = connectedIds.includes(node.id);
            const isSelected = selectedLeft === node.id;
            return (
              <g
                key={node.id}
                onPointerDown={(e) => {
                  if (isConnected) return;
                  soundFX.playSelect();
                  svgRef.current?.setPointerCapture?.(e.pointerId);
                  setSelectedLeft(node.id);
                  setDragPos({ x: 98, y });
                }}
                className="cursor-pointer"
              >
                <rect
                  x={10}
                  y={y - 19}
                  width={90}
                  height={38}
                  rx={10}
                  fill={isConnected ? node.color : isSelected ? '#FFF4C7' : '#FAF0DC'}
                  stroke={isSelected ? '#F4C552' : '#292C2B'}
                  strokeWidth={isSelected ? 3.5 : 2.5}
                />
                <circle cx={96} cy={y} r={7} fill={node.color} stroke="#292C2B" strokeWidth={2} />
                <text
                  x={50}
                  y={y + 4}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="900"
                  fill={isConnected ? '#FAF0DC' : '#292C2B'}
                >
                  {node.symbol} {node.label}
                </text>
              </g>
            );
          })}

          {/* Right Bus Connectors */}
          {rightOrder.map((node, idx) => {
            const y = rightY(idx);
            const isConnected = connectedIds.includes(node.id);
            const isError = errorPair === node.id;
            return (
              <g
                key={node.id}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (selectedLeft) {
                    tryConnect(selectedLeft, node.id);
                  }
                }}
                onClick={() => {
                  if (selectedLeft) {
                    tryConnect(selectedLeft, node.id);
                  }
                }}
                className="cursor-pointer"
              >
                <rect
                  x={240}
                  y={y - 19}
                  width={90}
                  height={38}
                  rx={10}
                  fill={isError ? '#C94B43' : isConnected ? node.color : '#FAF0DC'}
                  stroke="#292C2B"
                  strokeWidth={2.5}
                />
                <circle cx={244} cy={y} r={7} fill={node.color} stroke="#292C2B" strokeWidth={2} />
                <text
                  x={288}
                  y={y + 4}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="900"
                  fill={isConnected || isError ? '#FAF0DC' : '#292C2B'}
                >
                  {node.symbol} {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-between text-xs font-extrabold text-[#292C2B] px-1">
        <span className="flex items-center gap-1">
          <Bolt className="w-4 h-4 text-[#B94F32]" aria-hidden="true" />
          Connected: {connectedIds.length} / {WIRE_NODES.length}
        </span>
        <span>{selectedLeft ? 'Now tap matching right plug!' : 'Pick a left plug'}</span>
      </div>
    </div>
  );
}

type ToolId = 'hammer' | 'wrench' | 'screwdriver' | 'brush';

interface ToolboxSlot {
  toolId: ToolId;
  name: string;
  bg: string;
}

const TOOLBOX_SLOTS: ToolboxSlot[] = [
  { toolId: 'hammer', name: 'Hammer', bg: '#E9B77B' },
  { toolId: 'wrench', name: 'Wrench', bg: '#89AA91' },
  { toolId: 'screwdriver', name: 'Screwdriver', bg: '#6CA4C4' },
  { toolId: 'brush', name: 'Brush', bg: '#F1D8A8' },
];

const BENCH_TOOLS: ToolboxSlot[] = [
  TOOLBOX_SLOTS[2], // Screwdriver
  TOOLBOX_SLOTS[0], // Hammer
  TOOLBOX_SLOTS[3], // Brush
  TOOLBOX_SLOTS[1], // Wrench
];

function ToolGraphic({ id, silhouette = false }: { id: ToolId; silhouette?: boolean }) {
  const cls = silhouette ? 'w-7 h-7 text-[#FAF0DC]/35' : 'w-7 h-7 text-[#292C2B]';
  if (id === 'wrench') return <Wrench className={cls} aria-hidden="true" />;
  if (id === 'hammer') return <Hammer className={cls} aria-hidden="true" />;
  if (id === 'brush') return <Paintbrush className={cls} aria-hidden="true" />;
  return (
    <svg
      viewBox="0 0 24 24"
      className={cls}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 4l6 6-4 4-6-6 4-4z" fill={silhouette ? 'none' : '#FAF0DC'} />
      <path d="M10 10L4 16l-1 4 4-1 6-6" />
    </svg>
  );
}

export function WorkshopToolsGame({ onWin }: MinigameProps) {
  const [selectedTool, setSelectedTool] = useState<ToolId | null>(null);
  const [placedIds, setPlacedIds] = useState<ToolId[]>([]);
  const [wrongSlot, setWrongSlot] = useState<ToolId | null>(null);
  const wonRef = useRef(false);

  const placeIntoToolbox = (slotToolId: ToolId, droppedToolId: ToolId) => {
    if (placedIds.includes(slotToolId) || wonRef.current) return;
    if (slotToolId === droppedToolId) {
      soundFX.playTick();
      const next = [...placedIds, slotToolId];
      setPlacedIds(next);
      setSelectedTool(null);
      if (next.length === TOOLBOX_SLOTS.length && !wonRef.current) {
        wonRef.current = true;
        soundFX.playRepair();
        window.setTimeout(onWin, 250);
      }
    } else {
      soundFX.playError();
      setWrongSlot(slotToolId);
      window.setTimeout(() => setWrongSlot(null), 420);
    }
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Tap or drag each tool from the bench into its matching slot inside the Workshop Toolbox!
      </div>

      {/* Mars Workshop Toolbox */}
      <div className="rounded-2xl border-3 border-[#292C2B] bg-[#B94F32] p-2.5 shadow-inner">
        <div className="flex items-center justify-between px-1 mb-2">
          <div className="h-2.5 w-16 rounded-full bg-[#292C2B] mx-auto" />
        </div>
        <div className="rounded-xl border-2 border-[#292C2B] bg-[#313638] p-2.5 grid grid-cols-2 gap-2">
          {TOOLBOX_SLOTS.map((slot) => {
            const isFilled = placedIds.includes(slot.toolId);
            const isWrong = wrongSlot === slot.toolId;
            return (
              <button
                key={slot.toolId}
                type="button"
                disabled={isFilled}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dragged = e.dataTransfer.getData('text/plain') as ToolId;
                  if (dragged) placeIntoToolbox(slot.toolId, dragged);
                }}
                onClick={() => {
                  if (selectedTool) placeIntoToolbox(slot.toolId, selectedTool);
                }}
                style={{
                  backgroundColor: isFilled ? slot.bg : isWrong ? '#7A2D28' : '#24282A',
                }}
                className={`h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer relative ${
                  isFilled
                    ? 'border-[#292C2B] text-[#292C2B] cursor-default'
                    : isWrong
                    ? 'border-[#F1D8A8]'
                    : selectedTool
                    ? 'border-dashed border-[#F4C552] hover:bg-[#2F3538]'
                    : 'border-dashed border-[#FAF0DC]/45'
                }`}
              >
                <ToolGraphic id={slot.toolId} silhouette={!isFilled} />
                <span
                  className={`text-[11px] font-extrabold leading-none ${
                    isFilled ? 'text-[#292C2B]' : 'text-[#FAF0DC]/65'
                  }`}
                >
                  {slot.name}
                </span>
                {isFilled && (
                  <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#718B78] border border-[#292C2B] flex items-center justify-center">
                    <Check className="w-3 h-3 text-[#FAF0DC]" aria-hidden="true" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loose Tools on Workbench */}
      <div className="mars-panel-light p-2.5">
        <div className="grid grid-cols-4 gap-2">
          {BENCH_TOOLS.map((tool) => {
            const isPlaced = placedIds.includes(tool.toolId);
            const isSelected = selectedTool === tool.toolId;
            return (
              <button
                key={tool.toolId}
                type="button"
                disabled={isPlaced}
                draggable={!isPlaced}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', tool.toolId);
                  setSelectedTool(tool.toolId);
                }}
                onClick={() => {
                  soundFX.playSelect();
                  setSelectedTool((cur) => (cur === tool.toolId ? null : tool.toolId));
                }}
                style={{ backgroundColor: isPlaced ? '#D7D1C8' : tool.bg }}
                className={`mars-btn py-2.5 px-1 rounded-xl flex flex-col items-center gap-1 cursor-pointer transition-transform ${
                  isPlaced
                    ? 'opacity-35 cursor-not-allowed'
                    : isSelected
                    ? 'ring-3 ring-[#B94F32] -translate-y-0.5'
                    : 'hover:-translate-y-0.5'
                }`}
              >
                <ToolGraphic id={tool.toolId} />
                <span className="text-[10px] font-extrabold text-[#292C2B] truncate max-w-full">
                  {tool.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- 3. BATTERY BANK MAINTENANCE: CELL BALANCING ----------
export function BatteryCellBalanceGame({ onWin }: MinigameProps) {
  const [cells, setCells] = useState<number[]>([35, 95, 45]);
  const wonRef = useRef(false);

  const isBalanced = (val: number) => val >= 65 && val <= 80;
  const balancedCount = cells.filter(isBalanced).length;

  const adjustCell = (idx: number, delta: number) => {
    if (wonRef.current) return;
    soundFX.playTick();
    setCells((prev) => {
      const next = prev.map((v, i) =>
        i === idx ? Math.max(10, Math.min(100, v + delta)) : v
      );
      if (next.every(isBalanced) && !wonRef.current) {
        wonRef.current = true;
        soundFX.playRepair();
        window.setTimeout(onWin, 250);
      }
      return next;
    });
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Tap + or – on each Battery Cell so all 3 stay inside the green 65%–80% Balance Band!
      </div>

      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#313638] p-3 space-y-2.5">
        {cells.map((val, idx) => {
          const ok = isBalanced(val);
          return (
            <div
              key={idx}
              className="p-2.5 rounded-xl bg-[#24282A] border border-[#FAF0DC]/20 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-extrabold text-[#FAF0DC]">
                <span className="flex items-center gap-1.5">
                  <BatteryCharging
                    className={`w-4 h-4 ${ok ? 'text-[#89AA91]' : 'text-[#F4C552]'}`}
                    aria-hidden="true"
                  />
                  <span>Cell Bank {String.fromCharCode(65 + idx)}</span>
                </span>
                <span className={`font-mono-tabular ${ok ? 'text-[#9BF08E]' : 'text-[#F4C552]'}`}>
                  {val}% {ok ? '· Balanced ✓' : '(Aim 65–80%)'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjustCell(idx, -10)}
                  aria-label={`Decrease cell ${idx + 1}`}
                  className="mars-btn w-11 h-11 rounded-xl bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B] flex items-center justify-center cursor-pointer shrink-0"
                >
                  <Minus className="w-4 h-4" aria-hidden="true" />
                </button>

                <div className="relative flex-1 h-5 bg-[#1B1E20] border-2 border-[#FAF0DC]/30 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 bg-[#718B78]/35 border-x border-[#9BF08E]"
                    style={{ left: '65%', width: '15%' }}
                  />
                  <div
                    className="h-full transition-all duration-150"
                    style={{
                      width: `${val}%`,
                      backgroundColor: ok ? '#718B78' : val > 80 ? '#C94B43' : '#E5A93B',
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => adjustCell(idx, 10)}
                  aria-label={`Increase cell ${idx + 1}`}
                  className="mars-btn w-11 h-11 rounded-xl bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B] flex items-center justify-center cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-center text-xs font-extrabold text-[#292C2B]">
        Cells Balanced: {balancedCount} / {cells.length}
      </div>
    </div>
  );
}

// ---------- 4. WORKSHOP MAINTENANCE: TORQUE LOOSE LATHE BOLTS ----------
const TORQUE_BOLTS = [
  { id: 0, label: 'Headstock Bolt' },
  { id: 1, label: 'Chuck Clamp' },
  { id: 2, label: 'Rail Lock' },
  { id: 3, label: 'Base Anchor' },
];

export function WorkshopTorqueBoltsGame({ onWin }: MinigameProps) {
  const [turns, setTurns] = useState<number[]>([0, 0, 0, 0]);
  const wonRef = useRef(false);

  const tightenBolt = (idx: number) => {
    if (wonRef.current || turns[idx] >= 2) return;
    soundFX.playTick();
    setTurns((prev) => {
      const next = prev.map((v, i) => (i === idx ? Math.min(2, v + 1) : v));
      if (next.every((v) => v >= 2) && !wonRef.current) {
        wonRef.current = true;
        soundFX.playRepair();
        window.setTimeout(onWin, 250);
      }
      return next;
    });
  };

  const doneCount = turns.filter((t) => t >= 2).length;

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Tap each Workshop Lathe bolt twice with your wrench to torque the bench clamp tight!
      </div>

      <div className="rounded-2xl border-3 border-[#292C2B] bg-[#464D52] p-3">
        <div className="grid grid-cols-2 gap-2.5">
          {TORQUE_BOLTS.map((b) => {
            const t = turns[b.id];
            const locked = t >= 2;
            const snug = t === 1;
            return (
              <button
                key={b.id}
                type="button"
                disabled={locked}
                onClick={() => tightenBolt(b.id)}
                className={`mars-btn min-h-[82px] p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  locked
                    ? 'bg-[#718B78] text-[#FAF0DC] cursor-default'
                    : snug
                    ? 'bg-[#E9B77B] hover:bg-[#DFAB6D] text-[#292C2B]'
                    : 'bg-[#FAF0DC] hover:bg-[#F1D8A8] text-[#292C2B]'
                }`}
              >
                <div
                  className="w-9 h-9 rounded-full border-2 border-[#292C2B] bg-[#F1D8A8] flex items-center justify-center transition-transform duration-150"
                  style={{ transform: `rotate(${t * 60}deg)` }}
                >
                  {locked ? (
                    <Check className="w-5 h-5 text-[#396344]" aria-hidden="true" />
                  ) : (
                    <Wrench className="w-4 h-4 text-[#292C2B]" aria-hidden="true" />
                  )}
                </div>
                <span className="text-xs font-extrabold leading-tight">{b.label}</span>
                <span className="text-[10px] font-bold opacity-85">
                  {locked ? 'Torqued!' : snug ? '1 more tap!' : 'Loose — Tap 2×'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mars-panel-light p-2.5 flex items-center justify-between text-xs font-extrabold text-[#292C2B]">
        <span>Bolts Torqued</span>
        <span className="font-mono-tabular">
          {doneCount} / {TORQUE_BOLTS.length}
        </span>
      </div>
    </div>
  );
}

// ---------- 5. BATTERY THERMAL VENTING (ENERGY STORAGE #3) ----------
const BATTERY_VENTS = [
  { id: 0, label: 'Core Cell A', startTemp: 58 },
  { id: 1, label: 'Inverter Fin', startTemp: 64 },
  { id: 2, label: 'Relay Bus', startTemp: 54 },
  { id: 3, label: 'Core Cell B', startTemp: 61 },
];

export function BatteryThermalVentGame({ onWin }: MinigameProps) {
  const [ventsOpen, setVentsOpen] = useState<boolean[]>([false, false, false, false]);
  const [fanBoost, setFanBoost] = useState(20);
  const wonRef = useRef(false);

  const checkSolved = (nextVents: boolean[], nextFan: number) => {
    if (nextVents.every(Boolean) && nextFan >= 65 && nextFan <= 85 && !wonRef.current) {
      wonRef.current = true;
      soundFX.playRepair();
      window.setTimeout(onWin, 250);
    }
  };

  const fanOk = fanBoost >= 65 && fanBoost <= 85;
  const openCount = ventsOpen.filter(Boolean).length;

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Open all 4 Battery Thermal Louvers and set Cooling Fan Airflow into the 65%–85% zone!
      </div>

      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#313638] p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          {BATTERY_VENTS.map((v, idx) => {
            const isOpen = ventsOpen[idx];
            const tempC = isOpen ? Math.max(22, v.startTemp - Math.round(fanBoost * 0.4)) : v.startTemp;
            return (
              <button
                key={v.id}
                type="button"
                disabled={isOpen}
                onClick={() => {
                  if (isOpen || wonRef.current) return;
                  soundFX.playTick();
                  const next = ventsOpen.map((flag, i) => (i === idx ? true : flag));
                  setVentsOpen(next);
                  checkSolved(next, fanBoost);
                }}
                className={`mars-btn min-h-[70px] p-2.5 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                  isOpen
                    ? 'bg-[#718B78] text-[#FAF0DC] cursor-default'
                    : 'bg-[#FAF0DC] hover:bg-[#F1D8A8] text-[#292C2B]'
                }`}
              >
                <div className="text-left min-w-0">
                  <div className="text-xs font-extrabold truncate">{v.label}</div>
                  <div className="text-[11px] font-mono-tabular font-bold opacity-85">
                    {tempC}°C · {isOpen ? 'Vent Open' : 'Hot!'}
                  </div>
                </div>
                {isOpen ? (
                  <Fan className="w-5 h-5 text-[#9BF08E] shrink-0" aria-hidden="true" />
                ) : (
                  <Flame className="w-5 h-5 text-[#C94B43] shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-3 rounded-xl bg-[#24282A] border border-[#FAF0DC]/25 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-extrabold text-[#FAF0DC]">
            <span className="flex items-center gap-1.5">
              <Thermometer className={`w-4 h-4 ${fanOk ? 'text-[#9BF08E]' : 'text-[#F4C552]'}`} aria-hidden="true" />
              <span>Cooling Fan Airflow</span>
            </span>
            <span className={`font-mono-tabular ${fanOk ? 'text-[#9BF08E]' : 'text-[#F4C552]'}`}>
              {fanBoost}% {fanOk ? '· Cool' : '(Aim 65–85%)'}
            </span>
          </div>
          <MinigameSlider
            ariaLabel="Battery cooling fan airflow"
            min={0}
            max={100}
            value={fanBoost}
            onChange={(nextFan) => {
              setFanBoost(nextFan);
              checkSolved(ventsOpen, nextFan);
            }}
            theme="dark"
            accentColor="#6CA4C4"
            targetRange={{ min: 65, max: 85 }}
            inTarget={fanOk}
            minLabel="0%"
            targetLabel="Green Zone: 65–85%"
            maxLabel="100%"
          />
        </div>
      </div>

      <div className="text-center text-xs font-extrabold text-[#292C2B]">
        Vents Open: {openCount} / {BATTERY_VENTS.length} {fanOk ? '· Fan Ready!' : ''}
      </div>
    </div>
  );
}

// ---------- 6. WORKSHOP CIRCUIT FUSE TEST (MAINTENANCE FACILITY #3) ----------
interface BenchFuse {
  id: string;
  label: string;
  ampLabel: string;
  color: string;
}

const BENCH_FUSES: BenchFuse[] = [
  { id: 'lathe', label: 'Lathe Drive', ampLabel: '30A', color: '#E29833' },
  { id: 'welder', label: 'Arc Welder', ampLabel: '50A', color: '#B94F32' },
  { id: 'drill', label: 'Core Drill', ampLabel: '20A', color: '#477C9B' },
  { id: 'lights', label: 'Bench Lamp', ampLabel: '10A', color: '#5A8F69' },
];

const FUSE_TRAY_ORDER: BenchFuse[] = [
  BENCH_FUSES[2],
  BENCH_FUSES[3],
  BENCH_FUSES[0],
  BENCH_FUSES[1],
];

export function WorkshopCircuitTestGame({ onWin }: MinigameProps) {
  const [selectedAmp, setSelectedAmp] = useState<string | null>(null);
  const [insertedIds, setInsertedIds] = useState<string[]>([]);
  const [wrongSlot, setWrongSlot] = useState<string | null>(null);
  const wonRef = useRef(false);

  const tryInsert = (slotId: string, fuseId: string) => {
    if (insertedIds.includes(slotId) || wonRef.current) return;
    if (slotId === fuseId) {
      soundFX.playTick();
      const next = [...insertedIds, slotId];
      setInsertedIds(next);
      setSelectedAmp(null);
      if (next.length === BENCH_FUSES.length && !wonRef.current) {
        wonRef.current = true;
        soundFX.playRepair();
        window.setTimeout(onWin, 250);
      }
    } else {
      soundFX.playError();
      setWrongSlot(slotId);
      window.setTimeout(() => setWrongSlot(null), 400);
    }
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Tap a spare Workshop Fuse below, then tap the breaker slot with the matching Amp rating!
      </div>

      <div className="rounded-2xl border-3 border-[#292C2B] bg-[#313638] p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          {BENCH_FUSES.map((slot) => {
            const ok = insertedIds.includes(slot.id);
            const isWrong = wrongSlot === slot.id;
            return (
              <button
                key={slot.id}
                type="button"
                disabled={ok}
                onClick={() => {
                  if (selectedAmp) tryInsert(slot.id, selectedAmp);
                }}
                style={{ backgroundColor: ok ? '#718B78' : isWrong ? '#8C2F2B' : '#24282A' }}
                className={`mars-btn min-h-[70px] p-2.5 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                  ok
                    ? 'text-[#FAF0DC] cursor-default'
                    : selectedAmp
                    ? 'text-[#FAF0DC] ring-2 ring-[#F4C552]'
                    : 'text-[#FAF0DC]'
                }`}
              >
                <div className="text-left min-w-0">
                  <div className="text-xs font-extrabold truncate">{slot.label}</div>
                  <div className="text-[11px] font-mono-tabular font-black text-[#F4C552]">
                    Needs {slot.ampLabel}
                  </div>
                </div>
                <span
                  className="w-8 h-8 rounded-lg border-2 border-[#292C2B] flex items-center justify-center shrink-0"
                  style={{ backgroundColor: ok ? '#FAF0DC' : slot.color }}
                >
                  {ok ? (
                    <Check className="w-4 h-4 text-[#396344]" aria-hidden="true" />
                  ) : (
                    <Zap className="w-4 h-4 text-[#FAF0DC]" aria-hidden="true" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mars-panel-light p-2.5 grid grid-cols-4 gap-2">
        {FUSE_TRAY_ORDER.map((fuse) => {
          const used = insertedIds.includes(fuse.id);
          const selected = selectedAmp === fuse.id;
          return (
            <button
              key={fuse.id}
              type="button"
              disabled={used}
              onClick={() => {
                soundFX.playSelect();
                setSelectedAmp((cur) => (cur === fuse.id ? null : fuse.id));
              }}
              style={{ backgroundColor: used ? '#D7D1C8' : fuse.color }}
              className={`mars-btn min-h-[52px] py-2.5 px-1 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[#FAF0DC] cursor-pointer transition-transform ${
                used
                  ? 'opacity-35 cursor-not-allowed'
                  : selected
                  ? 'ring-3 ring-[#292C2B] -translate-y-0.5'
                  : 'hover:-translate-y-0.5'
              }`}
            >
              <Zap className="w-4 h-4" aria-hidden="true" />
              <span className="text-xs font-black font-mono-tabular">{fuse.ampLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}



