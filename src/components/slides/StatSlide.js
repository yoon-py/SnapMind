import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { renderSlideRichText } from "./slideRichText";
import { slideShared, slideSpacing, slideTheme, slideType } from "./slideTheme";

const styles = StyleSheet.create({
  stage: {
    ...slideShared.stage,
    justifyContent: "center",
    alignItems: "center",
  },
  headline: {
    ...slideType.subheading,
    color: slideTheme.inkMuted,
    textAlign: "center",
    marginBottom: slideSpacing.gap,
    fontWeight: "700",
  },
  valueBlock: {
    paddingVertical: slideSpacing.gapLarge,
    paddingHorizontal: slideSpacing.gap,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  valueText: {
    ...slideType.statValue,
  },
  unit: {
    ...slideType.statUnit,
    marginTop: 8,
  },
  caption: {
    ...slideType.caption,
    color: slideTheme.inkMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: slideSpacing.gapLarge,
  },
});

function hasBlockMath(value) {
  return /^\s*\$\$[\s\S]+?\$\$\s*$/.test(String(value || "").trim());
}

export function StatSlide({ data }) {
  const headline = data?.headline;
  const value = data?.value || "";
  const unit = data?.unit;
  const caption = data?.caption;
  const isMath = hasBlockMath(value);

  return (
    <View style={styles.stage}>
      {headline ? (
        <Text style={styles.headline} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
          {headline}
        </Text>
      ) : null}
      <View style={styles.valueBlock}>
        {isMath ? (
          renderSlideRichText(value, styles.valueText)
        ) : (
          <Text style={styles.valueText} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.4}>
            {value}
          </Text>
        )}
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      {caption ? renderSlideRichText(caption, styles.caption) : null}
    </View>
  );
}
