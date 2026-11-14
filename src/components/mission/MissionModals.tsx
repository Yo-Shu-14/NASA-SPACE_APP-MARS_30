import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Droplets,
  Heart,
  Leaf,
  Play,
  Rocket,
  RotateCcw,
  Shield,
  Sprout,
  Sun,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { BUILDING_DEFINITIONS } from '../../data/buildings';
import { ActiveEvent, DecisionIconType } from '../../types/event';
import { DaySummary, GilEmotion, GilMessage } from '../../types/game';
import { soundFX } from '../../systems/audio';
import {
  isEditableTarget,
  isInteractiveControlTarget,
  releaseActiveElementFocus,
} from '../../utils/keyboard';
import { BuildingIcon, CrewStaminaIcon, EventIcon, GilAvatarIcon, ResourceIcon } from '../icons/GameIcons';

export interface DescriptionModalData {
  title: string;
  description: string;
  imageUrl?: string;
  credit?: string;
  capabilities?: ReadonlyArray<{
    title: string;
    detail: string;
  }>;
}

function useCenterZoomModal() {
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef<number | null>(null);
  const recoveryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      if (recoveryTimerRef.current !== null) {
        window.clearTimeout(recoveryTimerRef.current);
      }
    };
  }, []);

  const closeWithZoom = useCallback(
    (onDone: () => void) => {
      if (isClosing) return;
      releaseActiveElementFocus();
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        onDone();
        return;
      }
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      if (recoveryTimerRef.current !== null) {
        window.clearTimeout(recoveryTimerRef.current);
      }
      setIsClosing(true);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        onDone();
        recoveryTimerRef.current = window.setTimeout(() => {
          recoveryTimerRef.current = null;
          setIsClosing(false);
        }, 250);
      }, 180);
    },
    [isClosing]
  );

  const backdropClass = `transition-opacity duration-[180ms] ${
    isClosing ? 'opacity-0' : 'animate-backdrop-fade opacity-100'
  }`;
  const zoomClass = isClosing ? 'animate-modal-zoom-out' : 'animate-modal-zoom-in';

  return { isClosing, closeWithZoom, backdropClass, zoomClass };
}

function GilTopAvatar({
  mood,
  emotion,
}: {
  mood: GilMessage['urgency'];
  emotion: GilEmotion;
}) {
  return (
    <div className="relative z-10 -mb-5 sm:-mb-7 flex flex-col items-center pointer-events-none shrink-0">
      <div className="w-20 h-20 sm:w-32 sm:h-32 rounded-2xl sm:rounded-3xl bg-[#FAF0DC] border-[3px] border-[#292C2B] shadow-[0_5px_0_#292C2B] sm:shadow-[0_6px_0_#292C2B] flex items-center justify-center">
        <GilAvatarIcon
          className="w-16 h-16 sm:w-28 sm:h-28"
          mood={mood}
          emotion={emotion}
          isSpeaking={true}
        />
      </div>
    </div>
  );
}

