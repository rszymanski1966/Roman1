// Keyboard focus indicator from the --ring token at full opacity (WCAG 1.4.11: at least 3:1 against card and
// the kitchen gradient). The shadcn default ring-ring/50 (buttonVariants, base outline-ring/50) stays below 3:1,
// so every control of a guarded view adds this through cn(); tailwind-merge replaces the /50 ring color and width.
export const focusRing = "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring";

// Native radio / checkbox: box-shadow rings are unreliable on native appearance, so these get a solid outline.
export const focusOutline = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
