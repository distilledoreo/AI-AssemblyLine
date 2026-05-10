import type { ComposedPrompt } from "@/providers/types";
import type { Asset, ProjectStyle, Scene, Shot } from "@/server/types";

export function composeStoryboardPrompt(input: {
  style?: ProjectStyle;
  scene: Scene;
  shot: Shot;
  assets: Asset[];
  userDirection?: string;
  maxLength?: number;
}): ComposedPrompt {
  const conflictWarnings: string[] = [];
  const truncationWarnings: string[] = [];
  const styleBlock = input.style
    ? `Style: ${input.style.description}. Medium: ${input.style.renderingMedium}. Lens language: ${input.style.lensLanguage}.`
    : "";
  const assetBlock = input.assets
    .map((asset) => `${asset.type}: ${asset.canonicalName}. ${asset.description ?? asset.continuityNotes ?? ""}`)
    .join("\n");
  let userDirection = input.userDirection ?? input.shot.userDirection ?? "";
  if (input.style?.approvalStatus === "locked" && /photoreal/i.test(userDirection) && !/photo/i.test(input.style.renderingMedium)) {
    conflictWarnings.push("User direction conflicted with locked style and was dropped.");
    userDirection = "";
  }
  const sections = [
    styleBlock,
    `Negative constraints: ${input.style?.negativeConstraints ?? "off-model assets, inconsistent continuity"}`,
    `Scene: ${input.scene.heading}. ${input.scene.summary}`,
    `Shot: ${input.shot.action}. Camera: ${input.shot.cameraAngle ?? "production framing"}. Movement: ${input.shot.cameraMovement ?? "motivated camera"}. Lighting: ${input.shot.lightingNotes ?? "motivated lighting"}.`,
    assetBlock,
    userDirection ? `User direction: ${userDirection}` : "",
  ].filter(Boolean);
  let positivePrompt = sections.join("\n\n");
  const maxLength = input.maxLength ?? 4000;
  if (positivePrompt.length > maxLength) {
    positivePrompt = positivePrompt.slice(0, maxLength);
    truncationWarnings.push("Prompt was truncated to provider budget.");
  }
  return {
    positivePrompt,
    negativePrompt: input.style?.negativeConstraints ?? "off-model, blurry, continuity errors",
    referenceImages: [],
    generationSettings: { width: 1024, height: 576, aspectRatio: "16:9" },
    metadata: {
      sourceIds: [input.scene.id, input.shot.id, ...input.assets.map((asset) => asset.id)],
      truncationWarnings,
      conflictWarnings,
    },
  };
}
