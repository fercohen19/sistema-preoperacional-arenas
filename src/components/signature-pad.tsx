"use client";

import { useEffect, useRef, useState } from "react";

interface SignaturePadProps {
  onChange: (value: string) => void;
}

export function SignaturePad({ onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const [isSigned, setIsSigned] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;

    if (!canvas || !wrapper) {
      return;
    }

    const resizeCanvas = () => {
      const context = canvas.getContext("2d");

      if (!context) {
        return;
      }

      const ratio = window.devicePixelRatio || 1;
      const width = wrapper.clientWidth;
      const height = 220;

      const previous = canvas.toDataURL();

      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      context.scale(ratio, ratio);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 2;
      context.strokeStyle = "#1e2a32";
      context.fillStyle = "#fffdf8";
      context.fillRect(0, 0, width, height);

      if (isSigned) {
        const image = new Image();
        image.onload = () => {
          context.drawImage(image, 0, 0, width, height);
        };
        image.src = previous;
      }
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => window.removeEventListener("resize", resizeCanvas);
  }, [isSigned]);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const point = getPoint(event);
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!drawingRef.current || !canvas || !context) {
      return;
    }

    const point = getPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const endDrawing = () => {
    const canvas = canvasRef.current;

    if (!drawingRef.current || !canvas) {
      return;
    }

    drawingRef.current = false;
    setIsSigned(true);
    onChange(canvas.toDataURL("image/png"));
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    const ratio = window.devicePixelRatio || 1;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(ratio, ratio);
    context.fillStyle = "#fffdf8";
    context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2;
    context.strokeStyle = "#1e2a32";
    setIsSigned(false);
    onChange("");
  };

  return (
    <div className="stack-md" ref={wrapperRef}>
      <canvas
        className="signature-canvas"
        onPointerCancel={endDrawing}
        onPointerDown={startDrawing}
        onPointerLeave={endDrawing}
        onPointerMove={draw}
        onPointerUp={endDrawing}
        ref={canvasRef}
      />
      <div className="action-row">
        <button className="secondary-button" onClick={clearSignature} type="button">
          Limpiar firma
        </button>
        <p className="muted signature-help">
          Firme con el dedo o con el mouse dentro del recuadro.
        </p>
      </div>
    </div>
  );
}
