const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
module.exports = function withIosDeploymentTarget(config) {
  return withDangerousMod(config, ['ios', (c) => {
    const podfile = path.join(c.modRequest.platformProjectRoot, 'Podfile');
    let s = fs.readFileSync(podfile, 'utf8');
    if (!s.includes('ABHICABS_FORCE_DEPLOYMENT_TARGET')) {
      s = s.replace(/post_install do \|installer\|/, `post_install do |installer|
    # ABHICABS_FORCE_DEPLOYMENT_TARGET
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |cfg|
        cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
      end
    end`);
      fs.writeFileSync(podfile, s);
    }
    return c;
  }]);
};
