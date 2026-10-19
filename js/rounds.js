export async function loadExamRounds(client,examId){
  if(!client)throw new Error('Chưa kết nối CSDL.');
  if(!examId)return [];
  let rounds=[];
  let roundsError=null;
  // v0.1.104 is the source used by the round-management screen and returns
  // both active and inactive rows. Use it here so Forms, Rooming and
  // management cannot disagree about the available rounds.
  const managed=await client.rpc('exam_list_rounds',{p_exam_id:examId});
  if(!managed.error)rounds=(managed.data||[]).filter(round=>round.is_active!==false);
  else roundsError=managed.error;
  if(!rounds.length){
    const configured=await client.rpc('exam_get_rounds',{p_exam_id:examId});
    if(configured.error)roundsError=roundsError||configured.error;
    else rounds=(configured.data||[]).filter(round=>round.is_active!==false);
  }
  if(!rounds.length){
    for(const roundNo of [1,2]){
      const probe=await client.rpc('exam_get_round_candidates',{p_exam_id:examId,p_round_no:roundNo});
      if(!probe.error){
        rounds.push({round_no:roundNo,name:`Đợt ${roundNo}`,is_active:true});
        continue;
      }
      const detail=String(probe.error.message||'').toLowerCase();
      if(probe.error.code==='42501'||detail.includes('không có quyền')){
        roundsError=roundsError||probe.error;
        break;
      }
    }
  }
  if(!rounds.length&&roundsError)throw new Error(`Không tải được danh sách đợt thi qua cơ chế xếp phòng. Hãy kiểm tra phiên đăng nhập quản trị và migration v0.1.92/v0.1.101. ${roundsError.message}`);
  if(!rounds.length)throw new Error(`Kỳ thi ${examId} chưa có đợt thi đang hoạt động.`);
  return [...new Map(rounds.map(round=>[Number(round.round_no),{round_no:Number(round.round_no),name:round.name||`Đợt ${round.round_no}`,is_active:round.is_active!==false}])).values()].sort((a,b)=>a.round_no-b.round_no);
}
