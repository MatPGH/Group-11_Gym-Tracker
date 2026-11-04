const { inflateSync } = require('node:zlib');

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

// The browser converts uploads to a small, non-interlaced, eight-bit PNG.
// Check both the PNG structure and decoded raster before persisting the data.
function validPicture(image) {
  if (typeof image !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) return false;
  const encoded = image.slice('data:image/png;base64,'.length);
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 45 || bytes.length > 256 * 1024 || bytes.toString('base64') !== encoded ||
      bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return false;
  let offset = 8, width, height, channels, ended = false;
  const data = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > bytes.length) return false;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) return false;
    if (offset === 8 && type !== 'IHDR') return false;
    if (type === 'IHDR') {
      if (offset !== 8 || length !== 13) return false;
      width = bytes.readUInt32BE(offset + 8); height = bytes.readUInt32BE(offset + 12);
      channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[bytes[offset + 17]];
      if (!width || width > 512 || !height || height > 512 || !channels ||
          bytes[offset + 16] !== 8 || bytes[offset + 18] || bytes[offset + 19] || bytes[offset + 20]) return false;
    } else if (type === 'IDAT') data.push(bytes.subarray(offset + 8, end - 4));
    else if (type === 'IEND') { ended = length === 0 && end === bytes.length; break; }
    offset = end;
  }
  if (!ended || !data.length) return false;
  try {
    const stride = width * channels + 1;
    const raster = inflateSync(Buffer.concat(data), { maxOutputLength: stride * height });
    if (raster.length !== stride * height) return false;
    for (let row = 0; row < height; row++) if (raster[row * stride] > 4) return false;
    return true;
  } catch { return false; }
}
module.exports = validPicture;