function GilCenteredShell({
  mood,
  emotion,
  maxWidthClass = 'max-w-md',
  backdropClass,
  zoomClass,
  ariaLabel,
  onBackdropClick,
  children,
}: {
  mood: GilMessage['urgency'];
  emotion: GilEmotion;
  maxWidthClass?: string;
  backdropClass: string;
  zoomClass: string;
  ariaLabel?: string;
  onBackdropClick?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={onBackdropClick}
      className={`fixed inset-0 z-30 flex justify-center p-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#292C2B]/55 backdrop-blur-xs overflow-y-auto overscroll-contain ${
        onBackdropClick ? 'cursor-pointer' : ''
      } ${backdropClass}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`my-auto flex flex-col items-center w-full ${maxWidthClass} max-h-[92dvh] cursor-default ${zoomClass}`}
      >
        <GilTopAvatar mood={mood} emotion={emotion} />
        {children}
      </div>
    </div>
  );
}

export function DescriptionModal({
  data,
  onClose,
}: {
  data: DescriptionModalData;
  onClose: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const { isClosing, closeWithZoom, backdropClass, zoomClass } = useCenterZoomModal();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeWithZoom(onClose);
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [closeWithZoom, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${data.title} description`}
      onClick={() => closeWithZoom(onClose)}
      className={`fixed inset-0 z-50 flex justify-center p-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#292C2B]/60 backdrop-blur-xs overflow-y-auto overscroll-contain cursor-pointer ${backdropClass}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`my-auto mars-panel max-w-md w-full max-h-[90dvh] flex flex-col overflow-hidden bg-[#FAF0DC] cursor-default ${zoomClass}`}
      >
        <div className="px-4 py-2.5 sm:py-3 border-b-2 border-[#292C2B] bg-[#F1D8A8] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-4 h-4 text-[#477C9B] shrink-0" aria-hidden="true" />
            <h2 className="text-sm sm:text-base font-extrabold text-[#292C2B] truncate">
              {data.title}
            </h2>
          </div>
          <button
            type="button"
            disabled={isClosing}
            onClick={() => closeWithZoom(onClose)}
            aria-label="Close description"
            className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl hover:bg-[#E9B77B]/70 active:scale-95 transition-all flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 sm:p-4 space-y-3 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {data.imageUrl && !imageFailed ? (
            <div className="relative rounded-xl overflow-hidden border-2 border-[#292C2B] bg-[#292C2B]">
              <img
                src={data.imageUrl}
                alt={data.title}
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setImageFailed(true)}
                className="w-full h-36 sm:h-52 object-cover block"
              />
              {data.credit && (
                <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-md bg-[#292C2B]/80 text-[#FAF0DC] text-[10px] font-bold">
                  {data.credit}
                </div>
              )}
            </div>
          ) : (
            <div className="h-32 sm:h-36 rounded-xl border-2 border-[#292C2B] bg-[#292C2B]/10 flex flex-col items-center justify-center gap-1 text-[#292C2B]/70 text-xs font-bold">
              <BookOpen className="w-7 h-7 text-[#477C9B]" aria-hidden="true" />
              <span>{data.credit ?? 'NASA Mars Archive'}</span>
            </div>
          )}

          <p className="text-xs sm:text-sm font-semibold text-[#292C2B] leading-relaxed">
            {data.description}
          </p>

          {data.capabilities && data.capabilities.length > 0 && (
            <div className="space-y-2 pt-0.5">
              <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[#477C9B]">
                <Rocket className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Purpose & Key Capabilities</span>
              </div>
              <div className="space-y-1.5">
                {data.capabilities.map((cap) => (
                  <div
                    key={cap.title}
                    className="mars-panel-light px-3 py-2 rounded-xl border-2 border-[#292C2B]/25 bg-[#F1D8A8]/55 space-y-0.5"
                  >
                    <div className="text-xs font-extrabold text-[#292C2B]">
                      {cap.title}
                    </div>
                    <p className="text-[11px] sm:text-xs font-semibold text-[#292C2B]/85 leading-snug">
                      {cap.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] font-medium text-[#292C2B]/70 leading-snug border-t border-[#292C2B]/15 pt-2">
            Real NASA mission context informs Mars 30’s setting; outpost buildings and resource unit numbers are simplified for gameplay.
          </p>

          <button
            type="button"
            disabled={isClosing}
            onClick={() => closeWithZoom(onClose)}
            className="mars-btn w-full min-h-[44px] py-2.5 px-4 bg-[#477C9B] hover:bg-[#3c6b86] text-[#FAF0DC] text-xs font-extrabold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DecisionChoiceIcon({ icon }: { icon: DecisionIconType }) {
  const cls = 'w-5 h-5 shrink-0';
  switch (icon) {
    case 'shield':
      return <Shield className={cls} aria-hidden="true" />;
    case 'zap':
      return <Zap className={cls} aria-hidden="true" />;
    case 'wrench':
      return <Wrench className={cls} aria-hidden="true" />;
    case 'sun':
      return <Sun className={cls} aria-hidden="true" />;
    case 'leaf':
      return <Leaf className={cls} aria-hidden="true" />;
    case 'users':
      return <Users className={cls} aria-hidden="true" />;
  }
}

export function EventModal({
  event,
  onAcknowledge,
  onSelectDecision,
}: {
  event: ActiveEvent;
  onAcknowledge: () => void;
  onSelectDecision?: (choiceId: string) => void;
}) {
  const { isClosing, closeWithZoom, backdropClass, zoomClass } = useCenterZoomModal();

  const choices = event.definition.choices ?? [];
  const hasChoices = choices.length > 0 && Boolean(onSelectDecision);

  useEffect(() => {
    soundFX.playGilChirp(
      event.definition.severity === 'super_major' || event.definition.severity === 'major'
        ? 'alert'
        : 'worried'
    );
  }, [event.definition.id, event.definition.severity]);

  useEffect(() => {
    if (event.selectedChoiceId) {
      soundFX.playEventMomentCue('outcome_resolved');
    }
  }, [event.selectedChoiceId]);

  useEffect(() => {
    if (event.resolved || hasChoices) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeWithZoom(onAcknowledge);
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (isInteractiveControlTarget(e.target)) return;
        e.preventDefault();
        closeWithZoom(onAcknowledge);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [event.resolved, hasChoices, closeWithZoom, onAcknowledge]);

  if (event.resolved) return null;

  const isMajorPresentation =
    event.definition.severity === 'major' || event.definition.severity === 'super_major';

  const headerBg = isMajorPresentation
    ? 'bg-[#C94B43] text-[#FAF0DC]'
    : 'bg-[#D77B4A] text-[#FAF0DC]';

  const affectedBuildings = event.definition.targetBuildings ?? [];

  const gilMood: GilMessage['urgency'] = isMajorPresentation ? 'alert' : 'warning';
  const gilEmotion: GilEmotion =
    event.definition.severity === 'super_major'
      ? 'worried'
      : isMajorPresentation
      ? 'surprised'
      : 'worried';

  return (
    <GilCenteredShell
      mood={gilMood}
      emotion={gilEmotion}
      maxWidthClass={hasChoices ? 'max-w-lg' : 'max-w-md'}
      backdropClass={backdropClass}
      zoomClass={zoomClass}
      ariaLabel={event.definition.title}
    >
      <div className="mars-panel w-full overflow-hidden max-h-[78dvh] sm:max-h-[82dvh] flex flex-col">
        <div
          className={`px-4 sm:px-5 pt-7 sm:pt-9 pb-2.5 sm:pb-3 border-b-2 border-[#292C2B] flex items-center justify-center gap-2.5 sm:gap-3 shrink-0 ${headerBg}`}
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#292C2B]/25 border-2 border-[#FAF0DC]/60 flex items-center justify-center shrink-0">
            <EventIcon phenomenon={event.definition.phenomenon} className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <h2 className="text-sm sm:text-lg font-extrabold leading-tight">
            {event.definition.title}
          </h2>
        </div>

        <div className="p-3.5 sm:p-5 space-y-3 text-sm overflow-y-auto overscroll-contain bg-[#FAF0DC] flex-1 min-h-0">
          {hasChoices ? (
            <div className="space-y-2.5">
              {event.definition.scienceContext && (
                <p className="text-[11px] font-semibold text-[#477C9B] leading-snug text-center px-1">
                  {event.definition.scienceContext}
                </p>
              )}
              {choices.slice(0, 3).map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  disabled={isClosing}
                  onClick={() => closeWithZoom(() => onSelectDecision?.(choice.id))}
                  className="mars-btn w-full min-h-[48px] p-2.5 sm:p-3 bg-[#FAF0DC] hover:bg-[#FFF8EB] text-left flex items-center gap-2.5 sm:gap-3 cursor-pointer"
                >
                  <div
                    className={`w-10 h-10 rounded-xl border-2 border-[#292C2B] flex items-center justify-center shrink-0 ${
                      choice.urgency === 'alert'
                        ? 'bg-[#D77B4A] text-[#FAF0DC]'
                        : choice.urgency === 'warning'
                        ? 'bg-[#477C9B] text-[#FAF0DC]'
                        : 'bg-[#718B78] text-[#FAF0DC]'
                    }`}
                  >
                    <DecisionChoiceIcon icon={choice.icon} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="text-xs sm:text-sm font-extrabold text-[#292C2B] leading-tight">
                      {choice.title}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-[#E3F1E6] border border-[#718B78] text-[10px] font-extrabold text-[#2F5B3B]">
                        + {choice.benefitTag}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[#FDE8E6] border border-[#C94B43]/60 text-[10px] font-extrabold text-[#B94F32]">
                        ! {choice.riskTag}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <>
              <p className="font-bold text-[#292C2B] leading-snug text-center">
                {event.definition.summary}
              </p>

              {event.definition.scienceContext && (
                <p className="text-[11px] font-semibold text-[#477C9B] leading-snug text-center">
                  {event.definition.scienceContext}
                </p>
              )}

              {affectedBuildings.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {affectedBuildings.map((bId) => (
                    <div
                      key={bId}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F1D8A8]/75 border border-[#292C2B]/35 text-[11px] font-extrabold text-[#292C2B]"
                    >
                      <BuildingIcon id={bId} className="w-4 h-4 shrink-0" />
                      <span>{BUILDING_DEFINITIONS[bId].shortName}</span>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={isClosing}
                onClick={() => closeWithZoom(onAcknowledge)}
                className="mars-btn w-full min-h-[44px] py-2.5 px-4 bg-[#718B78] hover:bg-[#5f7866] text-[#FAF0DC] text-sm font-extrabold cursor-pointer"
              >
                Got It
              </button>
            </>
          )}
        </div>
      </div>
    </GilCenteredShell>
  );
}

export function DaySummaryModal({
  summary,
  onContinue,
}: {
  summary: DaySummary;
  onContinue: () => void;
}) {
  const { isClosing, closeWithZoom, backdropClass, zoomClass } = useCenterZoomModal();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeWithZoom(onContinue);
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (isInteractiveControlTarget(e.target)) return;
        e.preventDefault();
        closeWithZoom(onContinue);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [closeWithZoom, onContinue]);

  const netO2 = summary.production.oxygen - summary.consumption.oxygen;
  const netH2O = summary.production.water - summary.consumption.water;
  const netFood = summary.production.food - summary.consumption.food;
  const netEnergy = summary.production.energy - summary.consumption.energy;

  const formatNet = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const isAlertSummaryNote = (note: string) =>
    note.startsWith('Overtime Fatigue') ||
    note.startsWith('Lingering') ||
    note.startsWith('Active Outdoor Hazard') ||
    note.includes('late') ||
    note.includes('Health -');
  const hasAlerts =
    summary.shortages.length > 0 ||
    summary.notes.some(isAlertSummaryNote) ||
    (summary.healthDelta !== undefined && summary.healthDelta < 0) ||
    Boolean(summary.buildingImpacts && summary.buildingImpacts.length > 0);

  const resourceItems = [
    { key: 'oxygen' as const, label: 'Oxygen', net: netO2 },
    { key: 'water' as const, label: 'Water', net: netH2O },
    { key: 'food' as const, label: 'Food', net: netFood },
    { key: 'energy' as const, label: 'Energy', net: netEnergy },
  ];

  return (
    <GilCenteredShell
      mood={hasAlerts ? 'warning' : 'info'}
      emotion={hasAlerts ? 'worried' : 'happy'}
      maxWidthClass="max-w-md"
      backdropClass={backdropClass}
      zoomClass={zoomClass}
      ariaLabel={`Sol ${summary.day} Summary`}
    >
      <div className="mars-panel w-full overflow-hidden max-h-[78dvh] sm:max-h-[82dvh] flex flex-col">
        <div className="px-4 sm:px-5 pt-7 sm:pt-9 pb-2.5 sm:pb-3 border-b-2 border-[#292C2B] bg-[#FAF0DC] flex items-center justify-center gap-2 shrink-0">
          <Sun className="w-5 h-5 text-[#B94F32]" aria-hidden="true" />
          <h2 className="text-base sm:text-lg font-extrabold text-[#292C2B]">
            Sol {summary.day} Summary
          </h2>
        </div>

        <div className="p-3.5 sm:p-5 space-y-3 text-xs overflow-y-auto overscroll-contain bg-[#FAF0DC] flex-1 min-h-0">
          {/* Icon-first 2x2 Net Grid */}
          <div className="grid grid-cols-2 gap-2 font-mono-tabular font-bold">
            {resourceItems.map((item) => (
              <div
                key={item.key}
                className="mars-panel-light px-2.5 py-2 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <ResourceIcon type={item.key} className="w-5 h-5 shrink-0" />
                  <span className="font-sans text-xs font-extrabold text-[#292C2B] truncate">
                    {item.label}
                  </span>
                </div>
                <span
                  className={`text-xs font-extrabold ${
                    item.net >= 0 ? 'text-[#396344]' : 'text-[#C94B43]'
                  }`}
                >
                  {formatNet(item.net)}
                </span>
              </div>
            ))}
          </div>

          {/* Compact Icon Metrics Strip */}
          <div className="mars-panel-light px-3 py-2 flex flex-wrap items-center justify-around gap-2 tabular-nums">
            <div className="flex items-center gap-1.5" title="Water Recycled">
              <Droplets className="w-4 h-4 text-[#477C9B] shrink-0" aria-hidden="true" />
              <span className="font-extrabold text-[#292C2B]">+{summary.waterRecycled}</span>
            </div>
            <span className="h-4 w-px bg-[#292C2B]/25" aria-hidden="true" />
            <div className="flex items-center gap-1.5" title="Stamina Restored">
              <CrewStaminaIcon className="w-4 h-4 shrink-0" />
              <span className="font-extrabold text-[#396344]">+{summary.crewEnergyRecovered}%</span>
            </div>
            {summary.healthDelta !== undefined && summary.healthDelta !== 0 && (
              <>
                <span className="h-4 w-px bg-[#292C2B]/25" aria-hidden="true" />
                <div className="flex items-center gap-1.5" title="Net Crew Health Change">
                  <Heart className="w-4 h-4 text-[#C94B43] fill-[#C94B43] shrink-0" aria-hidden="true" />
                  <span
                    className={`font-extrabold ${
                      summary.healthDelta > 0 ? 'text-[#396344]' : 'text-[#C94B43]'
                    }`}
                  >
                    {summary.healthDelta > 0 ? `+${summary.healthDelta}%` : `${summary.healthDelta}%`}
                  </span>
                </div>
              </>
            )}
            {summary.cropGrowthDelta > 0 && (
              <>
                <span className="h-4 w-px bg-[#292C2B]/25" aria-hidden="true" />
                <div className="flex items-center gap-1.5" title="Crop Growth">
                  <Sprout className="w-4 h-4 text-[#396344] shrink-0" aria-hidden="true" />
                  <span className="font-extrabold text-[#396344]">
                    +{summary.cropGrowthDelta.toFixed(1)} sols
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Short Icon-Paired Alerts / Notes */}
          {(summary.shortages.length > 0 || summary.notes.length > 0) && (
            <div className="space-y-1.5">
              {summary.shortages.length > 0 && (
                <div className="px-2.5 py-1.5 rounded-lg bg-[#FDE8E6] border border-[#C94B43]/60 flex items-center gap-1.5 font-extrabold text-[#C94B43]">
                  <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Low: {summary.shortages.join(', ')}</span>
                </div>
              )}
              {summary.notes.map((n, i) => {
                const isAlertNote = isAlertSummaryNote(n);
                return (
                  <div
                    key={i}
                    className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 font-bold ${
                      isAlertNote
                        ? 'bg-[#FDE8E6] border-[#C94B43]/60 text-[#C94B43]'
                        : 'bg-[#E3F1E6] border-[#718B78] text-[#396344]'
                    }`}
                  >
                    {isAlertNote ? (
                      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    )}
                    <span>{n}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Building Weather Impacts (Icons + Numbers) */}
          {summary.buildingImpacts && summary.buildingImpacts.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {summary.buildingImpacts.map((impact) => (
                <div
                  key={impact.buildingId}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#FDE8E6] border border-[#C94B43]/50 text-[11px] font-extrabold text-[#292C2B] tabular-nums"
                >
                  <BuildingIcon id={impact.buildingId} className="w-4 h-4 shrink-0" />
                  <span>{BUILDING_DEFINITIONS[impact.buildingId].shortName}</span>
                  {impact.conditionDelta < 0 && (
                    <span className="text-[#C94B43]">{impact.conditionDelta}%</span>
                  )}
                  {impact.dustAdded && impact.dustAdded > 0 && (
                    <span className="text-[#B94F32]">+{impact.dustAdded}% Dust</span>
                  )}
                  {impact.frostAdded && impact.frostAdded > 0 && (
                    <span className="text-[#477C9B]">+{impact.frostAdded}% Frost</span>
                  )}
                  {impact.shutdown ? (
                    <span className="text-[#8C4D32]">Offline</span>
                  ) : impact.malfunctionKind && impact.malfunctionKind !== 'frost' ? (
                    <span className="text-[#B3693B]">Fault</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            disabled={isClosing}
            onClick={() => closeWithZoom(onContinue)}
            className="mars-btn w-full min-h-[44px] py-2.5 px-4 bg-[#718B78] hover:bg-[#5f7866] text-[#FAF0DC] text-sm font-extrabold cursor-pointer"
          >
            Start Sol {summary.day + 1}
          </button>
        </div>
      </div>
    </GilCenteredShell>
  );
}

export function GilDayHintModal({
  message,
  onDismiss,
}: {
  message: GilMessage;
  onDismiss: () => void;
}) {
  const { isClosing, closeWithZoom, backdropClass, zoomClass } = useCenterZoomModal();

  useEffect(() => {
    soundFX.playGilActivate();
    soundFX.playGilChirp(message.emotion);
  }, [message.id, message.emotion]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeWithZoom(onDismiss);
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (isInteractiveControlTarget(e.target)) return;
        e.preventDefault();
        closeWithZoom(onDismiss);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [closeWithZoom, onDismiss]);

  const accentColor =
    message.urgency === 'alert'
      ? '#C94B43'
      : message.urgency === 'warning'
      ? '#B94F32'
      : '#477C9B';

  return (
    <GilCenteredShell
      mood={message.urgency}
      emotion={message.emotion}
      maxWidthClass="max-w-md"
      backdropClass={backdropClass}
      zoomClass={zoomClass}
      ariaLabel={`GIL Report: ${message.headline}`}
      onBackdropClick={() => closeWithZoom(onDismiss)}
    >
      <div className="mars-panel w-full pt-8 p-4 sm:p-6 sm:pt-10 bg-[#FAF0DC] space-y-3.5 sm:space-y-4 max-h-[78dvh] overflow-y-auto overscroll-contain">
        <h2
          className="text-center text-base sm:text-lg font-extrabold leading-tight"
          style={{ color: accentColor }}
        >
          {message.headline}
        </h2>

        <p className="text-xs sm:text-sm font-bold text-[#292C2B] leading-relaxed bg-[#F1D8A8]/55 p-3 sm:p-3.5 rounded-xl border-2 border-[#292C2B]/20">
          {message.body}
        </p>

        <button
          type="button"
          disabled={isClosing}
          onClick={() => closeWithZoom(onDismiss)}
          className="mars-btn w-full min-h-[44px] py-2.5 px-4 bg-[#718B78] hover:bg-[#5f7866] text-[#FAF0DC] text-sm font-extrabold cursor-pointer"
        >
          Let&apos;s Go
        </button>
      </div>
    </GilCenteredShell>
  );
}

export function PauseModal({
  onResume,
  onRestart,
  onReturnTitle,
}: {
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}) {
  const { isClosing, closeWithZoom, backdropClass, zoomClass } = useCenterZoomModal();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeWithZoom(onResume);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [closeWithZoom, onResume]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mission Paused"
      className={`fixed inset-0 z-40 flex justify-center p-4 overflow-y-auto overscroll-contain bg-[#292C2B]/55 ${backdropClass}`}
    >
      <div className={`my-auto mars-panel max-w-sm w-full p-5 sm:p-6 text-center space-y-4 ${zoomClass}`}>
        <h2 className="text-xl font-extrabold">Mission Paused</h2>

        <div className="space-y-2.5">
          <button
            type="button"
            disabled={isClosing}
            onClick={() => closeWithZoom(onResume)}
            className="mars-btn w-full min-h-[44px] py-2.5 px-4 bg-[#718B78] text-[#FAF0DC] text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4" aria-hidden="true" />
            Resume
          </button>
          <button
            type="button"
            disabled={isClosing}
            onClick={() => closeWithZoom(onRestart)}
            className="mars-btn w-full min-h-[44px] py-2.5 px-4 bg-[#E9B77B] text-[#292C2B] text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Restart
          </button>
          <button
            type="button"
            disabled={isClosing}
            onClick={() => closeWithZoom(onReturnTitle)}
            className="mars-btn w-full min-h-[44px] py-2.5 px-4 bg-[#FAF0DC] text-[#292C2B] text-sm font-bold cursor-pointer"
          >
            Title Screen
          </button>
        </div>
      </div>
    </div>
  );
}
