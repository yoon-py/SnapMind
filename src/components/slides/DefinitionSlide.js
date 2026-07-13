import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { renderSlideRichText } from "./slideRichText";
import { slideShared, slideSpacing, slideTheme, slideType } from "./slideTheme";

const styles = StyleSheet.create({
  stage: {
    ...slideShared.stage,
    justifyContent: "center",
  },
  termEyebrow: {
    ...slideType.eyebrow,
    marginBottom: 10,
  },
  term: {
    ...slideType.heading,
    fontSize: 38,
    lineHeight: 44,
    marginBottom: slideSpacing.gap,
  },
  underline: {
    width: 56,
    height: 4,
    borderRadius: 2,
    backgroundColor: slideTheme.accent,
    marginBottom: slideSpacing.gapLarge,
  },
  definition: {
    ...slideType.body,
    fontSize: 19,
    lineHeight: 30,
    color: slideTheme.ink,
  },
  exampleCard: {
    marginTop: slideSpacing.gapLarge,
    backgroundColor: slideTheme.accent2Soft,
    borderColor: slideTheme.accent2,
    borderWidth: 1,
    borderRadius: 18,
    padding: slideSpacing.gap,
  },
  exampleLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: slideTheme.accent2,
    marginBottom: 6,
  },
  exampleText: {
    ...slideType.body,
    color: slideTheme.ink,
  },
});

export function DefinitionSlide({ data }) {
  const term = data?.term || "";
  const definition = data?.definition || "";
  const example = data?.example;

  return (
    <View style={styles.stage}>
      <Text style={styles.termEyebrow}>Definition</Text>
      <Text style={styles.term} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7}>
        {term}
      </Text>
      <View style={styles.underline} />
      {renderSlideRichText(definition, styles.definition)}
      {example ? (
        <View style={styles.exampleCard}>
          <Text style={styles.exampleLabel}>예시</Text>
          {renderSlideRichText(example, styles.exampleText)}
        </View>
      ) : null}
    </View>
  );
}
