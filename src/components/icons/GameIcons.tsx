import React from 'react';
import marsLogo from '../../assets/logo.png';
import { GilEmotion } from '../../types/game';
import { ResourceType } from '../../types/resource';

export function ResourceIcon({
  type,
  className = 'w-5 h-5',
}: {
  type: ResourceType;
  className?: string;
}) {
  switch (type) {
    case 'oxygen':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="10" cy="13" r="7" fill="#6CA4C4" stroke="#292C2B" strokeWidth="2" />
          <circle cx="17" cy="7" r="3.5" fill="#FAF0DC" stroke="#292C2B" strokeWidth="2" />
          <circle cx="8" cy="11" r="1.5" fill="#FAF0DC" />
        </svg>
      );
    case 'water':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M12 3C12 3 6 10.5 6 15a6 6 0 0 0 12 0c0-4.5-6-12-6-12Z"
            fill="#477C9B"
            stroke="#292C2B"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M9.5 15.5a2.5 2.5 0 0 0 2.5 2.5" stroke="#FAF0DC" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      );
    case 'food':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M3.5 15.5c0-4.4 3.4-8.5 8.5-8.5s8.5 4.1 8.5 8.5c0 2.3-1.6 3.5-4 3.5H7.5c-2.4 0-4-1.2-4-3.5Z"
            fill="#D77B4A"
            stroke="#292C2B"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M6 15.6c0-2.9 2.3-5.8 6-5.8s6 2.9 6 5.8c0 .8-.5 1.4-1.4 1.4H7.4c-.9 0-1.4-.6-1.4-1.4Z"
            fill="#E9B77B"
          />
          <path
            d="M8.8 10.6l1.4 2.4M12.2 10l1.4 2.6M15.4 11l1.1 2.1"
            stroke="#292C2B"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'energy':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M13 2L5 14h6l-1 8 9-12h-6l0-8Z"
            fill="#E9B77B"
            stroke="#292C2B"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

export function CrewStaminaIcon({
  className = 'w-5 h-5',
  low = false,
}: {
  className?: string;
  low?: boolean;
}) {
  const color = low ? '#C94B43' : '#718B78';
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="15" cy="4.6" r="2.2" fill={color} stroke="#292C2B" strokeWidth="1.6" />
      <path
        d="M8 9.2l2.6-1.4 2.8.8 2.4 2 2.4-.5M12.9 8.7l-2.3 4.5 3.6 2.2-.5 4.8M10.6 13.2l-3.1 2.8-2.6.8"
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GilAvatarIcon({
  className = 'w-10 h-10',
  mood = 'info',
  emotion,
  isSpeaking = false,
}: {
  className?: string;
  mood?: 'info' | 'warning' | 'alert';
  emotion?: GilEmotion;
  isSpeaking?: boolean;
}) {
  const activeEmotion: GilEmotion =
    emotion ?? (mood === 'alert' ? 'worried' : mood === 'warning' ? 'concerned' : 'happy');

  const antennaColor =
    activeEmotion === 'worried' || mood === 'alert'
      ? '#C94B43'
      : activeEmotion === 'surprised' || activeEmotion === 'concerned' || mood === 'warning'
      ? '#D77B4A'
      : activeEmotion === 'excited'
      ? '#89AA91'
      : '#F4C552';
  const eyeColor = activeEmotion === 'worried' ? '#FAF0DC' : '#FFF4D6';

  const motionClass =
    activeEmotion === 'excited'
      ? 'animate-gil-excited'
      : activeEmotion === 'surprised'
      ? 'animate-gil-surprise'
      : activeEmotion === 'worried'
      ? 'animate-gil-worry'
      : 'animate-gil-float';

  return (
    <svg
      viewBox="0 0 44 44"
      className={`${className} ${motionClass}`}
      aria-hidden="true"
    >
      {/* Side ear-pods */}
      <rect x="2.5" y="17" width="4.5" height="10" rx="2" fill="#E9B77B" stroke="#292C2B" strokeWidth="2" />
      <rect x="37" y="17" width="4.5" height="10" rx="2" fill="#E9B77B" stroke="#292C2B" strokeWidth="2" />

      {/* Antenna */}
      <line x1="22" y1="10" x2="22" y2="4.5" stroke="#292C2B" strokeWidth="2.5" />
      <circle cx="22" cy="4.5" r="3" fill={antennaColor} stroke="#292C2B" strokeWidth="2" />

      {/* Head chassis */}
      <rect
        x="6"
        y="9.5"
        width="32"
        height="27"
        rx="9"
        fill="#477C9B"
        stroke="#292C2B"
        strokeWidth="2.5"
      />
      <path d="M11 12.5h15" stroke="#6CA4C4" strokeWidth="2" strokeLinecap="round" />

      {/* Large expressive visor */}
      <rect x="9.5" y="13.5" width="25" height="18" rx="5.5" fill="#292C2B" />

      {/* Cheeks */}
      <circle
        cx="13"
        cy="25"
        r="1.9"
        fill={activeEmotion === 'excited' || activeEmotion === 'relieved' ? '#E9B77B' : '#D77B4A'}
        opacity={activeEmotion === 'excited' ? 0.9 : 0.7}
      />
      <circle
        cx="31"
        cy="25"
        r="1.9"
        fill={activeEmotion === 'excited' || activeEmotion === 'relieved' ? '#E9B77B' : '#D77B4A'}
        opacity={activeEmotion === 'excited' ? 0.9 : 0.7}
      />

      {/* Expressive eyes & brows by emotion */}
      <g className="animate-gil-blink">
        {activeEmotion === 'relieved' ? (
          <>
            <path d="M13.5 21.8 Q16.5 18 19.5 21.8" fill="none" stroke={eyeColor} strokeWidth="2.4" strokeLinecap="round" />
            <path d="M24.5 21.8 Q27.5 18 30.5 21.8" fill="none" stroke={eyeColor} strokeWidth="2.4" strokeLinecap="round" />
          </>
        ) : activeEmotion === 'excited' ? (
          <>
            <circle cx="16.5" cy="20.6" r="3.1" fill="#F4C552" />
            <circle cx="27.5" cy="20.6" r="3.1" fill="#F4C552" />
            <circle cx="17.3" cy="19.6" r="1.1" fill="#FAF0DC" />
            <circle cx="28.3" cy="19.6" r="1.1" fill="#FAF0DC" />
          </>
        ) : activeEmotion === 'surprised' ? (
          <>
            <path d="M13.5 16.5 Q16.5 14.5 19.2 16.5" fill="none" stroke="#F4C552" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M24.8 16.5 Q27.5 14.5 30.5 16.5" fill="none" stroke="#F4C552" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="16.5" cy="21" r="3.2" fill={eyeColor} />
            <circle cx="27.5" cy="21" r="3.2" fill={eyeColor} />
            <circle cx="16.5" cy="21" r="1.1" fill="#292C2B" />
            <circle cx="27.5" cy="21" r="1.1" fill="#292C2B" />
          </>
        ) : activeEmotion === 'worried' ? (
          <>
            <line x1="13.5" y1="18.2" x2="19" y2="16.6" stroke="#FAF0DC" strokeWidth="1.7" strokeLinecap="round" />
            <line x1="30.5" y1="18.2" x2="25" y2="16.6" stroke="#FAF0DC" strokeWidth="1.7" strokeLinecap="round" />
            <circle cx="16.5" cy="21.4" r="2.6" fill={eyeColor} />
            <circle cx="27.5" cy="21.4" r="2.6" fill={eyeColor} />
            <circle cx="16.9" cy="21.6" r="1" fill="#C94B43" />
            <circle cx="27.9" cy="21.6" r="1" fill="#C94B43" />
          </>
        ) : activeEmotion === 'concerned' ? (
          <>
            <line x1="13.5" y1="17.8" x2="19.2" y2="17" stroke="#E9B77B" strokeWidth="1.6" strokeLinecap="round" />
            <line x1="30.5" y1="17.8" x2="24.8" y2="17" stroke="#E9B77B" strokeWidth="1.6" strokeLinecap="round" />
            <ellipse cx="16.5" cy="21.3" rx="2.6" ry="2.1" fill={eyeColor} />
            <ellipse cx="27.5" cy="21.3" rx="2.6" ry="2.1" fill={eyeColor} />
            <circle cx="17.2" cy="21.1" r="0.9" fill="#477C9B" />
            <circle cx="28.2" cy="21.1" r="0.9" fill="#477C9B" />
          </>
        ) : (
          <>
            <circle cx="16.5" cy="21" r={isSpeaking ? 2.8 : 2.5} fill={eyeColor} />
            <circle cx="27.5" cy="21" r={isSpeaking ? 2.8 : 2.5} fill={eyeColor} />
            <circle cx="17.3" cy="20.1" r="0.9" fill="#477C9B" />
            <circle cx="28.3" cy="20.1" r="0.9" fill="#477C9B" />
          </>
        )}
      </g>

      {/* Expressive mouth (animates when speaking) */}
      <g className={isSpeaking ? 'animate-gil-talk' : ''}>
        {activeEmotion === 'surprised' ? (
          <circle cx="22" cy="27" r="2.4" fill="#D77B4A" stroke="#FAF0DC" strokeWidth="1.2" />
        ) : activeEmotion === 'worried' ? (
          <path
            d="M17.5 27.2 Q19.7 25 22 26.8 Q24.3 28.5 26.5 26.2"
            fill="none"
            stroke="#FAF0DC"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : activeEmotion === 'concerned' ? (
          <path
            d="M18 26.5 Q22 25.2 26 26.5"
            fill="none"
            stroke="#E9B77B"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        ) : activeEmotion === 'excited' || isSpeaking ? (
          <path
            d="M17 25 Q22 30.5 27 25 Z"
            fill="#89AA91"
            stroke="#FAF0DC"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M17.5 25.5 Q22 28.5 26.5 25.5"
            fill="none"
            stroke="#89AA91"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        )}
      </g>

      {/* Neck thruster base */}
      <rect
        x="16"
        y="37"
        width="12"
        height="4"
        rx="2"
        fill="#D77B4A"
        stroke="#292C2B"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function MarsLogoLockup() {
  return (
   <div className="mx-auto w-[320px] max-w-full text-center sm:w-[400px]">
  <img src={marsLogo} alt="Mars 30" className="h-auto w-full" />
  <p className="text-[13px] font-bold text-[#B94F32]">
    Jezero Crater Outpost Restoration
  </p>
</div>
  );
}

export function BuildingIcon({
  id,
  className = 'w-7 h-7',
}: {
  id: string;
  className?: string;
}) {
  switch (id) {
    case 'solar_panels':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <rect x="4" y="6" width="24" height="16" rx="3" fill="#477C9B" stroke="#292C2B" strokeWidth="2.4" />
          <line x1="12" y1="6" x2="12" y2="22" stroke="#FAF0DC" strokeWidth="1.6" />
          <line x1="20" y1="6" x2="20" y2="22" stroke="#FAF0DC" strokeWidth="1.6" />
          <line x1="4" y1="14" x2="28" y2="14" stroke="#FAF0DC" strokeWidth="1.6" />
          <rect x="24" y="10" width="4" height="8" rx="1" fill="#D77B4A" stroke="#292C2B" strokeWidth="1.5" />
          <path d="M16 22v5M11 27h10" stroke="#292C2B" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case 'energy_storage':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <rect x="7" y="7" width="18" height="21" rx="3" fill="#E9B77B" stroke="#292C2B" strokeWidth="2.4" />
          <rect x="10" y="4" width="4" height="3" rx="1" fill="#F4C552" stroke="#292C2B" strokeWidth="1.5" />
          <rect x="18" y="4" width="4" height="3" rx="1" fill="#F4C552" stroke="#292C2B" strokeWidth="1.5" />
          <path d="M17 11l-5 7h4l-1 6 5-7h-4l1-6Z" fill="#B94F32" stroke="#292C2B" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    case 'oxygen_generator':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <rect x="4" y="6" width="24" height="20" rx="5" fill="#FAF0DC" stroke="#292C2B" strokeWidth="2.4" />
          <circle cx="13" cy="17" r="6" fill="#6CA4C4" stroke="#292C2B" strokeWidth="2" />
          <path d="M13 12v10M8 17h10" stroke="#292C2B" strokeWidth="2" strokeLinecap="round" />
          <circle cx="22.5" cy="17" r="3.5" fill="#7BE0D6" stroke="#292C2B" strokeWidth="1.8" />
        </svg>
      );
    case 'oxygen_storage':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <rect x="14" y="8" width="4" height="16" fill="#E9B77B" stroke="#292C2B" strokeWidth="1.6" />
          <circle cx="16" cy="9.5" r="5.5" fill="#FAF0DC" stroke="#292C2B" strokeWidth="2.2" />
          <circle cx="16" cy="22.5" r="5.5" fill="#FAF0DC" stroke="#292C2B" strokeWidth="2.2" />
          <rect x="11" y="8.5" width="10" height="2.2" fill="#477C9B" />
          <rect x="11" y="21.5" width="10" height="2.2" fill="#477C9B" />
        </svg>
      );
    case 'water_recycling':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <rect x="4" y="6" width="24" height="17" rx="4" fill="#FAF0DC" stroke="#292C2B" strokeWidth="2.4" />
          <rect x="7" y="9" width="18" height="9" rx="2.5" fill="#477C9B" stroke="#292C2B" strokeWidth="1.8" />
          <path d="M9 14c2-1.5 4-1.5 6 0s4 1.5 6 0" fill="none" stroke="#DCF4FF" strokeWidth="1.8" strokeLinecap="round" />
          <rect x="7" y="23" width="18" height="4" rx="1.5" fill="#E9B77B" stroke="#292C2B" strokeWidth="1.8" />
        </svg>
      );
    case 'water_storage':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <rect x="7" y="5" width="18" height="22" rx="5" fill="#6CA4C4" stroke="#292C2B" strokeWidth="2.4" />
          <rect x="7" y="11" width="18" height="3" fill="#FAF0DC" />
          <rect x="7" y="19" width="18" height="3" fill="#FAF0DC" />
          <rect x="20" y="8" width="3" height="16" rx="1.5" fill="#292C2B" />
          <rect x="20.7" y="10" width="1.6" height="12" rx="0.8" fill="#8BE2FF" />
        </svg>
      );
    case 'greenhouse':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <path d="M4 14a12 9 0 0 1 24 0v13H4V14Z" fill="#D4EBDC" stroke="#292C2B" strokeWidth="2.4" strokeLinejoin="round" />
          <line x1="9" y1="8.5" x2="23" y2="8.5" stroke="#FF99C8" strokeWidth="2" strokeLinecap="round" />
          <path d="M16 24v-7M16 19c0-3 3-5 6-5 0 3-2 5-6 5Zm0-1c0-3-3-5-6-5 0 3 2 5 6 5Z" fill="#718B78" stroke="#292C2B" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case 'food_storage':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <rect x="6" y="7" width="20" height="20" rx="4" fill="#718B78" stroke="#292C2B" strokeWidth="2.4" />
          <rect x="8" y="8.5" width="16" height="2.5" rx="1" fill="#8BE2FF" />
          <circle cx="16" cy="18" r="5" fill="#FAF0DC" stroke="#292C2B" strokeWidth="2" />
          <path d="M16 14v4l2.5 1.5" stroke="#292C2B" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      );
    case 'radiation_shelter':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <path d="M16 4l10 4v8c0 6-4.5 10.5-10 12-5.5-1.5-10-6-10-12V8l10-4Z" fill="#D77B4A" stroke="#292C2B" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M16 10v10M11 15h10" stroke="#FAF0DC" strokeWidth="2.8" strokeLinecap="round" />
        </svg>
      );
    case 'maintenance_facility':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <rect x="5" y="7" width="22" height="19" rx="4" fill="#E9B77B" stroke="#292C2B" strokeWidth="2.4" />
          <path d="M12 21l8-8M18.5 11.5a3 3 0 0 1 3 3l-2 1-2-2 1-2Z" stroke="#292C2B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    default: // main_habitat
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <path d="M5 17a11 11 0 0 1 22 0v9H5v-9Z" fill="#FAF0DC" stroke="#292C2B" strokeWidth="2.4" strokeLinejoin="round" />
          <rect x="13" y="18" width="6" height="8" rx="1.5" fill="#B94F32" stroke="#292C2B" strokeWidth="2" />
          <circle cx="9.5" cy="18" r="2.2" fill="#6CA4C4" stroke="#292C2B" strokeWidth="1.5" />
          <circle cx="22.5" cy="18" r="2.2" fill="#6CA4C4" stroke="#292C2B" strokeWidth="1.5" />
          <circle cx="22" cy="8" r="2.2" fill="#89AA91" stroke="#292C2B" strokeWidth="1.5" />
        </svg>
      );
  }
}

