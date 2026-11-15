import { useCallback, useEffect, useRef, useState } from 'react';
import { Award, Cpu, Globe, Info, Sparkles, UserCheck, X } from 'lucide-react';
import { JEZERO_CRATER_DATA } from '../../data/nasa';
import { releaseActiveElementFocus } from '../../utils/keyboard';

interface CreditsModalProps {
  onClose: () => void;
}

const NASA_CREDIT_SOURCES: ReadonlyArray<{
  source: string;
  detail: string;
}> = [
  {
    source: 'NASA Perseverance Rover (MOXIE & MEDA)',
    detail:
      'Atmospheric CO2-to-O2 electrolysis concepts, Jezero Crater diurnal temperatures (-18°C to -80°C), ~638 Pa surface pressure, winds, and dust optical depth (τ).',
  },
  {
    source: 'NASA Curiosity Rover (RAD)',
    detail:
      'Martian surface ionizing radiation baselines (~0.64 mSv/sol galactic cosmic rays) and solar energetic particle spike behavior.',
  },
  {
    source: 'NASA DONKI, MAVEN & Solar Dynamics Observatory',
    detail:
      'Space weather notifications, coronal mass ejections (CMEs), X-ray/UV solar flares, and upper-atmosphere particle effects.',
  },
  {
    source: 'Mars Reconnaissance Orbiter (HiRISE & MOLA)',
    detail:
      `Jezero Crater orbital mapping (${JEZERO_CRATER_DATA.coordinates}, ${JEZERO_CRATER_DATA.floorElevationM} m floor elevation) and Neretva Vallis river-delta geology.`,
  },
  {
    source: 'NASA InSight Lander (SEIS) & Opportunity Mission',
    detail:
      'Marsquake seismic observations and planet-encircling dust storm visibility drop records (τ > 4.0).',
  },
  {
    source: 'NASA Artemis I / Orion, CHAPEA & ISS Life Support',
    detail:
      'Deep-space crew radiation shielding, regenerative water recovery, and controlled-environment hydroponic crop inspiration.',
  },
  {
    source: 'NASA Image and Video Library',
    detail:
      'Archival mission photography from NASA / JPL-Caltech, GSFC, and ESA Mars Express featured in infrastructure and hazard briefings.',
  },
];

export function CreditsModal({ onClose }: CreditsModalProps) {
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const closeWithZoom = useCallback(() => {
    if (isClosing) return;
    releaseActiveElementFocus();
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      onClose();
      return;
    }
    setIsClosing(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onClose();
    }, 180);
  }, [isClosing, onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeWithZoom();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [closeWithZoom]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Credits and Acknowledgments"
      onClick={closeWithZoom}
      className={`fixed inset-0 z-40 flex justify-center p-3 sm:p-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#292C2B]/60 backdrop-blur-xs overflow-y-auto overscroll-contain cursor-pointer transition-opacity duration-[180ms] ${
        isClosing ? 'opacity-0' : 'animate-backdrop-fade opacity-100'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`my-auto mars-panel max-w-lg w-full max-h-[90dvh] flex flex-col overflow-hidden bg-[#FAF0DC] cursor-default ${
          isClosing ? 'animate-modal-zoom-out' : 'animate-modal-zoom-in'
        }`}
      >
        {/* Header */}
        <div className="px-4 py-2.5 sm:py-3 border-b-2 border-[#292C2B] bg-[#F1D8A8] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Award className="w-4 h-4 text-[#B94F32] shrink-0" aria-hidden="true" />
            <h2 className="text-sm sm:text-base font-extrabold text-[#292C2B] truncate">
              Credits &amp; Acknowledgments
            </h2>
          </div>
          <button
            type="button"
            disabled={isClosing}
            onClick={closeWithZoom}
            aria-label="Close credits"
            className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl hover:bg-[#E9B77B]/70 active:scale-95 transition-all flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-3.5 sm:p-5 space-y-3.5 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {/* Game Developer */}
          <section className="mars-panel-light p-3 rounded-xl space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#B94F32]">
              <UserCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Game Developer</span>
            </div>
            <div className="text-xs sm:text-sm font-extrabold text-[#292C2B]">
              The Mars 30 Development Team
            </div>
            <p className="text-[11px] sm:text-xs font-semibold text-[#292C2B]/80 leading-relaxed">
              Original game concept, Jezero Crater survival simulation, systems design, educational mission progression, procedural Web Audio synthesis, and visual direction.
            </p>
          </section>

          {/* AI Assistance */}
          <section className="mars-panel-light p-3 rounded-xl space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#477C9B]">
              <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>AI Assistance</span>
            </div>
            <p className="text-[11px] sm:text-xs font-semibold text-[#292C2B]/80 leading-relaxed">
              Built transparently with AI-assisted development tools supporting UI layout design, TypeScript/React and Phaser implementation, educational copy refinement, and gameplay balancing review under human direction and testing.
            </p>
          </section>

          {/* NASA Scientific Data & References */}
          <section className="mars-panel-light p-3 rounded-xl space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#396344]">
              <Globe className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>NASA Scientific Data &amp; References</span>
            </div>
            <p className="text-[11px] sm:text-xs font-semibold text-[#292C2B]/80 leading-relaxed">
              Mars 30 draws scientific grounding and educational context from publicly available NASA planetary science, space weather, and human exploration programs:
            </p>
            <div className="space-y-1.5">
              {NASA_CREDIT_SOURCES.map((entry) => (
                <div
                  key={entry.source}
                  className="p-2 rounded-lg bg-[#FAF0DC] border border-[#292C2B]/20 space-y-0.5"
                >
                  <div className="text-[11px] sm:text-xs font-extrabold text-[#292C2B]">
                    {entry.source}
                  </div>
                  <p className="text-[10px] sm:text-[11px] font-semibold text-[#292C2B]/75 leading-snug">
                    {entry.detail}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Educational Simulation Note */}
          <div className="p-2.5 rounded-xl border border-[#292C2B]/25 bg-[#F1D8A8]/55 flex items-start gap-2">
            <Info className="w-4 h-4 text-[#477C9B] shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[10px] sm:text-[11px] font-semibold text-[#292C2B]/80 leading-snug">
              Note: Resource rates, 30-sol restoration pacing, facility repairs, and crew stats are simplified educational gameplay abstractions inspired by real NASA science. Mars 30 is an independent project and is not officially endorsed by NASA.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 sm:py-3 border-t-2 border-[#292C2B] bg-[#F1D8A8] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold text-[#292C2B]/70 truncate">
            <Cpu className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">Mars 30 · Jezero Crater Simulation</span>
          </div>
          <button
            type="button"
            disabled={isClosing}
            onClick={closeWithZoom}
            className="mars-btn min-h-[44px] px-4 py-2 bg-[#477C9B] hover:bg-[#3a6984] text-[#FAF0DC] text-xs font-extrabold cursor-pointer shrink-0"
          >
            Back to Menu
          </button>
        </div>
      </div>
    </div>
  );
}
