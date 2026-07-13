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
    marginBottom: slideSpacing.gap,
  },
  caption: {
    ...slideType.body,
    color: slideTheme.ink,
    fontSize: 19,
    lineHeight: 28,
    marginBottom: 12,
  },
  callouts: {
    marginTop: slideSpacing.gap,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  callout: {
    backgroundColor: slideTheme.accent2Soft,
    borderColor: slideTheme.accent2,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  calloutText: {
    fontSize: 13,
    fontWeight: "800",
    color: slideTheme.accent2,
  },
});

export function FallbackSlide({ scene }) {
  const headline = scene?.headline || "";
  const captionLines = Array.isArray(scene?.captionLines) ? scene.captionLines : [];
  const callouts = Array.isArray(scene?.callouts) ? scene.callouts : [];
  const fallbackBody = scene?.body || "";

  return (
    <View style={styles.stage}>
      {headline ? (
        <Text style={styles.headline} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7}>
          {headline}
        </Text>
      ) : null}
      {captionLines.length > 0
        ? captionLines.map((line, index) => (
            <View key={`cl-${index}`}>{renderSlideRichText(line, styles.caption)}</View>
          ))
        : fallbackBody
        ? renderSlideRichText(fallbackBody, styles.caption)
        : null}
      {callouts.length > 0 ? (
        <View style={styles.callouts}>
          {callouts.map((callout, index) => (
            <View key={`co-${index}`} style={styles.callout}>
              <Text style={styles.calloutText} numberOfLines={1}>
                {callout}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
