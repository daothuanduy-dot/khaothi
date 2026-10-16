const TAB_MODULES = ['exams', 'school-students', 'candidates', 'subjects', 'sbd', 'rooming', 'forms', 'absences', 'scripts', 'scores', 'settings'];
const MODULE_VERSION = '0.1.72';

export async function loadTabModules() {
  const modules = await Promise.all(TAB_MODULES.map(async name => {
    const moduleUrl = new URL(`../modules/${name}.html?v=${MODULE_VERSION}`, import.meta.url);
    const response = await fetch(moduleUrl, {
      cache: 'no-cache'
    });
    if (!response.ok) {
      throw new Error(`Không tải được giao diện module "${name}" (HTTP ${response.status}).`);
    }
    return [name, await response.text()];
  }));

  for (const [name, markup] of modules) {
    const mount = document.getElementById(`module-${name}`);
    if (!mount) throw new Error(`Thiếu vùng hiển thị cho module "${name}".`);
    mount.innerHTML = markup;
  }
}
