import React from 'react';

interface GameLogoProps {
  variant?: 'hero' | 'compact';
}

export const GameLogo: React.FC<GameLogoProps> = ({ variant = 'hero' }) => {
  if (variant === 'compact') {
    return (
      <svg
        viewBox="0 0 216 44"
        className="h-8 w-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.65)] sm:h-9"
        aria-label="HILL RUSH 3D"
      >
        <defs>
          <linearGradient id="hrCompactRed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF5547" />
            <stop offset="100%" stopColor="#C8141E" />
          </linearGradient>
          <linearGradient id="hrCompactGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFF08A" />
            <stop offset="100%" stopColor="#FF9E00" />
          </linearGradient>
        </defs>
        <path
          d="M6 34 L16 8 L184 8 L174 34 Z"
          fill="#0F172A"
          fillOpacity="0.88"
          stroke="#FFB800"
          strokeWidth="2"
        />
        <text
          x="22"
          y="27"
          fill="url(#hrCompactGold)"
          fontFamily="'Chakra Petch', sans-serif"
          fontWeight="800"
          fontStyle="italic"
          fontSize="19"
          letterSpacing="0.8"
        >
          HILL RUSH
        </text>
        <path
          d="M150 6 L208 6 L199 36 L141 36 Z"
          fill="url(#hrCompactRed)"
          stroke="#FFFFFF"
          strokeWidth="2"
        />
        <text
          x="174"
          y="27"
          textAnchor="middle"
          fill="#FFFFFF"
          fontFamily="'Chakra Petch', sans-serif"
          fontWeight="800"
          fontStyle="italic"
          fontSize="19"
        >
          3D
        </text>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 540 132"
      className="h-24 w-auto max-w-[90vw] drop-shadow-[0_10px_22px_rgba(8,20,42,0.55)] sm:h-28 md:h-32"
      aria-label="HILL RUSH 3D"
    >
      <defs>
        <linearGradient id="hrHeroGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFF8B8" />
          <stop offset="48%" stopColor="#FFC81E" />
          <stop offset="100%" stopColor="#EA6A00" />
        </linearGradient>
        <linearGradient id="hrHeroRed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF4F47" />
          <stop offset="55%" stopColor="#DC1922" />
          <stop offset="100%" stopColor="#8E0913" />
        </linearGradient>
        <linearGradient id="hrHeroCyan" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00E1FF" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>

      {/* Stylized Alpine Mountain Ridge Silhouette Behind Title */}
      <path
        d="M52 88 L112 30 L152 64 L214 14 L276 62 L328 28 L392 88 Z"
        fill="#0F172A"
        fillOpacity="0.82"
        stroke="#00D4FF"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M214 14 L196 36 L214 31 L232 38 Z" fill="#E8F6FF" />

      {/* Slanted Racing Ribbon Plate */}
      <path
        d="M28 106 L52 40 L424 40 L400 106 Z"
        fill="#0D1627"
        stroke="#FFFFFF"
        strokeWidth="3.5"
      />
      {/* Nitro Speed Accent Bar */}
      <path d="M40 112 L386 112 L380 120 L34 120 Z" fill="url(#hrHeroCyan)" />

      {/* Main Title Typography */}
      <text
        x="218"
        y="91"
        textAnchor="middle"
        fill="url(#hrHeroGold)"
        stroke="#101828"
        strokeWidth="5"
        paintOrder="stroke"
        fontFamily="'Chakra Petch', sans-serif"
        fontWeight="800"
        fontStyle="italic"
        fontSize="60"
        letterSpacing="2"
      >
        HILL RUSH
      </text>

      {/* Bold Crimson 3D Emblem Shield */}
      <path
        d="M402 30 L516 30 L494 110 L380 110 Z"
        fill="url(#hrHeroRed)"
        stroke="#FFFFFF"
        strokeWidth="4"
      />
      <text
        x="448"
        y="89"
        textAnchor="middle"
        fill="#FFFFFF"
        stroke="#3D040A"
        strokeWidth="4"
        paintOrder="stroke"
        fontFamily="'Chakra Petch', sans-serif"
        fontWeight="800"
        fontStyle="italic"
        fontSize="54"
      >
        3D
      </text>
    </svg>
  );
};
