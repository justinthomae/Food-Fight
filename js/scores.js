// Food Fight global leaderboard — talks to two Supabase RPCs (see supabase/migrations). Site only.
window.FFScores=(function(){
  const enabled=!!(window.FFNet&&window.FFNet.enabled);
  const withTimeout=(p,ms)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms))]);
  async function submit(e){
    if(!enabled)return{ok:false,reason:'offline'};
    try{
      const args={p_device_id:e.deviceId,p_name:e.name,p_mode:e.mode,p_difficulty:e.difficulty,p_score:e.score,
        p_max_chain:e.maxChain,p_kos:e.kos,p_won:e.won,p_place:e.place,p_duration_s:e.duration,p_version:e.version,p_avatar:e.avatar||''};
      let {data,error}=await withTimeout(window.FFNet.client().rpc('ff_submit_score',args),8000);
      // database without the avatar migration yet: retry the original call shape
      if(error&&/p_avatar|function|schema cache/i.test(error.message||'')){delete args.p_avatar;({data,error}=await withTimeout(window.FFNet.client().rpc('ff_submit_score',args),8000))}
      if(error)return{ok:false,reason:'error'};
      return data||{ok:false,reason:'error'};
    }catch(err){return{ok:false,reason:'network'}}
  }
  async function board(mode,difficulty,period,deviceId,limit){
    if(!enabled)throw new Error('offline');
    const {data,error}=await withTimeout(window.FFNet.client().rpc('ff_leaderboard',{
      p_mode:mode,p_difficulty:difficulty,p_period:period,p_device_id:deviceId,p_limit:limit||50}),8000);
    if(error)throw error;
    return data||[];
  }
  return {enabled,submit,board};
})();
