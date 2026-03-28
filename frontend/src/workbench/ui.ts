/** Shared UI constants for consistent styling across all workbench pages. */

// --- Buttons ---
// All buttons use the same base: rounded-lg, text-sm, font-semibold, px-4 py-2
const base = "inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2";

export const btnPrimary = `${base} bg-tedee-cyan text-tedee-navy hover:bg-hover-cyan`;
export const btnSecondary = `${base} border border-gray-200 text-gray-600 hover:bg-gray-50`;
export const btnDanger = `${base} bg-red-500 text-white hover:bg-red-600`;
export const btnSuccess = `${base} bg-emerald-600 text-white hover:bg-emerald-700`;

// Small inline buttons (Set Key, Upload, Remove, etc.)
const ghost = "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors";
export const btnGhost = `${ghost} bg-gray-100 text-gray-700 hover:bg-gray-200`;
export const btnGhostDanger = `${ghost} text-red-600 hover:bg-red-50`;
export const btnGhostCyan = `${ghost} bg-tedee-cyan/10 text-tedee-navy hover:bg-tedee-cyan/20`;

// --- Inputs ---
export const inp = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-tedee-cyan focus:ring-1 focus:ring-tedee-cyan/20";
