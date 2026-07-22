import { cn } from "@/lib/utils";
import { ContourBackdrop } from "@/components/ContourBackdrop";

/**
 * The toast "map sheet": a full-height parchment ground with the shared contour
 * + crumb texture behind the content. `.tc-map` carries the palette tokens and
 * establishes a stacking context so the -z-10 texture paints above the gradient.
 * Children render above the texture (normal flow sits over the negative layer).
 */
export function MapShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("tc-map relative min-h-dvh", className)}>
      <ContourBackdrop />
      {children}
    </div>
  );
}
