interface IguLogoProps {
  className?: string;
  /** Height in pixels. Width auto-scales to maintain aspect ratio. */
  height?: number;
  /** "light" for dark backgrounds (white logo), "dark" for light backgrounds (black logo) */
  variant?: "light" | "dark";
}

export function IguLogo({ className, height = 28, variant = "light" }: IguLogoProps) {
  const color = variant === "light" ? "#ffffff" : "#0a0a0a";
  const width = Math.round(height * (280 / 120));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-2 -2 284 124"
      width={width}
      height={height}
      className={className}
      aria-label="IGU"
      role="img"
    >
      <line x1="14" y1="14" x2="14" y2="106" stroke={color} strokeWidth="28" strokeLinecap="round" />
      <path
        d="M 130,14 L 58,14 L 58,106 L 130,106 L 130,66 L 104,66"
        stroke={color}
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M 174,14 L 174,76 Q 174,106 204,106 L 236,106 Q 266,106 266,76 L 266,14"
        stroke={color}
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
