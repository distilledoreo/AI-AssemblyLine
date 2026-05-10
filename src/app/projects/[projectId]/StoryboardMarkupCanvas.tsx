"use client";

import { useEffect, useRef, useState } from "react";

type StoryboardMarkupCanvasProps = {
  initialAnnotations?: Record<string, unknown>;
  onSave: (annotations: Record<string, unknown>) => void;
};

type FabricApi = typeof import("fabric");

export function StoryboardMarkupCanvas({ initialAnnotations, onSave }: Readonly<StoryboardMarkupCanvasProps>) {
  const elementRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<import("fabric").Canvas | null>(null);
  const fabricRef = useRef<FabricApi | null>(null);
  const [mode, setMode] = useState<"draw" | "select">("draw");

  useEffect(() => {
    let disposed = false;
    async function loadCanvas() {
      const fabric = await import("fabric");
      if (!elementRef.current || disposed) return;
      fabricRef.current = fabric;
      const canvas = new fabric.Canvas(elementRef.current, {
        backgroundColor: "#f8fafc",
        height: 260,
        width: 520,
        selection: true,
      });
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = "#0f172a";
      canvas.freeDrawingBrush.width = 3;
      canvas.isDrawingMode = true;
      if (initialAnnotations?.fabricJson) {
        await canvas.loadFromJSON(initialAnnotations.fabricJson);
        canvas.renderAll();
      }
      canvasRef.current = canvas;
    }
    loadCanvas();
    return () => {
      disposed = true;
      canvasRef.current?.dispose();
      canvasRef.current = null;
    };
  }, [initialAnnotations]);

  function setDrawingMode(nextMode: "draw" | "select") {
    setMode(nextMode);
    if (canvasRef.current) {
      canvasRef.current.isDrawingMode = nextMode === "draw";
    }
  }

  function addRectangle() {
    const fabric = fabricRef.current;
    const canvas = canvasRef.current;
    if (!fabric || !canvas) return;
    canvas.add(
      new fabric.Rect({
        left: 40,
        top: 40,
        width: 140,
        height: 90,
        fill: "rgba(56, 189, 248, 0.18)",
        stroke: "#0284c7",
        strokeWidth: 3,
      }),
    );
    canvas.renderAll();
  }

  function addText() {
    const fabric = fabricRef.current;
    const canvas = canvasRef.current;
    if (!fabric || !canvas) return;
    canvas.add(
      new fabric.Textbox("Note", {
        left: 220,
        top: 64,
        width: 160,
        fill: "#111827",
        fontSize: 22,
      }),
    );
    canvas.renderAll();
  }

  function saveMarkup() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave({ fabricJson: canvas.toJSON(), savedAt: new Date().toISOString() });
  }

  return (
    <div className="markup-canvas" aria-label="Fabric storyboard markup canvas">
      <div className="button-row" style={{ marginBottom: 8 }}>
        <button className="button secondary" type="button" onClick={() => setDrawingMode("draw")}>
          {mode === "draw" ? "Drawing" : "Draw"}
        </button>
        <button className="button secondary" type="button" onClick={() => setDrawingMode("select")}>
          Select
        </button>
        <button className="button secondary" type="button" onClick={addRectangle}>
          Rectangle
        </button>
        <button className="button secondary" type="button" onClick={addText}>
          Text
        </button>
        <button className="button secondary" type="button" onClick={() => canvasRef.current?.clear()}>
          Clear
        </button>
        <button className="button secondary" type="button" onClick={saveMarkup}>
          Save markup
        </button>
      </div>
      <canvas ref={elementRef} />
    </div>
  );
}
