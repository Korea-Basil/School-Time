const crypto = require('node:crypto');
const iconv = require('iconv-lite');

const SERVICE_URLS = ['http://comcigan.kr:4082', 'http://comci.net:4082'];
const MAX_PAGE_BYTES = 16 * 1024 * 1024;

const clean = (value, max = 120) => typeof value === 'string'
  ? value.replace(/[<>]/g, '').trim().slice(0, max) : '';

class ComciganProvider {
  constructor() { this.initialization = null; this.protocol = null; }

  async init() {
    if (!this.initialization) {
      this.initialization = this.loadProtocol().catch((error) => {
        this.initialization = null;
        throw new Error(`컴시간 초기화에 실패했습니다: ${friendlyError(error)}`);
      });
    }
    this.protocol = await this.initialization;
    return this.protocol;
  }

  async searchSchools(query) {
    const safeQuery = clean(query, 60);
    if (safeQuery.length < 2) throw new Error('학교 이름을 두 글자 이상 입력하세요.');
    const protocol = await this.init();
    try {
      const encoded = encodeURIComponent(safeQuery);
      const payload = Buffer.from(`${protocol.schoolPrefix}${encoded}_${protocol.version}`, 'utf8').toString('base64');
      const response = await request(`${protocol.baseUrl}${protocol.endpoint}?${encodeURIComponent(payload)}`, protocol);
      const data = decodeResponse(response, protocol);
      return (Array.isArray(data['학교검색']) ? data['학교검색'] : [])
        .map((row) => normalizeSchool(row, protocol)).filter(Boolean).slice(0, 20);
    } catch (error) { throw new Error(`학교 검색에 실패했습니다: ${friendlyError(error)}`); }
  }

  async getTimetable(selection) {
    const grade = Number.isInteger(selection?.grade) ? selection.grade : 0;
    const classNo = Number.isInteger(selection?.classNo) ? selection.classNo : 0;
    if (!selection?.school?.id || grade < 1 || grade > 3 || classNo < 1 || classNo > 50) throw new Error('학교, 학년, 반을 확인하세요.');
    const protocol = await this.init();
    try {
      const plain = `${protocol.timetableCode}_${Number(selection.school.id)}_0_1_${protocol.version}`;
      const encoded = Buffer.from(plain, 'utf8').toString('base64');
      const response = await request(`${protocol.baseUrl}${protocol.endpoint}?${encoded}`, protocol);
      return normalizeTimetable(decodeResponse(response, protocol), grade, classNo, protocol);
    } catch (error) { throw new Error(`시간표를 불러오지 못했습니다: ${friendlyError(error)}`); }
  }

  async loadProtocol() {
    let lastError;
    for (const baseUrl of SERVICE_URLS) {
      try {
        const bytes = await fetchBytes(`${baseUrl}/st`);
        const html = iconv.decode(bytes, 'cp949');
        if (Buffer.byteLength(html, 'utf8') > MAX_PAGE_BYTES) throw new Error('서비스 페이지가 너무 큽니다.');
        return { ...parseProtocol(decodeServicePage(html)), baseUrl };
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('컴시간 서비스에 연결할 수 없습니다.');
  }
}

async function fetchBytes(url, extraHeaders = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'SchoolTime/0.1 (+open-source)', ...extraHeaders }, signal: controller.signal });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
      if (response.status === 403) throw new Error('요청이 거부되었습니다(403). 페이지 토큰이 만료되었을 수 있습니다.');
      if (response.status === 429) throw new Error('요청이 제한되었습니다(429). 잠시 후 다시 시도하세요.');
      throw new Error(`컴시간 서버 오류(${response.status})`);
    }
    return bytes;
  } finally { clearTimeout(timeout); }
}

async function request(url, protocol) {
  const bytes = await fetchBytes(url, protocol.requestToken ? { 'X-Hour-Token': protocol.requestToken } : {});
  return bytes.toString('utf8').replace(/^\uFEFF/, '').replace(/\0+$/g, '');
}

function decodeServicePage(input) {
  let content = input;
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const marker of ['/* hour-obfuscated-v2 */', '/* hour-ajax-obfuscated-v1 */']) {
      let at = content.indexOf(marker);
      while (at >= 0) {
        const invocation = content.slice(at).search(/\}\s*\)\s*\(\s*(?=\[)/);
        if (invocation < 0) throw new Error(`컴시간 ${marker} 디코더를 찾을 수 없습니다.`);
        const arrayStart = content.indexOf('[', at + invocation);
        const arrayEnd = findJsonEnd(content, arrayStart);
        const fragments = JSON.parse(content.slice(arrayStart, arrayEnd));
        const tail = content.slice(arrayEnd).match(/^\s*,\s*(\d{1,3})\s*\)\s*;?/);
        if (!tail) throw new Error('컴시간 서비스 스크립트 형식이 변경되었습니다.');
        const decoded = decodeFragments(fragments, Number(tail[1]));
        const stop = arrayEnd + tail[0].length;
        content = content.slice(0, at) + decoded + content.slice(stop);
        changed = true;
        at = content.indexOf(marker, at + decoded.length);
      }
    }
    if (!changed) return content;
  }
  if (/hour-obfuscated-v2|hour-ajax-obfuscated-v1/.test(content)) throw new Error('컴시간 서비스 스크립트 디코딩 깊이를 초과했습니다.');
  return content;
}

