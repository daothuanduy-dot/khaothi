export function numberSubjectCandidates(ordered,{totalLength,prefixLength,prefix}){
 if(![6,8].includes(totalLength))throw new Error('Độ dài SBD chỉ được chọn 6 hoặc 8 chữ số.');
 if(![2,3].includes(prefixLength)||typeof prefix!=='string'||prefix.length!==prefixLength||!/^\d+$/.test(prefix))throw new Error(`Tiền tố SBD phải gồm đúng ${prefixLength} chữ số.`);
 const width=totalLength-prefixLength;
 if(ordered.length>=10**width)throw new Error('Dải số báo danh không đủ cho danh sách thí sinh.');
 return ordered.map((candidate,index)=>({candidate_id:candidate.id,sbd:prefix+String(index+1).padStart(width,'0')}));
}
