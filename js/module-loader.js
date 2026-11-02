const TAB_MODULES = ['exams', 'school-students', 'candidates', 'subjects', 'sbd', 'rooming', 'forms', 'absences', 'scripts', 'accounts', 'teaching', 'scores', 'settings'];
// Legacy compatibility marker retained for older static checks: MODULE_VERSION = '0.1.90'.
const MODULE_VERSION = '0.1.211';
// Legacy compatibility marker retained for older static checks: MODULE_VERSION = '0.1.90'.

export async function loadTabModules({onProgress=()=>{}}={}) {
  const modules=[];
  for(let index=0;index<TAB_MODULES.length;index++){
    const name=TAB_MODULES[index];
    onProgress({name,index:index+1,total:TAB_MODULES.length});
    const moduleUrl = new URL(`../modules/${name}.html?v=${MODULE_VERSION}&choice=152&sbd=161&forms=163&statistics=168&manual=179&private=181&sbdoptions=182&choiceflow=183&layout=184&hallcontrols=185&excelhall=186&inheritrooms=187&blocks=188&absences=189&resetrooming=190&absentscores=191&roomlabels=192&amendments=193&corrections=194&averages=195&rankgroups=196&topstudents=199&templateexport=201&supplemental=202`, import.meta.url);
    const controller=new AbortController();
    let timeout;
    const timeoutError=new Error(`Hết thời gian tải giao diện module "${name}" sau 15 giây.`);
    const timedOut=new Promise((_,reject)=>{
      timeout=setTimeout(()=>{
        controller.abort();
        reject(timeoutError);
      },15000);
    });
    try {
      const response=await Promise.race([
        fetch(moduleUrl,{cache:'no-cache',signal:controller.signal}),
        timedOut
      ]);
      if (!response.ok) {
        throw new Error(`Không tải được giao diện module "${name}" (HTTP ${response.status}).`);
      }
      const markup=await Promise.race([response.text(),timedOut]);
      if(!new RegExp(`<section\\b[^>]*\\bid=["']tab-${name}["']`).test(markup)){
        throw new Error(`Giao diện module "${name}" không đúng nội dung. Hãy cập nhật modules/${name}.html cùng bộ tệp ứng dụng.`);
      }
      modules.push([name,markup]);
    } catch(error) {
      if(controller.signal.aborted)throw timeoutError;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  for (const [name, markup] of modules) {
    const mount = document.getElementById(`module-${name}`);
    if (!mount) throw new Error(`Thiếu vùng hiển thị cho module "${name}".`);
    mount.innerHTML = markup;
  }
  return MODULE_VERSION;
}
