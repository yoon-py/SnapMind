import React from "react";
import { Image, StyleSheet, View } from "react-native";

import { BulletsSlide } from "./BulletsSlide";
import { ComparisonSlide } from "./ComparisonSlide";
import { DefinitionSlide } from "./DefinitionSlide";
import { FallbackSlide } from "./FallbackSlide";
import { slideTheme } from "./slideTheme";
import { StatSlide } from "./StatSlide";
import { TitleSlide } from "./TitleSlide";

const slideRenderers = {
  title: TitleSlide,
  bullets: BulletsSlide,
  definition: DefinitionSlide,
  comparison: ComparisonSlide,
  stat: StatSlide,
};

const legacyStyles = StyleSheet.create({
  frame: {
    flex: 1,
    backgroundColor: slideTheme.background,
    overflow: "hidden",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.92,
  },
  foreground: {
    flex: 1,
    width: "100%",
  },
});

function LegacyImageSlide({ url }) {
  return (
    <View style={legacyStyles.frame}>
      <Image
        blurRadius={26}
        resizeMode="cover"
        source={{ uri: url }}
        style={legacyStyles.backdrop}
      />
      <Image resizeMode="contain" source={{ uri: url }} style={legacyStyles.foreground} />
    </View>
  );
}

export function SceneSlide({ scene, sceneImageUrl }) {
  const slide = scene?.slide;
  const type = slide?.type;
  const Renderer = type ? slideRenderers[type] : null;

  if (sceneImageUrl) {
    return <LegacyImageSlide url={sceneImageUrl} />;
  }
  if (Renderer && slide?.data) {
    return <Renderer data={slide.data} scene={scene} />;
  }
  return <FallbackSlide scene={scene} />;
}
