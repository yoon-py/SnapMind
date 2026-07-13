import { Platform, StyleSheet } from "react-native";

export const slideTheme = {
  background: "#FFFDF4",
  surface: "rgba(21, 58, 91, 0.06)",
  surfaceStrong: "rgba(21, 58, 91, 0.10)",
  border: "rgba(21, 58, 91, 0.18)",
  ink: "#153A5B",
  inkMuted: "#4E6572",
  inkSubtle: "#7B8E96",
  accent: "#D4A400",
  accent2: "#1B8AA6",
  accentSoft: "rgba(212, 164, 0, 0.16)",
  accent2Soft: "rgba(27, 138, 166, 0.12)",
  danger: "#C86F52",
};

export const slideSpacing = {
  edge: 28,
  gap: 16,
  gapLarge: 24,
};

export const slideType = {
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
    color: slideTheme.accent,
  },
  display: {
    fontSize: 44,
    lineHeight: 50,
    fontWeight: "900",
    color: slideTheme.ink,
    letterSpacing: 0,
  },
  heading: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
    color: slideTheme.ink,
    letterSpacing: 0,
  },
  subheading: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "700",
    color: slideTheme.ink,
  },
  body: {
    fontSize: 17,
    lineHeight: 26,
    color: slideTheme.inkMuted,
  },
  caption: {
    fontSize: 14,
    lineHeight: 20,
    color: slideTheme.inkSubtle,
  },
  bullet: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "700",
    color: slideTheme.ink,
  },
  bulletDetail: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    color: slideTheme.inkMuted,
  },
  statValue: {
    fontSize: 64,
    lineHeight: 68,
    fontWeight: "900",
    color: slideTheme.ink,
    letterSpacing: -1.2,
    textAlign: "center",
  },
  statUnit: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "700",
    color: slideTheme.accent,
  },
  mono: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: slideTheme.ink,
  },
};

export const slideShared = StyleSheet.create({
  stage: {
    flex: 1,
    backgroundColor: slideTheme.background,
    paddingHorizontal: slideSpacing.edge,
    paddingTop: slideSpacing.edge * 2.2,
    paddingBottom: slideSpacing.edge * 3.5,
  },
  card: {
    backgroundColor: slideTheme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: slideTheme.border,
    padding: slideSpacing.gapLarge,
  },
});
