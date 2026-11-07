import { boundedInspirationStrings, consumerInspirationRecord } from "./consumer-inspiration.ts";
import type { OutfitPost } from "./platform-types.ts";

/**
 * Saved Community looks: the heart on a Community post.
 *
 * A save is the person's private `INSPIRATION#<postId>` record, the same record the heart has always
 * written. It holds the post id and a bounded set of style words (consumerInspirationRecord), never
 * a photo, caption or author. The look's photo, title and pieces are read from the live post each
 * time, so a look that is unpublished, deleted, or whose author deleted their account loses them at
 * once: only the saved style words remain.
 *
 * One person adds at most one to a post's count. Requests say what the person wants ("saved" or not)
 * rather than "toggle", so a repeated or doubled request changes nothing the second time. The count
 * moves only after a conditional write that actually created or removed the record, and is put back
 * if the count update fails.
 */

/** The fields of a stored save that this module reads. */
export interface StoredSave {
  postId:string;
  outfitTitle?:string;
  styleHints?:unknown;
  colors?:unknown;
  categories?:unknown;
  subtypes?:unknown;
  createdAt?:string;
  /** Written on every save since saves became undoable: this save added one to the post's count. */
  countsLike?:boolean;
  /** Seeded judge data and demo copies were written straight to the table, without adding to any count. */
  testCohort?:boolean;
  demoSession?:boolean;
}

/** What the save logic needs from storage. Production uses DynamoDB; the tests use memory. */
export interface SavedLookStorage {
  /** The post, if it is still visible in Community. */
  findPost(postId:string):Promise<OutfitPost|null>;
  getSave(ownerId:string,postId:string):Promise<StoredSave|null>;
  /** Writes the save only if none exists. Returns false when one already did. */
  createSave(ownerId:string,save:StoredSave):Promise<boolean>;
  /** Removes the save only if it exists, returning what was removed, or null when there was none. */
  removeSave(ownerId:string,postId:string):Promise<StoredSave|null>;
  /** Puts back a save removed a moment ago (used when the count update after it fails). */
  restoreSave(ownerId:string,save:StoredSave):Promise<void>;
  /** Adds one to the post's count. Throws if the post is gone. */
  incrementLikes(postId:string):Promise<void>;
  /** Takes one from the post's count, never below zero. Returns quietly if the post is gone. */
  decrementLikes(postId:string):Promise<void>;
  currentLikes(postId:string):Promise<number>;
}

export class SavedLookNotFound extends Error { constructor(){super("Community post not found.");this.name="SavedLookNotFound";} }

/**
 * Whether removing this save should take one from the post's count. Saves written by the heart
 * always added one. Seeded judge saves and demo copies of them never did, so taking one away would
 * push a real post's count below the number of people who actually saved it.
 */
export function saveCountsLike(save:StoredSave) {
  if (typeof save.countsLike === "boolean") return save.countsLike;
  return !save.testCohort && !save.demoSession;
}

export interface SaveResult { postId:string; saved:boolean; likes:number }

export async function setLookSaved(storage:SavedLookStorage,ownerId:string,postId:string,saved:boolean):Promise<SaveResult> {
  return saved ? saveLook(storage,ownerId,postId) : unsaveLook(storage,ownerId,postId);
}

export async function saveLook(storage:SavedLookStorage,ownerId:string,postId:string):Promise<SaveResult> {
  const post=await storage.findPost(postId);
  if(!post)throw new SavedLookNotFound();
  if(await storage.getSave(ownerId,postId))return {postId,saved:true,likes:await storage.currentLikes(postId)};
  const save:StoredSave={...consumerInspirationRecord(post),countsLike:true};
  if(!await storage.createSave(ownerId,save))return {postId,saved:true,likes:await storage.currentLikes(postId)};
  try{await storage.incrementLikes(postId);}
  catch(error){
    // The save and the count move together: without the count, the save is taken back.
    await storage.removeSave(ownerId,postId).catch(()=>undefined);
    throw error;
  }
  return {postId,saved:true,likes:await storage.currentLikes(postId)};
}

/**
 * Removes a save. It works on a look that has left Community too, so a person can always clear a
 * card from their Outfits tab; there is no count to change then.
 */
export async function unsaveLook(storage:SavedLookStorage,ownerId:string,postId:string):Promise<SaveResult> {
  const removed=await storage.removeSave(ownerId,postId);
  if(removed&&saveCountsLike(removed)){
    try{await storage.decrementLikes(postId);}
    catch(error){
      await storage.restoreSave(ownerId,removed).catch(()=>undefined);
      throw error;
    }
  }
  const post=await storage.findPost(postId);
  return {postId,saved:false,likes:post?await storage.currentLikes(postId):0};
}

/** Removes every save this person made, each with its count, for account deletion. Safe to retry. */
export async function removeAllSaves(storage:SavedLookStorage,ownerId:string,postIds:string[]) {
  for(const postId of postIds)await unsaveLook(storage,ownerId,postId);
  return postIds.length;
}

/** One card in "Saved from Community". */
export type SavedLookCard =
  | { kind:"live"; postId:string; savedAt:string; post:OutfitPost }
  /** The look left Community. Only the style words saved with it remain: no photo, title or author. */
  | { kind:"gone"; postId:string; savedAt:string; styleWords:string[] };

/**
 * The cards for a person's saves, newest first. A save whose post is no longer visible keeps only
 * its style words; one with none left is dropped, since an empty card helps nobody.
 */
export function savedLookCards(saves:StoredSave[],postsById:Map<string,OutfitPost>):SavedLookCard[] {
  return [...saves]
    .filter(save=>typeof save.postId==="string"&&save.postId)
    .sort((a,b)=>String(b.createdAt??"").localeCompare(String(a.createdAt??"")))
    .flatMap((save):SavedLookCard[]=>{
      const savedAt=typeof save.createdAt==="string"?save.createdAt:"";
      const post=postsById.get(save.postId);
      if(post)return [{kind:"live",postId:save.postId,savedAt,post}];
      const styleWords=boundedInspirationStrings([
        ...boundedInspirationStrings(save.styleHints,12),
        ...boundedInspirationStrings(save.colors,12),
        ...boundedInspirationStrings(save.categories,12),
      ],16);
      return styleWords.length?[{kind:"gone",postId:save.postId,savedAt,styleWords}]:[];
    });
}
