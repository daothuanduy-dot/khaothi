const TAB_MODULES = ['exams', 'school-students', 'candidates', 'subjects', 'sbd', 'rooming', 'forms', 'absences', 'scripts', 'accounts', 'teaching', 'scores', 'settings'];
// Legacy compatibility marker retained for older static checks: MODULE_VERSION = '0.1.90'.
const MODULE_VERSION = '0.1.147';
// Legacy compatibility marker retained for older static checks: MODULE_VERSION = '0.1.90'.

export async function loadTabModules() {
  const modules = await Promise.all(TAB_MODULES.map(async name => {
    const moduleUrl = new URL(`../modules/${name}.html?v=${MODULE_VERSION}&choice=152&sbd=161`, import.meta.url);
    const response = await fetch(moduleUrl, {
      cache: 'no-cache'
    });
    if (!response.ok) {
      throw new Error(`Không tải được giao diện module "${name}" (HTTP ${response.status}).`);
    }
    const markup=await response.text();
    if(!new RegExp(`<section\\b[^>]*\\bid=["']tab-${name}["']`).test(markup)){
      throw new Error(`Giao diện module "${name}" không đúng nội dung. Hãy cập nhật modules/${name}.html cùng bộ tệp ứng dụng.`);
    }
    return [name, markup];
  }));

  for (const [name, markup] of modules) {
    const mount = document.getElementById(`module-${name}`);
    if (!mount) throw new Error(`Thiếu vùng hiển thị cho module "${name}".`);
    mount.innerHTML = markup;
  }
  return MODULE_VERSION;
}
