import assert from "node:assert/strict";
import test from "node:test";
import { isPotentialPhoneImage } from "../lib/upload-client.ts";

test("mobile upload accepts common iPhone and web camera formats",()=>{
  for(const type of ["image/jpeg","image/png","image/webp","image/heic","image/heif","image/avif"]){
    assert.equal(isPotentialPhoneImage({name:"camera-photo",size:4_000_000,type}),true,type);
  }
});

test("mobile upload tolerates missing MIME metadata when the camera filename is recognizable",()=>{
  assert.equal(isPotentialPhoneImage({name:"IMG_1042.HEIC",size:4_000_000,type:""}),true);
  assert.equal(isPotentialPhoneImage({name:"IMG_1042.JPG",size:4_000_000,type:""}),true);
});

test("mobile upload rejects non-images, empty files, and oversized originals",()=>{
  assert.equal(isPotentialPhoneImage({name:"notes.txt",size:100,type:"text/plain"}),false);
  assert.equal(isPotentialPhoneImage({name:"photo.jpg",size:0,type:"image/jpeg"}),false);
  assert.equal(isPotentialPhoneImage({name:"photo.jpg",size:25_000_001,type:"image/jpeg"}),false);
});
