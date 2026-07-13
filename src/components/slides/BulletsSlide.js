import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { renderSlideRichText } from "./slideRichText";
import { slideShared, slideSpacing, slideTheme, slideType } from "./slideTheme";

const styles = StyleSheet.create({
  stage: {
    ...slideShared.stage,
    justifyContent: "center",
  },
  headline: {
    ...slideType.heading,
    marginBottom: slideSpacing.gapLarge,
  },
  list: {
    gap: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  indexBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: slideTheme.accentSoft,
    borderColor: slideTheme.accent,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  indexText: {
    fontSize: 14,
    fontWeight: "900",
    color: slideTheme.accent,
  },
  textColumn: {
    flex: 1,
  },
  label: {
    ...slideType.bullet,
  },
  detail: {
    ...slideType.bulletDetail,
    marginTop: 4,
  },
});

export function BulletsSlide({ data }) {
  const headline = data?.headline || "";
  const items = Array.isArray(data?.items) ? data.items.slice(0, 5) : [];

  return (
    <View style={styles.stage}>
      <Text style={styles.headline} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7}>
        {headline}
      </Text>
      <View style={styles.list}>
        {items.map((item, index) => (
          <View key={`${index}-${item?.label || ""}`} style={styles.row}>
            <View style={styles.indexBubble}>
              <Text style={styles.indexText}>{index + 1}</Text>
            </View>
            <View style={styles.textColumn}>
              <Text style={styles.label} numberOfLines={2}>
                {item?.label || ""}
              </Text>
              {item?.detail ? renderSlideRichText(item.detail, styles.detail) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
