import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { slideShared, slideSpacing, slideTheme, slideType } from "./slideTheme";

const styles = StyleSheet.create({
  stage: {
    ...slideShared.stage,
    justifyContent: "center",
  },
  eyebrowChip: {
    alignSelf: "flex-start",
    backgroundColor: slideTheme.accentSoft,
    borderColor: slideTheme.accent,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: slideSpacing.gapLarge,
  },
  eyebrowText: {
    ...slideType.eyebrow,
    color: slideTheme.accent,
  },
  headline: {
    ...slideType.display,
    marginBottom: slideSpacing.gap,
  },
  subhead: {
    ...slideType.subheading,
    color: slideTheme.inkMuted,
    fontWeight: "500",
  },
  accentRow: {
    marginTop: slideSpacing.gapLarge,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  accentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: slideTheme.accent2,
  },
  accentText: {
    ...slideType.caption,
    color: slideTheme.accent2,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
});

export function TitleSlide({ data }) {
  const eyebrow = data?.eyebrow;
  const headline = data?.headline || "";
  const subhead = data?.subhead;
  const accent = data?.accent;

  return (
    <View style={styles.stage}>
      {eyebrow ? (
        <View style={styles.eyebrowChip}>
          <Text style={styles.eyebrowText} numberOfLines={1}>
            {eyebrow}
          </Text>
        </View>
      ) : null}
      <Text style={styles.headline} numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.7}>
        {headline}
      </Text>
      {subhead ? (
        <Text style={styles.subhead} numberOfLines={4}>
          {subhead}
        </Text>
      ) : null}
      {accent ? (
        <View style={styles.accentRow}>
          <View style={styles.accentDot} />
          <Text style={styles.accentText} numberOfLines={1}>
            {accent}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
