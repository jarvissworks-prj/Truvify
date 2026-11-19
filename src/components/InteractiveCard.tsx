import * as React from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "../lib/utils";

export interface InteractiveCardProps extends React.HTMLAttributes<HTMLDivElement> {
  accentClassName?: string;
  /** Classes for the outer hover area (e.g. scroll margin). `className` styles the card itself. */
  wrapperClassName?: string;
  children: React.ReactNode;
}

// The hover is detected on an outer wrapper that never moves, and only the inner card lifts.
// Without this, hovering near the bottom edge makes the card lift away from the cursor and flicker.
export const InteractiveCard = React.forwardRef<HTMLDivElement, InteractiveCardProps>(
  ({ className, accentClassName, wrapperClassName, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("group/card relative", wrapperClassName)} {...props}>
        <div
          className={cn(
            "group relative flex flex-col overflow-hidden rounded-2xl border border-[#EAEAEA] bg-white text-[#0A0A0A] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all duration-300 ease-out group-hover/card:-translate-y-1.5 group-hover/card:border-black/20 group-hover/card:shadow-[0_14px_34px_rgba(0,0,0,0.06)]",
            className
          )}
        >
          {accentClassName && (
            <div className={cn("absolute inset-y-0 left-0 w-1", accentClassName)} />
          )}
          {children}
        </div>
      </div>
    );
  }
);
InteractiveCard.displayName = "InteractiveCard";

export interface InteractiveCardLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children: React.ReactNode;
}

export function InteractiveCardLink({
  className,
  children,
  ...props
}: InteractiveCardLinkProps) {
  return (
    <a
      className={cn(
        "group/button inline-flex items-center gap-1.5 text-xs font-medium text-[#0A0A0A] transition-all duration-200 hover:underline",
        className
      )}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/button:translate-x-1" />
    </a>
  );
}
