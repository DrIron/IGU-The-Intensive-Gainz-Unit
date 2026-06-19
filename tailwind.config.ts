import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  // toneClasses() in src/lib/interpret.ts builds these class names dynamically
  // (`text-status-${t}`), so the JIT scanner can't find them in source. Safelist
  // the full set of tone utilities used by DeltaChip / MetricCard, plus the
  // /5 /15 /20 background-tint variants the coach-roster triage rows use and the
  // /30 border-color variant the CO1 Needs-Attention chips build dynamically.
  safelist: [
    "text-status-ontrack", "bg-status-ontrack", "bg-status-ontrack/5", "bg-status-ontrack/10", "bg-status-ontrack/15", "bg-status-ontrack/20", "border-l-status-ontrack", "border-status-ontrack/30",
    "text-status-attention", "bg-status-attention", "bg-status-attention/5", "bg-status-attention/10", "bg-status-attention/15", "bg-status-attention/20", "border-l-status-attention", "border-status-attention/30",
    "text-status-risk", "bg-status-risk", "bg-status-risk/5", "bg-status-risk/10", "bg-status-risk/15", "bg-status-risk/20", "border-l-status-risk", "border-status-risk/30",
    "text-status-neutral", "bg-status-neutral", "bg-status-neutral/5", "bg-status-neutral/10", "bg-status-neutral/15", "bg-status-neutral/20", "border-l-status-neutral", "border-status-neutral/30",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Bebas Neue', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--status-warning))",
        },
        "status-success": "hsl(var(--status-success))",
        "status-warning": "hsl(var(--status-warning))",
        "status-error": "hsl(var(--status-error))",
        // CC4 interpretation tone tokens (consumed by toneClasses() in src/lib/interpret.ts)
        "status-ontrack": "hsl(var(--status-ontrack))",
        "status-attention": "hsl(var(--status-attention))",
        "status-risk": "hsl(var(--status-risk))",
        "status-neutral": "hsl(var(--status-neutral))",
        // Macro palette (protein/fat/carb) — NutritionGoal donut + MacroDistributionRibbon.
        "macro-protein": "hsl(var(--macro-protein))",
        "macro-fat": "hsl(var(--macro-fat))",
        "macro-carb": "hsl(var(--macro-carb))",
        "chart-1": "hsl(var(--chart-1))",
        "chart-2": "hsl(var(--chart-2))",
        "chart-3": "hsl(var(--chart-3))",
        "chart-4": "hsl(var(--chart-4))",
        "chart-5": "hsl(var(--chart-5))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