export function EventIcon({
  phenomenon,
  className = 'w-8 h-8',
}: {
  phenomenon: string;
  className?: string;
}) {
  switch (phenomenon) {
    case 'marsquake':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <path d="M3 22h8l3-5 4 9 3-4h8" fill="none" stroke="#FAF0DC" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 27l5-4 4 3 5-5 4 3 4-2" fill="none" stroke="#E9B77B" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="11" cy="10" r="2.5" fill="#F4C552" />
          <circle cx="22" cy="8" r="2" fill="#E9B77B" />
        </svg>
      );
    case 'secondary_neutron_cascades':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <line x1="6" y1="4" x2="16" y2="25" stroke="#F4C552" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M5 26h22" stroke="#E9B77B" strokeWidth="3" strokeLinecap="round" />
          <path d="M16 25l-6-10M16 25l1-12M16 25l7-9" stroke="#C084FC" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="10" cy="14" r="2.3" fill="#6CA4C4" stroke="#292C2B" strokeWidth="1.2" />
          <circle cx="17" cy="11" r="2.3" fill="#F4C552" stroke="#292C2B" strokeWidth="1.2" />
          <circle cx="23" cy="15" r="2.3" fill="#C084FC" stroke="#292C2B" strokeWidth="1.2" />
        </svg>
      );
    case 'water_ice_clouds':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <path d="M8 20h15a5 5 0 0 0 .5-9.98A7 7 0 0 0 10 9a5.5 5.5 0 0 0-2 11Z" fill="#DCF4FF" stroke="#292C2B" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M11 25l2-2m4 3l1-3m5 2l-1-2" stroke="#6CA4C4" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case 'dust_devils':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <ellipse cx="16" cy="8" rx="10" ry="3.2" fill="#E9B77B" stroke="#292C2B" strokeWidth="2" />
          <ellipse cx="16" cy="14" rx="7.5" ry="2.6" fill="#D77B4A" stroke="#292C2B" strokeWidth="2" />
          <ellipse cx="16" cy="20" rx="5" ry="2" fill="#E9B77B" stroke="#292C2B" strokeWidth="2" />
          <path d="M14 23l2 5 2-5" fill="#B94F32" stroke="#292C2B" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case 'solar_flare_xray_uv':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <circle cx="10" cy="10" r="6" fill="#F4C552" stroke="#292C2B" strokeWidth="2.2" />
          <path d="M15 13c3 0 3 4 6 4s3 4 6 4M12 16c3 1 2 5 5 6s2 4 5 5" fill="none" stroke="#C084FC" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M16 9h10" stroke="#FAF0DC" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'solar_storm_response':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <circle cx="9" cy="10" r="5.5" fill="#F4C552" stroke="#292C2B" strokeWidth="2.2" />
          <path d="M15 8c5 2 8 1 12-1M14 14c6 3 9 2 14 0M13 20c5 3 9 3 14 1" fill="none" stroke="#FAF0DC" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M18 27l4-5 4 5h-8Z" fill="#F4C552" stroke="#292C2B" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case 'solar_energetic_particles':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <line x1="6" y1="6" x2="17" y2="17" stroke="#FAF0DC" strokeWidth="2.8" strokeLinecap="round" />
          <line x1="15" y1="4" x2="26" y2="15" stroke="#F4C552" strokeWidth="2.8" strokeLinecap="round" />
          <line x1="5" y1="16" x2="16" y2="27" stroke="#6CA4C4" strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="18" cy="18" r="3" fill="#F4C552" stroke="#292C2B" strokeWidth="1.5" />
          <circle cx="25" cy="24" r="2.5" fill="#C084FC" stroke="#292C2B" strokeWidth="1.5" />
        </svg>
      );
    default: // global_dust_storm
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <path d="M5 17h18a4 4 0 1 0-3-6.6A6 6 0 0 0 8.5 11 4.5 4.5 0 0 0 5 17Z" fill="#E9B77B" stroke="#292C2B" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M4 22h21M7 26h19" stroke="#FAF0DC" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M22 19l-3 5h3l-1 4 4-5h-3l0-4Z" fill="#F4C552" stroke="#292C2B" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
  }
}
