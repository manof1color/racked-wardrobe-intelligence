"use client";

import type { ChangeEvent } from "react";

export function PhotoSourcePicker({
  label,
  accept="image/*",
  compact=false,
  onFile,
}:{
  label:string;
  accept?:string;
  compact?:boolean;
  onFile:(file:File)=>void;
}) {
  function choose(event:ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0];
    event.currentTarget.value="";
    if(file)onFile(file);
  }

  return <div className={`photo-source-picker ${compact?"compact":""}`} role="group" aria-label={label}>
    <label className="photo-source-action camera">
      <input type="file" accept={accept} capture="environment" onChange={choose}/>
      <span aria-hidden="true">◎</span>
      <strong>Take photo</strong>
      {!compact&&<small>Open your camera</small>}
    </label>
    <label className="photo-source-action library">
      <input type="file" accept={accept} onChange={choose}/>
      <span aria-hidden="true">▧</span>
      <strong>Choose image</strong>
      {!compact&&<small>Use your photo library</small>}
    </label>
  </div>;
}
