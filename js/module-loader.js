const TAB_MODULES = ['exams', 'school-students', 'candidates', 'subjects', 'sbd', 'rooming', 'forms', 'absences', 'scripts', 'accounts', 'teaching', 'scores', 'settings'];
// Legacy compatibility marker retained for older static checks: MODULE_VERSION = '0.1.90'.
const MODULE_VERSION = '0.1.266';
// Legacy compatibility marker retained for older static checks: MODULE_VERSION = '0.1.90'.

export async function loadTabModules({onProgress=()=>{}}={}) {
  const modules=new Array(TAB_MODULES.length);
  const concurrency=4;
  let next=0, completed=0;
  async function worker(){
    while(next<TAB_MODULES.length){
      const index=next++;
      const name=TAB_MODULES[index];
      const moduleUrl=new URL(`../modules/${name}.html?v=${MODULE_VERSION}&choice=152&sbd=161&forms=163&statistics=168&manual=179&private=181&sbdoptions=182&choiceflow=183&layout=184&hallcontrols=185&excelhall=186&inheritrooms=187&blocks=188&absences=189&resetrooming=190&absentscores=191&roomlabels=192&amendments=193&corrections=194&averages=195&rankgroups=196&topstudents=199&templateexport=201&supplemental=202`,import.meta.url);
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),25000);
      try{
        const response=await fetch(moduleUrl,{cache:'default',signal:controller.signal});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const markup=await response.text();
        if(!new RegExp(`<section\\b[^>]*\\bid=["']tab-${name}["']`).test(markup)){
          throw new Error('Nội dung HTML không đúng module. Kiểm tra tệp trên GitHub Pages.');
        }
        modules[index]=markup;
        completed++;
        onProgress({name,index:completed,total:TAB_MODULES.length});
      }catch(error){
        if(controller.signal.aborted)throw new Error(`Module ${name} quá 25 giây chưa phản hồi. Kiểm tra đường truyền và thử tải lại.`);
        throw new Error(`Không tải được module ${name}: ${error.message}`);
      }finally{clearTimeout(timeout)}
    }
  }
  await Promise.all(Array.from({length:Math.min(concurrency,TAB_MODULES.length)},()=>worker()));
  TAB_MODULES.forEach((name,index)=>{
    const mount=document.getElementById(`module-${name}`);
    if(!mount)throw new Error(`Thiếu vùng hiển thị cho module ${name}.`);
    mount.innerHTML=modules[index];
  });
  return MODULE_VERSION;
}
