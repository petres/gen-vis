// the scripts of the standalone script compressed (brotli and gzip) next to
// them for the upload (`npm run upload`), so a server which serves the files
// as they are sends them compressed, e.g. nginx with gzip_static and
// brotli_static, a CDN, e.g. jsDelivr, compresses them itself
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const dir = new URL('../dist-lib/', import.meta.url).pathname;
const files = d => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]);

let sizes = [0, 0, 0];
files(dir).filter(f => f.endsWith('.js')).forEach(file => {
    const content = readFileSync(file);
    const br = brotliCompressSync(content, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
    const gz = gzipSync(content, { level: 9 });
    writeFileSync(`${file}.br`, br);
    writeFileSync(`${file}.gz`, gz);
    sizes = [sizes[0] + content.length, sizes[1] + gz.length, sizes[2] + br.length];
});
const kB = n => `${Math.round(n / 1000)} kB`;
console.log(`dist-lib: ${kB(sizes[0])}, gzip ${kB(sizes[1])}, brotli ${kB(sizes[2])}`);
