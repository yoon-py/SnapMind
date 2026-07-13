import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { slideShared, slideSpacing, slideTheme, slideType } from "./slideTheme";

const styles = StyleSheet.create({
  stage: {
    ...slideShared.stage,
    justifyContent: "center",
  },
  headline: {
    ...slideType.heading,
    marginBottom: slideSpacing.gap,
    textAlign: "center",
  },
  vsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    marginTop: slideSpacing.gap,
  },
  column: {
    flex: 1,
    backgroundColor: slideTheme.surface,
    borderColor: slideTheme.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  columnLeft: {
    borderColor: slideTheme.accent2,
    backgroundColor: slideTheme.accent2Soft,
  },
  columnRight: {
    borderColor: slideTheme.accent,
    backgroundColor: slideTheme.accentSoft,
  },
  columnTitle: {
    ...slideType.subheading,
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 6,
  },
  columnTitleLeft: {
    color: slideTheme.accent2,
  },
  columnTitleRight: {
    color: slideTheme.accent,
  },
  divider: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  vsBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: slideTheme.background,
    borderColor: slideTheme.ink,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  vsText: {
    fontSize: 13,
    fontWeight: "900",
    color: slideTheme.ink,
    letterSpacing: 1,
  },
  point: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  pointDotLeft: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: slideTheme.accent2,
    marginTop: 8,
  },
  pointDotRight: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: slideTheme.accent,
    marginTop: 8,
  },
  pointText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: slideTheme.ink,
  },
});

function Column({ side, data }) {
  const isLeft = side === "left";
  return (
    <View style={[styles.column, isLeft ? styles.columnLeft : styles.columnRight]}>
      <Text
        style={[styles.columnTitle, isLeft ? styles.columnTitleLeft : styles.columnTitleRight]}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {data?.title || ""}
      </Text>
      {(Array.isArray(data?.points) ? data.points : []).slice(0, 4).map((point, index) => (
        <View key={index} style={styles.point}>
          <View style={isLeft ? styles.pointDotLeft : styles.pointDotRight} />
          <Text style={styles.pointText} numberOfLines={3}>
            {point}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ComparisonSlide({ data }) {
  const headline = data?.headline || "";
  return (
    <View style={styles.stage}>
      {headline ? (
        <Text style={styles.headline} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
          {headline}
        </Text>
      ) : null}
      <View style={styles.vsRow}>
        <Column side="left" data={data?.left} />
        <View style={styles.divider}>
          <View style={styles.vsBadge}>
            <Text style={styles.vsText}>VS</Text>
          </View>
        </View>
        <Column side="right" data={data?.right} />
      </View>
    </View>
  );
}