function findJsonEnd(text, start) {
  let depth = 0; let quoted = false; let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true; else if (char === '[') depth += 1; else if (char === ']' && --depth === 0) return index + 1;
  }
  throw new Error('컴시간 디코더 배열이 완전하지 않습니다.');
}

function decodeFragments(fragments, key) {
  if (!Array.isArray(fragments) || key > 255) throw new Error('컴시간 디코더 인자가 올바르지 않습니다.');
  let output = '';
  for (const fragment of fragments) {
    if (!Array.isArray(fragment) || fragment.length !== 2 || ![0, 1].includes(fragment[0]) || typeof fragment[1] !== 'string') throw new Error('컴시간 디코더 조각이 올바르지 않습니다.');
    if (fragment[0] === 1) { output += fragment[1]; continue; }
    if (fragment[1].length % 4 || !/^[0-9a-f]+$/i.test(fragment[1])) throw new Error('컴시간 디코더 데이터가 올바르지 않습니다.');
    const bytes = Buffer.alloc((fragment[1].length / 4) * 2);
    for (let offset = 0; offset < fragment[1].length; offset += 4) bytes.writeUInt16LE(parseInt(fragment[1].slice(offset, offset + 4), 16) ^ ((key + (offset / 4) * 13) & 255), (offset / 4) * 2);
    output += bytes.toString('utf16le');
  }
  return output;
}

