const KEY='nbo-live-export-clock-v1';

// Reserve only the timestamp under the lock, never the expensive encoding work.
// Shared storage survives reloads; Web Locks serialize reservations across tabs.
export function createLiveNameAllocator(environment=globalThis){
  let last=0;
  return async formatName=>{
    const reserve=()=>{
      let saved=0;
      try{const value=Number(environment.localStorage?.getItem(KEY));if(Number.isSafeInteger(value)&&value>0)saved=value;}catch{/* Private mode can deny storage. */}
      const timestamp=Math.max(environment.Date?.now?.()??Date.now(),last+1,saved+1);
      const name=formatName(new Date(timestamp));
      last=timestamp;
      try{environment.localStorage?.setItem(KEY,String(timestamp));}catch{/* The in-memory clock still prevents repeats. */}
      return name;
    };
    const locks=environment.navigator?.locks;
    return locks?.request?locks.request(KEY,reserve):reserve();
  };
}
