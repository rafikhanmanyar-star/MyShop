const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
    console.log('--- Running afterPack hook ---');
    console.log('Copying server/node_modules to resources/server/node_modules...');
    const src = path.join(context.packager.projectDir, 'server/node_modules');
    const dest = path.join(context.appOutDir, 'resources', 'server', 'node_modules');

    if (fs.existsSync(src)) {
        fs.cpSync(src, dest, { recursive: true });
        console.log('Successfully copied node_modules.');
    } else {
        console.warn('Source server/node_modules not found!');
    }
};