function parseProtocol(page) {
  const school = page.match(/function\s+QAjaxSchool[\s\S]*?url\s*:\s*['"]\.?(\/\d+)\?['"]\s*\+\s*encodeURIComponent\(btoa\(\s*['"](\d+l)['"]\s*\+\s*encodeURIComponent\(sc\)\s*\+\s*['"]_(enc\d+)['"]/);
  if (!school) throw new Error('학교 검색 경로를 찾을 수 없습니다.');
  const timetable = page.match(/function\s+QAjaxTimetable[\s\S]*?url\s*:\s*['"]\.?(\/\d+)\?['"][\s\S]*?btoa\([^;]*?['"]_(enc\d+)['"]\s*\)/);
  if (!timetable || timetable[1] !== school[1] || timetable[2] !== school[3]) throw new Error('학교/시간표 요청 경로가 일치하지 않습니다.');
  const keyHex = extractKeyHex(page);
  if (!keyHex || ![32, 48, 64].includes(keyHex.length)) throw new Error('응답 암호화 키를 찾을 수 없습니다.');
  const divisor = page.match(/Math\.floor\(학교명단\[i\]\[0\]\s*\/\s*(\d+)\)\s*\+\s*(\d+)/);
  if (!divisor || Number(divisor[1]) < 1) throw new Error('학교 코드 계산 규칙을 찾을 수 없습니다.');
  const token = page.match(/window\.__HourRequestToken\s*=\s*['"]([0-9a-f]+)['"]\s*;/i)?.[1] || '';
  const code = page.match(/sc_data\(\s*['"](\d+)_/);
  return { endpoint: school[1], version: school[3], schoolPrefix: school[2], timetableCode: code?.[1] || school[2].replace(/l$/, ''), key: Buffer.from(keyHex, 'hex'), requestToken: token, divisor: Number(divisor[1]), offset: Number(divisor[2]), ...parseFields(page) };
}

function extractKeyHex(page) {
  const literal = page.match(/var\s+key\s*=\s*CryptoJS\.enc\.Hex\.parse\(\s*['"]([0-9a-f]+)['"]\s*\)/i);
  if (literal) return literal[1];
  const expression = page.match(/var\s+key\s*=\s*CryptoJS\.enc\.Hex\.parse\(\s*\(function\s*\(a\)\s*\{\s*return\s+([^;]+);\s*\}\)\(\s*(\[[\s\S]*?\])\s*\)\s*\)/i);
  if (!expression) return null;
  const fragments = [...expression[2].matchAll(/['"]([0-9a-f]+)['"]/gi)].map((match) => match[1]);
  const indexes = [...expression[1].matchAll(/a\[(\d+)\]/g)].map((match) => Number(match[1]));
  if (!fragments.length || !indexes.length || indexes.some((index) => !fragments[index])) return null;
  return indexes.map((index) => fragments[index]).join('');
}

function parseFields(page) {
  const decoder = page.match(/function\s+QnmsbChange[\s\S]*?String\.fromCharCode\(\s*([0-9,\s]+)\s*\)/);
  return {
    teacherCode: page.match(/성명\s*=\s*(?:Q성명\(\s*)?자료\.자료(\d+)/)?.[1],
    subjectCode: page.match(/(?:과목명\s*=\s*(?:Q과목명\(\s*)?)?자료\.자료(\d+)\[sb\]/)?.[1],
    currentCode: page.match(/일일자료\s*=\s*Q자료\(\s*자료\.자료(\d+)/)?.[1],
    textKey: decoder ? Buffer.from(decoder[1].split(',').map(Number)) : null
  };
}

function decodeResponse(text, protocol) {
  if (!text.startsWith('enc')) return JSON.parse(text.trim());
  const fields = text.replace(/\0+$/g, '').split(':');
  if (fields.length !== 4 || (fields[0] !== protocol.version && fields[0] !== 'enc1')) throw new Error('암호화 응답 형식이 변경되었습니다.');
  const parts = fields[0] === 'enc1' ? fields.slice(1).map((part) => Buffer.from(part, 'hex')) : fields.slice(1).map((part) => Buffer.from(part, 'base64'));
  const [iv, encrypted, tag] = parts;
  if (iv.length !== 16 || !encrypted.length || encrypted.length % 16 || tag.length !== 32) throw new Error('암호화 응답 길이가 올바르지 않습니다.');
  const expected = crypto.createHmac('sha256', crypto.createHash('sha256').update(protocol.key).digest()).update(fields.slice(0, 3).join(':')).digest();
  if (!crypto.timingSafeEqual(expected, tag)) throw new Error('암호화 응답 인증에 실패했습니다.');
  const decipher = crypto.createDecipheriv(`aes-${protocol.key.length * 8}-cbc`, protocol.key, iv);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8').replace(/\0+$/g, ''));
}

function decodeField(value, key) {
  if (value === null || value === undefined) return '';
  // Comcigan mixes encoded strings with already-decoded numeric metadata and
  // packed timetable values. Numeric values must never be sent to Buffer.from
  // with an encoding argument.
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (Buffer.isBuffer(value)) return iconv.decode(value, 'cp949');
  if (typeof value !== 'string' || value.length === 0 || !key) return typeof value === 'string' ? value : '';
  const raw = Buffer.from(value, 'base64');
  const decodedBytes = Buffer.from(raw.map((byte, index) => byte ^ key[index % key.length]));
  return iconv.decode(decodedBytes, 'cp949');
}

function asList(value) {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined ? [] : [value];
}

function normalizeSchool(row, protocol) {
  if (!Array.isArray(row) || row.length < 4 || row[0] === 0) return null;
  const column = Math.floor(Number(row[0]) / protocol.divisor) + protocol.offset;
  if (!Number.isInteger(column) || column < 3 || column >= row.length) return null;
  const id = Number(decodeField(row[column], protocol.textKey));
  if (!Number.isInteger(id) || id <= 0) return null;
  return { id: String(id), regionCode: clean(String(row[0]), 40), name: clean(decodeField(row[2], protocol.textKey)), address: clean(decodeField(row[1], protocol.textKey)) };
}

function normalizeTimetable(data, grade, classNo, protocol) {
  const days = ['월', '화', '수', '목', '금'];
  const rows = Array.from({ length: 8 }, (_, index) => ({ period: index + 1, lessons: days.map(() => ({ subject: '', teacher: '' })) }));
  const teachers = asList(data[`자료${protocol.teacherCode}`]).map((item) => clean(decodeField(item, protocol.textKey).replace(/^(.+)\*$/, '$1')));
  const subjects = asList(data[`자료${protocol.subjectCode}`]).map((item) => clean(decodeField(item, protocol.textKey)));
  const current = data[`자료${protocol.currentCode}`]?.[grade]?.[classNo] || [];
  const divisor = Number(data['분리']) || 100;
  for (let day = 1; day <= 5; day += 1) for (let period = 1; period <= 8; period += 1) {
    const packed = Number(String(current[day]?.[period] || '').replace(/^>/, '')) || 0;
    const subjectIndex = Math.floor(packed / 1000) % divisor;
    const teacherIndex = packed % 1000;
    rows[period - 1].lessons[day - 1] = {
      subject: mappedLessonText(subjects, subjectIndex),
      teacher: mappedLessonText(teachers, teacherIndex)
    };
  }
  return { days, rows };
}

function mappedLessonText(values, index) {
  if (!Number.isInteger(index) || index <= 0 || index >= values.length) return '';
  const value = values[index];
  if (typeof value !== 'string') return '';
  const text = clean(value);
  return text && !/^\d+$/.test(text) ? text : '';
}

function friendlyError(error) { return error?.name === 'AbortError' ? '응답 시간이 초과되었습니다.' : error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'; }

module.exports = { ComciganProvider };
