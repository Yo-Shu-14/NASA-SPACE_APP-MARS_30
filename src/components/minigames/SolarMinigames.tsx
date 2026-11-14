import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, RotateCcw, RotateCw, Sparkles, Sun, Zap } from 'lucide-react';
import { soundFX } from '../../systems/audio';
import { MinigameSlider } from './MinigameSlider';

interface MinigameProps {
  onWin: () => void;
  paused?: boolean;
}

export function SolarAlignmentGame({ onWin, paused = false }: MinigameProps) {
  const targetAngle = useMemo(() => {
    const options = [-42, -28, 26, 40];
    return options[Math.floor(Math.random() * options.length)];
  }, []);

  const [angle, setAngle] = useState<number>(() => (targetAngle > 0 ? -48 : 48));
  const [holdProgress, setHoldProgress] = useState(0);
  const wonRef = useRef(false);

  const diff = Math.abs(angle - targetAngle);
  const alignmentPct = Math.max(0, Math.round(100 - (diff / 90) * 100));
  const isAligned = diff <= 7;

  useEffect(() => {
    if (paused || wonRef.current) return;
    if (!isAligned) {
      setHoldProgress(0);
      return;
    }
    const timer = window.setInterval(() => {
      setHoldProgress((prev) => {
        const next = Math.min(100, prev + 16);
        if (next >= 100 && !wonRef.current) {
          wonRef.current = true;
          soundFX.playRepair();
          window.setTimeout(onWin, 220);
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [isAligned, paused, onWin]);

  const sunX = 160 + Math.sin((targetAngle * Math.PI) / 180) * 105;
  const sunY = 34 + (1 - Math.cos((targetAngle * Math.PI) / 180)) * 28;

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Tilt the Solar Panels directly toward the Sun until the power bar locks green!
      </div>

      {/* Martian Sky & Rotatable Solar Array */}
      <div className="relative rounded-2xl border-2 border-[#292C2B] bg-gradient-to-b from-[#D98254] via-[#E9B77B] to-[#B86242] p-3 overflow-hidden">
        <svg
          viewBox="0 0 320 185"
          className="w-full h-36 sm:h-48 block"
          role="img"
          aria-label="Solar panel alignment view"
        >
          {/* Sun & Sunbeam Rays */}
          <line
            x1={sunX}
            y1={sunY}
            x2={160}
            y2={132}
            stroke="#FFF4B8"
            strokeWidth={isAligned ? 8 : 4}
            strokeDasharray={isAligned ? 'none' : '7 6'}
            opacity={isAligned ? 0.85 : 0.5}
          />
          <circle cx={sunX} cy={sunY} r={20} fill="#FFE680" stroke="#292C2B" strokeWidth={2.5} />
          <circle cx={sunX} cy={sunY} r={27} fill="#FFE680" opacity={0.28} />

          {/* Target angle arc marker */}
          <text
            x={sunX}
            y={sunY + 4}
            textAnchor="middle"
            fontSize="11"
            fontWeight="900"
            fill="#292C2B"
          >
            SUN
          </text>

          {/* Ground Horizon */}
          <rect x={0} y={154} width={320} height={35} fill="#8C4833" />
          <line x1={0} y1={154} x2={320} y2={154} stroke="#292C2B" strokeWidth={2.5} />

          {/* Pedestal Mast */}
          <rect x={152} y={130} width={16} height={30} rx={3} fill="#5C524C" stroke="#292C2B" strokeWidth={2.5} />

          {/* Tilted Solar Panel Wing */}
          <g transform={`translate(160, 132) rotate(${angle})`}>
            <rect
              x={-76}
              y={-18}
              width={152}
              height={22}
              rx={5}
              fill={isAligned ? '#3A8FB7' : '#477C9B'}
              stroke="#292C2B"
              strokeWidth={3}
            />
            {[-48, -16, 16, 48].map((cellX) => (
              <line
                key={cellX}
                x1={cellX}
                y1={-16}
                x2={cellX}
                y2={2}
                stroke="#A8DCFA"
                strokeWidth={1.6}
                opacity={0.7}
              />
            ))}
            <line
              x1={-72}
              y1={-7}
              x2={72}
              y2={-7}
              stroke="#A8DCFA"
              strokeWidth={1.4}
              opacity={0.65}
            />
            {/* Normal vector arrow pointing out from panel surface */}
            <line
              x1={0}
              y1={-18}
              x2={0}
              y2={-48}
              stroke={isAligned ? '#9BF08E' : '#FAF0DC'}
              strokeWidth={3}
              strokeLinecap="round"
            />
            <polygon
              points="0,-56 -6,-45 6,-45"
              fill={isAligned ? '#9BF08E' : '#FAF0DC'}
              stroke="#292C2B"
              strokeWidth={1.5}
            />
          </g>
        </svg>

        <div className="mt-1 flex items-center justify-between text-xs font-extrabold text-[#FAF0DC] drop-shadow-[0_1px_0_#292C2B]">
          <span className="flex items-center gap-1">
            <Sun className="w-4 h-4 text-[#FFE680]" aria-hidden="true" />
            Sunlight Match: {alignmentPct}%
          </span>
          <span>
            {isAligned ? 'Locking in Power...' : `Target Tilt: ${targetAngle > 0 ? 'Right' : 'Left'}`}
          </span>
        </div>
      </div>

      {/* Angle Controls + Lock Progress */}
      <div className="mars-panel-light p-3.5 space-y-3">
        <MinigameSlider
          ariaLabel="Solar panel angle"
          min={-55}
          max={55}
          step={1}
          value={angle}
          onChange={setAngle}
          accentColor="#B94F32"
          inTarget={isAligned}
          minLabel="-55°"
          targetLabel={`Panel Tilt: ${angle > 0 ? `+${angle}°` : `${angle}°`}`}
          maxLabel="+55°"
          leftControl={
            <button
              type="button"
              onClick={() => {
                soundFX.playTick();
                setAngle((a) => Math.max(-55, a - 6));
              }}
              aria-label="Tilt panels left"
              className="mars-btn px-2.5 sm:px-3 min-w-[44px] h-11 sm:h-10 bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B] flex items-center justify-center gap-1 text-xs font-extrabold cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Left</span>
            </button>
          }
          rightControl={
            <button
              type="button"
              onClick={() => {
                soundFX.playTick();
                setAngle((a) => Math.min(55, a + 6));
              }}
              aria-label="Tilt panels right"
              className="mars-btn px-2.5 sm:px-3 min-w-[44px] h-11 sm:h-10 bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B] flex items-center justify-center gap-1 text-xs font-extrabold cursor-pointer"
            >
              <span className="hidden sm:inline">Right</span>
              <RotateCw className="w-4 h-4" aria-hidden="true" />
            </button>
          }
        />

        <div className="pt-2.5 border-t border-[#292C2B]/15 space-y-1.5">
          <div className="flex justify-between text-[11px] font-extrabold text-[#292C2B]">
            <span>Power Lock</span>
            <span className="font-mono-tabular text-[#396344]">
              {isAligned ? `${holdProgress}%` : 'Align with sunbeam'}
            </span>
          </div>
          <div className="h-3.5 w-full bg-[#F1D8A8] border-2 border-[#292C2B] rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-100"
              style={{
                width: `${isAligned ? Math.max(12, holdProgress) : 0}%`,
                backgroundColor: '#718B78',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const COLS = 8;
const ROWS = 4;
const TOTAL_CELLS = COLS * ROWS;

export function SolarDustSwipeGame({ onWin }: MinigameProps) {
  const [dustCells, setDustCells] = useState<number[]>(() =>
    Array.from({ length: TOTAL_CELLS }, () => 1)
  );
  const scrubbingRef = useRef(false);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const wonRef = useRef(false);

  const remaining = dustCells.reduce((sum, v) => sum + v, 0);
  const cleanedPct = Math.min(100, Math.round(((TOTAL_CELLS - remaining) / TOTAL_CELLS) * 100));

  const scrubAtPoint = (clientX: number, clientY: number) => {
    const el = boardRef.current;
    if (!el || wonRef.current) return;
    const rect = el.getBoundingClientRect();
    const rx = (clientX - rect.left) / Math.max(1, rect.width);
    const ry = (clientY - rect.top) / Math.max(1, rect.height);
    if (rx < 0 || rx > 1 || ry < 0 || ry > 1) return;

    const col = Math.min(COLS - 1, Math.max(0, Math.floor(rx * COLS)));
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor(ry * ROWS)));

    setDustCells((prev) => {
      let changed = false;
      const next = [...prev];
      // Brush radius clears tapped cell + immediate horizontal neighbor for smooth kid-friendly swiping
      for (const [dc, dr] of [
        [0, 0],
        [-1, 0],
        [1, 0],
      ]) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) {
          const idx = nr * COLS + nc;
          if (next[idx] !== 0) {
            next[idx] = 0;
            changed = true;
          }
        }
      }
      if (!changed) return prev;
      soundFX.playTick();

      const nextLeft = next.reduce((s, v) => s + v, 0);
      if (nextLeft <= 2 && !wonRef.current) {
        wonRef.current = true;
        soundFX.playRepair();
        window.setTimeout(onWin, 220);
        return next.map(() => 0);
      }
      return next;
    });
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Swipe your finger or mouse across the dusty Solar Panels to brush the red Mars dust off!
      </div>

      {/* Scrubbable Solar Array Board */}
      <div
        ref={boardRef}
        onPointerDown={(e) => {
          scrubbingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          scrubAtPoint(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!scrubbingRef.current) return;
          scrubAtPoint(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          scrubbingRef.current = false;
        }}
        onPointerCancel={() => {
          scrubbingRef.current = false;
        }}
        className="relative rounded-2xl border-3 border-[#292C2B] bg-[#366482] p-2.5 touch-none cursor-grab active:cursor-grabbing"
      >
        <div className="grid grid-cols-8 gap-1.5">
          {dustCells.map((dirty, idx) => (
            <div
              key={idx}
              className={`h-10 sm:h-12 rounded-lg border-2 transition-all duration-150 flex items-center justify-center ${
                dirty
                  ? 'bg-[#C86641] border-[#8A3F25] shadow-inner'
                  : 'bg-[#4E93BE] border-[#292C2B]/70'
              }`}
            >
              {dirty ? (
                <div className="w-5 h-3 rounded-full bg-[#E9B77B]/65" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-[#DDF4FF]" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mars-panel-light p-2.5 space-y-1">
        <div className="flex justify-between text-xs font-extrabold text-[#292C2B]">
          <span>Dust Brushed Off</span>
          <span className="font-mono-tabular">{cleanedPct}%</span>
        </div>
        <div className="h-3.5 w-full bg-[#F1D8A8] border-2 border-[#292C2B] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#718B78] transition-all duration-150"
            style={{ width: `${cleanedPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

const SOLAR_BREAKERS = [
  { id: 1, name: 'East Wing' },
  { id: 2, name: 'Center Bus' },
  { id: 3, name: 'Sun Tracker' },
  { id: 4, name: 'Inverter' },
];

export function SolarBreakerGame({ onWin }: MinigameProps) {
  const [nextStep, setNextStep] = useState(1);
  const [wrongId, setWrongId] = useState<number | null>(null);
  const wonRef = useRef(false);

  const flipBreaker = (id: number) => {
    if (wonRef.current || id < nextStep) return;
    if (id === nextStep) {
      soundFX.playTick();
      const updated = nextStep + 1;
      setNextStep(updated);
      if (updated > SOLAR_BREAKERS.length && !wonRef.current) {
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

  const pct = Math.round(((nextStep - 1) / SOLAR_BREAKERS.length) * 100);

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Flip the Solar Micro-Breakers back ON in order (#1 → #2 → #3 → #4) to restore array voltage!
      </div>

      <div className="rounded-2xl border-3 border-[#292C2B] bg-[#313638] p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          {SOLAR_BREAKERS.map((b) => {
            const isOn = b.id < nextStep;
            const isNext = b.id === nextStep;
            const isWrong = wrongId === b.id;
            return (
              <button
                key={b.id}
                type="button"
                disabled={isOn}
                onClick={() => flipBreaker(b.id)}
                className={`mars-btn min-h-[72px] p-2.5 rounded-xl flex items-center justify-between gap-2 transition-all cursor-pointer ${
                  isOn
                    ? 'bg-[#718B78] text-[#FAF0DC] cursor-default'
                    : isWrong
                    ? 'bg-[#C94B43] text-[#FAF0DC]'
                    : isNext
                    ? 'bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B] ring-3 ring-[#F4C552]'
                    : 'bg-[#51595D] hover:bg-[#5E676C] text-[#FAF0DC]'
                }`}
              >
                <div className="text-left min-w-0">
                  <div className="text-[11px] font-black opacity-85">#{b.id}</div>
                  <div className="text-xs font-extrabold truncate">{b.name}</div>
                </div>
                <span className="w-8 h-8 rounded-lg border-2 border-[#292C2B] bg-[#FAF0DC] flex items-center justify-center shrink-0">
                  {isOn ? (
                    <Check className="w-4 h-4 text-[#396344]" aria-hidden="true" />
                  ) : (
                    <Zap className="w-4 h-4 text-[#B94F32]" aria-hidden="true" />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-xs font-extrabold text-[#FAF0DC] px-1">
          <span>Array Voltage</span>
          <span className="font-mono-tabular">{pct}%</span>
        </div>
        <div className="h-3 w-full bg-[#202426] border border-[#FAF0DC]/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#F4C552] transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

