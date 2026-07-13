import React from "react";
import { Text, View, StyleSheet } from "react-native";

import { slideTheme, slideType } from "./slideTheme";

const styles = StyleSheet.create({
  mathBlock: {
    backgroundColor: slideTheme.surfaceStrong,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginTop: 12,
    borderWidth: 1,
    borderColor: slideTheme.border,
    alignItems: "center",
  },
  mathText: {
    ...slideType.mono,
    fontSize: 18,
    lineHeight: 26,
    textAlign: "center",
  },
  inlineMath: {
    ...slideType.mono,
    fontWeight: "700",
  },
  bold: { fontWeight: "800" },
  italic: { fontStyle: "italic" },
});

const INLINE_RE = /(\$\$([^$]+?)\$\$)|(\*\*([^*]+?)\*\*)|(\*([^*]+?)\*)/g;

function renderInline(source, baseStyle, keyPrefix) {
  const parts = [];
  let lastIndex = 0;
  let match;
  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(source)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: source.slice(lastIndex, match.index), style: null });
    }
    if (match[1]) {
      parts.push({ text: match[2], style: styles.inlineMath });
    } else if (match[3]) {
      parts.push({ text: match[4], style: styles.bold });
    } else if (match[5]) {
      parts.push({ text: match[6], style: styles.italic });
    }
    lastIndex = INLINE_RE.lastIndex;
  }
  if (lastIndex < source.length) {
    parts.push({ text: source.slice(lastIndex), style: null });
  }
  return (
    <Text style={baseStyle} key={keyPrefix}>
      {parts.map((p, i) =>
        p.style ? (
          <Text key={i} style={p.style}>
            {p.text}
          </Text>
        ) : (
          p.text
        )
      )}
    </Text>
  );
}

export function renderSlideRichText(text, baseStyle) {
  if (!text) return null;
  const paragraphs = String(text).split(/\n\n+/);
  return paragraphs.map((para, pIdx) => {
    const trimmed = para.trim();
    const blockMathMatch = trimmed.match(/^\$\$([\s\S]+?)\$\$$/);
    if (blockMathMatch) {
      return (
        <View key={`m-${pIdx}`} style={styles.mathBlock}>
          <Text style={styles.mathText}>{blockMathMatch[1].trim()}</Text>
        </View>
      );
    }
    return (
      <View key={`p-${pIdx}`} style={pIdx > 0 ? { marginTop: 10 } : null}>
        {renderInline(para, baseStyle, `t-${pIdx}`)}
      </View>
    );
  });
}
