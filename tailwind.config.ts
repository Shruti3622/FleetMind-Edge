import type { Config } from "tailwindcss";

/**
 * FleetMind Edge — Design Tokens
 *
 * This file is the single source of truth for the design system defined in
 * the product spec: monochrome-first surfaces, color reserved for status,
 * and a restrained, enterprise-grade type and spacing scale.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Canvas / surfaces
        canvas: "#FFFFFF",
        surface: "#FFFFFF",

        // Text + borders (near-black, not pure #000 — see design spec)
        ink: {
          900: "#0A0A0B", // primary text
          500: "#6B7280", // secondary text
          400: "#9CA3AF", // tertiary / muted text
        },
        border: {
          DEFAULT: "#E5E7EB",
          subtle: "#F1F2F4",
        },

        // Brand
        brand: {
          DEFAULT: "#1E3A8A", // FleetMind Blue — primary actions, active nav
          light: "#EFF4FF", // selected/active background tint
          line: "#3B5FCC", // chart lines, active paths
        },

        // Status system — the only place color is expressive
        status: {
          success: "#16A34A",
          "success-tint": "#F0FDF4",
          warning: "#D97706",
          "warning-tint": "#FFFBEB",
          critical: "#DC2626",
          "critical-tint": "#FEF2F2",
          info: "#2563EB",
          "info-tint": "#EFF6FF",
        },

        // Robot identity colors (Live Operations Center)
        robot: {
          1: "#2563EB", // blue
          2: "#7C3AED", // violet
          3: "#0D9488", // teal
        },

        // Heatmap ramp: cool gray -> amber -> deep red
        heat: {
          0: "#F3F4F6",
          1: "#FDE68A",
          2: "#F59E0B",
          3: "#DC2626",
        },
      },

      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },

      // Type scale from the FleetMind Edge typography spec
      fontSize: {
        display: ["56px", { lineHeight: "60px", fontWeight: "600", letterSpacing: "-0.02em" }],
        "page-title": ["28px", { lineHeight: "36px", fontWeight: "600" }],
        "section-heading": ["20px", { lineHeight: "28px", fontWeight: "600" }],
        "card-title": ["16px", { lineHeight: "24px", fontWeight: "600" }],
        body: ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "body-emphasis": ["14px", { lineHeight: "20px", fontWeight: "500" }],
        caption: ["12px", { lineHeight: "16px", fontWeight: "500", letterSpacing: "0.04em" }],
        micro: ["11px", { lineHeight: "14px", fontWeight: "500" }],
      },

      borderRadius: {
        card: "12px", // consistent radius used everywhere — no mixed radii
      },

      boxShadow: {
        elevated: "0 8px 24px rgba(0, 0, 0, 0.06)",
        "elevated-hover": "0 12px 32px rgba(0, 0, 0, 0.09)",
      },

      spacing: {
        18: "72px",
        60: "240px", // sidebar width
      },

      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.08)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 1.5s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
