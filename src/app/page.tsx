"use client";
import { useMemo, useState, useRef, useEffect, Fragment } from "react";
import SectionBar from "./components/SectionBar";
import { STR } from "./i18n";

type WorkItem = {
  id?: string;
  role?: string;
  company?: string;
  period?: string;
  bullets: string[];
  volunteer?: boolean;
  // 自动生成：岗位概述（2–4 句）
  summaryText?: string;
  // 自动生成：加分项（Preferred / Nice-to-Have）
  niceToHave?: string[];
};

// 教育经历条目（用于编辑与预览）
type EducationItem = {
  degree?: string; // Bachelor / Master / Diploma 等
  field?: string;  // 科目/专业（如 Computer Science）
  school?: string; // 学校名称
  period?: string; // 日期范围（如 2020–2024）
};

type GeneratedResume = {
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  summary?: string;
  techSkills: string[];
  baseSkills: string[];
  jdSkills?: string[];
  jdTechSkills?: string[];
  jdBaseSkills?: string[];
  jdMatchedSkills?: string[];
  highlightTerms: string[];
  matches: { requirement: string; bullets: string[]; score?: number }[];
  reqCoveragePct?: number;
  workExperience: WorkItem[];
};




function isVolunteerFinal(w: WorkItem): boolean {
  // 先尊重显式复选框标记
  if (!!w?.volunteer) return true;
  // 其后进行温和的关键词识别（role/company/bullets），用于自动分流
  const role = (w?.role || '').toLowerCase();
  const company = (w?.company || '').toLowerCase();
  const bulletsJoined = (w?.bullets || []).join(' ').toLowerCase();
  const text = `${role} ${company} ${bulletsJoined}`;
  const VOL_SIGNAL = /(volunteer|volunteering|志愿|义工|charity|foundation|non\s*-?\s*profit|nonprofit|community\s+(service|center|church)|ngo|donation|fund\s*raising|church|ministry|outreach)/i;
  const ORG_HINT_VOL = /(church|foundation|community\s*(center|church)?|food\s*bank|charity|ministry|ngo|non\s*-?\s*profit|nonprofit|outreach|donation)/i;
  if (VOL_SIGNAL.test(text)) return true;
  if (/volunteer|志愿|义工/.test(role)) return true;
  if (ORG_HINT_VOL.test(company)) return true;
  return false;
}

// —— 前端轻量拆分辅助：从“Role Company”推断公司，并清理职位尾部 ——
const ROLE_WORDS_CLIENT = /(crew|member|assistant|intern|coordinator|specialist|engineer|designer|consultant|associate|lead|analyst|marketing|sales|customer|service|support|operator|representative|ambassador|officer|creator|editor|videographer|copywriter|barista|cashier|server|waiter|waitress)/i;
const MONTHS_RE_CLIENT = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
const LOC_HINT_CLIENT = /(melbourne|sydney|beijing|shanghai|kunming|china|australia|united\s+states|usa|uk|england|canada|singapore|hong\s*kong|taiwan|new\s+zealand|victoria|nsw|queensland|guangdong|beijing|shanghai)/i;
const EMPLOYMENT_TYPE_HINT_CLIENT = /(intern(?:ship)?|freelance(?:r)?|contract(?:or)?|part[-\s]?time|full[-\s]?time|temporary|temp|self\s*employed|self[-\s]?employed|volunteer)/i;
const splitCamelClient = (s: string) => s
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .replace(/([)\/\]])([A-Z])/g, "$1 $2")
  .replace(/\s{2,}/g, ' ').trim();
function extractCompanyFromRoleClient(roleText: string): string | undefined {
  const norm = splitCamelClient(roleText);
  const toks = norm.split(/\s+/);
  const candidate: string[] = [];
  for (let k = toks.length - 1; k >= 0 && candidate.length < 3; k--) {
    const w = toks[k];
    const looksProper = /^[A-Z][A-Za-z'’.-]+$/.test(w);
    if (!looksProper) break;
    if (ROLE_WORDS_CLIENT.test(w.toLowerCase())) break;
    candidate.unshift(w);
  }
  const comp = candidate.join(' ').trim().replace(/[.,;]+$/, '');
  if (comp && !ROLE_WORDS_CLIENT.test(comp) && !MONTHS_RE_CLIENT.test(comp.toLowerCase()) && !LOC_HINT_CLIENT.test(comp.toLowerCase()) && !EMPLOYMENT_TYPE_HINT_CLIENT.test(comp.toLowerCase())) return comp;
  return undefined;
}
function deriveRolePartClient(roleText: string, company?: string): string {
  const escapeRegExp = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let roleNorm = splitCamelClient(roleText);
  if (company && company.trim()) {
    const esc = escapeRegExp(company.trim());
    roleNorm = roleNorm.replace(new RegExp(`(?:\\s*(?:@|\u007C|\||-|\/|\\bat\\s+)?)\\s*${esc}[.,;]?$`), '').trim();
  }
  roleNorm = roleNorm.replace(/[\/@|\-]+$/, '').trim();
  return roleNorm;
}

// 轻量级前端工作经历解析（用于服务端解析失败时回退）
function parseWorkExperienceClient(text: string): WorkItem[] {
  const lines = (text || '').split(/\r?\n/).map((l) => l.trim());
  const items: WorkItem[] = [];
  const titleCasePattern = /^[A-Z][A-Za-z&\/\-]+(?:\s+[A-Z][A-Za-z&\/\-]+){0,6}$/;
  const actionVerbPattern = /\b(manage|managed|design|designed|develop|developed|implement|implemented|optimi[sz]e|build|built|lead|led|coordinate|coordinated|analy[sz]e|research|researched|support|supported|maintain|maintained|deliver|delivered|drive|driven|own|owned|plan|planned|execute|executed|assist|assisted|handle|handled|serve|served|create|created|edit|edited)\b/i;
  const roleHint = /(manager|assistant|intern|coordinator|specialist|engineer|designer|consultant|associate|lead|analyst|marketing|sales|customer|service|support|operator|representative|ambassador|officer|creator|editor|videographer|copywriter|social\s+media|content\s+(creator|manager|specialist)|barista|cashier|server|waiter|waitress)/i;
  const BULLET_PREFIX = /^\s*(?:[-*•·▪◦●—–]|(?:\d+)[.)])\s*/;
  const PERIOD_HINT = /([A-Za-z]{3,9}\s?\d{4}|\d{4})(?:\s?[–—-]\s?|\s+to\s+|\s+−\s+)([A-Za-z]{3,9}\s?\d{4}|present|now|current|至今|现在)/i;
  const ORG_VOL = /(church|foundation|association|society|charity|ngo|non\s*profit|community|university|school|academy|基金会|协会|社团|教会|志愿)/i;
  const EMPLOYMENT_TYPE_HINT_CLIENT = /(intern(?:ship)?|freelance(?:r)?|contract(?:or)?|part[-\s]?time|full[-\s]?time|temporary|temp|self\s*employed|self[-\s]?employed|volunteer)/i;
  const MONTHS_RE_CLIENT = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
  const LOC_HINT_CLIENT = /(melbourne|sydney|beijing|shanghai|kunming|china|australia|united\s+states|usa|uk|england|canada|singapore|hong\s*kong|taiwan|new\s+zealand|victoria|nsw|queensland|guangdong|beijing|shanghai)/i;

  let current: WorkItem | null = null;
  let inVolunteerSection = false;
  const VOL_HEAD = /(volunteer|志愿者)/i;
  const NON_VOL_HEAD = /(work\s+experience|professional\s+experience|employment|工作经历|工作经验|专业经历)/i;

  const pushCurrent = () => { if (current) { items.push(current); current = null; } };

  for (const raw of lines) {
    const line = splitCamelClient(raw).replace(/\s{2,}/g, ' ').trim();
    if (!line) continue;
    if (VOL_HEAD.test(line)) { inVolunteerSection = true; continue; }
    if (NON_VOL_HEAD.test(line)) { inVolunteerSection = false; continue; }

    // 头部：Role [@|at| |] Company [— Period]
    const mP = line.match(PERIOD_HINT);
    const beforePeriod = mP ? line.slice(0, line.indexOf(mP[0])).trim() : line;
    const afterPeriod = mP ? `${mP[1]} - ${mP[2]}` : undefined;
    const seg = beforePeriod.split(/\s*(?:@|\||—|–|-|\s+at\s+)\s*/);

    if (seg.length >= 2) {
      const rolePartSeed = seg.slice(0, seg.length - 1).join(' ').trim();
      let companySeed = seg[seg.length - 1].trim();
      if (!companySeed || MONTHS_RE_CLIENT.test(companySeed.toLowerCase()) || LOC_HINT_CLIENT.test(companySeed.toLowerCase())) {
        const tailProper = beforePeriod.match(/[A-Z][A-Za-z0-9&'.]+(?:\s+[A-Z][A-Za-z0-9&'.]+){0,2}$/);
        companySeed = tailProper?.[0]?.trim() || companySeed;
      }
      const rolePart = deriveRolePartClient(rolePartSeed, companySeed);
      const roleValid = !!rolePart && (
        (titleCasePattern.test(rolePart) && !actionVerbPattern.test(rolePart)) ||
        (roleHint.test(rolePart) && !actionVerbPattern.test(rolePart) && rolePart.split(/\s+/).length <= 8)
      ) && !/^\p{Ll}/u.test(rolePart);
      const companyValid = !!companySeed && !MONTHS_RE_CLIENT.test(companySeed.toLowerCase()) && !LOC_HINT_CLIENT.test(companySeed.toLowerCase());
      if (roleValid && companyValid) {
        pushCurrent();
        current = { role: rolePart, company: companySeed.replace(/[.,;]+$/, ''), period: afterPeriod, bullets: [], volunteer: inVolunteerSection || /volunteer/i.test(rolePart) || ORG_VOL.test(companySeed) };
        continue;
      }
    }

    // 列兜底：按双空格分列 "Role  Company  Start  End"
    const parts = line.replace(/\s{3,}/g, '  ').split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
    if (!mP && parts.length >= 2) {
      const roleCand = deriveRolePartClient(parts[0] || '', parts[1] || undefined);
      const companyCand = parts[1] || '';
      const roleValid = !!roleCand && (
        (titleCasePattern.test(roleCand) && !actionVerbPattern.test(roleCand)) ||
        (roleHint.test(roleCand) && !actionVerbPattern.test(roleCand) && roleCand.split(/\s+/).length <= 8)
      );
      const companyValid = !!companyCand && !MONTHS_RE_CLIENT.test(companyCand.toLowerCase()) && !LOC_HINT_CLIENT.test(companyCand.toLowerCase());
      if (roleValid && companyValid) {
        let periodFixed: string | undefined = undefined;
        if (parts.length >= 4) {
          const looksMonthYear = (s: string) => MONTHS_RE_CLIENT.test((s || '').toLowerCase()) || /\b\d{4}\b/.test(s || '');
          if (looksMonthYear(parts[2] || '') && looksMonthYear(parts[3] || '')) periodFixed = `${parts[2]} - ${parts[3]}`;
        }
        if (!periodFixed) {
          const m = line.match(PERIOD_HINT); if (m) periodFixed = `${m[1]} - ${m[2]}`;
        }
        pushCurrent();
        current = { role: roleCand, company: companyCand.replace(/[.,;]+$/, ''), period: periodFixed, bullets: [], volunteer: inVolunteerSection || /volunteer/i.test(roleCand) || ORG_VOL.test(companyCand) };
        continue;
      }
    }

    // 要点行
    if (current) {
      const normalized = line.replace(BULLET_PREFIX, '').replace(/[.;:,\s]+$/g, '').trim();
      if (!normalized) continue;
      if (LOC_HINT_CLIENT.test(normalized.toLowerCase()) && !/\b(university|school|college|academy)\b/i.test(normalized)) continue;
      current.bullets = [...(current.bullets || []), normalized];
      continue;
    }
  }
  pushCurrent();

  // 简单去重归并
  const normKey = (w: WorkItem) => `${(w.role||'').toLowerCase()}|${(w.company||'').toLowerCase()}|${(w.period||'').toLowerCase()}`.replace(/[.,;\s]+$/,'');
  const map = new Map<string, WorkItem>();
  for (const w of items) {
    const k = normKey(w);
    const ex = map.get(k);
    if (!ex) map.set(k, { ...w, bullets: [...(w.bullets || [])], volunteer: !!w.volunteer });
    else {
      const seen = new Set<string>(ex.bullets.map((b) => b.toLowerCase()));
      for (const b of (w.bullets || [])) { const lb = b.toLowerCase(); if (!seen.has(lb)) { ex.bullets.push(b); seen.add(lb); } }
      ex.volunteer = !!(ex.volunteer || w.volunteer);
      if (!ex.company && w.company) ex.company = w.company;
      if (!ex.period && w.period) ex.period = w.period;
    }
  }
  return Array.from(map.values());
}

function highlight(text: string, terms: string[]) {
  const set = new Set(terms.map((t) => t.toLowerCase()));
  const tokens = text.split(/(\s+)/);
  return (
    <>
      {tokens.map((tok, i) => {
        const clean = tok.replace(/[^a-z0-9+.#-]/gi, "").toLowerCase();
        return set.has(clean) ? (
          <strong key={i} className="font-semibold">
            {tok}
          </strong>
        ) : (
          <span key={i}>{tok}</span>
        );
      })}
    </>
  );
}

// 轻量关键词提取（前端实时估算用），与后端逻辑保持一致的正则
const STOP_WORDS_CLIENT = new Set([
  "the","and","a","an","to","of","in","for","on","with","by",
  "is","are","as","at","from","or","that","this","your","you","we","our","be","will",
  "if","without","been","being","its","they","their","he","she","i","me","my",
  "can","would","could","should","must","may","might",
  "new","one","great","ideal","fill","successful","better","have","before","even","then","always","full","brain","brewing","roll",
  "who","what","why","how","where","when","which","whom","whose",
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
  "person","people","team","experience","corp","coates",
  "jan","january","feb","february","mar","march","apr","april","may","jun","june","jul","july","aug","august","sep","sept","september","oct","october","nov","november","dec","december",
  "agency","recruitment","tasked","roles","role","candidates","highly","regarded",
]);
// 额外过滤：将常见宣传性/地点/无意义词排除在 JD 关键词之外
STOP_WORDS_CLIENT.add("any");
STOP_WORDS_CLIENT.add("fun");
STOP_WORDS_CLIENT.add("australia");
STOP_WORDS_CLIENT.add("austtalia"); // 常见拼写错误
STOP_WORDS_CLIENT.add("largest");
STOP_WORDS_CLIENT.add("fastest");
STOP_WORDS_CLIENT.add("growing");
STOP_WORDS_CLIENT.add("fastest-growing");
STOP_WORDS_CLIENT.add("issue");
STOP_WORDS_CLIENT.add("issues");
function tokenizeClient(text: string): string[] {
  const lower = text.toLowerCase();
  // 同后端逻辑：英文按单词（≥3），中文按连续汉字（≥2）分词
  const matches = lower.match(/[a-z0-9+.#-]{3,}|[\p{Script=Han}]{2,}/gu) || [];
  return matches.filter((t) => t.length > 1 && !STOP_WORDS_CLIENT.has(t));
}

// 英式-美式拼写归一 + 常见领域同义词归一（提高命中率，避免“enquiries/inquiries”等漏识别）
const BRITISH_US_VARIANTS: Array<[string, string]> = [
  ["organisation", "organization"],
  ["organise", "organize"],
  ["organised", "organized"],
  ["organising", "organizing"],
  ["behaviour", "behavior"],
  ["colour", "color"],
  ["favourite", "favorite"],
  ["catalogue", "catalog"],
  ["programme", "program"],
  ["analysed", "analyzed"],
  ["analyse", "analyze"],
  ["enquiry", "inquiry"],
  ["enquiries", "inquiries"],
  ["centre", "center"],
];
const SYNONYMS_CANON: Record<string, string[]> = {
  // 客服相关：包含服务台、餐饮/零售场景、岗位称谓等，统一映射到 customer-service
  "customer-service": [
    "customer service","customer support","customer care","client service","helpdesk","service desk","support",
    "front of house","foh","reception","front desk","guest service","guest services",
    "hospitality","restaurant","fast food","store","shop","retail","shop floor",
    "cashier","barista","waiter","server","host","hostess","crew","team member",
    "mcdonald","mcdonalds","mcdonald's","starbucks","kfc","burger king",
    // Contact/Call centre synonyms (AU/UK/US spellings)
    "contact centre","contact center","call centre","call center","call-centre","call-center",
    "serve customers","serving customers","take orders","taking orders","customer-facing"
  ],
  "sales": ["sales","selling","business development","bd"],
  "inquiry": ["inquiries","enquiries","queries","requests","tickets","enquiry","inquiry","question"],
  "quotes": ["quote","quotes","quotation","quotations","estimations","estimate","quoting"],
  "orders": ["orders","order processing","order entry","fulfillment","fulfilment","process orders","processing orders","po","purchase order"],
  "shopify": ["shopify"],
  "monday": ["monday.com","monday"],
  "email": ["email","emails","mail"],
  "phone": ["phone","call","calls","calling","inbound calls","incoming calls","answering calls","phone support"],
  "communication": ["communication","communications","comms"],
  "admin": ["administration","admin","administrative"],
  "records": ["records","logs","documentation"],
  "reception": ["reception","front desk"],
  "poc": ["point of contact","first point of contact","primary contact","poc"],
  "b2c": ["b2c","consumer","direct to consumer","dtc"],
  "inventory": ["inventory","stock","stocks"],
};
const SYN_INDEX = new Map<string, string>();
for (const [canon, vars] of Object.entries(SYNONYMS_CANON)) {
  for (const v of vars) SYN_INDEX.set(v.toLowerCase(), canon);
}
function escapeRegex(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function normalizeSpellingClient(text: string): string {
  let s = text.toLowerCase();
  s = s.replace(/&/g, " and ");
  s = s.replace(/[\/]+/g, " ");
  for (const [from, to] of BRITISH_US_VARIANTS) {
    s = s.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  }
  // 将常见同义词短语替换为单一规范 token（如 "customer service" -> "customer-service"）
  for (const [canon, vars] of Object.entries(SYNONYMS_CANON)) {
    for (const v of vars) {
      const re = new RegExp(`\\b${escapeRegex(v)}\\b`, "g");
      s = s.replace(re, canon);
    }
  }
  return s;
}
function canonicalizeTokensClient(tokens: string[]): string[] {
  return tokens.map((t) => SYN_INDEX.get(t) || t);
}

function bigramsClient(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    out.push(words[i] + " " + words[i + 1]);
  }
  return out;
}

function trigramsClient(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length - 2; i++) {
    out.push(words[i] + " " + words[i + 1] + " " + words[i + 2]);
  }
  return out;
}

function topKeywordsClient(text: string, limit = 20): string[] {
  const freq = new Map<string, number>();
  for (const t of tokenizeClient(text)) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

function topPhrasesClient(text: string, limitBi = 12, limitTri = 8): string[] {
  const toks = tokenizeClient(text);
  const bi = bigramsClient(toks);
  const tri = trigramsClient(toks);
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

function topTermsClient(text: string, limitWords = 18, limitPhrasesBi = 10, limitPhrasesTri = 6): string[] {
  const phrases = topPhrasesClient(text, limitPhrasesBi, limitPhrasesTri);
  const words = topKeywordsClient(text, limitWords);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of phrases) { if (!seen.has(p)) { result.push(p); seen.add(p); } }
  for (const w of words) { if (!seen.has(w)) { result.push(w); seen.add(w); } }
  return result;
}

// 前端精确过滤：进一步剔除包含下列片段的词/短语
function refineJdTermsClient(terms: string[]): string[] {
  // 额外排除：运输/职位称谓等非关键词噪声，避免出现“courier taxi truck”等串词
  const bannedSingles = new Set<string>([
    "any","fun","australia","austtalia","largest","fastest","growing","fastest-growing","issue","issues",
    // 行业噪声与不独立成词的单词
    "courier","taxi","truck","transport","capital","officer","business","culture"
  ]);
  const bannedSubstrings = [
    "australia","largest","fastest-growing","fastest","growing","any","fun","issue","issues",
    // 组合短语中出现即过滤
    "courier","taxi","truck","transport","capital","business"
  ];
  // 七类保留规则（只要命中其一即保留）
  const toNorm = (s: string) => s.trim().toLowerCase();
  const containsAny = (s: string, arr: string[]) => arr.some((h) => toNorm(s).includes(toNorm(h)));
  // 统一清理标点，保证展示为短语而非带句号的片段
  const PUNCT_REGEX = /[.,;:!?，。、；：！？]+/g;
  // 泛词作为单个词出现时不保留（多词短语可结合提示词保留）
  const GENERIC_SINGLE_WORDS = new Set<string>(['customer','service','client','clients']);

  // 局部软/硬技能提示与判定器，避免依赖外部作用域
  const SOFT_HINTS_LOCAL = [
    'communication', 'teamwork', 'collaboration', 'leadership', 'adaptability', 'problem',
    'supportive', 'time management', 'attention to detail', 'interpersonal', 'stakeholder',
    'customer service', 'service', 'client', 'clients', '协调', '沟通', '协作', '领导', '适应', '细节', '客户服务'
  ];
  const HARD_HINTS_LOCAL = [
    'sql','excel','word','powerpoint','outlook','spreadsheet','pivot','vlookup',
    'python','javascript','typescript','java','c++','c#','node','react','next.js','vue','angular',
    'aws','azure','gcp','cloud','linux','windows','macos','docker','kubernetes','git',
    'crm','zendesk','salesforce','sap','tableau','power bi','notion','jira','asana','monday.com',
    'figma','canva','photoshop','illustrator','premiere','after effects',
    'google ads','facebook ads','meta ads','seo','sem','google analytics','ga4','social media','social media management',
    'content creation','copywriting','graphic design','video editing',
    'data entry','order processing','inventory','warehouse','logistics','dispatch','routing','route planning',
    'cash handling','pos','point of sale','billing','invoicing','typing',
    'safety','compliance','manual handling','forklift','license','driver license','driving license'
  ];
  const NON_SKILL_WORDS_LOCAL = new Set([
    'largest','fastest','growing','largest fastest-growing','fastest-growing','australia','australian',
    'officer','capital','transport','courier','taxi','truck','business','culture','any','issues','fun',
  ]);
  const isHardSkillLikeLocal = (s: string) => {
    const t = toNorm(s);
    if (!t || NON_SKILL_WORDS_LOCAL.has(t)) return false;
    if (containsAny(t, HARD_HINTS_LOCAL)) return true;
    // 形状启发式：包含符号或显著技术缩写
    if (/\b(crm|sql|aws|gcp|sap|git|pos)\b/.test(t)) return true;
    if (/[+#\.]/.test(t)) return true; // C#, C++, Next.js 等
    if (/\b(management|planning|analys\w*|design\w*|develop\w*|support|troubleshoot\w*|mainten\w*|compliance|inventory|logistics|dispatch|routing|warehouse)\b/.test(t)) return true;
    // 保守：未命中任何提示或形状，不认为是技能
    return false;
  };

  const RESPONSIBILITY_VERBS = [
    'manage','conduct','prepare','support','coordinate','lead','design','develop','maintain','implement','monitor',
    'analyze','analyse','research','build','optimize','deliver','communicate','collaborate','report','plan','organize','organise',
    'train','assist','handle'
  ];
  const QUAL_HINTS = [
    'bachelor','degree','master','phd','cert','certificate','certification','ielts','toefl','mandarin','english','proficient',
    'experience','years','year','valid','license','licence','wwcc','working with children','visa','work rights','driver','police check'
  ];
  const INDUSTRY_HINTS = [
    'seo','sem','content strategy','e-commerce','retail','education','childcare','hospitality','finance','banking',
    'manufacturing','supply chain','logistics','compliance standards','early learning framework','child safety standards','web3','blockchain','smart contract'
  ];
  const EXPERIENCE_LEVEL_HINTS = ['intern','internship','graduate','junior','mid','mid-level','senior','lead'];
  const isJobTitleLike = (s: string) => {
    const t = toNorm(s);
    const roleNouns = ['assistant','specialist','manager','coordinator','analyst','educator','engineer','developer','designer','consultant','lead','intern'];
    // 至少由两词组成且包含职类名词，且不包含明显噪声
    return t.split(/\s+/).length >= 2 && roleNouns.some(r => t.includes(r)) && !bannedSubstrings.some(sub => t.includes(sub));
  };

  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of terms) {
    const raw = toNorm(String(t));
    if (!raw) continue;
    // 去除句号等标点，规范为词组
    let cleaned = raw.replace(PUNCT_REGEX, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    if (STOP_WORDS_CLIENT.has(cleaned)) continue;
    if (bannedSingles.has(cleaned)) continue;
    if (bannedSubstrings.some((sub) => raw.includes(sub) || cleaned.includes(sub))) continue;
    // 单词长度太短或仅为通用词，剔除（例如单独的“customer”“service”）
    if (cleaned.length <= 3) continue;
    const isSingleWord = !cleaned.includes(' ');
    if (isSingleWord && GENERIC_SINGLE_WORDS.has(cleaned)) continue;
    // 分类基于原始文本保证判定准确；展示使用清理后的短语
    const isHard = isHardSkillLikeLocal(raw);
    const isSoft = containsAny(raw, SOFT_HINTS_LOCAL);
    const isResp = RESPONSIBILITY_VERBS.some(v => raw.startsWith(v + ' ') || raw.includes(' ' + v + ' ') || cleaned.startsWith(v + ' ') || cleaned === v);
    const isQual = containsAny(raw, QUAL_HINTS) || containsAny(cleaned, QUAL_HINTS);
    const isInd = containsAny(raw, INDUSTRY_HINTS) || containsAny(cleaned, INDUSTRY_HINTS);
    const isExpLvl = containsAny(raw, EXPERIENCE_LEVEL_HINTS) || containsAny(cleaned, EXPERIENCE_LEVEL_HINTS);
    const isJobTitle = isJobTitleLike(cleaned);
    const keep = isHard || isSoft || isResp || isQual || isInd || isExpLvl || isJobTitle;
    if (!keep) continue;
    if (!seen.has(cleaned)) { out.push(cleaned); seen.add(cleaned); }
  }
  return out;
}

// 轻量前端联系方式解析（后端的简化版）：识别姓名/邮箱/电话
function extractContactInfoClient(text: string): { name?: string; email?: string; phone?: string } {
  if (!text) return {};
  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const phoneReGeneric = /\+?\d[\d\s()\-]{7,}\d/;
  let emailMatch = text.match(emailRe);
  let phoneMatch = text.match(phoneReGeneric);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const HEADER_RE_EN = /\b(profile|summary|objective|experience|work\s+experience|professional\s+experience|skills?|education|certifications?|projects?|references?|awards?|publications?|languages?|contact|work\s+history|employment|curriculum\s+vitae|resume)\b/i;
  const HEADER_RE_ZH = /(简介|摘要|概述|个人简介|工作经历|工作经验|专业经历|教育|教育背景|技能|证书|项目|参考|荣誉|出版物|语言|联系方式|个人信息)/;
  const BANNED_TOKENS = new Set<string>([
    'professional','experience','work','skills','skill','education','project','projects','certification','certifications',
    'summary','objective','profile','references','awards','publications','languages','contact','history','employment',
    'resume','curriculum','vitae'
  ]);

  const emailLineIdx = lines.findIndex((l) => /@/.test(l));
  const phoneLineIdx = lines.findIndex((l) => /\+?\d[\d\s()\-]{7,}\d/.test(l));
  const candidateIdx: number[] = [];
  const pushRange = (start: number, end: number) => { for (let i = start; i <= end && i < lines.length; i++) { if (i >= 0) candidateIdx.push(i); } };
  if (emailLineIdx >= 0) pushRange(emailLineIdx - 3, emailLineIdx - 1);
  if (phoneLineIdx >= 0) pushRange(phoneLineIdx - 3, phoneLineIdx - 1);
  pushRange(0, Math.min(8, lines.length) - 1);
  const seenIdx = new Set<number>();
  const orderedIdx = candidateIdx.filter((i) => (seenIdx.has(i) ? false : (seenIdx.add(i), true)));

  let name: string | undefined;
  for (const i of orderedIdx) {
    const l = lines[i];
    if (!l || HEADER_RE_EN.test(l) || HEADER_RE_ZH.test(l)) continue;
    if (/@|\d/.test(l)) continue;
    // 中文姓名（2-6个汉字，不含空格或标点）
    if (/^[\u4e00-\u9fa5]{2,6}$/.test(l)) { name = l; break; }
    const words = l.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) continue;
    const wordLowers = words.map((w) => w.replace(/[^A-Za-z'-]/g, '').toLowerCase()).filter(Boolean);
    if (wordLowers.some((w) => BANNED_TOKENS.has(w))) continue;
    const looksTitleCase = words.every((w) => /^[A-Z][a-z][A-Za-z'-]*$/.test(w));
    const looksAllUpper = words.every((w) => /^[A-Z][A-Z'-]+$/.test(w));
    if ((looksTitleCase || looksAllUpper) && l.length <= 40) { name = l; break; }
  }

  // 邮箱回退：处理 "name at domain dot com" 或 "mailto:" 形式
  if (!emailMatch) {
    const normalized = text
      .replace(/\bat\b/gi, '@')
      .replace(/\(at\)/gi, '@')
      .replace(/\s+dot\s+/gi, '.')
      .replace(/\(dot\)/gi, '.')
      .replace(/mailto:/gi, '');
    emailMatch = normalized.match(emailRe);
  }
  // 电话回退：优先带标签的行（phone/mobile/tel/电话/手机）
  if (!phoneMatch) {
    const labelRe = /(phone|mobile|mob|tel|telephone|电话|手机)[:：]?\s*([+()\d][\d\s().\-]{6,}\d)/i;
    const lbl = text.match(labelRe);
    if (lbl && lbl[2]) phoneMatch = [lbl[2]] as any;
  }

  // 回退：从 LinkedIn 个性化链接反推出英文姓名（slug -> Title Case）
  if (!name) {
    const m = text.toLowerCase().match(/linkedin\.com\/in\/([a-z0-9-]+)/i);
    if (m && m[1]) {
      const partsRaw = m[1].split('-').filter(Boolean);
      // 去掉可能拼在 slug 尾部的形容词（如 bilingual、marketing 等）
      const parts = partsRaw
        .map((p) => p.replace(/(bilingual|marketing|social|media|professional|event)$/i, ''))
        .filter((p) => p && p.length <= 20);
      if (parts.length >= 2 && parts.length <= 4) {
        name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
      }
    }
  }
  return { name, email: emailMatch?.[0], phone: phoneMatch?.[0] };
}

// 识别地址与网站（简化规则）：返回首个匹配项
function extractContactExtrasClient(text: string): { address?: string; website?: string } {
  if (!text) return {};
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const ADDR_HINT_EN = /(street|st\.?\b|road|rd\.?\b|avenue|ave\.?\b|boulevard|blvd\.?\b|lane|ln\.?\b|drive|dr\.?\b|suite|unit|level|building|apartment|apt\.?\b|po\s?box|melbourne|sydney|victoria|nsw|queensland|beijing|shanghai|china|australia|usa|united\s+states|uk|england|canada)/i;
  const ADDR_HINT_ZH = /(省|市|区|县|镇|乡|街道|路|巷|弄|号|楼|室|单元|大厦|大道|广场|园区)/;
  let address: string | undefined;
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const l = lines[i];
    if (!l) continue;
    const hasDigit = /\d/.test(l);
    if (ADDR_HINT_EN.test(l) || ADDR_HINT_ZH.test(l) || hasDigit) {
      // 跳过明显是联系方式行（含 @ 或多电话符号）
      if (/@/.test(l)) continue;
      if ((l.match(/\d/g) || []).length >= 14 && /\+?\d[\d\s()\-]{7,}\d/.test(l)) continue;
      // 清理“Email: …”、“LinkedIn: …”段，再取管道分隔前的地址部分
      const cleaned = l.replace(/Email\s*:[^|]+/i, '').replace(/LinkedIn\s*:[^|]+/i, '').trim();
      const segs = cleaned.split(/\s*\|\s*/).filter(Boolean);
      const pick = segs.length ? segs[0] : cleaned;
      address = pick.replace(/\s+/g, ' ').trim();
      break;
    }
  }

  // 网站：优先 http/https，其次 www.* 或域名
  let website: string | undefined;
  const textNoEmail = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, '');
  // 特判 LinkedIn：仅保留小写 slug，避免将后续文案拼进链接
  const mLinked = textNoEmail.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([A-Za-z0-9-]+)/);
  if (mLinked && mLinked[1]) {
    let slug = mLinked[1];
    // 去除可能直接拼在 slug 尾部的描述词（如 Bilingual、Marketing 等）
    slug = slug.replace(/(bilingual|marketing|social|media|professional|event)$/i, '');
    website = `https://www.linkedin.com/in/${slug.toLowerCase()}`;
  } else {
    const httpRe = /\bhttps?:\/\/[-A-Za-z0-9+&@#/%?=~_|!:,.;]*[-A-Za-z0-9+&@#/%=~_|]/i;
    const wwwRe = /\bwww\.[-A-Za-z0-9+&@#/%?=~_|!:,.;]*[-A-Za-z0-9+&@#/%=~_|]/i;
    const domainRe = /\b(?:[A-Za-z0-9-]+\.)+(?:com|net|org|io|co|cn|au|uk|us|me|dev|app|site)\b(?:\/[A-Za-z0-9/_\-.]*)?/i;
    website = textNoEmail.match(httpRe)?.[0] || textNoEmail.match(wwwRe)?.[0] || textNoEmail.match(domainRe)?.[0] || undefined;
    if (website) website = website.replace(/[),.;]+$/, '');
  }
  return { address, website };
}

// 识别教育经历（前端简化版）：返回若干条 { degree, field, school, period }
function extractEducationClient(text: string): EducationItem[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // 英文学位匹配：不再匹配裸 "master"，仅匹配 Master’s/Master of 或标准缩写
  const DEG_RE_EN = /\b(?:bachelor(?:'s)?|ph\.?d\.?|phd|doctor(?:ate)?|mba|associate(?:'s)?|diploma|certificate|b\.?s\.?|bsc|ba|bs|m\.?s\.?|msc|ma|ms|mfa|meng|beng|jd|llb|llm|high\s+school\s+diploma)\b/i;
  const MASTER_PHRASE_RE = /\bmaster(?:'s)\b|\bmaster of\b/i;
  const DEG_RE_ZH = /(学士|本科|硕士|研究生|博士|大专|文凭|证书|高中|中专|中学)/;
  const FIELD_RE_EN = /\b(?:in|of)\s+([A-Za-z][A-Za-z &/\-()]+)/i;
  const FIELD_RE_ZH = /(专业|系)[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9 &/\-()]+)/;
  const SCHOOL_RE = /(\b(?:University|College|Institute|Polytechnic|Academy|School|High\s+School|Secondary\s+School|Vocational\s+School)\b|大学|学院|学校|高中|中学|中专|职业学校|技校)/i;
  const PERIOD_RE_1 = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\s*(?:[–\-—]|to)\s*(?:Present|Now|\d{4})\b/i;
  const PERIOD_RE_2 = /\b\d{4}\s*(?:[–\-—]|to)\s*(?:Present|Now|\d{4})\b/i;

  const normDegree = (raw: string): string => {
    const s = (raw || '').toLowerCase();
    if (/ph\.?d\.?|doctor/.test(s)) return 'PhD';
    if (/mba/.test(s)) return 'MBA';
    if (/master|m\.?s\.?|msc|ma|ms/.test(s)) return 'Master';
    if (/bachelor|b\.?s\.?|bsc|ba|bs/.test(s)) return 'Bachelor';
    if (/associate/.test(s)) return 'Associate';
    if (/diploma/.test(s)) return 'Diploma';
    if (/certificate/.test(s)) return 'Certificate';
    if (/本科|学士/.test(s)) return 'Bachelor';
    if (/硕士|研究生/.test(s)) return 'Master';
    if (/博士/.test(s)) return 'PhD';
    if (/大专/.test(s)) return 'Associate';
    if (/文凭/.test(s)) return 'Diploma';
    if (/证书/.test(s)) return 'Certificate';
    return raw;
  };

  const results: EducationItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    const hasDeg = DEG_RE_EN.test(l) || DEG_RE_ZH.test(l) || MASTER_PHRASE_RE.test(l);
    const looksEduHeader = /education|教育(经历|背景)?/i.test(l);
    if (!hasDeg && !looksEduHeader) continue;

    // 在当前行及相邻行中提取字段
    const windowLines = [lines[i - 1], l, lines[i + 1], lines[i + 2]].filter(Boolean) as string[];
    let degree: string | undefined;
    let field: string | undefined;
    let school: string | undefined;
    let period: string | undefined;

    for (const wl of windowLines) {
      const mDegEn = wl.match(DEG_RE_EN);
      const mDegMaster = wl.match(MASTER_PHRASE_RE);
      const mDegZh = wl.match(DEG_RE_ZH);
      if (!degree && (mDegEn || mDegZh || mDegMaster)) degree = normDegree((mDegEn?.[0] || mDegZh?.[0] || mDegMaster?.[0] || '').trim());
      if (!field) {
        const mFieldEn = wl.match(FIELD_RE_EN);
        const mFieldZh = wl.match(FIELD_RE_ZH);
        if (mFieldEn && mFieldEn[1]) field = mFieldEn[1].replace(/\s{2,}/g, ' ').trim();
        else if (mFieldZh && mFieldZh[2]) field = mFieldZh[2].replace(/\s{2,}/g, ' ').trim();
        else {
          // 括号内常是专业
          const paren = wl.match(/\(([^)]+)\)/);
          if (paren && !SCHOOL_RE.test(wl)) {
            const cand = paren[1].trim();
            if (cand && cand.length <= 60) field = cand;
          }
        }
      }
      if (!school && SCHOOL_RE.test(wl)) {
        // 取管道或逗号前的片段作为学校名
        const segs = wl.split(/\s*\|\s*|,\s*/).filter(Boolean);
        const pick = segs.find((s) => SCHOOL_RE.test(s)) || wl;
        school = pick.replace(/\s{2,}/g, ' ').trim();
      }
      if (!period) {
        const mP1 = wl.match(PERIOD_RE_1);
        const mP2 = wl.match(PERIOD_RE_2);
        if (mP1?.[0]) period = mP1[0];
        else if (mP2?.[0]) period = mP2[0];
      }
    }

    // 若只有标题行（Education）但未提取到有效字段，继续向后两行搜寻一次
    if (!degree && !school && looksEduHeader) {
      for (let k = i + 1; k <= Math.min(i + 3, lines.length - 1); k++) {
        const wl = lines[k];
        const mDegEn = wl.match(DEG_RE_EN);
        const mDegMaster = wl.match(MASTER_PHRASE_RE);
        const mDegZh = wl.match(DEG_RE_ZH);
        if (!degree && (mDegEn || mDegZh || mDegMaster)) degree = normDegree((mDegEn?.[0] || mDegZh?.[0] || mDegMaster?.[0] || '').trim());
        if (!field) {
          const mFieldEn = wl.match(FIELD_RE_EN);
          const mFieldZh = wl.match(FIELD_RE_ZH);
          if (mFieldEn?.[1]) field = mFieldEn[1].trim();
          else if (mFieldZh?.[2]) field = mFieldZh[2].trim();
        }
        if (!school && SCHOOL_RE.test(wl)) {
          school = wl.trim();
        }
        if (!period) {
          const mP1 = wl.match(PERIOD_RE_1);
          const mP2 = wl.match(PERIOD_RE_2);
          if (mP1?.[0]) period = mP1[0];
          else if (mP2?.[0]) period = mP2[0];
        }
      }
    }

    // 有效性更宽松：任意两项字段即可；或在教育标题上下文中至少有一项字段
    const filledCount = (degree ? 1 : 0) + (field ? 1 : 0) + (school ? 1 : 0) + (period ? 1 : 0);
    const valid = filledCount >= 2 || (looksEduHeader && filledCount >= 1);
    if (valid) {
      results.push({ degree, field, school, period });
    }
  }

  // 去重：按 school+degree+period 唯一化，限制最多 4 条
  const uniq = new Map<string, EducationItem>();
  for (const e of results) {
    const key = `${(e.school || '').toLowerCase()}|${(e.degree || '').toLowerCase()}|${(e.period || '').toLowerCase()}`;
    if (!uniq.has(key)) uniq.set(key, e);
  }
  // 限制数量，避免出现过多编辑框
  return Array.from(uniq.values()).slice(0, 2);
}

// 识别“自我介绍/简介/摘要”：从摘要/简介标题下或靠前的首段提取
function extractSummaryClient(text: string): string | undefined {
  if (!text) return undefined;
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const HEADER_SUMMARY_EN = /\b(summary|profile|objective)\b/i;
  const HEADER_SUMMARY_ZH = /(自我介绍|简介|摘要|概述)/;
  const HEADER_ANY_EN = /\b(experience|work\s+experience|professional\s+experience|skills?|education|projects?|certifications?|languages?|contact)\b/i;
  const HEADER_ANY_ZH = /(工作经历|工作经验|专业经历|技能|教育|项目|证书|语言|联系方式)/;
  const CONTACT_WORDS = /(email|e-mail|phone|mobile|tel|address|linkedin|github|wechat|weibo|instagram|facebook|website|site|联系方式|地址|电话|邮箱|微信)/i;
  const PLATFORM_WORDS = /(tiktok|xiaohongshu|小红书|wechat|capcut|canva)/i;
  const SKILL_PHRASES = /(skilled\s+in|proficient\s+in|tools?:|software:|熟练|擅长|精通|掌握)/i;
  const tooManySeparators = (s: string) => ((s.match(/\|/g) || []).length >= 2) || ((s.match(/[•、，]/g) || []).length >= 3);
  const isContactLike = (s: string) => /@|\+?\d[\d\s()\-]{7,}\d|https?:\/\/|www\./i.test(s) || CONTACT_WORDS.test(s);
  const isNoiseLine = (s: string) => isContactLike(s) || PLATFORM_WORDS.test(s) || SKILL_PHRASES.test(s) || tooManySeparators(s);
  const stripTrailingSkillSegments = (s: string) => {
    const idx = s.search(SKILL_PHRASES);
    return idx > 0 ? s.slice(0, idx).trim() : s.trim();
  };
  // 找到“summary/profile”等标题后的第一段
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    if (HEADER_SUMMARY_EN.test(lines[i]) || HEADER_SUMMARY_ZH.test(lines[i])) {
      const para: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j].trim();
        if (!l) break;
        if (HEADER_ANY_EN.test(l) || HEADER_ANY_ZH.test(l)) break;
        if (isNoiseLine(l)) continue;
        para.push(stripTrailingSkillSegments(l));
        // 控制长度：最多两行
        if (para.join(' ').length > 240 || para.length >= 2) break;
      }
      const textOut = para.join(' ').trim();
      if (textOut && textOut.length >= 20) return textOut;
    }
  }
  // 回退：取靠前的第一段长句（跳过联系方式/标题）
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const l = lines[i].trim();
    if (!l || isNoiseLine(l)) continue;
    if (HEADER_ANY_EN.test(l) || HEADER_ANY_ZH.test(l)) continue;
    const cleaned = stripTrailingSkillSegments(l);
    if (cleaned.length >= 40 && cleaned.length <= 300) return cleaned;
  }
  return undefined;
}

// 根据 JD 与工作经历生成一段简洁自我介绍（中/英）
function detectLangFromTextClient(text: string): 'zh' | 'en' {
  return /[\u4e00-\u9fff]/.test(text) ? 'zh' : 'en';
}

// 2-3 句的自我介绍（按 JD + 匹配经历），支持中英文
function generateSummaryFromJDClient(work: WorkItem[], jdText: string, lang: 'zh' | 'en'): string | undefined {
  if (!jdText || !work || work.length === 0) return undefined;

  const latestWork = work[0];
  const toNorm = (s: string) => s.trim().toLowerCase();
  const containsAny = (s: string, arr: string[]) => arr.some((h) => toNorm(s).includes(toNorm(h)));

  // 关键词类别线索（与上方过滤保持一致但更轻量）
  const SOFT_HINTS = ['communication','teamwork','collaboration','leadership','adaptability','problem','supportive','time management','attention to detail','interpersonal','stakeholder','客户服务','沟通','协作','领导','适应','细节'];
  const HARD_HINTS = ['sql','excel','word','powerpoint','outlook','python','javascript','typescript','java','c++','c#','node','react','vue','next.js','angular','aws','azure','gcp','linux','windows','macos','docker','kubernetes','git','crm','zendesk','salesforce','sap','tableau','power bi','notion','jira','asana','figma','canva','photoshop','illustrator','premiere','seo','sem','google analytics','ga4','social media','data entry','inventory','warehouse','logistics','pos'];
  const INDUSTRY_HINTS = ['retail','education','childcare','hospitality','finance','banking','manufacturing','supply chain','logistics','compliance standards','early learning framework','child safety standards','e-commerce','content strategy','web3','blockchain','smart contract'];
  const ROLE_NOUNS = ['assistant','specialist','manager','coordinator','analyst','educator','engineer','developer','designer','consultant','lead','officer','associate'];

  // 提取 JD 关键词并分类
  const jdKW = refineJdTermsClient(topTermsClient(jdText, 18, 10, 6));
  const isHard = (t: string) => {
    const s = toNorm(t);
    return containsAny(s, HARD_HINTS) || /\b(crm|sql|aws|gcp|sap|git|pos|excel|tableau|power bi)\b/.test(s) || /[+#\.]/.test(s);
  };
  const hard = jdKW.filter(isHard).slice(0, 8);
  const soft = jdKW.filter((t) => containsAny(t, SOFT_HINTS)).slice(0, 6);
  const ind = jdKW.filter((t) => containsAny(t, INDUSTRY_HINTS)).slice(0, 6);

  // 与简历重合以提升可信度
  const resumeConcat = work.map((w) => [w.role, w.company, ...(w.bullets || [])].filter(Boolean).join(' ')).join('\n');
  const resumeKW = refineJdTermsClient(topTermsClient(resumeConcat, 16, 8, 4));
  const setResume = new Set(resumeKW.map((s) => s.toLowerCase()));
  const pickOverlap = (arr: string[], keep: number) => {
    const ov = arr.filter((s) => setResume.has(s.toLowerCase()));
    return (ov.length >= Math.max(1, Math.floor(keep / 2)) ? ov : arr).slice(0, keep);
  };
  const hardList = Array.from(new Set(pickOverlap(hard, 4)));
  const softList = Array.from(new Set(pickOverlap(soft, 3)));
  const indList = Array.from(new Set(pickOverlap(ind, 3)));

  // 目标岗位：从 JD 词中推断，若缺失则用最近角色
  const targetRole = jdKW.find((k) => ROLE_NOUNS.some((r) => toNorm(k).includes(r))) || latestWork.role || undefined;
  const identityEn = latestWork.role ? latestWork.role : (targetRole || 'professional');
  const identityZh = latestWork.role ? latestWork.role : (targetRole || '专业人士');

  // 挑一条带数据的成绩
  const achievementBullet = work.flatMap((w) => w.bullets || []).find((b) => /\b\d{1,4}%|\b\d{1,4}\+?\b/.test(b) && b.length > 20);

  if (lang === 'zh') {
    const parts: string[] = [];
    parts.push(`一位${identityZh}${indList.length ? `（熟悉${indList.join('、')}）` : ''}`);
    if (hardList.length) parts.push(`熟练使用${hardList.join('、')}`);
    let line1 = parts.join('，') + '。';
    const line2 = softList.length ? `以${softList.join('、')}见长${achievementBullet ? `，曾通过「${achievementBullet}」取得显著成果` : ''}。` : (achievementBullet ? `过往曾通过「${achievementBullet}」取得显著成果。` : '');
    const line3 = `希望在${targetRole || identityZh}岗位发挥所长。`;
    const out = [line1, line2, line3].filter(Boolean).join(' ');
    return out.length > 40 ? out : undefined;
  } else {
    const line1 = `Highly motivated ${identityEn}${indList.length ? ` with experience in ${indList.join(', ')}` : ''}, proficient in ${hardList.join(', ')}.`;
    const line2 = softList.length ? `Known for ${softList.join(', ')}${achievementBullet ? ` and delivering "${achievementBullet}"` : ''}.` : (achievementBullet ? `Delivered "${achievementBullet}".` : '');
    const line3 = `Looking to apply these skills in a ${targetRole || identityEn} position.`;
    const out = [line1, line2, line3].filter(Boolean).join(' ');
    return out.length > 40 ? out : undefined;
  }
}

// 轻量词干 + 重合度（与后端一致）
function stemClient(word: string): string {
  let s = word.toLowerCase();
  if (s.length > 4) {
    if (s.endsWith("ing")) s = s.slice(0, -3);
    else if (s.endsWith("ed")) s = s.slice(0, -2);
    else if (s.endsWith("es")) s = s.slice(0, -2);
    else if (s.endsWith("s")) s = s.slice(0, -1);
  }
  return s;
}
function stemListClient(words: string[]): string[] { return words.map(stemClient); }
function normalizedOverlapClient(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const set = new Set(a);
  let hit = 0;
  for (const x of b) if (set.has(x)) hit++;
  return hit / Math.max(a.length, b.length);
}

// 前端基于 editedWork 的匹配计算：提升实时识别准确度
function computeMatchesClient(work: WorkItem[], jdText: string, jdKeywords?: string[]): { requirement: string; bullets: string[]; score: number }[] {
  const reqs = jdRequirementsFromTextClient(normalizeSpellingClient(jdText));
  if (reqs.length === 0) return [];
  const keywords = jdKeywords && jdKeywords.length ? jdKeywords : topTermsClient(jdText, 18, 10, 6);
  const bulletPool: { text: string; ctx: string }[] = [];
  for (const w of work) {
    const ctx = [w.role, w.company].filter(Boolean).join(" ");
    for (const b of (w?.bullets || [])) bulletPool.push({ text: b, ctx });
  }
  const reqTokensList = reqs.map((r) => canonicalizeTokensClient(stemListClient(tokenizeClient(normalizeSpellingClient(r)))));
  const reqBiList = reqTokensList.map((toks) => bigramsClient(toks));
  const out: { requirement: string; bullets: string[]; score: number }[] = [];
  for (let i = 0; i < reqs.length; i++) {
    const tokens = reqTokensList[i];
    const grams = reqBiList[i];
    const scored: { b: string; score: number }[] = [];
    for (const bp of bulletPool) {
      const bNorm = normalizeSpellingClient(`${bp.text} ${bp.ctx}`);
      const btRaw = tokenizeClient(bNorm);
      const btCanon = canonicalizeTokensClient(btRaw);
      const bt = stemListClient(btCanon);
      const bg = bigramsClient(bt);
      const ovTok = normalizedOverlapClient(tokens, bt);
      const jdKwTokens: string[] = [];
      for (const term of keywords) { for (const part of term.split(/[\s-]+/)) jdKwTokens.push(part); }
      const ovKw = normalizedOverlapClient(canonicalizeTokensClient(jdKwTokens), btCanon);
      const ovGram = normalizedOverlapClient(grams, bg);
      // 若要点文本包含规范概念 token（如 customer-service、order-processing），或包含其二元短语，则给予额外加权
      const conceptHit = tokens.some((t) => bNorm.includes(t));
      const phraseHit = grams.some((g) => bNorm.includes(g));
      const directBoost = (conceptHit ? 0.1 : 0) + (phraseHit ? 0.05 : 0);
      const score = Math.min(1, Math.max(ovTok, ovKw) * 0.6 + ovGram * 0.4 + directBoost);
      scored.push({ b: bp.text, score });
    }
    scored.sort((x, y) => y.score - x.score);
    const picked = scored.slice(0, 4).filter((s) => s.score >= 0.2).map((s) => s.b);
    const bestScore = scored.length ? Math.max(0, scored[0].score) : 0;
    out.push({ requirement: reqs[i], bullets: picked, score: +bestScore.toFixed(3) });
  }
  return out;
}

// 经验类别信息（用于概览展示）
const CATEGORY_INFO: Record<string, { zh: string; en: string; hints?: string[] }> = {
  "customer-service": { zh: "客户服务", en: "Customer Service", hints: ["barista", "cashier", "server", "front desk", "reception"] },
  "sales": { zh: "销售支持", en: "Sales Support", hints: ["leads", "enquiries", "quotes"] },
  "orders": { zh: "订单处理", en: "Order Processing", hints: ["create orders", "process orders"] },
  "quotes": { zh: "报价/询价", en: "Quotes & Enquiries" },
  "inventory": { zh: "库存/备货", en: "Inventory / Stock" },
  "communication": { zh: "沟通与协作", en: "Communication", hints: ["email", "phone", "calls"] },
  "admin": { zh: "行政/文书", en: "Administration" },
  "shopify": { zh: "Shopify 记录", en: "Shopify Records" },
  "monday": { zh: "Monday.com 管理", en: "Monday.com" },
  "reception": { zh: "前台/接待", en: "Reception" },
};

// 从文本中提取经验类别（基于规范化 token）
function extractCategoriesFromTextClient(text: string): string[] {
  const norm = normalizeSpellingClient(text || "").toLowerCase();
  const tokens = canonicalizeTokensClient(stemListClient(tokenizeClient(norm)));
  const set = new Set(tokens);
  const cats: string[] = [];
  for (const key of Object.keys(CATEGORY_INFO)) {
    // 直接命中规范化类别 token
    if (set.has(key)) { cats.push(key); continue; }
    // 使用 hints 同义词/短语进行召回（允许短语包含空格或连字符）
    const hints = CATEGORY_INFO[key]?.hints || [];
    const hit = hints.some((h) => {
      const hNorm = normalizeSpellingClient(h.toLowerCase());
      // 如果是单词/短语都可：在全文或 token 集中出现即认为命中
      return norm.includes(hNorm) || set.has(hNorm);
    });
    if (hit) cats.push(key);
  }
  return Array.from(new Set(cats));
}

type CoverageEvidence = { workIndex: number; role?: string; company?: string; bullet?: string; score: number };
type CoverageItem = { key: string; labelZh: string; labelEn: string; covered: boolean; evidence?: CoverageEvidence };

// 轻量重叠度计算（客户端复用）：用于 JD 关键词与上下文/要点的回退评分
function overlapClient(a: string[], b: string[]): number {
  if (!a || !b) return 0;
  const setB = new Set(b);
  let c = 0;
  for (const x of a) if (setB.has(x)) c++;
  return c;
}
function normalizedOverlap(a: string[], b: string[]): number {
  const nA = Array.isArray(a) ? a.length : 0;
  const nB = Array.isArray(b) ? b.length : 0;
  if (nA === 0 || nB === 0) return 0;
  const inter = overlapClient(a, b);
  return inter / Math.max(nA, nB);
}

// 计算覆盖摘要（按经验类别）：更符合“只看大概”的需求
  export function computeCoverageSummaryClient(work: WorkItem[], jdText: string): { items: CoverageItem[] } {
    const jdCats = extractCategoriesFromTextClient(jdText);
    const items: CoverageItem[] = [];
    if (jdCats.length === 0) return { items };

    for (const cat of jdCats) {
      let best: CoverageEvidence | undefined;
      for (let wi = 0; wi < work.length; wi++) {
        const w = work[wi];
        const ctx = normalizeSpellingClient([w.role, w.company].filter(Boolean).join(" "));
        const ctxTokens = canonicalizeTokensClient(stemListClient(tokenizeClient(ctx)));
        // 提升岗位/公司上下文的权重，使无要点的简历也能被识别
        const ctxHit = ctxTokens.includes(cat) ? 0.5 : 0;
        const hints = CATEGORY_INFO[cat]?.hints || [];
        const ctxHintHit = hints.some((h) => ctx.toLowerCase().includes(normalizeSpellingClient(h.toLowerCase()))) ? 0.2 : 0;

        // 要点评分：上下文 + 概念/短语命中 + hints
        const bullets = w?.bullets || [];
        for (const b of bullets) {
          const bn = normalizeSpellingClient(`${b} ${ctx}`);
          const bt = canonicalizeTokensClient(stemListClient(tokenizeClient(bn)));
          const grams = bigramsClient(bt);
          const conceptHit = bt.includes(cat) ? 0.5 : 0;
          const phraseHit = grams.some((g) => g.includes(cat)) ? 0.2 : 0;
          const hintHitBullet = hints.some((h) => bn.toLowerCase().includes(normalizeSpellingClient(h.toLowerCase()))) ? 0.2 : 0;
          const score = conceptHit + phraseHit + Math.max(ctxHit, 0.1) + Math.max(ctxHintHit, hintHitBullet);
          if (score > (best?.score ?? 0)) {
            best = { workIndex: wi, role: w.role, company: w.company, bullet: b, score };
          }
        }

        // 若没有要点，允许使用仅上下文的匹配作为证据
        if ((!bullets || bullets.length === 0) && (ctxHit + ctxHintHit) > (best?.score ?? 0)) {
          best = { workIndex: wi, role: w.role, company: w.company, bullet: undefined, score: ctxHit + ctxHintHit };
        }
      }
      const info = CATEGORY_INFO[cat];
      items.push({
        key: cat,
        labelZh: info?.zh || cat,
        labelEn: info?.en || cat,
        // 仅上下文命中时，设置较低阈值；要点命中使用原阈值
        covered: !!best && (best.bullet ? best.score >= 0.5 : best.score >= 0.3),
        evidence: best,
      });
    }
    return { items };
  }

  // 组合视图：从覆盖摘要中挑选“匹配经验”，不足时再补充若干“Additional Experience”
  export function combineExperienceForResumeClient(
    work: WorkItem[],
    summary: { items: CoverageItem[] },
    minPrimary = 2,
    addCount = 1,
    jdText: string = '',
  ): { primary: WorkItem[]; additional: WorkItem[] } {
    if (!work || work.length === 0) return { primary: [], additional: [] };
    const evidenceBestByWork = new Map<number, CoverageEvidence>();
    for (const it of (summary?.items || [])) {
      if (!it.covered || !it.evidence || typeof it.evidence.workIndex !== 'number') continue;
      const idx = it.evidence.workIndex;
      const prev = evidenceBestByWork.get(idx);
      if (!prev || (it.evidence.score > prev.score)) evidenceBestByWork.set(idx, it.evidence);
    }
    // 回退：若未检测到任何类别覆盖，则基于 JD 关键词/短语与简历要点/上下文的重叠来打分挑选
    if (evidenceBestByWork.size === 0) {
      const jdNorm = normalizeSpellingClient(jdText || '');
      const jdTokens = canonicalizeTokensClient(stemListClient(tokenizeClient(jdNorm)));
      const jdGrams = bigramsClient(jdTokens);
      for (let wi = 0; wi < work.length; wi++) {
        const w = work[wi];
        const ctx = normalizeSpellingClient([w.role, w.company].filter(Boolean).join(' '));
        const ctxTokens = canonicalizeTokensClient(stemListClient(tokenizeClient(ctx)));
        const ctxGrams = bigramsClient(ctxTokens);
        const ctxScore = Math.max(
          normalizedOverlap(jdTokens, ctxTokens) * 0.6,
          normalizedOverlap(jdGrams, ctxGrams) * 0.4,
        );
        let bestBullet: { text?: string; score: number } = { text: undefined, score: 0 };
        const bullets = w?.bullets || [];
        for (const b of bullets) {
          const bn = normalizeSpellingClient(`${b} ${ctx}`);
          const bt = canonicalizeTokensClient(stemListClient(tokenizeClient(bn)));
          const bg = bigramsClient(bt);
          const sTok = normalizedOverlap(jdTokens, bt);
          const sGram = normalizedOverlap(jdGrams, bg);
          const score = sTok * 0.6 + sGram * 0.4;
          if (score > bestBullet.score) bestBullet = { text: b, score };
        }
        const finalScore = Math.max(bestBullet.score, ctxScore);
        if (finalScore > 0) {
          evidenceBestByWork.set(wi, { workIndex: wi, role: w.role, company: w.company, bullet: bestBullet.text, score: +finalScore.toFixed(3) });
        }
      }
    }
    // 按得分排序，挑选前 minPrimary 个作为“匹配经验”
    const rankedEvidence: Array<[number, CoverageEvidence]> = Array
      .from(evidenceBestByWork.entries())
      .sort((a, b) => (b[1].score - a[1].score));
    let primaryIdx = rankedEvidence.map(([i]) => i).slice(0, Math.max(minPrimary, 0));
    let primary: WorkItem[] = primaryIdx.map((i) => {
      const w = work[i];
      const ev = evidenceBestByWork.get(i);
      if (ev?.bullet) {
        const merged = [ev.bullet, ...((w?.bullets || []).filter((b) => !!b && b !== ev.bullet))].slice(0, 3);
        return { ...w, bullets: merged };
      }
      return { ...w, bullets: (w?.bullets || []).slice(0, 3) };
    });
    // 回退机制：若未选出“匹配经验”，基于 JD 关键词与上下文/要点的重叠进行评分
    if (primary.length === 0 && (jdText || '').trim().length > 0) {
      const jdTerms = topTermsClient(jdText, 18, 10, 6);
      const jdNormTokens = canonicalizeTokensClient(stemListClient(tokenizeClient(normalizeSpellingClient(jdTerms.join(' ')))));
      const scoreByIndex: Array<[number, number]> = [];
      for (let i = 0; i < work.length; i++) {
        const w = work[i];
        const ctx = normalizeSpellingClient([w.role, w.company].filter(Boolean).join(' '));
        const ctxTokens = canonicalizeTokensClient(stemListClient(tokenizeClient(ctx)));
        const ctxOverlap = normalizedOverlap(ctxTokens, jdNormTokens);
        let bestBulletOverlap = 0;
        for (const b of (w?.bullets || [])) {
          const bt = canonicalizeTokensClient(stemListClient(tokenizeClient(normalizeSpellingClient(b))));
          const ov = normalizedOverlap(bt, jdNormTokens);
          if (ov > bestBulletOverlap) bestBulletOverlap = ov;
        }
        const score = (w?.bullets?.length ? (0.4 * ctxOverlap + 0.6 * bestBulletOverlap) : ctxOverlap);
        scoreByIndex.push([i, score]);
      }
      const rankedFallback = scoreByIndex.sort((a, b) => b[1] - a[1]);
      primaryIdx = rankedFallback
        .filter(([, s]) => s > 0)
        .map(([i]) => i)
        .slice(0, Math.max(minPrimary, 0));
      // 若回退评分仍全部为 0，则至少选择前两段非志愿者经历
      if (primaryIdx.length === 0) {
        const notVolunteer = work.map((w, i) => [i, isVolunteerFinal(w) ? 1 : 0] as [number, number])
          .sort((a, b) => a[1] - b[1] || a[0] - b[0])
          .map(([i]) => i)
          .slice(0, Math.max(minPrimary, 0));
        primaryIdx = notVolunteer;
      }
      primary = primaryIdx.map((i) => ({ ...work[i], bullets: (work[i]?.bullets || []).slice(0, 3) }));
    }
    // 其余中选取 addCount 个作为补充（优先非志愿者、靠前且要点较多）
    const restIdx = work.map((_, i) => i).filter((i) => !primaryIdx.includes(i));
    const restRanked = restIdx.sort((a, b) => {
      const aw = work[a];
      const bw = work[b];
      const av = isVolunteerFinal(aw) ? 1 : 0;
      const bv = isVolunteerFinal(bw) ? 1 : 0;
      // 非志愿者优先，其次要点数量多者优先，其次保留原顺序
      if (av !== bv) return av - bv;
      const ac = (aw?.bullets?.length || 0);
      const bc = (bw?.bullets?.length || 0);
      if (ac !== bc) return bc - ac;
      return a - b;
    });
    const additionalIdx = restRanked.slice(0, Math.max(addCount, 0));
    const additional: WorkItem[] = additionalIdx.map((i) => {
      const w = work[i];
      // 仅保留前 2-3 条要点，避免版面过长
      const keep = (w?.bullets || []).slice(0, 3);
      return { ...w, bullets: keep };
    });
    return { primary, additional };
  }

  // 兜底：当分析输入几乎为空时，构造最小可用的工作项与JD文本
  function ensureWorkAndJDFallback(baseWork: WorkItem[], rawText: string, jdRawText: string): { work: WorkItem[]; jdText: string } {
    let work = Array.isArray(baseWork) ? baseWork : [];
    let jdText = (jdRawText || '').trim();
    const cleanedResume = (rawText || '').trim();
    if (work.length === 0 && cleanedResume.length > 0) {
      try {
        const parsed = parseWorkExperienceClient(cleanedResume);
        if (parsed && parsed.length > 0) work = parsed;
      } catch {}
    }
    if (work.length === 0 && cleanedResume.length > 0) {
      const lines = cleanedResume.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const roleCand = lines.find(l => /manager|assistant|intern|coordinator|specialist|engineer|designer|consultant|lead|analyst|officer|support|service|marketing|sales/i.test(l)) || 'Experience';
      const companyCand = lines.find(l => /inc\.|ltd\.|llc|pty|company|studio|agency|group|corp\.|university|college|school/i.test(l)) || 'Organization';
      const bulletsCand = lines.slice(0, 3);
      work = [{ role: roleCand, company: companyCand, period: '', bullets: bulletsCand.length ? bulletsCand : [''] }];
    }
    if (!jdText || jdText.length === 0) {
      const terms = topTermsClient(cleanedResume || '', 18, 10, 6);
      jdText = terms.slice(0, 12).join(' ');
    }
    return { work, jdText };
  }

  // 按类别生成更自然的中英文缺口建议
  function suggestBulletsForCategory(key: string, lang: 'zh' | 'en'): string[] {
    const zh: Record<string, string[]> = {
      'customer-service': [
        '为到店/前台顾客提供服务，接单、收银、解答咨询并记录反馈。',
        '建立服务话术与处理流程，提升满意度与复购。',
      ],
      'orders': [
        '创建/处理订单：核对信息、录入系统、跟进发货与异常。',
        '维护订单台账，按日/周复盘订单准确率与时效。',
      ],
      'quotes': [
        '处理询价与报价：收集需求、计算价格、发送报价并跟进回复。',
        '维护报价模板与历史记录，提升响应速度与准确性。',
      ],
      'inventory': [
        '盘点与补货：统计库存、更新记录，并与采购/仓库协同。',
        '优化库位标签与摆放，提高拣货效率并减少缺货。',
      ],
      'communication': [
        '通过邮件/电话/当面沟通，记录事项并追踪进度。',
        '建立沟通模板与联系人清单，提升响应效率。',
      ],
      'admin': [
        '整理文件与数据，维护表格/系统记录的准确性。',
        '制定并执行标准流程与检查清单，降低差错率。',
      ],
      'shopify': [
        '在 Shopify 中维护订单与客户信息，检查付款与发货状态。',
        '配置商品与库存，配合活动上架与价格调整。',
      ],
      'monday': [
        '在 Monday.com 建任务板与状态流转，跟踪事项进度。',
        '制定提醒与复盘节奏，减少遗漏并提升协作效率。',
      ],
      'reception': [
        '接待来访、接听电话并安排预约，记录访客信息。',
        '管理前台物资与日常事务，保持环境整洁有序。',
      ],
      'sales': [
        '收集并跟进销售线索，理解客户需求并协调报价/订单。',
        '维护客户档案与沟通记录，支持合同与交付流程。',
      ],
    };
    const en: Record<string, string[]> = {
      'customer-service': [
        'Serve walk-in/front-desk customers: take orders, cashier, handle enquiries.',
        'Create service scripts/processes to raise satisfaction and retention.',
      ],
      'orders': [
        'Create/process orders: verify details, enter system, follow up shipping/issues.',
        'Maintain order ledger; review accuracy and lead time weekly.',
      ],
      'quotes': [
        'Handle enquiries & quotes: gather needs, calculate, send quotes and follow up.',
        'Maintain templates and history to improve speed and accuracy.',
      ],
      'inventory': [
        'Stocktake and replenishment; update records and coordinate with purchasing/warehouse.',
        'Optimize labels and layout to improve picking efficiency and reduce stockouts.',
      ],
      'communication': [
        'Communicate via email/phone/in-person; record items and track progress.',
        'Create templates and contact lists to improve response efficiency.',
      ],
      'admin': [
        'Organize files and data; keep spreadsheets/system records accurate.',
        'Define and run standard processes/checklists to reduce errors.',
      ],
      'shopify': [
        'Maintain orders and customer info in Shopify; check payment/shipping status.',
        'Configure products and inventory; support promotions and price updates.',
      ],
      'monday': [
        'Build boards and status flows in Monday.com; track tasks.',
        'Set reminders and review cadence to reduce misses and improve collaboration.',
      ],
      'reception': [
        'Greet visitors, answer calls, arrange appointments; record visitor details.',
        'Manage front-desk supplies and daily tasks; keep area tidy and orderly.',
      ],
      'sales': [
        'Collect and follow up leads; understand needs and coordinate quotes/orders.',
        'Maintain CRM notes; support contracts and delivery processes.',
      ],
    };
    const dict = lang === 'zh' ? zh : en;
    return dict[key] || (lang === 'zh'
      ? ['梳理职责与流程，补齐相关经验与记录。', '从小任务入手，形成稳定交付与复盘节奏。']
      : ['Clarify responsibilities/processes; add relevant experience and logs.', 'Start with small tasks and create stable delivery/review cadence.']);
  }
// 根据 JD 要求生成示例要点（按类别定制 + 结果导向）
function suggestBulletsFromRequirement(req: string, lang: 'zh' | 'en' = 'zh'): string[] {
  const text = req.toLowerCase();
  const terms = topTermsClient(req, 10, 6, 4); // 短语优先，提取可复用的 domain 词

  const hasAny = (arr: string[]) => arr.some((w) => text.includes(w));
  const joiner = lang === 'zh' ? '、' : ', ';
  const pick = (arr: string[], n: number) => arr.filter(Boolean).slice(0, n).join(joiner);

  const commonMetricsZh = "（如参与度、浏览量、点击率、转化率）";
  const commonMetricsEn = "(e.g., engagement, views, CTR, conversions)";
  const toolHints = terms.filter((t) => /(canva|cap ?cut|tiktok|instagram|reels|calendar|schedule|buffer|later|hootsuite|sprout)/i.test(t));
  const contentHints = terms.filter((t) => /(short[- ]?form|ugc|hooks?|copy|script|story|caption)/i.test(t));
  const platformHints = terms.filter((t) => /(social|media|brand|marketing|tiktok|instagram)/i.test(t));

  const A = pick([...toolHints, ...platformHints, ...contentHints], 3) || (lang === 'zh' ? "社媒平台/工具" : "social platforms/tools");
  const B = pick([...contentHints, ...platformHints], 2) || (lang === 'zh' ? "内容方法/品牌规范" : "content methods/brand guidelines");

  const bulletsSocial = lang === 'zh'
    ? [
        `研究 ${A} 的受众与趋势，迭代 hooks/主题，A/B 测试文案与封面，提升关键指标${commonMetricsZh}。`,
        `搭建内容日历与复盘流程，按周输出短视频/图文，总结可复用的选题与脚本模版。`,
        `根据数据洞察优化发布时间与话题标签，提升 watch time 与保存/分享率。`,
      ]
    : [
        `Research audiences and trends on ${A}; iterate hooks/themes; A/B test copy/covers to improve key metrics ${commonMetricsEn}.`,
        `Build a content calendar and review cadence; ship weekly short videos/posts; capture reusable topics and script templates.`,
        `Optimize posting time and hashtags from insights to lift watch time and saves/shares.`,
      ];

  const bulletsMarketing = lang === 'zh'
    ? [
        `把市场/传播知识应用到活动规划与内容定位，明确受众画像与价值主张。`,
        `与品牌/创意/运营协作，制定 tone & messaging，统一视觉与文案风格。`,
        `输出活动复盘：目标→策略→产出→数据表现→经验，沉淀可复用方法库。`,
      ]
    : [
        `Apply marketing/communications to campaign planning and positioning; clarify audience persona and value proposition.`,
        `Collaborate with brand/creative/ops to define tone & messaging; keep visuals and copy consistent.`,
        `Produce campaign retrospectives: goals → strategy → outputs → performance → learnings; build reusable playbooks.`,
      ];

  const bulletsTools = lang === 'zh'
    ? [
        `使用 ${A} 快速产出素材（模板/剪辑/字幕），建立素材库并规范命名。`,
        `用排程平台管理多账号内容日历，设置发布/提醒/复盘流程，降低遗漏率。`,
        `优化制作流程（脚本→拍摄→剪辑→发布），把平均制作周期缩短。`,
      ]
    : [
        `Use ${A} to quickly produce assets (templates/edits/captions); build an asset library with naming conventions.`,
        `Manage multi-account content schedules with publishing tools; set publish/reminder/review cadence to reduce misses.`,
        `Optimize the production flow (script → shoot → edit → publish) to shorten average cycle time.`,
      ];

  const bulletsWriting = lang === 'zh'
    ? [
        `编写高转化脚本与文案：强开头钩子、清晰结构、明确 CTA，提升点击与转化。`,
        `为不同平台调整语气与篇幅（TikTok/Instagram），保持风格一致性。`,
        `与团队沟通需求与反馈，迭代文案版本并记录测试结果。`,
      ]
    : [
        `Write high-converting scripts and copy: strong hook, clear structure, explicit CTA; improve clicks and conversions.`,
        `Adapt voice and length for different platforms (TikTok/Instagram) while keeping style consistent.`,
        `Communicate needs and feedback; iterate copy versions and track test results.`,
      ];

  const bulletsMultiAccounts = lang === 'zh'
    ? [
        `同时管理多客户/账号的内容日历，建立优先级与提醒机制，保证按时交付。`,
        `标准化素材与脚本模版，减少重复劳动，提高协作效率。`,
        `每周复盘各账号表现，提出改进计划并落地到下周排期。`,
      ]
    : [
        `Manage content calendars for multiple clients/accounts; set priorities and reminders to deliver on time.`,
        `Standardize asset and script templates to reduce rework and improve collaboration.`,
        `Run weekly reviews across accounts; propose improvements and land them in next week’s schedule.`,
      ];

  const bulletsBrandDetail = lang === 'zh'
    ? [
        `维护品牌指南（logo/色彩/排版/语气），上线前做 QA 检查，确保一致性与合规。`,
        `建立审校清单（拼写/版权/素材合法性），降低发布风险。`,
        `针对不同渠道做适配（比例/文案长度/音轨版权），提升整体质感与连贯性。`,
      ]
    : [
        `Maintain brand guidelines (logo/colors/typography/voice); perform pre-release QA to ensure consistency and compliance.`,
        `Create proofreading checklists (spelling/copyright/asset legality) to reduce publishing risk.`,
        `Adapt content by channel (ratio/copy length/music rights) to improve quality and coherence.`,
      ];

  const bulletsQualification = lang === 'zh'
    ? [
        `把所学理论用于真实项目：从调研到落地，输出可验证的成果与数据。`,
        `参与实习/项目制工作，积累作品集（视频/海报/活动复盘）。`,
        `撰写项目报告与复盘，形成方法清单与个人知识库。`,
      ]
    : [
        `Apply theory in real projects from research to execution; deliver measurable results and data.`,
        `Join internships/project-based work; build a portfolio (videos/posters/campaign reviews).`,
        `Write project reports and retrospectives; build method lists and a personal knowledge base.`,
      ];

  const bulletsFastCreative = lang === 'zh'
    ? [
        `在快节奏环境下每周产出 3–5 条短视频/图文，保持稳定质量。`,
        `快速响应热点，按“点子→脚本→拍摄→剪辑→发布”闭环迭代。`,
        `组织创意工作坊/头脑风暴，沉淀选题与脚本库供团队复用。`,
      ]
    : [
        `Produce 3–5 short videos/posts weekly in a fast-paced environment while keeping quality stable.`,
        `Respond quickly to trends; iterate “idea → script → shoot → edit → publish”.`,
        `Run creative workshops/brainstorms; build topic and script libraries for team reuse.`,
      ];

  // 分类命中规则
  const isSocial = hasAny(["social", "trending", "works on social", "why"]);
  const isMarketing = hasAny(["marketing", "comms", "media", "background"]);
  const isTools = hasAny(["canva", "capcut", "scheduling", "calendar", "platforms"]);
  const isWriting = hasAny(["writing", "communication", "copy", "script", "story"]);
  const isMulti = hasAny(["multiple", "accounts", "deadlines", "juggle"]);
  const isBrand = hasAny(["brand", "consistency", "compliance", "detail", "sharp eye"]);
  const isQual = hasAny(["tertiary", "qualification", "degree", "diploma"]);
  const isFast = hasAny(["fast-paced", "creative", "fun", "thrives"]);

  if (isTools) return bulletsTools.slice(0, 3);
  if (isWriting) return bulletsWriting.slice(0, 3);
  if (isMulti) return bulletsMultiAccounts.slice(0, 3);
  if (isBrand) return bulletsBrandDetail.slice(0, 3);
  if (isMarketing) return bulletsMarketing.slice(0, 3);
  if (isQual) return bulletsQualification.slice(0, 3);
  if (isFast) return bulletsFastCreative.slice(0, 3);
  if (isSocial) return bulletsSocial.slice(0, 3);

  // 兜底：按提取的短语/词生成两条通用但不重复的建议
  const a = pick(terms.slice(0, 4), 3) || (lang === 'zh' ? "关键短语" : "key phrases");
  const b = pick(terms.slice(3, 8), 2) || (lang === 'zh' ? "方法/平台" : "methods/platforms");
  return lang === 'zh'
    ? [
        `围绕 ${a} 搭建内容方案与测试计划，按周复盘，提升核心指标${commonMetricsZh}。`,
        `与相关团队协作，应用 ${b} 解决具体问题，形成可复用的模版与流程。`,
      ]
    : [
        `Build content plans and testing around ${a}; review weekly to improve key metrics ${commonMetricsEn}.`,
        `Collaborate with teams to apply ${b} to solve concrete problems; create reusable templates and processes.`,
      ];
}

// 前端兜底：从 JD 文本中提取要求行（增强中文标点与符号识别）
function jdRequirementsFromTextClient(text?: string | null): string[] {
  if (!text) return [];
  // 过滤掉文化宣传/价值观等非行动性句子（中英双语）
  const CULTURE_PATTERNS = [
    /(inclusive|supportive|rewarding|great\s+place|we\s+value|celebrate|culture|fun\s+culture|company\s+values|diverse|belonging)/i,
    /(价值观|使命|愿景|文化|包容|多元|归属|支持性|奖励|氛围|庆祝|成长机会|发展机会|幸福感|工作环境|福利|团队氛围)/,
    /(largest|fastest[- ]?growing|industry[- ]?leading)\s+(company|business|transport|courier|taxi)/i,
  ];
  const ACTION_WORDS = /(负责|搭建|制定|管理|优化|推进|执行|监控|分析|协作|设计|开发|测试|维护|运营|跟进|对接|落地|产出|输出|研究|调研|策划|监督|组织|编写|撰写|安排|协调|提升|确保|参与|改进|跟踪|汇报|prepare|manage|lead|build|design|develop|implement|execute|monitor|analyze|coordinate|plan|schedule|deliver|maintain|support|improve|ensure|participate|track|report|handle|assist|respond|address|serve)/i;
  const BULLET_PREFIX = /^\s*(?:[-*•·▪◦●—–]|(?:\d+)[.)])\s*/;
  const HEAD_HINT = /(职责|要求|岗位|职位|描述|关键|任务|目标|responsibilit|requirement|duty|expectation|must|need|you\s+will|you'?ll|we\s+expect)/i;

  // 规范化符号：将类项目符号转换为换行，提高召回
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

  // 若未识别到行，改用中英文句号/分号切分
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

function overlapCount(a: string[], b: string[]): number {
  const set = new Set(a);
  let c = 0; for (const w of b) if (set.has(w)) c++;
  return c;
}

export default function Home() {
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [langLocked, setLangLocked] = useState<boolean>(false);
  // 移除语言设置的localStorage逻辑，每次都使用默认中文
  const [resumeInput, setResumeInput] = useState("");
  const [jdInput, setJdInput] = useState("");
  const [jdBulletCount, setJdBulletCount] = useState<number>(5);
  const [pageCount, setPageCount] = useState<number>(2);
  const [pageWorkCounts, setPageWorkCounts] = useState<[number, number, number]>([3, 2, 2]);
  const [pageBulletCaps, setPageBulletCaps] = useState<[number, number, number]>([5, 3, 2]);
  // 严格排版预设：按固定方案控制每页经验数量与要点上限
  const [strictLayoutPreset, setStrictLayoutPreset] = useState<boolean>(true);
  const [exportFont, setExportFont] = useState<'Arial' | 'Calibri' | 'Helvetica'>('Arial');
  
  const [exportMarginPx, setExportMarginPx] = useState<number>(72);
  const [exportLine, setExportLine] = useState<number>(1.15);
  const [autoAlignPageCounts, setAutoAlignPageCounts] = useState<boolean>(true);
const [selectedWork, setSelectedWork] = useState<boolean[]>([]);
const [forceJDOverride, setForceJDOverride] = useState(false);
const [autoSelectedPrimaryOnce, setAutoSelectedPrimaryOnce] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docxInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  // 控制“简历原文”粘贴区显隐（默认隐藏，保持干净布局）
  const [showResumeInput, setShowResumeInput] = useState(false);
  // 多简历支持：文件列表与批量结果状态
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [batchResults, setBatchResults] = useState<Record<string, any>>({});
  const [batchStatus, setBatchStatus] = useState<Record<string, 'pending' | 'in_progress' | 'done' | 'error'>>({});
  // 导出调试日志（点击“下载 PDF”后会逐步更新）
  const [exportLogs, setExportLogs] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  // OCR 回退状态
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  // OCR 配置：语言与页数；PDF 预览 URL
  const [ocrLangPref, setOcrLangPref] = useState<'auto'|'eng'|'chi_sim'>('auto');
  const [ocrPages, setOcrPages] = useState<number>(6);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<{
    text?: string;
    contact?: { name?: string; email?: string; phone?: string };
    workExperience?: WorkItem[];
    keywords?: string[];
    jd?: string;
    jdKeywords?: string[];
    jdTechSkills?: string[];
    jdBaseSkills?: string[];
    jdMatchedSkills?: string[];
    highlightTerms?: string[];
    techSkills?: string[];
    baseSkills?: string[];
    matches?: { requirement: string; bullets: string[]; score?: number }[];
    reqCoveragePct?: number;
  } | null>(null);

  // 当 JD 文本变更时，清空旧的 JD 相关解析与匹配，避免沿用历史结果
  useEffect(() => {
    setExtracted((prev) => {
      if (!prev) return prev;
      const hasOldJD = (!!prev.jd && prev.jd.length > 0) || (!!prev.jdKeywords && prev.jdKeywords.length > 0) || (!!prev.matches && prev.matches.length > 0);
      if (!hasOldJD) return prev;
      return {
        ...prev,
        jd: undefined,
        jdKeywords: [],
        jdTechSkills: [],
        jdBaseSkills: [],
        jdMatchedSkills: [],
        matches: [],
        reqCoveragePct: undefined,
      };
    });
    setSelectedWork([]);
    setAutoSelectedPrimaryOnce(false);
  }, [jdInput])


  // 为了快速恢复页面结构，这里以空对象作为初始值；后续可接入真实解析逻辑
  const generated: GeneratedResume | null = useMemo(() => {
    const keywords = extracted?.keywords ?? [];
    return {
      contactName: extracted?.contact?.name,
      contactEmail: extracted?.contact?.email,
      contactPhone: extracted?.contact?.phone,
      summary: undefined,
      techSkills: extracted?.techSkills ?? keywords,
      baseSkills: extracted?.baseSkills ?? [],
      jdSkills: extracted?.jdKeywords ?? [],
      jdTechSkills: extracted?.jdTechSkills ?? [],
      jdBaseSkills: extracted?.jdBaseSkills ?? [],
      jdMatchedSkills: extracted?.jdMatchedSkills ?? [],
      highlightTerms: extracted?.highlightTerms ?? keywords,
      matches: extracted?.matches ?? [],
      reqCoveragePct: extracted?.reqCoveragePct,
      workExperience: extracted?.workExperience ?? [],
    };
  }, [extracted]);

  const toggleWork = (i: number) => {
    setAutoSelectedPrimaryOnce(true);
    setSelectedWork((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  };

  // 在浏览器端对 PDF 做 OCR（用于扫描件/无文本层）
  const ocrPdfInBrowser = async (file: File, maxPages = 5, langsOverride?: string): Promise<string> => {
    if (typeof window === 'undefined') throw new Error('OCR only available in browser');
    const buf = new Uint8Array(await file.arrayBuffer());
    let doc: any;
    let pdfjs: any;
    // 优先使用 legacy 构建并彻底禁用 worker；若失败再回退到 ESM 构建
    try {
      // 首选使用 legacy 构建并禁用 worker（避免外部 CDN 依赖导致失败）
      pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      try { if (pdfjs?.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.394/build/pdf.worker.min.mjs' as any; } catch {}
      const loadingTask1 = pdfjs.getDocument({ data: buf, isEvalSupported: false });
      doc = await loadingTask1.promise;
    } catch (e1) {
      // 回退到 ESM 构建，再次禁用 worker
      try {
        // 使用正式的 mjs 入口，避免类型与路径不匹配
        pdfjs = await import('pdfjs-dist/build/pdf.mjs');
        try { if (pdfjs?.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.394/build/pdf.worker.min.mjs' as any; } catch {}
        const loadingTask2 = pdfjs.getDocument({ data: buf, isEvalSupported: false });
        doc = await loadingTask2.promise;
      } catch (e2) {
        // 若以 ArrayBuffer 加载失败，尝试以 URL 加载（部分环境对数据方式有限制）
        try {
          const tempUrl = URL.createObjectURL(file);
          try {
            pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
            try { if (pdfjs?.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.394/build/pdf.worker.min.mjs' as any; } catch {}
            const lt3 = pdfjs.getDocument({ url: tempUrl, isEvalSupported: false });
            doc = await lt3.promise;
          } catch (e3) {
            try {
              pdfjs = await import('pdfjs-dist/build/pdf.mjs');
              try { if (pdfjs?.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.394/build/pdf.worker.min.mjs' as any; } catch {}
              const lt4 = pdfjs.getDocument({ url: tempUrl, isEvalSupported: false });
              doc = await lt4.promise;
            } catch (e4) {
              throw e1;
            }
          } finally {
            try { URL.revokeObjectURL(tempUrl); } catch {}
          }
        } catch {
          throw e1;
        }
      }
    }
    const pages = Math.min(doc.numPages, Math.max(1, maxPages));
    const Tmod: any = await import('tesseract.js');
    const createWorker = (Tmod?.createWorker || Tmod?.default?.createWorker);
    if (typeof createWorker !== 'function') {
      try { await doc.destroy(); } catch {}
      throw new Error('OCR engine unavailable in browser');
    }
    const hasHan = /[\p{Script=Han}]/u.test((resumeInput || '')) || /[\p{Script=Han}]/u.test((jdInput || ''));
    const primaryLangs = langsOverride || (hasHan ? 'eng+chi_sim' : 'eng');
    // 注意：不要把函数（logger）作为参数传入 worker，否则会触发 DataCloneError。
    // 显式设置 worker/core CDN，避免在 Next/Turbopack 下相对路径加载失败。
    const worker = await createWorker({
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0/tesseract-core.wasm',
    });
    (worker as any).params = { ...(worker as any).params, langPath: 'https://tessdata.projectnaptha.com/4.0.0' };
    const langPaths = [
      'https://tessdata.projectnaptha.com/4.0.0',
      'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0',
      'https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0'
    ];
    let outText = '';
    // 尝试加载主语言，失败则在不同 langPath 上重试，再回退英文
    let initialized = false;
    for (let i = 0; i < langPaths.length && !initialized; i++) {
      try {
        // 切换语言数据源路径
        (worker as any).params = { ...(worker as any).params, langPath: langPaths[i] };
        await worker.loadLanguage(primaryLangs);
        await worker.initialize(primaryLangs);
        initialized = true;
      } catch {
        // ignore and try next path
      }
    }
    if (!initialized) {
      for (let i = 0; i < langPaths.length && !initialized; i++) {
        try {
          (worker as any).params = { ...(worker as any).params, langPath: langPaths[i] };
          await worker.loadLanguage('eng');
          await worker.initialize('eng');
          initialized = true;
        } catch {
          // continue
        }
      }
    }
    if (!initialized) throw new Error('OCR engine not initialized');
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 2.4 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not available');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/png');
      const res: any = await worker.recognize(dataUrl);
      outText += (res?.data?.text || '') + '\n';
      try { setOcrProgress(Math.round((p / pages) * 100)); } catch {}
    }
    try { await worker.terminate(); } catch {}
    try { await doc.destroy(); } catch {}
    return outText.trim();
  };

  // 服务端 OCR：通过 /api/ocr 使用 pdfjs + tesseract.js 识别
  const ocrPdfOnServer = async (file: File, maxPages = 6, langsOverride?: string): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('pages', String(Math.max(1, Math.min(10, maxPages || 6))));
    fd.append('lang', (langsOverride || ocrLangPref || 'auto') as any);
    const res = await fetch('/api/ocr', { method: 'POST', body: fd });
    if (!res.ok) {
      let msg = '';
      try { const j = await res.json(); msg = j?.error || ''; } catch {}
      throw new Error(msg || (lang === 'zh' ? '服务端 OCR 失败' : 'Server OCR failed'));
    }
    const data = await res.json();
    const text = (data?.text as string) || '';
    return text;
  };

  // 服务端“直接提取文本层”：针对非扫描件，优先提取 PDF 原生文本
  const extractPdfTextOnServer = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('format', 'txt');
    const res = await fetch('/api/convert', { method: 'POST', body: fd });
    if (!res.ok) return '';
    try {
      const txt = await res.text();
      return (txt || '').trim();
    } catch { return ''; }
  };

  const tryOCRForCurrentFile = async () => {
    if (!uploadedFile || !uploadedFile.name.toLowerCase().endsWith('.pdf')) {
      setError(lang === 'zh' ? '请先选择 PDF 文件' : 'Please choose a PDF first');
      setShowResumeInput(true);
      return;
    }
    setOcrRunning(true);
    setOcrProgress(0);
    try {
      const langs = (ocrLangPref === 'auto') ? undefined : ocrLangPref;
      const pages = Math.max(1, Math.min(10, ocrPages || 6));
      // 1) 先尝试“非 OCR”的文本层提取：对可复制文字的 PDF 更准确
      let text = await extractPdfTextOnServer(uploadedFile);
      if (!text || text.trim().length < 50) {
        // 2) 若文本层不足，改用服务端 OCR（图片/扫描件）
        try {
          text = await ocrPdfOnServer(uploadedFile, pages, langs);
        } catch (e) {
          // 暂不回退到浏览器端 OCR，以避免前端 Worker 在某些环境下初始化异常。
          // 用户可改用 “PDF 转 TXT/Word” 按钮或粘贴文本。
          throw e;
        }
      }
      if (!text || text.trim().length < 10) throw new Error(lang === 'zh' ? 'OCR 未识别到有效文本' : 'OCR did not extract usable text');
      setResumeInput(text);
      setShowResumeInput(true);
      setError(lang === 'zh' ? '已识别并填充文本（自动在文本层与 OCR 间切换）。' : 'Extracted text (auto-selected between text layer and OCR).');
    } catch (e: any) {
      setError(e?.message || (lang === 'zh' ? 'OCR 识别失败，请尝试粘贴文本或上传 docx/txt' : 'OCR failed; please paste text or upload DOCX/TXT'));
      setShowResumeInput(true);
    } finally {
      setOcrRunning(false);
    }
  };

  const [showPreview, setShowPreview] = useState(false);
  // 预览中“下载 Word”选项面板，仅在用户点击“下载 Word”时显示
  const [showDocxOptions, setShowDocxOptions] = useState(false);
  const [editInPreview, setEditInPreview] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<'classic'|'modern'|'compact'>('compact');
  const [selectedColor, setSelectedColor] = useState<'blue'|'indigo'|'teal'|'rose'|'purple'|'amber'|'emerald'|'pink'|'slate'|'gray'>('indigo');
  // 预览：是否单独显示志愿者经历分栏
  const [separateVolunteerPreview, setSeparateVolunteerPreview] = useState(false);
  // 预览：是否将志愿者并入“补充经验”
  const [mergeVolunteerIntoAdditional, setMergeVolunteerIntoAdditional] = useState(false);
  // References section state
  const [referenceName, setReferenceName] = useState<string>('');
  const [referencePhone, setReferencePhone] = useState<string>('');
  const [referenceEmail, setReferenceEmail] = useState<string>('');
  const [referenceCompany, setReferenceCompany] = useState<string>('');
  const [referenceRelationship, setReferenceRelationship] = useState<string>('');
  // 统一颜色样式映射
  const accentPillClass = (color: 'blue'|'indigo'|'teal'|'rose'|'purple'|'amber'|'emerald'|'pink'|'slate'|'gray') => ({
    blue: 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-100 dark:border-blue-400',
    indigo: 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-100 dark:border-indigo-400',
    teal: 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/20 dark:text-teal-100 dark:border-teal-400',
    rose: 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/20 dark:text-rose-100 dark:border-rose-400',
    purple: 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-100 dark:border-purple-400',
    amber: 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-100 dark:border-amber-400',
    emerald: 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-100 dark:border-emerald-400',
    pink: 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-500/20 dark:text-pink-100 dark:border-pink-400',
    slate: 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-500/20 dark:text-slate-100 dark:border-slate-400',
    gray: 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-500/20 dark:text-gray-100 dark:border-gray-400',
  })[color];
  const accentSolidClass = (color: 'blue'|'indigo'|'teal'|'rose'|'purple'|'amber'|'emerald'|'pink'|'slate'|'gray') => ({
    blue: 'rounded-md px-2 py-1 text-xs bg-blue-600 text-white',
    indigo: 'rounded-md px-2 py-1 text-xs bg-indigo-600 text-white',
    teal: 'rounded-md px-2 py-1 text-xs bg-teal-600 text-white',
    rose: 'rounded-md px-2 py-1 text-xs bg-rose-600 text-white',
    purple: 'rounded-md px-2 py-1 text-xs bg-purple-600 text-white',
    amber: 'rounded-md px-2 py-1 text-xs bg-amber-500 text-white',
    emerald: 'rounded-md px-2 py-1 text-xs bg-emerald-600 text-white',
    pink: 'rounded-md px-2 py-1 text-xs bg-pink-600 text-white',
    slate: 'rounded-md px-2 py-1 text-xs bg-slate-600 text-white',
    gray: 'rounded-md px-2 py-1 text-xs bg-gray-600 text-white',
  })[color];
  const accentSolidLgClass = (color: 'blue'|'indigo'|'teal'|'rose'|'purple'|'amber'|'emerald'|'pink'|'slate'|'gray') => ({
    blue: 'rounded-md px-3 py-1.5 text-sm bg-blue-600 text-white',
    indigo: 'rounded-md px-3 py-1.5 text-sm bg-indigo-600 text-white',
    teal: 'rounded-md px-3 py-1.5 text-sm bg-teal-600 text-white',
    rose: 'rounded-md px-3 py-1.5 text-sm bg-rose-600 text-white',
    purple: 'rounded-md px-3 py-1.5 text-sm bg-purple-600 text-white',
    amber: 'rounded-md px-3 py-1.5 text-sm bg-amber-500 text-white',
    emerald: 'rounded-md px-3 py-1.5 text-sm bg-emerald-600 text-white',
    pink: 'rounded-md px-3 py-1.5 text-sm bg-pink-600 text-white',
    slate: 'rounded-md px-3 py-1.5 text-sm bg-slate-600 text-white',
    gray: 'rounded-md px-3 py-1.5 text-sm bg-gray-600 text-white',
  })[color];
  const accentGradientClass = (color: 'blue'|'indigo'|'teal'|'rose'|'purple'|'amber'|'emerald'|'pink'|'slate'|'gray') => ({
    blue: 'bg-gradient-to-r from-blue-600 to-blue-600',
    indigo: 'bg-gradient-to-r from-indigo-600 to-indigo-600',
    teal: 'bg-gradient-to-r from-teal-600 to-teal-600',
    rose: 'bg-gradient-to-r from-rose-600 to-rose-600',
    purple: 'bg-gradient-to-r from-purple-600 to-purple-600',
    amber: 'bg-gradient-to-r from-amber-500 to-amber-500',
    emerald: 'bg-gradient-to-r from-emerald-600 to-emerald-600',
    pink: 'bg-gradient-to-r from-pink-600 to-pink-600',
    slate: 'bg-gradient-to-r from-slate-600 to-slate-600',
    gray: 'bg-gradient-to-r from-gray-600 to-gray-600',
  })[color];
  const accentSoftBgClass = (color: 'blue'|'indigo'|'teal'|'rose'|'purple'|'amber'|'emerald'|'pink'|'slate'|'gray') => ({
    blue: 'space-y-8 font-sans tracking-wide bg-blue-50/40 rounded-lg p-4',
    indigo: 'space-y-8 font-sans tracking-wide bg-indigo-50/40 rounded-lg p-4',
    teal: 'space-y-8 font-sans tracking-wide bg-teal-50/40 rounded-lg p-4',
    rose: 'space-y-8 font-sans tracking-wide bg-rose-50/40 rounded-lg p-4',
    purple: 'space-y-8 font-sans tracking-wide bg-purple-50/40 rounded-lg p-4',
    amber: 'space-y-8 font-sans tracking-wide bg-amber-50/40 rounded-lg p-4',
    emerald: 'space-y-8 font-sans tracking-wide bg-emerald-50/40 rounded-lg p-4',
    pink: 'space-y-8 font-sans tracking-wide bg-pink-50/40 rounded-lg p-4',
    slate: 'space-y-8 font-sans tracking-wide bg-slate-50/40 rounded-lg p-4',
    gray: 'space-y-8 font-sans tracking-wide bg-gray-50/40 rounded-lg p-4',
  })[color];
  const accentSoftLgClass = (color: 'blue'|'indigo'|'teal'|'rose'|'purple'|'amber'|'emerald'|'pink'|'slate'|'gray') => ({
    blue: 'rounded-md px-3 py-1.5 text-sm bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-500/20 dark:text-blue-100 dark:border-blue-400',
    indigo: 'rounded-md px-3 py-1.5 text-sm bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-100 dark:border-indigo-400',
    teal: 'rounded-md px-3 py-1.5 text-sm bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 dark:bg-teal-500/20 dark:text-teal-100 dark:border-teal-400',
    rose: 'rounded-md px-3 py-1.5 text-sm bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 dark:bg-rose-500/20 dark:text-rose-100 dark:border-rose-400',
    purple: 'rounded-md px-3 py-1.5 text-sm bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 dark:bg-purple-500/20 dark:text-purple-100 dark:border-purple-400',
    amber: 'rounded-md px-3 py-1.5 text-sm bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-500/20 dark:text-amber-100 dark:border-amber-400',
    emerald: 'rounded-md px-3 py-1.5 text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-100 dark:border-emerald-400',
    pink: 'rounded-md px-3 py-1.5 text-sm bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100 dark:bg-pink-500/20 dark:text-pink-100 dark:border-pink-400',
    slate: 'rounded-md px-3 py-1.5 text-sm bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 dark:bg-slate-500/20 dark:text-slate-100 dark:border-slate-400',
    gray: 'rounded-md px-3 py-1.5 text-sm bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 dark:bg-gray-500/20 dark:text-gray-100 dark:border-gray-400',
  })[color];
  // 调暗 Word 导出的分节条填充色，接近图二色调（Tailwind ~300）
  const docxAccentFill = (color: 'blue'|'indigo'|'teal'|'rose'|'purple'|'amber'|'emerald'|'pink'|'slate'|'gray') => ({
    blue: '93C5FD',     // blue-300
    indigo: 'A5B4FC',   // indigo-300
    teal: 'A7F3D0',     // teal-200
    rose: 'FCA5A5',     // rose-300
    purple: 'C4B5FD',   // purple-300
    amber: 'FCD34D',    // amber-300
    emerald: '6EE7B7',  // emerald-300
    pink: 'F9A8D4',     // pink-300
    slate: 'CBD5E1',    // slate-300
    gray: 'D1D5DB',     // gray-300
  })[color];
  const [previewZoom, setPreviewZoom] = useState(1);
  const [includeVolunteerQuick, setIncludeVolunteerQuick] = useState(false);
  const [quickCategoryKey, setQuickCategoryKey] = useState<string | undefined>(undefined);

  // 预览模态：支持 Esc 关闭
  useEffect(() => {
    if (!showPreview) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPreview(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showPreview]);
  // 预览开启时自动识别并填充缺失项
  useEffect(() => {
    if (!showPreview) return;
    const resume = (resumeInput || '').trim();
    if (resume && (!educationEdit || educationEdit.length === 0)) {
      const edu = extractEducationClient(resume);
      if (edu && edu.length > 0) setEducationEdit(edu);
    }
    if ((!techSkillsEdit || techSkillsEdit.length === 0) && (generated?.techSkills?.length || 0) > 0) {
      setTechSkillsEdit(generated!.techSkills);
    }
    if ((!baseSkillsEdit || baseSkillsEdit.length === 0) && (generated?.baseSkills?.length || 0) > 0) {
      setBaseSkillsEdit(generated!.baseSkills);
    }
    // 预览开启时，若基本信息为空则尝试从简历文本自动识别并填充（不覆盖已填写）
    try {
      const text = (resumeInput || '').trim();
      if (text) {
        const info = extractContactInfoClient(text);
        const extras = extractContactExtrasClient(text);
        if (!contactNameEdit && info?.name) setContactNameEdit(info.name);
        if (!contactEmailEdit && info?.email) setContactEmailEdit(info.email);
        if (!contactPhoneEdit && info?.phone) setContactPhoneEdit(info.phone);
        if (!contactAddressEdit && extras?.address) setContactAddressEdit(extras.address);
        if (!contactWebsiteEdit && extras?.website) setContactWebsiteEdit(extras.website);
      }
    } catch {}
    // 预览开启时，若尚未选择经历，则按 primary + additional 默认勾选（仅首次）
    try {
      // 若选择数组长度与经历不匹配，先对齐长度以保留已有选择
      if (selectedWork && selectedWork.length !== editedWork.length) {
        if (editedWork.length > selectedWork.length) {
          setSelectedWork([...selectedWork, ...new Array(editedWork.length - selectedWork.length).fill(false)]);
        } else {
          setSelectedWork(selectedWork.slice(0, editedWork.length));
        }
      }
      const needDefaultSelect = !selectedWork || !selectedWork.some(Boolean);
      const jdTextUsed = (jdInput || '').trim();
      if (!autoSelectedPrimaryOnce && needDefaultSelect && editedWork.length > 0 && jdTextUsed.length > 0) {
        const summaryLocal = computeCoverageSummaryClient(editedWork, jdTextUsed);
        const combinedLocal = combineExperienceForResumeClient(editedWork, summaryLocal, 2, 1, jdTextUsed);
        const toIndex = (w: WorkItem) => editedWork.findIndex((y) => (
          y === w || (y.id && w.id && y.id === w.id) || (
            (y.role || '') === (w.role || '') &&
            (y.company || '') === (w.company || '') &&
            (y.period || '') === (w.period || '')
          )
        ));
        // 预览首次开启时，默认仅选中“匹配经验”（不自动包含补充）
        const chosenIdx = (combinedLocal.primary || []).map(toIndex).filter((i) => i >= 0);
        setSelectedWork(editedWork.map((_, i) => chosenIdx.includes(i)));
        setAutoSelectedPrimaryOnce(true);
      }
    } catch {}
    if (!summaryEdit && (jdInput || '').trim()) {
      const sel = (editedWork || []).filter((_, i) => selectedWork[i]);
      const s = generateSummaryFromJDClient(sel.length ? sel : editedWork, jdInput || '', lang);
      if (s) setSummaryEdit(s);
    }
  }, [showPreview]);
  // （auto-summary effect moved below after state declarations）
  // 编辑模式与编辑后的经历（支持增删改；与解析结果解耦）
  const [editMode, setEditMode] = useState(false);
  const [editedWork, setEditedWork] = useState<WorkItem[]>([]);
const [autoSync, setAutoSync] = useState(true);
// 移除自动保存功能，确保每次使用都是全新会话
const [autoSave, setAutoSave] = useState<boolean>(false);
const [manualBullets, setManualBullets] = useState<boolean[]>([]);
  // 合并编辑模式：每条经历的要点可在一个文本框中按行编辑
  const [combinedEdit, setCombinedEdit] = useState<boolean[]>([]);
  // 可编辑的联系方式与技能/简介（用于“编辑简历”面板与预览导出）
  const [contactNameEdit, setContactNameEdit] = useState("");
  const [contactEmailEdit, setContactEmailEdit] = useState("");
  const [contactPhoneEdit, setContactPhoneEdit] = useState("");
  const [contactAddressEdit, setContactAddressEdit] = useState("");
  const [contactWebsiteEdit, setContactWebsiteEdit] = useState("");
  const [summaryEdit, setSummaryEdit] = useState("");
  const [techSkillsEdit, setTechSkillsEdit] = useState<string[]>([]);
  const [baseSkillsEdit, setBaseSkillsEdit] = useState<string[]>([]);

// 跟踪手动编辑标记长度与 editedWork 对齐
useEffect(() => {
  setManualBullets((prev) => editedWork.map((_, i) => prev[i] ?? false));
}, [editedWork]);

// 页面加载时自动清理所有localStorage，确保每次都是全新开始
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const keys = [
          'resume-input','jd-input','edited-work','selected-work','contact-name','contact-email','contact-phone',
          'contact-address','contact-website','summary-edit','tech-skills','base-skills','education-edit',
          'resume-lang','resume-lang-locked','resume-auto-save'
        ];
        for (const k of keys) localStorage.removeItem(k);
      }
    } catch {}
    // 进一步清空页面状态，避免历史分析残留
    setExtracted(null);
    setResumeInput("");
    setJdInput("");
    setEditedWork([]);
    setSelectedWork([]);
    setContactNameEdit("");
    setContactEmailEdit("");
    setContactPhoneEdit("");
    setContactAddressEdit("");
    setContactWebsiteEdit("");
    setSummaryEdit("");
    setTechSkillsEdit([]);
    setBaseSkillsEdit([]);
    // 教育经历可能在后续定义，但挂载后执行，无副作用
    try { setEducationEdit([]); } catch {}
  }, []); // 只在组件首次挂载时执行

  // 教育经历编辑
  const [educationEdit, setEducationEdit] = useState<EducationItem[]>([]);

  // 移除自动保存到localStorage的逻辑

  const [jdAdditional, setJdAdditional] = useState<WorkItem | null>(null);
  useEffect(() => {
    const src = (extracted?.workExperience || []) as WorkItem[];
    const copy = src.map((w, i) => ({ id: w.id || `${Date.now()}-${i}-${Math.random().toString(36).slice(2,8)}`, ...w, bullets: [...w.bullets] }));
    setEditedWork(copy);
    // 初始化编辑字段（若解析不到则为空）
    setContactNameEdit(generated?.contactName || "");
    setContactEmailEdit(generated?.contactEmail || "");
    setContactPhoneEdit(generated?.contactPhone || "");
    setSummaryEdit(generated?.summary || "");
    setTechSkillsEdit(generated?.techSkills || []);
    setBaseSkillsEdit(generated?.baseSkills || []);
  }, [extracted]);
  // 自动填充：当 JD 或选择的经历更新且概述为空时，根据 JD 生成
  useEffect(() => {
    const jdText = (jdInput || '').trim();
    if (!jdText) return;
    if (summaryEdit && summaryEdit.trim()) return; // 不覆盖用户已填写
    const sel = (editedWork || []).filter((_, i) => selectedWork[i]);
    const src = sel.length ? sel : editedWork;
    if (!src || src.length === 0) return;
    const targetLang = detectLangFromTextClient((resumeInput || '').trim());
    const s = generateSummaryFromJDClient(src, jdText, targetLang);
    if (s) setSummaryEdit(s);
  }, [jdInput, selectedWork, editedWork]);
  // 保持合并编辑开关与经历条目数量一致
  useEffect(() => {
    setCombinedEdit((prev) => editedWork.map((_, i) => (prev[i] ?? false)));
  }, [editedWork]);
  // 当简历文本变化时，自动检测语言并尝试提取自我介绍（移除localStorage保存）
  useEffect(() => {
    const text = (resumeInput || '').trim();
    if (!text) return;
    if (!summaryEdit.trim()) {
      const s = extractSummaryClient(text);
      if (s) setSummaryEdit(s);
    }
  }, [resumeInput, langLocked]);

  // 当 JD 文本变化时，优先根据 JD 自动切换界面语言（未锁定）
  useEffect(() => {
    const text = (jdInput || '').trim();
    if (!text) return;
    const detected = detectLangFromTextClient(text);
    if (!langLocked && detected && detected !== lang) {
      setLang(detected);
    }
  }, [jdInput, langLocked]);
  // 打开编辑模式时，滚动至编辑区（页面内联版本）
  useEffect(() => {
    if (editMode) {
      const el = document.getElementById("edit-section");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editMode, resumeInput, extracted]);
  // 打开编辑模式时：若联系方式为空，尝试从简历文本前端识别并回填（不覆盖已有输入）
  useEffect(() => {
    if (editMode) {
      const info = extractContactInfoClient((resumeInput || '').trim());
      if (!contactNameEdit && !generated?.contactName && info.name) setContactNameEdit(info.name);
      if (!contactEmailEdit && !generated?.contactEmail && info.email) setContactEmailEdit(info.email);
      if (!contactPhoneEdit && !generated?.contactPhone && info.phone) setContactPhoneEdit(info.phone);
      const extras = extractContactExtrasClient((resumeInput || '').trim());
      if (!contactAddressEdit && extras.address) setContactAddressEdit(extras.address);
      if (!contactWebsiteEdit && extras.website) setContactWebsiteEdit(extras.website);
      // 教育经历自动识别并置顶合并（避免重复）
      {
        const eduItems = extractEducationClient((resumeInput || '').trim());
        if (eduItems.length > 0) {
          setEducationEdit((prev) => {
            const seen = new Set(prev.map((e) => `${(e.school||'').toLowerCase()}|${(e.degree||'').toLowerCase()}|${(e.period||'').toLowerCase()}`));
            const append = eduItems.filter((e) => {
              const key = `${(e.school||'').toLowerCase()}|${(e.degree||'').toLowerCase()}|${(e.period||'').toLowerCase()}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            return append.length > 0 ? [...append, ...prev] : prev;
          });
        }
      }
      // 优先：基于 JD 与经历生成摘要；若不可用，则回退到简历文本提取
      const jdText = (jdInput || '').trim();
      const srcWork = (editedWork && editedWork.length > 0) ? editedWork : (generated?.workExperience || []);
      if (!summaryEdit) {
        const targetLang = detectLangFromTextClient((resumeInput || '').trim());
        const auto = (jdText && srcWork.length > 0) ? generateSummaryFromJDClient(srcWork, jdText, targetLang) : undefined;
        if (auto) {
          setSummaryEdit(auto);
        } else {
          const sum = extractSummaryClient((resumeInput || '').trim());
          if (!generated?.summary && sum) setSummaryEdit(sum);
        }
      }
    }
  }, [editMode]);

  // 简历文本变化时自动识别教育经历并置顶合并（仅在编辑模式下）
  useEffect(() => {
    if (!editMode) return;
    const eduItems = extractEducationClient((resumeInput || '').trim());
    if (eduItems.length === 0) return;
    setEducationEdit((prev) => {
      const seen = new Set(prev.map((e) => `${(e.school||'').toLowerCase()}|${(e.degree||'').toLowerCase()}|${(e.period||'').toLowerCase()}`));
      const append = eduItems.filter((e) => {
        const key = `${(e.school||'').toLowerCase()}|${(e.degree||'').toLowerCase()}|${(e.period||'').toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return append.length > 0 ? [...append, ...prev] : prev;
    });
  }, [resumeInput, editMode]);

  // 当教育经历为空时，像联系方式一样自动识别并直接填充首批结果（不依赖编辑模式）
  useEffect(() => {
    const text = (resumeInput || '').trim();
    if (!text) return;
    setEducationEdit((prev) => {
      if ((prev || []).length > 0) return prev;
      const items = extractEducationClient(text);
      return items.length > 0 ? items : prev;
    });
  }, [resumeInput]);
  // 统一的匹配结果（优先使用前端实时计算，后备用后端解析）
  const matchesUnified = useMemo(() => {
    const jdText = (jdInput || "").trim();
    const canClient = editedWork.length > 0 && jdText.length > 0;
    if (canClient) {
      const kw = extracted?.jdKeywords ?? generated?.jdSkills ?? topTermsClient(jdText, 18, 10, 6);
      const cm = computeMatchesClient(editedWork, jdText, kw);
      // 前端实时计算有结果则优先使用
      if (cm.length > 0) return cm;
    }
    return (generated?.matches || []) as { requirement: string; bullets: string[]; score?: number }[];
  }, [editedWork, jdInput, extracted?.jdKeywords, generated?.jdSkills, generated?.matches]);
  // 简洁覆盖摘要（按经验类别）
  const coverageSummary = useMemo(() => {
    const jdText = (jdInput || "").trim();
    if (!jdText || editedWork.length === 0) return { items: [] as CoverageItem[] };
    const primary = computeCoverageSummaryClient(editedWork, jdText);
    if (primary.items.length > 0) return primary;
    // Fallback：若按类别没有识别到覆盖项，则基于关键词匹配构造简洁摘要
    try {
      const kw = extracted?.jdKeywords ?? generated?.jdSkills ?? topTermsClient(jdText, 18, 10, 6);
      const matches = computeMatchesClient(editedWork, jdText, kw);
      const items: CoverageItem[] = matches.slice(0, 6).map((m, i) => {
        const bullet = (m.bullets || [])[0];
        let wi = -1;
        if (bullet) {
          wi = editedWork.findIndex((w) => (w.bullets || []).includes(bullet));
        }
        return {
          key: `req-${i}`,
          labelZh: `要求 ${i + 1}`,
          labelEn: `Requirement ${i + 1}`,
          covered: !!bullet,
          evidence: bullet ? { workIndex: wi >= 0 ? wi : 0, bullet, score: m.score || 0 } : undefined,
        } as CoverageItem;
      });
      return { items };
    } catch {
      return primary;
    }
  }, [editedWork, jdInput, extracted?.jdKeywords, generated?.jdSkills]);

  // JD 匹配的经历索引集合（用于筛选志愿者补充）
  const jdMatchedWorkIdxSet = useMemo(() => {
    const set = new Set<number>();
    for (const it of (coverageSummary?.items || [])) {
      if (it.covered && it.evidence && typeof (it as any).evidence?.workIndex === 'number') {
        set.add((it as any).evidence.workIndex as number);
      }
    }
    return set;
  }, [coverageSummary]);

  // 组合精选：匹配经验 + 补充经验（用于更美观的最终简历展示）
  const combinedExperience = useMemo(() => {
    // 展示全部剩余经历作为“补充经验”
    const addCountAll = Math.max(editedWork.length, 0);
    return combineExperienceForResumeClient(editedWork, coverageSummary, 2, addCountAll, (jdInput || '').trim());
  }, [editedWork, coverageSummary]);

  // 默认勾选“匹配的工作经验”（仅首次，当未选择且有 JD；仅在预览开启时触发）
  useEffect(() => {
    const jdText = (jdInput || '').trim();
    if (!showPreview) return;            // 仅在预览阶段才尝试默认勾选
    if (autoSelectedPrimaryOnce) return; // 一次性保护，避免覆盖用户后续选择
    const needDefault = !selectedWork || !selectedWork.some(Boolean);
    if (!jdText) return;
    if (!needDefault) return;
    try {
      const indices = (combinedExperience.primary || [])
        .map((w) => editedWork.findIndex((y) => (
          (y.role || '') === (w.role || '') &&
          (y.company || '') === (w.company || '') &&
          (y.period || '') === (w.period || '')
        )))
        .filter((i) => i >= 0);
      if (indices.length === 0) return;
      // 若所有匹配项已被勾选，则不重复更新，避免循环
      if (indices.every(i => selectedWork?.[i])) return;
      // 自动勾选所有匹配的工作经验，保留用户已有的选择
      setSelectedWork(prev => {
        const newSelected = [...(prev || [])];
        // 确保数组长度匹配
        while (newSelected.length < editedWork.length) {
          newSelected.push(false);
        }
        // 勾选所有匹配的工作经验
        indices.forEach(i => {
          newSelected[i] = true;
        });
        return newSelected;
      });
      setAutoSelectedPrimaryOnce(true);
    } catch {}
  }, [combinedExperience.primary, editedWork, selectedWork, jdInput, autoSelectedPrimaryOnce, showPreview]);

  // 快速选择（仅补充经验-工作）：在补充经验列表中按分数勾选前 N 条
  const quickSelectWorkAndVolunteer = (count: number) => {
    try {
      // 原始补充经验（工作）索引
      const additionalIdx: number[] = (additionalWork || [])
        .map((w) => editedWork.findIndex((y) => (
          (y.role || '') === (w.role || '') &&
          (y.company || '') === (w.company || '') &&
          (y.period || '') === (w.period || '')
        )))
        .filter((i) => i >= 0);

      // 志愿者索引（可选纳入）
      const volunteerIdx: number[] = editedWork.map((w, i) => (isVolunteerFinal(w) ? i : -1)).filter((i) => i >= 0);

      // 候选池：默认为补充经验，若勾选则并入志愿者
      const poolSet = new Set<number>(additionalIdx);
      if (includeVolunteerQuick) {
        for (const i of volunteerIdx) poolSet.add(i);
      }
      let pool = Array.from(poolSet);

      // 分类过滤（如选择了某分类）
      if (quickCategoryKey) {
        pool = pool.filter((idx) => {
          const w = editedWork[idx] || {} as WorkItem;
          const text = [w.summaryText || '', ...(w.bullets || [])].join('\n');
          const cats = extractCategoriesFromTextClient(text);
          return cats.includes(quickCategoryKey as string);
        });
      }
      if (pool.length === 0) return;

      // 汇总每条经历的最佳匹配分数（用于排序）
      const bestScoreByWork = new Map<number, number>();
      for (const it of (coverageSummary?.items || [])) {
        if (!it.covered || !it.evidence || typeof it.evidence.workIndex !== 'number') continue;
        const idx = it.evidence.workIndex;
        const prev = bestScoreByWork.get(idx) ?? -Infinity;
        const sc = it.evidence.score ?? 0;
        if (sc > prev) bestScoreByWork.set(idx, sc);
      }

      // 在候选池内排序：分数降序、要点数量降序、索引升序
      const ranked = pool.sort((a, b) => {
        const as = bestScoreByWork.get(a) ?? -Infinity;
        const bs = bestScoreByWork.get(b) ?? -Infinity;
        if (as !== bs) return bs - as;
        const ac = editedWork[a]?.bullets?.length ?? 0;
        const bc = editedWork[b]?.bullets?.length ?? 0;
        if (ac !== bc) return bc - ac;
        return a - b;
      });
      const chosenIdx = ranked.slice(0, Math.min(Math.max(count, 0), ranked.length));

      // 与 primary 取并集，保持“匹配的工作经验”始终选中
      const primaryIdx: number[] = (combinedExperience.primary || [])
        .map((w) => editedWork.findIndex((y) => (
          (y.role || '') === (w.role || '') &&
          (y.company || '') === (w.company || '') &&
          (y.period || '') === (w.period || '')
        )))
        .filter((i) => i >= 0);
      const selectedSet = new Set<number>([...primaryIdx, ...chosenIdx]);
      setSelectedWork(editedWork.map((_, i) => selectedSet.has(i)));
      setAutoSelectedPrimaryOnce(true);
    } catch {}
  };

  // 分栏：将精选/补充按工作与志愿者拆分
  const primaryWork = useMemo(() => (combinedExperience.primary || []).filter((w) => !isVolunteerFinal(w)), [combinedExperience]);
  const primaryVolunteer = useMemo(() => (combinedExperience.primary || []).filter((w) => isVolunteerFinal(w)), [combinedExperience]);
  const additionalWork = useMemo(() => (combinedExperience.additional || []).filter((w) => !isVolunteerFinal(w)), [combinedExperience]);
  // 生成岗位概述（2–4句）、主要职责（5–10条）和加分项的辅助函数
  function generateJobSummaryForWorkClient(w: WorkItem, jdText: string, lang: 'zh' | 'en'): string {
    const role = (w.role || '').trim();
    const company = (w.company || '').trim();
    const jdTerms = refineJdTermsClient(topTermsClient(jdText, 18, 10, 6));
    const wTerms = topTermsClient([w.role, w.company, ...(w.bullets || [])].filter(Boolean).join(' '), 12, 8, 4);
    const focus = Array.from(new Set([ ...jdTerms.slice(0, 6), ...wTerms.slice(0, 6) ])).slice(0, 3);
    const area = focus.join(lang === 'zh' ? '、' : ', ');
    const roleStr = role || (lang === 'zh' ? '岗位' : 'role');
    if (lang === 'zh') {
      const s1 = `我们正在寻找一位 ${roleStr}${company ? `（${company}）` : ''}，负责支持核心业务并协同推进项目。`;
      const s2 = `该岗位聚焦 ${area} 等关键方向，确保按时交付并达成指标。`;
      const s3 = `同时跟踪数据表现，优化流程，实现持续迭代与改进。`;
      return [s1, s2, s3].join(' ');
    } else {
      const s1 = `We are seeking a ${roleStr}${company ? ` at ${company}` : ''} to support core initiatives and cross-team delivery.`;
      const s2 = `The role focuses on ${area}, ensuring on-time outputs and measurable results.`;
      const s3 = `It tracks performance data and optimizes processes for continuous improvement.`;
      return [s1, s2, s3].join(' ');
    }
  }

  function generateResponsibilitiesForWorkClient(
    w: WorkItem,
    jdText: string,
    resumeTextGlobal: string,
    lang: 'zh' | 'en',
    cats: string[],
    globalPool: string[],
    usedGlobal: Set<string>,
    desiredCount: number = 5,
  ): string[] {
    // 严格基于简历事实：仅重写现有要点措辞并按 JD 相关性排序，不引入候选池或模板
    const bullets = strengthenBulletsFromResumeClient(w, jdText, resumeTextGlobal, lang, desiredCount);
    return bullets.slice(0, desiredCount);
  }

  function extractPreferredFromJDClient(jdText: string, lang: 'zh' | 'en'): string[] {
    const terms = topTermsClient(jdText, 20, 12, 6).map((t) => t.toLowerCase());
    const toolHints = terms.filter((t) => /(canva|photoshop|figma|seo|sem|sql|python|excel|ga4|google analytics|cms|wordpress|shopify|notion)/i.test(t));
    const uniq = Array.from(new Set(toolHints)).slice(0, 4);
    const map = (t: string) => (lang === 'zh' ? `具备 ${t} 经验者优先` : `Experience with ${t} is a plus`);
    return uniq.map(map);
  }

  // 文本正则转义
  function escapeRegExpClient(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  // 清理冗余措辞，保持事实不变
  function cleanBulletTextClient(text: string): string {
    let s = text.trim();
    s = normalizeSpellingClient(s);
    s = s.replace(/include(d)?\s+but\s+(is|are)?\s*not\s*(limited\s*)?to[,;]?\s*/gi, '');
    s = s.replace(/\s{2,}/g, ' ');
    return s;
  }
  // 将同义词统一到 JD 相关术语，避免语言不一致但不改变事实
  function canonicalizeBySynonymsTextClient(text: string, lang: 'zh' | 'en', jdTerms: string[]): string {
    let s = text;
    for (const [key, vars] of Object.entries(SYNONYMS_CANON)) {
      const label = (CATEGORY_INFO as any)[key] ? ((lang === 'zh') ? (CATEGORY_INFO as any)[key].zh : (CATEGORY_INFO as any)[key].en) : key;
      // 仅当 JD 术语或同类语义出现在 JD 里时，才做同义词统一
      const shouldAlign = jdTerms.some((t) => t.includes(key) || t.includes(label.toLowerCase()));
      if (!shouldAlign) continue;
      for (const v of vars) {
        const re = new RegExp(escapeRegExpClient(v), 'gi');
        s = s.replace(re, label);
      }
    }
    return s;
  }
  // 基于简历事实的要点重写：仅重写现有要点的措辞与术语，不新增事实
  function strengthenBulletsFromResumeClient(w: WorkItem, jdText: string, resumeTextGlobal: string, lang: 'zh' | 'en', desiredCount: number = 5): string[] {
    const jdKW = refineJdTermsClient(topTermsClient(jdText, 18, 10, 6)).map((t) => t.toLowerCase());
    const vText = [w.role, w.company, w.period, ...(w.bullets || [])].filter(Boolean).join(' ');
    const vKW = topTermsClient(vText, 16, 8, 4).map((s) => s.toLowerCase());
    const resumeKWGlobal = topTermsClient(resumeTextGlobal || '', 18, 10, 6).map((s) => s.toLowerCase());
    const raw = (w.bullets || [])
      .map((b) => canonicalizeBySynonymsTextClient(cleanBulletTextClient(b), lang, jdKW))
      .filter((b) => !isGenericBulletClient(b));
    const scored = raw.map((b) => {
      const bKW = topTermsClient(b, 12, 8, 4).map((s) => s.toLowerCase());
      const s1 = normalizedOverlapClient(vKW, bKW);
      const s2 = normalizedOverlapClient(jdKW, bKW);
      const s3 = normalizedOverlapClient(resumeKWGlobal, bKW);
      return { b, score: (0.5 * s1 + 0.3 * s2 + 0.2 * s3) };
    }).sort((a, b) => b.score - a.score);
    // 不新增事实：仅返回重写后的原要点，最多显示 desiredCount 条
    return scored.map((x) => x.b).slice(0, desiredCount);
  }
  // 当条目缺少要点时：从整份简历文本附近段落提取事实作为要点（尽量避免臆造）
  function extractFactsForWorkFromResumeClient(w: WorkItem, resumeTextGlobal: string, lang: 'zh' | 'en'): string[] {
    const lines = (resumeTextGlobal || '').split(/\r?\n/);
    const target = [w.company || '', w.role || ''].map((s) => s.toLowerCase()).filter(Boolean);
    let idx = lines.findIndex((ln) => target.some((t) => ln.toLowerCase().includes(t)));
    // 兜底：全文搜索公司/岗位出现位置
    if (idx < 0) {
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (target.some((t) => ln.toLowerCase().includes(t))) { idx = i; break; }
      }
      if (idx < 0) idx = 0; // 若仍找不到，则从开头扫描事实行
    }
    const collected: string[] = [];
    for (let i = Math.max(0, idx - 3); i < Math.min(lines.length, idx + 30); i++) {
      const ln = lines[i];
      if (!ln || /^\s*$/.test(ln)) { continue; }
      const s = ln.trim();
      const PERIOD_HINT_LOCAL = /([A-Za-z]{3,9}\s?\d{4}|\d{4})(?:\s?[–—-]\s?|\s+to\s+|\s+−\s+)([A-Za-z]{3,9}\s?\d{4}|present|now|current|至今|现在)/i;
      const MONTHS_RE_LOCAL = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
  const ACTION_VERB_LOCAL = /\b(manage|managed|support|supported|coordinate|coordinated|assist|assisted|lead|led|design|designed|develop|developed|operate|operated|serve|served|handle|handled|process|processed|maintain|maintained|monitor|monitored|optimi[sz]e|analy[sz]e|report|reported|provide|provided|deliver|delivered|offer|offered|arrange|arranged|translate|translated|recommend|recommended|guide|guided)\b/i;

  // 一键润色：将要点句式标准化（中英混合的轻量规则），保持语义不变
  const refineBulletLocal = (text: string, langLocal: string): string => {
    let t = (text || '').trim();
    if (!t) return t;
    // 去除冗余标点与空格
    t = t.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').replace(/\s*;\s*/g, '; ').trim();
    // 句首动词统一大写；中文保持原样
    if (/^[a-z]/.test(t) && ACTION_VERB_LOCAL.test(t)) {
      t = t.replace(/^([a-z])/, (m) => m.toUpperCase());
    }
    // 删除常见填充词
    t = t.replace(/\b(very|really|just|actually|highly|regarded|greatly|successfully)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
    // 简化连词堆砌
    t = t.replace(/\b(and|or)\s+(and|or)\b/gi, '$1');
    // 中文句末统一全角顿号/句号；英文句末补句点
    if (/^[\p{Script=Han}]/u.test(t)) {
      t = t.replace(/[。\.]+$/, '');
      t += '。';
    } else {
      t = t.replace(/[。]+$/, '.');
      if (!/[.!?]$/.test(t)) t += '.';
    }
    // 过长句子适度压缩：移除重复短语
    t = t.replace(/\b(content\s+content|manage\s+manage|design\s+design)\b/gi, (m) => m.split(' ')[0]);
    return t.trim();
  };

  const refineBulletsForWork = (workIndex: number) => {
    if (workIndex < 0) return;
    setEditedWork((prev) => prev.map((x, idx) => {
      if (idx !== workIndex) return x;
      const nextBullets = (x.bullets || []).map((b) => refineBulletLocal(b, lang));
      return { ...x, bullets: nextBullets };
    }));
  };
      const looksTitle = /^[A-Z][A-Za-z&\/\-]+(?:\s+[A-Z][A-Za-z&\/\-]+){0,6}$/.test(s);
      if (i > idx && (PERIOD_HINT_LOCAL.test(s) || (/\|/.test(s) && MONTHS_RE_LOCAL.test(s.toLowerCase())) || (looksTitle && !ACTION_VERB_LOCAL.test(s)))) {
        break; // 遇到下一条经历头部，停止采集
      }
      const hit = /(^[-•*]\s*|manage|support|coordinate|assist|lead|design|develop|operate|serve|handle|process|maintain|monitor|optimi[sz]e|analy[sz]e|report|provide|delivered?|offer|arrange|translate|recommend|guide)/i.test(ln);
      if (hit) collected.push(ln.replace(/^[-•*]\s*/, '').trim());
      if (collected.length >= 10) break;
    }
    const jdKW = refineJdTermsClient(topTermsClient((resumeTextGlobal || ''), 18, 10, 6));
    const cleaned = collected
      .map((b) => canonicalizeBySynonymsTextClient(cleanBulletTextClient(b), lang, jdKW))
      .filter((b) => !isGenericBulletClient(b));
    return cleaned;
  }
  // 过滤可能被误识别为“岗位头部/时间段”的要点行（避免把“岗位 | 时间段”当作要点）
  const MONTHS_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
  const PERIOD_HINT = /([A-Za-z]{3,9}\s?\d{4}|\d{4})(?:\s?[–—-]\s?|\s+to\s+|\s+−\s+)([A-Za-z]{3,9}\s?\d{4}|present|now|current|至今|现在)/i;
  const ACTION_VERB = /\b(manage|managed|design|designed|develop|developed|implement|implemented|optimi[sz]e|build|built|lead|led|coordinate|coordinated|analy[sz]e|research|support|supported|maintain|maintained|deliver|delivered|drive|driven|own|owned|plan|planned|execute|executed|assist|assisted|create|created|edit|edited|produce|produced|guide|guided|ensure|ensured|collaborate|collaborated|serve|served)\b/i;
  function filterHeaderLikeBullets(bullets: string[]): string[] {
    return (bullets || []).filter((b) => {
      const s = (b || '').trim();
      if (!s) return false;
      if (PERIOD_HINT.test(s)) return false;
      if (/\|/.test(s) && MONTHS_RE.test(s.toLowerCase())) return false;
      const looksTitle = /^[A-Z][A-Za-z&\/\-]+(?:\s+[A-Z][A-Za-z&\/\-]+){0,6}$/.test(s);
      if (looksTitle && !ACTION_VERB.test(s)) return false;
      return true;
    });
  }
  // 自动为每个补充工作经验生成 3 条 JD 贴合的岗位描述（当该条目缺少要点时）
  const additionalWorkAuto = useMemo(() => {
    try {
      const jdText = (jdInput || '').trim();
      if (!jdText) return additionalWork;
      const targetLang = detectLangFromTextClient((resumeInput || '').trim());

      // 从 JD 解析统一需求池（用于兜底）
      const reqsUnified = jdRequirementsFromTextClient(jdText);
      const globalPool: string[] = [];
      for (const r of reqsUnified) {
        const bs = suggestBulletsFromRequirement(r, targetLang);
        for (const b of bs) {
          if (b && !globalPool.includes(b)) globalPool.push(b);
        }
        if (globalPool.length >= 40) break; // 足够的候选池
      }

      // 为每个工作索引收集匹配到的类别（更个性化的要点）
      const catsByWork = new Map<number, Set<string>>();
      for (const it of (coverageSummary?.items || [])) {
        if (!it.covered || !it.evidence || typeof it.evidence.workIndex !== 'number') continue;
        const wi = it.evidence.workIndex;
        const set = catsByWork.get(wi) ?? new Set<string>();
        if (it.key) set.add(it.key);
        catsByWork.set(wi, set);
      }

      // 预计算 JD 关键词用于评分
      const jdKW = (extracted?.jdKeywords ?? topTermsClient(jdText, 18, 10, 6)).map((t) => t.toLowerCase());
      const usedGlobal = new Set<string>(); // 避免所有卡片出现完全相同的句子

      return (additionalWork || []).map((w) => {
        // 找到该条目的原始索引
        const idx = editedWork.findIndex((y) => (
          (y.role || '') === (w.role || '') &&
          (y.company || '') === (w.company || '') &&
          (y.period || '') === (w.period || '')
        ));

        // 该条目上下文关键词
        const vText = [w.role, w.company, w.period, ...(w.bullets || [])].filter(Boolean).join(' ');
        const vKW = topTermsClient(vText, 16, 8, 4).map((s) => s.toLowerCase());

        // 基于类别生成候选（优先使用与该条目匹配到的类别）
        const candidates: string[] = [];
        const cats = idx >= 0 ? Array.from(catsByWork.get(idx) || []) : [];
        for (const key of cats) {
          const bs = suggestBulletsForCategory(key, targetLang);
          for (const b of bs) {
            if (b && !candidates.includes(b)) candidates.push(b);
          }
          if (candidates.length >= 12) break; // 控制候选规模
        }
        // 兜底：若类别不足，则加入统一需求池
        if (candidates.length < 6) {
          for (const b of globalPool) {
            if (!candidates.includes(b)) candidates.push(b);
            if (candidates.length >= 18) break;
          }
        }

        // 生成岗位概述（2–4句）+ 主要职责（5–10条）+ 加分项
        const summaryText = generateJobSummaryForWorkClient(w, jdText, targetLang);
        const responsibilities = generateResponsibilitiesForWorkClient(
          w,
          jdText,
          (resumeInput || '').trim(),
          targetLang,
          cats,
          candidates.length > 0 ? candidates : globalPool,
          usedGlobal,
          jdBulletCount,
        );
        const niceToHave = extractPreferredFromJDClient(jdText, targetLang);
        const hasOriginal = Array.isArray(w.bullets) && w.bullets.length >= 1;
        // 改为直接使用简历中的原始要点；若缺失则从简历文本提取事实
        const derivedFacts = (!hasOriginal) ? extractFactsForWorkFromResumeClient(w, (resumeInput || '').trim(), targetLang) : [];
        const baseBullets = filterHeaderLikeBullets(hasOriginal ? (w.bullets || []) : derivedFacts);
        // 跨卡片唯一性：仅对原始/提取要点去重，并限制数量
        const baseUnique: string[] = [];
        for (const b of baseBullets) {
          if (!usedGlobal.has(b) && !baseUnique.includes(b)) {
            baseUnique.push(b);
            usedGlobal.add(b);
          }
        }
        const bullets = baseUnique.slice(0, jdBulletCount);
        return { ...w, bullets, summaryText, niceToHave };
      });
    } catch {
      return additionalWork;
    }
  }, [additionalWork, jdInput, resumeInput, coverageSummary, editedWork, extracted?.jdKeywords, jdBulletCount, forceJDOverride]);

// 自动同步：当卡片要点为空且未手动编辑时，自动填充到预览/编辑
useEffect(() => {
  if (!autoSync) return;
  const jdTextUsed = (jdInput || '').trim();
  const targetLang = detectLangFromTextClient((resumeInput || '').trim());
  if (!jdTextUsed || editedWork.length === 0) return;
  setEditedWork((prev) => {
    let changed = false;
    const updated = prev.map((w, i) => {
      const bulletsCount = (w.bullets || []).length;
      const isManual = manualBullets[i] === true;
      if (bulletsCount > 0 || isManual) return w;
      const same = (x: WorkItem) => (
        (x.role || '') === (w.role || '') &&
        (x.company || '') === (w.company || '') &&
        (x.period || '') === (w.period || '')
      );
      const fromCombined = (combinedExperience.primary || []).find(same) || (combinedExperience.additional || []).find(same) || w;
      let next = (fromCombined.bullets || []).slice(0, jdBulletCount);
      if (next.length === 0) {
        const fromAddAuto = additionalWorkAuto.find(same);
        if (fromAddAuto && (fromAddAuto.bullets || []).length > 0) {
          next = (fromAddAuto.bullets || []).slice(0, jdBulletCount);
        }
      }
      if (next.length === 0) {
        const catsSet = new Set<string>();
        for (const it of (coverageSummary?.items || [])) {
          const ev = (it as any).evidence;
          if (it?.key && it.covered && ev && typeof ev?.workIndex === 'number' && ev.workIndex === i) catsSet.add(it.key);
        }
        const candidates: string[] = [];
        for (const key of Array.from(catsSet)) {
          const bs = suggestBulletsForCategory(key, targetLang);
          for (const b of bs) { if (b && !candidates.includes(b)) candidates.push(b); }
          if (candidates.length >= jdBulletCount * 2) break;
        }
        if (candidates.length < jdBulletCount) {
          const reqs = jdRequirementsFromTextClient(jdTextUsed);
          for (const r of reqs) {
            const bs = suggestBulletsFromRequirement(r, targetLang);
            for (const b of bs) { if (b && !candidates.includes(b)) candidates.push(b); }
            if (candidates.length >= jdBulletCount * 2) break;
          }
        }
        next = candidates.slice(0, jdBulletCount);
      }
      if (next.length > 0) {
        changed = true;
        return { ...w, bullets: next };
      }
      return w;
    });
    return changed ? updated : prev;
  });
}, [autoSync, combinedExperience, additionalWorkAuto, coverageSummary, jdBulletCount, jdInput, resumeInput, manualBullets, editedWork.length]);
  const additionalVolunteer = useMemo(() => {
    // 预览中的志愿者经验必须来源于 Selected Experience（不依赖后面声明的 selectedWorkSorted）
    return (editedWork || []).filter((w, i) => !!selectedWork[i]).filter((w) => isVolunteerFinal(w));
  }, [editedWork, selectedWork]);
  // 勾选“包含志愿者”后，自动选中匹配的志愿者条目（基于 additionalVolunteer 列表）
  useEffect(() => {
    if (!includeVolunteerQuick) return;
    // 保留用户对志愿者条目的选择，不再自动勾选，避免预览出现生成器不可见的条目。
  }, [includeVolunteerQuick]);
  // 计算匹配进度（JD 要求与简历要点重合、技能重合）
  const matchProgress = useMemo(() => {
    const total = coverageSummary.items.length || 0;
    const hit = coverageSummary.items.filter((i) => i.covered).length;
    const pct = total > 0 ? Math.round((hit / total) * 100) : 0;
    return { total, hit, pct };
  }, [coverageSummary]);

  // 按类别的缺口建议（更自然的中文/英文）
  const missingCategories = useMemo(() => {
    const miss = coverageSummary.items.filter((i) => !i.covered);
    return miss.map((i) => ({
      key: i.key,
      labelZh: i.labelZh,
      labelEn: i.labelEn,
      bullets: suggestBulletsForCategory(i.key, lang),
    }));
  }, [coverageSummary, lang]);
  const skillsProgress = useMemo(() => {
    const total = generated?.jdSkills?.length || 0;
    const hit = generated?.jdMatchedSkills?.length || 0;
    const pct = total > 0 ? Math.round((hit / total) * 100) : 0;
    return { total, hit, pct };
  }, [generated]);
  // 综合匹配度（70% JD 要求 + 30% 技能重合）
  const analysisProgress = useMemo(() => {
    const jdWeight = 0.7;
    const skillsWeight = 0.3;
    const pct = Math.round(matchProgress.pct * jdWeight + skillsProgress.pct * skillsWeight);
    return { pct };
  }, [matchProgress.pct, skillsProgress.pct]);

  // JD 要求中尚未覆盖的经验缺口 + 建议要点
  const missingRequirements = useMemo(() => {
    const unified = matchesUnified;
    // 统一匹配存在：直接用未覆盖的 JD 要求
    if (unified.length > 0) {
      const all = unified.map((m) => m.requirement);
      const covered = unified
        .filter((m) => (m.bullets?.length || 0) > 0)
        .map((m) => m.requirement);
      const miss = all.filter((r) => !covered.includes(r));
      return miss.map((r) => ({ requirement: r, bullets: suggestBulletsFromRequirement(r, lang) }));
    }

    // 兜底：仅前端输入时，根据 JD 文本 + 简历关键词计算
    const reqs = jdRequirementsFromTextClient(jdInput);
    const resumeKW = topKeywordsClient(resumeInput || "", 30);
    const missing: { requirement: string; bullets: string[] }[] = [];
    for (const r of reqs) {
      const rKW = topKeywordsClient(r, 8);
      const ov = overlapCount(resumeKW, rKW);
      if (ov < 2) {
        missing.push({ requirement: r, bullets: suggestBulletsFromRequirement(r, lang) });
      }
      if (missing.length >= 10) break;
    }
    return missing;
  }, [matchesUnified, jdInput, resumeInput]);

  // 实时匹配进度（基于两侧输入的关键词重合，未解析时也可预估）
  const liveSkillsProgress = useMemo(() => {
    const resumeKW = topTermsClient(resumeInput || "", 18, 10, 6);
    const jdKW = topTermsClient(jdInput || "", 18, 10, 6);
    const set = new Set(resumeKW);
    const hit = jdKW.filter((w) => set.has(w)).length;
    const total = jdKW.length;
    const pct = total > 0 ? Math.round((hit / total) * 100) : 0;
    return { total, hit, pct };
  }, [resumeInput, jdInput]);
  const buildPlainText = (): string => {
    const lines: string[] = [];
    const name = (contactNameEdit || generated?.contactName || "").trim();
    const email = (contactEmailEdit || generated?.contactEmail || "").trim();
    const phone = (contactPhoneEdit || generated?.contactPhone || "").trim();
    const addr = (contactAddressEdit || "").trim();
    const site = (contactWebsiteEdit || "").trim();
    if (name) lines.push(`${name}`);
    const contactLine = [email || null, phone || null, addr || null, site || null].filter(Boolean).join(" | ");
    if (false) lines.push(contactLine);
    lines.push("");
    const tech = techSkillsEdit && techSkillsEdit.length ? techSkillsEdit : (generated?.techSkills || []);
    const base = baseSkillsEdit && baseSkillsEdit.length ? baseSkillsEdit : (generated?.baseSkills || []);
    const summaryCandidate = (summaryEdit || generated?.summary || '').trim();
    const summary = summaryCandidate || (extractSummaryClient((resumeInput || '').trim()) || '');
    if (summary) {
      lines.push(`${lang === 'zh' ? '个人简介' : 'Summary'}: ${summary}`);
      lines.push("");
    }
    // 教育经历（放在 Summary 下面）
    if (educationEdit && educationEdit.length > 0) {
      lines.push(lang === 'zh' ? '教育经历:' : 'Education:');
      for (const e of educationEdit) {
        const degreeField = e.degree
          ? (lang === 'zh'
              ? `${e.degree}${e.field ? `（${e.field}）` : ''}`
              : `${e.degree}${e.field ? ` in ${e.field}` : ''}`)
          : (e.field || '');
        const header = [degreeField || null, e.school || null, e.period || null].filter(Boolean).join(' | ');
        if (header) lines.push(`• ${header}`);
      }
      lines.push("");
    }
    if (tech.length) lines.push(`${lang === 'zh' ? '技术技能' : 'Technical Skills'}: ${tech.join(", ")}`);
    if (base.length) lines.push(`${lang === 'zh' ? '通用技能' : 'Base Skills'}: ${base.join(", ")}`);
    lines.push("");
    // 与预览一致的分组：主列表（匹配）与补充列表（非匹配），并排除志愿者
    const selected = selectedWorkSorted;
    const same = (x: WorkItem, y: WorkItem) => (
      (x.role || '') === (y.role || '') &&
      (x.company || '') === (y.company || '') &&
      (x.period || '') === (y.period || '')
    );
    const primary = selected.filter((w) => (combinedExperience.primary || []).some((p) => same(p, w)) && !isVolunteerFinal(w));
    const additional = selected.filter((w) => !(combinedExperience.primary || []).some((p) => same(p, w)) && (combinedExperience.additional || []).some((a) => same(a, w)) && !isVolunteerFinal(w));
    const volunteers = selected.filter((w) => isVolunteerFinal(w));

    const zhLabel = '补充经验（基于简历）';
    const enLabel = 'Additional Experience (from Resume)';

    // WORK EXPERIENCE
    if (primary.length > 0) {
      lines.push(lang === 'zh' ? '工作经历:' : 'WORK EXPERIENCE:');
      for (const w of primary) {
        const roleRaw = (w.role || '').trim();
        const normalizedRole = (roleRaw === zhLabel || roleRaw === enLabel)
          ? (lang === 'zh' ? zhLabel : enLabel)
          : (w.role || '');
        const header = [normalizedRole, w.company, w.period].filter(Boolean).join(' | ');
        if (header) lines.push(header);
        for (const b of (w.bullets || []).slice(0, jdBulletCount)) lines.push(`• ${b}`);
        lines.push('');
      }
    }

    // ADDITIONAL WORK EXPERIENCE
    if (additional.length > 0) {
      lines.push(lang === 'zh' ? '补充工作经历:' : 'ADDITIONAL WORK EXPERIENCE:');
      for (const w of additional) {
        const roleRaw = (w.role || '').trim();
        const normalizedRole = (roleRaw === zhLabel || roleRaw === enLabel)
          ? (lang === 'zh' ? zhLabel : enLabel)
          : (w.role || '');
        const header = [normalizedRole, w.company, w.period].filter(Boolean).join(' | ');
        if (header) lines.push(header);
        for (const b of (w.bullets || []).slice(0, jdBulletCount)) lines.push(`• ${b}`);
        lines.push('');
      }
    }

    // VOLUNTEER EXPERIENCE（仅当用户选择了志愿者）
    if (volunteers.length > 0) {
      lines.push(lang === 'zh' ? '志愿者经历:' : 'VOLUNTEER EXPERIENCE:');
      for (const w of volunteers) {
        const header = [w.role || null, w.company || null, w.period || null].filter(Boolean).join(' | ');
        if (header) lines.push(header);
        for (const b of (w.bullets || []).slice(0, jdBulletCount)) lines.push(`• ${b}`);
        lines.push('');
      }
    }
    return lines.join("\n");
  };

  // 解析 period 并提供排序权重（尽量倒序展示，Present 优先）
  function periodOrder(period?: string): number {
    if (!period) return -Infinity;
    const p = period.toLowerCase().trim();
    if (/(present|至今|现在|current|ongoing)/.test(p)) return 999999;
    const monthMap: Record<string, number> = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12 };
    const m = p.match(/(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s*)?(\d{4}).*?(?:-|–|—|\bto\b|－|至|到|〜|—)\s*(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s*)?(\d{4}|present|至今|现在|current)/i);
    if (m) {
      const endYearStr = m[4];
      const endMonStr = m[3];
      if (!endYearStr || /(present|至今|现在|current)/.test(endYearStr)) return 999999;
      const endYear = parseInt(endYearStr,10);
      const endMon = endMonStr ? (monthMap[endMonStr.slice(0,3)] || 12) : 12;
      return endYear * 100 + endMon;
    }
    const years = (p.match(/\b(20\d{2}|19\d{2})\b/g) || []).map((y) => parseInt(y, 10));
    if (years.length === 0) return -Infinity;
    return Math.max(...years) * 100;
  }

  function uniqueByHeader(items: WorkItem[]): WorkItem[] {
    const seen = new Set<string>();
    return items.filter((w) => {
      const key = `${w.role || ''}|${w.company || ''}|${w.period || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const selectedWorkSorted = useMemo(() => {
    const items = (editedWork || []).filter((_, i) => !!selectedWork[i]);
    return items.sort((a, b) => periodOrder(b.period) - periodOrder(a.period));
  }, [editedWork, selectedWork]);
  const downloadTxt = () => {
    const txt = buildPlainText();
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const baseName = (contactNameEdit || generated?.contactName || "Resume").trim() || "Resume";
    a.download = `${baseName}- Resume.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // -------- PDF 导出（按截图所示版式） --------
  const exportPdf = async () => {
    const el = document.getElementById('pdf-export') as HTMLElement | null;
    if (!el) {
      alert(lang === 'zh' ? '未找到导出容器' : 'Export container not found');
      return;
    }

    const nameFallback = extractContactInfoClient((resumeInput || '').trim()).name || '';
    const rawName = (contactNameEdit || generated?.contactName || nameFallback || '').trim();
    const cleanedName = rawName.replace(/[\\/:*?"<>|]+/g, "").trim();
    const hasName = !!cleanedName;
    const baseName = hasName ? (lang === 'zh' ? `简历-${cleanedName}` : `${cleanedName} Resume`) : (lang === 'zh' ? '简历' : 'Resume');
    const filename = `${baseName}.pdf`;

    // 初始化调试日志
    setExportLogs([]);
    setExporting(true);
    const log = (msg: string, err?: any) => {
      try {
        console[(err ? 'warn' : 'log')](msg, err || '');
        setExportLogs((prev) => [...prev, err ? `${msg}: ${String((err?.message ?? err))}` : msg]);
      } catch {}
    };

    // 将隐藏容器暂时移动到视口内、隐藏显示，以提升 html2canvas 可靠性
    const prev = { position: el.style.position, left: el.style.left, top: el.style.top, visibility: el.style.visibility, pointerEvents: (el.style as any).pointerEvents };
    el.style.position = 'fixed';
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.visibility = 'visible';
    (el.style as any).pointerEvents = 'none';
    log('准备导出并提升容器可见性');

    // 导出前：降级不被解析的颜色函数（lab/oklab/oklch等），避免解析错误
    const containsUnsupported = (s: string | null | undefined) => !!(s && /(oklch|oklab|lab|color\(|display-p3)/i.test(s));
    const restoreList: Array<{ el: HTMLElement; prev: { backgroundImage: string; backgroundColor: string; boxShadow: string; borderColor: string } }> = [];
    try {
      const nodes = Array.from(el.querySelectorAll('*')) as HTMLElement[];
      for (const nd of nodes) {
        const cs = getComputedStyle(nd);
        const bgImg = cs.backgroundImage || '';
        const bgCol = cs.backgroundColor || '';
        const boxSh = cs.boxShadow || '';
        const borCol = cs.borderColor || '';
        if (containsUnsupported(bgImg) || containsUnsupported(bgCol) || containsUnsupported(boxSh) || containsUnsupported(borCol)) {
          restoreList.push({ el: nd, prev: { backgroundImage: nd.style.backgroundImage, backgroundColor: nd.style.backgroundColor, boxShadow: nd.style.boxShadow, borderColor: nd.style.borderColor } });
          // 简化：移除复杂背景图像与阴影；将背景/边框颜色降级为纯色
          nd.style.backgroundImage = 'none';
          // 将背景颜色降级为纯白/浅灰（保版式即可）
          if (containsUnsupported(bgCol)) nd.style.backgroundColor = '#ffffff';
          if (containsUnsupported(boxSh)) nd.style.boxShadow = 'none';
          if (containsUnsupported(borCol)) nd.style.borderColor = '#e5e7eb';
        }
      }
      log('已降级不支持的颜色/阴影以兼容截图');
    } catch (sanitizeErr) {
      log('降级颜色时出现异常（继续导出）', sanitizeErr);
    }

    const tryBundleThenFallback = async () => {
      const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = (e) => reject(e);
        document.head.appendChild(s);
      });

      // 等待字体加载，避免空字形
      try { if ((document as any).fonts?.ready) await (document as any).fonts.ready; } catch {}

      // 调试辅助
      const logWarn = (tag: string, e: any) => { try { console.warn(tag, e); setExportLogs((prev) => [...prev, `${tag}: ${String(e?.message || e)}`]); } catch {} };

      // 1) 首选打包版本（包含 html2canvas/jsPDF）
      log('尝试 html2pdf.bundle.js');
      try {
        const mod = await import('html2pdf.js/dist/html2pdf.bundle.js');
        const html2pdf = (mod as any).default || (mod as any);
        await html2pdf().from(el).set({
          margin: 0,
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], before: '.html2pdf__page-break' },
        }).save();
        return true;
      } catch (e1) {
        logWarn('html2pdf bundle.js 失败，改试 min 版', e1);
      }

      // 2) 退而求其次，尝试最小化打包版本
      log('尝试 html2pdf.bundle.min.js');
      try {
        const mod = await import('html2pdf.js/dist/html2pdf.bundle.min.js');
        const html2pdf = (mod as any).default || (mod as any);
        await html2pdf().from(el).set({
          margin: 0,
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], before: '.html2pdf__page-break' },
        }).save();
        return true;
      } catch (e2) {
        logWarn('min 版失败，尝试 CDN', e2);
        try {
          // 2b) 通过 CDN 加载 html2pdf.bundle.min.js
          await loadScript('https://unpkg.com/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js');
          const html2pdf = (window as any).html2pdf;
          if (html2pdf) {
            await html2pdf().from(el).set({
              margin: 0,
              filename,
              image: { type: 'jpeg', quality: 0.98 },
              html2canvas: { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' },
              jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
              pagebreak: { mode: ['css', 'legacy'], before: '.html2pdf__page-break' },
            }).save();
            return true;
          } else {
            log('CDN 已加载，但未拿到 html2pdf 全局');
          }
        } catch (e2cdn) {
          logWarn('html2pdf CDN 失败，改走手工 jsPDF', e2cdn);
        }
      }

      // 3) 最后兜底：使用 html2canvas + jsPDF 手工拼页（含 CDN 兜底）
      try {
        let html2canvas: any;
        let jsPDF: any;
        try {
          const h2cMod = await import('html2canvas');
          html2canvas = (h2cMod as any).default || (h2cMod as any);
        } catch (eH) {
          console.warn('dynamic import html2canvas failed, try CDN', eH);
          await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
          html2canvas = (window as any).html2canvas;
        }
        try {
          const jspdfMod = await import('jspdf');
          jsPDF = (jspdfMod as any).jsPDF || (jspdfMod as any).default?.jsPDF || (jspdfMod as any);
        } catch (eJ) {
          console.warn('dynamic import jsPDF failed, try CDN', eJ);
          await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
          jsPDF = (window as any).jspdf?.jsPDF || (window as any).jsPDF;
        }

        const pageNodes = Array.from(el.querySelectorAll('[data-pdf-page]')) as HTMLElement[];
        console.log('Manual jsPDF: found page nodes', pageNodes.length);

        if (pageNodes.length > 0) {
          const canvases: HTMLCanvasElement[] = [];
          for (const page of pageNodes) {
            const pageHeight = page.clientHeight || 1056;
            // reset and compute scaling via CSS variables for gaps/fonts
            page.style.setProperty('--fontScale', '1');
            page.style.setProperty('--vGapScale', '1');
            page.style.paddingBottom = '0px';

            const contentHeight1 = page.scrollHeight || pageHeight;
            const target = pageHeight / Math.max(1, contentHeight1);
            const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
            // 字号轻微放大，优先用底部填充，不在中间扩大间距
            const fontScale = clamp(target, 0.95, 1.12);
            let gapScale = clamp(target, 0.95, 1.15);
            // 页面内容偏少（<85%）时，禁用间距扩张，避免中间出现大空白
            if (contentHeight1 < pageHeight * 0.85) gapScale = 1;
            page.style.setProperty('--fontScale', String(fontScale));
            page.style.setProperty('--vGapScale', String(gapScale));
            await new Promise<void>((r) => requestAnimationFrame(() => r()));

            const contentHeight2 = page.scrollHeight || pageHeight;
            const diff = pageHeight - contentHeight2;
            if (diff > 2) {
              page.style.paddingBottom = `${Math.floor(diff)}px`;
            } else if (diff < -8) {
              const adj = pageHeight / contentHeight2;
              const font2 = clamp(fontScale * adj, 0.92, 1.12);
              let gap2 = clamp(gapScale * adj, 0.95, 1.15);
              if (contentHeight2 < pageHeight * 0.85) gap2 = 1;
              page.style.setProperty('--fontScale', String(font2));
              page.style.setProperty('--vGapScale', String(gap2));
              await new Promise<void>((r) => requestAnimationFrame(() => r()));
            }

            const canvas = await html2canvas(page, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' });
            canvases.push(canvas);
          }

          const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
          canvases.forEach((canvas, idx) => {
            const imgData = canvas.toDataURL('image/jpeg', 0.98);
            if (idx > 0) pdf.addPage('letter', 'portrait');
            pdf.addImage(imgData, 'JPEG', 0, 0, 612, 792);
          });
          pdf.save(filename);
          return true;
        }

        // Fallback: capture entire container and split into pages
        const bigCanvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' });
        const imgWidth = 612;
        const imgHeight = bigCanvas.height * (imgWidth / bigCanvas.width);
        const pageHeight = 792;
        let heightLeft = imgHeight;
        let position = 0;
        const bigImgData = bigCanvas.toDataURL('image/jpeg', 0.98);
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
        pdf.addImage(bigImgData, 'JPEG', 0, 0, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        while (heightLeft > 0) {
          pdf.addPage('letter', 'portrait');
          position -= pageHeight;
          pdf.addImage(bigImgData, 'JPEG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
        pdf.save(filename);
        return true;
      } catch (e3) {
        logWarn('手工 jsPDF 拼页失败，尝试 dom-to-image 兜底', e3);
        try {
          // 4) 使用 dom-to-image-more 兜底生成 PNG 并拼接为 PDF
          await loadScript('https://unpkg.com/dom-to-image-more@3.3.7/dist/dom-to-image-more.min.js');
          const domtoimage = (window as any).domtoimage;

          // 确保 jsPDF 可用
          // 优先尝试已在 window 中的 jsPDF（避免 TS 对未声明标识符报错）
          let jsPDFAny: any = (window as any).jspdf?.jsPDF || (window as any).jsPDF || undefined;
          if (!jsPDFAny) {
            try {
              const jspdfMod = await import('jspdf');
              jsPDFAny = (jspdfMod as any).jsPDF || (jspdfMod as any).default?.jsPDF || (jspdfMod as any);
            } catch (eJ2) {
              await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
              jsPDFAny = (window as any).jspdf?.jsPDF || (window as any).jsPDF;
            }
          }

          const pageNodes = Array.from(el.querySelectorAll('[data-pdf-page]')) as HTMLElement[];
          if (pageNodes.length > 0 && domtoimage) {
            const images: string[] = [];
            for (const page of pageNodes) {
              const dataUrl = await domtoimage.toPng(page, { cacheBust: true, bgcolor: '#ffffff', quality: 1 });
              images.push(dataUrl);
            }
            const pdf = new jsPDFAny({ orientation: 'portrait', unit: 'pt', format: 'letter' });
            images.forEach((img, idx) => {
              if (idx > 0) pdf.addPage('letter', 'portrait');
              pdf.addImage(img, 'PNG', 0, 0, 612, 792);
            });
            pdf.save(filename);
            return true;
          }

          // 兜底：整容器截图并分页裁切
          if (domtoimage) {
            const bigImg = await domtoimage.toPng(el, { cacheBust: true, bgcolor: '#ffffff', quality: 1 });
            const pdf = new jsPDFAny({ orientation: 'portrait', unit: 'pt', format: 'letter' });
            const image = new Image();
            await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = bigImg; });
            const imgWidth = 612;
            const scale = imgWidth / image.width;
            const imgHeight = image.height * scale;
            const pageHeight = 792;
            let heightLeft = imgHeight;
            let position = 0;
            pdf.addImage(bigImg, 'PNG', 0, 0, imgWidth, imgHeight);
            heightLeft -= pageHeight;
            while (heightLeft > 0) {
              pdf.addPage('letter', 'portrait');
              position -= pageHeight;
              pdf.addImage(bigImg, 'PNG', 0, position, imgWidth, imgHeight);
              heightLeft -= pageHeight;
            }
            pdf.save(filename);
            return true;
          }
        } catch (e4) {
          logWarn('dom-to-image 兜底失败', e4);
        }
        return false;
      }
    };

    try {
      const ok = await tryBundleThenFallback();
      if (!ok) {
        alert(lang === 'zh' ? '导出 PDF 失败，请尝试“打印/PDF”按钮' : 'Failed to export PDF. Please try Print/PDF');
      }
    } finally {
      // 还原样式
      el.style.position = prev.position;
      el.style.left = prev.left;
      el.style.top = prev.top;
      el.style.visibility = prev.visibility;
      (el.style as any).pointerEvents = prev.pointerEvents;
      // 还原降级过的样式
      try {
        for (const it of restoreList) {
          it.el.style.backgroundImage = it.prev.backgroundImage;
          it.el.style.backgroundColor = it.prev.backgroundColor;
          it.el.style.boxShadow = it.prev.boxShadow;
          it.el.style.borderColor = it.prev.borderColor;
        }
      } catch {}
      setExporting(false);
      setExportLogs((prev) => [...prev, '导出流程结束']);
    }
  };

  // 自动对齐每页数量到已选条目：平均分配到各页，填满前页
  useEffect(() => {
    if (!autoAlignPageCounts) return;
    const total = selectedWorkSorted.length;
    const counts: [number, number, number] = [0, 0, 0];
    let remaining = total;
    for (let i = 0; i < pageCount; i++) {
      const slotsLeft = pageCount - i;
      const per = Math.ceil(remaining / Math.max(1, slotsLeft));
      counts[i] = Math.max(0, per);
      remaining -= per;
    }
    setPageWorkCounts(counts);
  }, [autoAlignPageCounts, selectedWorkSorted.length, pageCount]);

  // 导出为 Word（.docx）：按蓝色分节条风格排版（与第二种风格一致）
  const downloadDocx = async () => {
    try {
      const mod = await import("docx");
      const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        AlignmentType,
        Table,
        TableRow,
        TableCell,
        WidthType,
        PageBreak,
      } = mod as any;

      const infoFallback = extractContactInfoClient((resumeInput || '').trim());
      const extrasFallback = extractContactExtrasClient((resumeInput || '').trim());
      const name = (contactNameEdit || generated?.contactName || infoFallback.name || '').trim();
      const email = (contactEmailEdit || generated?.contactEmail || infoFallback.email || '').trim();
      const phone = (contactPhoneEdit || generated?.contactPhone || infoFallback.phone || '').trim();
      const addr = (contactAddressEdit || extrasFallback.address || '').trim();
      const site = (contactWebsiteEdit || extrasFallback.website || '').trim();
      const summaryCandidateDocx = (summaryEdit || generated?.summary || '').trim();
      const summary = summaryCandidateDocx || (extractSummaryClient((resumeInput || '').trim()) || '');
      const tech = (techSkillsEdit && techSkillsEdit.length ? techSkillsEdit : (generated?.techSkills || []));
      const base = (baseSkillsEdit && baseSkillsEdit.length ? baseSkillsEdit : (generated?.baseSkills || []));
      const edu = (educationEdit || []);
      const work = selectedWorkSorted;

      // 生成前提醒：根据选择的页数与当前经历数量，提示可能的省略或留白
      try {
        const hasRefPre = [referenceName, referencePhone, referenceEmail, referenceCompany, referenceRelationship].some((x) => (x || '').trim().length > 0);
        const totalPre = work.length;
        const nonVolPre = work.filter((w) => !isVolunteerFinal(w)).length;
        const firstCapPre = Math.min(6, nonVolPre);
        const afterFirstPre = Math.max(0, totalPre - firstCapPre);
        const secondTargetPre = hasRefPre ? 7 : 8;
        const secondCapPre = Math.min(secondTargetPre, afterFirstPre);
        const totalCap12Pre = firstCapPre + secondCapPre;
        const needWarnOmit = (pageCount === 1 && totalPre > firstCapPre) || (pageCount === 2 && totalPre > totalCap12Pre);
        const needWarnBlank = (pageCount === 2 && totalPre <= firstCapPre) || (pageCount === 3 && totalPre <= totalCap12Pre);
        const warnZh = needWarnOmit
          ? `当前选择 ${pageCount} 页最多导出 ${pageCount === 1 ? firstCapPre : totalCap12Pre} 条，还有 ${totalPre - (pageCount === 1 ? firstCapPre : totalCap12Pre)} 条不会导出。是否继续？`
          : (needWarnBlank ? `当前内容不足以填满 ${pageCount} 页，最后一页可能留白。是否继续？` : '');
        const warnEn = needWarnOmit
          ? `With ${pageCount} page(s), at most ${pageCount === 1 ? firstCapPre : totalCap12Pre} item(s) will be exported; ${totalPre - (pageCount === 1 ? firstCapPre : totalCap12Pre)} item(s) will be omitted. Continue?`
          : (needWarnBlank ? `Content may not fill ${pageCount} page(s); the last page may have blank space. Continue?` : '');
        if (warnZh || warnEn) {
          const ok = window.confirm(lang === 'zh' ? warnZh : warnEn);
          if (!ok) { return; }
        }
      } catch {}

      const children: any[] = [];
      const addSpacer = (size = 12) => children.push(new Paragraph({ text: "", spacing: { after: size } }));
      const fillToBottom = () => children.push(new Paragraph({ text: "", spacing: { after: 9999 } }));
      const sectionBar = (text: string, spacingBefore = 12, spacingAfter = 6) => {
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { size: 0, color: "FFFFFF" },
              bottom: { size: 0, color: "FFFFFF" },
              left: { size: 0, color: "FFFFFF" },
              right: { size: 0, color: "FFFFFF" },
              insideHorizontal: { size: 0, color: "FFFFFF" },
              insideVertical: { size: 0, color: "FFFFFF" },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    borders: { top: { size: 0, color: "FFFFFF" }, bottom: { size: 0, color: "FFFFFF" }, left: { size: 0, color: "FFFFFF" }, right: { size: 0, color: "FFFFFF" } },
                    shading: { fill: docxAccentFill(selectedColor) },
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text, bold: true })],
                        spacing: { before: spacingBefore, after: spacingAfter },
                      }),
                    ],
                  }),
                  new TableCell({
                    borders: { top: { size: 0, color: "FFFFFF" }, bottom: { size: 0, color: "FFFFFF" }, left: { size: 0, color: "FFFFFF" }, right: { size: 0, color: "FFFFFF" } },
                    shading: { fill: docxAccentFill(selectedColor) },
                    children: [new Paragraph({ text: "" })],
                  }),
                ],
              }),
            ],
          })
        );
      };

      // Title
      if (name) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: name.toUpperCase(), bold: true, size: 56 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 24 },
          })
        );
      }
      const contactLine = [email || null, phone || null, addr || null, site || null].filter(Boolean).join("|");
      if (false && contactLine) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: contactLine, color: "666666", size: 22, smallCaps: true })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
          })
        );
      }

      // Summary
      sectionBar(lang === 'zh' ? '个人简介' : 'PERSONAL SUMMARY');
      if (summary) {
        children.push(new Paragraph({ children: [new TextRun({ text: summary })], spacing: { before: 8, after: 10 } }));
      } else {
        addSpacer(10);
      }

      // Education
      if (edu.length > 0) {
        sectionBar(lang === 'zh' ? '教育经历' : 'EDUCATION');
        for (const e of edu) {
          const degreeField = e.degree
            ? (lang === 'zh' ? `${e.degree}${e.field ? `（${e.field}）` : ''}` : `${e.degree}${e.field ? ` in ${e.field}` : ''}`)
            : (e.field || '');
          const line = [degreeField || null, e.school || null, e.period || null].filter(Boolean).join('|');
          children.push(new Paragraph({ text: line, bullet: { level: 0 }, spacing: { before: 6, after: 4 } }));
        }
        // 依赖 sectionBar 的 spacingBefore 提供分节上方留白
      }

      // Technical Skills
      if (tech.length || base.length) {
        sectionBar(lang === 'zh' ? '技能' : 'TECHNICAL SKILLS', 12, 6);
        if (tech.length) {
          const techStr = lang === 'zh' ? tech.join('、') : tech.join(', ');
          children.push(new Paragraph({ children: [new TextRun({ text: `${lang === 'zh' ? '技术: ' : 'Technical: '}${techStr}` })], spacing: { before: 8, after: 6 } }));
        }
        if (base.length) {
          const baseStr = lang === 'zh' ? base.join('、') : base.join(', ');
          children.push(new Paragraph({ children: [new TextRun({ text: `${lang === 'zh' ? '通用: ' : 'General: '}${baseStr}` })], spacing: { before: 6, after: 8 } }));
        }
      }

      // Work Experience 与 Additional Work Experience：与预览分组一致（含志愿者逻辑）
      const same = (x: WorkItem, y: WorkItem) => (
        (x.role || '') === (y.role || '') &&
        (x.company || '') === (y.company || '') &&
        (x.period || '') === (y.period || '')
      );
      const selectedList = selectedWorkSorted;
      const primaryList = selectedList.filter((w) => (combinedExperience.primary || []).some((p) => same(p, w)) && !isVolunteerFinal(w));
      const additionalNonVolunteer = selectedList.filter((w) => !(combinedExperience.primary || []).some((p) => same(p, w)) && (combinedExperience.additional || []).some((a) => same(a, w)) && !isVolunteerFinal(w));
      const volunteerSelected = selectedList.filter((w) => isVolunteerFinal(w));
      const additionalList = mergeVolunteerIntoAdditional ? [...additionalNonVolunteer, ...volunteerSelected] : additionalNonVolunteer;
      const renderWorkSection = (items: WorkItem[], bulletCap: number) => {
        items.forEach((w, idx) => {
          const zhLabel = '补充经验（基于简历）';
          const enLabel = 'Additional Experience (from Resume)';
          const roleRaw = (w.role || '').trim();
          const normalizedRole = (roleRaw === zhLabel || roleRaw === enLabel)
            ? (lang === 'zh' ? zhLabel : enLabel)
            : (w.role || '');
          const headerLeft = [normalizedRole || null, w.company || null].filter(Boolean).join('|');
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: { top: { size: 0, color: "FFFFFF" }, bottom: { size: 0, color: "FFFFFF" }, left: { size: 0, color: "FFFFFF" }, right: { size: 0, color: "FFFFFF" } },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ borders: { top: { size: 0, color: "FFFFFF" }, left: { size: 0, color: "FFFFFF" }, right: { size: 0, color: "FFFFFF" }, bottom: { size: 1, color: "DDDDDD" } }, children: [ new Paragraph({ children: [new TextRun({ text: headerLeft, bold: true })] }) ] }),
                    new TableCell({ borders: { top: { size: 0, color: "FFFFFF" }, left: { size: 0, color: "FFFFFF" }, right: { size: 0, color: "FFFFFF" }, bottom: { size: 1, color: "DDDDDD" } }, children: [ new Paragraph({ children: [new TextRun({ text: w.period || '' })], alignment: AlignmentType.RIGHT }) ] }),
                  ],
                }),
              ],
            })
          );
          const bullets = (w.bullets || []).filter(Boolean).slice(0, bulletCap);
          const firstBullet = bullets[0];
          const restBullets = bullets.slice(1);
          if (firstBullet) {
            children.push(new Paragraph({ text: firstBullet, bullet: { level: 0 }, spacing: { before: 6, after: 3 } }));
          }
          for (const b of restBullets) {
            children.push(new Paragraph({ text: b, bullet: { level: 0 }, spacing: { before: 6, after: 3 } }));
          }
          if (idx < items.length - 1) addSpacer(12);
        });
      };
      // 严格分页：第一页6个（非志愿者），主经历要点上限6；补充经历要点上限5
      // 第二页与第三页：包含志愿者；无参考人8个，有参考人7个；统一要点上限5
      const hasRef = [referenceName, referencePhone, referenceEmail, referenceCompany, referenceRelationship].some((x) => (x || '').trim().length > 0);
      const firstPageCount = 6;
      const orderedNonVol = [
        ...primaryList,
        ...additionalList,
        ...selectedList.filter((w) => !isVolunteerFinal(w) && !primaryList.includes(w) && !additionalList.includes(w)),
      ];
      const firstPageRaw = orderedNonVol.slice(0, firstPageCount);
      const isPrimaryDocx = (w: WorkItem) => primaryList.some((p) => same(p, w));
      const firstPageItems = firstPageRaw.map((w) => ({ ...w, bullets: (w.bullets || []).filter(Boolean) })) as WorkItem[];

      // 构造剩余候选，包含志愿者
      const keyOf = (w: WorkItem) => `${w.role || ''}|${w.company || ''}|${w.period || ''}`;
      const firstKeys = new Set(firstPageRaw.map(keyOf));
      const restCandidates = selectedList.filter((w) => !firstKeys.has(keyOf(w)));
      const secondTarget = hasRef ? 7 : 8;
      const secondPageItems = restCandidates.slice(0, secondTarget);
      const secondKeys = new Set(secondPageItems.map(keyOf));
      const thirdPageItems = restCandidates.filter((w) => !secondKeys.has(keyOf(w)));

      // 渲染第1页
      if (firstPageItems.length > 0) {
        sectionBar(lang === 'zh' ? '工作经历' : 'WORK EXPERIENCE');
        const firstPrimary = firstPageItems.filter(isPrimaryDocx);
        const firstAdditional = firstPageItems.filter((w) => !isPrimaryDocx(w));
        renderWorkSection(firstPrimary, 6);
        if (firstAdditional.length > 0) {
          sectionBar(lang === 'zh' ? '补充工作经历' : 'ADDITIONAL WORK EXPERIENCE', 12, 6);
          renderWorkSection(firstAdditional, 5);
        }
      }

      // 分页分隔（如果用户选择了多页）
      if (pageCount >= 2) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }

      // 渲染第2页：统一5要点，包含志愿者
      if (pageCount >= 2 && secondPageItems.length > 0) {
        sectionBar(lang === 'zh' ? '工作经历' : 'WORK EXPERIENCE');
        renderWorkSection(secondPageItems, 5);
      }

      if (pageCount >= 3) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }

      // 渲染第3页（如有）：剩余全部，统一要点上限5
      if (pageCount >= 3 && thirdPageItems.length > 0) {
        sectionBar(lang === 'zh' ? '工作经历' : 'WORK EXPERIENCE');
        renderWorkSection(thirdPageItems, 5);
      }

      // References：如果选择3页，强制出现在最后一页
      try {
        if (hasRef) {
          // 如果当前不在最后一页，插入分页再写推荐人
          // 目标：参考人永远位于最后一页的末尾
          // 当 pageCount===1：写在第一页末尾；===2：写在第二页末尾；===3：写在第三页末尾
          // 已按上述在页面块之后追加，无需额外分隔；但保证3页时在第三页
          sectionBar(lang === 'zh' ? '推荐人' : 'REFERENCES', 12, 6);
          const headerLine = [referenceName || null, referenceCompany || null, referenceRelationship || null].filter(Boolean).join(' | ');
          if (headerLine) {
            children.push(new Paragraph({ children: [new TextRun({ text: headerLine })], spacing: { before: 8, after: 4 } }));
          }
          if ((referencePhone || '').trim()) {
            children.push(new Paragraph({ children: [new TextRun({ text: (lang === 'zh' ? '电话：' : 'Phone: ') + referencePhone })], spacing: { before: 2, after: 6 } }));
          }
          if ((referenceEmail || '').trim()) {
            children.push(new Paragraph({ children: [new TextRun({ text: (lang === 'zh' ? '邮箱：' : 'Email: ') + referenceEmail })], spacing: { before: 2, after: 10 } }));
          }
          if (!(referencePhone || '').trim() && !(referenceEmail || '').trim()) {
            addSpacer(10);
          }
        }
      } catch {}

      const doc = new Document({
        styles: {
          default: {
            document: {
              run: { size: 24, font: lang === 'zh' ? 'PingFang SC' : 'Calibri' },
              paragraph: { spacing: { after: 10 } },
            },
          },
        },
        sections: [{
          properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
          children,
        }],
      });
      const blob = await Packer.toBlob(doc);
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      const nameFallback = extractContactInfoClient((resumeInput || '').trim()).name || '';
      const rawName = (contactNameEdit || generated?.contactName || nameFallback || '').trim();
      const cleanedName = rawName.replace(/[\\/:*?"<>|]+/g, "").trim();
      const hasName = !!cleanedName;
      const baseName = hasName ? (lang === 'zh' ? `简历-${cleanedName}` : `${cleanedName} Resume`) : (lang === 'zh' ? '简历' : 'Resume');
      a.download = `${baseName}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("DOCX export failed", e);
      alert(lang === 'zh' ? '导出 Word 失败，请稍后重试' : 'Failed to export Word, please try again');
    }
  };

  // 导出为 ATS 友好版 Word（.docx）：极简结构、纯文本、无表格/色块
  const downloadDocxATS = async () => {
    try {
      const mod = await import("docx");
      const { Document, Packer, Paragraph, TextRun } = mod as any;

      const infoFallback = extractContactInfoClient((resumeInput || '').trim());
      const extrasFallback = extractContactExtrasClient((resumeInput || '').trim());
      const name = (contactNameEdit || generated?.contactName || infoFallback.name || '').trim();
      const email = (contactEmailEdit || generated?.contactEmail || infoFallback.email || '').trim();
      const phone = (contactPhoneEdit || generated?.contactPhone || infoFallback.phone || '').trim();
      const site = (contactWebsiteEdit || extrasFallback.website || '').trim();
      const summaryCandidateDocx = (summaryEdit || generated?.summary || '').trim();
      const summary = summaryCandidateDocx || (extractSummaryClient((resumeInput || '').trim()) || '');
      const tech = (techSkillsEdit && techSkillsEdit.length ? techSkillsEdit : (generated?.techSkills || []));
      const base = (baseSkillsEdit && baseSkillsEdit.length ? baseSkillsEdit : (generated?.baseSkills || []));
      const edu = (educationEdit || []);
      // 与预览分组一致（含志愿者逻辑）
      const same = (x: WorkItem, y: WorkItem) => (
        (x.role || '') === (y.role || '') &&
        (x.company || '') === (y.company || '') &&
        (x.period || '') === (y.period || '')
      );
      const selectedList = selectedWorkSorted;
      const primaryList = selectedList.filter((w) => (combinedExperience.primary || []).some((p) => same(p, w)) && !isVolunteerFinal(w));
      const additionalNonVolunteer = selectedList.filter((w) => !(combinedExperience.primary || []).some((p) => same(p, w)) && (combinedExperience.additional || []).some((a) => same(a, w)) && !isVolunteerFinal(w));
      const volunteerSelected = selectedList.filter((w) => isVolunteerFinal(w));
      const additionalList = mergeVolunteerIntoAdditional ? [...additionalNonVolunteer, ...volunteerSelected] : additionalNonVolunteer;

      const children: any[] = [];
      const addSpacer = (size = 12) => children.push(new Paragraph({ text: "", spacing: { after: size } }));

      if (name) {
        children.push(new Paragraph({ children: [new TextRun({ text: name.toUpperCase(), bold: true, size: 48 })] }));
        addSpacer(6);
      }
      const contactParts = [email || null, phone || null, site || null].filter(Boolean);
      if (contactParts.length) {
        children.push(new Paragraph({ children: [new TextRun({ text: contactParts.join(" | ") })] }));
        addSpacer(12);
      }

      children.push(new Paragraph({ children: [new TextRun({ text: (lang === 'zh' ? '个人简介' : 'Personal Summary'), bold: true })] }));
      if (summary) {
        children.push(new Paragraph({ children: [new TextRun({ text: summary })] }));
      }
      addSpacer(8);

      if (edu.length > 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: (lang === 'zh' ? '教育经历' : 'Education'), bold: true })] }));
        for (const e of edu) {
          const degreeField = e.degree
            ? (lang === 'zh' ? `${e.degree}${e.field ? `（${e.field}）` : ''}` : `${e.degree}${e.field ? ` in ${e.field}` : ''}`)
            : (e.field || '');
          const line = [degreeField || null, e.school || null, e.period || null].filter(Boolean).join(' | ');
          children.push(new Paragraph({ text: line }));
        }
        addSpacer(8);
      }

      if (tech.length || base.length) {
        children.push(new Paragraph({ children: [new TextRun({ text: (lang === 'zh' ? '技能' : 'Technical Skills'), bold: true })] }));
        if (tech.length) children.push(new Paragraph({ text: (lang === 'zh' ? '技术: ' : 'Technical: ') + (lang === 'zh' ? tech.join('、') : tech.join(', ')) }));
        if (base.length) children.push(new Paragraph({ text: (lang === 'zh' ? '通用: ' : 'General: ') + (lang === 'zh' ? base.join('、') : base.join(', ')) }));
        addSpacer(8);
      }

      if (primaryList.length > 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: (lang === 'zh' ? '工作经历' : 'Work Experience'), bold: true })] }));
        primaryList.forEach((w) => {
          const headerLeft = [w.role || null, w.company || null].filter(Boolean).join(' | ');
          const headerLine = [headerLeft || null, w.period || null].filter(Boolean).join(' — ');
          if (headerLine) children.push(new Paragraph({ children: [new TextRun({ text: headerLine, bold: true })] }));
          for (const b of (w.bullets || []).filter(Boolean).slice(0, jdBulletCount)) children.push(new Paragraph({ text: b }));
          addSpacer(6);
        });
      }

      if (additionalList.length > 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: (lang === 'zh' ? '补充工作经历' : 'Additional Work Experience'), bold: true })] }));
        additionalList.forEach((w) => {
          const headerLeft = [w.role || null, w.company || null].filter(Boolean).join(' | ');
          const headerLine = [headerLeft || null, w.period || null].filter(Boolean).join(' — ');
          if (headerLine) children.push(new Paragraph({ children: [new TextRun({ text: headerLine, bold: true })] }));
          for (const b of (w.bullets || []).filter(Boolean).slice(0, jdBulletCount)) children.push(new Paragraph({ text: b }));
          addSpacer(6);
        });
      }

      if ((separateVolunteerPreview && !mergeVolunteerIntoAdditional) && volunteerSelected.length > 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: (lang === 'zh' ? '志愿者经历' : 'Volunteer Experience'), bold: true })] }));
        volunteerSelected.forEach((w) => {
          const headerLeft = [w.role || null, w.company || null].filter(Boolean).join(' | ');
          const headerLine = [headerLeft || null, w.period || null].filter(Boolean).join(' — ');
          if (headerLine) children.push(new Paragraph({ children: [new TextRun({ text: headerLine, bold: true })] }));
          for (const b of (w.bullets || []).filter(Boolean).slice(0, jdBulletCount)) children.push(new Paragraph({ text: b }));
          addSpacer(6);
        });
      }

      const doc = new Document({
        styles: { default: { document: { run: { size: 24, font: lang === 'zh' ? 'PingFang SC' : 'Calibri' } } } },
        sections: [{ children }],
      });
      const blob = await Packer.toBlob(doc);
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      const nameFallback = extractContactInfoClient((resumeInput || '').trim()).name || '';
      const rawName = (contactNameEdit || generated?.contactName || nameFallback || '').trim();
      const cleanedName = rawName.replace(/[\\/:*?"<>|]+/g, "").trim();
      const hasName = !!cleanedName;
      const baseName = hasName ? (lang === 'zh' ? `简历-ATS-${cleanedName}` : `${cleanedName} Resume ATS`) : (lang === 'zh' ? '简历-ATS' : 'Resume ATS');
      a.download = `${baseName}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("ATS DOCX export failed", e);
      alert(lang === 'zh' ? '导出 ATS Word 失败，请稍后重试' : 'Failed to export ATS Word, please try again');
    }
  };

  // -------- PDF 转换：将已选择的 PDF 直接转换为 TXT 或 Word --------
  const convertPdf = async (format: 'txt' | 'docx') => {
    try {
      if (!uploadedFile || !uploadedFile.name.toLowerCase().endsWith('.pdf')) {
        alert(lang === 'zh' ? '请先选择 PDF 文件' : 'Please choose a PDF first');
        return;
      }
      const fd = new FormData();
      fd.append('file', uploadedFile);
      fd.append('format', format);
      const res = await fetch('/api/convert', { method: 'POST', body: fd });
      if (!res.ok) {
        let msg = res.statusText;
        try { const data = await res.json(); msg = (data?.error as string) || msg; } catch {}
        alert(msg || (lang === 'zh' ? '转换失败' : 'Conversion failed'));
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      const base = uploadedFile.name.replace(/\.pdf$/i, '') || 'converted';
      a.download = format === 'txt' ? `${base}-converted.txt` : `${base}-converted.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error('PDF 转换失败', e);
      alert(e?.message || (lang === 'zh' ? '转换失败，请稍后重试' : 'Conversion failed, please try again'));
    }
  };
  const convertPdfToTxt = () => convertPdf('txt');
  const convertPdfToWord = () => convertPdf('docx');

  // -------- 使用浏览器端 OCR 将 PDF 识别并导出 TXT/Word（带简单排版） --------
  const tidyOcrText = (raw: string): string => {
    const lines = (raw || "").split(/\r?\n/).map((l) => l.trim());
    const merged: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const cur = lines[i];
      if (!cur) { merged.push(""); continue; }
      const next = lines[i + 1] || "";
      const endPunct = /[.!?;。，！？；]$/.test(cur);
      const joinable = /[A-Za-z0-9]$/.test(cur) && /^[A-Za-z0-9]/.test(next) && !endPunct;
      if (joinable) { merged.push(cur + " " + next); i++; } else { merged.push(cur); }
    }
    return merged.join("\n").replace(/\s{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
  };

  const ocrExport = async (format: 'txt' | 'docx') => {
    try {
      if (!uploadedFile || !uploadedFile.name.toLowerCase().endsWith('.pdf')) {
        alert(lang === 'zh' ? '请先选择 PDF 文件' : 'Please choose a PDF first');
        return;
      }
      setOcrRunning(true);
      setOcrProgress(0);
      const langs = (ocrLangPref === 'auto') ? undefined : ocrLangPref;
      const pages = Math.max(1, Math.min(10, ocrPages || 6));
    // 先使用服务端 OCR，提高稳定性与速度
    let textRaw = '';
    try {
      textRaw = await ocrPdfOnServer(uploadedFile, pages, langs);
    } catch (e) {
      // 回退到浏览器 OCR（在极端网络/CSP 下）
      alert(lang === 'zh' ? '服务端 OCR 失败，请稍后重试，或粘贴文本/上传 DOCX/TXT' : 'Server OCR failed; please retry later or paste text/upload DOCX/TXT');
      setOcrRunning(false);
      return;
    }
      const text = tidyOcrText(textRaw || "");
      if (!text || text.trim().length < 10) {
        alert(lang === 'zh' ? 'OCR 未识别到有效文本' : 'OCR did not extract usable text');
        return;
      }
      const base = uploadedFile.name.replace(/\.pdf$/i, '') || 'converted';
      if (format === 'txt') {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url; a.download = `${base}-ocr.txt`; a.click();
        URL.revokeObjectURL(url);
      } else {
        const mod = await import('docx');
        const { Document, Packer, Paragraph, TextRun } = mod as any;
        const lines = text.split(/\r?\n/);
        const children = lines.map((line) => {
          const isHeader = /(summary|experience|education|skills|projects|references|profile|objective|工作经历|教育经历|技能|摘要|概述)/i.test(line);
          const isBullet = /^\s*(•|\-|·|\u2022)\s*/.test(line);
          if (isHeader) return new Paragraph({ children: [new TextRun({ text: line, bold: true })], spacing: { after: 6 } });
          if (isBullet) return new Paragraph({ text: line.replace(/^\s*(•|\-|·|\u2022)\s*/, ''), bullet: { level: 0 }, spacing: { after: 4 } });
          return new Paragraph({ text: line, spacing: { after: 6 } });
        });
        const doc = new Document({ styles: { default: { document: { run: { size: 24, font: lang === 'zh' ? 'PingFang SC' : 'Calibri' } } } }, sections: [{ children }] });
        const blob = await Packer.toBlob(doc);
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url; a.download = `${base}-ocr.docx`; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      console.error('OCR 导出失败', e);
      alert(e?.message || (lang === 'zh' ? 'OCR 导出失败，请稍后重试' : 'OCR export failed'));
    } finally {
      setOcrRunning(false);
    }
  };

  const ocrPdfToTxt = () => ocrExport('txt');
  const ocrPdfToWord = () => ocrExport('docx');

  // 一键分析：根据 JD 与简历文本/解析结果分类技能并给出缺口
  const [skillsAnalysis, setSkillsAnalysis] = useState<{
    hard: string[];
    soft: string[];
    missingHard: string[];
    missingSoft: string[];
  } | null>(null);
  useEffect(() => {
    if (loading) return;
    setShowAnalysis(false);
    setSkillsAnalysis(null);
  }, [resumeInput, jdInput, uploadedFile]);
  // 软技能提示词（中英文混合，尽量覆盖常见软技能表达）
  const SOFT_HINTS = [
    'communication', 'teamwork', 'collaboration', 'leadership', 'adaptability', 'problem',
    'supportive', 'time management', 'attention to detail', 'interpersonal', 'stakeholder',
    'customer service', 'service', 'client', 'clients', '协调', '沟通', '协作', '领导', '适应', '细节', '客户服务'
  ];
  // 常见硬技能/工具/通用能力提示（英文为主，覆盖办公/技术/运营）
  const HARD_HINTS = [
    'sql','excel','word','powerpoint','outlook','spreadsheet','pivot','vlookup',
    'python','javascript','typescript','java','c++','c#','node','react','next.js','vue','angular',
    'aws','azure','gcp','cloud','linux','windows','macos','docker','kubernetes','git',
    'crm','zendesk','salesforce','sap','tableau','power bi','notion','jira','asana','monday.com',
    'figma','canva','photoshop','illustrator','premiere','after effects',
    'google ads','facebook ads','meta ads','seo','sem','google analytics','ga4','social media','social media management',
    'content creation','copywriting','graphic design','video editing',
    'data entry','order processing','inventory','warehouse','logistics','dispatch','routing','route planning',
    'cash handling','pos','point of sale','billing','invoicing','typing',
    'safety','compliance','manual handling','forklift','license','driver license','driving license'
  ];
  // 排除词：公司宣传/地域/形容词/职位称谓等非技能词
  const NON_SKILL_WORDS = new Set([
    'largest','fastest','growing','largest fastest-growing','fastest-growing','australia','australian',
    'officer','capital','transport','courier','taxi','truck','business','culture','any','issues','fun',
  ]);
  const toNorm = (s: string) => s.trim().toLowerCase();
  const containsAny = (s: string, arr: string[]) => arr.some((h) => toNorm(s).includes(toNorm(h)));
  const isHardSkillLike = (s: string) => {
    const t = toNorm(s);
    if (!t || NON_SKILL_WORDS.has(t)) return false;
    if (containsAny(t, HARD_HINTS)) return true;
    // 形状启发式：包含符号或显著技术缩写
    if (/\b(crm|sql|aws|gcp|sap|git|pos)\b/.test(t)) return true;
    if (/[+#\.]/.test(t)) return true; // C#, C++, Next.js 等
    if (/\b(management|planning|analys\w*|design\w*|develop\w*|support|troubleshoot\w*|mainten\w*|compliance|inventory|logistics|dispatch|routing|warehouse)\b/.test(t)) return true;
    // 保守：未命中任何提示或形状，不认为是技能
    return false;
  };
  // 从简历文本中识别技能（技术/基础）
  const extractSkillsFromResumeClient = (text: string): { tech: string[]; base: string[] } => {
    const tokens = topTermsClient(text, 40, 20, 10);
    const tech: string[] = [];
    const base: string[] = [];
    for (const token of tokens) {
      if (isHardSkillLike(token)) {
        tech.push(token.replace(/\s+/g, ' ').trim());
      } else if (containsAny(token, SOFT_HINTS)) {
        base.push(token.replace(/\s+/g, ' ').trim());
      }
    }
    return { tech: Array.from(new Set(tech)), base: Array.from(new Set(base)) };
  };
  const doSkillsAnalysis = (jdRaw: string[], resumeTech: string[], resumeBase: string[]) => {
    const uniq = (arr: string[]) => Array.from(new Set((arr || []).filter(Boolean)));
    const jdSoft = jdRaw.filter((s) => containsAny(s, SOFT_HINTS));
    const jdHard = jdRaw.filter((s) => !containsAny(s, SOFT_HINTS) && isHardSkillLike(s));
    const resumeSoftAuto = resumeTech.filter((s) => containsAny(s, SOFT_HINTS));
    const resumeHardAuto = resumeTech.filter((s) => isHardSkillLike(s));
    const resumeSoft = uniq([...resumeBase, ...resumeSoftAuto]);
    const resumeHard = uniq(resumeHardAuto);
    const rHardSet = new Set(resumeHard.map(toNorm));
    const rSoftSet = new Set(resumeSoft.map(toNorm));
    const missingHard = jdHard.filter((s) => !rHardSet.has(toNorm(s)));
    const missingSoft = jdSoft.filter((s) => !rSoftSet.has(toNorm(s)));
    return {
      hard: uniq(jdHard),
      soft: uniq(jdSoft),
      missingHard: uniq(missingHard),
      missingSoft: uniq(missingSoft),
    };
  };
  const handleAnalyze = () => {
    try {
      // JD 侧：优先用解析出的 jdSkills；没有则从 JD 文本提取高频词
      const uniq = (arr: string[]) => Array.from(new Set((arr || []).filter(Boolean)));
      const jdRaw = (generated?.jdSkills && generated.jdSkills.length > 0)
        ? uniq(generated.jdSkills)
        : uniq(topTermsClient(jdInput || '', 18, 10, 6));
      // 简历侧：优先用解析出的 tech/base；没有则从简历文本提取关键词
      const resumeTech = (generated?.techSkills && generated.techSkills.length > 0)
        ? uniq(generated.techSkills)
        : uniq(topKeywordsClient(resumeInput || '', 30));
      const resumeBase = (generated?.baseSkills && generated.baseSkills.length > 0)
        ? uniq(generated.baseSkills)
        : [];
      setSkillsAnalysis(doSkillsAnalysis(jdRaw, resumeTech, resumeBase));
    } catch (e: any) {
      setError(e?.message || (lang === 'zh' ? '分析失败，请稍后重试' : 'Analyze failed, please retry'));
    }
  };

  // 已移除：生成技能 JSON 功能（按用户反馈不需要）

  // 合并：生成 + 分析，一键完成
  const handleGenerateAnalyze = async () => {
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    let timer: any;
    try {
      const fd = new FormData();
      if (uploadedFile) {
        fd.append("file", uploadedFile);
        // 有文件时，不再发送文本，避免旧文本覆盖新文件
      } else if (resumeInput.trim()) {
        fd.append("text", resumeInput.trim());
      }
      if (jdInput.trim()) fd.append("jd", jdInput.trim());
      timer = setTimeout(() => ctrl.abort(), 60000);
      const res = await fetch("/api/extract", { method: "POST", body: fd, signal: ctrl.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);
      setExtracted(data);
      // 使用服务端返回的最新文本；若为空则不再回退到旧文本
      setResumeInput(typeof data?.text === 'string' ? data.text : "");
      // 回退：若服务端工作经历为空，尝试用前端解析填充编辑态（不干预选中状态）
      try {
        const serverWork = (data?.workExperience || []) as WorkItem[];
        if ((!serverWork || serverWork.length === 0)) {
          const fallback = parseWorkExperienceClient((data?.text || resumeInput || '').trim());
          if (fallback && fallback.length > 0) {
            setEditedWork(fallback);
            // 若当前没有任何选择，默认全选以便后续预览/分析
            setSelectedWork((prev) => (prev && prev.some(Boolean)) ? prev : new Array(fallback.length).fill(true));
          }
        }
        // 服务端有数据时，若当前选择为空则默认全选，避免“无匹配经历”
        if (serverWork && serverWork.length > 0) {
          setSelectedWork((prev) => (prev && prev.some(Boolean)) ? prev : new Array(serverWork.length).fill(true));
        }
      } catch {}
      // 生成+分析阶段：保证总能得到待分析的工作项与JD文本
      let work = (data?.workExperience || []) as WorkItem[];
      // 保持当前选中状态，不在分析阶段重置；默认勾选在预览/推荐逻辑触发
      // （若解析后的经历数量发生变化，其他 effect 会在需要时进行对齐）
      // 直接基于返回数据执行分析，避免等待状态刷新
      const uniq = (arr: string[]) => Array.from(new Set((arr || []).filter(Boolean)));
      const jdRaw = (data?.jdKeywords && data.jdKeywords.length > 0)
        ? uniq(data.jdKeywords)
        : ((data?.jdSkills && data.jdSkills.length > 0) ? uniq(data.jdSkills) : uniq(topTermsClient((data?.jd || jdInput || ''), 18, 10, 6)));
      const resumeTech = (data?.techSkills && data.techSkills.length > 0)
        ? uniq(data.techSkills)
        : uniq(topKeywordsClient((data?.text || resumeInput || ''), 30));
      const resumeBase = (data?.baseSkills && data.baseSkills.length > 0) ? uniq(data.baseSkills) : [];
      setSkillsAnalysis(doSkillsAnalysis(jdRaw, resumeTech, resumeBase));
      // 新增：在生成+分析后保证匹配经历可用（若当前没有任何选择则默认勾选）
      try {
        let jdTextUsed = (data?.jd || jdInput || '').trim();
        const baseWork: WorkItem[] = Array.isArray(data?.workExperience) ? (data!.workExperience as WorkItem[]) : [];
        const chosenExists = selectedWork && selectedWork.some(Boolean);
        let srcWork = (baseWork.length > 0) ? baseWork : editedWork;
        if ((!chosenExists || srcWork.length === 0)) {
          const ensured = ensureWorkAndJDFallback(srcWork, (data?.text || resumeInput || '').trim(), jdTextUsed);
          srcWork = ensured.work;
          jdTextUsed = ensured.jdText;
        }
        const selectionAligned = Array.isArray(selectedWork) && selectedWork.length === srcWork.length;
        if (!chosenExists || !selectionAligned) {
          const summaryLocal = computeCoverageSummaryClient(srcWork, jdTextUsed);
          const combinedLocal = combineExperienceForResumeClient(srcWork, summaryLocal, 2, 1, jdTextUsed);
          const toIndex = (w: WorkItem) => srcWork.findIndex((y) => (
            y === w || (y.id && (w as any).id && y.id === (w as any).id) || (
              (y.role || '') === (w.role || '') &&
              (y.company || '') === (w.company || '') &&
              (y.period || '') === (w.period || '')
            )
          ));
          const chosenIdx = (combinedLocal.primary || []).map(toIndex).filter((i) => i >= 0);
          // 若推荐为空，不清空选择；改为默认全选，避免 0% 覆盖与“无匹配”观感
          if (chosenIdx.length > 0) {
            setSelectedWork(new Array(srcWork.length).fill(false).map((_, i) => chosenIdx.includes(i)));
          } else {
            setSelectedWork(new Array(srcWork.length).fill(true));
          }
        }
      } catch {}
    } catch (e: any) {
      setError(e?.message || "解析失败，请稍后重试");
    } finally {
      try { if (timer) clearTimeout(timer); } catch {}
      setShowAnalysis(true);
      setLoading(false);
    }
  };


  // 选择文件后自动解析并填充简历文本
  const autoExtract = async (file: File) => {
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    let timer: any;
    try {
      const fd = new FormData();
      fd.append("file", file);
      timer = setTimeout(() => ctrl.abort(), 60000);
      const res = await fetch("/api/extract", { method: "POST", body: fd, signal: ctrl.signal });
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || /pdf$/i.test(file.type || '');
      let data: any = null;
      try { data = await res.json(); } catch {}
      if (res.ok) {
        setExtracted(data);
        const serverText = data?.text || "";
        setResumeInput(serverText);
        // 若服务端无法从PDF提取文本，自动提示并展开“粘贴简历文本”回退
        if (!data?.text || (typeof data.text === 'string' && data.text.trim().length === 0)) {
          // 直接解析失败：若为 PDF，自动尝试 OCR 回退
          if (isPdf) {
            try {
              setError(lang === 'zh' ? '检测到扫描/图片 PDF，正在尝试 OCR…' : 'Looks like scanned PDF, trying OCR…');
              setOcrRunning(true);
              setOcrProgress(0);
              const langs = (ocrLangPref === 'auto') ? undefined : ocrLangPref;
              const pages = Math.max(1, Math.min(10, ocrPages || 6));
      let ocrText = '';
      try {
        ocrText = await ocrPdfOnServer(file, pages, langs);
      } catch (e) {
        setShowResumeInput(true);
        setError(lang === 'zh' ? 'OCR 识别失败，请粘贴简历文本或上传 DOCX/TXT' : 'OCR failed; please paste resume text or upload DOCX/TXT');
        ocrText = '';
      }
              if (ocrText && ocrText.trim().length >= 10) {
                setResumeInput(ocrText);
                setShowResumeInput(true);
                setError(lang === 'zh' ? '已通过 OCR 识别并填充文本，请检查后继续分析。' : 'OCR extracted text; please review then analyze.');
              } else {
                setShowResumeInput(true);
                setError((data?.error as string) || (lang === 'zh' ? '无法提取文本，OCR 也未识别到有效内容。请粘贴简历或上传 docx/txt。' : 'Cannot extract text, OCR found no usable content. Please paste text or upload DOCX/TXT.'));
              }
            } catch (e: any) {
              setShowResumeInput(true);
              setError(e?.message || (lang === 'zh' ? 'OCR 识别失败，请粘贴简历或上传 docx/txt' : 'OCR failed; please paste text or upload DOCX/TXT'));
            } finally {
              setOcrRunning(false);
            }
          } else {
            setShowResumeInput(true);
            setError((data?.error as string) || (lang === 'zh' ? '无法从该文件提取文本，请粘贴简历或上传docx/txt' : 'Cannot extract text. Please paste resume or upload DOCX/TXT'));
          }
        }
      } else {
        // 服务端返回错误（常见于扫描/图片 PDF）。若为 PDF，直接尝试浏览器 OCR 回退
        if (isPdf) {
          try {
            setError(lang === 'zh' ? '服务器无法提取文本，正在尝试服务端 OCR…' : 'Server could not extract text, trying server-side OCR…');
            setOcrRunning(true);
            setOcrProgress(0);
            const langs = (ocrLangPref === 'auto') ? undefined : ocrLangPref;
            const pages = Math.max(1, Math.min(10, ocrPages || 6));
      let ocrText = '';
      try {
        ocrText = await ocrPdfOnServer(file, pages, langs);
      } catch (e) {
        setShowResumeInput(true);
        setError(lang === 'zh' ? 'OCR 识别失败，请粘贴简历文本或上传 DOCX/TXT' : 'OCR failed; please paste resume text or upload DOCX/TXT');
        ocrText = '';
      }
            if (ocrText && ocrText.trim().length >= 10) {
              setResumeInput(ocrText);
              setShowResumeInput(true);
              setError(lang === 'zh' ? '已通过 OCR 识别并填充文本，请检查后继续分析。' : 'OCR extracted text; please review then analyze.');
            } else {
              setShowResumeInput(true);
              setError((data?.error as string) || (lang === 'zh' ? 'OCR 未识别到有效文本，请改为粘贴或上传 docx/txt' : 'OCR did not extract usable text; please paste or upload DOCX/TXT'));
            }
          } catch (e: any) {
            setShowResumeInput(true);
            setError(e?.message || (data?.error || res.statusText) || (lang === 'zh' ? 'OCR 识别失败，请尝试粘贴文本或上传 docx/txt' : 'OCR failed; please paste text or upload DOCX/TXT'));
          } finally {
            setOcrRunning(false);
          }
        } else {
          // 非 PDF：直接提示错误并展开文本输入
          setError((data?.error || res.statusText) || (lang === 'zh' ? '解析失败，请尝试粘贴文本或上传 docx/txt' : 'Parsing failed; please paste text or upload DOCX/TXT'));
          setShowResumeInput(true);
        }
      }
      const serverWork = (data?.workExperience || []) as WorkItem[];
      if (serverWork.length > 0) {
        setSelectedWork(new Array(serverWork.length).fill(true));
      } else {
        // 服务端为空时，使用前端解析并默认全选
        try {
          const fallback = parseWorkExperienceClient((data?.text || '').trim());
          if (fallback && fallback.length > 0) {
            setEditedWork(fallback);
            setSelectedWork(new Array(fallback.length).fill(true));
          } else {
            setSelectedWork([]);
          }
        } catch {
          setSelectedWork([]);
        }
      }
    } catch (e: any) {
      setError(e?.message || "解析失败，请稍后重试");
      // 解析失败时自动展开“粘贴简历文本”作为回退
      setShowResumeInput(true);
      // 如果是 PDF，尝试自动 OCR 作为进一步回退
      try {
        const isPdf = file.name.toLowerCase().endsWith('.pdf') || /pdf$/i.test(file.type || '');
        if (isPdf) {
          setOcrRunning(true);
          setOcrProgress(0);
          const langs = (ocrLangPref === 'auto') ? undefined : ocrLangPref;
          const pages = Math.max(1, Math.min(10, ocrPages || 6));
      let ocrText = '';
      try {
        ocrText = await ocrPdfOnServer(file, pages, langs);
      } catch (e) {
        setShowResumeInput(true);
        setError(lang === 'zh' ? 'OCR 识别失败，请粘贴简历文本或上传 DOCX/TXT' : 'OCR failed; please paste resume text or upload DOCX/TXT');
        ocrText = '';
      }
          if (ocrText && ocrText.trim().length >= 10) {
            setResumeInput(ocrText);
            setError(lang === 'zh' ? '已通过 OCR 识别并填充文本，请检查后继续分析。' : 'OCR extracted text; please review then analyze.');
          }
        }
      } catch (e2: any) {
        // 保持原有错误提示，不再覆盖
      } finally {
        setOcrRunning(false);
      }
    } finally {
      try { if (timer) clearTimeout(timer); } catch {}
      setLoading(false);
    }
  };

  // 针对单个文件的分析（附带当前 JD），结果存入批量映射
  const analyzeOneWithJD = async (file: File) => {
    const name = file?.name || `file-${Date.now()}`;
    setBatchStatus((s) => ({ ...s, [name]: 'in_progress' }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (jdInput && jdInput.trim().length > 0) fd.append('jd', jdInput.trim());
      const res = await fetch('/api/extract', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);
      setBatchResults((r) => ({ ...r, [name]: data }));
      setBatchStatus((s) => ({ ...s, [name]: 'done' }));
      if (!data?.text || (typeof data.text === 'string' && data.text.trim().length === 0)) {
        setShowResumeInput(true);
        setError((data?.error as string) || (lang === 'zh' ? '无法从该文件提取文本，请粘贴简历或上传docx/txt' : 'Cannot extract text. Please paste resume or upload DOCX/TXT'));
      }
    } catch (e: any) {
      setBatchStatus((s) => ({ ...s, [name]: 'error' }));
      setError(e?.message || (lang === 'zh' ? '分析失败，请稍后重试' : 'Analyze failed, please retry'));
      setShowResumeInput(true);
    }
  };

  // 批量分析已选择的所有简历
  const analyzeAllWithJD = async () => {
    for (const f of uploadedFiles) {
      // 顺序执行以避免并发资源拥塞；如需提速可并发
      /* eslint-disable no-await-in-loop */
      await analyzeOneWithJD(f);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    let timer: any;
    try {
      const fd = new FormData();
      if (uploadedFile) {
        fd.append("file", uploadedFile);
      } else if (resumeInput.trim()) {
        fd.append("text", resumeInput.trim());
      }
      if (jdInput.trim()) fd.append("jd", jdInput.trim());
      timer = setTimeout(() => ctrl.abort(), 60000);
      const res = await fetch("/api/extract", { method: "POST", body: fd, signal: ctrl.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);
      setExtracted(data);
      // 使用服务端返回的最新文本；若为空则不再回退到旧文本
      setResumeInput(typeof data?.text === 'string' ? data.text : "");
      const serverWork = (data?.workExperience || []) as WorkItem[];
      if (serverWork.length > 0) {
        setSelectedWork(new Array(serverWork.length).fill(true));
      } else {
        // 服务端为空时，使用前端解析并默认全选
        try {
          const fallback = parseWorkExperienceClient((data?.text || resumeInput || '').trim());
          if (fallback && fallback.length > 0) {
            setEditedWork(fallback);
            setSelectedWork(new Array(fallback.length).fill(true));
          } else {
            setSelectedWork([]);
          }
        } catch {
          setSelectedWork([]);
        }
      }
    } catch (e: any) {
      setError(e?.message || "解析失败，请稍后重试");
    } finally {
      try { if (timer) clearTimeout(timer); } catch {}
      setLoading(false);
    }
  };

  // 一键根据 JD 与经历生成自我介绍
  const handleGenerateSummary = () => {
    try {
      const jdText = (jdInput || '').trim();
      const base = (editedWork && editedWork.length > 0) ? editedWork : (generated?.workExperience || []);
      const srcWork = (selectedWork && selectedWork.some(Boolean)) ? (editedWork || []).filter((_, i) => selectedWork[i]) : base;
      let s: string | undefined = undefined;
      if (jdText && srcWork.length > 0) {
        const targetLang = detectLangFromTextClient((resumeInput || '').trim());
        s = generateSummaryFromJDClient(srcWork, jdText, targetLang);
      }
      if (!s) {
        s = extractSummaryClient((resumeInput || '').trim());
      }
      if (s) setSummaryEdit(s);
    } catch {
      // ignore errors; keep user's current input
    }
  };
  // 从简历文本识别并填充联系方式（仅在对应字段为空时填充）
  const handleAutoFillContact = () => {
    try {
      const text = (resumeInput || '').trim();
      if (!text) return;
      const info = extractContactInfoClient(text);
      const extras = extractContactExtrasClient(text);
      if (info?.name && !contactNameEdit) setContactNameEdit(info.name);
      if (info?.email && !contactEmailEdit) setContactEmailEdit(info.email);
      if (info?.phone && !contactPhoneEdit) setContactPhoneEdit(info.phone);
      if (extras?.address && !contactAddressEdit) setContactAddressEdit(extras.address);
      if (extras?.website && !contactWebsiteEdit) setContactWebsiteEdit(extras.website);
    } catch {
      // ignore errors to avoid interrupting user input
    }
  };
  // 识别技能并填充到输入框
  const handleExtractSkills = () => {
    const text = (resumeInput || '').trim();
    if (!text) return;
    const { tech, base } = extractSkillsFromResumeClient(text);
    if (tech.length > 0) setTechSkillsEdit(tech);
    if (base.length > 0) setBaseSkillsEdit(base);
  };

  // 清空 JD 文本并移除本地缓存
  const handleClearJD = () => {
    try { if (typeof window !== 'undefined') localStorage.removeItem('jd-input'); } catch {}
    setJdInput("");
  };

  // 清空会话：移除主要本地缓存并重置关键状态
  const handleResetSession = () => {
    try {
      if (typeof window !== 'undefined') {
        const keys = [
          'resume-input','jd-input','edited-work','selected-work','contact-name','contact-email','contact-phone',
          'contact-address','contact-website','summary-edit','tech-skills','base-skills','education-edit'
        ];
        for (const k of keys) localStorage.removeItem(k);
      }
    } catch {}
    setResumeInput("");
    setJdInput("");
    setExtracted(null);
    setEditedWork([]);
    setSelectedWork([]);
    setError(null);
    setShowAnalysis(false);
    setUploadedFile(null);
    setShowPreview(false);
  };

  // 从简历文本识别教育经历并填充到编辑区（覆盖现有为空的情况；若已有内容则追加）
  const handleExtractEducation = () => {
    const text = (resumeInput || '').trim();
    if (!text) return;
    const items = extractEducationClient(text);
    if (items.length === 0) return;
    setEducationEdit((prev) => {
      if (!prev || prev.length === 0) return items;
      // 追加去重
      const seen = new Set(prev.map((e) => `${(e.school||'').toLowerCase()}|${(e.degree||'').toLowerCase()}|${(e.period||'').toLowerCase()}`));
      const append = items.filter((e) => {
        const key = `${(e.school||'').toLowerCase()}|${(e.degree||'').toLowerCase()}|${(e.period||'').toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return [...prev, ...append];
    });
  };

  // 从简历识别志愿者经验并加入 Selected Experience（仅在用户点击时执行）
  const handleImportVolunteersFromResume = async () => {
    try {
      // 优先使用已解析数据；若不存在则触发解析
      let work: WorkItem[] = Array.isArray(extracted?.workExperience) ? (extracted!.workExperience as WorkItem[]) : [];
      if (!work || work.length === 0) {
        const fd = new FormData();
        if (uploadedFile) fd.append("file", uploadedFile);
        const text = (resumeInput || '').trim();
        if (text) fd.append("text", text);
        const res = await fetch("/api/extract", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || res.statusText);
        setExtracted(data);
        work = (data?.workExperience || []) as WorkItem[];
        if (!resumeInput && data?.text) setResumeInput(data.text);
      }
      const volunteers = (work || []).filter((w) => isVolunteerFinal(w));
      if (!volunteers || volunteers.length === 0) return;
      setEditedWork((prev) => {
        const next = [...prev];
        const norm = (s?: string) => (s || '').replace(/[.,;\s]+$/,'').trim().toLowerCase();
        const exists = (x: WorkItem, y: WorkItem) => (
          norm(x.role) === norm(y.role) &&
          norm(x.company) === norm(y.company) &&
          norm(x.period) === norm(y.period)
        );
        const seenKeys = new Set<string>(next.map((e) => `${norm(e.role)}|${norm(e.company)}|${norm(e.period)}`));
        for (const v of volunteers) {
          const vItem: WorkItem = { ...v, volunteer: true };
          const key = `${norm(vItem.role)}|${norm(vItem.company)}|${norm(vItem.period)}`;
          const idx = next.findIndex((e) => exists(e, vItem));
          if (idx >= 0) {
            next[idx] = { ...next[idx], volunteer: true, role: vItem.role || next[idx].role, company: vItem.company || next[idx].company, period: vItem.period || next[idx].period, bullets: (vItem.bullets && vItem.bullets.length > 0) ? vItem.bullets : (next[idx].bullets || []) };
            seenKeys.add(key);
          } else {
            if (!seenKeys.has(key)) {
              next.push(vItem);
              seenKeys.add(key);
            }
          }
        }
        // 最后对 next 做一次去重归并（避免历史数据中已有重复）
        const map = new Map<string, WorkItem>();
        for (const w of next) {
          const k = `${norm(w.role)}|${norm(w.company)}|${norm(w.period)}`;
          const ex = map.get(k);
          if (!ex) map.set(k, { ...w, bullets: [...(w.bullets || [])], volunteer: !!w.volunteer });
          else {
            const seenB = new Set<string>(ex.bullets.map((b) => b.toLowerCase()));
            for (const b of (w.bullets || [])) { const lb = b.toLowerCase(); if (!seenB.has(lb)) { ex.bullets.push(b); seenB.add(lb); } }
            ex.volunteer = !!(ex.volunteer || w.volunteer);
            if (!ex.company && w.company) ex.company = w.company;
            if (!ex.period && w.period) ex.period = w.period;
          }
        }
        const deduped = Array.from(map.values());
        setSelectedWork((prevSel) => {
          const baseLen = prevSel.length;
          const updated = deduped.map((item, i) => {
            if (i < baseLen) return prevSel[i] || !!item.volunteer;
            return true; // 新增志愿者默认选中
          });
        
          return updated;
        });
        return deduped;
      });
    } catch (e: any) {
      setError(e?.message || (lang === 'zh' ? '识别志愿者失败' : 'Failed to import volunteers'));
    }
  };

  // 一键勾选“推荐的志愿者”到简历中（仅影响志愿者条目，不改动工作条目选择）
  const handleSelectRecommendedVolunteers = () => {
    try {
      const jdTextUsed = (jdInput || '').trim();
      const summaryLocal = computeCoverageSummaryClient(editedWork, jdTextUsed);
      const evidenceBestByWork = new Map<number, number>();
      for (const it of (summaryLocal?.items || [])) {
        if (!it.covered || !it.evidence || typeof it.evidence.workIndex !== 'number') continue;
        const wi = it.evidence.workIndex;
        const prev = evidenceBestByWork.get(wi) ?? -Infinity;
        const sc = it.evidence.score ?? 0;
        if (sc > prev) evidenceBestByWork.set(wi, sc);
      }
      const volunteerIdx = editedWork.map((w, i) => (isVolunteerFinal(w) ? i : -1)).filter((i) => i >= 0);
      const ranked = volunteerIdx.sort((a, b) => {
        const as = evidenceBestByWork.get(a) ?? 0;
        const bs = evidenceBestByWork.get(b) ?? 0;
        if (as !== bs) return bs - as;
        const ac = editedWork[a]?.bullets?.length ?? 0;
        const bc = editedWork[b]?.bullets?.length ?? 0;
        if (ac !== bc) return bc - ac;
        return a - b;
      });
      const chosen = new Set(ranked.slice(0, Math.min(3, ranked.length)));
      setSelectedWork((prev) => prev.map((sel, i) => (isVolunteerFinal(editedWork[i]) ? (chosen.has(i) || sel) : sel)));
    } catch {}
  };

  const handleGenerateAdditionalFromJD = () => {
    try {
      const jdText = (jdInput || '').trim();
      if (!jdText) return;
      const targetLang = detectLangFromTextClient((resumeInput || '').trim());
      const resumeTextGlobal = (resumeInput || '').trim();

      // 从简历事实池中匹配 JD（不注入 JD 文本本身）
      const jdKW = refineJdTermsClient(topTermsClient(jdText, 18, 10, 6)).map((t) => t.toLowerCase());
      const pool: string[] = [];
      for (const w of (editedWork || [])) {
        for (const b of (w.bullets || [])) {
          const cleaned = canonicalizeBySynonymsTextClient(cleanBulletTextClient(b), targetLang, jdKW);
          if (cleaned && !isGenericBulletClient(cleaned) && !pool.includes(cleaned)) pool.push(cleaned);
        }
        if (!w.bullets || w.bullets.length === 0) {
          const facts = extractFactsForWorkFromResumeClient(w, resumeTextGlobal, targetLang);
          for (const f of facts) {
            const cleaned = canonicalizeBySynonymsTextClient(cleanBulletTextClient(f), targetLang, jdKW);
            if (cleaned && !isGenericBulletClient(cleaned) && !pool.includes(cleaned)) pool.push(cleaned);
          }
        }
      }
      const scored = pool.map((b) => {
        const bKW = topTermsClient(b, 12, 8, 4).map((s) => s.toLowerCase());
        const score = normalizedOverlapClient(jdKW, bKW);
        return { b, score };
      }).sort((a, b) => b.score - a.score);
      const finalBullets = scored.map((x) => x.b).slice(0, jdBulletCount);
      if (finalBullets.length === 0) return;

      // 禁用“补充经验（基于简历）”条目的生成，避免混入志愿者区块
      setEditedWork((prev) => prev);
      setSelectedWork((prev) => prev);
      setJdAdditional(null);
    } catch {}
  };

  // 自动清理与 JD 低相关的要点：移至“补充经验（基于简历）”（幂等、合并、不丢失）
   const handleAutoCleanIrrelevantBullets = () => {
     try {
       const jdText = (jdInput || '').trim();
       if (!jdText) return;
       const targetLang = detectLangFromTextClient((resumeInput || '').trim());
       const jdKW = refineJdTermsClient(topTermsClient(jdText, 18, 10, 6)).map((t) => t.toLowerCase());

       setEditedWork((prev) => {
         const moved: string[] = [];
         const threshold = 0.25; // 低相关判定阈值（可调整）
         const zhLabel = '补充经验（基于简历）';
         const enLabel = 'Additional Experience (from Resume)';
         const isAdditional = (w: { role?: string }) => {
           const r = (w.role || '').trim();
           return r === zhLabel || r === enLabel;
         };

         const updated = prev.map((w) => {
           if (isAdditional(w)) return w; // 追加桶不再重复处理，保证幂等
           const kept: string[] = [];
           for (const b of (w.bullets || [])) {
             const cleaned = canonicalizeBySynonymsTextClient(cleanBulletTextClient(b), targetLang, jdKW);
             const bKW = topTermsClient(cleaned || b, 12, 8, 4).map((s) => s.toLowerCase());
             const score = normalizedOverlapClient(jdKW, bKW);
             if (score >= threshold) {
               kept.push(b);
             } else {
               moved.push(b);
             }
           }
           return { ...w, bullets: kept };
         });

         const MAX_ADDITIONAL_BULLETS = 8;
         if (moved.length > 0) {
           const roleLabel = targetLang === 'zh' ? zhLabel : enLabel;
           const unique = (arr: string[]) => {
             const out: string[] = [];
             for (const s of arr) { if (!out.includes(s)) out.push(s); }
             return out;
           };
           const idx = updated.findIndex((w) => ((w.role || '').trim() === roleLabel));
           if (idx >= 0) {
             const existing = updated[idx];
             const merged = unique([...(existing.bullets || []), ...moved]);
             updated[idx] = { ...existing, bullets: merged.slice(0, MAX_ADDITIONAL_BULLETS) };
           } else {
             const initial = unique(moved).slice(0, MAX_ADDITIONAL_BULLETS);
             updated.push({ role: roleLabel, bullets: initial, volunteer: true });
             setSelectedWork((prevSel) => {
               const base = Array.isArray(prevSel) ? prevSel : [];
               return [...base, true];
             });
           }
         }
         setJdAdditional(null);
         return updated;
       });
     } catch {}
   };

  // 自动识别技能：当简历文本变化且技能输入为空时自动填充
  useEffect(() => {
    try {
      const text = (resumeInput || '').trim();
      if (!text) return;
      // 避免覆盖用户已手动编辑的技能，仅在为空时填充
      const shouldFillTech = (techSkillsEdit || []).length === 0;
      const shouldFillBase = (baseSkillsEdit || []).length === 0;
      if (!shouldFillTech && !shouldFillBase) return;
      const { tech, base } = extractSkillsFromResumeClient(text);
      if (shouldFillTech && tech.length > 0) setTechSkillsEdit(tech);
      if (shouldFillBase && base.length > 0) setBaseSkillsEdit(base);
    } catch {
      // ignore errors to avoid interrupting user input
    }
  }, [resumeInput]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white dark:from-black dark:to-gray-900 text-black dark:text-white">
      <main className="max-w-6xl mx-auto px-6 md:px-8 py-8 md:py-10">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
 {lang === "zh" ? "快速生成简历" : "FastResume"}
              </span>
            </h1>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setLang('zh')} className={`rounded-full px-3 py-1 text-xs ${lang === 'zh' ? 'bg-black/80 text-white' : 'bg-white text-black dark:text-white border border-black/10 dark:border-white/15'}`} aria-label="切换为中文">中文</button>
              <button type="button" onClick={() => setLang('en')} className={`rounded-full px-3 py-1 text-xs ${lang === 'en' ? 'bg-black/80 text-white' : 'bg-white text-black dark:text-white border border-black/10 dark:border-white/15'}`} aria-label="Switch to English">English</button>
              <label className="flex items-center gap-1 text-xs select-none">
                <input
                  type="checkbox"
                  checked={langLocked}
                  onChange={(e) => setLangLocked(e.target.checked)}
                />
                {lang === 'zh' ? '锁定语言' : 'Lock language'}
              </label>
            </div>
          </div>
          <p className="text-sm md:text-base text-black/70 dark:text-white/70">
            {lang === "zh" ? "粘贴你的现有英文简历与目标岗位 JD，点击「一键生成」，即可得到 ATS 友好的定制版简历与缺失技能建议。" : "Paste your current resume and target JD, click “Generate” to get an ATS-friendly tailored resume plus missing skills suggestions."}
          </p>
          <div className="mt-3 rounded-md border border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-200 p-3">
            <span className="text-sm md:text-base">
              {lang === 'zh' ? 'AI也可能会犯错。请核查重要信息。' : 'AI may make mistakes. Please verify critical information.'}
            </span>
          </div>
        </div>

        {/* 顶部：文件选择（全宽容器，居中显示） */}
        <div className="mb-4 grid grid-cols-1 items-center gap-3 hidden">
          {/* 居中：文件选择 */}
          <div className="md:col-span-12 flex justify-center items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setUploadedFile(f);
                  // 选择了新文件时，清理旧的本地缓存与状态，避免旧经历混入
                  if (f) {
                    try {
                      if (typeof window !== 'undefined') {
                        localStorage.removeItem('edited-work');
                        localStorage.removeItem('selected-work');
                      }
                    } catch {}
                    setEditedWork([]);
                    setSelectedWork([]);
                  }
                  // 选择了新文件时清空旧文本，避免旧文本参与后续请求
                  if (f) setResumeInput("");
                  if (f) { setShowAnalysis(false); autoExtract(f); }
                  try { (e.target as HTMLInputElement).value = ""; } catch {}
                }}
                className="hidden"
              />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md px-4 py-2 text-sm font-medium bg-black/80 text-white hover:bg-black"
            >
              {lang === "zh" ? "选择文件" : "Choose file"}
            </button>
            {uploadedFile && (
              <span className="text-sm text-black/70 dark:text-white/70 truncate max-w-[240px]" title={uploadedFile.name}>{uploadedFile.name}</span>
            )}
          </div>
          {/* 顶部右侧占位已移除，按钮已迁移至文本框下方居中区域 */}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 左列容器（默认隐藏；需要时再展开粘贴简历文本） */}
          {showResumeInput && (
          <div className="order-2 md:order-2">
            <div className="flex flex-col">
              <label className="text-sm font-medium mb-2 relative">
            {lang === "zh" ? "简历原文（上传后自动填充，支持修改）" : "Resume (auto-filled after upload, editable)"}
                <span className={`absolute left-0 -bottom-1 h-0.5 w-16 ${accentGradientClass(selectedColor)}`} />
              </label>
              <textarea
                className="rounded-md border border-black/10 dark:border-white/15 p-4 h-80 resize-y bg-white/95 dark:bg-black/20 shadow-sm focus:shadow-md focus:ring-2 focus:ring-indigo-500/30 focus:outline-none"
            placeholder={lang === "zh" ? "粘贴或编辑你的简历原文（支持英文）" : "Paste or edit your resume (English supported)"}
                value={resumeInput}
                onChange={(e) => setResumeInput(e.target.value)}
              />
              {error && (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-xs shadow-sm flex items-center justify-between gap-3">
                  <span className="truncate">{error}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={tryOCRForCurrentFile}
                      disabled={ocrRunning}
                      className="rounded-full px-3 py-1.5 text-xs font-medium bg-black/80 text-white hover:bg-black disabled:opacity-50"
                    >
                      {ocrRunning ? (lang === 'zh' ? `识别中… ${ocrProgress}%` : `OCR… ${ocrProgress}%`) : (lang === 'zh' ? '尝试OCR识别PDF' : 'Try OCR for PDF')}
                    </button>
                  </div>
                </div>
              )}
              {/* 匹配进度条（已移至文本框下方的居中区域后） */}
              {/* 分析页（移动端内联；桌面改为全宽区块） */}
              <div className="md:hidden">
                {/* 联系方式 */}
                {false && (generated?.contactName || generated?.contactEmail || generated?.contactPhone) && (
                  <div className="rounded-xl border border-black/10 dark:border-white/15 p-5 bg-white/95 dark:bg-black/20 shadow-sm hover:shadow-md transition mb-4">
                    <div className="text-xs uppercase tracking-wider text-black/60 dark:text-white/70 mb-1">{lang === "zh" ? "联系方式" : "Contact"}</div>
                    <h2 className="text-xl font-semibold mb-3 relative">
                      联系信息
                      <span className={`absolute left-0 -bottom-1 h-0.5 w-20 ${accentGradientClass(selectedColor)}`} />
                    </h2>
                    <ul className="space-y-1 text-sm">
          {generated?.contactName && (
            <li>{lang === "zh" ? "姓名" : "Name"}：
              <strong>{generated?.contactName ?? ""}</strong>
            </li>
          )}
          {generated?.contactEmail && (
            <li>{lang === "zh" ? "邮箱" : "Email"}：
              <strong>{generated?.contactEmail ?? ""}</strong>
            </li>
          )}
          {generated?.contactPhone && (
            <li>{lang === "zh" ? "电话" : "Phone"}：
              <strong>{generated?.contactPhone ?? ""}</strong>
            </li>
          )}
                    </ul>
                    {additionalVolunteer.length === 0 ? null : (
                      <div className="mt-3">
                        <h4 className="text-base font-semibold mb-1">{lang === 'zh' ? '补充的志愿者经验' : 'Volunteer Experience'}</h4>
                        <ul className="space-y-3">
                          {additionalVolunteer.map((w, i) => (
                            <li key={`av-${i}`} className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                              {(() => {
                                const idx = editedWork.findIndex((y) => (
                                  y === w || (y.id && w.id && y.id === w.id) || (
                                    (y.role || '') === (w.role || '') &&
                                    (y.company || '') === (w.company || '') &&
                                    (y.period || '') === (w.period || '')
                                  )
                                ));
                                const checked = idx >= 0 ? Boolean(selectedWork[idx]) : false;
                                return (
                                  <div className="mb-2 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <label className="flex items-center gap-2 text-xs text-black/80 dark:text-white/80">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => idx >= 0 && toggleWork(idx)}
                                          className="rounded border border-black/20 dark:border-white/25"
                                        />
                                        <span>{lang === 'zh' ? '加入简历' : 'Include in resume'}</span>
                                      </label>
                                      {/* 移除志愿者复选框后，删除空的条件渲染 */}
                                    </div>
                                  </div>
                                );
                              })()}
                              <div className="leading-7 space-y-1">
                                <p className="font-semibold">
                                  <span className="mr-1">{lang === 'zh' ? '职位' : 'Job Title'}：</span>
                                  {w.role && <strong>{w.role}</strong>}

                                </p>
                                {w.company && (
                                  <p className="text-black/80 dark:text-white/80"><span className="font-medium">{lang === 'zh' ? '机构' : 'Organization'}：</span>{w.company}</p>
                                )}
                                {w.period && (
                                  <p className="text-black/80 dark:text-white/80"><span className="font-medium">{lang === 'zh' ? '时间段' : 'Period'}：</span>{w.period}</p>
                                )}
                                {(w.bullets && w.bullets.length > 0) && (
                                  <div className="text-black/90 dark:text-white/90">
                                    <span className="font-medium">{lang === 'zh' ? '描述' : 'Description'}：</span>
                                    <ul className="list-disc list-inside space-y-1 pl-1">
                                      {(w.bullets || []).slice(0,3).map((b, j) => (
                                        <li key={`avd-${j}`} className="leading-6">{highlight(b, generated?.highlightTerms ?? [])}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                
                {false && (
                  <div className="rounded-xl border border-black/10 dark:border-white/15 p-5 bg-white/95 dark:bg-black/20 shadow-sm hover:shadow-md transition mt-4 md:hidden">
                    <h2 className="text-xl font-semibold mb-3 relative">
                      {lang === "zh" ? "编辑经历" : "Edit Experience"}
                      <span className={`absolute left-0 -bottom-1 h-0.5 w-20 ${accentGradientClass(selectedColor)}`} />
                    </h2>
                    {!editedWork || editedWork.length === 0 ? (
                      <p className="text-sm leading-6 text-black/70 dark:text-white/70">{lang === "zh" ? "暂无经历。点击下方“新增经历”。" : "No items yet. Click 'Add Item' below."}</p>
                    ) : (
                      <ul className="space-y-4">
                        {editedWork.map((w, i) => (
                          <li key={i} className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                              <input value={w.role || ""} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x, idx) => idx === i ? { ...x, role: v } : x)); }} placeholder={lang === "zh" ? "职位" : "Role"} className="rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/20 border border-black/10 dark:border-white/15" />
                              <input value={w.company || ""} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x, idx) => idx === i ? { ...x, company: v } : x)); }} placeholder={lang === "zh" ? "公司" : "Company"} className="rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/20 border border-black/10 dark:border-white/15" />
                              <input value={w.period || ""} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x, idx) => idx === i ? { ...x, period: v } : x)); }} placeholder={lang === "zh" ? "时间" : "Period"} className="rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/20 border border-black/10 dark:border-white/15" />
                            </div>
                            <ul className="list-disc list-inside space-y-2">
                              {w.bullets.map((b, j) => (
                                <li key={j} className="flex items-center gap-2">
                                  <input value={b} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x, idx) => idx === i ? { ...x, bullets: x.bullets.map((bb, jj) => jj === j ? v : bb) } : x)); }} placeholder={lang === "zh" ? "要点（动作+平台/技能+结果）" : "Bullet (action + platform/skill + result)"} className="flex-1 rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/20 border border-black/10 dark:border-white/15" />
                                  <button type="button" onClick={() => setEditedWork((prev) => prev.map((x, idx) => idx === i ? { ...x, bullets: x.bullets.filter((_, jj) => jj !== j) } : x))} className="rounded-md px-2 py-1 text-xs bg-white text-black border border-black/10 dark:bg-black/30 dark:text-white">
                                    {lang === "zh" ? "删除" : "Remove"}
                                  </button>
                                </li>
                              ))}
                            </ul>
                            <div className="mt-2 flex items-center gap-2">
                              <button type="button" onClick={() => setEditedWork((prev) => prev.map((x, idx) => idx === i ? { ...x, bullets: [...x.bullets, ""] } : x))} className={`${accentSolidClass(selectedColor)}`}>
                                {lang === "zh" ? "新增要点" : "Add bullet"}
                              </button>
                              <button type="button" onClick={() => { setEditedWork((prev) => prev.filter((_, idx) => idx !== i)); setSelectedWork((prev) => prev.filter((_, idx) => idx !== i)); }} className="rounded-md px-2 py-1 text-xs bg-red-600 text-white">
                                {lang === "zh" ? "删除经历" : "Delete item"}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3">
                      <button type="button" onClick={() => { setEditedWork((prev) => [...prev, { role: "", company: "", period: "", bullets: [""], volunteer: false }]); setSelectedWork((prev) => [...prev, true]); }} className={`${accentSolidLgClass(selectedColor)}`}>
                        {lang === "zh" ? "新增经历" : "Add Item"}
                      </button>
                    </div>
                  </div>
                )}

                {/* 匹配概览（按经验类别） */}
                {showAnalysis && (
                  <div className="rounded-xl border border-black/10 dark:border-white/15 p-5 bg-white/95 dark:bg-black/20 shadow-sm hover:shadow-md transition">
                  <h2 className="text-xl font-semibold mb-1 relative">
                    {lang === "zh" ? "匹配概览（按经验类别）" : "Coverage Summary (by experience category)"}
                    <span className={`absolute left-0 -bottom-1 h-0.5 w-16 ${accentGradientClass(selectedColor)}`} />
                  </h2>
                  <div className="mb-2 text-xs text-black/60 dark:text-white/60" aria-label={lang === "zh" ? "类别命中比例" : "Category coverage ratio"}>
                    {matchProgress.hit}/{matchProgress.total} · {matchProgress.pct}%
                  </div>
                  {coverageSummary.items.length === 0 ? (
                    <p className="text-sm leading-6 text-black/70 dark:text-white/70">{lang === "zh" ? "暂无概览（请粘贴 JD 与简历）" : "No summary yet (paste JD and resume)"}</p>
                  ) : (
                    <ul className="space-y-3">
                      {coverageSummary.items.map((c, i) => (
                          <li key={i} className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                          <p className="font-medium leading-6">
                            {c.covered ? (
                              <span className="inline-block align-middle mr-2 rounded-full px-2 py-0.5 text-xs bg-green-50 text-green-700 border border-green-200 dark:bg-green-500/20 dark:text-green-100 dark:border-green-400">
                                {lang === "zh" ? "已覆盖" : "Covered"}
                              </span>
                            ) : (
                              <span className="inline-block align-middle mr-2 rounded-full px-2 py-0.5 text-xs bg-gray-100 text-gray-700 border border-gray-200 dark:bg-white/10 dark:text-white/70 dark:border-white/20">
                                {lang === "zh" ? "未覆盖" : "Uncovered"}
                              </span>
                            )}
                            {lang === "zh" ? "经验类别" : "Category"}：<strong>{lang === "zh" ? c.labelZh : c.labelEn}</strong>
                          </p>
                          {c.covered && c.evidence ? (
                            <div className="mt-1 text-sm">
                              <div className="text-black/70 dark:text-white/70">
                                {lang === "zh" ? "来自" : "From"}：{[c.evidence.role, c.evidence.company].filter(Boolean).join(" @ ")}
                                {typeof c.evidence.workIndex === 'number' && (
                                  <span className="ml-2 inline-block px-2 py-0.5 text-xs rounded-full border bg-black/5 text-black/70 dark:bg-white/10 dark:text-white/70">
                                    {lang === 'zh'
                                      ? (isVolunteerFinal(editedWork[c.evidence.workIndex]) ? '志愿者经验' : '工作经验')
                                      : (isVolunteerFinal(editedWork[c.evidence.workIndex]) ? 'Volunteer' : 'Work')}
                                  </span>
                                )}
                              </div>
                              {c.evidence.bullet ? (
                                <div className="mt-1 leading-6">• {highlight(c.evidence.bullet, generated.highlightTerms)}</div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="mt-1 text-sm text-black/60 dark:text-white/60">
                              {lang === "zh" ? "建议补充：" : "Suggestion:"} {(CATEGORY_INFO[c.key]?.hints || []).slice(0,2).join("，")}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* 志愿者匹配列表已移除，遵循“补充志愿者经验”单独呈现 */}
                </div>
                )}

                {/* 经验缺口建议（移动端，按类别） */}
                {(missingCategories.length > 0) && (
                  <div className="rounded-xl border border-black/10 dark:border-white/15 p-5 bg-white/95 dark:bg-black/20 shadow-sm hover:shadow-md transition mt-4">
                    <h2 className="text-xl font-semibold mb-3 relative">
        <span id="gap-suggestions">{lang === "zh" ? "经验缺口建议（按类别）" : "Gap Suggestions (by category)"}</span>
                      <span className={`absolute left-0 -bottom-1 h-0.5 w-20 ${accentGradientClass(selectedColor)}`} />
                    </h2>
                    <ul className="space-y-3">
                      {missingCategories.map((m, i) => (
                          <li key={i} className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                          <p className="font-medium leading-6">
            {lang === "zh" ? "类别" : "Category"}：<strong>{lang === "zh" ? m.labelZh : m.labelEn}</strong>
                          </p>
                          <ul className="list-disc list-inside space-y-1 pl-1">
                            {m.bullets.map((b, j) => (
                              <li key={j} className="leading-6">{highlight(b, generated?.highlightTerms ?? [])}</li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 预览区块去重：此处删除，保留下方唯一版本 */}
              </div>
            </div> {/* flex flex-col */}
          </div> )} {/* 左列容器 */}

          {/* 右列（占位：JD 文本输入；未展开简历时占满两列） */}
          <div className={showResumeInput ? "order-first md:order-first" : "order-first md:order-first md:col-span-2"}>
            <div className="flex flex-col items-center">
              <label className="text-xl md:text-2xl font-semibold mb-3 relative text-center">
            {lang === "zh" ? "目标岗位 JD" : "Target JD"}
                <span className={`absolute left-1/2 -translate-x-1/2 -bottom-1 h-0.5 w-24 ${accentGradientClass(selectedColor)}`} />
              </label>
              <div className="w-full flex justify-center">
                <textarea
                  className="w-full max-w-none rounded-2xl border border-black/10 dark:border-white/15 p-5 min-h-[22rem] resize-y bg-white/95 dark:bg-black/20 shadow-sm focus:shadow-md focus:ring-2 focus:ring-indigo-500/30 focus:outline-none leading-7 text-[13px] md:text-sm"
            placeholder={lang === "zh" ? "粘贴目标岗位的 JD 文本（支持英文）" : "Paste the target role JD text (English supported)"}
                  value={jdInput}
                  onChange={(e) => setJdInput(e.target.value)}
                />
              </div>
              {/* JD 技能与匹配摘要移至综合匹配度卡片下方 */}

              {/* 居中：文件选择（按类型分两个入口：Word 与 PDF） */}
              <div className="mt-4 w-full flex justify-center items-center gap-3 flex-wrap">
                {/* 仅 Word（.docx） */}
                <input
                  ref={docxInputRef}
                  type="file"
                  accept=".docx"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    const files = f ? [f] : [];
                    setUploadedFiles(files);
                    setUploadedFile(f);
                    if (files.length > 0) {
                      try {
                        if (typeof window !== 'undefined') {
                          localStorage.removeItem('edited-work');
                          localStorage.removeItem('selected-work');
                          localStorage.removeItem('resume-input');
                        }
                      } catch {}
                      setEditedWork([]);
                      setSelectedWork([]);
                      setResumeInput("");
                      setShowAnalysis(false);
                    }
                    if (f) { autoExtract(f); }
                    try { (e.target as HTMLInputElement).value = ""; } catch {}
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => docxInputRef.current?.click()}
                  className="rounded-full px-5 py-2 text-sm font-medium bg-black/80 text-white hover:bg-black shadow-sm"
                >
                  {lang === "zh" ? "选择 Word" : "Choose Word"}
                </button>

                {/* （按用户要求移除：选择 PDF / OCR 语言与页数 / 预览 PDF / PDF 与 OCR 转换按钮） */}

                {uploadedFile && (
                  <span className="text-sm text-black/70 dark:text-white/70 truncate max-w-[240px]" title={uploadedFile.name}>{uploadedFile.name}</span>
                )}
                <button
                  type="button"
                  onClick={handleClearJD}
                  className="rounded-full px-3 py-1.5 text-xs font-medium bg-white text-black dark:text-white border border-black/10 dark:border-white/15 hover:bg-black/5"
                >
                  {lang === 'zh' ? '清空 JD' : 'Clear JD'}
                </button>
              </div>
              {/* 四个常用操作按钮移至“选择 Word”下方 */}
              <div className="mt-3 w-full flex justify-center items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleGenerateAnalyze}
                  className="rounded-full px-4 py-2 text-sm font-medium bg-black/80 text-white hover:bg-black shadow-sm"
                >
                  {lang === 'zh' ? '一键生成（含分析）' : 'Generate & Analyze'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  className="rounded-full px-4 py-2 text-sm font-medium bg-white text-black dark:text-white border border-black/10 dark:border-white/15 hover:bg-black/5"
                >
                  {lang === 'zh' ? '预览' : 'Preview'}
                </button>
                <button
                  type="button"
                  onClick={downloadTxt}
                  className="rounded-full px-4 py-2 text-sm font-medium bg-white text-black dark:text-white border border-black/10 dark:border-white/15 hover:bg-black/5"
                >
                  {lang === 'zh' ? '下载 TXT' : 'Download TXT'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDocxOptions(true)}
                  className="rounded-full px-4 py-2 text-sm font-medium bg-white text-black dark:text-white border border-black/10 dark:border-white/15 hover:bg-black/5"
                >
                  {lang === 'zh' ? '下载 Word' : 'Download Word'}
                </button>
                <button
                  type="button"
                  onClick={handleResetSession}
                  className="rounded-full px-4 py-2 text-sm font-medium bg-white text-black dark:text-white border border-black/10 dark:border-white/15 hover:bg-black/5"
                >
                  {lang === 'zh' ? '清除缓存' : 'Clear Cache'}
                </button>
              </div>
            </div>
          </div>
          {/* 文本框下方操作按钮区：已合并到“选择 Word”下方 */}

  {/* 多简历列表与批量分析区块 */}
  {uploadedFiles && uploadedFiles.length > 1 && (
    <div className="md:col-span-2 mt-3 border-t border-black/10 dark:border-white/15 pt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">{lang === 'zh' ? `已选择 ${uploadedFiles.length} 份简历` : `Selected ${uploadedFiles.length} resumes`}</div>
        <button
          type="button"
          onClick={analyzeAllWithJD}
          className="rounded-full px-3 py-1.5 text-xs font-medium bg-black/80 text-white hover:bg-black"
        >
          {lang === 'zh' ? '批量分析（使用当前 JD）' : 'Analyze all (use current JD)'}
        </button>
      </div>
      <ul className="space-y-2">
        {uploadedFiles.map((f) => {
          const name = f.name;
          const status = batchStatus[name] || 'pending';
          const result = batchResults[name];
          const keywords = Array.isArray(result?.keywords) ? result.keywords.slice(0, 6).join(', ') : '';
          const jdKeywords = Array.isArray(result?.jdKeywords) ? result.jdKeywords.slice(0, 6).join(', ') : '';
          return (
            <li key={name} className="flex items-center gap-3">
              <span className="text-sm truncate max-w-[280px]" title={name}>{name}</span>
              <span className="text-xs px-2 py-1 rounded-full border border-black/10 dark:border-white/15">
                {status === 'in_progress' ? (lang === 'zh' ? '分析中…' : 'Analyzing…') : status === 'done' ? (lang === 'zh' ? '完成' : 'Done') : status === 'error' ? (lang === 'zh' ? '失败' : 'Error') : (lang === 'zh' ? '待分析' : 'Pending')}
              </span>
              <button
                type="button"
                onClick={() => analyzeOneWithJD(f)}
                disabled={status === 'in_progress'}
                className="rounded-full px-3 py-1.5 text-xs font-medium bg-white text-black dark:text-white border border-black/10 dark:border-white/15 hover:bg-black/5 disabled:opacity-50"
              >
                {lang === 'zh' ? '分析' : 'Analyze'}
              </button>
              {status === 'done' && (
                <div className="text-xs text-black/70 dark:text-white/70 truncate">
                  {lang === 'zh' ? `简历关键词: ${keywords}` : `Resume keywords: ${keywords}`} {jdKeywords && ` | JD: ${jdKeywords}`}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  )}

          {/* 编辑简历（已合并至预览模态，不再单独展开） */}
          {false && (
            <div className="md:col-span-2" id="edit-section">
              <div className="rounded-xl border border-black/10 dark:border-white/15 bg-white text-black dark:bg-black/90 dark:text-white shadow-sm">
                <div className="flex items-center justify-between px-5 py-3 border-b border-black/10 dark:border-white/15">
                  <h3 className="text-lg font-semibold">{lang === 'zh' ? '编辑简历' : 'Edit Resume'}</h3>
                  <div className="flex gap-2">
                    <button onClick={() => setEditMode(false)} className="rounded-md px-3 py-1.5 text-sm bg-black/80 text-white">{lang === 'zh' ? '关闭' : 'Close'}</button>
                    <button onClick={() => setEditMode(false)} className={`${accentSolidLgClass(selectedColor)}`}>{lang === 'zh' ? '保存并关闭' : 'Save & Close'}</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 px-5 py-4">
                  {/* 左侧：联系方式、简介、技能 */}
                  <div className="space-y-4">
                    <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">{lang === 'zh' ? '联系方式' : 'Contact'}</h4>
              <button type="button" onClick={handleAutoFillContact} className={`${accentSolidClass(selectedColor)}`}>
                {lang === 'zh' ? '从简历识别' : 'Detect from Resume'}
              </button>
            </div>
                      <div className="grid grid-cols-1 gap-2">
                        <input value={contactNameEdit} onChange={(e) => setContactNameEdit(e.target.value)} placeholder={lang === 'zh' ? '姓名' : 'Name'} className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30" />
                        <input value={contactPhoneEdit} onChange={(e) => setContactPhoneEdit(e.target.value)} placeholder={lang === 'zh' ? '电话' : 'Phone'} className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30" />
                        <input value={contactEmailEdit} onChange={(e) => setContactEmailEdit(e.target.value)} placeholder={lang === 'zh' ? '邮箱' : 'Email'} className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30" />
                        <input value={contactAddressEdit} onChange={(e) => setContactAddressEdit(e.target.value)} placeholder={lang === 'zh' ? '地址' : 'Address'} className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30" />
                        <input value={contactWebsiteEdit} onChange={(e) => setContactWebsiteEdit(e.target.value)} placeholder={lang === 'zh' ? '网站' : 'Website'} className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30" />
                      </div>
                    </div>
                    <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">{lang === 'zh' ? '自我介绍' : 'Summary'}</h4>
              <button
                type="button"
                onClick={handleGenerateSummary}
                className={`${accentSolidClass(selectedColor)}`}
              >
                {lang === 'zh' ? '根据JD生成' : 'Generate from JD'}
              </button>
            </div>
                      <textarea value={summaryEdit} onChange={(e) => setSummaryEdit(e.target.value)} placeholder={lang === 'zh' ? '一句话电梯陈述（可选）' : 'One-line summary (optional)'} className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30 h-20 w-full" />
                    </div>
                    {/* 教育经历：位于自我介绍下面 */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold">{lang === 'zh' ? '教育经历' : 'Education'}</h4>
                        <button
                          type="button"
                          onClick={() => setEducationEdit((prev) => {
                            const text = (resumeInput || '').trim();
                            const items = text ? extractEducationClient(text) : [];
                            const seen = new Set(prev.map((e) => `${(e.school||'').toLowerCase()}|${(e.degree||'').toLowerCase()}|${(e.period||'').toLowerCase()}`));
                            const pick = items.find((e) => {
                              const key = `${(e.school||'').toLowerCase()}|${(e.degree||'').toLowerCase()}|${(e.period||'').toLowerCase()}`;
                              return !seen.has(key);
                            });
                            const newItem = pick || { degree: '', field: '', school: '', period: '' };
                            return [...prev, newItem];
                          })}
                          className={`${accentSolidClass(selectedColor)}`}
                        >
                          {lang === 'zh' ? '新增教育经历' : 'Add Education'}
                        </button>
                      </div>
                      {educationEdit.length === 0 ? (
                        <p className="text-sm leading-6 text-black/70 dark:text-white/70">
                          {lang === 'zh' ? '暂无教育经历，点击“新增教育经历”添加。' : 'No education entries. Click “Add Education” to create one.'}
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {educationEdit.map((edu, idx) => (
                            <li key={`edu-${idx}`} className="rounded-md border border-black/10 dark:border-white/15 p-3 bg-white/95 dark:bg-black/30">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <input
                                  value={edu.degree || ''}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setEducationEdit((prev) => prev.map((x, i) => i === idx ? { ...x, degree: v } : x));
                                  }}
                                  placeholder={lang === 'zh' ? '学位（如 Bachelor / Master）' : 'Degree (e.g., Bachelor / Master)'}
                                  className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30"
                                />
                                <input
                                  value={edu.field || ''}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setEducationEdit((prev) => prev.map((x, i) => i === idx ? { ...x, field: v } : x));
                                  }}
                                  placeholder={lang === 'zh' ? '科目/专业（如 Computer Science）' : 'Field / Major (e.g., Computer Science)'}
                                  className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30"
                                />
                                <input
                                  value={edu.school || ''}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setEducationEdit((prev) => prev.map((x, i) => i === idx ? { ...x, school: v } : x));
                                  }}
                                  placeholder={lang === 'zh' ? '学校' : 'School'}
                                  className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30"
                                />
                                <input
                                  value={edu.period || ''}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setEducationEdit((prev) => prev.map((x, i) => i === idx ? { ...x, period: v } : x));
                                  }}
                                  placeholder={lang === 'zh' ? '日期（如 2020–2024）' : 'Dates (e.g., 2020–2024)'}
                                  className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30"
                                />
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEducationEdit((prev) => prev.filter((_, i) => i !== idx))}
                                  className="rounded-md px-2 py-1 text-xs bg-white text-black border border-black/10 dark:bg-black/40 dark:text-white"
                                >
                                  {lang === 'zh' ? '删除' : 'Remove'}
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold">{lang === 'zh' ? '技能' : 'Skills'}</h4>
                        <div className="flex items-center gap-2"></div>
                      </div>
                      <label className="text-xs mb-1 block">{lang === 'zh' ? '技术技能（逗号分隔）' : 'Technical (comma-separated)'}</label>
                      <input value={(techSkillsEdit || []).join(', ')} onChange={(e) => setTechSkillsEdit(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30 w-full" />
                      <label className="text-xs mb-1 block mt-2">{lang === 'zh' ? '基础技能（逗号分隔）' : 'Base (comma-separated)'}</label>
                      <input value={(baseSkillsEdit || []).join(', ')} onChange={(e) => setBaseSkillsEdit(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30 w-full" />
                      
                    </div>
                  </div>
                  {/* 右侧：仅JD匹配的经历（工作 / 志愿者） */}
                  <div className="space-y-4">
                    {/* 已按用户反馈移除分条选项，默认使用合并编辑 */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold">{lang === 'zh' ? '工作经验（JD匹配）' : 'Work Experience (JD matched)'}</h4>
                        <button
                          type="button"
                          onClick={() => {
                            const chosen = new Set<number>();
                            for (const w of (combinedExperience.primary || [])) {
                              const idx = editedWork.findIndex((y) => (
                                (y.role || '') === (w.role || '') &&
                                (y.company || '') === (w.company || '') &&
                                (y.period || '') === (w.period || '')
                              ));
                              if (idx >= 0) chosen.add(idx);
                            }
                            setSelectedWork(editedWork.map((_, i) => chosen.has(i)));
                          }}
                          className="text-xs px-2 py-1 rounded-md border border-black/15 bg-white/90 hover:bg-black/5"
                        >{lang === 'zh' ? '一键全选主经历' : 'Select all primary'}</button>
                      </div>
                      {selectedWorkSorted.filter((w) => !isVolunteerFinal(w)).length === 0 ? (
                        <p className="text-sm text-black/70 dark:text-white/70">{lang === 'zh' ? '暂无匹配的工作经历' : 'No matched work experience'}</p>
                      ) : (
                        <ul className="space-y-3">
                          {selectedWorkSorted.filter((w) => !isVolunteerFinal(w)).map((w, i) => (
                            <li key={`ew-${i}`} className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                              <div className="grid grid-cols-1 gap-2 mb-2">
                                <input value={w.role || ''} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x, idx) => idx === editedWork.findIndex((y) => y === w) ? { ...x, role: v } : x)); }} onBlur={(e) => { const v = e.target.value; const eid = editedWork.findIndex((y) => y === w); setEditedWork((prev) => prev.map((x, idx) => { if (idx !== eid) return x; const hasCompany = !!(x.company || '').trim(); if (hasCompany) return x; const comp = extractCompanyFromRoleClient(v); if (comp) { const rolePart = deriveRolePartClient(v, comp); return { ...x, role: rolePart, company: comp }; } return x; })); }} placeholder={lang === 'zh' ? '职位' : 'Role'} className="rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15" />
                                <input value={w.company || ''} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x, idx) => idx === editedWork.findIndex((y) => y === w) ? { ...x, company: v } : x)); }} placeholder={lang === 'zh' ? '公司' : 'Company'} className="rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15" />
                                  <input value={w.period || ''} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x, idx) => idx === editedWork.findIndex((y) => y === w) ? { ...x, period: v } : x)); }} placeholder={lang === 'zh' ? '时间' : 'Period'} className="rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15" />
                                </div>
                              {(() => {
                                const idx = editedWork.findIndex((y) => y === w);
                                const checked = Boolean(selectedWork[idx]);
                                const isPrimary = (combinedExperience.primary || []).some(
                                  (x) =>
                                    (x.role || '') === (w.role || '') &&
                                    (x.company || '') === (w.company || '') &&
                                    (x.period || '') === (w.period || '')
                                );
                                return (
                                  <div className="mb-2 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <label className="flex items-center gap-2 text-xs text-black/80 dark:text-white/80">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleWork(idx)}
                                          className="rounded border border-black/20 dark:border-white/25"
                                        />
                                        <span>{lang === 'zh' ? '加入简历' : 'Include in resume'}</span>
                                      </label>
                                    </div>
                                    {isPrimary ? (() => {
                                      const eidx = idx;
                                      let bestItem: CoverageItem | undefined;
                                      for (const it of (coverageSummary?.items || [])) {
                                        if (!it.covered || !it.evidence || typeof it.evidence.workIndex !== 'number') continue;
                                        if (it.evidence.workIndex === eidx) {
                                          if (!bestItem || ((it.evidence.score ?? 0) > (bestItem.evidence?.score ?? 0))) bestItem = it;
                                        }
                                      }
                                      const localPct = Math.round(Math.max(0, Math.min(100, ((bestItem?.evidence?.score ?? 0) * 100))));
                                      const reasonText = lang === 'zh' ? (bestItem?.labelZh || '匹配 JD') : (bestItem?.labelEn || 'JD match');
                                      const bulletText = (bestItem?.evidence?.bullet || '').trim();
                                      const tip = `${reasonText} • ${lang === 'zh' ? '覆盖' : 'Coverage '} ${localPct}%${bulletText ? (lang === 'zh' ? ' • 要点：' : ' • Bullet: ') + bulletText : ''}`;
                                      return (
                                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-green-50 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-100 dark:border-green-400" title={tip}>
                                          {lang === 'zh' ? '推荐' : 'Recommend'}
                                        </span>
                                      );
                                    })() : null}
                                  </div>
                                );
                              })()}
                              {(() => {
                                const idx = editedWork.findIndex((y) => y === w);
                                const isCombined = true;
                                return (
                                  <div>
                                    <div className="mb-2 flex items-center justify-between">
                                      <span className="text-xs text-black/60 dark:text-white/60">{lang === 'zh' ? '要点' : 'Bullets'}</span>
                                      <button type="button" onClick={() => { const eid = editedWork.findIndex((y) => y === w); if (eid < 0) return; const ACTION_VERB_RE = /\b(manage|managed|support|supported|coordinate|coordinated|assist|assisted|lead|led|design|designed|develop|developed|operate|operated|serve|served|handle|handled|process|processed|maintain|maintained|monitor|monitored|optimi[sz]e|analy[sz]e|report|reported|provide|provided|deliver|delivered|offer|offered|arrange|arranged|translate|translated|recommend|recommended|guide|guided)\b/i; const normalize = (text: string) => { let t = (text || '').trim(); if (!t) return t; t = t.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').replace(/\s*;\s*/g, '; ').trim(); if (/^[a-z]/.test(t) && ACTION_VERB_RE.test(t)) { t = t.replace(/^([a-z])/, (m) => m.toUpperCase()); } t = t.replace(/\b(very|really|just|actually|highly|regarded|greatly|successfully)\b/gi, '').replace(/\s{2,}/g, ' ').trim(); t = t.replace(/\b(and|or)\s+(and|or)\b/gi, '$1'); if (/^[\p{Script=Han}]/u.test(t)) { t = t.replace(/[。\.]+$/, ''); t += '。'; } else { t = t.replace(/[。]+$/, '.'); if (!/[.!?]$/.test(t)) t += '.'; } t = t.replace(/\b(content\s+content|manage\s+manage|design\s+design)\b/gi, (m) => m.split(' ')[0]); return t.trim(); }; setEditedWork((prev) => prev.map((x, j) => { if (j !== eid) return x; const nextBullets = (x.bullets || []).map((b) => normalize(b)); return { ...x, bullets: nextBullets }; })); }} className="text-xs rounded px-2 py-0.5 border border-black/10 dark:border-white/20 text-black/70 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/10">
                                        {lang === 'zh' ? '一键润色要点' : 'Polish bullets'}
                                      </button>
                                    </div>
                                    {isCombined ? (
                                      <textarea
                                        className="w-full rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15 h-24"
                                        value={(w.bullets || []).join('\n')}
                                        onChange={(e) => {
                                          const lines = e.target.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
                                          setEditedWork((prev) => prev.map((x) => (x === w ? { ...x, bullets: lines } : x)));
                                        }}
                                        placeholder={lang === 'zh' ? '每行一个要点（动作+平台/技能+结果）' : 'One bullet per line (action+platform/skill+result)'}
                                      />
                                    ) : (
                                      <>
                                        <ul className="list-disc list-inside space-y-2">
                                          {(w.bullets || []).map((b, j) => (
                                            <li key={`b-${j}`} className="flex items-center gap-2">
                                              <input value={b} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x) => (x === w ? { ...x, bullets: (x.bullets || []).map((bb, jj) => jj === j ? v : bb) } : x))); }} placeholder={lang === 'zh' ? '要点（动作+平台/技能+结果）' : 'Bullet (action+platform/skill+result)'} className="flex-1 rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15" />
                                              <button type="button" onClick={() => setEditedWork((prev) => prev.map((x) => (x === w ? { ...x, bullets: (x.bullets || []).filter((_, jj) => jj !== j) } : x)))} className="rounded-md px-2 py-1 text-xs bg-white text-black border border-black/10 dark:bg-black/40 dark:text-white">{lang === 'zh' ? '删除' : 'Remove'}</button>
                                            </li>
                                          ))}
                                        </ul>
                                        <div className="mt-2 flex items-center gap-2">
                                          <button type="button" onClick={() => setEditedWork((prev) => prev.map((x) => (x === w ? { ...x, bullets: [...(x.bullets || []), ''] } : x)))} className={`${accentSolidClass(selectedColor)}`}>{lang === 'zh' ? '新增要点' : 'Add bullet'}</button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                );
                              })()}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <h4 className="text-base font-semibold mb-2">{lang === 'zh' ? '志愿者经验（JD匹配）' : 'Volunteer Experience (JD matched)'}</h4>
                      {selectedWorkSorted.filter((w) => isVolunteerFinal(w)).length === 0 ? (
                        <p className="text-sm text-black/70 dark:text-white/70">{lang === 'zh' ? '暂无匹配的志愿者经历' : 'No matched volunteer experience'}</p>
                      ) : (
                        <ul className="space-y-3">
                          {selectedWorkSorted.filter((w) => isVolunteerFinal(w)).map((w, i) => (
                            <li key={`vw-${i}`} className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                              <div className="grid grid-cols-1 gap-2 mb-2">
                                <input value={w.role || ''} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x, idx) => idx === editedWork.findIndex((y) => y === w) ? { ...x, role: v } : x)); }} onBlur={(e) => { const v = e.target.value; const eid = editedWork.findIndex((y) => y === w); setEditedWork((prev) => prev.map((x, idx) => { if (idx !== eid) return x; const hasCompany = !!(x.company || '').trim(); if (hasCompany) return x; const comp = extractCompanyFromRoleClient(v); if (comp) { const rolePart = deriveRolePartClient(v, comp); return { ...x, role: rolePart, company: comp }; } return x; })); }} placeholder={lang === 'zh' ? '职位' : 'Role'} className="rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15" />
                                <input value={w.company || ''} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x, idx) => idx === editedWork.findIndex((y) => y === w) ? { ...x, company: v } : x)); }} placeholder={lang === 'zh' ? '组织' : 'Org'} className="rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15" />
                                <input value={w.period || ''} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x, idx) => idx === editedWork.findIndex((y) => y === w) ? { ...x, period: v } : x)); }} placeholder={lang === 'zh' ? '时间' : 'Period'} className="rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15" />
                              </div>
                              {(() => {
                                const idx = editedWork.findIndex((y) => y === w);
                                const checked = Boolean(selectedWork[idx]);
                                const isPrimary = (combinedExperience.primary || []).some(
                                  (x) =>
                                    (x.role || '') === (w.role || '') &&
                                    (x.company || '') === (w.company || '') &&
                                    (x.period || '') === (w.period || '')
                                );
                                return (
                                  <div className="mb-2 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <label className="flex items-center gap-2 text-xs text-black/80 dark:text-white/80">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleWork(idx)}
                                          className="rounded border border-black/20 dark:border-white/25"
                                        />
                                        <span>{lang === 'zh' ? '加入简历' : 'Include in resume'}</span>
                                      </label>
                                    </div>
                                    {isPrimary ? (() => {
                                      const eidx = idx;
                                      let bestItem: CoverageItem | undefined;
                                      for (const it of (coverageSummary?.items || [])) {
                                        if (!it.covered || !it.evidence || typeof it.evidence.workIndex !== 'number') continue;
                                        if (it.evidence.workIndex === eidx) {
                                          if (!bestItem || ((it.evidence.score ?? 0) > (bestItem.evidence?.score ?? 0))) bestItem = it;
                                        }
                                      }
                                      const localPct = Math.round(Math.max(0, Math.min(100, ((bestItem?.evidence?.score ?? 0) * 100))));
                                      const reasonText = lang === 'zh' ? (bestItem?.labelZh || '匹配 JD') : (bestItem?.labelEn || 'JD match');
                                      const bulletText = (bestItem?.evidence?.bullet || '').trim();
                                      const tip = `${reasonText} • ${lang === 'zh' ? '覆盖' : 'Coverage '} ${localPct}%${bulletText ? (lang === 'zh' ? ' • 要点：' : ' • Bullet: ') + bulletText : ''}`;
                                      return (
                                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-green-50 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-100 dark:border-green-400" title={tip}>
                                          {lang === 'zh' ? '推荐' : 'Recommend'}
                                        </span>
                                      );
                                    })() : null}
                                  </div>
                                );
                              })()}
                              {(() => {
                                const idx = editedWork.findIndex((y) => y === w);
                                const isCombined = true;
                                return (
                                  <div>
                                    <div className="mb-2 flex items-center justify-between">
                                      <span className="text-xs text-black/60 dark:text-white/60">{lang === 'zh' ? '要点' : 'Bullets'}</span>
                                    </div>
                                    {isCombined ? (
                                      <textarea
                                        className="w-full rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15 h-24"
                                        value={(w.bullets || []).join('\n')}
                                        onChange={(e) => {
                                          const lines = e.target.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
                                          setEditedWork((prev) => prev.map((x) => (x === w ? { ...x, bullets: lines } : x)));
                                        }}
                                        placeholder={lang === 'zh' ? '每行一个要点（动作+平台/技能+结果）' : 'One bullet per line'}
                                      />
                                    ) : (
                                      <>
                                        <ul className="list-disc list-inside space-y-2">
                                          {(w.bullets || []).map((b, j) => (
                                            <li key={`vb-${j}`} className="flex items-center gap-2">
                                              <input value={b} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x) => (x === w ? { ...x, bullets: (x.bullets || []).map((bb, jj) => jj === j ? v : bb) } : x))); }} placeholder={lang === 'zh' ? '要点（动作+平台/技能+结果）' : 'Bullet'} className="flex-1 rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15" />
                                              <button type="button" onClick={() => setEditedWork((prev) => prev.map((x) => (x === w ? { ...x, bullets: (x.bullets || []).filter((_, jj) => jj !== j) } : x)))} className="rounded-md px-2 py-1 text-xs bg-white text-black border border-black/10 dark:bg-black/40 dark:text-white">{lang === 'zh' ? '删除' : 'Remove'}</button>
                                            </li>
                                          ))}
                                        </ul>
                                        <div className="mt-2 flex items-center gap-2">
                                          <button type="button" onClick={() => setEditedWork((prev) => prev.map((x) => (x === w ? { ...x, bullets: [...(x.bullets || []), ''] } : x)))} className={`${accentSolidClass(selectedColor)}`}>{lang === 'zh' ? '新增要点' : 'Add bullet'}</button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                );
                              })()}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => { setEditedWork((prev) => [...prev, { role: '', company: '', period: '', bullets: [''], volunteer: false }]); setSelectedWork((prev) => [...prev, false]); }} className={`${accentSolidLgClass(selectedColor)}`}>{lang === 'zh' ? '新增经历' : 'Add Item'}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 匹配进度条（居中区域下方） */}
          {showAnalysis && (!editMode && generated && (generated.matches.length > 0 || (generated.jdSkills?.length || 0) > 0)) && (
            <div className="order-3 md:order-3 md:col-span-2">
              <div className="mt-3 rounded-xl border border-black/10 dark:border-white/15 p-3 bg-white/90 dark:bg-black/20">
                <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium">{lang === 'zh' ? '综合匹配度（简历 vs JD）' : 'Overall Match (Resume vs JD)'}</span>
                  <span className="text-xs text-black/60 dark:text-white/60">{analysisProgress.pct}%</span>
                </div>
          <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden" aria-label={lang === "zh" ? "综合匹配度" : "Overall Match"} role="progressbar" aria-valuenow={analysisProgress.pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-full ${accentGradientClass(selectedColor)}`} style={{ width: `${analysisProgress.pct}%` }} />
                </div>
            <div className="mt-2 text-[11px] text-black/60 dark:text-white/60">{lang === 'zh' ? '权重：JD 要求 70% · 技能重合 30%' : 'Weights: JD Requirements 70% · Skill Overlap 30%'}</div>
              </div>
              {(!(showAnalysis && skillsAnalysis) && (((generated?.jdSkills?.length ?? 0) > 0) || ((generated?.jdMatchedSkills?.length ?? 0) > 0))) && (
                <div className="mt-3 rounded-xl border border-black/10 dark:border-white/15 p-5 bg-white/95 dark:bg-black/20 shadow-sm hover:shadow-md transition">
                  <h3 className="text-sm font-semibold mb-2">{lang === "zh" ? "JD 技能" : "JD Skills"}</h3>
                  {(generated?.jdSkills?.length || generated?.jdMatchedSkills?.length) ? (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {refineJdTermsClient(Array.from(new Set([...(generated?.jdSkills || []), ...(generated?.jdMatchedSkills || [])]))).map((s) => {
                        const matchedSet = new Set((generated?.jdMatchedSkills || []).map((x) => x.toLowerCase()));
                        const isMatch = matchedSet.has(String(s).toLowerCase());
                        const cls = isMatch
                          ? "inline-block rounded-full border px-3 py-1 text-sm bg-green-50 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-100 dark:border-green-400"
                          : "inline-block rounded-full border px-3 py-1 text-sm bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/20 dark:text-orange-100 dark:border-orange-400";
                        return (
                          <span key={s} className={cls}>
                            {s}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              )}
              {showAnalysis && skillsAnalysis && (
                <div className="mt-3 rounded-xl border border-black/10 dark:border-white/15 p-5 bg-white/95 dark:bg-black/20 shadow-sm hover:shadow-md transition">
                  <h3 className="text-sm font-semibold mb-2 relative">
                    {lang === 'zh' ? '一键分析结果（技能）' : 'One-click Analysis (Skills)'}
                    <span className={`absolute left-0 -bottom-1 h-0.5 w-20 ${accentGradientClass(selectedColor)}`} />
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    {/* 左侧：技能概览 */}
                    <div>
                      <div className="flex items-center mb-1">
                        <h4 className="text-xs font-semibold">{lang === 'zh' ? '硬技能' : 'Hard Skills'}</h4>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {(() => {
                          const resumeTechArr = (generated?.techSkills && generated.techSkills.length > 0)
                            ? generated.techSkills
                            : topKeywordsClient(resumeInput || '', 30);
                          const resumeHardSet = new Set(resumeTechArr.filter((x) => isHardSkillLike(x)).map((x) => toNorm(x)));
                          const uniqHard = Array.from(new Set([...
                            (skillsAnalysis.hard || []), ...(skillsAnalysis.missingHard || [])
                          ].map((s) => toNorm(s))));
                          return uniqHard.map((s) => {
                            const present = resumeHardSet.has(s);
                            const cls = present
                              ? "inline-flex items-center rounded-full border px-3 py-1 text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-100 dark:border-green-400"
                              : "inline-flex items-center rounded-full border px-3 py-1 text-xs bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/20 dark:text-orange-100 dark:border-orange-400";
                            const disp = String(s).replace(/[.,;:!?，。、；：！？]+/g, ' ').replace(/\s+/g, ' ').trim();
                            return (
                              <span key={`hard-${s}`} className={cls}>
                                {disp}
                              </span>
                            );
                          });
                        })()}
                        {Array.from(new Set([...(skillsAnalysis.hard || []), ...(skillsAnalysis.missingHard || [])])).length === 0 && (
                          <span className="text-[12px] text-black/50 dark:text-white/50">{lang === 'zh' ? '无' : 'None'}</span>
                        )}
                      </div>

                      <div className="flex items-center mb-1">
                        <h4 className="text-xs font-semibold">{lang === 'zh' ? '软技能' : 'Soft Skills'}</h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const resumeTechArr = (generated?.techSkills && generated.techSkills.length > 0)
                            ? generated.techSkills
                            : topKeywordsClient(resumeInput || '', 30);
                          const resumeBaseArr = (generated?.baseSkills && generated.baseSkills.length > 0)
                            ? generated.baseSkills
                            : extractSkillsFromResumeClient(resumeInput || '').base;
                          const resumeSoftSet = new Set([ ...resumeBaseArr, ...resumeTechArr.filter((x) => containsAny(x, SOFT_HINTS)) ].map((x) => toNorm(x)));
                          const uniqSoft = Array.from(new Set([...
                            (skillsAnalysis.soft || []), ...(skillsAnalysis.missingSoft || [])
                          ].map((s) => toNorm(s))));
                          return uniqSoft.map((s) => {
                            const present = resumeSoftSet.has(s);
                            const cls = present
                              ? "inline-flex items-center rounded-full border px-3 py-1 text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-100 dark:border-green-400"
                              : "inline-flex items-center rounded-full border px-3 py-1 text-xs bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/20 dark:text-orange-100 dark:border-orange-400";
                            const disp = String(s).replace(/[.,;:!?，。、；：！？]+/g, ' ').replace(/\s+/g, ' ').trim();
                            return (
                              <span key={`soft-${s}`} className={cls}>
                                {disp}
                              </span>
                            );
                          });
                        })()}
                        {Array.from(new Set([...(skillsAnalysis.soft || []), ...(skillsAnalysis.missingSoft || [])])).length === 0 && (
                          <span className="text-[12px] text-black/50 dark:text-white/50">{lang === 'zh' ? '无' : 'None'}</span>
                        )}
                      </div>
                    </div>

                    
                  </div>
                </div>
              )}
            </div>
          )}

        </div> {/* 栅格容器 */}
        {/* 移动端：技能分组展示（放在一键生成等按钮下方，技能板块上方） */}
        {showAnalysis && (
          <div className="md:hidden rounded-xl border border-black/10 dark:border-white/15 p-5 bg-white/95 dark:bg-black/20 shadow-sm hover:shadow-md transition">
            <div className="text-xs uppercase tracking-wider text-black/60 dark:text-white/70 mb-1">{lang === "zh" ? "简历" : "Resume"}</div>
            <h2 className="text-xl font-semibold mb-3 relative">
              {lang === "zh" ? "技能（技术 / 基础）" : "Technical Skills / Base Skills"}
              <span className={`absolute left-0 -bottom-1 h-0.5 w-24 ${accentGradientClass(selectedColor)}`} />
            </h2>
            {(generated && generated.techSkills && generated.techSkills.length > 0) && (
              <div className="mb-3">
                <h3 className="text-sm font-semibold mb-2">{lang === "zh" ? "技术技能" : "Technical Skills"}</h3>
                <div className="flex flex-wrap gap-2">
                  {generated.techSkills!.map((s) => (
                    <span key={s} className={`${accentPillClass(selectedColor)}`}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(generated && generated.baseSkills && generated.baseSkills.length > 0) && (
              <div>
                <h3 className="text-sm font-semibold mb-2">{lang === "zh" ? "基础技能" : "Base Skills"}</h3>
                <div className="flex flex-wrap gap-2">
                  {generated.baseSkills!.map((s) => (
                    <span key={s} className={`${accentPillClass(selectedColor)}`}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {/* 全宽分析内容（桌面端显示） */}
        <div className="space-y-4 mt-2">
          {/* 匹配概览（按经验类别） */}
          <div className="hidden rounded-xl border border-black/10 dark:border-white/15 p-5 bg-white/95 dark:bg-black/20 shadow-sm hover:shadow-md transition">
            <h2 className="text-xl font-semibold mb-1 relative">
              {lang === "zh" ? "匹配概览（按经验类别）" : "Coverage Summary (by experience category)"}
              <span className={`absolute left-0 -bottom-1 h-0.5 w-16 ${accentGradientClass(selectedColor)}`} />
            </h2>
            <div className="mb-2 text-xs text-black/60 dark:text-white/60" aria-label={lang === "zh" ? "类别命中比例" : "Category coverage ratio"}>
              {matchProgress.hit}/{matchProgress.total} · {matchProgress.pct}%
            </div>
            {coverageSummary.items.length === 0 ? (
              <p className="text-sm leading-6 text-black/70 dark:text-white/70">{lang === "zh" ? "暂无概览（请粘贴 JD 与简历）" : "No summary yet (paste JD and resume)"}</p>
            ) : (
              <ul className="space-y-3">
                {coverageSummary.items.map((c, i) => (
                  <li key={i} className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                    <p className="font-medium leading-6">
                      {c.covered ? (
                        <span className="inline-block align-middle mr-2 rounded-full px-2 py-0.5 text-xs bg-green-50 text-green-700 border border-green-200 dark:bg-green-500/20 dark:text-green-100 dark:border-green-400">
                          {lang === "zh" ? "已覆盖" : "Covered"}
                        </span>
                      ) : (
                        <span className="inline-block align-middle mr-2 rounded-full px-2 py-0.5 text-xs bg-gray-100 text-gray-700 border border-gray-200 dark:bg-white/10 dark:text-white/70 dark:border-white/20">
                          {lang === "zh" ? "未覆盖" : "Uncovered"}
                        </span>
                      )}
                      {lang === "zh" ? "经验类别" : "Category"}：<strong>{lang === "zh" ? c.labelZh : c.labelEn}</strong>
                    </p>
                    {c.covered && c.evidence ? (
                      <div className="mt-1 text-sm">
                        <div className="text-black/70 dark:text-white/70">
                          {lang === "zh" ? "来自" : "From"}：{[c.evidence.role, c.evidence.company].filter(Boolean).join(" @ ")}
                          {typeof c.evidence.workIndex === 'number' && (
                            <span className="ml-2 inline-block px-2 py-0.5 text-xs rounded-full border bg-black/5 text-black/70 dark:bg-white/10 dark:text-white/70">
                              {lang === 'zh'
                                ? (isVolunteerFinal(editedWork[c.evidence.workIndex]) ? '志愿者经验' : '工作经验')
                                : (isVolunteerFinal(editedWork[c.evidence.workIndex]) ? 'Volunteer' : 'Work')}
                            </span>
                          )}
                        </div>
                        {c.evidence.bullet ? (
                          <div className="mt-1 leading-6">• {highlight(c.evidence.bullet, generated.highlightTerms)}</div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-1 text-sm text-black/60 dark:text-white/60">
                        {lang === "zh" ? "建议补充：" : "Suggestion:"} {(CATEGORY_INFO[c.key]?.hints || []).slice(0,2).join("，")}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* 联系方式（无后端解析时回退到编辑字段） */}
          {false && (contactNameEdit || contactEmailEdit || contactPhoneEdit || generated?.contactName || generated?.contactEmail || generated?.contactPhone) && (
            <div className="hidden md:block rounded-xl border border-black/10 dark:border-white/15 p-5 bg-white/95 dark:bg-black/20 shadow-sm hover:shadow-md transition" style={{ display: editMode ? 'none' : undefined }}>
              <div className="text-xs uppercase tracking-wider text-black/60 dark:text-white/70 mb-1">{lang === "zh" ? "联系方式" : "Contact"}</div>
              <h2 className="text-xl font-semibold mb-3 relative">
                联系信息
                <span className={`absolute left-0 -bottom-1 h-0.5 w-20 ${accentGradientClass(selectedColor)}`} />
              </h2>
              <ul className="space-y-1 text-sm">
          {(contactNameEdit || generated?.contactName) && (
            <li>{lang === "zh" ? "姓名" : "Name"}：<strong>{contactNameEdit || generated?.contactName}</strong></li>
          )}
          {(contactEmailEdit || generated?.contactEmail) && (
            <li>{lang === "zh" ? "邮箱" : "Email"}：<strong>{contactEmailEdit || generated?.contactEmail}</strong></li>
          )}
          {(contactPhoneEdit || generated?.contactPhone) && (
            <li>{lang === "zh" ? "电话" : "Phone"}：<strong>{contactPhoneEdit || generated?.contactPhone}</strong></li>
          )}
          {contactAddressEdit && (
            <li>{lang === "zh" ? "地址" : "Address"}：<strong>{contactAddressEdit}</strong></li>
          )}
          {contactWebsiteEdit && (
            <li>{lang === "zh" ? "网站" : "Website"}：<strong>{contactWebsiteEdit}</strong></li>
          )}
              </ul>
            </div>
          )}
          {/* 技能分组展示 */}
          {showAnalysis && (
          <div className="hidden md:block rounded-xl border border-black/10 dark:border-white/15 p-5 bg-white/95 dark:bg-black/20 shadow-sm hover:shadow-md transition" style={{ display: editMode ? 'none' : undefined }}>
            <div className="text-xs uppercase tracking-wider text-black/60 dark:text-white/70 mb-1">{lang === "zh" ? "简历" : "Resume"}</div>
            <h2 className="text-xl font-semibold mb-3 relative">
              {lang === "zh" ? "技能（技术 / 基础）" : "Technical Skills / Base Skills"}
              <span className={`absolute left-0 -bottom-1 h-0.5 w-24 ${accentGradientClass(selectedColor)}`} />
            </h2>
            {(generated && generated.techSkills && generated.techSkills.length > 0) && (
              <div className="mb-3">
                <h3 className="text-sm font-semibold mb-2">{lang === "zh" ? "技术技能" : "Technical Skills"}</h3>
                <div className="flex flex-wrap gap-2">
                  {generated.techSkills!.map((s) => (
                    <span key={s} className={`${accentPillClass(selectedColor)}`}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(generated && generated.baseSkills && generated.baseSkills.length > 0) && (
              <div>
                <h3 className="text-sm font-semibold mb-2">{lang === "zh" ? "基础技能" : "Base Skills"}</h3>
                <div className="flex flex-wrap gap-2">
                  {generated.baseSkills!.map((s) => (
                    <span key={s} className={`${accentPillClass(selectedColor)}`}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}

          {showAnalysis && (
          <>
          {/* 精选经验（匹配 + 补充） */}
          <div className="hidden md:block rounded-xl border border-black/10 dark:border-white/15 p-5 bg-white/95 dark:bg-black/20 shadow-sm hover:shadow-md transition" style={{ display: editMode ? 'none' : undefined }}>
            <h2 className="text-xl font-semibold mb-3 relative">
              {lang === "zh" ? "精选经验（匹配 + 补充）" : "Selected Experience (Matched + Additional)"}
              <span className={`absolute left-0 -bottom-1 h-0.5 w-28 ${accentGradientClass(selectedColor)}`} />
            </h2>
            {false ? (
              <div className="rounded-md border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.05] px-3 py-2 text-sm text-black/70 dark:text-white/70">
                {lang === "zh" ? "暂无匹配（请粘贴 JD 与简历）" : "No matched items yet (paste JD and resume)"}
              </div>
            ) : (
              <div>
                
                {/* 压缩版匹配概览（嵌入精选经验内） */}
                <div className="rounded-lg border border-black/5 dark:border-white/10 p-3 bg-white/80 dark:bg-black/10 mb-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold">{lang === 'zh' ? '匹配概览' : 'Coverage Overview'}</h3>
                    <span className="text-[11px] text-black/60 dark:text-white/60">{matchProgress.hit}/{matchProgress.total} · {matchProgress.pct}%</span>
                  </div>
                  {coverageSummary.items.length === 0 ? null : (
                    <ul className="mt-1 space-y-1">
                      {coverageSummary.items.slice(0,3).map((c, i) => (
                        <li key={`mini-cov-${i}`} className="text-xs text-black/70 dark:text-white/70">
                          <span className={`inline-block align-middle mr-2 rounded-full px-2 py-0.5 text-[10px] border ${c.covered ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-100 dark:border-green-400' : 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-white/10 dark:text-white/70 dark:border-white/20'}`}>
                            {lang === 'zh' ? (c.covered ? '已覆盖' : '未覆盖') : (c.covered ? 'Covered' : 'Uncovered')}
                          </span>
                          <strong>{lang === 'zh' ? c.labelZh : c.labelEn}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mb-2 text-xs text-black/60 dark:text-white/60">
                  {lang === 'zh' ? '匹配经验不重复计入补充；其余全部作为补充' : "Matched experiences won't repeat; remaining are shown as additional"}
                </div>
                {/* 匹配经验 */}
                <div className="mb-2">
                  <h3 className="text-base font-semibold mb-1">{lang === 'zh' ? '匹配的工作经验' : 'Matched Work'}</h3>
                  {primaryWork.length === 0 ? (
                    <p className="text-sm leading-6 text-black/70 dark:text-white/70">{lang === 'zh' ? '暂无匹配经历' : 'No matched experiences'}</p>
                  ) : (
                    <ul className="space-y-3">
                      {primaryWork.map((w, i) => (
                        <li key={`m-${i}`} className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                          {(() => {
                            const idx = editedWork.findIndex((y) => (
                              (y.role || '') === (w.role || '') &&
                              (y.company || '') === (w.company || '') &&
                              (y.period || '') === (w.period || '')
                            ));
                            const checked = idx >= 0 ? Boolean(selectedWork[idx]) : false;
                            return (
                              <div className="mb-2 flex items-center justify-between">
                                <label className="flex items-center gap-2 text-xs text-black/80 dark:text-white/80">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => idx >= 0 && toggleWork(idx)}
                                    className="rounded border border-black/20 dark:border-white/25"
                                  />
                                  <span>{lang === 'zh' ? '加入简历' : 'Include in resume'}</span>
                                </label>
                                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-green-50 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-100 dark:border-green-400">
                                  {lang === 'zh' ? '匹配工作经历' : 'Matched Work'}
                                </span>
                              </div>
                            );
                          })()}
                          <div className="leading-7 space-y-1">
                            <p className="font-semibold">
                              <span className="mr-1">{lang === 'zh' ? '职位' : 'Job Title'}：</span>
                              {w.role && <strong>{w.role}</strong>}

                            </p>
                            {w.company && (
                              <p className="text-black/80 dark:text-white/80"><span className="font-medium">{lang === 'zh' ? '公司' : 'Company'}：</span>{w.company}</p>
                            )}
                            {w.period && (
                              <p className="text-black/80 dark:text-white/80"><span className="font-medium">{lang === 'zh' ? '时间段' : 'Period'}：</span>{w.period}</p>
                            )}
                            {(w.bullets && w.bullets.length > 0) && (

                              <div className="text-black/90 dark:text-white/90">
                                <span className="font-medium">{lang === 'zh' ? '简历要点（与 JD 匹配）' : 'Matched Resume Bullets'}：</span>
                                <ul className="list-disc list-inside space-y-1 pl-1">
                                  {(w.bullets || []).slice(0,3).map((b, j) => (
                                    <li key={`md-${j}`} className="leading-6">{highlight(b, generated?.highlightTerms ?? [])}</li>
                                  ))}
                                </ul>
                                {/* Removed "Copy to preview" button per request */}
                              </div>
                            )}

                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {/* 已移除“匹配的志愿者经验”，志愿者仅在“补充志愿者经验”展示且需 JD 匹配 */}
                {/* 补充经验 */}
                {/* 快速选择（仅工作）按钮组：移动至补充经验上方 */}
                <div className="mb-2 flex items-center justify-end">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          // 仅针对补充经验（工作）选择前 5 条推荐项
                          const additionalIdx: number[] = (additionalWork || [])
                            .map((w) => editedWork.findIndex((y) => (
                              (y.role || '') === (w.role || '') &&
                              (y.company || '') === (w.company || '') &&
                              (y.period || '') === (w.period || '')
                            )))
                            .filter((i) => i >= 0);
                          const bestScoreByWork = new Map<number, number>();
                          for (const it of (coverageSummary?.items || [])) {
                            if (!it.covered || !it.evidence || typeof it.evidence.workIndex !== 'number') continue;
                            const idx = it.evidence.workIndex;
                            const prev = bestScoreByWork.get(idx) ?? -Infinity;
                            const sc = it.evidence.score ?? 0;
                            if (sc > prev) bestScoreByWork.set(idx, sc);
                          }
                          const ranked = additionalIdx.sort((a, b) => {
                            const as = bestScoreByWork.get(a) ?? -Infinity;
                            const bs = bestScoreByWork.get(b) ?? -Infinity;
                            if (as !== bs) return bs - as;
                            const ac = editedWork[a]?.bullets?.length ?? 0;
                            const bc = editedWork[b]?.bullets?.length ?? 0;
                            if (ac !== bc) return bc - ac;
                            return a - b;
                          });
                          const chosen = new Set(ranked.slice(0, 5));
                          // 保持“匹配的工作经验”始终选中：与 primary 取并集
                          const primaryIdx: number[] = (combinedExperience.primary || [])
                            .map((w) => editedWork.findIndex((y) => (
                              y === w || (y.id && w.id && y.id === w.id) || (
                                (y.role || '') === (w.role || '') &&
                                (y.company || '') === (w.company || '') &&
                                (y.period || '') === (w.period || '')
                              )
                            )))
                            .filter((i) => i >= 0);
                          for (const i of primaryIdx) chosen.add(i);
                          setSelectedWork(editedWork.map((_, i) => chosen.has(i)));
                          setAutoSelectedPrimaryOnce(true);
                        } catch {}
                      }}
                      className="rounded-md px-2 py-1 text-xs bg-white text-black border border-black/10 dark:bg-black/40 dark:text-white"
                    >
                      {lang === 'zh' ? '一键勾选推荐' : 'Select Recommended'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const jdTextUsed = (jdInput || '').trim();
                          const summaryLocal = computeCoverageSummaryClient(editedWork, jdTextUsed);
                          const combinedLocal = combineExperienceForResumeClient(editedWork, summaryLocal, 2, 0, jdTextUsed);
                          const toIndex = (w: WorkItem) => editedWork.findIndex((y) => (
                            y === w || (y.id && w.id && y.id === w.id) || (
                              (y.role || '') === (w.role || '') &&
                              (y.company || '') === (w.company || '') &&
                              (y.period || '') === (w.period || '')
                            )
                          ));
                          const chosenIdx = (combinedLocal.primary || []).map(toIndex).filter((i) => i >= 0);
                          setSelectedWork(editedWork.map((_, i) => chosenIdx.includes(i)));
                          setAutoSelectedPrimaryOnce(true);
                        } catch {}
                      }}
                      className="rounded-md px-2 py-1 text-xs bg-white text-black border border-black/10 dark:bg-black/40 dark:text-white"
                    >
                      {lang === 'zh' ? '重置为匹配项' : 'Reset to Matched'}
                    </button>
                    <span className="text-[11px] text-black/60 dark:text-white/60">{lang === 'zh' ? '快速选择（工作/志愿者，可选分类）：' : 'Quick select (work/volunteer, optional category):'}</span>
                    <label className="ml-2 inline-flex items-center gap-1 text-[11px] text-black/70 dark:text-white/70">
                      <input type="checkbox" checked={includeVolunteerQuick} onChange={(e) => setIncludeVolunteerQuick(e.target.checked)} />
                      {lang === 'zh' ? '包含志愿者' : 'Include volunteer'}
                    </label>
                    <select
                      className="ml-2 rounded-md px-2 py-1 text-xs bg-white text-black border border-black/10 dark:bg-black/40 dark:text-white"
                      value={quickCategoryKey || ''}
                      onChange={(e) => setQuickCategoryKey(e.target.value || undefined)}
                    >
                      <option value="">{lang === 'zh' ? '全部分类' : 'All categories'}</option>
                      {Object.entries(CATEGORY_INFO).map(([key, info]) => (
                        <option key={key} value={key}>{lang === 'zh' ? info.zh : info.en}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => quickSelectWorkAndVolunteer(1)} className="ml-2 rounded-md px-2 py-1 text-xs bg-white text-black border border-black/10 dark:bg-black/40 dark:text-white hover:bg-black/5">
                      {lang === 'zh' ? '选1' : '1'}
                    </button>
                    <button type="button" onClick={() => quickSelectWorkAndVolunteer(3)} className="ml-1 rounded-md px-2 py-1 text-xs bg-white text-black border border-black/10 dark:bg-black/40 dark:text-white hover:bg-black/5">
                      {lang === 'zh' ? '选3' : '3'}
                    </button>
                    <button type="button" onClick={() => quickSelectWorkAndVolunteer(5)} className="ml-1 rounded-md px-2 py-1 text-xs bg-white text-black border border-black/10 dark:bg-black/40 dark:text-white hover:bg-black/5">
                      {lang === 'zh' ? '选5' : '5'}
                    </button>
                  </div>
                </div>
                {(combinedExperience.additional.length > 0) && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-base font-semibold">{lang === 'zh' ? '补充经验' : 'Additional Experience'}</h3>

                    </div>
                    <ul className="space-y-3">
                      {additionalWorkAuto.map((w, i) => (
                        <li key={`aw-${i}`} className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                          {(() => {
                            const idx = editedWork.findIndex((y) => (
                              (y.role || '') === (w.role || '') &&
                              (y.company || '') === (w.company || '') &&
                              (y.period || '') === (w.period || '')
                            ));
                            const checked = idx >= 0 ? Boolean(selectedWork[idx]) : false;

                            // 计算补充经验中的优选项（前 5 个）
                            let isPreferred = false;
                            try {
                              const evidenceBestByWork = new Map<number, number>();
                              for (const it of (coverageSummary?.items || [])) {
                                if (!it.covered || !it.evidence || typeof it.evidence.workIndex !== 'number') continue;
                                const wi = it.evidence.workIndex;
                                const prev = evidenceBestByWork.get(wi) ?? -Infinity;
                                const sc = it.evidence.score ?? 0;
                                if (sc > prev) evidenceBestByWork.set(wi, sc);
                              }
                              const ranked = Array.from(evidenceBestByWork.entries()).sort((a, b) => (b[1] - a[1]));
                              const primaryIdxSet = new Set(ranked.map(([j]) => j).slice(0, 2));
                              const restIdx = editedWork.map((_, j) => j).filter((j) => !primaryIdxSet.has(j));
                              const restRanked = restIdx.sort((a1, b1) => {
                                const aw = editedWork[a1];
                                const bw = editedWork[b1];
                                const av = isVolunteerFinal(aw) ? 1 : 0;
                                const bv = isVolunteerFinal(bw) ? 1 : 0;
                                if (av !== bv) return av - bv;
                                const as = evidenceBestByWork.get(a1) ?? 0;
                                const bs = evidenceBestByWork.get(b1) ?? 0;
                                if (as !== bs) return bs - as;
                                const ac = aw?.bullets?.length ?? 0;
                                const bc = bw?.bullets?.length ?? 0;
                                if (ac !== bc) return bc - ac;
                                return a1 - b1;
                              });
                              const preferredSet = new Set(restRanked.slice(0, 5));
                              isPreferred = idx >= 0 ? preferredSet.has(idx) : false;
                            } catch {}

                            return (
                              <div className="mb-2 flex items-center justify-between">
                                <label className="flex items-center gap-2 text-xs text-black/80 dark:text-white/80">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => idx >= 0 && toggleWork(idx)}
                                    className="rounded border border-black/20 dark:border-white/25"
                                  />
                                  <span>{lang === 'zh' ? '加入简历' : 'Include in resume'}</span>
                                </label>
                                {isPreferred ? (() => {
                                  const eidx = idx;
                                  let bestItem: CoverageItem | undefined;
                                  for (const it of (coverageSummary?.items || [])) {
                                    if (!it.covered || !it.evidence || typeof it.evidence.workIndex !== 'number') continue;
                                    if (it.evidence.workIndex === eidx) {
                                      if (!bestItem || ((it.evidence.score ?? 0) > (bestItem.evidence?.score ?? 0))) bestItem = it;
                                    }
                                  }
                                  const localPct = Math.round(Math.max(0, Math.min(100, ((bestItem?.evidence?.score ?? 0) * 100))));
                                  const reasonText = lang === 'zh' ? (bestItem?.labelZh || '匹配 JD') : (bestItem?.labelEn || 'JD match');
                                  const bulletText = (bestItem?.evidence?.bullet || '').trim();
                                  const tip = `${reasonText} • ${lang === 'zh' ? '覆盖' : 'Coverage '} ${localPct}%${bulletText ? (lang === 'zh' ? ' • 要点：' : ' • Bullet: ') + bulletText : ''}`;
                                  return (
                                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-green-50 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-100 dark:border-green-400" title={tip}>
                                      {lang === 'zh' ? '推荐' : 'Recommend'}
                                    </span>
                                  );
                                })() : null}
                              </div>
                            );
                          })()}
                          <div className="leading-7 space-y-1">
                            <p className="font-semibold">
                              <span className="mr-1">{lang === 'zh' ? '职位' : 'Job Title'}：</span>
                              {w.role && <strong>{w.role}</strong>}

                            </p>
                            {w.company && (
                              <p className="text-black/80 dark:text-white/80"><span className="font-medium">{lang === 'zh' ? '公司' : 'Company'}：</span>{w.company}</p>
                            )}
                            {w.period && (
                              <p className="text-black/80 dark:text-white/80"><span className="font-medium">{lang === 'zh' ? '时间段' : 'Period'}：</span>{w.period}</p>
                            )}
                            {(w.bullets && w.bullets.length > 0) && (
                              <div className="text-black/90 dark:text-white/90">
                                <span className="font-medium">{lang === 'zh' ? '简历要点（与 JD 匹配）' : 'Matched Resume Bullets'}：</span>
                                <ul className="list-disc list-inside space-y-1 pl-1">
                                  {(w.bullets || []).slice(0, jdBulletCount).map((b, j) => (
                                    <li key={`ad-${j}`} className="leading-6">{highlight(b, generated?.highlightTerms ?? [])}</li>
                                  ))}
                                </ul>
                                <div className="mt-2">
                                  {/* Removed "Copy to preview" button per request */}
                                </div>
                              </div>
                            )}

                          </div>
                        </li>
                      ))}
                    </ul>
                    {/* 志愿者补充经验（独立分栏） */}
                    <div>
                      <h4 className="text-base font-semibold mb-1">{lang === 'zh' ? '补充的志愿者经验' : 'Volunteer Experience'}</h4>
                      {additionalVolunteer.length === 0 ? (
                        <p className="text-sm text-black/70 dark:text-white/70">{lang === 'zh' ? '暂无补充的志愿者经历' : 'No additional volunteer experience'}</p>
                      ) : (
                        <ul className="space-y-3">
                          {additionalVolunteer.map((w, i) => (
                            <li key={`av-sel-${i}`} className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                              {(() => {
                                const idx = editedWork.findIndex((y) => (
                                  (y.role || '') === (w.role || '') &&
                                  (y.company || '') === (w.company || '') &&
                                  (y.period || '') === (w.period || '')
                                ));
                                const checked = idx >= 0 ? Boolean(selectedWork[idx]) : false;
                                return (
                                  <div className="mb-2 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <label className="flex items-center gap-2 text-xs text-black/80 dark:text-white/80">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => idx >= 0 && toggleWork(idx)}
                                          className="rounded border border-black/20 dark:border-white/25"
                                        />
                                        <span>{lang === 'zh' ? '加入简历' : 'Include in resume'}</span>
                                      </label>
                                      {/* 清理空条件渲染 */}
                                    </div>
                                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-100 dark:border-violet-400">
                                      {lang === 'zh' ? '志愿者经验' : 'Volunteer'}
                                    </span>
                                  </div>
                                );
                              })()}
                              <div className="leading-7 space-y-1">
                                <p className="font-semibold">
                                  <span className="mr-1">{lang === 'zh' ? '职位' : 'Job Title'}：</span>
                                  {w.role && <strong>{w.role}</strong>}

                                </p>
                                {w.company && (
                                  <p className="text-black/80 dark:text-white/80"><span className="font-medium">{lang === 'zh' ? '机构' : 'Organization'}：</span>{w.company}</p>
                                )}
                                {w.period && (
                                  <p className="text-black/80 dark:text-white/80"><span className="font-medium">{lang === 'zh' ? '时间段' : 'Period'}：</span>{w.period}</p>
                                )}
                                {(w.bullets && w.bullets.length > 0) && (
                                  <div className="text-black/90 dark:text-white/90">
                                    <span className="font-medium">{lang === 'zh' ? '描述' : 'Description'}：</span>
                                    <ul className="list-disc list-inside space-y-1 pl-1">
                                      {(w.bullets || []).slice(0,3).map((b, j) => (
                                        <li key={`avd-sel-${j}`} className="leading-6">{highlight(b, generated?.highlightTerms ?? [])}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                  </div>
                    </div>
                )}
              </div>
            )}
          </div>

          

          {/* 经验缺口建议（桌面端，按类别） */}
          {(!editMode && missingCategories.length > 0) && (
            <div className="hidden md:block rounded-xl border border-black/10 dark:border-white/15 p-5 bg-white/95 dark:bg-black/20 shadow-sm hover:shadow-md transition">
              <h2 className="text-xl font-semibold mb-3 relative">
                <span id="gap-suggestions">{lang === "zh" ? "经验缺口建议（按类别）" : "Gap Suggestions (by category)"}</span>
                <span className={`absolute left-0 -bottom-1 h-0.5 w-20 ${accentGradientClass(selectedColor)}`} />
              </h2>
              <ul className="space-y-3">
                {missingCategories.map((m, i) => (
                  <li key={i} className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                    <p className="font-medium leading-6">
            {lang === "zh" ? "类别" : "Category"}：<strong>{lang === "zh" ? m.labelZh : m.labelEn}</strong>
                    </p>
                    <ul className="list-disc list-inside space-y-1 pl-1">
                      {m.bullets.map((b, j) => (
                        <li key={j} className="leading-6">{highlight(b, generated?.highlightTerms ?? [])}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 编辑简历（页面内联，全宽卡片） */}
          {false && (
            <div className="md:col-span-2" id="edit-section">
              <div className="rounded-xl border border-black/10 dark:border-white/15 bg-white text-black dark:bg-black/90 dark:text-white shadow-sm">
                <div className="flex items-center justify-between px-5 py-3 border-b border-black/10 dark:border-white/15">
                  <h3 className="text-lg font-semibold">{lang === 'zh' ? '编辑简历' : 'Edit Resume'}</h3>
                  <div className="flex gap-2">
                    <button onClick={() => setEditMode(false)} className="rounded-md px-3 py-1.5 text-sm bg-black/80 text-white">{lang === 'zh' ? '关闭' : 'Close'}</button>
                    <button onClick={() => setEditMode(false)} className={`${accentSolidLgClass(selectedColor)}`}>{lang === 'zh' ? '保存并关闭' : 'Save & Close'}</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-5 py-4">
                  {/* 左侧：联系方式、简介、技能 */}
                  <div className="space-y-4">
                    <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">{lang === 'zh' ? '联系方式' : 'Contact'}</h4>
              <button type="button" onClick={handleAutoFillContact} className={`${accentSolidClass(selectedColor)}`}>
                {lang === 'zh' ? '从简历识别' : 'Detect from Resume'}
              </button>
            </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input value={contactNameEdit} onChange={(e) => setContactNameEdit(e.target.value)} placeholder={lang === 'zh' ? '姓名' : 'Name'} className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30" />
                        <input value={contactPhoneEdit} onChange={(e) => setContactPhoneEdit(e.target.value)} placeholder={lang === 'zh' ? '电话' : 'Phone'} className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30" />
                        <input value={contactEmailEdit} onChange={(e) => setContactEmailEdit(e.target.value)} placeholder={lang === 'zh' ? '邮箱' : 'Email'} className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30" />
                        <input value={contactAddressEdit} onChange={(e) => setContactAddressEdit(e.target.value)} placeholder={lang === 'zh' ? '地址' : 'Address'} className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30" />
                        <input value={contactWebsiteEdit} onChange={(e) => setContactWebsiteEdit(e.target.value)} placeholder={lang === 'zh' ? '网站' : 'Website'} className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30 md:col-span-2" />
                      </div>
                    </div>
                    <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">{lang === 'zh' ? '自我介绍' : 'Summary'}</h4>
              <button
                type="button"
                onClick={handleGenerateSummary}
                className={`${accentSolidClass(selectedColor)}`}
              >
                {lang === 'zh' ? '根据JD生成' : 'Generate from JD'}
              </button>
            </div>
                      <textarea value={summaryEdit} onChange={(e) => setSummaryEdit(e.target.value)} placeholder={lang === 'zh' ? '一句话电梯陈述（可选）' : 'One-line summary (optional)'} className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30 h-20" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold">{lang === 'zh' ? '技能' : 'Skills'}</h4>
                        {/* 按用户反馈移除手动识别按钮，改为自动识别 */}
                      </div>
                      <label className="text-xs mb-1 block">{lang === 'zh' ? '技术技能（逗号分隔）' : 'Technical (comma-separated)'}</label>
                      <input value={(techSkillsEdit || []).join(', ')} onChange={(e) => setTechSkillsEdit(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30 w-full" />
                      <label className="text-xs mb-1 block mt-2">{lang === 'zh' ? '基础技能（逗号分隔）' : 'Base (comma-separated)'}</label>
                      <input value={(baseSkillsEdit || []).join(', ')} onChange={(e) => setBaseSkillsEdit(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} className="rounded-md px-2 py-1 text-sm border border-black/10 dark:border-white/15 bg-white/95 dark:bg-black/30 w-full" />
                    </div>
                  </div>
                  {/* 右侧：仅JD匹配的经历（工作 / 志愿者） */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold mb-2">{lang === 'zh' ? '工作经验（JD匹配）' : 'Work Experience (JD matched)'}</h4>
                      {selectedWorkSorted.filter((w) => !isVolunteerFinal(w)).length === 0 ? (
                        <p className="text-sm text-black/70 dark:text-white/70">{lang === 'zh' ? '暂无匹配的工作经历' : 'No matched work experience'}</p>
                      ) : (
                        <ul className="space-y-3">
                          {selectedWorkSorted.filter((w) => !isVolunteerFinal(w)).map((w, i) => (
                            <li key={`ew-${i}`} className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                                <input value={w.role || ''} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x, idx) => idx === editedWork.findIndex((y) => y === w) ? { ...x, role: v } : x)); }} onBlur={(e) => { const v = e.target.value; const eid = editedWork.findIndex((y) => y === w); setEditedWork((prev) => prev.map((x, idx) => { if (idx !== eid) return x; const hasCompany = !!(x.company || '').trim(); if (hasCompany) return x; const comp = extractCompanyFromRoleClient(v); if (comp) { const rolePart = deriveRolePartClient(v, comp); return { ...x, role: rolePart, company: comp }; } return x; })); }} placeholder={lang === 'zh' ? '职位' : 'Role'} className="rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15" />
                                <input value={w.company || ''} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x, idx) => idx === editedWork.findIndex((y) => y === w) ? { ...x, company: v } : x)); }} placeholder={lang === 'zh' ? '公司' : 'Company'} className="rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15" />
                                <input value={w.period || ''} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x, idx) => idx === editedWork.findIndex((y) => y === w) ? { ...x, period: v } : x)); }} placeholder={lang === 'zh' ? '时间' : 'Period'} className="rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15" />
                              </div>
                              {(() => {
                                const idx = editedWork.findIndex((y) => y === w);
                                const checked = Boolean(selectedWork[idx]);
                                const isPrimary = (combinedExperience.primary || []).some(
                                  (x) =>
                                    (x.role || '') === (w.role || '') &&
                                    (x.company || '') === (w.company || '') &&
                                    (x.period || '') === (w.period || '')
                                );
                                return (
                                  <div className="mb-2 flex items-center justify-between">
                                    <label className="flex items-center gap-2 text-xs text-black/80 dark:text-white/80">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleWork(idx)}
                                        className="rounded border border-black/20 dark:border-white/25"
                                      />
                                      <span>{lang === 'zh' ? '加入简历' : 'Include in resume'}</span>
                                    </label>
                                    {isPrimary ? (() => {
                                      const eidx = idx;
                                      let bestItem: CoverageItem | undefined;
                                      for (const it of (coverageSummary?.items || [])) {
                                        if (!it.covered || !it.evidence || typeof it.evidence.workIndex !== 'number') continue;
                                        if (it.evidence.workIndex === eidx) {
                                          if (!bestItem || ((it.evidence.score ?? 0) > (bestItem.evidence?.score ?? 0))) bestItem = it;
                                        }
                                      }
                                      const localPct = Math.round(Math.max(0, Math.min(100, ((bestItem?.evidence?.score ?? 0) * 100))));
                                      const reasonText = lang === 'zh' ? (bestItem?.labelZh || '匹配 JD') : (bestItem?.labelEn || 'JD match');
                                      const bulletText = (bestItem?.evidence?.bullet || '').trim();
                                      const tip = `${reasonText} • ${lang === 'zh' ? '覆盖' : 'Coverage '} ${localPct}%${bulletText ? (lang === 'zh' ? ' • 要点：' : ' • Bullet: ') + bulletText : ''}`;
                                      return (
                                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-green-50 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-100 dark:border-green-400" title={tip}>
                                          {lang === 'zh' ? '推荐' : 'Recommend'}
                                        </span>
                                      );
                                    })() : null}
                                  </div>
                                );
                              })()}
                              <ul className="list-disc list-inside space-y-2">
                                {(w.bullets || []).map((b, j) => (
                                  <li key={`b-${j}`} className="flex items-center gap-2">
                                    <input value={b} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x) => (x === w ? { ...x, bullets: (x.bullets || []).map((bb, jj) => jj === j ? v : bb) } : x))); }} placeholder={lang === 'zh' ? '要点（动作+平台/技能+结果）' : 'Bullet (action+platform/skill+result)'} className="flex-1 rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15" />
                                    <button type="button" onClick={() => setEditedWork((prev) => prev.map((x) => (x === w ? { ...x, bullets: (x.bullets || []).filter((_, jj) => jj !== j) } : x)))} className="rounded-md px-2 py-1 text-xs bg-white text-black border border-black/10 dark:bg-black/40 dark:text-white">{lang === 'zh' ? '删除' : 'Remove'}</button>
                                  </li>
                                ))}
                              </ul>
                              <div className="mt-2 flex items-center gap-2">
                                <button type="button" onClick={() => setEditedWork((prev) => prev.map((x) => (x === w ? { ...x, bullets: [...(x.bullets || []), ''] } : x)))} className={`${accentSolidClass(selectedColor)}`}>{lang === 'zh' ? '新增要点' : 'Add bullet'}</button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold mb-2">{lang === 'zh' ? '志愿者经验（JD匹配）' : 'Volunteer Experience (JD matched)'}</h4>
                      {selectedWorkSorted.filter((w) => isVolunteerFinal(w)).length === 0 ? (
                        <p className="text-sm text-black/70 dark:text-white/70">{lang === 'zh' ? '暂无匹配的志愿者经历' : 'No matched volunteer experience'}</p>
                      ) : (
                        <ul className="space-y-3">
                          {selectedWorkSorted.filter((w) => isVolunteerFinal(w)).map((w, i) => (
                            <li key={`vw-${i}`} className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                                <input value={w.role || ''} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x, idx) => idx === editedWork.findIndex((y) => y === w) ? { ...x, role: v } : x)); }} onBlur={(e) => { const v = e.target.value; const eid = editedWork.findIndex((y) => y === w); setEditedWork((prev) => prev.map((x, idx) => { if (idx !== eid) return x; const hasCompany = !!(x.company || '').trim(); if (hasCompany) return x; const comp = extractCompanyFromRoleClient(v); if (comp) { const rolePart = deriveRolePartClient(v, comp); return { ...x, role: rolePart, company: comp }; } return x; })); }} placeholder={lang === 'zh' ? '职位' : 'Role'} className="rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15" />
                                <input value={w.company || ''} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x, idx) => idx === editedWork.findIndex((y) => y === w) ? { ...x, company: v } : x)); }} placeholder={lang === 'zh' ? '组织' : 'Org'} className="rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15" />
                                <input value={w.period || ''} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x, idx) => idx === editedWork.findIndex((y) => y === w) ? { ...x, period: v } : x)); }} placeholder={lang === 'zh' ? '时间' : 'Period'} className="rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15" />
                              </div>
                              {(() => {
                                const idx = editedWork.findIndex((y) => y === w);
                                const checked = Boolean(selectedWork[idx]);
                                const isPrimary = (combinedExperience.primary || []).some(
                                  (x) =>
                                    (x.role || '') === (w.role || '') &&
                                    (x.company || '') === (w.company || '') &&
                                    (x.period || '') === (w.period || '')
                                );
                                return (
                                  <div className="mb-2 flex items-center justify-between">
                                    <label className="flex items-center gap-2 text-xs text-black/80 dark:text-white/80">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleWork(idx)}
                                        className="rounded border border-black/20 dark:border-white/25"
                                      />
                                      <span>{lang === 'zh' ? '加入简历' : 'Include in resume'}</span>
                                    </label>
                                    {isPrimary ? (
                                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-green-50 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-100 dark:border-green-400">
                                        {lang === 'zh' ? '推荐' : 'Recommend'}
                                      </span>
                                    ) : null}
                                  </div>
                                );
                              })()}
                              <ul className="list-disc list-inside space-y-2">
                                {(w.bullets || []).map((b, j) => (
                                  <li key={`vb-${j}`} className="flex items-center gap-2">
                                    <input value={b} onChange={(e) => { const v = e.target.value; setEditedWork((prev) => prev.map((x) => (x === w ? { ...x, bullets: (x.bullets || []).map((bb, jj) => jj === j ? v : bb) } : x))); }} placeholder={lang === 'zh' ? '要点（动作+平台/技能+结果）' : 'Bullet'} className="flex-1 rounded-md px-2 py-1 text-sm bg-white/95 dark:bg-black/30 border border-black/10 dark:border-white/15" />
                                    <button type="button" onClick={() => setEditedWork((prev) => prev.map((x) => (x === w ? { ...x, bullets: (x.bullets || []).filter((_, jj) => jj !== j) } : x)))} className="rounded-md px-2 py-1 text-xs bg-white text-black border border-black/10 dark:bg-black/40 dark:text-white">{lang === 'zh' ? '删除' : 'Remove'}</button>
                                  </li>
                                ))}
                              </ul>
                              <div className="mt-2 flex items-center gap-2">
                                <button type="button" onClick={() => setEditedWork((prev) => prev.map((x) => (x === w ? { ...x, bullets: [...(x.bullets || []), ''] } : x)))} className={`${accentSolidClass(selectedColor)}`}>{lang === 'zh' ? '新增要点' : 'Add bullet'}</button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => { setEditedWork((prev) => [...prev, { role: '', company: '', period: '', bullets: [''], volunteer: false }]); setSelectedWork((prev) => [...prev, false]); }} className={`${accentSolidLgClass(selectedColor)}`}>{lang === 'zh' ? '新增经历' : 'Add Item'}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 已移除：原始“经历（工作/志愿者）”预览，避免与 JD 匹配视图重复 */}

         {/* PDF 导出容器：按截图风格渲染，与 exportPdf 联动 */}
        <div id="pdf-export" aria-hidden className="text-black" style={{ position: 'absolute', left: '-10000px', top: 0, fontFamily: exportFont, lineHeight: exportLine }}>
          {(() => {
            const infoFallback = extractContactInfoClient((resumeInput || '').trim());
            const extrasFallback = extractContactExtrasClient((resumeInput || '').trim());
            const name = (contactNameEdit || generated?.contactName || infoFallback.name || '').trim();
            const email = (contactEmailEdit || generated?.contactEmail || infoFallback.email || '').trim();
            const phone = (contactPhoneEdit || generated?.contactPhone || infoFallback.phone || '').trim();
            const addr = (contactAddressEdit || extrasFallback.address || '').trim();
            const site = (contactWebsiteEdit || extrasFallback.website || '').trim();
            const summaryCandidatePdf = (summaryEdit || generated?.summary || '').trim();
            const summary = summaryCandidatePdf || (extractSummaryClient((resumeInput || '').trim()) || '');
            const tech = (techSkillsEdit && techSkillsEdit.length ? techSkillsEdit : (generated?.techSkills || []));
            const base = (baseSkillsEdit && baseSkillsEdit.length ? baseSkillsEdit : (generated?.baseSkills || []));
            const edu = (educationEdit || []);
            // 使用与预览一致的 bullets：优先采用 combinedExperience 合并结果，必要时按 JD 兜底生成
            const workBase = selectedWorkSorted;
            const work = workBase.map((w) => {
              const same = (x: WorkItem) => (
                (x.role || '') === (w.role || '') &&
                (x.company || '') === (w.company || '') &&
                (x.period || '') === (w.period || '')
              );
              const fromCombined = (combinedExperience.primary || []).find(same) || (combinedExperience.additional || []).find(same) || w;
              const filtered = (fromCombined.bullets || []).filter(Boolean);
              const needFallback = filtered.length === 0;
              const jdText = (jdInput || '').trim();
              const fallbackCats = needFallback ? Array.from(new Set(extractCategoriesFromTextClient(`${w.role || ''} ${jdText}`))) : [];
              const fallbackFromCats = needFallback ? fallbackCats.flatMap((c) => suggestBulletsForCategory(c, lang)).filter(Boolean).slice(0, 2) : [];
              const fallbackFromReqs = (needFallback && fallbackFromCats.length === 0)
                ? jdRequirementsFromTextClient(jdText).flatMap((r) => suggestBulletsFromRequirement(r, lang)).filter(Boolean).slice(0, 2)
                : [];
              const displayBullets = filtered.length > 0 ? filtered : (fallbackFromCats.length > 0 ? fallbackFromCats : fallbackFromReqs);
              return { ...w, bullets: displayBullets } as WorkItem;
            });
            const sectionTitle = (tZh: string, tEn: string) => (lang === 'zh' ? tZh : tEn);
            return (
              (() => {
                // 分页：严格排版模式优先，否则走用户自定义数量
                const total = work.length;
                const chunks: { items: WorkItem[]; offset: number; bulletCap: number }[] = [];
                if (strictLayoutPreset) {
                  // 参考人信息用于决定第二页数量（7 或 8）
                  const hasRef = [referenceName, referencePhone, referenceEmail, referenceCompany, referenceRelationship].some((x) => (x || '').trim().length > 0);
                  // 区分主/补充/志愿者
                  const sameKey = (x: WorkItem, y: WorkItem) => (
                    (x.role || '') === (y.role || '') &&
                    (x.company || '') === (y.company || '') &&
                    (x.period || '') === (y.period || '')
                  );
                  const isPrimary = (w: WorkItem) => (combinedExperience.primary || []).some((p) => sameKey(p, w));
                  const isAdditional = (w: WorkItem) => (combinedExperience.additional || []).some((a) => sameKey(a, w));
                  const nonVolunteer = work.filter((w) => !isVolunteerFinal(w));
                  const volunteers = work.filter((w) => isVolunteerFinal(w));
                  const orderedNonVol = [
                    ...nonVolunteer.filter(isPrimary),
                    ...nonVolunteer.filter(isAdditional),
                    ...nonVolunteer.filter((w) => !isPrimary(w) && !isAdditional(w)),
                  ];
                  // 第 1 页：6 条非志愿者，主经历上限 6，要点；补充经历上限 5 要点
                  const firstPageCount = 6;
                  const firstPageRaw = orderedNonVol.slice(0, firstPageCount);
                  const firstPageItems = firstPageRaw.map((w) => {
                    const cap = isPrimary(w) ? 6 : 5;
                    return { ...w, bullets: (w.bullets || []).filter(Boolean).slice(0, cap) } as WorkItem;
                  });
                  const firstKeys = new Set(firstPageRaw.map((w) => `${w.role || ''}|${w.company || ''}|${w.period || ''}`));
                  // 剩余候选（包含志愿者），保持原顺序
                  const restCandidates = work.filter((w) => !firstKeys.has(`${w.role || ''}|${w.company || ''}|${w.period || ''}`));
                  // 第 2 页：8（无推荐人）或 7（有推荐人）条，包含志愿者；统一要点上限 5
                  const secondPageTarget = hasRef ? 7 : 8;
                  const secondPageRaw = restCandidates.slice(0, secondPageTarget);
                  const secondPageItems = secondPageRaw.map((w) => ({ ...w, bullets: (w.bullets || []).filter(Boolean).slice(0, 5) } as WorkItem));
                  const secondKeys = new Set(secondPageRaw.map((w) => `${w.role || ''}|${w.company || ''}|${w.period || ''}`));
                  // 后续页：其余全部，统一要点上限沿用页面设置或 JD 默认
                  const remainingRaw = restCandidates.filter((w) => !secondKeys.has(`${w.role || ''}|${w.company || ''}|${w.period || ''}`));
                  const remainingItems = remainingRaw.map((w) => ({ ...w, bullets: (w.bullets || []).filter(Boolean).slice(0, pageBulletCaps[2] ?? jdBulletCount) } as WorkItem));
                  // 组装 chunks，offset 按顺序递增
                  let offStrict = 0;
                  if (firstPageItems.length > 0) { chunks.push({ items: firstPageItems, offset: offStrict, bulletCap: 99 }); offStrict += firstPageItems.length; }
                  if (secondPageItems.length > 0 && pageCount >= 2) { chunks.push({ items: secondPageItems, offset: offStrict, bulletCap: 5 }); offStrict += secondPageItems.length; }
                  if (remainingItems.length > 0 && pageCount >= 3) { chunks.push({ items: remainingItems, offset: offStrict, bulletCap: pageBulletCaps[2] ?? jdBulletCount }); }
                } else {
                  // 原有：用户可控分页（每页数量 + 要点上限）
                  const desiredCounts = [
                    Math.max(0, Math.min(pageWorkCounts[0], total)),
                    Math.max(0, Math.min(pageWorkCounts[1], Math.max(0, total - Math.min(pageWorkCounts[0], total)))),
                    Math.max(0, Math.min(pageWorkCounts[2], Math.max(0, total - Math.min(pageWorkCounts[0], total) - Math.min(pageWorkCounts[1], Math.max(0, total - Math.min(pageWorkCounts[0], total)))))),
                  ].slice(0, pageCount);
                  let off = 0;
                  desiredCounts.forEach((cnt, idx) => {
                    const size = Math.min(cnt, total - off);
                    const items = work.slice(off, off + size);
                    chunks.push({ items, offset: off, bulletCap: pageBulletCaps[idx] ?? jdBulletCount });
                    off += size;
                  });
                  if (off < total && chunks.length > 0) {
                    const last = chunks[chunks.length - 1];
                    last.items = [...last.items, ...work.slice(off)];
                  }
                }
                // 动态排版：根据当前页的经历数量自适应间距与字体
                const computeSpacing = (count: number) => {
                  if (count <= 2) return { sectionGap: 28, workGap: 24, bulletGap: 8, fontScale: 1.06 };
                  if (count <= 4) return { sectionGap: 22, workGap: 18, bulletGap: 6, fontScale: 1.02 };
                  if (count <= 6) return { sectionGap: 18, workGap: 14, bulletGap: 5, fontScale: 1.0 };
                  return { sectionGap: 14, workGap: 12, bulletGap: 4, fontScale: 0.98 };
                };
                const renderWorkBlock = (items: WorkItem[], offset = 0, bulletCap = jdBulletCount, spacing?: { workGap: number; bulletGap: number; fontScale: number }) => (
                  <div className="px-[72px] py-5" style={{ paddingLeft: 'var(--pagePad)', paddingRight: 'var(--pagePad)', display: 'grid', rowGap: 'calc(' + (spacing?.workGap ?? 16) + 'px * var(--vGapScale, 1))' }}>
                    {items.map((w, i) => {
                      const idx = offset + i;
                      const headerLeft = [w.role || null, w.company || null].filter(Boolean).join(' | ');
                      const bullets = (w.bullets || []).filter(Boolean).slice(0, bulletCap);
                      const firstBullet = bullets[0];
                      const restBullets = bullets.slice(1);
                      return (
                        <div key={`wk-${idx}`} style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                          {(headerLeft || w.period) && (
                            <div className="flex items-start justify-between">
                              <p className="font-semibold">{headerLeft}</p>
                              {w.period && <p className="text-sm text-black/70">{w.period}</p>}
                            </div>
                          )}
                          {firstBullet && (
                            <p className="font-semibold" style={{ fontSize: 'calc(' + (14 * (spacing?.fontScale ?? 1)) + 'px * var(--fontScale, 1))', lineHeight: exportLine }}>{firstBullet}</p>
                          )}
                          {restBullets.length > 0 && (
                            <ul className="list-disc pl-6" style={{ rowGap: 'calc(' + (spacing?.bulletGap ?? 6) + 'px * var(--vGapScale, 1))', fontSize: 'calc(' + (14 * (spacing?.fontScale ?? 1)) + 'px * var(--fontScale, 1))', lineHeight: exportLine }}>
                              {restBullets.map((b, j) => <li key={`wk-b-${idx}-${j}`}>{b}</li>)}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
                // 页面 1 的动态间距
                const spacing1 = computeSpacing(chunks[0]?.items.length || 0);
                return (
                  <>
                    {/* Page 1 */}
                    <div data-pdf-page className={"w-[816px] h-[1056px] bg-white text-[14px] overflow-hidden " + (selectedTemplate === 'classic' ? 'font-serif' : selectedTemplate === 'modern' ? 'font-sans tracking-wide' : 'font-sans text-[13px] leading-[1.5]')}>
                      <div className="px-[72px] pt-[64px]" style={{ paddingLeft: 'var(--pagePad)', paddingRight: 'var(--pagePad)' }}>
                        {name && <h1 className="text-[36px] font-extrabold text-center tracking-[0.085em]">{lang === 'zh' ? name : name.toUpperCase()}</h1>}
                        {(email || phone || addr || site) && (
                          <p className="mt-3 text-[13px] text-center text-black/60">
                            {[email || null, phone || null, addr || null, site || null].filter(Boolean).join(' | ')}
                          </p>
                        )}
                      </div>
                      {/* Summary */}
                      <div style={{ marginTop: 'calc(' + spacing1.sectionGap + 'px * var(--vGapScale, 1))' }}>
                        <SectionBar title={sectionTitle('个人简介', 'Personal Summary')} uppercase={lang !== 'zh'} accent={selectedColor} />
                        {summary && <div className="px-[72px] py-4 text-[14px]" style={{ fontSize: 'calc(14px * var(--fontScale, 1))' }}>{summary}</div>}
                      </div>
                      {/* Education */}
                      {edu.length > 0 && (
                        <div style={{ marginTop: 'calc(' + spacing1.sectionGap + 'px * var(--vGapScale, 1))' }}>
                          <SectionBar title={sectionTitle('教育经历', 'Education')} uppercase={lang !== 'zh'} accent={selectedColor} />
                          <div className="px-[72px] py-4" style={{ paddingLeft: 'var(--pagePad)', paddingRight: 'var(--pagePad)' }}>
                            <ul className="list-disc pl-6" style={{ rowGap: 'calc(' + spacing1.bulletGap + 'px * var(--vGapScale, 1))', fontSize: 'calc(14px * var(--fontScale, 1))', lineHeight: exportLine }}>
                              {edu.map((e, i) => {
                                const degreeField = e.degree
                                  ? (lang === 'zh'
                                      ? `${e.degree}${e.field ? `（${e.field}）` : ''}`
                                      : `${e.degree}${e.field ? ` in ${e.field}` : ''}`)
                                  : (e.field || '');
                                const header = [degreeField || null, e.school || null, e.period || null].filter(Boolean).join(' | ');
                                return <li key={`edu-${i}`}>{header}</li>;
                              })}
                            </ul>
                          </div>
                        </div>
                      )}
                      {/* Technical Skills */}
                      {(tech.length || base.length) ? (
                        <div style={{ marginTop: 'calc(' + spacing1.sectionGap + 'px * var(--vGapScale, 1))' }}>
                          <SectionBar title={sectionTitle('技能', 'Technical Skills')} uppercase={lang !== 'zh'} accent={selectedColor} />
                          <div className="px-[72px] py-4 text-[14px]" style={{ fontSize: 'calc(14px * var(--fontScale, 1))' }}>
                            {tech.length > 0 && (
                              <div className="mb-2">
                                <span className="font-medium">{lang === 'zh' ? '技术:' : 'Technical:'} </span>
                                <span>{tech.join(', ')}</span>
                              </div>
                            )}
                            {base.length > 0 && (
                              <div>
                                <span className="font-medium">{lang === 'zh' ? '通用:' : 'General:'} </span>
                                <span>{base.join(', ')}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                      {/* Work Experience (first page chunk) */}
                      {work.length > 0 && (
                        <div className="mt-6">
                          <SectionBar title={sectionTitle(STR.workExperience[0], STR.workExperience[1])} uppercase={lang !== 'zh'} accent={selectedColor} />
                          {renderWorkBlock(chunks[0].items, chunks[0].offset, chunks[0].bulletCap)}
                        </div>
                      )}
                    </div>
                    {/* Next pages */}
                    {chunks.slice(1).map((ch, pIdx) => (
                      <Fragment key={`pg-${pIdx}`}>
                        <div className="html2pdf__page-break" style={{ height: 0, pageBreakBefore: 'always' }} />
                        <div data-pdf-page className={"w-[816px] h-[1056px] bg-white text-[14px] overflow-hidden " + (selectedTemplate === 'classic' ? 'font-serif' : selectedTemplate === 'modern' ? 'font-sans tracking-wide' : 'font-sans text-[13px] leading-[1.5]')}>
                          <div className="px-[72px] pt-[64px]" style={{ paddingLeft: 'var(--pagePad)', paddingRight: 'var(--pagePad)' }} />
                          {/* 连续呈现工作经历，不再重复“附加工作经历”标题 */}
                          {renderWorkBlock(ch.items, ch.offset, ch.bulletCap)}
                        </div>
                      </Fragment>
                    ))}
                  </>
                );
              })()
            );
          })()}
        </div>
          </>
        )}
        </div>

        {/* 实时匹配进度已移入“联系方式”卡片顶部显示 */}
      {showPreview && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 overflow-y-auto p-4 sm:p-6"
          role="dialog"
          aria-modal
          tabIndex={-1}
          onClick={(e) => {
            // 点击遮罩（非内容区域）关闭
            if (e.target === e.currentTarget) setShowPreview(false);
          }}
        >
          <div className="w-full max-w-[1100px] rounded-2xl bg-white dark:bg-black p-6 shadow-xl border border-black/10 dark:border-white/15 max-h-[90vh] overflow-auto text-black dark:text-white">
              <div className="px-6 py-3 bg-white dark:bg-black border-b border-black/10 dark:border-white/15 flex items-center justify-between">
                <h3 className="text-lg font-semibold">{lang === "zh" ? "简历预览" : "Resume Preview"}</h3>
                <div className="flex items-center gap-2">
                  {/* 预览内的“下载 Word”按钮：点击后显示版式选项面板 */}
                  <button
                    onClick={() => setShowDocxOptions((v) => !v)}
                    className={`${accentSolidLgClass(selectedColor)}`}
                  >
                    {lang === 'zh' ? '下载 Word' : 'Download Word'}
                  </button>
                  <button
                    onClick={() => setEditInPreview((v) => !v)}
                    className={`${editInPreview ? accentSoftLgClass(selectedColor) : 'rounded-md px-3 py-1.5 text-sm bg-black/80 text-white hover:bg-black'}`}
                  >
                    {editInPreview ? (lang === 'zh' ? '编辑模式：开' : 'Edit: On') : (lang === 'zh' ? '编辑模式：关' : 'Edit: Off')}
                  </button>
                  <label className="text-sm text-black/70 dark:text-white/70">{lang === 'zh' ? '样式' : 'Style'}</label>
                  <select className="text-sm rounded-md px-2 py-1 bg-black/80 text-white" value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value as any)}>
                    <option value="classic">{lang === 'zh' ? '经典' : 'Classic'}</option>
                    <option value="modern">{lang === 'zh' ? '现代' : 'Modern'}</option>
                    <option value="compact">{lang === 'zh' ? '紧凑' : 'Compact'}</option>
                  </select>
                  <label className="text-sm text-black/70 dark:text-white/70">{lang === 'zh' ? '颜色' : 'Color'}</label>
                  <select className="text-sm rounded-md px-2 py-1 bg-black/80 text-white" value={selectedColor} onChange={(e) => setSelectedColor(e.target.value as any)}>
                    <option value="indigo">{lang === 'zh' ? '靛青' : 'Indigo'}</option>
                    <option value="blue">{lang === 'zh' ? '蓝色' : 'Blue'}</option>
                    <option value="teal">{lang === 'zh' ? '蓝绿' : 'Teal'}</option>
                    <option value="rose">{lang === 'zh' ? '玫红' : 'Rose'}</option>
                    <option value="purple">{lang === 'zh' ? '紫罗兰' : 'Purple'}</option>
                    <option value="emerald">{lang === 'zh' ? '祖母绿' : 'Emerald'}</option>
                    <option value="amber">{lang === 'zh' ? '琥珀' : 'Amber'}</option>
                    <option value="pink">{lang === 'zh' ? '粉色' : 'Pink'}</option>
                    <option value="slate">{lang === 'zh' ? '灰蓝' : 'Slate'}</option>
                  </select>
                  <select className="text-sm rounded-md px-2 py-1 bg-black/80 text-white" value={String(previewZoom)} onChange={(e) => setPreviewZoom(parseFloat(e.target.value))}>
                    <option value="0.9">90%</option>
                    <option value="1">100%</option>
                    <option value="1.1">110%</option>
                    <option value="1.25">125%</option>
                    <option value="1.5">150%</option>
                  </select>
                  {/* 志愿者开关迁移至“补充经验”标题右侧 */}

                  <button onClick={() => setShowPreview(false)} className="rounded-md px-3 py-1.5 text-sm bg-black/80 text-white">{lang === "zh" ? "关闭" : "Close"}</button>
                </div>
              </div>
            {/* 结构化简历预览（五大模块） */}
            <div className={"pt-4 " + (selectedTemplate === 'classic' ? 'space-y-8 font-serif' : selectedTemplate === 'modern' ? accentSoftBgClass(selectedColor) : 'space-y-3 text-[13px] leading-[1.5]')} style={{ transform: `scale(${previewZoom})`, transformOrigin: 'top left' }}>
              {/* 个人信息（Header） */}
              <section>
                <h4 className="text-sm font-semibold mb-2">{lang === 'zh' ? '个人信息' : 'Header'}</h4>
                {(() => {
                  // 回退：从简历文本中自动识别联系方式，保证预览不缺失姓名
                  const infoFallback = extractContactInfoClient((resumeInput || '').trim());
                  const extrasFallback = extractContactExtrasClient((resumeInput || '').trim());
                  const name = (contactNameEdit || generated?.contactName || infoFallback.name || '').trim();
                  const email = (contactEmailEdit || generated?.contactEmail || infoFallback.email || '').trim();
                  const phone = (contactPhoneEdit || generated?.contactPhone || infoFallback.phone || '').trim();
                  const addr = (contactAddressEdit || extrasFallback.address || '').trim();
                  const site = (contactWebsiteEdit || extrasFallback.website || '').trim();
                  return (
                    <div className="text-center leading-[1.6]">
                      {name && <h1 className="text-[28px] font-extrabold tracking-[0.08em]">{name.toUpperCase()}</h1>}
                      {(email || phone || addr || site) && (
                        <p className="mt-1.5 text-[13px] text-black/70 dark:text-white/70">
                          {[email || null, phone || null, addr || null, site || null].filter(Boolean).join(' | ')}
                        </p>
                      )}
                    </div>
                  );
                })()}
                {editInPreview && (
                  <div className="mt-3 px-[72px]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[13px]">
                      <input value={contactNameEdit || ''} onChange={(e) => setContactNameEdit(e.target.value)} placeholder={lang === 'zh' ? '姓名' : 'Name'} className="border rounded-md px-2 py-1 bg-transparent" />
                      <input value={contactEmailEdit || ''} onChange={(e) => setContactEmailEdit(e.target.value)} placeholder={lang === 'zh' ? '邮箱' : 'Email'} className="border rounded-md px-2 py-1 bg-transparent" />
                      <input value={contactPhoneEdit || ''} onChange={(e) => setContactPhoneEdit(e.target.value)} placeholder={lang === 'zh' ? '电话' : 'Phone'} className="border rounded-md px-2 py-1 bg-transparent" />
                      <input value={contactAddressEdit || ''} onChange={(e) => setContactAddressEdit(e.target.value)} placeholder={lang === 'zh' ? '地址' : 'Address'} className="border rounded-md px-2 py-1 bg-transparent" />
                      <input value={contactWebsiteEdit || ''} onChange={(e) => setContactWebsiteEdit(e.target.value)} placeholder={lang === 'zh' ? '网站' : 'Website'} className="border rounded-md px-2 py-1 bg-transparent" />
                    </div>
                    <div className="mt-2 flex gap-2">
                      {/* Removed: Detect from resume button (auto-detect runs on preview open) */}
                    </div>
                  </div>
                )}
              </section>

              {/* 个人简介（Personal Summary） */}
              <section>
                <SectionBar title={lang === 'zh' ? '个人简介' : 'Personal Summary'} width="w-full" textClass="text-[13px]" uppercase={lang !== 'zh'} accent={selectedColor} />
                {!editInPreview && (
                  <div className="px-[72px] py-4 text-[14px]" style={{ fontSize: 'calc(14px * var(--fontScale, 1))' }}>
                    {(() => {
                      const sCand = (summaryEdit || generated?.summary || '').trim();
                      const s = sCand || (extractSummaryClient((resumeInput || '').trim()) || '');
                      return s || (lang === 'zh' ? '（可在编辑区填写或一键根据 JD 生成个人简介）' : '(Fill in personal summary in Edit panel or generate from JD)');
                    })()}
                  </div>
                )}
                {editInPreview && (
                  <div className="px-[72px] py-3">
                    <textarea
                      value={summaryEdit || ''}
                      onChange={(e) => setSummaryEdit(e.target.value)}
                      rows={4}
                      placeholder={lang === 'zh' ? '填写个人简介（支持 Markdown）' : 'Write personal summary (Markdown supported)'}
                      className="w-full border rounded-md px-2 py-1 bg-transparent text-[13px]"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => {
                          const sel = (editedWork || []).filter((_, i) => selectedWork[i]);
                          const s = generateSummaryFromJDClient(sel.length ? sel : editedWork, jdInput || '', lang);
                          if (s) setSummaryEdit(s);
                        }}
                        className={`${accentSolidLgClass(selectedColor)}`}
                      >
                        {lang === 'zh' ? '根据 JD 生成个人简介' : 'Generate from JD'}
                      </button>
                      <button onClick={() => setSummaryEdit('')} className="rounded-md px-3 py-1.5 text-sm bg-black/80 text-white">
                        {lang === 'zh' ? '清空' : 'Clear'}
                      </button>
                    </div>
                  </div>
                )}
              </section>
              {/* 教育背景（Education） */}
              <section>
                <SectionBar title={lang === 'zh' ? '教育经历' : 'Education'} width="w-full" textClass="text-[13px]" uppercase={lang !== 'zh'} accent={selectedColor} />
                {(!educationEdit || educationEdit.length === 0) ? (
                  <p className="text-sm text-black/70 dark:text-white/70">{lang === 'zh' ? '请在编辑区填写教育经历' : 'Please add education in Edit panel'}</p>
                ) : (
                  <ul className="px-[72px] py-3 space-y-2 text-[14px]">
                    {educationEdit.map((e, i) => {
                      const degreeField = e.degree
                        ? (lang === 'zh'
                            ? `${e.degree}${e.field ? `（${e.field}）` : ''}`
                            : `${e.degree}${e.field ? ` in ${e.field}` : ''}`)
                        : (e.field || '');
                      const header = [degreeField || null, e.school || null, e.period || null].filter(Boolean).join(' | ');
                      return <li key={`edu-${i}`}>• {header}</li>;
                    })}
                  </ul>
                )}
                {editInPreview && (
                  <div className="px-[72px] py-3 space-y-3">
                    {(educationEdit || []).map((e, i) => (
                      <div key={`edu-edit-${i}`} className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[13px]">
                        <input value={e.degree || ''} onChange={(ev) => { const arr = [...(educationEdit || [])]; arr[i] = { ...(arr[i] || {}), degree: ev.target.value }; setEducationEdit(arr); }} placeholder={lang === 'zh' ? '学位（Bachelor/Master 等）' : 'Degree'} className="border rounded-md px-2 py-1 bg-transparent" />
                        <input value={e.field || ''} onChange={(ev) => { const arr = [...(educationEdit || [])]; arr[i] = { ...(arr[i] || {}), field: ev.target.value }; setEducationEdit(arr); }} placeholder={lang === 'zh' ? '专业/科目' : 'Field'} className="border rounded-md px-2 py-1 bg-transparent" />
                        <input value={e.school || ''} onChange={(ev) => { const arr = [...(educationEdit || [])]; arr[i] = { ...(arr[i] || {}), school: ev.target.value }; setEducationEdit(arr); }} placeholder={lang === 'zh' ? '学校' : 'School'} className="border rounded-md px-2 py-1 bg-transparent" />
                        <div className="flex gap-2">
                          <input value={e.period || ''} onChange={(ev) => { const arr = [...(educationEdit || [])]; arr[i] = { ...(arr[i] || {}), period: ev.target.value }; setEducationEdit(arr); }} placeholder={lang === 'zh' ? '起止时间' : 'Period'} className="border rounded-md px-2 py-1 bg-transparent flex-1" />
                          <button onClick={() => { const arr = [...(educationEdit || [])]; arr.splice(i, 1); setEducationEdit(arr); }} className="rounded-md px-3 py-1.5 text-sm bg-black/80 text-white">{lang === 'zh' ? '删除' : 'Delete'}</button>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setEducationEdit([...(educationEdit || []), { degree: '', field: '', school: '', period: '' }])} className={`${accentSolidLgClass(selectedColor)}`}>
                      {lang === 'zh' ? '添加教育经历' : 'Add education'}
                    </button>
                  </div>
                )}
              </section>

              {/* 技能（Skills） */}
              <section>
                <SectionBar title={lang === 'zh' ? '技能' : 'Technical Skills'} width="w-full" textClass="text-[13px]" uppercase={lang !== 'zh'} accent={selectedColor} />
                {(() => {
                  const tech = (techSkillsEdit && techSkillsEdit.length ? techSkillsEdit : (generated?.techSkills || []));
                  const base = (baseSkillsEdit && baseSkillsEdit.length ? baseSkillsEdit : (generated?.baseSkills || []));
                  const hardTitle = lang === 'zh' ? '技术:' : 'Technical:';
                  const softTitle = lang === 'zh' ? '通用:' : 'General:';
                  return (
                    <div className="px-[72px] py-3 space-y-2 text-[14px]">
                      {tech.length > 0 && (
                        <div>
                          <span className="font-medium mr-1">{hardTitle}</span>
                          <span>{tech.join(', ')}</span>
                        </div>
                      )}
                      {base.length > 0 && (
                        <div>
                          <span className="font-medium mr-1">{softTitle}</span>
                          <span>{base.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {editInPreview && (
                  <div className="px-[72px] py-3 space-y-2">
                    <div className="text-[13px]">
                      <label className="block text-xs mb-1">{lang === 'zh' ? '技术技能（逗号分隔）' : 'Technical skills (comma-separated)'}</label>
                      <input
                        value={(techSkillsEdit || []).join(', ')}
                        onChange={(e) => setTechSkillsEdit(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        className="w-full border rounded-md px-2 py-1 bg-transparent"
                      />
                    </div>
                    <div className="text-[13px]">
                      <label className="block text-xs mb-1">{lang === 'zh' ? '通用技能（逗号分隔）' : 'General skills (comma-separated)'}</label>
                      <input
                        value={(baseSkillsEdit || []).join(', ')}
                        onChange={(e) => setBaseSkillsEdit(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        className="w-full border rounded-md px-2 py-1 bg-transparent"
                      />
                    </div>
                  </div>
                )}
              </section>

              {/* 工作/实习经历（Work Experience） */}
              <section>
                <SectionBar title={lang === 'zh' ? STR.workExperience[0] : STR.workExperience[1]} width="w-full" textClass="text-[13px]" uppercase={lang !== 'zh'} accent={selectedColor} />
                {(() => {
                  const nonVolunteer = selectedWorkSorted.filter((w) => !isVolunteerFinal(w));
                  const volunteerSelected = selectedWorkSorted.filter((w) => isVolunteerFinal(w));
                  // 主列表（匹配的工作经历 / primary）
                  const primaryList = nonVolunteer.filter((w) => {
                    const same = (x: WorkItem) => (
                      (x.role || '') === (w.role || '') &&
                      (x.company || '') === (w.company || '') &&
                      (x.period || '') === (w.period || '')
                    );
                    return (combinedExperience.primary || []).some(same);
                  });
                  // 补充工作经历（additional）
                  const additionalNonVolunteer = nonVolunteer.filter((w) => {
                    const same = (x: WorkItem) => (
                      (x.role || '') === (w.role || '') &&
                      (x.company || '') === (w.company || '') &&
                      (x.period || '') === (w.period || '')
                    );
                    const isPrimary = (combinedExperience.primary || []).some(same);
                    const isAdditional = !isPrimary && (combinedExperience.additional || []).some(same);
                    return isAdditional;
                  });
                  const additionalList = mergeVolunteerIntoAdditional ? [...additionalNonVolunteer, ...volunteerSelected] : additionalNonVolunteer;
                  if (primaryList.length === 0 && additionalList.length === 0) {
                    return (
                      <p className="text-sm text-black/70 dark:text-white/70">{lang === 'zh' ? '暂无已选经历（在编辑区勾选“加入简历”）' : 'No selected experience (check "Include in resume" in Edit panel)'}</p>
                    );
                  }
                  return (
                    <>
                      {/* 主列表：Work Experience */}
                      {primaryList.length > 0 && (
                        <ul className="px-[72px] py-3 space-y-6">
                          {primaryList.map((w, i) => {
                      const jdTextUsed = (jdInput || '').trim();
                      const targetLang = detectLangFromTextClient((resumeInput || '').trim());
                      const jdKW: string[] = [];
                      // 使用组合后的条目（primary/additional）以承载 JD 匹配的合并 bullets
                      const fromCombined = (() => {
                        const same = (x: WorkItem) => (
                          (x.role || '') === (w.role || '') &&
                          (x.company || '') === (w.company || '') &&
                          (x.period || '') === (w.period || '')
                        );
                        return (combinedExperience.primary || []).find(same) || (combinedExperience.additional || []).find(same) || w;
                      })();
                      const filtered = (fromCombined.bullets || []);
                      const bullets = filtered.slice(0, 6);
                      const hasMore = (filtered || []).length > bullets.length;
                      return (
                        <li key={`pw-${i}`} className="leading-[1.6]">
                          {editInPreview ? (
                            (() => {
                              const idx = editedWork.findIndex((y) => y === w);
                              const eid = idx >= 0 ? idx : editedWork.findIndex((y) => (
                                y === w || (y.id && w.id && y.id === w.id) || (
                                  (y.role || '') === (w.role || '') &&
                                  (y.company || '') === (w.company || '') &&
                                  (y.period || '') === (w.period || '')
                                )
                              ));
                              return (
                                <div className="border rounded-lg p-3 text-[13px]">
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 pr-2">
                                      <input value={(w.role === '补充经验（基于简历）' || w.role === 'Additional Experience (from Resume)') ? (lang === 'zh' ? '补充经验（基于简历）' : 'Additional Experience (from Resume)') : (w.role || '')} onChange={(e) => { const arr = [...editedWork]; if (eid >= 0) arr[eid] = { ...(arr[eid] || {}), role: e.target.value }; setEditedWork(arr); }} placeholder={lang === 'zh' ? '岗位/职位' : 'Role'} className="border rounded-md px-2 py-1 bg-transparent" />
                                      <input value={w.company || ''} onChange={(e) => { const arr = [...editedWork]; if (eid >= 0) arr[eid] = { ...(arr[eid] || {}), company: e.target.value }; setEditedWork(arr); }} placeholder={lang === 'zh' ? '公司' : 'Company'} className="border rounded-md px-2 py-1 bg-transparent" />
                                      <input value={w.period || ''} onChange={(e) => { const arr = [...editedWork]; if (eid >= 0) arr[eid] = { ...(arr[eid] || {}), period: e.target.value }; setEditedWork(arr); }} placeholder={lang === 'zh' ? '起止时间' : 'Period'} className="border rounded-md px-2 py-1 bg-transparent" />
                                    </div>
                                    <div className="text-xs flex items-center gap-3">
                                      <label className="flex items-center gap-1">
                                        <input type="checkbox" checked={eid >= 0 ? !!selectedWork[eid] : false} onChange={() => eid >= 0 && toggleWork(eid)} />
                                        {lang === 'zh' ? '加入简历' : 'Include in resume'}
                                      </label>
                                    </div>
                                  </div>

                                  <div className="mt-2">
                                    <label className="block text-xs mb-1">{lang === 'zh' ? '职责要点（每行一条）' : 'Bullets (one per line)'}</label>
                                    <textarea
                                      value={(w.bullets || []).join('\n')}
                                      onChange={(e) => { const arr = [...editedWork]; if (eid >= 0) arr[eid] = { ...(arr[eid] || {}), bullets: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) }; setEditedWork(arr); setManualBullets((prev) => { const next = editedWork.map((_, j) => prev[j] ?? false); if (eid >= 0) next[eid] = true; return next; }); }}
                                      rows={6}
                                      className="w-full border rounded-md px-2 py-1 bg-transparent"
                                    />
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                            <div className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                              {(() => {
                                const badgeClass = 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-100 dark:border-green-400';
                                const badgeText = (lang === 'zh' ? '匹配工作经历' : 'Matched Work');
                                return (
                                  <div className="flex items-start justify-between">
                                    <p className="font-semibold">{[w.role || null, w.company || null].filter(Boolean).join(' | ')}</p>
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${badgeClass}`}>{badgeText}</span>
                                      {w.period && <p className="text-[13px] text-black/70">{w.period}</p>}
                                    </div>
                                  </div>
                                );
                              })()}
                              {(() => {
                                const summaryLine = (w.summaryText || '').trim();
                                // 如果没有 bullets，则基于角色与 JD 生成兜底要点
                                const needFallback = bullets.length === 0;
                                const fallbackCats = needFallback ? Array.from(new Set(extractCategoriesFromTextClient(`${w.role || ''} ${(jdInput || '').trim()}`))) : [];
                                const fallbackFromCats = needFallback ? fallbackCats.flatMap((c) => suggestBulletsForCategory(c, lang)).filter(Boolean).slice(0, 2) : [];
                                const fallbackFromReqs = (needFallback && fallbackFromCats.length === 0) ? jdRequirementsFromTextClient((jdInput || '').trim()).flatMap((r) => suggestBulletsFromRequirement(r, lang)).filter(Boolean).slice(0, 2) : [];
                                const displayBullets = bullets.length > 0 ? bullets : (fallbackFromCats.length > 0 ? fallbackFromCats : fallbackFromReqs);
                                const showHasMore = bullets.length > 0 ? hasMore : false;
                                return (
                                  <>
                                    {/* Summary hidden per request */}
                                    {displayBullets.length === 0 ? null : (
                                      <>
                                        <p className="font-semibold text-[14px] mt-2">{displayBullets[0]}</p>
                                        <ul className="list-disc pl-6 text-[14px] mt-1 space-y-[6px] leading-[1.6]">
                                          {displayBullets.slice(1).map((b, j) => (<li key={`pb-${i}-${j}`}>{b}</li>))}
                                          {showHasMore && (<li className="list-none text-black/60">…</li>)}
                                        </ul>
                                      </>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                          </li>
                      );
                          })}
                        </ul>
                      )}

                      {/* 次列表：Additional Work Experience */}
                      {additionalList.length > 0 && (
                        <>
                          <SectionBar title={lang === 'zh' ? '补充经验' : 'Additional Work Experience'} width="w-full" textClass="text-[13px]" uppercase={lang !== 'zh'} accent={selectedColor}>
                            <label className="flex items-center gap-2 text-xs sm:text-sm text-black/70 dark:text-white/70">
                              <input type="checkbox" checked={separateVolunteerPreview} onChange={() => setSeparateVolunteerPreview(v => !v)} />
                              <span>{lang === 'zh' ? '单独显示志愿者经历' : 'Separate volunteer experience'}</span>
                            </label>
                          </SectionBar>
                          <ul className="px-[72px] py-3 space-y-6">
                            {additionalList.map((w, i) => {
                              const jdTextUsed = (jdInput || '').trim();
                              const targetLang = detectLangFromTextClient((resumeInput || '').trim());
                              const jdKW: string[] = [];
                              const fromCombined = (() => {
                                const same = (x: WorkItem) => (
                                  (x.role || '') === (w.role || '') &&
                                  (x.company || '') === (w.company || '') &&
                                  (x.period || '') === (w.period || '')
                                );
                                return (combinedExperience.primary || []).find(same) || (combinedExperience.additional || []).find(same) || w;
                              })();
                              const filtered = (fromCombined.bullets || []);
                              const bullets = filtered.slice(0, 6);
                              const hasMore = (filtered || []).length > bullets.length;
                              return (
                                <li key={`aw-${i}`} className="leading-[1.6]">
                                  {editInPreview ? (
                                    (() => {
                                      const idx = editedWork.findIndex((y) => y === w);
                                      const eid = idx >= 0 ? idx : editedWork.findIndex((y) => (
                                        y === w || (y.id && w.id && y.id === w.id) || (
                                          (y.role || '') === (w.role || '') &&
                                          (y.company || '') === (w.company || '') &&
                                          (y.period || '') === (w.period || '')
                                        )
                                      ));
                                      return (
                                        <div className="border rounded-lg p-3 text-[13px]">
                                          <div className="flex items-center justify-between">
                                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 pr-2">
                                              <input value={(w.role === '补充经验（基于简历）' || w.role === 'Additional Experience (from Resume)') ? (lang === 'zh' ? '补充经验（基于简历）' : 'Additional Experience (from Resume)') : (w.role || '')} onChange={(e) => { const arr = [...editedWork]; if (eid >= 0) arr[eid] = { ...(arr[eid] || {}), role: e.target.value }; setEditedWork(arr); }} placeholder={lang === 'zh' ? '岗位/职位' : 'Role'} className="border rounded-md px-2 py-1 bg-transparent" />
                                              <input value={w.company || ''} onChange={(e) => { const arr = [...editedWork]; if (eid >= 0) arr[eid] = { ...(arr[eid] || {}), company: e.target.value }; setEditedWork(arr); }} placeholder={lang === 'zh' ? '公司' : 'Company'} className="border rounded-md px-2 py-1 bg-transparent" />
                                              <input value={w.period || ''} onChange={(e) => { const arr = [...editedWork]; if (eid >= 0) arr[eid] = { ...(arr[eid] || {}), period: e.target.value }; setEditedWork(arr); }} placeholder={lang === 'zh' ? '起止时间' : 'Period'} className="border rounded-md px-2 py-1 bg-transparent" />
                                            </div>
                                            <div className="text-xs flex items-center gap-3">
                                              {mergeVolunteerIntoAdditional && isVolunteerFinal(w) ? (
                                                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-100 dark:border-violet-400">
                                                  {lang === 'zh' ? '志愿者经验' : 'Volunteer'}
                                                </span>
                                              ) : null}
                                              <label className="flex items-center gap-1">
                                                <input type="checkbox" checked={eid >= 0 ? !!selectedWork[eid] : false} onChange={() => eid >= 0 && toggleWork(eid)} />
                                                {lang === 'zh' ? '加入简历' : 'Include in resume'}
                                              </label>
                                            </div>
                                          </div>

                                          <div className="mt-2">
                                            <label className="block text-xs mb-1">{lang === 'zh' ? '职责要点（每行一条）' : 'Bullets (one per line)'}</label>
                                            <textarea
                                              value={(w.bullets || []).join('\n')}
                                              onChange={(e) => { const arr = [...editedWork]; if (eid >= 0) arr[eid] = { ...(arr[eid] || {}), bullets: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) }; setEditedWork(arr); setManualBullets((prev) => { const next = editedWork.map((_, j) => prev[j] ?? false); if (eid >= 0) next[eid] = true; return next; }); }}
                                              rows={6}
                                              className="w-full border rounded-md px-2 py-1 bg-transparent"
                                            />
                                          </div>
                                        </div>
                                      );
                                    })()
                                  ) : (
                                    <div className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                                      {(() => {
                                        const badgeClass = 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-100 dark:border-blue-400';
                                        const badgeText = (lang === 'zh' ? '补充经验' : 'Additional Experience');
                                        return (
                                          <div className="flex items-start justify-between">
                                            <p className="font-semibold">{[w.role || null, w.company || null].filter(Boolean).join(' | ')}</p>
                                            <div className="flex items-center gap-2">
                                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${badgeClass}`}>{badgeText}</span>
                                              {mergeVolunteerIntoAdditional && isVolunteerFinal(w) ? (
                                                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-100 dark:border-violet-400">
                                                  {lang === 'zh' ? '志愿者经验' : 'Volunteer'}
                                                </span>
                                              ) : null}
                                              {w.period && <p className="text-[13px] text-black/70">{w.period}</p>}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                      {(() => {
                                        const summaryLine = (w.summaryText || '').trim();
                                        const needFallback = bullets.length === 0;
                                        const fallbackCats = needFallback ? Array.from(new Set(extractCategoriesFromTextClient(`${w.role || ''} ${(jdInput || '').trim()}`))) : [];
                                        const fallbackFromCats = needFallback ? fallbackCats.flatMap((c) => suggestBulletsForCategory(c, lang)).filter(Boolean).slice(0, 2) : [];
                                        const fallbackFromReqs = (needFallback && fallbackFromCats.length === 0) ? jdRequirementsFromTextClient((jdInput || '').trim()).flatMap((r) => suggestBulletsFromRequirement(r, lang)).filter(Boolean).slice(0, 2) : [];
                                        const displayBullets = bullets.length > 0 ? bullets : (fallbackFromCats.length > 0 ? fallbackFromCats : fallbackFromReqs);
                                        const showHasMore = bullets.length > 0 ? hasMore : false;
                                        return (
                                          <>
                                            {/* Summary hidden per request */}
                                            {displayBullets.length === 0 ? null : (
                                              <>
                                                <p className="font-semibold text-[14px] mt-2">{displayBullets[0]}</p>
                                                <ul className="list-disc pl-6 text-[14px] mt-1 space-y-[6px] leading-[1.6]">
                                                  {displayBullets.slice(1).map((b, j) => (<li key={`ab-${i}-${j}`}>{b}</li>))}
                                                  {showHasMore && (<li className="list-none text-black/60">…</li>)}
                                                </ul>
                                              </>
                                            )}
                                          </>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}
                    </>
                  );
                })()}
              </section>

              

              {/* Volunteer Experience Section (separate column; hidden when merged into additional) */}
              {(separateVolunteerPreview && !mergeVolunteerIntoAdditional) && (
                <section className="space-y-2">
                  <SectionBar title={lang === 'zh' ? '志愿者经历' : 'Volunteer Experience'} width="w-full" textClass="text-[13px]" uppercase={lang !== 'zh'} accent={selectedColor}>
                    <label className="flex items-center gap-2 text-xs sm:text-sm text-black/70 dark:text-white/70">
                      <input type="checkbox" checked={mergeVolunteerIntoAdditional} onChange={() => setMergeVolunteerIntoAdditional(v => !v)} />
                      <span>{lang === 'zh' ? '志愿者并入补充经验' : 'Merge volunteer into Additional'}</span>
                    </label>
                  </SectionBar>
                  {(() => {
                    const vPrimary = (combinedExperience.primary || []).filter((w) => isVolunteerFinal(w));
                    const vAdditional = additionalVolunteer || [];
                    const items = [...vPrimary, ...vAdditional];
                    if (items.length === 0) {
                      return (
                        <p className="text-sm text-black/70 dark:text-white/70">{lang === 'zh' ? '暂无志愿者经历' : 'No volunteer experience yet'}</p>
                      );
                    }
                    const renderItem = (w: WorkItem, i: number) => {
                      const eid = editedWork.findIndex((y) => (
                        (y.role || '') === (w.role || '') &&
                        (y.company || '') === (w.company || '') &&
                        (y.period || '') === (w.period || '')
                      ));
                      const checked = eid >= 0 ? Boolean(selectedWork[eid]) : false;
                      const bullets = (w.bullets || []);
                      if (editInPreview) {
                        return (
                          <li key={`vol-edit-${i}`} className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                            <div className="mb-2 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 text-xs text-black/80 dark:text-white/80">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => eid >= 0 && toggleWork(eid)}
                                    className="rounded border border-black/20 dark:border-white/25"
                                  />
                                  <span>{lang === 'zh' ? '加入简历' : 'Include in resume'}</span>
                                </label>
                              </div>
                              <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-100 dark:border-violet-400">
                                {lang === 'zh' ? '志愿者经验' : 'Volunteer'}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs mb-1">{lang === 'zh' ? '职位' : 'Job Title'}</label>
                                <input
                                  value={w.role || ''}
                                  onChange={(e) => { const arr = [...editedWork]; if (eid >= 0) arr[eid] = { ...(arr[eid] || {}), role: e.target.value }; setEditedWork(arr); }}
                                  className="w-full border rounded-md px-2 py-1 bg-transparent"
                                />
                              </div>
                              <div>
                                <label className="block text-xs mb-1">{lang === 'zh' ? '机构' : 'Organization'}</label>
                                <input
                                  value={w.company || ''}
                                  onChange={(e) => { const arr = [...editedWork]; if (eid >= 0) arr[eid] = { ...(arr[eid] || {}), company: e.target.value }; setEditedWork(arr); }}
                                  className="w-full border rounded-md px-2 py-1 bg-transparent"
                                />
                              </div>
                              <div>
                                <label className="block text-xs mb-1">{lang === 'zh' ? '时间段' : 'Period'}</label>
                                <input
                                  value={w.period || ''}
                                  onChange={(e) => { const arr = [...editedWork]; if (eid >= 0) arr[eid] = { ...(arr[eid] || {}), period: e.target.value }; setEditedWork(arr); }}
                                  className="w-full border rounded-md px-2 py-1 bg-transparent"
                                />
                              </div>
                            </div>
                            <div className="mt-2">
                              <label className="block text-xs mb-1">{lang === 'zh' ? '职责要点（每行一条）' : 'Bullets (one per line)'}</label>
                              <textarea
                                value={bullets.join('\n')}
                                onChange={(e) => { const arr = [...editedWork]; if (eid >= 0) arr[eid] = { ...(arr[eid] || {}), bullets: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) }; setEditedWork(arr); setManualBullets((prev) => { const next = editedWork.map((_, j) => prev[j] ?? false); if (eid >= 0) next[eid] = true; return next; }); }}
                                rows={6}
                                className="w-full border rounded-md px-2 py-1 bg-transparent"
                              />
                            </div>
                          </li>
                        );
                      }
                      const badgeClass = 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-100 dark:border-violet-400';
                      const badgeText = (lang === 'zh' ? '志愿者经验' : 'Volunteer');
                      const needFallback = bullets.length === 0;
                      const fallbackCats = needFallback ? Array.from(new Set(extractCategoriesFromTextClient(`${w.role || ''} ${(jdInput || '').trim()}`))) : [];
                      const fallbackFromCats = needFallback ? fallbackCats.flatMap((c) => suggestBulletsForCategory(c, lang)).filter(Boolean).slice(0, 2) : [];
                      const fallbackFromReqs = (needFallback && fallbackFromCats.length === 0) ? jdRequirementsFromTextClient((jdInput || '').trim()).flatMap((r) => suggestBulletsFromRequirement(r, lang)).filter(Boolean).slice(0, 2) : [];
                      const displayBullets = bullets.length > 0 ? bullets : (fallbackFromCats.length > 0 ? fallbackFromCats : fallbackFromReqs);
                      return (
                        <li key={`vol-view-${i}`} className="rounded-lg p-3 border border-black/10 dark:border-white/15 bg-white/90 dark:bg-black/30 transition">
                          <div className="flex items-start justify-between">
                            <p className="font-semibold">{[w.role || null, w.company || null].filter(Boolean).join(' | ')}</p>
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${badgeClass}`}>{badgeText}</span>
                              {w.period && <p className="text-[13px] text-black/70">{w.period}</p>}
                            </div>
                          </div>
                          {displayBullets.length === 0 ? null : (
                            <ul className="list-disc pl-6 text-[14px] mt-1 space-y-[6px] leading-[1.6]">
                              {displayBullets.map((b, j) => (<li key={`vb-${i}-${j}`}>{b}</li>))}
                            </ul>
                          )}
                        </li>
                      );
                    };
                    return (
                      <ul className="px-[72px] py-3 space-y-6">
                        {items.map((w, i) => renderItem(w, i))}
                      </ul>
                    );
                  })()}
                </section>
              )}

              {/* References Section */}
              <section className="space-y-2">
                <SectionBar title={lang === 'zh' ? '推荐人' : 'References'} width="w-full" textClass="text-[13px]" uppercase={lang !== 'zh'} accent={selectedColor} />
                {editInPreview ? (
                  <div className="px-[72px]">
                    <div className="p-4 border rounded-lg text-[13px]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          value={referenceName}
                          onChange={(ev) => setReferenceName(ev.target.value)}
                          placeholder={lang === 'zh' ? '名字' : 'Name'}
                          className="border rounded-md px-3 py-2 bg-transparent"
                        />
                        <input
                          value={referencePhone}
                          onChange={(ev) => setReferencePhone(ev.target.value)}
                          placeholder={lang === 'zh' ? '电话' : 'Phone'}
                          className="border rounded-md px-3 py-2 bg-transparent"
                        />
                        {/* Email under the right column to sit with Phone */}
                        <input
                          value={referenceEmail}
                          onChange={(ev) => setReferenceEmail(ev.target.value)}
                          placeholder={lang === 'zh' ? '邮箱' : 'Email'}
                          className="border rounded-md px-3 py-2 bg-transparent sm:col-start-2"
                        />
                        <input
                          value={referenceCompany}
                          onChange={(ev) => setReferenceCompany(ev.target.value)}
                          placeholder={lang === 'zh' ? '公司' : 'Company'}
                          className="border rounded-md px-3 py-2 bg-transparent"
                        />
                        <input
                          value={referenceRelationship}
                          onChange={(ev) => setReferenceRelationship(ev.target.value)}
                          placeholder={lang === 'zh' ? '关系' : 'Relationship'}
                          className="border rounded-md px-3 py-2 bg-transparent"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  (() => {
                    const hasAny = [referenceName, referencePhone, referenceEmail, referenceCompany, referenceRelationship].some((x) => (x || '').trim().length > 0);
                    return hasAny ? (
                      <div className="px-[72px]">
                        <div className="py-3 text-[14px]">
                          <p className="font-semibold">{referenceName || (lang === 'zh' ? '未填写名字' : 'Name not set')}</p>
                          <ul className="mt-1 space-y-[4px]">
                            {referencePhone && (<li>{(lang === 'zh' ? '电话：' : 'Phone: ') + referencePhone}</li>)}
                            {referenceEmail && (<li>{(lang === 'zh' ? '邮箱：' : 'Email: ') + referenceEmail}</li>)}
                            {referenceCompany && (<li>{(lang === 'zh' ? '公司：' : 'Company: ') + referenceCompany}</li>)}
                            {referenceRelationship && (<li>{(lang === 'zh' ? '关系：' : 'Relationship: ') + referenceRelationship}</li>)}
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-black/70 dark:text-white/70">{lang === 'zh' ? '暂无推荐人信息' : 'No reference information yet'}</p>
                    );
                  })()
                )}
              </section>

              
            </div>
            {showDocxOptions && (
            <div className="mt-6 p-4 border rounded-lg bg-white/80 dark:bg-black/40">
              <p className="text-sm font-medium mb-3">{lang === 'zh' ? '下载页数' : 'Download Pages'}</p>
              <div className="grid grid-cols-1 gap-3 text-[13px]">
                <div>
                  <label className="block text-xs mb-1">{lang === 'zh' ? '页数' : 'Pages'}</label>
                  <select className="w-full border rounded-md px-2 py-1 bg-transparent" value={pageCount} onChange={(e) => setPageCount(Number(e.target.value))}>
                    {[1,2,3].map((n) => (<option key={`pg-${n}`} value={n}>{n}</option>))}
                  </select>
                  {/* 页数说明：根据当前选择的经历与推荐人信息，动态展示每页容量与提醒 */}
                  {(() => {
                    const hasRef = [referenceName, referencePhone, referenceEmail, referenceCompany, referenceRelationship].some((x) => (x || '').trim().length > 0);
                    const total = selectedWorkSorted.length;
                    const nonVol = selectedWorkSorted.filter((w) => !isVolunteerFinal(w)).length;
                    const firstCap = Math.min(6, nonVol);
                    const afterFirst = Math.max(0, total - firstCap);
                    const secondTarget = hasRef ? 7 : 8;
                    const secondCap = Math.min(secondTarget, afterFirst);
                    const totalCap12 = firstCap + secondCap;
                    const thirdCap = Math.max(0, total - totalCap12);
                    const zhLines = [
                      `1页：最多 6 条（不含志愿者），当前可容纳 ${firstCap} 条`,
                      `2页：第2页最多 ${secondTarget} 条（含志愿者），当前合计可容纳 ${totalCap12} 条`,
                      `3页：剩余全部，当前第3页预计 ${thirdCap} 条`,
                    ];
                    const enLines = [
                      `1 page: up to 6 (non-volunteer), currently ${firstCap}`,
                      `2 pages: page 2 up to ${secondTarget} (includes volunteers), total ${totalCap12}`,
                      `3 pages: the rest, page 3 ~ ${thirdCap}`,
                    ];
                    const warnTooFew = (pageCount === 1 && total > firstCap)
                      || (pageCount === 2 && total > totalCap12);
                    const warnTooMany = (pageCount === 2 && total <= firstCap)
                      || (pageCount === 3 && total <= totalCap12);
                    const warnTextZh = warnTooFew
                      ? `提示：当前选择 ${pageCount} 页最多导出 ${pageCount === 1 ? firstCap : totalCap12} 条，还有 ${total - (pageCount === 1 ? firstCap : totalCap12)} 条不会导出。`
                      : (warnTooMany ? `提示：当前内容不足以填满 ${pageCount} 页，最后一页可能留白。` : '');
                    const warnTextEn = warnTooFew
                      ? `Note: ${pageCount} page(s) can export at most ${pageCount === 1 ? firstCap : totalCap12}; ${total - (pageCount === 1 ? firstCap : totalCap12)} item(s) will be omitted.`
                      : (warnTooMany ? `Note: content may not fill ${pageCount} page(s); last page may have blank space.` : '');
                    return (
                      <div className="mt-2 space-y-1 text-[12px] text-black/70 dark:text-white/70">
                        <p>{lang === 'zh' ? zhLines[0] : enLines[0]}</p>
                        <p>{lang === 'zh' ? zhLines[1] : enLines[1]}</p>
                        <p>{lang === 'zh' ? zhLines[2] : enLines[2]}</p>
                        {((warnTooFew || warnTooMany) && (
                          <p className="text-[12px] text-amber-700 dark:text-amber-300">{lang === 'zh' ? warnTextZh : warnTextEn}</p>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={downloadDocx} className={`${accentSolidLgClass(selectedColor)}`}>{lang === 'zh' ? '确认生成 Word' : 'Generate Word'}</button>
                <button onClick={() => setShowDocxOptions(false)} className="rounded-md px-3 py-1.5 text-sm bg-black/80 text-white">{lang === 'zh' ? '关闭' : 'Close'}</button>
              </div>
            </div>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={downloadTxt} className={`${accentSolidLgClass(selectedColor)}`}>{lang === "zh" ? "下载 TXT" : "Download TXT"}</button>
              <button onClick={() => setShowDocxOptions(true)} className={`${accentSolidLgClass(selectedColor)}`}>{lang === "zh" ? "下载 Word" : "Download Word"}</button>
              <button onClick={downloadDocxATS} className={`${accentSolidLgClass(selectedColor)}`}>{lang === "zh" ? "下载 ATS Word" : "Download ATS Word"}</button>
              {/* PDF 导出按钮已移除，保留 TXT/Word/ATS Word 下载 */}
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}
  // 识别“模板化/泛化”的句式，避免用于生成职责
  function isGenericBulletClient(text: string): boolean {
    const t = (text || '').toLowerCase();
    const patterns = [
      /include\s+but\s+not\s+limited/,
      /seeking\s+customer/,
      /customer\s+officer\s+join/,
      /apply\s+responsibilities\s+include/,
      /review\s+weekly\s+to\s+improve\s+key\s+metrics/,
      /adapt\s+content\s+by\s+channel/,
      /collaborate\s+with\s+teams\s+to\s+apply/,
    ];
    return patterns.some((re) => re.test(t));
  }
