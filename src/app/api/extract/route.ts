import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

type WorkItem = {
  role?: string;
  company?: string;
  period?: string;
  bullets: string[];
  volunteer?: boolean;
};

const STOP_WORDS = new Set([
  // articles, prepositions, auxiliaries
  "the","and","a","an","to","of","in","for","on","with","by",
  "is","are","as","at","from","or","that","this","your","you","we","our","be","will",
  "if","without","been","being","its","they","their","he","she","i","me","my",
  // generic modal/ability words
  "can","would","could","should","must","may","might",
  // common JD fillers
  "new","one","great","ideal","fill","successful","better","have","before","even","then","always","full","brain","brewing","roll",
  // interrogatives & question words
  "who","what","why","how","where","when","which","whom","whose",
  // very generic verbs & fillers
  "make","makes","made","making",
  "do","does","did","done",
  "use","uses","using",
  "work","works","worked","working",
  "keep","keeps","keeping",
  "watch","watches","watched","watching",
  "want","wants","wanted","wanting",
  "like","likes","liked","liking",
  "need","needs","needed","needing",
  "ensure","ensures","ensured","ensuring",
  "help","helps","helped","helping",
  "think","thinks","thinking",
  "just","now","into","actually","spark",
  // generic nouns not useful as skills in JD context
  "person","people","team","experience","corp","coates",
  // months & common JD fluff
  "jan","january","feb","february","mar","march","apr","april","may","jun","june","jul","july","aug","august","sep","sept","september","oct","october","nov","november","dec","december",
  "agency","recruitment","tasked","roles","role","candidates","highly","regarded"
]);
// 扩展停用词：过滤 JD 中不应当成为技能的通用/宣传性词
STOP_WORDS.add("any");
STOP_WORDS.add("fun");
STOP_WORDS.add("australia");
STOP_WORDS.add("austtalia"); // 常见拼写错误
STOP_WORDS.add("largest");
STOP_WORDS.add("fastest");
STOP_WORDS.add("growing");
STOP_WORDS.add("fastest-growing");
STOP_WORDS.add("issue");
STOP_WORDS.add("issues");

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  // 支持英文和中文：英文按单词（≥3），中文按连续汉字（≥2）分词
  const matches = lower.match(/[a-z0-9+.#-]{3,}|[\p{Script=Han}]{2,}/gu) || [];
  return matches.filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function topKeywords(text: string, limit = 20): string[] {
  const freq = new Map<string, number>();
  for (const t of tokenize(text)) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

function trigrams(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length - 2; i++) {
    out.push(words[i] + " " + words[i + 1] + " " + words[i + 2]);
  }
  return out;
}

function topPhrases(text: string, limitBi = 12, limitTri = 8): string[] {
  const toks = tokenize(text);
  const bi = bigrams(toks);
  const tri = trigrams(toks);
  const freqBi = new Map<string, number>();
  const freqTri = new Map<string, number>();
  for (const x of bi) freqBi.set(x, (freqBi.get(x) || 0) + 1);
  for (const x of tri) freqTri.set(x, (freqTri.get(x) || 0) + 1);
  const topBi = Array.from(freqBi.entries()).sort((a,b) => b[1]-a[1]).slice(0, limitBi).map(([k]) => k);
  const topTri = Array.from(freqTri.entries()).sort((a,b) => b[1]-a[1]).slice(0, limitTri).map(([k]) => k);
  const combined: string[] = [];
  const seen = new Set<string>();
  for (const t of [...topTri, ...topBi]) { if (!seen.has(t)) { combined.push(t); seen.add(t); } }
  return combined;
}

function topTerms(text: string, limitWords = 18, limitPhrasesBi = 10, limitPhrasesTri = 6): string[] {
  const phrases = topPhrases(text, limitPhrasesBi, limitPhrasesTri);
  const words = topKeywords(text, limitWords);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of phrases) { if (!seen.has(p)) { result.push(p); seen.add(p); } }
  for (const w of words) { if (!seen.has(w)) { result.push(w); seen.add(w); } }
  return result;
}

// 简单的技术词库，用于区分技术技能与基础技能
const TECH_SET = new Set<string>([
  // 工程/通用技术
  "javascript","typescript","python","java","c++","c#","go","ruby","php","swift","kotlin",
  "react","vue","angular","next","nuxt","svelte","node","express","nestjs","turbopack","webpack","vite",
  "tailwind","css","scss","sass","html","dom","graphql","rest","api",
  "docker","kubernetes","k8s","container","terraform","ansible","linux","unix","macos","windows",
  "aws","gcp","azure","cloudfront","s3","ec2","lambda","dynamodb","rds","cloud",
  "mysql","postgres","postgresql","mongodb","redis","sqlite","db","database",
  "ml","ai","llm","pytorch","tensorflow","sklearn","nlp",
  // 设计/营销/电商/分析领域常用工具与术语（补齐技术技能的覆盖面）
  "figma","canva","photoshop","illustrator","premiere","after","effects","ae",
  "seo","sem","crm","hubspot","mailchimp","ga","ga4","analytics",
  "shopify","wordpress","wix","squarespace",
  "copywriting","design","graphic","video","editing","content","ads","ad",
]);

// 支持短语级技术识别（不把通用词过度扩大）
const TECH_PHRASES = new Set<string>([
  "after effects",
  "google ads",
  "facebook ads",
  "meta ads",
  "social media",
  "content creation",
  "video editing",
  "graphic design",
  "google analytics",
  "social media management",
]);

function classifySkills(words: string[]): { tech: string[]; base: string[] } {
  const tech: string[] = []; const base: string[] = [];
  const seenTech = new Set<string>(); const seenBase = new Set<string>();
  // 屏蔽非技能类词片段：地点/学校/品牌/角色/年份等，避免进入基础技能
  const NON_SKILL_PARTS = new Set<string>([
    // 地点/学校
    'melbourne','sydney','beijing','shanghai','new','york','los','angeles','london','paris','tokyo','university','college','school','academy','institute','campus','rmit','vic',
    // 品牌/组织（示例）
    'bethel','bread','life','hotmart','designhotmart','kfc','mcdonald','mcdonalds','starbucks',
    // 角色/身份
    'crew','member','student','intern','assistant','coordinator','manager','host','hostess','cashier','server','waiter','waitress',
    // 其他通用非技能
    'present','provided','provide','brand','designed','designing','created','creating','during','customers','through','assisted','engagement','supported','visual','posters','jane','zhang'
  ]);
  const normJoin = (partsLower: string[]) => partsLower.join(' ');
  const CANON_PATTERNS: Array<[RegExp, string, 'tech'|'base']> = [
    [/\b(design(?:ed|ing)?)\s+marketing\s+posters\b/i, 'poster design', 'tech'],
    [/\bmarketing\s+posters\b/i, 'poster design', 'tech'],
    [/\bcontent\s+social\s+media\b/i, 'social media content creation', 'tech'],
    [/\bsocial\s+media\s+content\b/i, 'social media content creation', 'tech'],
    [/\bsocial\s+media\b/i, 'social media', 'tech'],
    [/\bgoogle\s+ads?\b/i, 'google ads', 'tech'],
    [/\b(facebook|meta)\s+ads?\b/i, 'facebook/meta ads', 'tech'],
    [/\bgoogle\s+(analytics|ga4)\b/i, 'google analytics', 'tech'],
    [/\bvideo\s+editing\b/i, 'video editing', 'tech'],
    [/\bgraphic\s+design\b/i, 'graphic design', 'tech'],
    [/\bcustomer\s+(service|support|care)\b/i, 'customer service', 'base'],
  ];
  for (const w of words) {
    const parts = w.split(/[\s-]+/);
    const partsLower = parts.map((p) => p.toLowerCase());
    const joined = normJoin(partsLower);
    // 先做短语/规范映射
    let mapped: { label: string; kind: 'tech'|'base' } | null = null;
    for (const [rx, canon, kind] of CANON_PATTERNS) {
      if (rx.test(w)) { mapped = { label: canon, kind }; break; }
    }
    if (mapped) {
      if (mapped.kind === 'tech') { if (!seenTech.has(mapped.label)) { seenTech.add(mapped.label); tech.push(mapped.label); } }
      else { if (!seenBase.has(mapped.label)) { seenBase.add(mapped.label); base.push(mapped.label); } }
      continue;
    }
    const isTech = TECH_PHRASES.has(joined) || partsLower.some((p) => TECH_SET.has(p));
    if (!isTech) {
      const hasDigits = /\d/.test(w);
      const hasBanned = partsLower.some((p) => NON_SKILL_PARTS.has(p));
      const looksOrg = /(company|inc\.|co\.|corp\.|ltd\.|llc|studio|agency|group)/i.test(w);
      const looksLoc = /(melbourne|sydney|beijing|shanghai|new\s+york|los\s+angeles|london|paris|tokyo)/i.test(w);
      const looksRole = /(crew|member|student|intern|assistant|coordinator|manager|host|hostess|cashier|server|waiter|waitress)/i.test(w);
      const startsWithDuring = /^\s*during\b/i.test(w);
      if (hasDigits || hasBanned || looksOrg || looksLoc || looksRole || startsWithDuring) {
        continue; // 过滤非技能
      }
    }
    const label = joined.replace(/\s+/g, ' ');
    if (isTech) { if (!seenTech.has(label)) { seenTech.add(label); tech.push(label); } }
    else { if (!seenBase.has(label)) { seenBase.add(label); base.push(label); } }
  }
  return { tech, base };
}

function jdRequirementsFromText(text?: string | null): string[] {
  if (!text) return [];
  const CULTURE_PATTERNS = [
    /(inclusive|supportive|rewarding|great\s+place|we\s+value|celebrate|culture|fun\s+culture|company\s+values|diverse|belonging)/i,
    /(价值观|使命|愿景|文化|包容|多元|归属|支持性|奖励|氛围|庆祝|成长机会|发展机会|幸福感|工作环境|福利|团队氛围)/,
    /(largest|fastest[- ]?growing|industry[- ]?leading)\s+(company|business|transport|courier|taxi)/i,
  ];
  const ACTION_WORDS = /(负责|搭建|制定|管理|优化|推进|执行|监控|分析|协作|设计|开发|测试|维护|运营|跟进|对接|落地|产出|输出|研究|调研|策划|监督|组织|编写|撰写|安排|协调|提升|确保|参与|改进|跟踪|汇报|prepare|manage|lead|build|design|develop|implement|execute|monitor|analyze|coordinate|plan|schedule|deliver|maintain|support|improve|ensure|participate|track|report)/i;
  const BULLET_PREFIX = /^\s*(?:[-*•·▪◦●—–]|(?:\d+)[.)])\s*/;
  const HEAD_HINT = /(职责|要求|岗位|职位|描述|关键|任务|目标|responsibilit|requirement|duty|expectation|must|need|you\s+will|we\s+expect)/i;

  const normalized = (text || '').replace(/[•·▪◦●—–]+/g, '\n').replace(/[；;]+/g, '；');
  const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const reqs: string[] = [];
  for (const l of lines) {
    const s = l.replace(BULLET_PREFIX, '').trim();
    if (s.length < 10) continue;
    if (CULTURE_PATTERNS.some((re) => re.test(s))) continue;
    if (ACTION_WORDS.test(s) || /\d/.test(s) || HEAD_HINT.test(s)) {
      reqs.push(s);
    }
  }
  // 若未检测到行，则按中英文句号/分号切分
  if (reqs.length === 0) {
    const parts = normalized.split(/[。！？；.!?]+/).map((x) => x.trim()).filter(Boolean);
    for (const s of parts) {
      if (s.length < 20) continue;
      if (CULTURE_PATTERNS.some((re) => re.test(s))) continue;
      if (ACTION_WORDS.test(s) || /\d/.test(s) || HEAD_HINT.test(s)) {
        reqs.push(s);
      }
      if (reqs.length >= 20) break;
    }
  }
  return reqs.slice(0, 20);
}

