// Faint tiled contour lines — the shared topographic texture used behind the
// parchment "map sheet" on the landing, learn, and lesson pages. Must sit inside
// a `.tc-map` ancestor so `--tc-contour` resolves.
export function ContourBackdrop() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 -z-10 h-full w-full">
      <defs>
        <pattern id="tc-contours-bg" width="164" height="164" patternUnits="userSpaceOnUse" patternTransform="rotate(4)">
          <g fill="none" stroke="var(--tc-contour)" strokeWidth="1.1">
            <circle cx="82" cy="82" r="16" />
            <circle cx="82" cy="82" r="34" />
            <circle cx="82" cy="82" r="52" />
            <circle cx="82" cy="82" r="70" />
            <circle cx="0" cy="0" r="26" />
            <circle cx="164" cy="0" r="26" />
            <circle cx="0" cy="164" r="26" />
            <circle cx="164" cy="164" r="26" />
          </g>
          {/* Scattered crumbs */}
          <g fill="var(--tc-crumb)" stroke="none">
            <circle cx="34" cy="52" r="1.4" />
            <circle cx="120" cy="30" r="1.1" />
            <circle cx="146" cy="96" r="1.5" />
            <circle cx="58" cy="128" r="1.2" />
            <circle cx="98" cy="150" r="1.3" />
            <circle cx="18" cy="104" r="1" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#tc-contours-bg)" />
    </svg>
  );
}
