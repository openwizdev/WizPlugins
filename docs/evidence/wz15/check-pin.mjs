import { readFileSync } from 'node:fs';

const root = new URL('../../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('wizbar/package.json', root)));
const lock = JSON.parse(readFileSync(new URL('wizbar/package-lock.json', root)));
const sdk = lock.packages['node_modules/@get-bb/plugin-sdk'];
// Expected distribution values from the published 0.6.49 registry metadata.
const expected = {
  'manifest SDK pin': [manifest.devDependencies['@get-bb/plugin-sdk'], '0.6.49'],
  'lock root SDK pin': [lock.packages[''].devDependencies['@get-bb/plugin-sdk'], '0.6.49'],
  'locked SDK version': [sdk.version, '0.6.49'],
  'locked SDK tarball': [sdk.resolved, 'https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.49.tgz'],
  'locked SDK integrity': [sdk.integrity, 'sha512-0YCOJm+iKWbmEaUF7JsrxRSWFz5OdOwVxM1KPuek8r55dYCPSgyA9NEdyq8OVlbhXSstF2wGlHXZ2Q9wwdMJzQ=='],
};
let failures = 0;
for (const [name, [actual, wanted]] of Object.entries(expected)) {
  if (actual === wanted) console.log(`PASS ${name}`);
  else {
    console.log(`FAIL ${name}: expected ${wanted}; found ${actual}`);
    failures++;
  }
}
console.log(`${Object.keys(expected).length - failures} passed; ${failures} failed`);
process.exitCode = failures ? 1 : 0;