function overlap(a: string[], b: string[]): number {
  const set = new Set(a);
  let cnt = 0;
  for (const x of b) if (set.has(x)) cnt++;
  return cnt;
}

// 简单词干与短语支持，以提升匹配鲁棒性
function stem(word: string): string {
  let s = word.toLowerCase();
  if (s.length > 4) {
    if (s.endsWith("ing")) s = s.slice(0, -3);
    else if (s.endsWith("ed")) s = s.slice(0, -2);
    else if (s.endsWith("es")) s = s.slice(0, -2);
    else if (s.endsWith("s")) s = s.slice(0, -1);
  }
  return s;
}

function stemList(words: string[]): string[] { return words.map(stem); }

function bigrams(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    out.push(words[i] + " " + words[i + 1]);
  }
  return out;
}

function normalizedOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const set = new Set(a);
  let hit = 0;
  for (const x of b) if (set.has(x)) hit++;
  return hit / Math.max(a.length, b.length);
}

function extractContactInfo(text: string): { name?: string; email?: string; phone?: string } {
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = text.match(/\+?\d[\d\s()\-]{7,}\d/);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 排除常见章节标题，避免将“PROFESSIONAL EXPERIENCE”等误识别为姓名
  const HEADER_RE_EN = /\b(profile|summary|objective|experience|work\s+experience|professional\s+experience|skills?|education|certifications?|projects?|references?|awards?|publications?|languages?|contact|work\s+history|employment|curriculum\s+vitae|resume)\b/i;
  const HEADER_RE_ZH = /(简介|摘要|概述|个人简介|工作经历|工作经验|专业经历|教育|教育背景|技能|证书|项目|参考|荣誉|出版物|语言|联系方式|个人信息)/;
  const BANNED_TOKENS = new Set<string>([
    'professional','experience','work','skills','skill','education','project','projects','certification','certifications',
    'summary','objective','profile','references','awards','publications','languages','contact','history','employment',
    'resume','curriculum','vitae'
  ]);

  // 优先候选行：靠近邮箱/电话的上方行，然后再看简历前几行
  const emailLineIdx = lines.findIndex((l) => /@/.test(l));
  const phoneLineIdx = lines.findIndex((l) => /\+?\d[\d\s()\-]{7,}\d/.test(l));
  const candidateIdx: number[] = [];
  const pushRange = (start: number, end: number) => {
    for (let i = start; i <= end && i < lines.length; i++) {
      if (i >= 0) candidateIdx.push(i);
    }
  };
  if (emailLineIdx >= 0) pushRange(emailLineIdx - 3, emailLineIdx - 1);
  if (phoneLineIdx >= 0) pushRange(phoneLineIdx - 3, phoneLineIdx - 1);
  pushRange(0, Math.min(8, lines.length) - 1);

  // 去重保持相对顺序
  const seen = new Set<number>();
  const orderedIdx = candidateIdx.filter((i) => (seen.has(i) ? false : (seen.add(i), true)));

  let name: string | undefined;
  for (const i of orderedIdx) {
    const l = lines[i];
    if (!l || HEADER_RE_EN.test(l) || HEADER_RE_ZH.test(l)) continue;
    if (/@|\d/.test(l)) continue;
    const words = l.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) continue;
    const wordLowers = words.map((w) => w.replace(/[^A-Za-z'-]/g, '').toLowerCase()).filter(Boolean);
    if (wordLowers.some((w) => BANNED_TOKENS.has(w))) continue;
    const looksTitleCase = words.every((w) => /^[A-Z][a-z][A-Za-z'-]*$/.test(w));
    const looksAllUpper = words.every((w) => /^[A-Z][A-Z'-]+$/.test(w));
    if ((looksTitleCase || looksAllUpper) && l.length <= 40) { name = l; break; }
  }

  return { name, email: emailMatch?.[0], phone: phoneMatch?.[0] };
}

function parseWorkExperience(text: string): WorkItem[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const items: WorkItem[] = [];
  const companySuffixes = /(Inc\.|Ltd\.|LLC|Co\.|Group|Agency|Studio|Corp\.|Company|Limited)/i;
  const badCompanyWords = /(promotions|videos|photos|content|store|social\s+media|customer|marketing|campaigns|sales\b)/i;
  const roleHint = /(manager|assistant|intern|coordinator|specialist|engineer|designer|consultant|associate|lead|analyst|marketing|sales|customer|service|support|operator|representative|ambassador|officer|creator|editor|videographer|copywriter|social\s+media|(content\s+(creator|manager|specialist))|crew|member|barista|cashier|server|waiter|waitress)/i;
  const titleCasePattern = /^[A-Z][A-Za-z&\/\-]+(?:\s+[A-Z][A-Za-z&\/\-]+){0,6}$/;
  const actionVerbPattern = /\b(manage|managed|design|designed|develop|developed|implement|implemented|optimize|optimized|build|built|lead|led|coordinate|coordinated|analyze|analyzed|research|researched|support|supported|maintain|maintained|deliver|delivered|drive|driven|own|owned|plan|planned|execute|executed|write|wrote|capture|captured|collect|collected|assist|assisted|create|created|film|filmed|edit|edited|produce|produced|taught|guided|ensured|work|worked|collaborate|collaborated)\b/i;
  const nonTitlePreposition = /\b(for|with|to|in|on|by|from)\b/i; // 允许 of
  const periodHint = /([A-Za-z]{3,9}\s?\d{4}|\d{4})(?:\s?[–—-]\s?|\s+to\s+|\s+−\s+)([A-Za-z]{3,9}\s?\d{4}|present|now|current|至今|现在)/i;
  const MONTHS_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
  const LOC_HINT = /(melbourne|sydney|beijing|shanghai|kunming|china|australia|united\s+states|usa|uk|england|canada|singapore|hong\s*kong|taiwan|new\s+zealand|victoria|nsw|queensland|guangdong|beijing|shanghai)/i;
  // 排除把“分节标题/平台列表”等误判为职位
  const SECTION_BAD_HEAD = /(skills?|projects?|certifications?|awards?|publications?|summary|profile|objective|about\s+me|interests?|hobbies?|languages?|social\s+media\s+platforms?)\b/i;
  const PLATFORM_BRANDS = /(tiktok|douyin|xiaohongshu|redbook|wechat|we\s*chat|instagram|facebook|meta|youtube|twitter|x\b|linkedin|snapchat|pinterest)/i;
  const ORG_HINT_VOL = /(church|foundation|community\s*(center|church)?|food\s*bank|charity|ministry|ngo|non\s*-?\s*profit|nonprofit|outreach|donation|bethel|bread\s+of\s+life|sunday\s+school)/i;
  const VOL_SIGNAL = /(volunteer|volunteering|志愿|义工|charity|foundation|non\s*-?\s*profit|nonprofit|community\s+(service|center|church)|ngo|donation|fund\s*raising|church|ministry|outreach|mentor|peer\s+mentor|student\s+council|sscc|sunday\s+school)/i;
  const VOL_SECTION_HEAD = /^(VOLUNTEER\s+EXPERIENCE|志愿者\s*经历)$/i;
  const NON_VOL_SECTION_HEAD = /^(WORK\s+EXPERIENCE|EDUCATION|EXPERIENCE|工作\s*经历|教育)$/i;
  const EMPLOYMENT_TYPE_HINT = /(intern(?:ship)?|freelance(?:r)?|contract(?:or)?|part[-\s]?time|full[-\s]?time|temporary|temp|self\s*employed|self[-\s]?employed|volunteer)/i;
  let current: WorkItem | null = null;
  let inVolunteerSection = false;

  // 将连写的“RoleCompany”拆分：在小写 -> 大写处插入空格
  const splitCamel = (s: string) =>
    s
      // 在小写->大写处插入空格（camelCase）
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      // 在右括号/斜杠后紧跟大写时插入空格：例如 Intern)Intelligent 或 Role/Company
      .replace(/([)\/\]])([A-Z])/g, "$1 $2");
  // 从职位段尾部提取公司名：连续 1-3 个专有名词（排除角色词）
  const ROLE_WORDS = /(crew|member|assistant|intern|coordinator|specialist|engineer|designer|consultant|associate|lead|analyst|marketing|sales|customer|service|support|operator|representative|ambassador|officer|creator|editor|videographer|copywriter|barista|cashier|server|waiter|waitress)/i;
  // 清理职位：去掉尾部附着的公司名与分隔符，保留雇佣类型
  const deriveRolePart = (roleText: string, company?: string): string => {
    const escapeRegExp = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let roleNorm = splitCamel(roleText).replace(/\s{2,}/g, ' ').trim();
    if (company && company.trim()) {
      const esc = escapeRegExp(company.trim());
      // 去掉结尾的公司名及常见前导分隔符
      roleNorm = roleNorm
        .replace(new RegExp(`(?:\\s*(?:@|\u007C|\||-|\\/|\\bat\\s+)?)\\s*${esc}[.,;]?$`), '')
        .trim();
    }
    // 去掉尾部多余分隔符
    roleNorm = roleNorm.replace(/[\/@|\-]+$/, '').trim();
    return roleNorm;
  };
  const extractCompanyFromRole = (roleText: string): string | undefined => {
    const norm = splitCamel(roleText).replace(/\s{2,}/g, ' ').trim();
    const toks = norm.split(/\s+/);
    // 从尾部向前收集非角色词的 TitleCase 片段
    const candidate: string[] = [];
    for (let k = toks.length - 1; k >= 0 && candidate.length < 3; k--) {
      const w = toks[k];
      // 允许含撇号的品牌，如 McDonald's
      const looksProper = /^[A-Z][A-Za-z'’.-]+$/.test(w);
      if (!looksProper) break;
      if (ROLE_WORDS.test(w.toLowerCase())) break;
      candidate.unshift(w);
    }
    const comp = candidate.join(' ').trim().replace(/[.,;]+$/,'');
    if (comp && !ROLE_WORDS.test(comp) && !MONTHS_RE.test(comp.toLowerCase()) && !LOC_HINT.test(comp.toLowerCase())) return comp;
    return undefined;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    // 使用索引捕获组以提升兼容性，避免命名捕获在较低 ES 目标下报错
    const headerMatch = line.match(/^([^@|\-]{2,60}?)\s*(?:@|\||-(?!\s*\d{4})| at )\s*([^\d]{2,60})(?:\s+(\d{4}[^\n]{0,20}))?$/i);
    if (headerMatch) {
      const role = headerMatch[1]?.trim();
      const companyRaw = headerMatch[2]?.trim();
      const periodRaw = headerMatch[3]?.trim();
      const companyLooksValid = (
        (/^[A-Z][A-Za-z0-9 &'.]+$/.test(companyRaw || "") || companySuffixes.test(companyRaw || ""))
        && !MONTHS_RE.test((companyRaw || '').toLowerCase())
        && !LOC_HINT.test((companyRaw || '').toLowerCase())
        && !EMPLOYMENT_TYPE_HINT.test((companyRaw || '').toLowerCase())
      );
      const roleLooksValid = !!role && (
        (titleCasePattern.test(role) && !actionVerbPattern.test(role))
        || (roleHint.test(role) && !actionVerbPattern.test(role) && role.split(/\s+/).length <= 8)
      ) && !nonTitlePreposition.test(role) && !/^[a-z]/.test(role) && !SECTION_BAD_HEAD.test(role) && !/:/.test(role);
      if (roleLooksValid && companyLooksValid && !badCompanyWords.test(companyRaw || "") && !PLATFORM_BRANDS.test((companyRaw || '').toLowerCase())) {
        if (current) items.push(current);
        const cleanRole = deriveRolePart(role || '', companyRaw || '');
        const mP = line.match(periodHint);
        const periodFixed = mP ? `${mP[1]} - ${mP[2]}` : periodRaw;
        current = { role: cleanRole, company: companyRaw.replace(/[.,;]+$/,''), period: periodFixed, bullets: [], volunteer: inVolunteerSection || /volunteer/i.test(cleanRole) || ORG_HINT_VOL.test(companyRaw || '') };
        continue;
      }
      // Fallback: 若 companyRaw 看起来像月份或无效，则尝试从行尾提取公司名（避免把 Jul/Mar 识别为公司）
      if (roleLooksValid && !companyLooksValid) {
        const m2 = line.match(periodHint);
        const beforePeriod = m2 ? line.slice(0, line.indexOf(m2[0])).trim() : line.trim();
        const tailProper = beforePeriod.match(/[A-Z][A-Za-z0-9&'.]+(?:\s+[A-Z][A-Za-z0-9&'.]+){0,2}$/);
        const candidate = tailProper?.[0]?.trim();
        let candidateValid = !!candidate && !MONTHS_RE.test(candidate.toLowerCase()) && !badCompanyWords.test(candidate) && /^[A-Z]/.test(candidate) && !LOC_HINT.test(candidate.toLowerCase()) && !EMPLOYMENT_TYPE_HINT.test(candidate.toLowerCase());
        // 若候选看似地点，则尝试从职位段拆出公司
        let companyFixed = candidate;
        if (!candidateValid || LOC_HINT.test((candidate || '').toLowerCase())) {
          const fromRole = extractCompanyFromRole(role || beforePeriod);
          if (fromRole) { companyFixed = fromRole; candidateValid = true; }
        }
        if (candidateValid && companyFixed) {
          const rolePart = deriveRolePart(role || beforePeriod, companyFixed);
          const roleValid2 = !!rolePart && (
            (titleCasePattern.test(rolePart) && !actionVerbPattern.test(rolePart))
            || (roleHint.test(rolePart) && !actionVerbPattern.test(rolePart) && rolePart.split(/\s+/).length <= 8)
          ) && !nonTitlePreposition.test(rolePart) && !/^[a-z]/.test(rolePart) && !SECTION_BAD_HEAD.test(rolePart) && !/:/.test(rolePart);
          if (roleValid2) {
            if (current) items.push(current);
            const mP2 = line.match(periodHint);
            const periodFixed2 = mP2 ? `${mP2[1]} - ${mP2[2]}` : periodRaw;
            current = { role: rolePart, company: companyFixed.replace(/[.,;]+$/,''), period: periodFixed2, bullets: [], volunteer: inVolunteerSection || /volunteer/i.test(rolePart) || ORG_HINT_VOL.test(companyFixed || '') };
            continue;
          }
        }
        // 若没有有效公司但 companyRaw 是雇佣类型，则创建仅角色条目（保留雇佣类型在角色中）
        if ((!candidateValid || !companyFixed) && EMPLOYMENT_TYPE_HINT.test((companyRaw || '').toLowerCase())) {
          const rolePart2 = deriveRolePart(beforePeriod, undefined);
          const roleValid3 = !!rolePart2 && (
            (titleCasePattern.test(rolePart2) && !actionVerbPattern.test(rolePart2))
            || (roleHint.test(rolePart2) && !actionVerbPattern.test(rolePart2) && rolePart2.split(/\s+/).length <= 8)
          ) && !nonTitlePreposition.test(rolePart2) && !/^[a-z]/.test(rolePart2) && !SECTION_BAD_HEAD.test(rolePart2) && !/:/.test(rolePart2);
          if (roleValid3) {
            if (current) items.push(current);
            const mP3 = line.match(periodHint);
            const periodFixed3 = mP3 ? `${mP3[1]} - ${mP3[2]}` : periodRaw;
            current = { role: rolePart2, period: periodFixed3, bullets: [] };
            continue;
          }
        }
      }
    }
    // 次级兜底：行中包含时间段但没有命中 headerMatch 时，尝试“行尾公司 + 前半角色”的拆分
    const mPeriod = line.match(periodHint);
    if (!headerMatch && mPeriod) {
      const beforePeriod = line.replace(mPeriod[0], "").trim();
      const tailProper = beforePeriod.match(/[A-Z][A-Za-z0-9&'.]+(?:\s+[A-Z][A-Za-z0-9&'.]+){0,2}$/);
      const candidate = tailProper?.[0]?.trim();
      let candidateValid = !!candidate && !MONTHS_RE.test(candidate.toLowerCase()) && !badCompanyWords.test(candidate) && /^[A-Z]/.test(candidate) && !LOC_HINT.test(candidate.toLowerCase()) && !EMPLOYMENT_TYPE_HINT.test(candidate.toLowerCase()) && !PLATFORM_BRANDS.test(candidate.toLowerCase());
      let companyFixed = candidate;
      if (!candidateValid || LOC_HINT.test((candidate || '').toLowerCase())) {
        const fromRole = extractCompanyFromRole(beforePeriod);
        if (fromRole) { companyFixed = fromRole; candidateValid = true; }
      }
      if (candidateValid) {
        const rolePart = deriveRolePart(beforePeriod, companyFixed || candidate || '');
        const roleValid2 = !!rolePart && (
          (titleCasePattern.test(rolePart) && !actionVerbPattern.test(rolePart))
          || (roleHint.test(rolePart) && !actionVerbPattern.test(rolePart) && rolePart.split(/\s+/).length <= 8)
        ) && !nonTitlePreposition.test(rolePart) && !/^[a-z]/.test(rolePart) && !SECTION_BAD_HEAD.test(rolePart) && !/:/.test(rolePart);
        if (roleValid2) {
          if (current) items.push(current);
          const periodNew = `${mPeriod[1]} - ${mPeriod[2]}`;
          current = { role: rolePart, company: (companyFixed || candidate || '').replace(/[.,;]+$/,''), period: periodNew, bullets: [], volunteer: inVolunteerSection || /volunteer/i.test(rolePart) || ORG_HINT_VOL.test((companyFixed || candidate || '')) };
          continue;
        }
      }
    }
    // 第三兜底：无分隔符且无时间段的头部样式，尝试“行尾公司 + 前半角色”拆分
    if (!headerMatch && !mPeriod) {
      const norm = splitCamel(line).replace(/\s{2,}/g, ' ').trim();
      // 从行尾收集 1-3 个 TitleCase 片段作为公司名
      const tailProper = norm.match(/[A-Z][A-Za-z0-9&'.]+(?:\s+[A-Z][A-Za-z0-9&'.]+){0,2}$/);
      const candidate = tailProper?.[0]?.trim();
      const candidateValid = !!candidate
        && !MONTHS_RE.test((candidate || '').toLowerCase())
        && !badCompanyWords.test(candidate || '')
        && /^[A-Z]/.test(candidate || '')
        && !LOC_HINT.test((candidate || '').toLowerCase())
        && !EMPLOYMENT_TYPE_HINT.test((candidate || '').toLowerCase())
        && !PLATFORM_BRANDS.test((candidate || '').toLowerCase());
      if (candidateValid) {
        const rolePart = deriveRolePart(norm, candidate || '');
        const roleValid = !!rolePart && (
          (titleCasePattern.test(rolePart) && !actionVerbPattern.test(rolePart))
          || (roleHint.test(rolePart) && !actionVerbPattern.test(rolePart) && rolePart.split(/\s+/).length <= 8)
        ) && !nonTitlePreposition.test(rolePart) && !/^[a-z]/.test(rolePart) && !SECTION_BAD_HEAD.test(rolePart) && !/:/.test(rolePart);
        if (roleValid) {
          if (current) items.push(current);
          current = { role: rolePart, company: (candidate || '').replace(/[.,;]+$/, ''), bullets: [], volunteer: inVolunteerSection || /volunteer/i.test(rolePart) || ORG_HINT_VOL.test(candidate || '') };
          continue;
        }
      }
    }
    // 列布局兜底：按双空格分列提取“职位 | 公司 | 起 | 止”，处理简历表格/列格式
    if (!headerMatch) {
      const parts = splitCamel(line).replace(/\s{3,}/g, '  ').split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const roleCand = deriveRolePart(parts[0] || '', parts[1] || undefined);
        const companyCand = parts[1] || '';
        const roleValid = !!roleCand && (
          (titleCasePattern.test(roleCand) && !actionVerbPattern.test(roleCand))
          || (roleHint.test(roleCand) && !actionVerbPattern.test(roleCand) && roleCand.split(/\s+/).length <= 8)
        ) && !nonTitlePreposition.test(roleCand) && !/^[a-z]/.test(roleCand);
        const companyValid = !!companyCand && (
          (/^[A-Z][A-Za-z0-9 &'\.]+$/.test(companyCand) || /\b(inc|llc|ltd|pty|pty\s*ltd|gmbh|s\.a\.|s\.r\.l\.|co|company|corporation|university|college|school|academy)\b/i.test(companyCand))
        ) && !MONTHS_RE.test(companyCand.toLowerCase()) && !LOC_HINT.test(companyCand.toLowerCase()) && !EMPLOYMENT_TYPE_HINT.test(companyCand.toLowerCase()) && !PLATFORM_BRANDS.test(companyCand.toLowerCase());
        if (roleValid && companyValid && !badCompanyWords.test(companyCand) && !SECTION_BAD_HEAD.test(roleCand) && !/:/.test(roleCand)) {
          let periodFixed: string | undefined = undefined;
          if (parts.length >= 4) {
            const looksMonthYear = (s: string) => MONTHS_RE.test((s || '').toLowerCase()) || /\b\d{4}\b/.test(s || '');
            if (looksMonthYear(parts[2] || '') && looksMonthYear(parts[3] || '')) {
              periodFixed = `${parts[2]} - ${parts[3]}`;
            }
          }
          if (!periodFixed) {
            const mP = line.match(periodHint);
            if (mP) periodFixed = `${mP[1]} - ${mP[2]}`;
          }
          if (current) items.push(current);
          current = { role: roleCand, company: companyCand.replace(/[.,;]+$/,''), period: periodFixed, bullets: [], volunteer: inVolunteerSection || /volunteer/i.test(roleCand) || ORG_HINT_VOL.test(companyCand || '') };
          continue;
        }
      }
    }
    // bullet or description lines
    if (current) {
      // 使用局部变量确保在箭头函数与闭包中保持非空引用，避免类型收窄丢失
      const curr = current as WorkItem;
      const normalized = line.replace(/^[–•\-*]\s*/, "").replace(/[.;:,\s]+$/g, "");
      // 过滤纯地点行，避免写入要点并干扰上下文
      if (normalized && LOC_HINT.test(normalized.toLowerCase()) && !/\b(university|school|college|academy)\b/i.test(normalized)) {
        continue;
      }
      // 分节标题：切换志愿者分栏状态
      const upper = normalized.toUpperCase();
      if (VOL_SECTION_HEAD.test(upper)) { inVolunteerSection = true; continue; }
      if (NON_VOL_SECTION_HEAD.test(upper)) { inVolunteerSection = false; continue; }
      // 过滤“社媒平台/技能/摘要”行——这类行常以冒号或平台品牌出现
      if (SECTION_BAD_HEAD.test(normalized) || PLATFORM_BRANDS.test(normalized.toLowerCase())) {
        continue;
      }
      if (normalized.length > 8) {
        // 在要点区加强“新经历头部”识别，避免描述误并到上一条
        const nextLine = (lines[i+1] || '').trim();
        const nextPeriod = nextLine ? nextLine.match(periodHint) : null;
        const nextLooksCompany = nextLine ? (/^[A-Z][A-Za-z0-9 &'.]+$/.test(nextLine)
          && !MONTHS_RE.test(nextLine.toLowerCase())
          && !LOC_HINT.test(nextLine.toLowerCase())
          && !EMPLOYMENT_TYPE_HINT.test(nextLine.toLowerCase())
          && !PLATFORM_BRANDS.test(nextLine.toLowerCase())) : false;
        const extractedCompanyFromRole = extractCompanyFromRole(normalized);
        const roleCandidate = deriveRolePart(normalized, extractedCompanyFromRole);
        const looksRoleHeaderNoPeriod = !!roleCandidate && (
          (titleCasePattern.test(roleCandidate) && !actionVerbPattern.test(roleCandidate))
          || (roleHint.test(roleCandidate) && !actionVerbPattern.test(roleCandidate) && roleCandidate.split(/\s+/).length <= 8)
        ) && !nonTitlePreposition.test(roleCandidate) && !/^[a-z]/.test(roleCandidate) && !SECTION_BAD_HEAD.test(roleCandidate) && !/:/.test(roleCandidate);
        if (looksRoleHeaderNoPeriod && (nextPeriod || nextLooksCompany || extractedCompanyFromRole)) {
          const companyFixed = (extractedCompanyFromRole || (nextLooksCompany ? nextLine.replace(/[.,;]+$/, '') : undefined));
          const periodNew = nextPeriod ? `${nextPeriod[1]} - ${nextPeriod[2]}` : undefined;
          items.push(curr);
          current = { role: roleCandidate, company: companyFixed, period: periodNew, bullets: [], volunteer: inVolunteerSection || /volunteer/i.test(roleCandidate) || ORG_HINT_VOL.test(companyFixed || '') };
          continue; // 不把该行作为要点
        }
        // 若要点行形如“组织 + 时间”（例如：Bethel Bread of Life Church Jan 2023 – Present），则拆分为新的志愿者条目
        const m = normalized.match(periodHint);
        const companyCandidate = m ? normalized.replace(m[0], "").trim() : "";
        const looksOrg = companyCandidate && ORG_HINT_VOL.test(companyCandidate) && !actionVerbPattern.test(companyCandidate) && !/^[a-z]/.test(companyCandidate);
        if (m && looksOrg) {
          const takeCount = Math.min(3, curr.bullets.length);
          const idxStart = curr.bullets.length - takeCount;
          const moveIdx: number[] = [];
          for (let k = 0; k < takeCount; k++) {
            const idx = idxStart + k;
            const b = curr.bullets[idx] || "";
            if (VOL_SIGNAL.test(b)) moveIdx.push(idx);
          }
          const moved = moveIdx.map((idx) => curr.bullets[idx]).filter(Boolean);
          if (moveIdx.length > 0) curr.bullets = curr.bullets.filter((_, idx) => !moveIdx.includes(idx));
          const periodNew = `${m[1]} - ${m[2]}`;
          const newItem: WorkItem = { role: "Volunteer", company: companyCandidate, period: periodNew, bullets: moved, volunteer: true };
          // 若已存在相同公司+周期的志愿者条目，合并要点避免重复
          const keyMatch = (w: WorkItem) => (w.role || '').toLowerCase() === 'volunteer'
            && (w.company || '').replace(/[.,;\s]+$/,'').toLowerCase() === (companyCandidate || '').replace(/[.,;\s]+$/,'').toLowerCase()
            && (w.period || '').toLowerCase() === periodNew.toLowerCase();
          const existing = items.find(keyMatch);
          if (existing) {
            const seen = new Set<string>(existing.bullets.map(b => b.toLowerCase()));
            for (const b of moved) { const lb = b.toLowerCase(); if (!seen.has(lb)) { existing.bullets.push(b); seen.add(lb); } }
            existing.volunteer = true;
            current = existing;
          } else {
            items.push(newItem);
            current = newItem;
          }
          continue; // 不把该行作为要点
        }
        // 头部兜底：当某些“职位/公司 | 雇佣类型 | 月 年 – 现在”行未命中头部解析而落入要点时，改为创建新条目
        if (m && !looksOrg) {
          const beforePeriod = normalized.replace(m[0], "").trim();
          // 优先从职位段尾部拆出公司（处理 MemberPopSushi 这类粘连）
          let companyFixed = extractCompanyFromRole(beforePeriod);
          // 先尝试按分隔符切分，右侧作为公司，左侧作为职位
          const segParts = beforePeriod.split(/\s*(?:@|\||—|–|-|\s+at\s+)\s*/);
          let roleSeed = beforePeriod;
          if (segParts.length >= 2) {
            const segCompany = segParts[segParts.length-1].trim();
            const segRole = segParts.slice(0, segParts.length-1).join(' ').trim();
            if (!companyFixed) companyFixed = segCompany;
            roleSeed = segRole || beforePeriod;
          }

          if (!companyFixed) {
            // 退化为从行尾收集 1-3 个 TitleCase 片段作为公司名
            const tailProper = beforePeriod.match(/[A-Z][A-Za-z0-9&'.]+(?:\s+[A-Z][A-Za-z0-9&'.]+){0,2}$/);
            const candidate = tailProper?.[0]?.trim();
            const candidateValid = !!candidate               && !MONTHS_RE.test(candidate.toLowerCase())               && !badCompanyWords.test(candidate)               && /^[A-Z]/.test(candidate)               && !LOC_HINT.test(candidate.toLowerCase())               && !EMPLOYMENT_TYPE_HINT.test(candidate.toLowerCase());
            if (candidateValid) companyFixed = candidate.replace(/[.,;]+$/, '');
          }
          if (companyFixed) {
            const rolePart = deriveRolePart(roleSeed, companyFixed);
            const roleValid = !!rolePart && (
              (titleCasePattern.test(rolePart) && !actionVerbPattern.test(rolePart))
              || (roleHint.test(rolePart) && !actionVerbPattern.test(rolePart) && rolePart.split(/\s+/).length <= 8)
            ) && !nonTitlePreposition.test(rolePart) && !/^[a-z]/.test(rolePart);
            if (roleValid) {
              const periodNew = `${m[1]} - ${m[2]}`;
              // 结束上一条并开启新条目
              items.push(curr);
              current = { role: rolePart, company: companyFixed.replace(/[.,;]+$/, ''), period: periodNew, bullets: [], volunteer: inVolunteerSection || /volunteer/i.test(rolePart) };
              continue; // 不把该行作为要点
            }
          }
        }
        
          // 进一步兜底：即便无法确定公司名，只要样式像头部也拆分为新条目
          if (m && !looksOrg) {
            const beforePeriodLoose = normalized.replace(m[0], "").trim();
            const rolePartLoose = deriveRolePart(beforePeriodLoose, undefined);
            const looksHeaderLoose = !!rolePartLoose && (
              (titleCasePattern.test(rolePartLoose) && !actionVerbPattern.test(rolePartLoose))
              || (roleHint.test(rolePartLoose) && !actionVerbPattern.test(rolePartLoose) && rolePartLoose.split(/\s+/).length <= 10)
            ) && !nonTitlePreposition.test(rolePartLoose) && !/^[a-z]/.test(rolePartLoose);
            if (looksHeaderLoose) {
              const periodNewLoose = `${m[1]} - ${m[2]}`;
              items.push(curr);
              current = { role: rolePartLoose, period: periodNewLoose, bullets: [], volunteer: inVolunteerSection || /volunteer/i.test(rolePartLoose) };
              continue; // 不把该行作为要点
            }
          }
      // 若要点/描述中出现志愿者信号或位于志愿者分节，给当前条目标志愿者
      if (VOL_SIGNAL.test(normalized) || ORG_HINT_VOL.test(normalized) || inVolunteerSection) {
        curr.volunteer = true;
      }
      curr.bullets.push(normalized);
      }
    }
  }
  if (current) items.push(current);

  // 最终去重：按 (role|company|period) 归并，合并要点与志愿者标记
  const norm = (s?: string) => (s || '').replace(/[.,;\s]+$/,'').trim().toLowerCase();
  const keyOf = (w: WorkItem) => `${norm(w.role)}|${norm(w.company)}|${norm(w.period)}`;
  const map = new Map<string, WorkItem>();
  for (const w of items) {
    const key = keyOf(w);
    const exist = map.get(key);
    if (!exist) { map.set(key, { ...w, bullets: [...(w.bullets || [])] }); }
    else {
      const seen = new Set<string>(exist.bullets.map(b => b.toLowerCase()));
      for (const b of w.bullets || []) { const lb = b.toLowerCase(); if (!seen.has(lb)) { exist.bullets.push(b); seen.add(lb); } }
      exist.volunteer = !!(exist.volunteer || w.volunteer || norm(w.role) === 'volunteer');
      // 如果其中一个有公司而另一个为空，补齐公司
      if (!exist.company && w.company) exist.company = w.company;
      if (!exist.period && w.period) exist.period = w.period;
    }
  }
  return Array.from(map.values());
}

async function readTextFromFile(file: File): Promise<string> {
  const mime = file.type || "";
  const buf = Buffer.from(await file.arrayBuffer());
  // 若上传为图片（PNG/JPG 等），当前不做 OCR，返回空字符串以触发上层回退到“粘贴文本”或 sample.pdf
  if (/^image\//i.test(mime) || /\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
    return "";
  }
  if (/pdf$/i.test(mime) || file.name.toLowerCase().endsWith(".pdf")) {
    try {
      // Prefer dynamic import; works in most Next Node runtimes
      const pdfModule: any = await import("pdf-parse");
      const pdfParse = pdfModule?.default ?? pdfModule;
      const out = await pdfParse(buf);
      return (out?.text as string) || "";
    } catch (e1) {
      try {
        // Final fallback: use pdfjs-dist ESM to extract text from pages
        let pdfjs: any;
        try {
          pdfjs = await import("pdfjs-dist/build/pdf.mjs");
        } catch {
          pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        }
        // Ensure workerSrc resolves in the server bundler
        try {
          pdfjs.GlobalWorkerOptions.workerSrc = undefined as any;
        } catch {}
        const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        const loadingTask = pdfjs.getDocument({ data: u8, disableWorker: true });
        const doc = await loadingTask.promise;
        let text = "";
        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          const content = await page.getTextContent();
          const pageText = (content.items || []).map((it: any) => it.str).join(" ");
          text += pageText + "\n";
        }
        try { await doc.destroy(); } catch {}
        return text.trim();
    } catch (e2) {
      // 若所有 PDF 解析方案均失败，则返回空字符串，交由上层回退到文本输入
      return "";
    }
  }
  }
  // 支持旧版 Word .doc：使用 word-extractor 提取正文与页眉页脚
  if (/msword$/i.test(mime) || file.name.toLowerCase().endsWith('.doc')) {
    try {
      const mod: any = await import('word-extractor');
      const WordExtractor = (mod?.default ?? mod) as any;
      const extractor = new WordExtractor();
      const document = await extractor.extract(buf);
      const header = typeof document.getHeaders === 'function' ? document.getHeaders({ includeFooters: false }) : '';
      const body = typeof document.getBody === 'function' ? document.getBody() : '';
      const footer = typeof document.getFooters === 'function' ? document.getFooters() : '';
      const text = [header, body, footer].filter(Boolean).join('\n');
      if (text && text.trim().length > 0) return text.trim();
    } catch (e) {
      // 回退到直接按文本读取，避免 500
      try { return buf.toString('utf8'); } catch {}
      return '';
    }
  }
  if (/msword|officedocument\.wordprocessingml|docx$/i.test(mime) || file.name.toLowerCase().endsWith(".docx")) {
    try {
      const mammoth = await import("mammoth");
      const res = await mammoth.extractRawText({ buffer: buf });
      return res.value || "";
    } catch (e) {
      // 回退：直接按文本读取，避免抛出 500 造成前端闪退
      try {
        return buf.toString("utf8");
      } catch {
        return "";
      }
    }
  }
  // default to text
  const raw = buf.toString("utf8");
  // 二次防御：若内容中可打印字符占比过低，认定为非文本，返回空以触发回退
  const printable = (raw.match(/[\u0020-\u007E\u00A0-\u024F\u4E00-\u9FFF]/g) || []).length;
  const ratio = printable / Math.max(raw.length, 1);
  return ratio < 0.35 ? "" : raw;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const textInput = form.get("text") as string | null;
    const jdText = form.get("jd") as string | null;

    
    // 当用户未上传文件且未提供原始文本时，使用项目根目录下的 sample.pdf 作为兜底示例
    let rawText: string = "";
    // 优先使用用户粘贴的原始文本（更可靠，适用于扫描件/无文本层 PDF）
    if (textInput && textInput.trim().length > 0) {
      rawText = textInput.trim();
    } else if (file) {
      rawText = await readTextFromFile(file);
    }
    // 仅在“既没有文本也没有文件”时，使用 sample.pdf 作为演示兜底
    if ((!textInput || textInput.trim().length === 0) && !file && (!rawText || rawText.trim().length === 0)) {
      try {
        const samplePath = path.join(process.cwd(), "sample.pdf");
        const buf = await fs.readFile(samplePath);
        const fakeFile = {
          name: "sample.pdf",
          type: "application/pdf",
          arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        } as unknown as File;
        rawText = await readTextFromFile(fakeFile);
      } catch {}
    }

    if (!rawText || rawText.trim().length < 10) {
      // 更明确的提示：常见原因是 PDF 为扫描件/图片，没有可提取的文本层
      const msgZh = "无法从该文件提取文本，可能是扫描件或图片 PDF。请粘贴简历文本或上传可编辑的 docx/txt 文件。";
      const msgEn = "Cannot extract text from this file (likely a scanned/image PDF). Please paste your resume text or upload an editable DOCX/TXT.";
      return NextResponse.json({ error: msgZh + " " + msgEn }, { 
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }

    const contact = extractContactInfo(rawText);
    const workExperience = parseWorkExperience(rawText);
    const resumeKeywords = topTerms(rawText, 18, 10, 6);
    const jdKeywords = topTerms(jdText || "", 18, 10, 6);
    const { tech: techSkills, base: baseSkills } = classifySkills(resumeKeywords);
    const { tech: jdTechSkills, base: jdBaseSkills } = classifySkills(jdKeywords);
    const jdReqs = jdRequirementsFromText(jdText);

    // 生成 matches：对 JD 要求进行软评分（词干 + 二元短语），并选取相关要点
    const matches: { requirement: string; bullets: string[]; score: number }[] = [];
    const reqTokensList = jdReqs.map((r) => stemList(tokenize(r)));
    const reqBiList = reqTokensList.map((toks) => bigrams(toks));
    const bulletPool: string[] = [];
    for (const w of workExperience) for (const b of w.bullets) bulletPool.push(b);
    // 上下文池：当没有要点或要点较少时，允许用岗位/公司文本参与匹配评分
    const contextPool: { text: string; tokens: string[]; grams: string[]; rawTokens: string[] }[] = [];
    for (const w of workExperience) {
      const ctxText = [w.role, w.company].filter(Boolean).join(" ");
      const raw = tokenize(ctxText);
      const toks = stemList(raw);
      const grams = bigrams(toks);
      contextPool.push({ text: ctxText, tokens: toks, grams, rawTokens: raw });
    }

    for (let i = 0; i < jdReqs.length; i++) {
      const tokens = reqTokensList[i];
      const grams = reqBiList[i];
      const scored: { b: string; score: number }[] = [];
      // 要点评分
      for (const b of bulletPool) {
        const btRaw = tokenize(b);
        const bt = stemList(btRaw);
        const bg = bigrams(bt);
        const ovTok = normalizedOverlap(tokens, bt);
        // 拆分 JD 术语中的词，提升对短语的原词重合度
        const jdKwTokens: string[] = [];
        for (const term of jdKeywords) { for (const part of term.split(/[\s-]+/)) jdKwTokens.push(part); }
        const ovKw = normalizedOverlap(jdKwTokens, btRaw);
        const ovGram = normalizedOverlap(grams, bg);
        const score = Math.max(ovTok, ovKw) * 0.6 + ovGram * 0.4;
        scored.push({ b, score });
      }
      // 上下文回退评分（岗位/公司）
      for (const ctx of contextPool) {
        const ovTok = normalizedOverlap(tokens, ctx.tokens);
        const jdKwTokens: string[] = [];
        for (const term of jdKeywords) { for (const part of term.split(/[\s-]+/)) jdKwTokens.push(part); }
        const ovKw = normalizedOverlap(jdKwTokens, ctx.rawTokens);
        const ovGram = normalizedOverlap(grams, ctx.grams);
        const score = Math.max(ovTok, ovKw) * 0.5 + ovGram * 0.5;
        // 以可读文本作为“匹配要点”的替代项呈现
        scored.push({ b: ctx.text, score });
      }
      scored.sort((x, y) => y.score - x.score);
      const picked = scored.slice(0, 4).filter((s) => s.score >= 0.2).map((s) => s.b);
      const bestScore = scored.length ? Math.max(0, scored[0].score) : 0;
      matches.push({ requirement: jdReqs[i], bullets: picked, score: +bestScore.toFixed(3) });
    }

    const reqCoveragePct = Math.round(((matches.reduce((sum, m) => sum + (m.score || 0), 0)) / (matches.length || 1)) * 100);

    const resumeTermsSet = new Set<string>(resumeKeywords);
    const jdMatchedSkills = jdKeywords.filter((w) => resumeTermsSet.has(w));
    const highlightTerms = Array.from(new Set([...jdKeywords.slice(0, 20), ...resumeKeywords.slice(0, 10)]));

    return NextResponse.json({
      text: rawText,
      contact,
      workExperience,
      keywords: resumeKeywords,
      jd: jdText || undefined,
      jdKeywords,
      techSkills,
      baseSkills,
      jdTechSkills,
      jdBaseSkills,
      jdMatchedSkills,
      matches,
      reqCoveragePct,
      highlightTerms,
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to extract resume" }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }
}
