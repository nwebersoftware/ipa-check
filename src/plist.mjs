// Parse an Info.plist that is either XML or binary (bplist00). Dependency-free.
// Only the types that appear in real Info.plist files are supported.

// ---------------------------------------------------------------- binary ----

function readUInt(buf, off, size) {
  let v = 0;
  for (let i = 0; i < size; i += 1) v = v * 256 + buf[off + i];
  return v;
}

export function parseBinaryPlist(buf) {
  const t = buf.length - 32;
  const offsetIntSize = buf[t + 6];
  const objRefSize = buf[t + 7];
  const numObjects = readUInt(buf, t + 8, 8);
  const topObject = readUInt(buf, t + 16, 8);
  const offsetTableOffset = readUInt(buf, t + 24, 8);

  const offsets = [];
  for (let i = 0; i < numObjects; i += 1) {
    offsets.push(readUInt(buf, offsetTableOffset + i * offsetIntSize, offsetIntSize));
  }

  const lengthOf = (off, low) => {
    if (low !== 0xf) return { len: low, dataStart: off + 1 };
    const intMarker = buf[off + 1];
    const n = 1 << (intMarker & 0xf);
    return { len: readUInt(buf, off + 2, n), dataStart: off + 2 + n };
  };

  const parseObject = (i) => {
    const off = offsets[i];
    const marker = buf[off];
    const type = marker >> 4;
    const low = marker & 0xf;
    if (type === 0x0) {
      if (low === 0x8) return false;
      if (low === 0x9) return true;
      return null;
    }
    if (type === 0x1) return readUInt(buf, off + 1, 1 << low);
    if (type === 0x2) {
      const n = 1 << low;
      return n === 4 ? buf.readFloatBE(off + 1) : buf.readDoubleBE(off + 1);
    }
    if (type === 0x4) {
      const { len, dataStart } = lengthOf(off, low);
      return buf.subarray(dataStart, dataStart + len);
    }
    if (type === 0x5) {
      const { len, dataStart } = lengthOf(off, low);
      return buf.toString('latin1', dataStart, dataStart + len);
    }
    if (type === 0x6) {
      const { len, dataStart } = lengthOf(off, low);
      let s = '';
      for (let j = 0; j < len; j += 1) s += String.fromCharCode(buf.readUInt16BE(dataStart + j * 2));
      return s;
    }
    if (type === 0xa) {
      const { len, dataStart } = lengthOf(off, low);
      const arr = [];
      for (let j = 0; j < len; j += 1) {
        arr.push(parseObject(readUInt(buf, dataStart + j * objRefSize, objRefSize)));
      }
      return arr;
    }
    if (type === 0xd) {
      const { len, dataStart } = lengthOf(off, low);
      const obj = {};
      for (let j = 0; j < len; j += 1) {
        const k = parseObject(readUInt(buf, dataStart + j * objRefSize, objRefSize));
        const v = parseObject(readUInt(buf, dataStart + (len + j) * objRefSize, objRefSize));
        obj[String(k)] = v;
      }
      return obj;
    }
    throw new Error(`unsupported binary plist object type 0x${type.toString(16)}`);
  };

  return parseObject(topObject);
}

// ------------------------------------------------------------------- xml ----

function strip(xml) {
  return xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function unescape(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function tokenize(xml) {
  const s = strip(xml);
  const tokens = [];
  const re = /<([^>]+)>|([^<]+)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1] !== undefined) {
      const raw = m[1].trim();
      if (raw.endsWith('/')) tokens.push({ t: 'self', name: raw.slice(0, -1).trim() });
      else if (raw.startsWith('/')) tokens.push({ t: 'close', name: raw.slice(1).trim() });
      else tokens.push({ t: 'open', name: raw.split(/\s/)[0] });
    } else if (m[2].trim()) {
      tokens.push({ t: 'text', text: m[2] });
    }
  }
  return tokens;
}

function simpleVal(name, content) {
  const c = content.trim();
  if (name === 'true') return true;
  if (name === 'false') return false;
  if (name === 'integer') return parseInt(c, 10);
  if (name === 'real') return Number(c);
  return unescape(c); // string, key, date, data
}

function parseNodes(tokens, pos, stopName) {
  const out = [];
  while (pos.i < tokens.length) {
    const tok = tokens[pos.i++];
    if (tok.t === 'close') {
      if (stopName && tok.name === stopName) return out;
      throw new Error(`unexpected closing tag </${tok.name}>`);
    }
    if (tok.t === 'text') continue;
    if (tok.t === 'self') {
      out.push(simpleVal(tok.name, ''));
      continue;
    }
    // open tag
    if (tok.name === 'dict' || tok.name === 'array' || tok.name === 'plist') {
      const kids = parseNodes(tokens, pos, tok.name);
      if (tok.name === 'dict') {
        const d = {};
        for (let i = 0; i < kids.length; i += 2) d[kids[i]] = kids[i + 1];
        out.push(d);
      } else if (tok.name === 'array') {
        out.push(kids);
      } else {
        out.push(...kids);
      }
    } else {
      let content = '';
      while (pos.i < tokens.length && tokens[pos.i].t !== 'close') {
        if (tokens[pos.i].t === 'text') content += tokens[pos.i].text;
        pos.i += 1;
      }
      pos.i += 1; // consume the close tag
      out.push(simpleVal(tok.name, content));
    }
  }
  return out;
}

export function parseXmlPlist(xml) {
  const tokens = tokenize(xml);
  const pos = { i: 0 };
  const nodes = parseNodes(tokens, pos, null);
  return nodes.length === 1 ? nodes[0] : nodes;
}

// ------------------------------------------------------------- dispatcher ---

export function parsePlist(buf) {
  if (buf.length >= 8 && buf.toString('latin1', 0, 8) === 'bplist00') {
    return parseBinaryPlist(buf);
  }
  return parseXmlPlist(buf.toString('utf8'));
}
