"use client";

import type { ChangeEvent } from "react";

/**
 * Two deliberate doors: the camera, and the photo library.
 *
 * The library door can be opened on several photos at once — a rail, a shelf, a pile on the bed —
 * which is how a wardrobe actually arrives. The camera takes one picture at a time, so it stays
 * single whatever the caller asks for.
 */
export function PhotoSourcePicker({
  label,
  accept="image/*",
  compact=false,
  multiple=false,
  onFile,
  onFiles,
}:{
  label:string;
  accept?:string;
  compact?:boolean;
  multiple?:boolean;
  onFile?:(file:File)=>void;
  onFiles?:(files:File[])=>void;
}) {
  function choose(event:ChangeEvent<HTMLInputElement>) {
    const files=[...(event.target.files??[])];
    event.currentTarget.value="";
    if(!files.length)return;
    if(onFiles)onFiles(files);
    else onFile?.(files[0]);
  }

  return <div className={`photo-source-picker ${compact?"compact":""}`} role="group" aria-label={label}>
    <label className="photo-source-action camera">
      <input type="file" accept={accept} capture="environment" onChange={choose}/>
      <span aria-hidden="true">◎</span>
      <strong>Take photo</strong>
      {!compact&&<small>Open your camera</small>}
    </label>
    <label className="photo-source-action library">
      <input type="file" accept={accept} multiple={multiple} onChange={choose}/>
      <span aria-hidden="true">▧</span>
      <strong>{multiple?"Choose images":"Choose image"}</strong>
      {!compact&&<small>{multiple?"Pick several at once":"Use your photo library"}</small>}
    </label>
  </div>;
}
