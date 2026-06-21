import { useEffect, useState } from "react";
import { useExtract } from "../extract";

/**
 * Whole-page drag overlay (IMAGE-EXTRACTION.md §7). Shows while an image file is
 * dragged over the window; dropping opens the extract dialog. Drag depth is
 * tracked so nested dragenter/leave events don't flicker the overlay, and it
 * only engages when the drag actually carries files.
 */
export function Dropzone() {
  const openWith = useExtract((s) => s.openWith);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); // required so the drop event fires (no navigation)
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setActive(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) openWith(file);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [openWith]);

  if (!active) return null;
  return (
    <div className="dropzone-overlay" aria-hidden="true">
      <div className="dropzone-frame">
        <span>Drop an image to extract a scheme</span>
      </div>
    </div>
  );
}
