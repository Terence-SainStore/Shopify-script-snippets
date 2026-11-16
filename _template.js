/**
 * =============================================================================
 * 脚本名称：my-script
 * 用途：一句话说明这个脚本做什么
 * 场景：什么时候会用到
 * 用法：复制到任意分类目录并改名；扩展同步后即可运行
 * =============================================================================
 */
(function myScript() {
  'use strict';

  console.group('%c[Toolbox] my-script', 'color:#3b82f6;font-weight:bold');
  console.log('在这里写你的逻辑');
  console.groupEnd();

  // 需要给 Console 继续调用时，挂到统一命名空间
  window.__toolbox = window.__toolbox || {};
  window.__toolbox.myScript = {
    // ping: () => console.log('pong'),
  };
})();
