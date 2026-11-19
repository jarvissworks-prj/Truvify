import { type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import {
  motion,
  type Transition,
  type UseInViewOptions,
  useReducedMotion,
  type Variant,
} from 'framer-motion';

export type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  variants?: {
    hidden: Variant;
    visible: Variant;
  };
  transition?: Transition;
  /** `amount` (0–1) sets how far into the screen the card must come before it fades in. */
  viewOptions?: UseInViewOptions;
  /**
   * Kept for backwards compatibility. Content is now never hidden again once it
   * has been shown, so screenshots, printing and quick jumps never show blank gaps.
   */
  once?: boolean;
};

const defaultVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

/**
 * Fade/slide-in on scroll — as a progressive enhancement.
 *
 * Content is visible by default. Only when the visitor starts scrolling are the
 * cards that are still below the screen hidden (they are off-screen, so nothing
 * visibly disappears); each one then fades in as it comes into view. Cards the
 * visitor jumps past are revealed too. This keeps full-page screenshots, crawlers,
 * printing and "reduced motion" users from ever seeing empty sections.
 */
export function ScrollReveal({
  children,
  className,
  variants = defaultVariants,
  transition = { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  viewOptions,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  // static = visible, never animated · hidden = waiting below the screen · shown = revealed
  const [phase, setPhase] = useState<'static' | 'hidden' | 'shown'>('static');
  const amount = typeof viewOptions?.amount === 'number' ? viewOptions.amount : 0.2;

  useEffect(() => {
    if (reduceMotion || phase === 'shown') return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      // Reveal once the top of the card is a little way into the screen — or already above it.
      const revealLine = vh - Math.min(rect.height * amount, vh * 0.25);
      const reached = rect.top < revealLine;
      if (phase === 'static') {
        setPhase(reached ? 'shown' : 'hidden');
      } else if (reached) {
        setPhase('shown');
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    if (phase === 'hidden') onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [phase, reduceMotion, amount]);

  return (
    <motion.div
      ref={ref}
      className={cn('scroll-reveal', className)}
      initial={false}
      animate={phase === 'hidden' ? 'hidden' : 'visible'}
      transition={phase === 'hidden' ? { duration: 0 } : transition}
      variants={variants}
    >
      {children}
    </motion.div>
  );
}
