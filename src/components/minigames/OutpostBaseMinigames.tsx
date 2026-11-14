import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Check,
  Droplets,
  Fan,
  FlaskConical,
  Gauge,
  Lock,
  PackageCheck,
  Radio,
  RotateCcw,
  Shield,
  Snowflake,
  Sprout,
  Sun,
  Thermometer,
  Wind,
} from 'lucide-react';
import { soundFX } from '../../systems/audio';
import { MinigameSlider } from './MinigameSlider';

interface MinigameProps {
  onWin: () => void;
  paused?: boolean;
}

// Shared aligned slider with target green zone (prevents native thumb/track overlap)
interface ZoneSliderControlProps {
  label: string;
  icon: ReactNode;
  value: number;
  minOk: number;
  maxOk: number;
  ok: boolean;
  accent: string;
  onChange: (val: number) => void;
}

function ZoneSliderControl({
  label,
  icon,
  value,
  minOk,
  maxOk,
  ok,
  accent,
  onChange,
}: ZoneSliderControlProps) {
  return (
    <div
      className={`rounded-2xl border-2 border-[#292C2B] p-2.5 sm:p-3 space-y-1.5 sm:space-y-2 transition-colors ${
        ok ? 'bg-[#F0F7EE]' : 'bg-[#FAF0DC]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold">
        <span className="flex items-center gap-1.5 text-[#292C2B]">
          {icon}
          <span>{label}</span>
        </span>
        <div className="flex items-center gap-2 font-mono-tabular">
          <span
            className={`px-2 py-0.5 rounded-lg border text-[11px] font-extrabold ${
              ok
                ? 'bg-[#718B78] text-[#FAF0DC] border-[#292C2B]'
                : 'bg-[#F1D8A8] text-[#292C2B] border-[#292C2B]/40'
            }`}
          >
            {value}%
          </span>
          <span
            className={`flex items-center gap-1 text-[11px] font-extrabold ${
              ok ? 'text-[#396344]' : 'text-[#292C2B]/70'
            }`}
          >
            {ok && <Check className="w-3.5 h-3.5 stroke-[3]" aria-hidden="true" />}
            <span>{ok ? 'In Zone' : `Aim ${minOk}–${maxOk}%`}</span>
          </span>
        </div>
      </div>

      <MinigameSlider
        ariaLabel={`${label} (${value}%, target ${minOk} to ${maxOk}%)`}
        min={0}
        max={100}
        value={value}
        onChange={onChange}
        accentColor={accent}
        targetRange={{ min: minOk, max: maxOk }}
        inTarget={ok}
        minLabel="0%"
        targetLabel={`Green Zone: ${minOk}% – ${maxOk}%`}
        maxLabel="100%"
      />
    </div>
  );
}

// ---------- 1. GREENHOUSE: ENVIRONMENTAL CONTROLS (Water, Light, Warmth) ----------
export function GreenhouseControlsGame({ onWin, paused = false }: MinigameProps) {
  const [water, setWater] = useState(25);
  const [light, setLight] = useState(92);
  const [temp, setTemp] = useState(20);
  const [holdPct, setHoldPct] = useState(0);
  const wonRef = useRef(false);

  const waterOk = water >= 55 && water <= 80;
  const lightOk = light >= 60 && light <= 85;
  const tempOk = temp >= 50 && temp <= 75;
  const allOk = waterOk && lightOk && tempOk;

  useEffect(() => {
    if (paused || wonRef.current) return;
    if (!allOk) {
      setHoldPct(0);
      return;
    }
    const timer = window.setInterval(() => {
      setHoldPct((prev) => {
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
  }, [allOk, paused, onWin]);

  const goodCount = [waterOk, lightOk, tempOk].filter(Boolean).length;
  // Monotonic 0–100% progress: 25% per matched zone + final 25% stabilization lock
  const overallPct = allOk
    ? Math.min(100, 75 + Math.round(holdPct * 0.25))
    : goodCount * 25;

  return (
    <div className="space-y-2.5 sm:space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Slide Water, Light, and Warmth into their green zones to stabilize the Greenhouse!
      </div>

      {/* Live Plant Pod Display */}
      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#E8F3E6] p-2.5 sm:p-3 flex items-center gap-3">
        <div className="w-[68px] h-[68px] sm:w-[78px] sm:h-[78px] rounded-2xl border-2 border-[#292C2B] bg-[#FAF0DC] flex flex-col items-center justify-center shrink-0 shadow-[0_2px_0_#292C2B]">
          <Sprout
            className={`transition-transform duration-300 ${
              goodCount === 3
                ? 'w-10 h-10 text-[#396344] scale-110'
                : goodCount >= 1
                ? 'w-9 h-9 text-[#718B78]'
                : 'w-8 h-8 text-[#B94F32] rotate-6'
            }`}
            aria-hidden="true"
          />
          <span className="text-[11px] font-extrabold font-mono-tabular text-[#292C2B] mt-0.5">
            {goodCount}/3 Cozy
          </span>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs font-extrabold text-[#292C2B]">
            <span className="truncate">
              {overallPct >= 100
                ? 'Climate Locked!'
                : allOk
                ? 'Locking Greenhouse Climate...'
                : 'Match all 3 green zones'}
            </span>
            <span className="font-mono-tabular text-[#396344] shrink-0">
              {overallPct}%
            </span>
          </div>

          <div className="h-4 w-full bg-[#F1D8A8] border-2 border-[#292C2B] rounded-full overflow-hidden p-0.5">
            <div
              className="h-full rounded-full transition-all duration-150"
              style={{
                width: `${overallPct}%`,
                backgroundColor: allOk ? '#396344' : '#718B78',
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-bold text-[#292C2B]/70">
            <span>Zones Ready: {goodCount} of 3</span>
            <span>{allOk ? 'Hold steady...' : 'Adjust sliders below'}</span>
          </div>
        </div>
      </div>

      {/* 3 Control Sliders */}
      <div className="space-y-2.5">
        <ZoneSliderControl
          label="Water Drip"
          icon={<Droplets className="w-4 h-4 text-[#477C9B]" aria-hidden="true" />}
          value={water}
          minOk={55}
          maxOk={80}
          ok={waterOk}
          accent="#477C9B"
          onChange={setWater}
        />
        <ZoneSliderControl
          label="Grow Light"
          icon={<Sun className="w-4 h-4 text-[#D77B4A]" aria-hidden="true" />}
          value={light}
          minOk={60}
          maxOk={85}
          ok={lightOk}
          accent="#D77B4A"
          onChange={setLight}
        />
        <ZoneSliderControl
          label="Warmth"
          icon={<Thermometer className="w-4 h-4 text-[#B94F32]" aria-hidden="true" />}
          value={temp}
          minOk={50}
          maxOk={75}
          ok={tempOk}
          accent="#B94F32"
          onChange={setTemp}
        />
      </div>
    </div>
  );
}

// ---------- 2. HABITAT + COMMS: CALIBRATION SEQUENCE & SIGNAL FREQUENCY ----------
const HABITAT_NODES = [
  { id: 'airlock', label: '1. Airlock', color: '#477C9B' },
  { id: 'heater', label: '2. Heater', color: '#D77B4A' },
  { id: 'life', label: '3. Life Air', color: '#718B78' },
  { id: 'comms', label: '4. Comms', color: '#8E63A8' },
];

export function HabitatCalibrationGame({ onWin, paused = false }: MinigameProps) {
  const sequence = useMemo(() => {
    const pool = ['airlock', 'heater', 'life', 'comms'];
    // Pick 3 distinct nodes in order
    return [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
  }, []);

  const [phase, setPhase] = useState<'sequence' | 'frequency'>('sequence');
  const [litNode, setLitNode] = useState<string | null>(null);
  const [showingSeq, setShowingSeq] = useState(true);
  const [stepIdx, setStepIdx] = useState(0);

  const targetFreq = useMemo(() => 34 + Math.floor(Math.random() * 42), []);
  const [freq, setFreq] = useState(12);
  const [holdPct, setHoldPct] = useState(0);
  const wonRef = useRef(false);
  const seqTimersRef = useRef<number[]>([]);

  const clearSeqTimers = () => {
    seqTimersRef.current.forEach((id) => window.clearTimeout(id));
    seqTimersRef.current = [];
  };

  useEffect(() => {
    return () => {
      clearSeqTimers();
    };
  }, []);

  const playSequence = () => {
    clearSeqTimers();
    setLitNode(null);
    setShowingSeq(true);
    setStepIdx(0);
    sequence.forEach((nodeId, i) => {
      seqTimersRef.current.push(
        window.setTimeout(() => {
          soundFX.playTick();
          setLitNode(nodeId);
        }, 280 + i * 620)
      );
      seqTimersRef.current.push(
        window.setTimeout(() => {
          setLitNode(null);
          if (i === sequence.length - 1) {
            setShowingSeq(false);
          }
        }, 720 + i * 620)
      );
    });
  };

  useEffect(() => {
    if (phase === 'sequence') {
      playSequence();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const freqDiff = Math.abs(freq - targetFreq);
  const freqLocked = phase === 'frequency' && freqDiff <= 4;

  useEffect(() => {
    if (paused || phase !== 'frequency' || wonRef.current) return;
    if (!freqLocked) {
      setHoldPct(0);
      return;
    }
    const timer = window.setInterval(() => {
      setHoldPct((prev) => {
        const next = Math.min(100, prev + 18);
        if (next >= 100 && !wonRef.current) {
          wonRef.current = true;
          soundFX.playRepair();
          window.setTimeout(onWin, 220);
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [freqLocked, phase, paused, onWin]);

  const handleTapNode = (id: string) => {
    if (showingSeq || phase !== 'sequence') return;
    if (id === sequence[stepIdx]) {
      soundFX.playTick();
      const nextStep = stepIdx + 1;
      setStepIdx(nextStep);
      if (nextStep >= sequence.length) {
        soundFX.playSelect();
        seqTimersRef.current.push(window.setTimeout(() => setPhase('frequency'), 300));
      }
    } else {
      soundFX.playError();
      playSequence();
    }
  };

  const buildWavePath = (frequencyVal: number) => {
    const cycles = 1.5 + (frequencyVal / 100) * 4.5;
    const pts: string[] = [];
    for (let x = 0; x <= 280; x += 6) {
      const y = 44 + Math.sin((x / 280) * Math.PI * 2 * cycles) * 24;
      pts.push(`${x === 0 ? 'M' : 'L'} ${x} ${y.toFixed(1)}`);
    }
    return pts.join(' ');
  };

  if (phase === 'sequence') {
    return (
      <div className="space-y-3 select-none">
        <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
          {showingSeq
            ? 'Watch the Habitat systems light up in order...'
            : `Step 1/2: Tap the ${sequence.length} systems in the exact order shown! (${stepIdx}/${sequence.length})`}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {HABITAT_NODES.map((node) => {
            const isLit = litNode === node.id;
            return (
              <button
                key={node.id}
                type="button"
                disabled={showingSeq}
                onClick={() => handleTapNode(node.id)}
                style={{ backgroundColor: isLit ? '#FFE680' : node.color }}
                className={`mars-btn min-h-[60px] py-4 sm:py-5 px-3 rounded-2xl text-sm font-extrabold transition-transform cursor-pointer ${
                  isLit
                    ? 'text-[#292C2B] scale-105 ring-4 ring-[#FAF0DC]'
                    : 'text-[#FAF0DC] active:scale-95'
                }`}
              >
                {node.label}
              </button>
            );
          })}
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            disabled={showingSeq}
            onClick={playSequence}
            className="mars-btn px-3 py-1.5 bg-[#F1D8A8] text-[#292C2B] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Replay Sequence</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Step 2/2: Slide the Comms Dial until the blue wave matches the dashed gold Mars signal!
      </div>

      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#1F2438] p-3">
        <svg viewBox="0 0 280 88" className="w-full h-24 block">
          <path
            d={buildWavePath(targetFreq)}
            fill="none"
            stroke="#F4C552"
            strokeWidth={3.5}
            strokeDasharray="6 5"
          />
          <path
            d={buildWavePath(freq)}
            fill="none"
            stroke={freqLocked ? '#9BF08E' : '#6CA4C4'}
            strokeWidth={4}
            strokeLinecap="round"
          />
        </svg>
        <div className="mt-1 flex items-center justify-between text-xs font-extrabold text-[#FAF0DC]">
          <span className="flex items-center gap-1">
            <Radio className="w-4 h-4 text-[#F4C552]" aria-hidden="true" />
            Comms Dish Tuner
          </span>
          <span>{freqLocked ? 'Signal Locked!' : `Match: ${Math.max(0, 100 - freqDiff * 2)}%`}</span>
        </div>
      </div>

      <div className="mars-panel-light p-3.5 space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-extrabold text-[#292C2B]">
            <span>Tuning Dial</span>
            <span className={`font-mono-tabular ${freqLocked ? 'text-[#396344]' : 'text-[#477C9B]'}`}>
              {freq} Hz {freqLocked ? '· Matched' : ''}
            </span>
          </div>
          <MinigameSlider
            ariaLabel="Comms signal frequency"
            min={5}
            max={95}
            value={freq}
            onChange={setFreq}
            accentColor="#477C9B"
            inTarget={freqLocked}
            minLabel="Low (5 Hz)"
            targetLabel="Match Gold Wave"
            maxLabel="High (95 Hz)"
          />
        </div>

        <div className="pt-2.5 border-t border-[#292C2B]/15 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-extrabold text-[#292C2B]">
            <span>Signal Lock</span>
            <span className="font-mono-tabular text-[#396344]">
              {freqLocked ? `${holdPct}%` : 'Align wave'}
            </span>
          </div>
          <div className="h-3.5 w-full bg-[#F1D8A8] border-2 border-[#292C2B] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#718B78] transition-all duration-100"
              style={{ width: `${freqLocked ? Math.max(15, holdPct) : 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- 3. RADIATION SHELTER: SHIELDING & AIRLOCK LOCK ----------
export function ShelterShieldGame({ onWin }: MinigameProps) {
  const [installed, setInstalled] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const wonRef = useRef(false);

  const installTile = (idx: number) => {
    if (installed.includes(idx)) return;
    soundFX.playTick();
    setInstalled((prev) => [...prev, idx]);
  };

  const lockDoor = () => {
    if (installed.length < 4 || locked || wonRef.current) return;
    setLocked(true);
    wonRef.current = true;
    soundFX.playRepair();
    window.setTimeout(onWin, 250);
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Tap all 4 open bunker slots to bolt heavy Radiation Shield plates, then lock the Airlock!
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((idx) => {
          const ok = installed.includes(idx);
          return (
            <button
              key={idx}
              type="button"
              disabled={ok}
              onClick={() => installTile(idx)}
              className={`mars-btn min-h-[64px] py-4 sm:py-5 px-3 rounded-2xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                ok ? 'bg-[#718B78] text-[#FAF0DC]' : 'bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B]'
              }`}
            >
              <Shield className="w-6 h-6" aria-hidden="true" />
              <span className="text-xs font-extrabold">
                {ok ? 'Shield Bolted!' : `Install Plate #${idx + 1}`}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={installed.length < 4 || locked}
        onClick={lockDoor}
        className={`mars-btn w-full min-h-[46px] py-2.5 sm:py-3 px-4 rounded-2xl flex items-center justify-center gap-2 text-sm font-extrabold ${
          installed.length < 4
            ? 'bg-[#D7D1C8] text-[#292C2B]/45 cursor-not-allowed'
            : locked
            ? 'bg-[#396344] text-[#FAF0DC]'
            : 'bg-[#B94F32] text-[#FAF0DC] cursor-pointer'
        }`}
      >
        <Lock className="w-4 h-4" aria-hidden="true" />
        <span>
          {locked
            ? 'Bunker Airlock Sealed!'
            : installed.length < 4
            ? `Bolt ${4 - installed.length} more shield plate(s) first`
            : 'Lock Bunker Airlock!'}
        </span>
      </button>
    </div>
  );
}

// ---------- 4. FOOD VAULT: CRYO DIAL & AIRTIGHT LATCHES ----------
export function FoodVaultSealGame({ onWin }: MinigameProps) {
  const [temp, setTemp] = useState(4);
  const [latches, setLatches] = useState<number[]>([]);
  const wonRef = useRef(false);

  const cryoReady = temp <= -10 && temp >= -18;

  const checkDone = (nextLatches: number[], nextTemp: number) => {
    const tempOk = nextTemp <= -10 && nextTemp >= -18;
    if (tempOk && nextLatches.length === 3 && !wonRef.current) {
      wonRef.current = true;
      soundFX.playRepair();
      window.setTimeout(onWin, 250);
    }
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Set the Food Vault cooling dial between -18°C and -10°C and snap all 3 door latches shut!
      </div>

      <div className="mars-panel-light p-3.5 space-y-2.5">
        <div className="flex items-center justify-between text-xs font-extrabold">
          <span className="flex items-center gap-1.5 text-[#477C9B]">
            <Snowflake className="w-4 h-4" aria-hidden="true" />
            Vault Cryo Temp
          </span>
          <span className={`font-mono-tabular ${cryoReady ? 'text-[#396344]' : 'text-[#B94F32]'}`}>
            {temp}°C {cryoReady ? '· Fresh' : '(Aim -18°C to -10°C)'}
          </span>
        </div>
        <MinigameSlider
          ariaLabel="Food vault temperature"
          min={-24}
          max={10}
          value={temp}
          onChange={(v) => {
            setTemp(v);
            checkDone(latches, v);
          }}
          accentColor="#477C9B"
          targetRange={{ min: -18, max: -10 }}
          inTarget={cryoReady}
          minLabel="-24°C"
          targetLabel="Green Zone: -18°C to -10°C"
          maxLabel="10°C"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((id) => {
          const shut = latches.includes(id);
          return (
            <button
              key={id}
              type="button"
              disabled={shut}
              onClick={() => {
                if (shut) return;
                soundFX.playTick();
                const next = [...latches, id];
                setLatches(next);
                checkDone(next, temp);
              }}
              className={`mars-btn py-3.5 px-2 rounded-xl flex flex-col items-center gap-1 cursor-pointer ${
                shut ? 'bg-[#718B78] text-[#FAF0DC]' : 'bg-[#F1D8A8] text-[#292C2B]'
              }`}
            >
              {shut ? <Check className="w-5 h-5" aria-hidden="true" /> : <Lock className="w-5 h-5" aria-hidden="true" />}
              <span className="text-xs font-extrabold">
                {shut ? 'Sealed' : `Latch #${id + 1}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- 5. GREENHOUSE MAINTENANCE: GROW SPECTRUM & MISTING ----------
export function GreenhouseSpectrumGame({ onWin }: MinigameProps) {
  const [lights, setLights] = useState<boolean[]>([false, false, false]);
  const [misters, setMisters] = useState<boolean[]>([false, false, false]);
  const wonRef = useRef(false);

  const checkDone = (nextLights: boolean[], nextMisters: boolean[]) => {
    if (nextLights.every(Boolean) && nextMisters.every(Boolean) && !wonRef.current) {
      wonRef.current = true;
      soundFX.playRepair();
      window.setTimeout(onWin, 250);
    }
  };

  const doneCount = lights.filter(Boolean).length + misters.filter(Boolean).length;

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Tap all 3 LED Grow Lights to Pink Spectrum and turn ON all 3 Hydroponic Misters!
      </div>

      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#E8F3E6] p-3 space-y-3">
        <div>
          <div className="text-[11px] font-extrabold text-[#292C2B] mb-1.5">
            Overhead Grow Lamps
          </div>
          <div className="grid grid-cols-3 gap-2">
            {lights.map((on, i) => (
              <button
                key={i}
                type="button"
                disabled={on}
                onClick={() => {
                  if (on) return;
                  soundFX.playTick();
                  const next = lights.map((v, idx) => (idx === i ? true : v));
                  setLights(next);
                  checkDone(next, misters);
                }}
                className={`mars-btn min-h-[60px] p-2 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  on
                    ? 'bg-[#D972A2] text-[#FAF0DC] cursor-default'
                    : 'bg-[#FAF0DC] hover:bg-[#F1D8A8] text-[#292C2B]'
                }`}
              >
                <Sun className="w-5 h-5" aria-hidden="true" />
                <span className="text-[11px] font-extrabold">
                  {on ? 'Grow ON ✓' : `Lamp #${i + 1}`}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-extrabold text-[#292C2B] mb-1.5">
            Hydroponic Sprayers
          </div>
          <div className="grid grid-cols-3 gap-2">
            {misters.map((on, i) => (
              <button
                key={i}
                type="button"
                disabled={on}
                onClick={() => {
                  if (on) return;
                  soundFX.playTick();
                  const next = misters.map((v, idx) => (idx === i ? true : v));
                  setMisters(next);
                  checkDone(lights, next);
                }}
                className={`mars-btn min-h-[60px] p-2 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  on
                    ? 'bg-[#477C9B] text-[#FAF0DC] cursor-default'
                    : 'bg-[#FAF0DC] hover:bg-[#F1D8A8] text-[#292C2B]'
                }`}
              >
                <Droplets className="w-5 h-5" aria-hidden="true" />
                <span className="text-[11px] font-extrabold">
                  {on ? 'Misting ✓' : `Spray #${i + 1}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="text-center text-xs font-extrabold text-[#396344]">
        Bays Calibrated: {doneCount} / 6
      </div>
    </div>
  );
}

// ---------- 6. RADIATION SHELTER MAINTENANCE: PACK REGOLITH SANDBAGS ----------
const SANDBAG_SLOTS = ['West Seam', 'Roof Ridge', 'Core Hatch', 'East Seam', 'Floor Lip'];

export function ShelterRegolithPackGame({ onWin }: MinigameProps) {
  const [packed, setPacked] = useState<number[]>([]);
  const wonRef = useRef(false);

  const packSlot = (idx: number) => {
    if (packed.includes(idx) || wonRef.current) return;
    soundFX.playTick();
    const next = [...packed, idx];
    setPacked(next);
    if (next.length === SANDBAG_SLOTS.length && !wonRef.current) {
      wonRef.current = true;
      soundFX.playRepair();
      window.setTimeout(onWin, 250);
    }
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Tap each highlighted bunker seam to pack heavy Martian Regolith sandbags!
      </div>

      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#5C4940] p-3 space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SANDBAG_SLOTS.map((label, idx) => {
            const isDone = packed.includes(idx);
            return (
              <button
                key={label}
                type="button"
                disabled={isDone}
                onClick={() => packSlot(idx)}
                className={`mars-btn min-h-[70px] p-2.5 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  isDone
                    ? 'bg-[#718B78] text-[#FAF0DC] cursor-default'
                    : 'bg-[#E9B77B] hover:bg-[#DFAB6D] text-[#292C2B]'
                }`}
              >
                {isDone ? (
                  <Check className="w-5 h-5" aria-hidden="true" />
                ) : (
                  <Shield className="w-5 h-5 text-[#8C4D32]" aria-hidden="true" />
                )}
                <span className="text-xs font-extrabold leading-tight">{label}</span>
                <span className="text-[10px] font-bold opacity-85">
                  {isDone ? 'Packed ✓' : 'Tap to Fill'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mars-panel-light p-2.5 flex items-center justify-between text-xs font-extrabold text-[#292C2B]">
        <span>Regolith Bags Packed</span>
        <span className="font-mono-tabular">
          {packed.length} / {SANDBAG_SLOTS.length}
        </span>
      </div>
    </div>
  );
}

// ---------- 7. FOOD VAULT MAINTENANCE: DEFROST VENTS & SEAL RATIONS ----------
export function FoodInventorySortGame({ onWin }: MinigameProps) {
  const [vents, setVents] = useState<boolean[]>([false, false, false]);
  const [crates, setCrates] = useState<boolean[]>([false, false, false]);
  const wonRef = useRef(false);

  const checkDone = (nextVents: boolean[], nextCrates: boolean[]) => {
    if (nextVents.every(Boolean) && nextCrates.every(Boolean) && !wonRef.current) {
      wonRef.current = true;
      soundFX.playRepair();
      window.setTimeout(onWin, 250);
    }
  };

  const count = vents.filter(Boolean).length + crates.filter(Boolean).length;

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Tap the 3 frosty Cryo Vents to defrost them, then snap freshness seals onto all 3 Ration Crates!
      </div>

      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#313C42] p-3 space-y-3">
        <div>
          <div className="text-[11px] font-extrabold text-[#FAF0DC] mb-1.5">
            Cryo Air Vents
          </div>
          <div className="grid grid-cols-3 gap-2">
            {vents.map((clear, i) => (
              <button
                key={i}
                type="button"
                disabled={clear}
                onClick={() => {
                  if (clear) return;
                  soundFX.playTick();
                  const next = vents.map((v, idx) => (idx === i ? true : v));
                  setVents(next);
                  checkDone(next, crates);
                }}
                className={`mars-btn min-h-[60px] p-2 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  clear
                    ? 'bg-[#718B78] text-[#FAF0DC] cursor-default'
                    : 'bg-[#DCEEF8] hover:bg-[#BFE0F5] text-[#292C2B]'
                }`}
              >
                {clear ? (
                  <Check className="w-5 h-5" aria-hidden="true" />
                ) : (
                  <Snowflake className="w-5 h-5 text-[#477C9B]" aria-hidden="true" />
                )}
                <span className="text-[11px] font-extrabold">
                  {clear ? 'Defrosted ✓' : `Vent #${i + 1}`}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-extrabold text-[#FAF0DC] mb-1.5">
            Ration Storage Crates
          </div>
          <div className="grid grid-cols-3 gap-2">
            {crates.map((sealed, i) => (
              <button
                key={i}
                type="button"
                disabled={sealed}
                onClick={() => {
                  if (sealed) return;
                  soundFX.playTick();
                  const next = crates.map((v, idx) => (idx === i ? true : v));
                  setCrates(next);
                  checkDone(vents, next);
                }}
                className={`mars-btn min-h-[60px] p-2 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  sealed
                    ? 'bg-[#718B78] text-[#FAF0DC] cursor-default'
                    : 'bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B]'
                }`}
              >
                <PackageCheck className="w-5 h-5" aria-hidden="true" />
                <span className="text-[11px] font-extrabold">
                  {sealed ? 'Sealed ✓' : `Crate #${i + 1}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="text-center text-xs font-extrabold text-[#292C2B]">
        Vault Checks Complete: {count} / 6
      </div>
    </div>
  );
}

// ---------- 8. GREENHOUSE #3: HYDROPONIC NUTRIENT DOSING ----------
export function GreenhouseNutrientMixGame({ onWin, paused = false }: MinigameProps) {
  const [nitrogen, setNitrogen] = useState(25);
  const [potassium, setPotassium] = useState(90);
  const [holdPct, setHoldPct] = useState(0);
  const wonRef = useRef(false);

  const okN = nitrogen >= 55 && nitrogen <= 75;
  const okK = potassium >= 45 && potassium <= 65;
  const bothOk = okN && okK;
  const readyCount = (okN ? 1 : 0) + (okK ? 1 : 0);

  useEffect(() => {
    if (paused || wonRef.current) return;
    if (!bothOk) {
      setHoldPct(0);
      return;
    }
    const timer = window.setInterval(() => {
      setHoldPct((prev) => {
        const next = Math.min(100, prev + 25);
        if (next >= 100 && !wonRef.current) {
          wonRef.current = true;
          soundFX.playRepair();
          window.setTimeout(onWin, 220);
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [bothOk, paused, onWin]);

  // Smooth monotonic progress: 35% per matched injector + final 30% mix lock
  const mixPct = bothOk
    ? Math.min(100, 70 + Math.round(holdPct * 0.3))
    : readyCount * 35;

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Dose both Hydroponic Nutrient Injectors into their green target zones!
      </div>

      {/* Nutrient Mix Progress Header */}
      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#E8F3E6] p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs font-extrabold text-[#292C2B]">
          <span className="flex items-center gap-2 text-[#396344]">
            <FlaskConical className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>
              {mixPct >= 100
                ? 'Nutrient Mix Locked!'
                : bothOk
                ? 'Balancing Hydroponic Solution...'
                : 'Tune Nitrogen & Potassium Mix'}
            </span>
          </span>
          <span className="font-mono-tabular text-[#396344] shrink-0">
            {mixPct}%
          </span>
        </div>

        <div className="h-4 w-full bg-[#F1D8A8] border-2 border-[#292C2B] rounded-full overflow-hidden p-0.5">
          <div
            className="h-full rounded-full transition-all duration-150"
            style={{
              width: `${mixPct}%`,
              backgroundColor: bothOk ? '#396344' : '#718B78',
            }}
          />
        </div>

        <div className="flex items-center justify-between text-[10px] font-bold text-[#292C2B]/70">
          <span>Injectors Balanced: {readyCount} of 2</span>
          <span>{bothOk ? 'Mixing tank...' : 'Match both green bands below'}</span>
        </div>
      </div>

      <div className="space-y-2.5">
        <ZoneSliderControl
          label="Nitrogen (Leaf Growth)"
          icon={<Sprout className="w-4 h-4 text-[#718B78]" aria-hidden="true" />}
          value={nitrogen}
          minOk={55}
          maxOk={75}
          ok={okN}
          accent="#477C9B"
          onChange={setNitrogen}
        />
        <ZoneSliderControl
          label="Potassium (Root Strength)"
          icon={<FlaskConical className="w-4 h-4 text-[#D77B4A]" aria-hidden="true" />}
          value={potassium}
          minOk={45}
          maxOk={65}
          ok={okK}
          accent="#D77B4A"
          onChange={setPotassium}
        />
      </div>
    </div>
  );
}

// ---------- 9. FOOD STORAGE #3: NITROGEN FLUSH PODS ----------
const RATION_PODS = [
  { id: 0, label: 'Dry Grain Pod' },
  { id: 1, label: 'Soy Protein Pod' },
  { id: 2, label: 'Greens Cold Pod' },
  { id: 3, label: 'Emergency Bar Pod' },
];

export function FoodNitrogenFlushGame({ onWin }: MinigameProps) {
  const [flushed, setFlushed] = useState<number[]>([]);
  const [pressureOk, setPressureOk] = useState(false);
  const wonRef = useRef(false);

  const togglePod = (id: number) => {
    if (flushed.includes(id) || wonRef.current) return;
    soundFX.playTick();
    const next = [...flushed, id];
    setFlushed(next);
    if (next.length === RATION_PODS.length && pressureOk && !wonRef.current) {
      wonRef.current = true;
      soundFX.playRepair();
      window.setTimeout(onWin, 250);
    }
  };

  const lockNitrogen = () => {
    if (flushed.length < RATION_PODS.length || pressureOk || wonRef.current) return;
    setPressureOk(true);
    wonRef.current = true;
    soundFX.playRepair();
    window.setTimeout(onWin, 250);
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Nitrogen-flush all 4 Ration Storage Pods to stop spoilage, then engage Vacuum Seal!
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {RATION_PODS.map((pod) => {
          const done = flushed.includes(pod.id);
          return (
            <button
              key={pod.id}
              type="button"
              disabled={done}
              onClick={() => togglePod(pod.id)}
              className={`mars-btn min-h-[70px] p-2.5 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer ${
                done
                  ? 'bg-[#718B78] text-[#FAF0DC] cursor-default'
                  : 'bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B]'
              }`}
            >
              {done ? (
                <Check className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Wind className="w-5 h-5 text-[#477C9B]" aria-hidden="true" />
              )}
              <span className="text-xs font-extrabold">{pod.label}</span>
              <span className="text-[10px] font-bold opacity-85">
                {done ? 'Nitrogen Flushed ✓' : 'Tap to Flush'}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={flushed.length < RATION_PODS.length || pressureOk}
        onClick={lockNitrogen}
        className={`mars-btn w-full min-h-[46px] py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm font-extrabold ${
          flushed.length < RATION_PODS.length
            ? 'bg-[#D7D1C8] text-[#292C2B]/45 cursor-not-allowed'
            : pressureOk
            ? 'bg-[#396344] text-[#FAF0DC]'
            : 'bg-[#477C9B] hover:bg-[#3B6984] text-[#FAF0DC] cursor-pointer'
        }`}
      >
        <PackageCheck className="w-4 h-4" aria-hidden="true" />
        <span>
          {pressureOk
            ? 'Ration Vault Vacuum Sealed!'
            : flushed.length < RATION_PODS.length
            ? `Flush ${RATION_PODS.length - flushed.length} more pod(s) first`
            : 'Engage Vacuum Seal!'}
        </span>
      </button>
    </div>
  );
}

// ---------- 10. RADIATION SHELTER #3: DOSIMETER & HATCH INTERLOCK ----------
const SHELTER_BEACONS = [
  { id: 1, label: 'Roof Dosimeter' },
  { id: 2, label: 'Water Wall Sensor' },
  { id: 3, label: 'Air Scrub Relay' },
  { id: 4, label: 'Lead Hatch Lock' },
];

export function ShelterDosimeterSyncGame({ onWin }: MinigameProps) {
  const [nextStep, setNextStep] = useState(1);
  const [wrongId, setWrongId] = useState<number | null>(null);
  const wonRef = useRef(false);

  const armBeacon = (id: number) => {
    if (wonRef.current || id < nextStep) return;
    if (id === nextStep) {
      soundFX.playTick();
      const updated = nextStep + 1;
      setNextStep(updated);
      if (updated > SHELTER_BEACONS.length && !wonRef.current) {
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

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Sync the Shelter Radiation Safety Interlocks in order (#1 → #2 → #3 → #4)!
      </div>

      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#313638] p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          {SHELTER_BEACONS.map((b) => {
            const armed = b.id < nextStep;
            const isNext = b.id === nextStep;
            const isWrong = wrongId === b.id;
            return (
              <button
                key={b.id}
                type="button"
                disabled={armed}
                onClick={() => armBeacon(b.id)}
                className={`mars-btn min-h-[72px] p-2.5 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-all ${
                  armed
                    ? 'bg-[#718B78] text-[#FAF0DC] cursor-default'
                    : isWrong
                    ? 'bg-[#C94B43] text-[#FAF0DC]'
                    : isNext
                    ? 'bg-[#FAF0DC] hover:bg-[#F1D8A8] text-[#292C2B] ring-3 ring-[#F4C552]'
                    : 'bg-[#464D52] text-[#FAF0DC]'
                }`}
              >
                <div className="text-left min-w-0">
                  <div className="text-[11px] font-black opacity-80">#{b.id}</div>
                  <div className="text-xs font-extrabold truncate">{b.label}</div>
                </div>
                {armed ? (
                  <Check className="w-5 h-5 text-[#FAF0DC] shrink-0" aria-hidden="true" />
                ) : (
                  <Shield className="w-5 h-5 text-[#F4C552] shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-center text-xs font-extrabold text-[#292C2B]">
        Shield Interlocks Armed: {nextStep - 1} / {SHELTER_BEACONS.length}
      </div>
    </div>
  );
}

// ---------- 11. MAIN HABITAT #2: AIRLOCK EQUALIZE & SEAL ----------
export function HabitatAirlockSealGame({ onWin }: MinigameProps) {
  const [chamberPsi, setChamberPsi] = useState(28);
  const [pins, setPins] = useState<boolean[]>([false, false, false]);
  const wonRef = useRef(false);

  const psiOk = chamberPsi >= 96 && chamberPsi <= 104;

  const checkDone = (nextPsi: number, nextPins: boolean[]) => {
    if (nextPsi >= 96 && nextPsi <= 104 && nextPins.every(Boolean) && !wonRef.current) {
      wonRef.current = true;
      soundFX.playRepair();
      window.setTimeout(onWin, 250);
    }
  };

  return (
    <div className="space-y-3 select-none">
      <div className="text-center text-xs sm:text-sm font-extrabold text-[#292C2B]">
        Match Habitat Airlock Pressure to 96–104 kPa and lock all 3 Hatch Seal Pins!
      </div>

      <div className="mars-panel-light p-3.5 space-y-2.5">
        <div className="flex items-center justify-between text-xs font-extrabold">
          <span className="flex items-center gap-1.5 text-[#477C9B]">
            <Gauge className="w-4 h-4" aria-hidden="true" />
            <span>Airlock Pressure</span>
          </span>
          <span className={`font-mono-tabular ${psiOk ? 'text-[#396344]' : 'text-[#B94F32]'}`}>
            {chamberPsi} kPa {psiOk ? '· Equalized' : '(Aim 96–104 kPa)'}
          </span>
        </div>
        <MinigameSlider
          ariaLabel="Habitat airlock pressure"
          min={10}
          max={120}
          value={chamberPsi}
          onChange={(v) => {
            setChamberPsi(v);
            checkDone(v, pins);
          }}
          accentColor="#477C9B"
          targetRange={{ min: 96, max: 104 }}
          inTarget={psiOk}
          minLabel="10 kPa"
          targetLabel="Green Zone: 96–104 kPa"
          maxLabel="120 kPa"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {pins.map((locked, idx) => (
          <button
            key={idx}
            type="button"
            disabled={locked}
            onClick={() => {
              if (locked || wonRef.current) return;
              soundFX.playTick();
              const next = pins.map((v, i) => (i === idx ? true : v));
              setPins(next);
              checkDone(chamberPsi, next);
            }}
            className={`mars-btn min-h-[68px] py-3 px-2 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer ${
              locked ? 'bg-[#718B78] text-[#FAF0DC]' : 'bg-[#F1D8A8] hover:bg-[#E9B77B] text-[#292C2B]'
            }`}
          >
            {locked ? <Check className="w-5 h-5" aria-hidden="true" /> : <Lock className="w-5 h-5" aria-hidden="true" />}
            <span className="text-xs font-extrabold">{locked ? 'Locked' : `Pin #${idx + 1}`}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- 12. MAIN HABITAT #3: CABIN LIFE SUPPORT PANEL ----------
const CABIN_SYSTEMS = [
  { id: 0, label: 'CO2 Scrubber', status: 'Reset' },
  { id: 1, label: 'Cabin Heater', status: 'Warm' },
  { id: 2, label: 'Air Fan', status: 'Spin' },
  { id: 3, label: 'Sleep Pods', status: 'Ready' },
];

export function HabitatLifeSupportPanelGame({ onWin }: MinigameProps) {
  const [active, setActive] = useState<number[]>([]);
  const [cabinTemp, setCabinTemp] = useState(14);
  const wonRef = useRef(false);

  const tempOk = cabinTemp >= 20 && cabinTemp <= 24;

  const checkDone = (nextActive: number[], nextTemp: number) => {
    if (
      nextActive.length === CABIN_SYSTEMS.length &&
      nextTemp >= 20 &&
      nextTemp <= 24 &&
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
        Switch ON all 4 Habitat Cabin Controls and warm Cabin Air to 20°C–24°C!
      </div>

      <div className="rounded-2xl border-2 border-[#292C2B] bg-[#313638] p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          {CABIN_SYSTEMS.map((sys) => {
            const on = active.includes(sys.id);
            return (
              <button
                key={sys.id}
                type="button"
                disabled={on}
                onClick={() => {
                  if (on || wonRef.current) return;
                  soundFX.playTick();
                  const next = [...active, sys.id];
                  setActive(next);
                  checkDone(next, cabinTemp);
                }}
                className={`mars-btn min-h-[68px] p-2.5 rounded-xl flex items-center justify-between gap-2 cursor-pointer ${
                  on
                    ? 'bg-[#718B78] text-[#FAF0DC] cursor-default'
                    : 'bg-[#FAF0DC] hover:bg-[#F1D8A8] text-[#292C2B]'
                }`}
              >
                <div className="text-left min-w-0">
                  <div className="text-xs font-extrabold truncate">{sys.label}</div>
                  <div className="text-[10px] font-bold opacity-85">
                    {on ? `${sys.status} ✓` : 'Standby'}
                  </div>
                </div>
                {on ? (
                  <Check className="w-5 h-5 text-[#FAF0DC] shrink-0" aria-hidden="true" />
                ) : (
                  <Fan className="w-5 h-5 text-[#477C9B] shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-3 rounded-xl bg-[#24282A] border border-[#FAF0DC]/25 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-extrabold text-[#FAF0DC]">
            <span className="flex items-center gap-1.5">
              <Thermometer className={`w-4 h-4 ${tempOk ? 'text-[#9BF08E]' : 'text-[#F4C552]'}`} aria-hidden="true" />
              <span>Cabin Thermostat</span>
            </span>
            <span className={`font-mono-tabular ${tempOk ? 'text-[#9BF08E]' : 'text-[#F4C552]'}`}>
              {cabinTemp}°C {tempOk ? '· Cozy' : '(Aim 20–24°C)'}
            </span>
          </div>
          <MinigameSlider
            ariaLabel="Habitat cabin thermostat"
            min={10}
            max={30}
            value={cabinTemp}
            onChange={(v) => {
              setCabinTemp(v);
              checkDone(active, v);
            }}
            theme="dark"
            accentColor="#D77B4A"
            targetRange={{ min: 20, max: 24 }}
            inTarget={tempOk}
            minLabel="10°C"
            targetLabel="Green Zone: 20–24°C"
            maxLabel="30°C"
          />
        </div>
      </div>

      <div className="text-center text-xs font-extrabold text-[#292C2B]">
        Cabin Systems Active: {active.length} / {CABIN_SYSTEMS.length}
      </div>
    </div>
  );
}

