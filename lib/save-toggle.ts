/**
 * The heart, on the client. A tap shows the new state at once, sends the state the person wants
 * (never "toggle"), then shows what the server answered. A failed request puts back exactly what was
 * there before. A second tap on the same look while the first is still on its way does nothing, so
 * a double tap can never send two requests.
 */
export interface SaveState { saved:boolean; likes:number }
export type SaveRequest = (postId:string,saved:boolean) => Promise<SaveState>;

export function optimisticSave(current:SaveState):SaveState {
  const saved=!current.saved;
  return { saved, likes:Math.max(0,current.likes+(saved?1:-1)) };
}

export function createSaveToggle(request:SaveRequest) {
  const inFlight=new Set<string>();
  return {
    isPending:(postId:string)=>inFlight.has(postId),
    /** Returns the server's answer, or null when a request for this look was already on its way. */
    async toggle(postId:string,current:SaveState,apply:(state:SaveState)=>void):Promise<SaveState|null> {
      if(inFlight.has(postId))return null;
      inFlight.add(postId);
      const wanted=optimisticSave(current);
      apply(wanted);
      try{
        const answer=await request(postId,wanted.saved);
        apply(answer);
        return answer;
      }catch(error){
        apply(current);
        throw error;
      }finally{
        inFlight.delete(postId);
      }
    },
  };
}

/** The real request: PATCH /api/community with the wanted state. */
export const saveLookRequest:SaveRequest=async(postId,saved)=>{
  const response=await fetch("/api/community",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({postId,saved})});
  const data=await response.json().catch(()=>({})) as {saved?:boolean;likes?:number;error?:string};
  if(!response.ok||typeof data.saved!=="boolean"||typeof data.likes!=="number")throw new Error(data.error??(saved?"The look could not be saved.":"The look could not be removed."));
  return {saved:data.saved,likes:data.likes};
};
