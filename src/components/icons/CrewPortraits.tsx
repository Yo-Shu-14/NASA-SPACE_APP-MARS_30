import { CutsceneMood, CutsceneSpeaker } from '../../types/event';
import { GilEmotion } from '../../types/game';
import { GilAvatarIcon } from './GameIcons';

interface AstronautLook {
  suitAccent: string;
  skinTone: string;
  hairColor: string;
}

const CREW_LOOKS: Record<Exclude<CutsceneSpeaker, 'GIL'>, AstronautLook> = {
  Player: {
    suitAccent: '#B94F32',
    skinTone: '#F4C7A1',
    hairColor: '#4B3224',
  },
  Brent: {
    suitAccent: '#E59838',
    skinTone: '#F4C7A1',
    hairColor: '#4B3224',
  },
  MJ: {
    suitAccent: '#718B78',
    skinTone: '#8D5524',
    hairColor: '#221B18',
  },
  Darryl: {
    suitAccent: '#477C9B',
    skinTone: '#E0AC69',
    hairColor: '#292C2B',
  },
  Magno: {
    suitAccent: '#8E63A8',
    skinTone: '#F1C27D',
    hairColor: '#7C3E26',
  },
};

function mapMoodToGilEmotion(mood: CutsceneMood): GilEmotion {
  switch (mood) {
    case 'alert':
      return 'surprised';
    case 'worried':
      return 'worried';
    case 'determined':
      return 'excited';
    default:
      return 'concerned';
  }
}

export function CrewPortrait({
  speaker,
  mood = 'calm',
  className = 'w-14 h-14',
}: {
  speaker: CutsceneSpeaker;
  mood?: CutsceneMood;
  className?: string;
}) {
  if (speaker === 'GIL') {
    const gilMood =
      mood === 'worried' ? 'alert' : mood === 'alert' ? 'warning' : 'info';
    return (
      <GilAvatarIcon
        className={className}
        mood={gilMood}
        emotion={mapMoodToGilEmotion(mood)}
        isSpeaking
      />
    );
  }

  const look = CREW_LOOKS[speaker];
  const visorTint =
    mood === 'alert'
      ? '#486F87'
      : mood === 'worried'
      ? '#3F657E'
      : '#5587A6';

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {/* Suit Shoulders */}
      <path
        d="M11 60c2-11 10-16 21-16s19 5 21 16H11Z"
        fill="#ECE3D0"
        stroke="#292C2B"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      {/* Suit Accent Stripes */}
      <path
        d="M16 58c1.5-6.5 6-10 10-11.5v11.5H16Zm32 0c-1.5-6.5-6-10-10-11.5v11.5h10Z"
        fill={look.suitAccent}
      />
      {/* Chest Life-Support Buckle */}
      <rect
        x="26"
        y="49"
        width="12"
        height="8"
        rx="2"
        fill="#292C2B"
      />
      <circle cx="30" cy="53" r="1.5" fill={look.suitAccent} />
      <circle cx="34" cy="53" r="1.5" fill="#718B78" />

      {/* Helmet Ring */}
      <rect
        x="20"
        y="42"
        width="24"
        height="6"
        rx="3"
        fill={look.suitAccent}
        stroke="#292C2B"
        strokeWidth="2"
      />

      {/* Outer Helmet Dome */}
      <circle
        cx="32"
        cy="26"
        r="20"
        fill="#FAF0DC"
        stroke="#292C2B"
        strokeWidth="2.6"
      />
      {/* Helmet Comms Earpiece */}
      <rect
        x="9"
        y="22"
        width="5"
        height="9"
        rx="2"
        fill={look.suitAccent}
        stroke="#292C2B"
        strokeWidth="2"
      />
      <rect
        x="50"
        y="22"
        width="5"
        height="9"
        rx="2"
        fill={look.suitAccent}
        stroke="#292C2B"
        strokeWidth="2"
      />

      {/* Clear Visor Opening */}
      <rect
        x="17"
        y="14"
        width="30"
        height="24"
        rx="11"
        fill={visorTint}
        fillOpacity="0.22"
        stroke="#292C2B"
        strokeWidth="2.2"
      />

      {/* Face Inside Visor */}
      <circle cx="32" cy="27" r="10.5" fill={look.skinTone} />

      {/* Hairline */}
      <path
        d="M21.5 25c1-6 5-9.5 10.5-9.5s9.5 3.5 10.5 9.5c-2.5-2.8-6.2-3.8-10.5-3.8S24 22.2 21.5 25Z"
        fill={look.hairColor}
      />

      {/* Brows */}
      {mood === 'worried' && (
        <>
          <path d="M25.5 24.5l3.5-1.5" stroke="#292C2B" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M38.5 24.5l-3.5-1.5" stroke="#292C2B" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {(mood === 'alert' || mood === 'determined') && (
        <>
          <path d="M25.5 23.2l3.8 1.4" stroke="#292C2B" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M38.5 23.2l-3.8 1.4" stroke="#292C2B" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}

      {/* Eyes */}
      <circle cx="28" cy="27" r="1.6" fill="#292C2B" />
      <circle cx="36" cy="27" r="1.6" fill="#292C2B" />

      {/* Expressive Mouth */}
      {mood === 'alert' && (
        <ellipse cx="32" cy="32.2" rx="2.4" ry="2.2" fill="#292C2B" />
      )}
      {mood === 'worried' && (
        <path
          d="M28.5 33c1-1.3 6-1.3 7 0"
          fill="none"
          stroke="#292C2B"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
      {(mood === 'determined' || mood === 'concerned') && (
        <path
          d="M28.5 31.8c1.8 1.2 5.2 1.2 7 0"
          fill="none"
          stroke="#292C2B"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      )}
      {mood === 'excited' && (
        <path
          d="M27.8 30.8c1.8 2.6 6.6 2.6 8.4 0Z"
          fill="#292C2B"
          stroke="#292C2B"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      )}
      {mood === 'calm' && (
        <path
          d="M29 31.8c1.5 1.1 4.5 1.1 6 0"
          fill="none"
          stroke="#292C2B"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}

      {/* Visor Glass Highlight Reflection */}
      <path
        d="M20 19c1.8-2 4.5-2.8 7.5-2.8"
        fill="none"
        stroke="#FAF0DC"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}
