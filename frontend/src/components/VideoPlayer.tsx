"use client";

import { forwardRef } from "react";

interface Props {
  src: string;
  onTimeUpdate?: (time: number) => void;
}

const VideoPlayer = forwardRef<HTMLVideoElement, Props>(
  function VideoPlayer({ src, onTimeUpdate }, ref) {
    return (
      <div
        className="w-full overflow-hidden rounded-xl aspect-video"
        style={{ background: "#000", border: "1px solid var(--border)" }}
      >
        <video
          ref={ref}
          src={src}
          controls
          className="w-full h-full object-contain"
          onTimeUpdate={(e) => onTimeUpdate?.((e.target as HTMLVideoElement).currentTime)}
          preload="metadata"
          crossOrigin="anonymous"
        />
      </div>
    );
  }
);

export default VideoPlayer;
